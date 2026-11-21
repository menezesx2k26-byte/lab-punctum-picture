import contextlib
import io
import json
import os
import pathlib
import tempfile
import textwrap
import unittest
import urllib.parse
from unittest.mock import patch


class DnsBaselineTest(unittest.TestCase):
    def inventory(self, txt):
        workflow = pathlib.Path(__file__).resolve().parents[1] / ".github/workflows/punctum-dns-preflight.yml"
        code = textwrap.dedent(workflow.read_text().split("python3 - <<'PY'\n", 1)[1].split("\n          PY", 1)[0])
        records = [
            {"id": "txt", "name": "punctumpicture.com", "type": "TXT", "content": txt, "ttl": 900, "proxied": False},
            {"id": "mx", "name": "punctumpicture.com", "type": "MX", "content": "mail.example.test", "ttl": 3600, "priority": 10, "proxied": False},
        ]

        def read(request, **kwargs):
            self.assertEqual(request.get_method(), "GET")
            path = urllib.parse.urlparse(request.full_url).path
            result = {}
            if path.endswith("/zones"):
                result = [{"id": "zone", "name": "punctumpicture.com", "account": {"id": "257bca437616da74ece1ce4bbaf0bd89"}, "status": "active", "name_servers": ["nia.ns.cloudflare.com", "pedro.ns.cloudflare.com"]}]
            elif path.endswith("/dns_records"):
                result = records
            elif path.endswith("/workers/domains"):
                result = []
            response = io.BytesIO(json.dumps({"success": True, "result": result}).encode())
            response.status = 200
            return response

        with tempfile.TemporaryDirectory() as folder, contextlib.chdir(folder), \
                patch.dict(os.environ, {"DNS_TOKEN": "synthetic", "WORKERS_TOKEN": "synthetic"}), \
                patch("urllib.request.urlopen", side_effect=read), contextlib.redirect_stdout(io.StringIO()):
            exec(compile(code, str(workflow), "exec"), {})
            return json.loads(pathlib.Path("dns-evidence/report.json").read_text())

    def test_mail_and_txt_drift_changes_baseline_without_exposing_txt(self):
        first = self.inventory("synthetic-ownership-value")
        second = self.inventory("changed-ownership-value")
        self.assertNotEqual(first.get("recordsSha256"), second.get("recordsSha256"))
        self.assertNotIn("synthetic-ownership-value", json.dumps(first))
        self.assertEqual({r["type"] for r in first["nonRoutingRecords"]}, {"TXT", "MX"})
        self.assertEqual(first["mutations"], 0)


if __name__ == "__main__":
    unittest.main()
