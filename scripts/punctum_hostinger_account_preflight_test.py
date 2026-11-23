import importlib.util
import io
import json
import pathlib
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch


def load_preflight():
    path = pathlib.Path(__file__).with_name("punctum-hostinger-account-preflight.py")
    spec = importlib.util.spec_from_file_location("punctum_hostinger_account_preflight", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HostingerPreflightSanitizeTest(unittest.TestCase):
    def test_inactive_order_stops_before_node_api(self):
        module = load_preflight()
        website = {
            "domain": module.MAIN_DOMAIN,
            "username": module.USERNAME,
            "order_id": module.ORDER_ID,
            "website_type": "nodejs",
            "is_enabled": True,
        }
        output = io.StringIO()
        with (
            patch.dict("os.environ", {"HOSTINGER_API": "synthetic-credential"}),
            patch.object(module, "call", side_effect=[
                (200, [website], None),
                (200, [{"id": module.ORDER_ID, "status": "cancelled"}], None),
                *[(404, None, None)] * 5,
            ]) as call,
            redirect_stdout(output),
        ):
            module.main()
        self.assertEqual(call.call_count, 2)
        report = json.loads(output.getvalue())
        self.assertFalse(report["accountConfirmed"])
        self.assertEqual(report["deployPath"], "ACCOUNT_NOT_CONFIRMED")

    def test_order_whitelist_drops_unlisted_fields(self):
        module = load_preflight()
        sanitized = module.sanitize_order(
            {
                "id": 1008628483,
                "status": "active",
                "subscription_id": "sub_example",
                "plan": {"name": "hostinger_premium_v3"},
                "created_at": "2026-01-22T14:15:54Z",
                "client_id": 1018536097,
                "token": "must-not-pass",
            }
        )
        self.assertEqual(
            sanitized,
            {
                "id": 1008628483,
                "status": "active",
                "subscription_id": "sub_example",
                "plan": "hostinger_premium_v3",
                "created_at": "2026-01-22T14:15:54Z",
            },
        )

    def test_non_dict_order_is_ignored(self):
        module = load_preflight()
        self.assertIsNone(module.sanitize_order("nope"))


class UnlimitedDomainPreflightTest(unittest.TestCase):
    def setUp(self):
        self.module = load_preflight()
        self.website = {
            "domain": "magic-lime-guanaco-79.hostingersite.com",
            "username": "u775492464",
            "order_id": 1008583103,
            "website_type": "nodejs",
            "is_enabled": True,
        }
        self.order = {"id": 1008583103, "status": "active", "plan": "hostinger_unlimited"}

    def report(self, ownership, *, website=None, order=None, portfolio=None, incoming=None):
        def api(token, path, **kwargs):
            if path.startswith("/websites?"):
                return 200, [website or self.website], None
            if path.startswith("/orders?"):
                return 200, [order or self.order], None
            if path == "/domains/verify-ownership":
                self.assertEqual(kwargs["body"], {"domain": "punctumpicture.com"})
                return 200, ownership, None
            if path in ("/portfolio/punctumpicture.com", "/move/incoming/punctumpicture.com?force_sync=true"):
                self.assertEqual(kwargs["api"], "https://developers.hostinger.com/api/domains/v1")
                return 200, portfolio if path.startswith("/portfolio/") else incoming, None
            return 200, {}, None

        with patch.object(self.module, "call", side_effect=api) as call:
            report = self.module.build_report("synthetic-credential", target="unlimited", check_domain=True)
        return report, call

    def test_unlimited_account_is_verified_before_no_challenge_blocker(self):
        report, _ = self.report({"domain": "punctumpicture.com", "is_accessible": False, "txt_to_verify": ""})
        self.assertTrue(report["accountConfirmed"])
        self.assertEqual(report["expected"]["order_id"], 1008583103)
        self.assertEqual(report["expected"]["username"], "u775492464")
        self.assertEqual(report["domainAssociation"]["status"], "BLOCKED_PROVIDER_NO_CHALLENGE")
        self.assertEqual(report["domainAssociation"]["http"], 200)
        self.assertEqual(report["domainAssociation"]["challengeLength"], 0)
        self.assertEqual(report["dnsWrites"], 0)

    def test_unlimited_accepts_punctumpicture_website_on_order_1008583103(self):
        report, _ = self.report(
            {"domain": "punctumpicture.com", "is_accessible": False, "txt_to_verify": ""},
            website={**self.website, "domain": "punctumpicture.com"},
        )
        self.assertTrue(report["accountConfirmed"])
        self.assertTrue(report["checks"]["websites_by_order"]["punctum_nodejs"])

    def test_wrong_order_user_or_domain_denies_site_specific_probes(self):
        for field, value in (("order_id", 1008628483), ("username", "u571409090"),
                             ("domain", "unrelated.example"), ("is_enabled", False)):
            with self.subTest(field=field):
                report, call = self.report({}, website={**self.website, field: value})
                self.assertFalse(report["accountConfirmed"])
                self.assertEqual(call.call_count, 2)
                self.assertNotIn("domainAssociation", report)

    def test_inactive_unlimited_order_stops_before_ownership(self):
        report, call = self.report({}, order={**self.order, "status": "cancelled"})
        self.assertFalse(report["accountConfirmed"])
        self.assertEqual(call.call_count, 2)

    def test_real_challenge_is_summarized_without_dns_write_or_value_leak(self):
        challenge = "hostinger-verify=synthetic-provider-challenge"
        report, _ = self.report({"domain": "punctumpicture.com", "is_accessible": False, "txt_to_verify": challenge})
        self.assertEqual(report["domainAssociation"]["status"], "OWNERSHIP_TXT_REQUIRES_AUTHORIZATION")
        self.assertNotIn(challenge, json.dumps(report))
        self.assertEqual(report["dnsWrites"], 0)

    def test_accessible_domain_is_not_reported_as_bound_or_deployed(self):
        report, _ = self.report({"domain": "punctumpicture.com", "is_accessible": True, "txt_to_verify": ""})
        self.assertEqual(report["domainAssociation"]["status"], "ACCESSIBLE_NOT_BOUND")
        self.assertEqual(report["writesAttempted"], 0)

    def test_malformed_provider_response_never_claims_domain_access(self):
        for response in ({"is_accessible": "false"}, {"domain": "other.example", "is_accessible": True}, None):
            with self.subTest(response=response):
                report, _ = self.report(response)
                self.assertEqual(report["domainAssociation"]["status"], "INVALID_PROVIDER_RESPONSE")

    def test_unlimited_main_never_falls_back_to_legacy_credential(self):
        output = io.StringIO()
        with patch.dict("os.environ", {"HOSTINGER_API": "legacy-secret", "HOSTINGER_UNLIMITED_API": ""}, clear=True), \
                patch.object(self.module, "call") as call, redirect_stdout(output):
            result = self.module.main(["--target", "unlimited", "--check-domain"])
        self.assertNotEqual(result, 0)
        self.assertEqual(call.call_count, 0)
        self.assertFalse(json.loads(output.getvalue())["accountConfirmed"])

    def test_completed_registration_move_is_separate_from_site_access_and_omits_contacts(self):
        report, _ = self.report(
            {"domain": "punctumpicture.com", "is_accessible": False, "txt_to_verify": ""},
            portfolio={"domain": "punctumpicture.com", "status": "active", "contacts": {"email": "private-owner@example.test"}},
            incoming={"domain": "punctumpicture.com", "status": "completed", "new_customer_email": "private-owner@example.test"},
        )
        self.assertEqual(report["domainPortfolio"]["http"], 200)
        self.assertEqual(report["domainPortfolio"]["status"], "active")
        self.assertEqual(report["incomingMove"]["status"], "completed")
        self.assertEqual(report["domainAssociation"]["status"], "BLOCKED_PROVIDER_NO_CHALLENGE")
        self.assertNotIn("private-owner@example.test", json.dumps(report))


if __name__ == "__main__":
    unittest.main()
