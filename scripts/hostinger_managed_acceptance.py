"""Exercise only the existing managed Punctum rehearsal."""
import base64
import json
import os
import pathlib
import re
import secrets
import subprocess
import time

from hostinger_candidate_qa import build, candidate_archive, ready, write_candidate_environment
from hostinger_managed_production import PRIVATE_ROOT
from hostinger_managed_qa import API, DOMAIN, SITE, USERNAME, Recovery, RequestFailure

CRON_PATH = f'/accounts/{USERNAME}/cron-jobs'
COMMAND = f'cd /home/{USERNAME}/domains/{DOMAIN}/hbuilds && /opt/alt/alt-nodejs24/root/bin/node --env-file=config/.env current/nodejs/cron.mjs'
SETTINGS = {'app_type': 'other', 'node_version': 24, 'package_manager': 'npm',
    'root_directory': None, 'output_directory': None, 'build_script': 'build:hostinger:managed-runtime',
    'entry_file': 'services/punctum-hostinger-production/candidate-server.mjs'}


def cron_receipt(value):
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
    return next((receipt for item in values if (receipt := cron_receipt(item))), None)


def run_cron_probe(operation, marker):
    command = COMMAND + ' check ' + marker
    assert len(command) <= 255
    rows = operation.api('cronBefore', CRON_PATH)
    assert isinstance(rows, list)
    assert not any(row.get('command') == command for row in rows), 'Cron marker already present'
    uid = None
    try:
        created = operation.api('cronProbeCreate', CRON_PATH, {'time': '* * * * *', 'command': command})
        uid = created.get('uid') if isinstance(created, dict) else None
        assert isinstance(uid, str) and re.fullmatch(r'[A-Za-z0-9_-]{3,100}', uid), 'Cron acknowledgement missing'
        operation.report['temporaryCron'] = uid
        operation.save()
        deadline = time.monotonic() + 260
        while time.monotonic() < deadline:
            try:
                output = operation.api('cronOutput', CRON_PATH + '/' + uid + '/output')
            except RequestFailure as error:
                if error.status not in (404, 422):
                    raise
            else:
                if (receipt := cron_receipt(output)):
                    return receipt
                report = json.dumps(output)
                operation.report['cronErrorCodes'] = sorted(set(re.findall(r'\b(?:MANAGED_[A-Z0-9_]+|CANDIDATE_[A-Z0-9_]+|ENOENT|EACCES)\b', report)))
                if operation.report['cronErrorCodes']:
                    raise ValueError('Managed scheduled probe reported an error')
            time.sleep(12)
        raise ValueError('Managed scheduled receipt timed out')
    finally:
        current = operation.api('cronCleanupCheck', CRON_PATH)
        matches = [row for row in current if row.get('command') == command]
        if len(matches) == 1 and (not uid or matches[0].get('uid') == uid):
            owned_uid = matches[0]['uid']
            assert re.fullmatch(r'[A-Za-z0-9_-]{3,100}', owned_uid)
            operation.request('cronProbeDelete', API + CRON_PATH + '/' + owned_uid, 'DELETE',
                {'Authorization': 'Bearer ' + operation.token, 'Accept': 'application/json'})
        after = operation.api('cronAfter', CRON_PATH)
        assert not any(row.get('command') == command for row in after), 'Temporary cron still configured'
        operation.report['temporaryCronRemoved'] = True


def execute(root):
    config = json.loads((root / 'requests/punctum-managed-production.json').read_text())
    assert config['action'] == 'accept-managed' and config['domain'] == DOMAIN
    operation = Recovery(root, 'prepare', config['expected_build_uuid'])
    operation.output = root / 'outputs/punctum-managed-production'
    operation.output.mkdir(parents=True, exist_ok=True)
    operation.report.update(action='accept-managed', scope='existing-temporary-managed-origin', dnsTouched=False)
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
        assert history[0]['uuid'] == config['expected_build_uuid'] and history[0]['state'] == 'completed'
        assert not any(row.get('state') in ('pending', 'running') for row in history)
        saved = operation.api('settingsBefore', SITE + '/builds/settings')
        assert all(saved.get(key) == value for key, value in SETTINGS.items())
        current = operation.api('environmentBefore', SITE + '/builds/settings/env')
        assert {row['key'] for row in current} == set(desired), 'Unknown managed environment'
        paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().strip('\0').split('\0')
        archive, _ = candidate_archive(root, paths)
        name = operation.upload_archive(archive, 'punctum-node-candidate-')
        write_candidate_environment(operation, desired)
        build(operation, name, SETTINGS, 'acceptanceRuntime')
        ready(operation, 'acceptanceReady')
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
                document = fixture.read_bytes()
                assert len(document) <= 18000
                operation.report['fixture'] = json.loads(document)
                write_candidate_environment(operation, {**desired,
                    'PUNCTUM_MANAGED_E2E_FIXTURE': base64.b64encode(document).decode()})
            try:
                operation.report['operations'] = run_cron_probe(operation, marker)
            finally:
                if fixture.exists():
                    write_candidate_environment(operation, desired)
        assert result and result.returncode == 0, 'HTTP acceptance did not pass'
        assert operation.report['operations']['cleanup']['status'] == 'OWNED_FIXTURE_REMOVED'
        operation.report['status'] = 'MANAGED_HTTP_AND_RECOVERY_VERIFIED'
    except Exception as error:
        operation.report['status'] = 'MANAGED_ACCEPTANCE_INCOMPLETE'
        operation.report['failure'] = {'type': type(error).__name__,
            'label': error.label if isinstance(error, RequestFailure) else None,
            'status': error.status if isinstance(error, RequestFailure) else None,
            'message': str(error)[:160] if isinstance(error, (AssertionError, ValueError)) else None}
    finally:
        operation.save()
        print(json.dumps(operation.report, indent=2))
    if operation.report['status'] != 'MANAGED_HTTP_AND_RECOVERY_VERIFIED':
        raise SystemExit(1)


if __name__ == '__main__':
    execute(pathlib.Path.cwd())
