"""Bounded recovery of the disposable QA probe; never touches production."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

DOMAIN = "aliceblue-locust-999458.hostingersite.com"
USERNAME = "u571409090"
VERSION = "r4-node-probe-20261028-v2"
BACKUP_DIGEST = "918755f5d4c1ebb1064cafceb4dfbfc20491a309d47147c6fe6e57a2731a75ca"
PROBE_SETTINGS = {"app_type": "other", "node_version": 24, "package_manager": "npm",
                  "build_script": "build", "entry_file": "server.mjs",
                  "root_directory": None, "output_directory": None}
API = "https://developers.hostinger.com/api/hosting/v1"
SITE = f"/accounts/{USERNAME}/websites/{DOMAIN}/nodejs"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def probe_archive(root):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name in ("README.md", "app.mjs", "package.json", "server.mjs"):
            info = zipfile.ZipInfo(name, (2026, 10, 28, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 2175008768
            info.create_system = 3
            archive.writestr(info, (root / "services/punctum-hostinger-qa" / name).read_bytes(), compresslevel=6)
    result = data.getvalue()
    if digest(result) != BACKUP_DIGEST:
        raise ValueError("Probe does not match the verified backup digest")
    return result


def upload_base(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname != "srv2282-files.hstgr.io" or
            parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.port):
        raise ValueError("Unexpected upload destination")
    return url.rstrip("/")


def check_probe_settings(settings, environment):
    if not isinstance(settings, dict) or any(settings.get(k) != v for k, v in PROBE_SETTINGS.items()):
        raise ValueError("Live build configuration no longer matches the disposable probe")
    if not isinstance(environment, list) or environment:
        raise ValueError("Unexpected application environment; refusing to overwrite a different service")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class RequestFailure(Exception):
    def __init__(self, label, status=None):
        self.label, self.status = label, status
        super().__init__(f"{label}: HTTP {status}" if status else f"{label}: request unavailable")


class Recovery:
    def __init__(self, root, action, expected_build, existing_archive=None):
        if action not in ("prepare", "inspect-upload", "restore-probe"):
            raise ValueError("Only probe preparation or identical probe recovery is supported")
        self.root, self.action, self.expected_build = root, action, expected_build
        if existing_archive is not None and (not isinstance(existing_archive, str) or
                not re.fullmatch(r"punctum-recovery-v2-[a-f0-9]{32}\.zip", existing_archive)):
            raise ValueError("Unexpected recovery archive name")
        if action == "inspect-upload" and not existing_archive:
            raise ValueError("Inspect requires the already acknowledged recovery archive")
        self.existing_archive = existing_archive
        self.token = os.environ.get("HOSTINGER_API")
        if not self.token:
            raise ValueError("HOSTINGER_API is unavailable")
        self.opener = urllib.request.build_opener(NoRedirect())
        self.output = root / "outputs/hostinger-managed-recovery"
        self.output.mkdir(parents=True, exist_ok=True)
        self.report = {"schema": 1, "sourceSha": os.environ.get("GITHUB_SHA"), "target": DOMAIN,
                       "action": action, "scope": "disposable-existing-qa-instance-only",
                       "status": "IN_PROGRESS", "productionMutations": 0, "buildsStarted": 0,
                       "settingsWrites": 0, "environmentWrites": 0, "checks": {}}

    def save(self):
        (self.output / "report.json").write_text(json.dumps(self.report, indent=2) + "\n")

    def request(self, label, url, method="GET", headers=None, body=None):
        request = urllib.request.Request(url, method=method, headers=headers or {}, data=body)
        try:
            with self.opener.open(request, timeout=25) as response:
                raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise ValueError("Bounded response exceeded")
                self.report["checks"][label] = {"status": response.status}
                return response.status, response.headers, raw
        except urllib.error.HTTPError as error:
            self.report["checks"][label] = {"status": error.code}
            raise RequestFailure(label, error.code) from None
        except OSError:
            self.report["checks"][label] = {"error": "UNAVAILABLE"}
            raise RequestFailure(label) from None

    def api(self, label, path, payload=None):
        headers = {"Authorization": "Bearer " + self.token, "Accept": "application/json",
                   "Content-Type": "application/json", "User-Agent": "Punctum QA inventory/1.0"}
        attempts = 1 if payload is not None else 3
        statuses = []
        for attempt in range(attempts):
            try:
                raw = self.request(label, API + path, "POST" if payload is not None else "GET", headers,
                                   json.dumps(payload).encode() if payload is not None else None)[2]
                statuses.append(self.report["checks"][label]["status"])
                self.report["checks"][label]["attemptStatuses"] = statuses
                break
            except RequestFailure as error:
                statuses.append(error.status)
                self.report["checks"][label]["attemptStatuses"] = list(statuses)
                if error.status not in (None, 500, 502, 503, 504) or attempt + 1 == attempts:
                    raise
                time.sleep(2)
        response = json.loads(raw)
        return response.get("data", response) if isinstance(response, dict) else response

    def health(self, label):
        nonce = str(uuid.uuid4())
        _, headers, raw = self.request(label, f"https://{DOMAIN}/health?nonce={nonce}",
                                      headers={"User-Agent": "Punctum QA recovery/1.0"})
        health = json.loads(raw)
        if (health.get("service") != "punctum-hostinger-qa-probe" or health.get("version") != VERSION or
                health.get("nonce") != nonce or health.get("production") is not False or
                health.get("ssrValidated") is not False):
            raise ValueError("The current service is not the expected disposable v2 probe")
        self.report["checks"][label].update({k: health.get(k) for k in ("service", "version", "node", "production", "ssrValidated")})
        return health, headers

    def upload_archive(self, archive, prefix):
        if prefix not in ('punctum-recovery-v2-', 'punctum-storage-qa-', 'punctum-node-candidate-'):
            raise ValueError('Unexpected archive profile')
        credentials = self.api('uploadCredentials', '/files/upload-urls', {'username':USERNAME, 'domain':DOMAIN})
        base = upload_base(credentials['url'])
        headers = {'X-Auth':credentials['auth_key'], 'X-Auth-Rest':credentials['rest_auth_key'],
                   'Tus-Resumable':'1.0.0', 'User-Agent':'Punctum QA recovery/1.0'}
        name = prefix + uuid.uuid4().hex + '.zip'
        target = base + '/' + name + '?override=true'
        status = self.request('uploadCreate', target, 'POST',
                              {**headers, 'Upload-Length':str(len(archive)), 'Upload-Offset':'0'}, b'')[0]
        if status != 201:
            raise ValueError('Upload creation was not acknowledged')
        status, received, _ = self.request('uploadBytes', target, 'PATCH',
                                          {**headers, 'Content-Type':'application/offset+octet-stream', 'Upload-Offset':'0'}, archive)
        if status != 204 or int(received.get('Upload-Offset', '-1')) != len(archive):
            raise ValueError('Complete archive upload was not acknowledged')
        self.report.setdefault('acknowledgedArchives', []).append({'name':name, 'bytes':len(archive), 'sha256':digest(archive)})
        self.save()
        return name

    def run(self):
        archive = probe_archive(self.root)
        self.report["backup"] = {"bytes": len(archive), "sha256": digest(archive), "members": 4}
        self.health("healthBefore")
        settings = self.api("settingsBefore", SITE + "/builds/settings")
        environment = self.api("environmentBefore", SITE + "/builds/settings/env")
        check_probe_settings(settings, environment)
        self.report["originalSettings"] = dict(PROBE_SETTINGS)
        history = self.api("buildsBefore", SITE + "/builds")
        if not isinstance(history, list) or not history or history[0].get("uuid") != self.expected_build:
            raise ValueError("Build history changed; reconcile before operating")
        if any(row.get("state") in ("pending", "running") for row in history):
            raise ValueError("Another managed build is already active")
        self.report["originalBuild"] = self.expected_build
        self.save()

        if self.existing_archive:
            name = self.existing_archive
            self.report["archiveName"] = name
            files = self.api("uploadedFileInventory", f"/accounts/{USERNAME}/domains/{DOMAIN}/files?max_depth=1&max_items=100")
            rows = files.get("items", files.get("files", [])) if isinstance(files, dict) else files
            matches = [row for row in rows if isinstance(row, dict) and row.get("name") == name] if isinstance(rows, list) else []
            self.report["uploadedFile"] = {"listed": bool(matches), "matches": len(matches)}
            if len(matches) != 1:
                raise ValueError("Previously acknowledged recovery archive is not uniquely listed")
        else:
            name = self.upload_archive(archive, 'punctum-recovery-v2-')
        self.report["archiveName"] = name
        detected = self.api("archiveDetection", SITE + "/builds/settings/from-archive?" + urllib.parse.urlencode({"archive_path": name}))
        if not isinstance(detected, dict):
            raise ValueError("Provider could not inspect the newly uploaded recovery archive")
        self.report["detectedSettings"] = {k: detected.get(k) for k in PROBE_SETTINGS}
        self.save()
        if self.action in ("prepare", "inspect-upload"):
            self.report["status"] = "RECOVERY_ARCHIVE_PREPARED_NOT_DEPLOYED"
            self.health("healthUnchanged")
            return

        # Same bytes and settings as the existing stateless probe. Never retries POST.
        payload = {**PROBE_SETTINGS, "source_type": "archive", "source_options": {"archive_path": name}}
        self.report["buildRequestAttempted"] = True
        self.save()
        build = self.api("restoreBuildStart", SITE + "/builds", payload)
        build_id = build.get("uuid") if isinstance(build, dict) else None
        if not isinstance(build_id, str) or len(build_id) != 36:
            raise ValueError("Build acknowledgement lacks an identifier; do not retry blindly")
        self.report.update({"buildsStarted": 1, "restoreBuild": build_id})
        self.save()
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            state = self.api("restoreBuildState", SITE + "/builds/" + build_id)
            if state.get("state") == "completed":
                options = state.get("options", {})
                check_probe_settings(options, [])
                if options.get("source_type") != "archive" or options.get("source_options", {}).get("archive_path") != name:
                    raise ValueError("Completed build source differs from the recovery request")
                self.report["completedBuild"] = {"uuid": build_id, "state": "completed", "options": payload}
                break
            if state.get("state") == "failed":
                raise ValueError("Managed recovery build failed; existing version must be reconciled")
            time.sleep(4)
        else:
            raise ValueError("Recovery build deadline exceeded; do not submit another build")
        self.health("healthRestored")
        after = self.api("settingsAfter", SITE + "/builds/settings")
        check_probe_settings(after, self.api("environmentAfter", SITE + "/builds/settings/env"))
        logs = self.api("restoreBuildLogs", SITE + "/builds/" + build_id + "/logs")
        self.report["buildLogSha256"] = digest(json.dumps(logs, sort_keys=True, separators=(",", ":")).encode())
        self.report["status"] = "IDENTICAL_PROBE_RECOVERY_VERIFIED_IN_PLACE"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    request = json.loads(Path(args.request).read_text())
    if request.get("domain") != DOMAIN or request.get("backup_sha256") != BACKUP_DIGEST:
        raise ValueError("Recovery request target or backup is not authorized")
    if request['action'] == 'persistence':
        from hostinger_persistence_qa import execute_persistence
        execute_persistence(root, request)
        return
    if request['action'] == 'candidate':
        from hostinger_candidate_qa import execute_candidate
        execute_candidate(root, request)
        return
    operation = Recovery(root, request["action"], request["expected_build_uuid"], request.get("existing_archive"))
    try:
        operation.run()
    except (RequestFailure, ValueError, KeyError, TypeError) as error:
        operation.report["status"] = "BLOCKED_OR_FAILED"
        operation.report["failure"] = {"type": type(error).__name__}
        if isinstance(error, RequestFailure):
            operation.report["failure"].update({"operation": error.label, "status": error.status})
        operation.save()
        print(json.dumps(operation.report, indent=2))
        raise SystemExit(1) from None
    else:
        operation.save()
        print(json.dumps(operation.report, indent=2))


if __name__ == "__main__":
    main()
