#!/usr/bin/env python3
"""Trusted-runner Hostinger read-only account preflight for Punctum.

Proves secrets.HOSTINGER_API reaches order 1008628483 / u571409090 / punctumpicture.com
Node APIs before any create/deploy. Never prints the token. No writes.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ORDER_ID = 1008628483
USERNAME = "u571409090"
MAIN_DOMAIN = "punctumpicture.com"
TEMP_DOMAIN = "aliceblue-locust-999458.hostingersite.com"
API = "https://developers.hostinger.com/api/hosting/v1"
FORBIDDEN_TOUCH = "menezescontabilidade.com"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def mask(text: str, token: str) -> str:
    if not text:
        return text
    return text.replace(token, "[redacted]") if token else text


def call(token: str, path: str, timeout: int = 20):
    req = urllib.request.Request(
        API + path,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "PunctumHostingerAccountPreflight/1.0",
        },
    )
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req, timeout=timeout) as response:
            raw = response.read(1_000_000)
            payload = json.loads(raw.decode("utf-8"))
            data = payload.get("data", payload) if isinstance(payload, dict) else payload
            return response.status, data, None
    except urllib.error.HTTPError as error:
        detail = error.read(4096).decode("utf-8", "replace")
        try:
            parsed = json.loads(detail)
            message = parsed.get("message")
        except Exception:
            message = detail[:200]
        return error.code, None, mask(str(message), token)
    except Exception as error:
        return None, None, type(error).__name__ + ":" + mask(str(error), token)[:160]


def main() -> int:
    token = os.environ.get("HOSTINGER_API") or ""
    report = {
        "schema": 1,
        "measuredAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "G03 Hostinger RO preflight — prove Punctum account before any create",
        "writesAttempted": 0,
        "secretPresence": {"HOSTINGER_API": bool(token.strip())},
        "expected": {
            "order_id": ORDER_ID,
            "username": USERNAME,
            "main_domain": MAIN_DOMAIN,
            "temp_domain_historical": TEMP_DOMAIN,
            "do_not_touch": FORBIDDEN_TOUCH,
        },
        "checks": {},
        "accountConfirmed": False,
        "nodeApiReadable": False,
        "deployPath": "UNKNOWN",
        "isolatedQaOrigin": None,
        "blockingCall": None,
    }
    if not token.strip():
        report["verdict"] = "HOSTINGER_API_MISSING_IN_ACTIONS_CONTEXT"
        report["blockingCall"] = "secrets.HOSTINGER_API absent in workflow env"
        print(json.dumps(report, indent=2))
        return 0

    status, websites, err = call(token, "/websites?" + urllib.parse.urlencode({"order_id": ORDER_ID, "per_page": 100}))
    report["checks"]["websites_by_order"] = {"http": status, "error": err}
    sites = websites if isinstance(websites, list) else []
    if isinstance(websites, dict) and isinstance(websites.get("data"), list):
        sites = websites["data"]
    # Hostinger sometimes returns {data:[...], meta} already unwrapped above
    sanitized = []
    punctum = None
    for row in sites:
        if not isinstance(row, dict):
            continue
        item = {
            "domain": row.get("domain"),
            "username": row.get("username"),
            "order_id": row.get("order_id"),
            "website_type": row.get("website_type"),
            "vhost_type": row.get("vhost_type"),
            "is_enabled": row.get("is_enabled"),
        }
        sanitized.append(item)
        if (
            row.get("domain") == MAIN_DOMAIN
            and row.get("username") == USERNAME
            and row.get("order_id") == ORDER_ID
            and row.get("website_type") == "nodejs"
        ):
            punctum = item
    report["checks"]["websites_by_order"]["sites"] = sanitized
    report["checks"]["websites_by_order"]["punctum_nodejs"] = bool(punctum)
    report["accountConfirmed"] = bool(punctum)

    # Historical temporary origin (read-only)
    status, temp_sites, err = call(token, "/websites?" + urllib.parse.urlencode({"domain": TEMP_DOMAIN}))
    temp_list = temp_sites if isinstance(temp_sites, list) else []
    if isinstance(temp_sites, dict) and isinstance(temp_sites.get("data"), list):
        temp_list = temp_sites["data"]
    report["checks"]["aliceblue_website"] = {
        "http": status,
        "error": err,
        "listed": any(isinstance(r, dict) and r.get("domain") == TEMP_DOMAIN for r in temp_list),
        "count": len(temp_list) if isinstance(temp_list, list) else None,
    }

    # Node build settings READ on main Node site (does not mutate)
    site = f"/accounts/{USERNAME}/websites/{MAIN_DOMAIN}/nodejs"
    for label, path in (
        ("build_settings", site + "/builds/settings"),
        ("build_history", site + "/builds"),
        ("env_inventory", site + "/builds/settings/env"),
    ):
        status, data, err = call(token, path)
        entry = {"http": status, "error": err}
        if label == "build_settings" and isinstance(data, dict):
            keep = ("app_type", "node_version", "root_directory", "output_directory", "build_script", "entry_file", "package_manager")
            entry["settings"] = {k: data.get(k) for k in keep if k in data}
            if status == 200:
                report["nodeApiReadable"] = True
        if label == "build_history" and isinstance(data, list):
            entry["page_items"] = len(data)
            entry["states"] = [row.get("state") for row in data[:8] if isinstance(row, dict)]
            if status == 200:
                report["nodeApiReadable"] = True
        if label == "env_inventory" and isinstance(data, list):
            entry["variable_count"] = len(data)
            # Never dump env values
        if label == "env_inventory" and status == 200:
            report["nodeApiReadable"] = True
        report["checks"][label] = entry

    # Same probes against historical temp domain if listed
    if report["checks"]["aliceblue_website"].get("listed"):
        tsite = f"/accounts/{USERNAME}/websites/{TEMP_DOMAIN}/nodejs"
        status, data, err = call(token, tsite + "/builds/settings")
        report["checks"]["aliceblue_build_settings"] = {"http": status, "error": err}

    if report["accountConfirmed"] and report["nodeApiReadable"]:
        report["deployPath"] = "HOSTINGER_API_NODE_BUILDS_READ_OK"
        report["verdict"] = "PUNCTUM_ACCOUNT_CONFIRMED_NODE_API_READABLE"
        report["nextSafeNote"] = (
            "Composio cannot deploy. HOSTINGER_API can read Node builds. "
            "Isolated QA still needs an empty additional Node host (not main punctumpicture.com) "
            "before any build POST. GENERATE_FREE_SUBDOMAIN alone is not a host."
        )
    elif report["accountConfirmed"]:
        report["deployPath"] = "ACCOUNT_OK_NODE_API_BLOCKED"
        report["verdict"] = "ACCOUNT_CONFIRMED_NODE_API_NOT_READABLE"
        failed = [k for k, v in report["checks"].items() if k.startswith("build") and v.get("http") not in (200,)]
        report["blockingCall"] = failed[0] if failed else "nodejs builds endpoints non-200"
    else:
        report["deployPath"] = "ACCOUNT_NOT_CONFIRMED"
        report["verdict"] = "HOSTINGER_TOKEN_NOT_PUNCTUM_OR_WEBSITE_MISSING"
        report["blockingCall"] = "websites_by_order missing punctumpicture.com nodejs on 1008628483/u571409090"

    text = json.dumps(report, indent=2) + "\n"
    if token and token in text:
        raise SystemExit("REFUSING_TO_PRINT_TOKEN")
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
