"""Exercise only the existing managed Punctum rehearsal."""
import base64
import json
import os
import pathlib
import re
import secrets
import subprocess

from hostinger_candidate_qa import build, candidate_archive, ready, write_candidate_environment
from hostinger_managed_production import PRIVATE_ROOT
from hostinger_managed_qa import DOMAIN, SITE, Recovery, RequestFailure

SETTINGS = {'app_type': 'other', 'node_version': 24, 'package_manager': 'npm',
    'root_directory': None, 'output_directory': None, 'build_script': 'build:hostinger:managed-runtime',
    'entry_file': 'services/punctum-hostinger-production/candidate-server.mjs'}
MAINTENANCE_KEYS = {'PUNCTUM_MANAGED_E2E_FIXTURE', 'PUNCTUM_MANAGED_MAINTENANCE_MARKER', 'PUNCTUM_MANAGED_MAINTENANCE_MODE'}


def operations_receipt(value):
    if isinstance(value, dict):
        values = value.values()
    elif isinstance(value, list):
        values = value
    elif isinstance(value, str):
        prefix = 'PUNCTUM_MANAGED_ACCEPTANCE '
        for line in value.splitlines():
            if prefix in line:
                try:
                    receipt = json.JSONDecoder().raw_decode(line.split(prefix, 1)[1])[0]
                    if isinstance(receipt, dict) and receipt.get('status') == 'MANAGED_OPERATIONS_VERIFIED':
                        return receipt
                except ValueError:
                    continue
        return None
    else:
        return None
    return next((receipt for item in values if (receipt := operations_receipt(item))), None)


def maintenance_environment(desired, fixture, mode):
    document = json.dumps(fixture).encode()
    assert len(document) <= 18000 and re.fullmatch(r'p[a-f0-9]{6}', fixture['marker'])
    return {**desired, 'PUNCTUM_MANAGED_E2E_FIXTURE': base64.b64encode(document).decode(),
            'PUNCTUM_MANAGED_MAINTENANCE_MARKER': fixture['marker'], 'PUNCTUM_MANAGED_MAINTENANCE_MODE': mode}


def verify_operations(operation, build_id, label):
    logs = operation.api(label + 'Logs', SITE + '/builds/' + build_id + '/logs?from_line=0')
    receipt = operations_receipt(logs)
    assert receipt, 'Managed maintenance receipt missing from completed build'
    return receipt


def execute(root):
    config = json.loads((root / 'requests/punctum-managed-production.json').read_text())
    assert config['action'] in ('accept-managed', 'recover-managed') and config['domain'] == DOMAIN
    recovery_only = config['action'] == 'recover-managed'
    operation = Recovery(root, 'prepare', config['expected_build_uuid'])
    operation.output = root / 'outputs/punctum-managed-production'
    operation.output.mkdir(parents=True, exist_ok=True)
    operation.report.update(action=config['action'], scope='existing-temporary-managed-origin', dnsTouched=False)
    success_status = 'MANAGED_RECOVERY_VERIFIED' if recovery_only else 'MANAGED_HTTP_AND_RECOVERY_VERIFIED'
    source = json.loads((root / 'config/hostinger/managed-snapshot-20261114.json').read_text())
    desired = {'PORT': '3000', 'PUNCTUM_PRODUCTION_CANDIDATE_MODE': 'private-candidate',
        'PUNCTUM_CANDIDATE_PROVIDER': 'hostinger-managed', 'PUNCTUM_CANDIDATE_ENVIRONMENT': 'staging',
        'PUNCTUM_CANDIDATE_PUBLIC_URL': 'https://' + DOMAIN,
        'PUNCTUM_CANDIDATE_DB_FILE': PRIVATE_ROOT + '/application.sqlite',
        'PUNCTUM_CANDIDATE_ORIGINALS': PRIVATE_ROOT + '/originals',
        'PUNCTUM_CANDIDATE_BACKUPS_ROOT': PRIVATE_ROOT + '/backups',
        'PUNCTUM_CANDIDATE_ADMIN_EMAIL': os.environ['SOURCE_ADMIN_EMAIL'],
        'PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET': secrets.token_hex(32),
        'PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET': secrets.token_hex(32),
        'PUNCTUM_CANDIDATE_CLIENT_AUTH_MODE': 'password', 'PUNCTUM_HOSTINGER_SHARP_POOL': '1',
        'PUNCTUM_MANAGED_EXPECTED_SQL_SHA256': source['sqlSha256'], 'PUNCTUM_QA_SOURCE_SHA': os.environ['GITHUB_SHA']}
    try:
        history = operation.api('historyBefore', SITE + '/builds')
        assert history[0]['uuid'] == config['expected_build_uuid'] and history[0]['state'] in ('completed', 'failed')
        assert not any(row.get('state') in ('pending', 'running') for row in history)
        saved = operation.api('settingsBefore', SITE + '/builds/settings')
        assert all(saved.get(key) == value for key, value in SETTINGS.items())
        current = operation.api('environmentBefore', SITE + '/builds/settings/env')
        keys = {row['key'] for row in current}
        assert set(desired) <= keys <= set(desired) | MAINTENANCE_KEYS, 'Unknown managed environment'
        paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().strip('\0').split('\0')
        archive, _ = candidate_archive(root, paths)
        name = operation.upload_archive(archive, 'punctum-node-candidate-')
        if recovery_only:
            try:
                write_candidate_environment(operation, {**desired, 'PUNCTUM_MANAGED_MAINTENANCE_MARKER': 'p' + secrets.token_hex(3),
                    'PUNCTUM_MANAGED_MAINTENANCE_MODE': 'restore'}, MAINTENANCE_KEYS)
                recovery_id = build(operation, name, SETTINGS, 'isolatedRecovery')
                operation.report['operations'] = verify_operations(operation, recovery_id, 'isolatedRecovery')
                ready(operation, 'postRecoveryReady')
            finally:
                write_candidate_environment(operation, desired, MAINTENANCE_KEYS)
            operation.report['status'] = success_status
            return
        prior = config.get('previous_fixture')
        write_candidate_environment(operation, maintenance_environment(desired, prior, 'cleanup') if prior else desired, MAINTENANCE_KEYS)
        build_id = build(operation, name, SETTINGS, 'acceptanceRuntime')
        if prior:
            operation.report['previousCleanup'] = verify_operations(operation, build_id, 'previousCleanup')['cleanup']
        original_boot = ready(operation, 'acceptanceReady')
        marker = 'p' + secrets.token_hex(3)
        operation.report['fixtureMarker'] = marker
        folder = root / 'outputs/punctum-managed-acceptance'
        env = {**os.environ, 'PUNCTUM_MANAGED_PROBE': marker}
        env.pop('HOSTINGER_API', None)
        result = None
        try:
            result = subprocess.run(['node', 'scripts/hostinger-managed-acceptance-http.mjs'], cwd=root,
                env=env, timeout=480, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        finally:
            report_file = folder / 'http.json'
            if report_file.exists():
                operation.report['http'] = json.loads(report_file.read_text())
            fixture = folder / 'fixture.json'
            if fixture.exists():
                operation.report['fixture'] = json.loads(fixture.read_text())
                try:
                    write_candidate_environment(operation, maintenance_environment(desired, operation.report['fixture'], 'restore'))
                    name = operation.upload_archive(archive, 'punctum-node-candidate-')
                    recovery_id = build(operation, name, SETTINGS, 'acceptanceRecovery')
                    operation.report['operations'] = verify_operations(operation, recovery_id, 'acceptanceRecovery')
                    ready(operation, 'postRecoveryReady', original_boot)
                finally:
                    write_candidate_environment(operation, desired, MAINTENANCE_KEYS)
        assert result and result.returncode == 0, 'HTTP acceptance did not pass'
        assert operation.report['operations']['cleanup']['status'] == 'OWNED_FIXTURE_REMOVED'
        operation.report['status'] = success_status
    except Exception as error:
        operation.report['status'] = 'MANAGED_ACCEPTANCE_INCOMPLETE'
        operation.report['failure'] = {'type': type(error).__name__,
            'label': error.label if isinstance(error, RequestFailure) else None,
            'status': error.status if isinstance(error, RequestFailure) else None,
            'message': str(error)[:160] if isinstance(error, (AssertionError, ValueError)) else None}
    finally:
        operation.save()
        print(json.dumps(operation.report, indent=2))
    if operation.report['status'] != success_status:
        raise SystemExit(1)


if __name__ == '__main__':
    execute(pathlib.Path.cwd())
