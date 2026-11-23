#!/usr/bin/env python3
"""Sync sealed Cloudflare D1/R2 export into Hostinger Unlimited (u775492464)."""
from __future__ import annotations

import hashlib
import io
import json
import os
import pathlib
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

USERNAME = "u775492464"
DOMAIN = "punctumpicture.com"
API = "https://developers.hostinger.com/api/hosting/v1"
SITE = f"/accounts/{USERNAME}/websites/{DOMAIN}/nodejs"
STORAGE_ROOT = f"/home/{USERNAME}/punctum-managed-storage/punctum-unlimited-d1-r4"
ALLOWED_TUS_HOST_RE = re.compile(r"^srv[a-z0-9-]*-files\.hstgr\.io$")

BUILD_SETTINGS = {
    "app_type": "other",
    "node_version": 24,
    "package_manager": "npm",
    "root_directory": None,
    "output_directory": None,
    "build_script": "build:hostinger:unlimited",
    "entry_file": "services/punctum-hostinger-production/candidate-server.mjs",
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def validate_tus_upload_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not ALLOWED_TUS_HOST_RE.fullmatch(parsed.hostname)
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.port
    ):
        raise ValueError("Unexpected TUS upload destination")
    return url.rstrip("/")


def build_unlimited_sync_env(
    *,
    publishable_key: str,
    secret_key: str,
    jwt_key_pem_single_line: str,
    admin_email: str,
    clerk_admin_user_id: str,
    source_sha: str,
    import_key: str | None = None,
    import_sha256: str | None = None,
    admin_allowed_emails: str | None = None,
    admin_password_hash: str,
    admin_session_secret: str,
    client_session_secret: str,
) -> dict[str, str]:
    env_map = {
        "NODE_ENV": "production",
        "PUNCTUM_PRODUCTION_CANDIDATE_MODE": "private-candidate",
        "PUNCTUM_CANDIDATE_PROVIDER": "hostinger-managed",
        "PUNCTUM_CANDIDATE_ENVIRONMENT": "production",
        "PUNCTUM_CANDIDATE_PUBLIC_URL": f"https://{DOMAIN}",
        "PUNCTUM_CANDIDATE_TRUSTED_PROXY": "none",
        "PUNCTUM_CANDIDATE_DB_FILE": f"{STORAGE_ROOT}/application.sqlite",
        "PUNCTUM_CANDIDATE_ORIGINALS": f"{STORAGE_ROOT}/originals",
        "PUNCTUM_CANDIDATE_BACKUPS_ROOT": f"{STORAGE_ROOT}/backups",
        "PUNCTUM_CANDIDATE_AUTO_BOOTSTRAP": "true",
        "PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED": "true",
        "PRIVATE_GALLERIES_ENABLED": "true",
        "ADMIN_AUTH_MODE": "hybrid",
        "CLIENT_AUTH_MODE": "clerk",
        "CLERK_AUTH_ENABLED": "true",
        "CLERK_PILOT_ENABLED": "false",
        "CLERK_ISSUER": f"https://clerk.{DOMAIN}",
        "CLERK_AUTHORIZED_PARTIES": f"https://{DOMAIN}",
        "CLERK_PUBLISHABLE_KEY": publishable_key,
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": publishable_key,
        "CLERK_SECRET_KEY": secret_key,
        "CLERK_JWT_KEY": jwt_key_pem_single_line,
        "PUNCTUM_CANDIDATE_ADMIN_EMAIL": admin_email,
        "PUNCTUM_CANDIDATE_CLERK_ADMIN_USER_ID": clerk_admin_user_id,
        "PUNCTUM_CANDIDATE_ADMIN_PASSWORD_HASH": admin_password_hash,
        "PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET": admin_session_secret,
        "PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET": client_session_secret,
        "PUNCTUM_QA_SOURCE_SHA": source_sha,
    }
    if admin_allowed_emails and admin_allowed_emails.strip():
        env_map["PUNCTUM_CANDIDATE_ADMIN_ALLOWED_EMAILS"] = admin_allowed_emails.strip()
    if import_key and import_sha256:
        env_map["PUNCTUM_MANAGED_IMPORT_KEY"] = import_key
        env_map["PUNCTUM_MANAGED_IMPORT_SHA256"] = import_sha256
    return env_map


def strip_import_secrets(env_map: dict[str, str]) -> dict[str, str]:
    return {
        k: v
        for k, v in env_map.items()
        if k not in ("PUNCTUM_MANAGED_IMPORT_KEY", "PUNCTUM_MANAGED_IMPORT_SHA256")
    }


def _iter_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from _iter_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_strings(child)


def parse_import_and_bootstrap_receipts(logs_payload, expected_digest: str):
    import_receipt = None
    bootstrap_receipt = None
    for text in _iter_strings(logs_payload):
        for line in text.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                parsed = json.loads(line)
            except ValueError:
                continue
            if not isinstance(parsed, dict):
                continue
            status = parsed.get("status")
            if status == "PUNCTUM_UNLIMITED_IMPORT_VERIFIED":
                import_receipt = parsed
            elif status == "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED":
                bootstrap_receipt = parsed

    assert import_receipt is not None, "PUNCTUM_UNLIMITED_IMPORT_VERIFIED receipt missing"
    assert import_receipt.get("cipherSha256") == expected_digest, "Import cipher SHA-256 mismatch"
    assert bootstrap_receipt is not None, "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED receipt missing"
    assert bootstrap_receipt.get("hasLayoutPresetColumn") is True, "layout_preset missing after import"
    assert bootstrap_receipt.get("adminClerkLinked") is True, "Clerk admin link missing after import"
    assert bootstrap_receipt.get("integrity") == "ok", "SQLite integrity not ok after import"
    return import_receipt, bootstrap_receipt


class HostingerUnlimitedClient:
    def __init__(self, token: str):
        if not token:
            raise ValueError("HOSTINGER_UNLIMITED_API is required")
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, url: str, method: str = "GET", headers: dict[str, str] | None = None, body: bytes | None = None):
        merged = {"User-Agent": "Punctum-Unlimited-Sync/1.0", **(headers or {})}
        req = urllib.request.Request(url, method=method, headers=merged, data=body)
        try:
            with self.opener.open(req, timeout=30) as resp:
                return resp.status, resp.headers, resp.read(2_000_000)
        except urllib.error.HTTPError as err:
            return err.code, err.headers, err.read(4096)

    def api(self, method: str, path: str, payload=None):
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Punctum-Unlimited-Sync/1.0",
        }
        body = json.dumps(payload).encode() if payload is not None else None
        status, _, raw = self.request(API + path, method=method, headers=headers, body=body)
        if status >= 400:
            raise RuntimeError(f"Hostinger {method} {path} returned HTTP {status}")
        data = json.loads(raw) if raw else {}
        return data.get("data", data) if isinstance(data, dict) else data

    def replace_env(self, env_map: dict[str, str]):
        payload = {"env_vars": [{"key": k, "value": v} for k, v in env_map.items()]}
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        status, _, _ = self.request(f"{API}{SITE}/builds/settings/env", "PUT", headers, json.dumps(payload).encode())
        if status >= 400 and status not in (500, 502, 503, 504):
            raise RuntimeError(f"Hostinger env write failed with HTTP {status}")
        expected = set(env_map)
        for _ in range(5):
            rows = self.api("GET", f"{SITE}/builds/settings/env")
            keys = {row.get("key") for row in rows if isinstance(row, dict)}
            if keys == expected:
                return
            time.sleep(2)
        raise RuntimeError("Environment key readback did not converge")

    def upload_archive(self, archive: bytes, prefix: str) -> str:
        creds = self.api("POST", "/files/upload-urls", {"username": USERNAME, "domain": DOMAIN})
        base = validate_tus_upload_url(creds["url"])
        headers = {
            "X-Auth": creds["auth_key"],
            "X-Auth-Rest": creds["rest_auth_key"],
            "Tus-Resumable": "1.0.0",
        }
        name = f"{prefix}{uuid.uuid4().hex}.zip"
        target = f"{base}/{name}?override=true"
        status, _, _ = self.request(
            target, "POST", {**headers, "Upload-Length": str(len(archive)), "Upload-Offset": "0"}, b""
        )
        if status != 201:
            raise RuntimeError(f"TUS upload creation returned HTTP {status}")
        chunk_size = 4 * 1024 * 1024
        offset = 0
        retries = 0
        while offset < len(archive):
            chunk = archive[offset : offset + chunk_size]
            next_offset = offset + len(chunk)
            st, recv, _ = self.request(
                target,
                "PATCH",
                {
                    **headers,
                    "Content-Type": "application/offset+octet-stream",
                    "Upload-Offset": str(offset),
                },
                chunk,
            )
            if st != 204 or int(recv.get("Upload-Offset", "-1")) != next_offset:
                if retries >= 3:
                    raise RuntimeError(f"TUS chunk failed at offset {offset}: HTTP {st}")
                retries += 1
                hst, hhdr, _ = self.request(target, "HEAD", headers)
                remote = int(hhdr.get("Upload-Offset", "-1"))
                if hst not in (200, 204) or not (offset <= remote <= next_offset):
                    raise RuntimeError("TUS offset reconciliation failed")
                offset = remote
                continue
            offset = next_offset
        return name

    def trigger_and_wait_build(self, archive_name: str, _message: str) -> tuple[str, object]:
        payload = {
            **BUILD_SETTINGS,
            "source_type": "archive",
            "source_options": {"archive_path": archive_name},
        }
        res = self.api("POST", f"{SITE}/builds", payload)
        build_uuid = res.get("uuid") if isinstance(res, dict) else None
        if not build_uuid:
            raise RuntimeError("Hostinger build did not return uuid")
        deadline = time.monotonic() + 720
        while time.monotonic() < deadline:
            st = self.api("GET", f"{SITE}/builds/{build_uuid}")
            state = st.get("state")
            if state == "completed":
                logs = self.api("GET", f"{SITE}/builds/{build_uuid}/logs")
                return build_uuid, logs
            if state in ("failed", "error"):
                raise RuntimeError(f"Hostinger build {build_uuid} ended in state {state}")
            time.sleep(5)
        raise TimeoutError(f"Hostinger build {build_uuid} timed out")


def _fetch_clerk_admin_email_and_pem(secret_key: str, clerk_user_id: str) -> tuple[str, str]:
    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Accept": "application/json",
        "User-Agent": "Punctum-Unlimited-Sync/1.0",
    }
    opener = urllib.request.build_opener(NoRedirect())

    with opener.open(urllib.request.Request(f"https://api.clerk.com/v1/users/{clerk_user_id}", headers=headers), timeout=20) as r:
        user = json.loads(r.read())
    primary_id = user.get("primary_email_address_id")
    emails = user.get("email_addresses") or []
    email_obj = next((e for e in emails if e.get("id") == primary_id), None) or emails[0]
    admin_email = (email_obj.get("email_address") or "").strip().lower()
    if "@" not in admin_email:
        raise ValueError("Verified Clerk admin email missing")

    with opener.open(urllib.request.Request("https://api.clerk.com/v1/jwks", headers=headers), timeout=20) as r:
        jwks = json.loads(r.read())
    rsa_jwk = next(k for k in jwks.get("keys", []) if k.get("kty") == "RSA")
    pem = subprocess.check_output(
        [
            "node",
            "--input-type=module",
            "-e",
            "import { createPublicKey } from 'node:crypto'; "
            "const jwk = JSON.parse(process.argv[1]); "
            "process.stdout.write(createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }).toString().trim());",
            json.dumps(rsa_jwk),
        ],
        text=True,
    )
    return admin_email, pem.replace("\n", "\\n")


def execute(root: pathlib.Path) -> dict:
    sys.path.insert(0, str(root / "scripts"))
    from hostinger_candidate_qa import candidate_archive

    exported = pathlib.Path(os.environ["PUNCTUM_MANAGED_OUTPUT"])
    secrets_in = json.loads((exported / "private-environment.json").read_text())
    receipt = json.loads((exported / "export-receipt.json").read_text())
    seed_bundle = exported / "managed-seed.bin"
    if not seed_bundle.is_file():
        raise FileNotFoundError("Missing managed-seed.bin")

    publishable_key = os.environ["CLERK_PUBLISHABLE_KEY"].strip()
    secret_key = os.environ["CLERK_SECRET_KEY"].strip()
    clerk_admin_id = os.environ["PUNCTUM_CLERK_ADMIN_USER_ID"].strip()
    source_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    admin_email, jwt_pem = _fetch_clerk_admin_email_and_pem(secret_key, clerk_admin_id)

    client = HostingerUnlimitedClient(os.environ["HOSTINGER_UNLIMITED_API"].strip())
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().strip("\0").split("\0")
    base_zip, _ = candidate_archive(root, tracked)
    buf = io.BytesIO(base_zip)
    with zipfile.ZipFile(buf, "a", zipfile.ZIP_STORED) as zf:
        zf.write(seed_bundle, "services/punctum-hostinger-production/managed-seed.bin")
    import_zip_bytes = buf.getvalue()

    env_with_import = build_unlimited_sync_env(
        publishable_key=publishable_key,
        secret_key=secret_key,
        jwt_key_pem_single_line=jwt_pem,
        admin_email=admin_email,
        clerk_admin_user_id=clerk_admin_id,
        source_sha=source_sha,
        import_key=secrets_in["PUNCTUM_MANAGED_IMPORT_KEY"],
        import_sha256=secrets_in["PUNCTUM_MANAGED_IMPORT_SHA256"],
        admin_password_hash=secrets.token_hex(32),
        admin_session_secret=secrets.token_hex(48),
        client_session_secret=secrets.token_hex(48),
    )

    client.replace_env(env_with_import)
    import_archive_name = client.upload_archive(import_zip_bytes, "punctum-unlimited-seed-")
    import_build_uuid, import_logs = client.trigger_and_wait_build(
        import_archive_name, "feat(r4): import Cloudflare D1/R2 dataset into Hostinger Unlimited"
    )
    imp_receipt, boot_receipt = parse_import_and_bootstrap_receipts(
        import_logs, secrets_in["PUNCTUM_MANAGED_IMPORT_SHA256"]
    )

    # Clear import secrets and redeploy clean source archive without managed-seed.bin
    client.replace_env(strip_import_secrets(env_with_import))
    clean_archive_name = client.upload_archive(base_zip, "punctum-unlimited-clean-")
    clean_build_uuid, _ = client.trigger_and_wait_build(
        clean_archive_name, "chore(release): clean Hostinger source build after D1/R2 sync"
    )

    # Probe live public stats & imported sample R2 media after server restart
    time.sleep(8)
    stats = None
    for _ in range(10):
        st, _, raw = client.request(f"https://{DOMAIN}/api/public/stats?sync={uuid.uuid4().hex}")
        if st == 200:
            stats = json.loads(raw)
            break
        time.sleep(3)
    sample_id = receipt["sampleImageId"]
    sample_status = None
    for _ in range(10):
        st, hdrs, body = client.request(
            f"https://{DOMAIN}/media/{urllib.parse.quote(sample_id, safe='')}/card",
            headers={"Accept": "image/webp"},
        )
        if st == 200 and hdrs.get("Content-Type", "").startswith("image/") and len(body) > 0:
            sample_status = st
            break
        time.sleep(3)
    if sample_status != 200:
        raise RuntimeError(f"Imported R2 media sample {sample_id} did not return 200")

    return {
        "status": "PUNCTUM_UNLIMITED_D1_R2_SYNC_VERIFIED",
        "domain": DOMAIN,
        "sourceSha": source_sha,
        "importBuildUuid": import_build_uuid,
        "cleanBuildUuid": clean_build_uuid,
        "importedObjects": imp_receipt["objects"],
        "importedBytes": imp_receipt["bytes"],
        "bootstrap": boot_receipt,
        "liveStats": stats,
        "sampleImageStatus": sample_status,
        "archiveSha256": hashlib.sha256(base_zip).hexdigest(),
    }


if __name__ == "__main__":
    summary = execute(pathlib.Path.cwd())
    out_dir = pathlib.Path("outputs/unlimited-d1-r2-sync")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))
