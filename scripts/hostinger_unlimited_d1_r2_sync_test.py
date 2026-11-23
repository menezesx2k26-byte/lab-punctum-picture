import json
import unittest

from scripts.hostinger_unlimited_d1_r2_sync import (
    STORAGE_ROOT,
    build_unlimited_sync_env,
    parse_import_and_bootstrap_receipts,
    strip_import_secrets,
    validate_tus_upload_url,
)


class UnlimitedD1R2SyncHelpersTest(unittest.TestCase):
    def test_validate_tus_upload_url_allows_hstgr_file_nodes_only(self):
        self.assertEqual(
            validate_tus_upload_url("https://srv880-files.hstgr.io/rest/abc/api/tus/public_html/"),
            "https://srv880-files.hstgr.io/rest/abc/api/tus/public_html",
        )
        self.assertEqual(
            validate_tus_upload_url("https://srv2282-files.hstgr.io/rest/x/"),
            "https://srv2282-files.hstgr.io/rest/x",
        )
        for bad in (
            "http://srv880-files.hstgr.io/rest/x",
            "https://evil.example/rest/x",
            "https://srv880-files.hstgr.io:8443/rest/x",
            "https://srv880-files.hstgr.io/rest/x?foo=bar",
        ):
            with self.assertRaises(ValueError):
                validate_tus_upload_url(bad)

    def test_build_and_strip_sync_env_preserves_release_b_and_clerk_keys(self):
        env_map = build_unlimited_sync_env(
            publishable_key="pk_live_abc",
            secret_key="sk_live_def",
            jwt_key_pem_single_line="-----BEGIN PUBLIC KEY-----\\nABC\\n-----END PUBLIC KEY-----",
            admin_email="studio@punctumpicture.com",
            clerk_admin_user_id="user_3M7epRZWjA3wg33n8xOk9ddeOzg",
            source_sha="a" * 40,
            import_key="b" * 64,
            import_sha256="c" * 64,
            admin_password_hash="d" * 64,
            admin_session_secret="e" * 96,
            client_session_secret="f" * 96,
        )
        self.assertEqual(env_map["PUNCTUM_CANDIDATE_DB_FILE"], STORAGE_ROOT + "/application.sqlite")
        self.assertEqual(env_map["PUNCTUM_CANDIDATE_ORIGINALS"], STORAGE_ROOT + "/originals")
        self.assertEqual(env_map["PUNCTUM_CANDIDATE_BACKUPS_ROOT"], STORAGE_ROOT + "/backups")
        self.assertEqual(env_map["CLIENT_AUTH_MODE"], "clerk")
        self.assertEqual(env_map["PRIVATE_GALLERIES_ENABLED"], "true")
        self.assertEqual(env_map["PUNCTUM_MANAGED_IMPORT_KEY"], "b" * 64)

        stripped = strip_import_secrets(env_map)
        self.assertNotIn("PUNCTUM_MANAGED_IMPORT_KEY", stripped)
        self.assertNotIn("PUNCTUM_MANAGED_IMPORT_SHA256", stripped)
        self.assertEqual(stripped["CLERK_SECRET_KEY"], "sk_live_def")

    def test_parse_import_and_bootstrap_receipts_requires_both_verifications(self):
        digest = "c" * 64
        logs = {
            "logs": "\n".join([
                "vite built",
                json.dumps({
                    "status": "PUNCTUM_UNLIMITED_IMPORT_VERIFIED",
                    "objects": 230,
                    "bytes": 372040548,
                    "cipherSha256": digest,
                    "reused": False,
                }),
                json.dumps({
                    "status": "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED",
                    "createdDatabase": False,
                    "dbFileExists": True,
                    "hasLayoutPresetColumn": True,
                    "adminClerkLinked": True,
                    "integrity": "ok",
                    "sourceSha": "a" * 40,
                }),
            ])
        }
        imp, boot = parse_import_and_bootstrap_receipts(logs, digest)
        self.assertEqual(imp["objects"], 230)
        self.assertTrue(boot["adminClerkLinked"])

        with self.assertRaises(AssertionError):
            parse_import_and_bootstrap_receipts({"logs": "no receipts"}, digest)

    def test_client_request_sets_explicit_user_agent(self):
        from scripts.hostinger_unlimited_d1_r2_sync import HostingerUnlimitedClient

        captured = {}

        class FakeOpener:
            def open(self, req, timeout=30):
                captured["ua"] = req.get_header("User-agent")
                raise OSError("stop")

        client = HostingerUnlimitedClient("tok_test")
        client.opener = FakeOpener()
        with self.assertRaises(OSError):
            client.request("https://api.clerk.com/v1/jwks")
        self.assertEqual(captured["ua"], "Punctum-Unlimited-Sync/1.0")


if __name__ == "__main__":
    unittest.main()
