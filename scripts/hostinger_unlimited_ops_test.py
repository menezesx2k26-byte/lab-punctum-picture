import datetime
import json
import unittest

from scripts.hostinger_unlimited_ops import (
    BUILD_SETTINGS,
    build_redeploy_env,
    compute_temp_daily_schedule,
    cron_command,
    extract_cron_receipt,
    parse_bootstrap_receipt,
    verify_cron_230_and_restore,
)


class HostingerUnlimitedOpsTest(unittest.TestCase):
    def test_build_redeploy_env_preserves_keys_updates_sha_and_strips_import_secrets(self):
        existing = [
            {"key": "NODE_ENV", "value": "production"},
            {"key": "CLERK_SECRET_KEY", "value": "sk_live_kept"},
            {"key": "PUNCTUM_MANAGED_IMPORT_KEY", "value": "secret_key"},
            {"key": "PUNCTUM_MANAGED_IMPORT_SHA256", "value": "secret_sha"},
            {"key": "PUNCTUM_QA_SOURCE_SHA", "value": "0" * 40},
        ]
        updated = build_redeploy_env(existing, "a" * 40)
        self.assertEqual(updated["NODE_ENV"], "production")
        self.assertEqual(updated["CLERK_SECRET_KEY"], "sk_live_kept")
        self.assertEqual(updated["PUNCTUM_QA_SOURCE_SHA"], "a" * 40)
        self.assertNotIn("PUNCTUM_MANAGED_IMPORT_KEY", updated)
        self.assertNotIn("PUNCTUM_MANAGED_IMPORT_SHA256", updated)

    def test_compute_temp_daily_schedule_wraps_cleanly(self):
        dt = datetime.datetime(2026, 11, 23, 23, 58, 30, tzinfo=datetime.timezone.utc)
        expr, target = compute_temp_daily_schedule(dt, lead_seconds=125)
        self.assertEqual(expr, "0 0 * * *")
        self.assertEqual((target.hour, target.minute), (0, 0))

    def test_parse_bootstrap_receipt_and_extract_cron_receipt(self):
        logs = {
            "logs": "\n".join(
                [
                    "Starting...",
                    json.dumps(
                        {
                            "status": "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED",
                            "createdDatabase": False,
                            "dbFileExists": True,
                            "hasLayoutPresetColumn": True,
                            "adminClerkLinked": True,
                            "integrity": "ok",
                            "sourceSha": "b" * 40,
                        }
                    ),
                ]
            )
        }
        receipt = parse_bootstrap_receipt(logs)
        self.assertFalse(receipt["createdDatabase"])
        self.assertEqual(receipt["integrity"], "ok")

        cron_out = {
            "output": json.dumps(
                {
                    "status": "CANDIDATE_SCHEDULED_JOB_PASS",
                    "cronMode": "daily",
                    "physicalBackup": {
                        "status": "MANAGED_DAILY_PHYSICAL_BACKUP_VERIFIED",
                        "objects": 230,
                        "bytes": 372040548,
                    },
                }
            )
        }
        daily_receipt = extract_cron_receipt(cron_out, "daily")
        self.assertIsNotNone(daily_receipt)
        self.assertEqual(daily_receipt["physicalBackup"]["objects"], 230)
        self.assertIsNone(extract_cron_receipt(cron_out, "hourly"))

    def test_verify_cron_230_and_restore_restores_offpeak_daily_schedule(self):
        daily_cmd = cron_command("daily")
        hourly_cmd = cron_command("hourly")
        calls = []
        jobs = [
            {"uid": "MSmOtyT0eS", "time": "51 * * * *", "command": hourly_cmd},
            {"uid": "JxZvsJhPbj", "time": "52 6 * * *", "command": daily_cmd},
        ]

        class FakeClient:
            def api(self, method, path, payload=None):
                calls.append((method, path, payload))
                if method == "GET" and path.endswith("/cron-jobs"):
                    return list(jobs)
                if method == "GET" and path.endswith("/MSmOtyT0eS/output"):
                    return {"output": json.dumps({"status": "CANDIDATE_SCHEDULED_JOB_PASS", "cronMode": "hourly"})}
                if method == "DELETE" and "/cron-jobs/" in path:
                    uid = path.rsplit("/", 1)[-1]
                    jobs[:] = [j for j in jobs if j["uid"] != uid]
                    return {}
                if method == "POST" and path.endswith("/cron-jobs"):
                    uid = f"tmp_{len(calls)}"
                    jobs.append({"uid": uid, "time": payload["time"], "command": payload["command"]})
                    return {"uid": uid, "time": payload["time"], "command": payload["command"]}
                if method == "GET" and path.endswith("/output"):
                    return {
                        "output": json.dumps(
                            {
                                "status": "CANDIDATE_SCHEDULED_JOB_PASS",
                                "cronMode": "daily",
                                "physicalBackup": {
                                    "status": "MANAGED_DAILY_PHYSICAL_BACKUP_VERIFIED",
                                    "objects": 230,
                                    "bytes": 372040548,
                                    "restoreMs": 140,
                                    "retainedDailyArchives": 2,
                                },
                            }
                        )
                    }
                raise AssertionError(f"Unexpected call: {method} {path}")

        report = verify_cron_230_and_restore(
            FakeClient(),
            deadline_seconds=30,
            poll_interval=0.0,
        )
        self.assertEqual(report["dailyVerification"]["physicalBackup"]["objects"], 230)
        self.assertEqual(len(jobs), 2)
        daily_after = next(j for j in jobs if j["command"] == daily_cmd)
        self.assertEqual(daily_after["time"], "0 6 * * *")
        self.assertEqual(BUILD_SETTINGS["build_script"], "build:hostinger:unlimited")
