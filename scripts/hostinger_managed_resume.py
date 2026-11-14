"""Resume the verified imported dataset without re-importing or replacing it."""
import json
import os
import pathlib
import secrets
import subprocess
from hostinger_managed_qa import Recovery, DOMAIN, SITE
from hostinger_candidate_qa import candidate_archive, put, write_candidate_environment, build, ready
from hostinger_managed_production import PRIVATE_ROOT, smoke


def execute(root):
    request = json.loads((root / 'requests/punctum-managed-production.json').read_text())
    assert request['action'] == 'resume-managed' and request['domain'] == DOMAIN
    source = json.loads((root / 'config/hostinger/managed-snapshot-20261114.json').read_text())
    operation = Recovery(root, 'prepare', request['expected_build_uuid'])
    operation.output = root / 'outputs/punctum-managed-production'
    operation.output.mkdir(parents=True, exist_ok=True)
    operation.report.update(action='resume-managed', scope='existing-verified-managed-dataset',
                            sourceSnapshot=source, operatorSha=os.environ['GITHUB_SHA'], dnsTouched=False)
    try:
        history = operation.api('historyBeforeResume', SITE + '/builds')
        assert history[0]['uuid'] == request['expected_build_uuid'], 'Unknown managed build'
        assert not any(row.get('state') in ('pending','running') for row in history), 'Concurrent managed build'
        previous = operation.api('importedBuild', SITE + '/builds/01a1dad6-b4eb-7202-a346-d47c6d506438')
        assert previous.get('state') == 'completed', 'Verified imported build changed'
        environment = operation.api('environmentBeforeResume', SITE + '/builds/settings/env')
        qa_keys = {'PUNCTUM_QA_' + name for name in
            ('ORIGIN','DB_FILE','ADMIN_EMAIL','ADMIN_PASSWORD_HASH','ADMIN_SESSION_SECRET','MANAGED_BOOTSTRAP','SOURCE_SHA')}
        current_source = '86e7b8cef792da47f1fce7a92a253ffd2530215b'
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
            'PUNCTUM_MANAGED_EXPECTED_SQL_SHA256': source['sqlSha256'],
            'PUNCTUM_QA_SOURCE_SHA': current_source}
        assert {row['key'] for row in environment} in (qa_keys, set(desired)), 'Unknown environment ownership'
        settings = {'app_type': 'other', 'node_version': 24, 'package_manager': 'npm',
            'root_directory': None, 'output_directory': None, 'build_script': 'build:hostinger:managed-runtime',
            'entry_file': 'services/punctum-hostinger-production/candidate-server.mjs'}
        operation.report['environmentKeys'] = sorted(desired)
        write_candidate_environment(operation, desired)
        put(operation, 'resumeSettings', SITE + '/builds/settings', settings)
        operation.report['sourceSha'] = current_source
        operation.api('resumeRestart', SITE + '/server/restart', {})
        old_boot = ready(operation, 'importedRuntimeResumed')
        smoke(operation, 'initial')
        tracked = subprocess.check_output(['git','ls-files','-z'], cwd=root).decode().strip('\0').split('\0')
        archive, files = candidate_archive(root, tracked)
        operation.report['runtimeSourceFiles'] = len(files)
        name = operation.upload_archive(archive, 'punctum-node-candidate-')
        desired['PUNCTUM_QA_SOURCE_SHA'] = os.environ['GITHUB_SHA']
        write_candidate_environment(operation, desired)
        operation.report['sourceSha'] = os.environ['GITHUB_SHA']
        build(operation, name, settings, 'managedRuntime')
        boot = ready(operation, 'runtimeRebuilt', old_boot)
        smoke(operation, 'afterRebuild')
        operation.api('verifiedRestart', SITE + '/server/restart', {})
        ready(operation, 'runtimeRestarted', boot)
        smoke(operation, 'afterRestart')
        saved = operation.api('settingsReadback', SITE + '/builds/settings')
        assert all(saved.get(key) == value for key, value in settings.items()), 'Settings readback mismatch'
        saved_env = operation.api('environmentReadback', SITE + '/builds/settings/env')
        assert {row['key'] for row in saved_env} == set(desired), 'Environment key readback mismatch'
        operation.report['status'] = 'MANAGED_IMPORTED_RUNTIME_AND_STUDIO_VERIFIED'
        operation.report['remainingGates'] = ['Clerk identity link and real session', 'R4 and upload HTTP',
            'backup/restore and cron', 'final delta', 'production hostname TLS', 'public cutover authorization']
    except Exception as error:
        operation.report['status'] = 'RESUME_NOT_VERIFIED'
        operation.report['failure'] = {'type': type(error).__name__,
            'message': str(error)[:160] if isinstance(error, AssertionError) else 'See bounded checks'}
    finally:
        operation.save()
        print(json.dumps(operation.report, indent=2))
    if operation.report['status'] != 'MANAGED_IMPORTED_RUNTIME_AND_STUDIO_VERIFIED':
        raise SystemExit(1)


if __name__ == '__main__':
    execute(pathlib.Path.cwd())
