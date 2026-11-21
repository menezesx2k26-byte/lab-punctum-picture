#!/usr/bin/env python3
"""Trusted-runner Hostinger read-only account preflight for Punctum.

Fixed Premium/Unlimited identity checks before site-specific diagnostics.
Never prints credentials or ownership TXT values. No DNS or deployment writes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
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
DOMAINS_API = "https://developers.hostinger.com/api/domains/v1"
FORBIDDEN_TOUCH = "menezescontabilidade.com"
TARGETS = {
    "premium": (ORDER_ID, USERNAME, MAIN_DOMAIN, TEMP_DOMAIN, "HOSTINGER_API"),
    "unlimited": (1008583103, "u775492464", "magic-lime-guanaco-79.hostingersite.com", None, "HOSTINGER_UNLIMITED_API"),
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def mask(text: str, token: str) -> str:
    if not text:
        return text
    return text.replace(token, "[redacted]") if token else text


def call(token: str, path: str, timeout: int = 20, *, body=None, request_ids=None, api=API):
    req = urllib.request.Request(
        api + path,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "PunctumHostingerAccountPreflight/1.0",
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    def capture_ids(headers):
        if request_ids is not None:
            request_ids[path] = {name: value for name in ("x-request-id", "x-correlation-id", "cf-ray")
                                 if (value := headers.get(name)) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,200}", value)}

    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req, timeout=timeout) as response:
            capture_ids(response.headers)
            raw = response.read(1_000_000)
            payload = json.loads(raw.decode("utf-8"))
            data = payload.get("data", payload) if isinstance(payload, dict) else payload
            return response.status, data, None
    except urllib.error.HTTPError as error:
        capture_ids(error.headers)
        detail = error.read(4096).decode("utf-8", "replace")
        try:
            parsed = json.loads(detail)
            message = parsed.get("message")
        except Exception:
            message = detail[:200]
        return error.code, None, mask(str(message), token)
    except Exception as error:
        return None, None, type(error).__name__ + ":" + mask(str(error), token)[:160]


def sanitize_order(row: dict) -> dict | None:
    if not isinstance(row, dict):
        return None
    plan = row.get("plan")
    plan_name = plan.get("name") if isinstance(plan, dict) else plan if isinstance(plan, str) else None
    return {
        "id": row.get("id"),
        "status": row.get("status"),
        "subscription_id": row.get("subscription_id"),
        "plan": plan_name,
        "created_at": row.get("created_at"),
    }


def build_report(token: str, *, target: str = "premium", check_domain: bool = False) -> dict:
    order_id, username, main_domain, temp_domain, secret_name = TARGETS[target]
    report = {
        "schema": 1,
        "measuredAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "Hostinger fixed-account preflight; no DNS, binding or deployment writes",
        "target": target,
        "writesAttempted": 0,
        "dnsWrites": 0,
        "requestIds": {},
        "secretPresence": {secret_name: bool(token.strip())},
        "expected": {
            "order_id": order_id,
            "username": username,
            "main_domain": main_domain,
            "temp_domain_historical": temp_domain,
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
        report["blockingCall"] = f"secrets.{secret_name} absent in workflow env"
        return report

    status, websites, err = call(token, "/websites?" + urllib.parse.urlencode({"order_id": order_id, "per_page": 100}), request_ids=report["requestIds"])
    websites_status = status
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
            row.get("domain") == main_domain
            and row.get("username") == username
            and row.get("order_id") == order_id
            and row.get("website_type") == "nodejs"
            and row.get("is_enabled") is True
        ):
            punctum = item
    report["checks"]["websites_by_order"]["sites"] = sanitized
    report["checks"]["websites_by_order"]["punctum_nodejs"] = bool(punctum)
    report["checks"]["websites_by_order"]["nodejs_count"] = sum(
        1 for item in sanitized if item.get("website_type") == "nodejs"
    )
    report["checks"]["websites_by_order"]["website_count"] = len(sanitized)

    status, orders_payload, err = call(token, "/orders?" + urllib.parse.urlencode({"per_page": 50}), request_ids=report["requestIds"])
    orders = orders_payload if isinstance(orders_payload, list) else []
    if isinstance(orders_payload, dict) and isinstance(orders_payload.get("data"), list):
        orders = orders_payload["data"]
    sanitized_orders = [item for item in (sanitize_order(row) for row in orders) if item]
    report["checks"]["orders"] = {
        "http": status,
        "error": err,
        "orders": sanitized_orders,
        "expectedOrderPresent": any(item.get("id") == order_id for item in sanitized_orders),
    }
    active_order = status == 200 and any(
        item["id"] == order_id and item["status"] == "active" for item in sanitized_orders
    )
    report["accountConfirmed"] = websites_status == 200 and bool(punctum) and active_order
    if not report["accountConfirmed"]:
        report["deployPath"] = "ACCOUNT_NOT_CONFIRMED"
        report["verdict"] = "PUNCTUM_WEBSITE_OR_ACTIVE_ORDER_NOT_CONFIRMED"
        report["blockingCall"] = f"Expected enabled Node website and active order {order_id} required"
        return report

    report["checks"]["nodejs_capacity_observed"] = {
        "nodejsSiteCountOnOrder": report["checks"]["websites_by_order"]["nodejs_count"],
        "websiteCountOnOrder": len(sanitized),
        "createAttempted": False,
        "writesAttempted": 0,
        "note": (
            "Read-only counts only. No POST /orders/{order_id}/onboardings and no free-subdomain generation. "
            "A numeric Node.js quota was not returned by these GET endpoints."
        ),
    }

    # Historical temporary origin (read-only)
    status, temp_sites, err = call(token, "/websites?" + urllib.parse.urlencode({"domain": temp_domain or main_domain}), request_ids=report["requestIds"])
    temp_list = temp_sites if isinstance(temp_sites, list) else []
    if isinstance(temp_sites, dict) and isinstance(temp_sites.get("data"), list):
        temp_list = temp_sites["data"]
    report["checks"]["aliceblue_website"] = {
        "http": status,
        "error": err,
        "listed": bool(temp_domain) and any(isinstance(r, dict) and r.get("domain") == temp_domain for r in temp_list),
        "count": len(temp_list) if isinstance(temp_list, list) else None,
    }

    # Node build settings READ on main Node site (does not mutate)
    site = f"/accounts/{username}/websites/{main_domain}/nodejs"
    for label, path in (
        ("build_settings", site + "/builds/settings"),
        ("build_history", site + "/builds"),
        ("env_inventory", site + "/builds/settings/env"),
    ):
        status, data, err = call(token, path, request_ids=report["requestIds"])
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
        report["checks"][label] = entry

    # Same probes against historical temp domain if listed
    if report["checks"]["aliceblue_website"].get("listed"):
        tsite = f"/accounts/{username}/websites/{temp_domain}/nodejs"
        status, data, err = call(token, tsite + "/builds/settings", request_ids=report["requestIds"])
        report["checks"]["aliceblue_build_settings"] = {"http": status, "error": err}

    if report["nodeApiReadable"]:
        report["deployPath"] = "HOSTINGER_API_NODE_BUILDS_READ_OK"
        report["verdict"] = "PUNCTUM_ACCOUNT_CONFIRMED_NODE_API_READABLE"
        report["nextSafeNote"] = (
            "Composio cannot deploy. HOSTINGER_API can read Node builds. "
            "Isolated QA still needs an empty additional Node host (not main punctumpicture.com) "
            "before any build POST. GENERATE_FREE_SUBDOMAIN alone is not a host."
        )
        if target == "unlimited":
            report["nextSafeNote"] = "Reuse the existing isolated Unlimited staging. This report does not prove custom-domain association or authorize release."
    else:
        report["deployPath"] = "ACCOUNT_OK_NODE_API_BLOCKED"
        report["verdict"] = "ACCOUNT_CONFIRMED_NODE_API_NOT_READABLE"
        failed = [k for k, v in report["checks"].items() if k.startswith("build") and v.get("http") not in (200,)]
        report["blockingCall"] = failed[0] if failed else "nodejs builds endpoints non-200"
    if check_domain:
        for label, path in (("domainPortfolio", f"/portfolio/{MAIN_DOMAIN}"),
                            ("incomingMove", f"/move/incoming/{MAIN_DOMAIN}?force_sync=true")):
            status, data, _ = call(token, path, api=DOMAINS_API, request_ids=report["requestIds"])
            report[label] = {"http": status}
            if isinstance(data, dict):
                report[label].update({key: value for key in ("domain", "status")
                                      if isinstance(value := data.get(key), str)
                                      and re.fullmatch(r"[A-Za-z0-9_.-]{1,253}", value)})
        status, data, err = call(token, "/domains/verify-ownership", body={"domain": MAIN_DOMAIN}, request_ids=report["requestIds"])
        valid = status == 200 and isinstance(data, dict) and data.get("domain") == MAIN_DOMAIN
        accessible = data.get("is_accessible") if valid else None
        txt = data.get("txt_to_verify") if valid else None
        association = {"http": status, "error": err, "domain": MAIN_DOMAIN, "is_accessible": accessible,
                       "challengeLength": len(txt) if isinstance(txt, str) else None,
                       "status": "INVALID_PROVIDER_RESPONSE"}
        if valid and accessible is True:
            association["status"] = "ACCESSIBLE_NOT_BOUND"
        elif valid and accessible is False:
            if isinstance(txt, str) and txt:
                association.update(status="OWNERSHIP_TXT_REQUIRES_AUTHORIZATION", challengeSha256=hashlib.sha256(txt.encode()).hexdigest())
            elif txt == "":
                association["status"] = "BLOCKED_PROVIDER_NO_CHALLENGE"
        report["domainAssociation"] = association
    return report


def main(argv=()) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=TARGETS, default="premium")
    parser.add_argument("--check-domain", action="store_true")
    args = parser.parse_args(argv)
    token = os.environ.get(TARGETS[args.target][4]) or ""
    report = build_report(token, target=args.target, check_domain=args.check_domain)
    text = json.dumps(report, indent=2) + "\n"
    if token and token in text:
        raise SystemExit("REFUSING_TO_PRINT_TOKEN")
    sys.stdout.write(text)
    return 0 if report["accountConfirmed"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
