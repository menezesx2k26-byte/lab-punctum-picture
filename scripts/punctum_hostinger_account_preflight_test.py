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


if __name__ == "__main__":
    unittest.main()
