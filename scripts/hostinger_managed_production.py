"""Prepare the designated temporary managed host; public cutover is a separate gate."""
import hashlib
import io
import json
import os
import pathlib
import secrets
import subprocess
import time
import urllib.parse
import zipfile
from hostinger_managed_qa import DOMAIN, SITE, Recovery, RequestFailure, digest
from hostinger_candidate_qa import candidate_archive, put, write_candidate_environment, build, ready

PRIVATE_ROOT = '/home/u571409090/punctum-managed-storage/punctum-managed-private-20261114'
BASELINE_ARCHIVE = 'punctum-node-candidate-311371fbd4cd41d080709aafc81aeaae.zip'
BASELINE_SOURCE = '7039dc5271e4472d6163874c676cd8d676c47aa5'
QA_KEYS = {'PUNCTUM_QA_' + key for key in ('ORIGIN', 'DB_FILE', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH',
    'ADMIN_SESSION_SECRET', 'MANAGED_BOOTSTRAP', 'SOURCE_SHA')}
SETTINGS_KEYS = ('app_type', 'node_version', 'package_manager', 'root_directory', 'output_directory', 'build_script', 'entry_file')


def import_receipt(logs, expected):
    strings = []
    def visit(value):
        if isinstance(value, str):
            strings.append(value)
        elif isinstance(value, dict):
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(logs)
    for value in strings:
        for line in value.splitlines():
            prefix = 'PUNCTUM_MANAGED_IMPORT '
            if prefix not in line:
                continue
            receipt = json.JSONDecoder().raw_decode(line.split(prefix, 1)[1])[0]
            assert receipt.get('integrity') == 'ok' and receipt.get('missingReady') == 0
            assert all(receipt.get(key) == expected[key] for key in ('objects', 'bytes', 'cipherSha256', 'tables'))
            return receipt
    raise AssertionError('Authenticated managed import receipt missing')


def smoke(operation, label):
    results = []
    for path, expected in [('/', 200), ('/portfolio', 200), ('/arquivo', 200), ('/contato', 200),
                           ('/fotografia', 200), ('/servicos', 200), ('/robots.txt', 200),
                           ('/sitemap.xml', 200), ('/admin/studio', 303), ('/admin/api/me', 401),
                           ('/application.sqlite', 404), ('/managed-seed.bin', 404)]:
        start = time.monotonic()
        try:
            status, headers, raw = operation.request(label + path, 'https://' + DOMAIN + path)
        except Exception as error:
            if getattr(error, 'status', None) != expected:
                raise
            status, headers, raw = expected, {}, b''
        assert status == expected, 'Managed HTTP contract failed'
        if expected == 200:
            assert 'noindex' in headers.get('X-Robots-Tag', ''), 'Temporary origin indexing guard absent'
        results.append({'path': path, 'status': status, 'ms': round((time.monotonic() - start) * 1000)})
    operation.report.setdefault('http', {})[label] = results
    image_id = operation.report['sourceSnapshot']['sampleImageId']
    status, headers, raw = operation.request(label + 'Sharp', 'https://' + DOMAIN + '/media/' + urllib.parse.quote(image_id, safe='') + '/card',
                                            headers={'Accept': 'image/webp'})
    assert status == 200 and headers.get('Content-Type', '').startswith('image/'), 'Managed Sharp failed'
    media = {'bytes': len(raw), 'sha256': digest(raw), 'contentType': headers.get('Content-Type')}
    previous = operation.report.setdefault('media', {}).get('initial')
    if previous:
        assert media == previous, 'Managed media changed after restart/rebuild'
    operation.report['media'][label] = media
    status, auth_headers, _ = operation.request(label + 'Login', 'https://' + DOMAIN + '/admin/api/session', 'POST',
        {'Origin': 'https://' + DOMAIN, 'Content-Type': 'application/json'},
        json.dumps({'email': os.environ['SOURCE_ADMIN_EMAIL'], 'password': os.environ['SOURCE_ADMIN_PASSWORD']}).encode())
    cookie = auth_headers.get('Set-Cookie', '')
    assert status == 200 and all(flag in cookie for flag in ('HttpOnly', 'Secure', 'SameSite=Strict')), 'Managed legacy authentication failed'
    session = cookie.split(';', 1)[0]
    for path in ('/admin/api/me', '/admin/api/studio', '/admin/studio'):
        assert operation.request(label + 'Authenticated' + path, 'https://' + DOMAIN + path,
            headers={'Cookie': session})[0] == 200, 'Managed Studio authorization failed'
    operation.request(label + 'Logout', 'https://' + DOMAIN + '/admin/api/session', 'DELETE',
        {'Origin': 'https://' + DOMAIN, 'Cookie': session})
    operation.report.setdefault('authenticatedStudio', {})[label] = True
    operation.save()


def execute(root):
    request = json.loads((root / 'requests/punctum-managed-production.json').read_text())
    assert request['domain'] == DOMAIN and request['action'] == 'prepare-managed'
    operation = Recovery(root, 'prepare', request['expected_build_uuid'])
    operation.output = root / 'outputs/punctum-managed-production'
    operation.output.mkdir(parents=True, exist_ok=True)
    operation.report.update(action='prepare-managed', scope='designated-temporary-managed-origin',
                            cloudflareMutations=0, dnsTouched=False, status='IN_PROGRESS')
    changed = False
    baseline = None
    try:
        settings = operation.api('settingsBefore', SITE + '/builds/settings')
        history = operation.api('historyBefore', SITE + '/builds')
        environment = operation.api('environmentBefore', SITE + '/builds/settings/env')
        assert history[0]['uuid'] == request['expected_build_uuid'] and history[0]['state'] == 'completed', 'Concurrent build'
        assert not any(row.get('state') in ('pending', 'running') for row in history), 'Concurrent build'
        assert {row['key'] for row in environment} == QA_KEYS, 'Unexpected environment ownership'
        assert settings.get('entry_file') == 'services/punctum-hostinger-node/server.mjs'
        assert settings.get('build_script') == 'build:hostinger:qa'
        baseline = {key: settings.get(key) for key in SETTINGS_KEYS}
        baseline_archive = BASELINE_ARCHIVE
        try:
            operation.api('retainedBaselineArchive', SITE + '/builds/settings/from-archive?' +
                          urllib.parse.urlencode({'archive_path': baseline_archive}))
        except RequestFailure as error:
            if error.status != 404:
                raise
            subprocess.run(['git', 'fetch', '--no-tags', '--depth=1', 'origin', BASELINE_SOURCE],
                           cwd=root, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASELINE_SOURCE], cwd=root).decode().splitlines()
            restored, baseline_files = candidate_archive(root, paths, revision=BASELINE_SOURCE)
            baseline_archive = operation.upload_archive(restored, 'punctum-node-candidate-')
            operation.report['baselineRecoveryArchive'] = {'name': baseline_archive,
                'sourceSha': BASELINE_SOURCE, 'sha256': digest(restored), 'files': len(baseline_files)}
            operation.api('reconstructedBaselineArchive', SITE + '/builds/settings/from-archive?' +
                          urllib.parse.urlencode({'archive_path': baseline_archive}))
        _, headers, _ = operation.request('activeBaseline', 'https://' + DOMAIN + '/api/health')
        assert headers.get('X-Punctum-QA-Source') == BASELINE_SOURCE, 'Concurrent runtime'
        exported = pathlib.Path(os.environ['PUNCTUM_MANAGED_OUTPUT'])
        secrets_in = json.loads((exported / 'private-environment.json').read_text())
        receipt = json.loads((exported / 'export-receipt.json').read_text())
        operation.report['sourceSnapshot'] = receipt
        tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().strip('\0').split('\0')
        archive, files = candidate_archive(root, tracked)
        packed = io.BytesIO(archive)
        with zipfile.ZipFile(packed, 'a', zipfile.ZIP_STORED) as package:
            package.write(exported / 'managed-seed.bin', 'services/punctum-hostinger-production/managed-seed.bin')
        archive = packed.getvalue()
        operation.report['archive'] = {'sha256': digest(archive), 'bytes': len(archive), 'sourceFiles': len(files)}
        name = operation.upload_archive(archive, 'punctum-node-candidate-')
        candidate = {**baseline, 'build_script': 'build:hostinger:managed',
                     'entry_file': 'services/punctum-hostinger-production/candidate-server.mjs'}
        desired = {**secrets_in,
            'PUNCTUM_PRODUCTION_CANDIDATE_MODE': 'private-candidate',
            'PUNCTUM_CANDIDATE_PROVIDER': 'hostinger-managed', 'PUNCTUM_CANDIDATE_ENVIRONMENT': 'staging',
            'PUNCTUM_CANDIDATE_PUBLIC_URL': 'https://' + DOMAIN,
            'PUNCTUM_CANDIDATE_DB_FILE': PRIVATE_ROOT + '/application.sqlite',
            'PUNCTUM_CANDIDATE_ORIGINALS': PRIVATE_ROOT + '/originals',
            'PUNCTUM_CANDIDATE_BACKUPS_ROOT': PRIVATE_ROOT + '/backups',
            'PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET': secrets.token_hex(32),
            'PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET': secrets.token_hex(32),
            'PUNCTUM_CANDIDATE_CLIENT_AUTH_MODE': 'password',
            'PUNCTUM_HOSTINGER_SHARP_POOL': '1', 'PUNCTUM_QA_SOURCE_SHA': os.environ['GITHUB_SHA']}
        operation.report['environmentKeys'] = sorted(desired)
        changed = True
        put(operation, 'settingsWrite', SITE + '/builds/settings', candidate)
        operation.report['settingsWrites'] += 1
        write_candidate_environment(operation, desired)
        build_id = build(operation, name, candidate, 'managedImport')
        first_boot = ready(operation, 'managedReady')
        smoke(operation, 'initial')
        logs = operation.api('managedImportLogs', SITE + '/builds/' + build_id + '/logs')
        operation.report['importReceipt'] = import_receipt(logs, receipt)
        operation.api('managedRestart', SITE + '/server/restart', {})
        restart_boot = ready(operation, 'afterRestart', first_boot)
        smoke(operation, 'afterRestart')
        rebuilt = build(operation, name, candidate, 'managedRebuild')
        reused = import_receipt(operation.api('managedRebuildLogs', SITE + '/builds/' + rebuilt + '/logs'), receipt)
        assert reused.get('reused') is True, 'Rebuild replaced persistent data'
        operation.report['rebuildReceipt'] = reused
        ready(operation, 'afterRebuild', restart_boot)
        smoke(operation, 'afterRebuild')
        operation.report['status'] = 'MANAGED_SNAPSHOT_RUNTIME_VERIFIED'
        operation.report['remainingGates'] = ['real-authentication', 'private-R4-and-controlled-writes',
            'backup-restore', 'cron-activation', 'final-delta', 'public-cutover-authorization']
    except Exception as error:
        operation.report['status'] = 'FAILED_SAFE'
        operation.report['failure'] = {'type': type(error).__name__, 'message': str(error)[:160]
            if isinstance(error, AssertionError) else 'See bounded operation evidence'}
        if changed:
            try:
                history = operation.api('rollbackHistory', SITE + '/builds')
                known = {operation.expected_build, *(item['uuid'] for item in operation.report.get('managedBuilds', []))}
                assert history[0]['uuid'] in known and history[0]['state'] in ('completed', 'failed'), 'Unknown active build'
                password = secrets.token_hex(24)
                qa = {'PUNCTUM_QA_ORIGIN': 'https://' + DOMAIN,
                    'PUNCTUM_QA_DB_FILE': '/home/u571409090/punctum-qa-private-20261112/application.sqlite',
                    'PUNCTUM_QA_ADMIN_EMAIL': 'admin@example.test',
                    'PUNCTUM_QA_ADMIN_PASSWORD_HASH': hashlib.sha256(password.encode()).hexdigest(),
                    'PUNCTUM_QA_ADMIN_SESSION_SECRET': secrets.token_hex(32),
                    'PUNCTUM_QA_MANAGED_BOOTSTRAP': '1', 'PUNCTUM_QA_SOURCE_SHA': BASELINE_SOURCE}
                write_candidate_environment(operation, qa)
                put(operation, 'rollbackSettings', SITE + '/builds/settings', baseline)
                build(operation, baseline_archive, baseline, 'baselineRollback')
                operation.report['sourceSha'] = BASELINE_SOURCE
                ready(operation, 'baselineRestored')
                operation.report['rollback'] = {'status': 'VERIFIED', 'privateImportedDataPreserved': True,
                    'syntheticQaCredentialsRotated': True}
            except Exception as rollback_error:
                operation.report['rollback'] = {'status': 'NOT_VERIFIED', 'type': type(rollback_error).__name__}
    finally:
        operation.save()
        print(json.dumps(operation.report, indent=2))
    if operation.report['status'] != 'MANAGED_SNAPSHOT_RUNTIME_VERIFIED':
        raise SystemExit(1)


if __name__ == '__main__':
    execute(pathlib.Path.cwd())
