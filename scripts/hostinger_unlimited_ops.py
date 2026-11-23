#!/usr/bin/env python3
"""Hostinger Unlimited operational tasks: clean deploy, 230-object daily cron verification, and rollback/runtime inspection."""
from __future__ import annotations

import argparse
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.parse

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPT_DIR.parent) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR.parent))

from scripts.hostinger_unlimited_d1_r2_sync import (  # noqa: E402
    BUILD_SETTINGS,
    DOMAIN,
    SITE,
    USERNAME,
    HostingerUnlimitedClient,
    _iter_strings,
)

CRON_BASE = f"/accounts/{USERNAME}/cron-jobs"
DEPLOYMENT_BASE = f"/home/{USERNAME}/domains/{DOMAIN}/hbuilds"
DAILY_OFFPEAK_UTC = "0 6 * * *"


def cron_command(mode: str) -> str:
    if mode not in ("hourly", "daily"):
        raise ValueError(f"Unsupported cron mode: {mode}")
    return (
        f"/opt/alt/alt-nodejs24/root/bin/node --env-file={DEPLOYMENT_BASE}/config/.env "
        f"{DEPLOYMENT_BASE}/current/nodejs/cron.mjs {mode}"
    )


def build_redeploy_env(existing_rows: list[dict], source_sha: str) -> dict[str, str]:
    env_map: dict[str, str] = {}
    for row in existing_rows:
        if not isinstance(row, dict):
            continue
        key = row.get("key")
        value = row.get("value")
        if isinstance(key, str) and isinstance(value, str):
            env_map[key] = value
    env_map.pop("PUNCTUM_MANAGED_IMPORT_KEY", None)
    env_map.pop("PUNCTUM_MANAGED_IMPORT_SHA256", None)
    env_map["PUNCTUM_QA_SOURCE_SHA"] = source_sha
    return env_map


def parse_bootstrap_receipt(logs_payload) -> dict:
    receipt = None
    for text in _iter_strings(logs_payload):
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.startswith("{"):
                continue
            try:
                parsed = json.loads(stripped)
            except ValueError:
                continue
            if isinstance(parsed, dict) and parsed.get("status") == "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED":
                receipt = parsed
    assert receipt is not None, "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED receipt missing"
    assert receipt.get("dbFileExists") is True, "SQLite DB missing after clean deploy"
    assert receipt.get("hasLayoutPresetColumn") is True, "layout_preset missing after clean deploy"
    assert receipt.get("adminClerkLinked") is True, "Clerk admin link missing after clean deploy"
    assert receipt.get("integrity") == "ok", "SQLite integrity not ok after clean deploy"
    return receipt


def extract_cron_receipt(output_payload, mode: str) -> dict | None:
    for text in _iter_strings(output_payload):
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.startswith("{"):
                continue
            try:
                parsed = json.loads(stripped)
            except ValueError:
                continue
            if (
                isinstance(parsed, dict)
                and parsed.get("status") == "CANDIDATE_SCHEDULED_JOB_PASS"
                and parsed.get("cronMode") == mode
            ):
                return parsed
    return None


def compute_temp_daily_schedule(
    now_utc: datetime.datetime | None = None, lead_seconds: int = 125
) -> tuple[str, datetime.datetime]:
    now = now_utc or datetime.datetime.now(datetime.timezone.utc)
    target = now + datetime.timedelta(seconds=lead_seconds)
    return f"{target.minute} {target.hour} * * *", target


def verify_cron_230_and_restore(
    client: HostingerUnlimitedClient,
    *,
    deadline_seconds: int = 300,
    poll_interval: float = 15.0,
) -> dict:
    daily_cmd = cron_command("daily")
    hourly_cmd = cron_command("hourly")
    before = client.api("GET", CRON_BASE)
    assert isinstance(before, list), "Expected list from cron-jobs"

    hourly_jobs = [row for row in before if row.get("command") == hourly_cmd]
    daily_jobs = [row for row in before if row.get("command") == daily_cmd]
    hourly_receipt = None
    if hourly_jobs:
        try:
            hourly_receipt = extract_cron_receipt(
                client.api("GET", f"{CRON_BASE}/{hourly_jobs[0]['uid']}/output"), "hourly"
            )
        except Exception:
            hourly_receipt = None

    for row in daily_jobs:
        uid = row.get("uid")
        if isinstance(uid, str) and uid:
            client.api("DELETE", f"{CRON_BASE}/{uid}")

    temp_schedule, target_utc = compute_temp_daily_schedule()
    temp_job = client.api("POST", CRON_BASE, {"time": temp_schedule, "command": daily_cmd})
    temp_uid = temp_job.get("uid") if isinstance(temp_job, dict) else None
    assert isinstance(temp_uid, str) and temp_uid, "Temporary daily cron creation failed"

    daily_receipt = None
    try:
        deadline = time.monotonic() + deadline_seconds
        while time.monotonic() < deadline:
            try:
                out = client.api("GET", f"{CRON_BASE}/{temp_uid}/output")
            except Exception:
                out = None
            receipt = extract_cron_receipt(out, "daily")
            if receipt:
                physical = receipt.get("physicalBackup")
                assert isinstance(physical, dict), "Missing physicalBackup in daily cron receipt"
                assert physical.get("status") == "MANAGED_DAILY_PHYSICAL_BACKUP_VERIFIED", physical
                assert int(physical.get("objects", 0)) >= 230, physical
                daily_receipt = receipt
                break
            time.sleep(poll_interval)
        assert daily_receipt is not None, f"Timed out waiting for temporary daily cron {temp_uid} ({temp_schedule} UTC)"
    finally:
        try:
            client.api("DELETE", f"{CRON_BASE}/{temp_uid}")
        finally:
            current_jobs = client.api("GET", CRON_BASE)
            remaining_daily = [
                row for row in current_jobs if isinstance(row, dict) and row.get("command") == daily_cmd
            ]
            for extra in remaining_daily:
                if extra.get("uid"):
                    client.api("DELETE", f"{CRON_BASE}/{extra['uid']}")
            restored = client.api("POST", CRON_BASE, {"time": DAILY_OFFPEAK_UTC, "command": daily_cmd})

    after = client.api("GET", CRON_BASE)
    final_jobs = [
        {"uid": row.get("uid"), "time": row.get("time"), "command": row.get("command")}
        for row in after
        if isinstance(row, dict) and row.get("command") in (hourly_cmd, daily_cmd)
    ]
    return {
        "hourlyReceipt": hourly_receipt,
        "tempTriggerScheduleUtc": temp_schedule,
        "tempTriggerTargetUtc": target_utc.isoformat(),
        "tempTriggerUid": temp_uid,
        "dailyVerification": daily_receipt,
        "restoredDailyUid": restored.get("uid") if isinstance(restored, dict) else None,
        "finalCronJobs": final_jobs,
    }


def check_live_endpoints(
    client: HostingerUnlimitedClient,
    *,
    base_url: str = f"https://{DOMAIN}",
    attempts: int = 36,
    delay_s: float = 5.0,
) -> dict:
    checks = [
        ("health", f"{base_url}/api/health", (200,)),
        ("logo_1254", f"{base_url}/_vinext/image?url=%2Flogo-punctum-transparent.png&w=1254&q=75", (200,)),
        ("p001_1024", f"{base_url}/_vinext/image?url=%2Fphotos%2Fp001.jpg&w=1024&q=75", (200,)),
        ("p001_360", f"{base_url}/_vinext/image?url=%2Fphotos%2Fp001.jpg&w=360&q=75", (200,)),
        ("p033_1440", f"{base_url}/_vinext/image?url=%2Fphotos%2Fp033.jpg&w=1440&q=75", (200,)),
        ("invalid_width_777", f"{base_url}/_vinext/image?url=%2Flogo-punctum-transparent.png&w=777&q=75", (400,)),
        ("private_route_blocked", f"{base_url}/_vinext/image?url=%2Fapi%2Fclient%2Fgalleries%2Fx&w=640&q=75", (400, 404)),
        ("private_image_ext_blocked", f"{base_url}/_vinext/image?url=%2Fapi%2Fclient%2Fgalleries%2Fx%2Fgallery.png&w=640&q=75", (404,)),
        ("sobre_redirect", f"{base_url}/sobre", (308,)),
    ]
    results = {}
    last_error = None
    for _ in range(attempts):
        results = {}
        ok = True
        for name, target_url, expected in checks:
            st, hdrs, _ = client.request(target_url, "GET")
            results[name] = {
                "status": st,
                "expected": list(expected),
                "location": hdrs.get("Location") if hdrs else None,
            }
            if st not in expected:
                ok = False
        if results["sobre_redirect"].get("location") not in (f"{base_url}/#sobre", "/#sobre"):
            ok = False
        if ok:
            st_albums, _, albums_raw = client.request(f"{base_url}/api/public/albums?limit=1", "GET")
            results["public_albums_api"] = {"status": st_albums}
            if st_albums == 200 and albums_raw:
                try:
                    parsed = json.loads(albums_raw)
                    albums = parsed.get("albums") or parsed.get("items") or []
                    if albums:
                        cover = albums[0].get("coverImageId") or (albums[0].get("cover") or {}).get("id")
                        if cover:
                            st_media, _, _ = client.request(f"{base_url}/media/{cover}/card", "GET")
                            results["sample_media_card"] = {"status": st_media}
                            assert st_media == 200, f"Sample media card returned {st_media}"
                except ValueError:
                    pass
            return results
        last_error = json.dumps(results)
        time.sleep(delay_s)
    raise RuntimeError(f"Live endpoint checks did not converge: {last_error}")


def collect_rollback_and_runtime_telemetry(client: HostingerUnlimitedClient) -> dict:
    builds = client.api("GET", f"{SITE}/builds")
    top_builds = []
    if isinstance(builds, list):
        for row in builds[:5]:
            if isinstance(row, dict):
                top_builds.append(
                    {
                        "uuid": row.get("uuid"),
                        "state": row.get("state"),
                        "created_at": row.get("created_at"),
                    }
                )
    deployments = None
    try:
        dep_raw = client.api("GET", f"{SITE}/deployments")
        if isinstance(dep_raw, list):
            deployments = [
                {
                    k: row.get(k)
                    for k in ("uuid", "id", "status", "state", "created_at")
                    if row.get(k) is not None
                }
                for row in dep_raw[:3]
                if isinstance(row, dict)
            ]
        elif isinstance(dep_raw, dict):
            deployments = {
                k: dep_raw.get(k)
                for k in ("uuid", "id", "status", "state", "created_at")
                if dep_raw.get(k) is not None
            }
    except Exception as err:
        deployments = {"note": str(err)}

    runtime_logs = client.api("GET", f"{SITE}/runtime-logs?period=1h&limit=100")
    raw_lines = []
    for text in _iter_strings(runtime_logs):
        raw_lines.extend(text.splitlines())
    status_codes = sorted(
        set(
            re.findall(
                r"\b(?:CANDIDATE_[A-Z0-9_]+|MANAGED_[A-Z0-9_]+|PUNCTUM_[A-Z0-9_]+|ERR_[A-Z0-9_]+|EACCES|ENOENT|ENOMEM|SIGKILL)\b",
                "\n".join(raw_lines),
            )
        )
    )
    return {
        "recentBuilds": top_builds,
        "deployments": deployments,
        "runtimeLogLines": len(raw_lines),
        "runtimeSignalCodes": status_codes,
    }


def main():
    parser = argparse.ArgumentParser(description="Hostinger Unlimited operational runner")
    parser.add_argument("--deploy", action="store_true", help="Deploy current git HEAD cleanly preserving SQLite storage")
    parser.add_argument("--verify-cron-230", action="store_true", help="Trigger daily cron on 230-object storage & restore 0 6 * * *")
    parser.add_argument("--check-live", action="store_true", help="Verify live production HTTP routes")
    parser.add_argument("--inspect", action="store_true", help="Collect builds/deployments/runtime-logs telemetry")
    args = parser.parse_args()

    token = os.environ.get("HOSTINGER_UNLIMITED_API", "").strip()
    client = HostingerUnlimitedClient(token)
    root = SCRIPT_DIR.parent
    source_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    report: dict[str, object] = {
        "sourceSha": source_sha,
        "storageRootPreserved": True,
        "dnsTouched": False,
    }

    if args.deploy:
        existing_env = client.api("GET", f"{SITE}/builds/settings/env")
        redeploy_env = build_redeploy_env(existing_env if isinstance(existing_env, list) else [], source_sha)
        client.replace_env(redeploy_env)
        archive_bytes = subprocess.check_output(["git", "archive", "--format=zip", "HEAD"], cwd=root)
        archive_name = client.upload_archive(archive_bytes, "punctum-unlimited-clean-")
        build_uuid, logs = client.trigger_and_wait_build(archive_name, f"Clean deploy {source_sha[:7]}")
        bootstrap = parse_bootstrap_receipt(logs)
        report["deploy"] = {
            "buildUuid": build_uuid,
            "bootstrap": bootstrap,
            "archiveBytes": len(archive_bytes),
        }

    if args.check_live:
        report["liveChecks"] = check_live_endpoints(client)

    if args.verify_cron_230:
        report["cronVerification"] = verify_cron_230_and_restore(client)

    if args.inspect or args.deploy or args.verify_cron_230:
        report["telemetry"] = collect_rollback_and_runtime_telemetry(client)

    out_dir = root / "outputs" / "unlimited-ops"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "summary.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
