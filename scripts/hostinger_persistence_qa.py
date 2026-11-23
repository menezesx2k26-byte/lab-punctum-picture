"""Run a temporary storage profile of the existing probe, then restore the probe."""
import io
import json
import time
import zipfile
from hostinger_managed_qa import Recovery, RequestFailure, DOMAIN, SITE, PROBE_SETTINGS, probe_archive

ENTRY = 'services/punctum-hostinger-node/persistence-probe-server.mjs'
PROFILE = {**PROBE_SETTINGS, 'entry_file':ENTRY}


def profile_archive(root):
    probe_archive(root)  # refuse changed recovery sources before creating this profile
    files = [
        'services/punctum-hostinger-qa/app.mjs',
        ENTRY,
        'services/punctum-hostinger-node/persistence-probe.mjs',
        'services/punctum-hostinger-node/persistence-probe.test.mjs',
        'services/punctum-hostinger-node/runtime.mjs',
        'services/punctum-hostinger-node/sqlite.mjs',
    ]
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in files:
            archive.writestr(name, (root / name).read_bytes())
        archive.writestr('package.json', json.dumps({'name':'punctum-existing-probe-storage-profile', 'private':True,
            'type':'module', 'engines':{'node':'>=24'}, 'scripts':{'build':
            'node --check ' + ENTRY + ' && node --test services/punctum-hostinger-node/persistence-probe.test.mjs'}}))
    return output.getvalue()


def build_profile(operation, name, phase):
    operation.report['buildRequestAttempted'] = True
    operation.save()
    payload = {**PROFILE, 'source_type':'archive', 'source_options':{'archive_path':name}}
    build = operation.api(phase + 'Start', SITE + '/builds', payload)
    identifier = build.get('uuid') if isinstance(build, dict) else None
    if not isinstance(identifier, str) or len(identifier) != 36:
        raise ValueError('Unknown build acknowledgement; reconcile without retrying POST')
    operation.report['buildsStarted'] += 1
    operation.report.setdefault('profileBuilds', []).append({'phase':phase, 'uuid':identifier})
    operation.save()
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        state = operation.api(phase + 'State', SITE + '/builds/' + identifier)
        if state.get('state') == 'completed':
            options = state.get('options', {})
            if any(options.get(k) != v for k,v in PROFILE.items()):
                raise ValueError('Managed storage profile configuration differs')
            return identifier
        if state.get('state') == 'failed':
            raise ValueError('Managed storage profile build failed')
        time.sleep(4)
    raise ValueError('Profile build deadline exceeded')


def storage_health(operation, phase, previous=None):
    deadline = time.monotonic() + 75
    while time.monotonic() < deadline:
        try:
            _, headers = operation.health(phase)
            result = json.loads(headers.get('X-Punctum-QA-Persistence', '{}'))
            if result.get('status') == 'FAILED':
                operation.report.setdefault('storage', {})[phase] = result
                raise ValueError('Private runtime storage was refused')
            if (result.get('scope') != 'synthetic-only' or result.get('integrity') != 'ok' or
                result.get('backupVerified') is not True or result.get('privateOutsideDeployment') is not True or
                result.get('directoryMode') != '700' or result.get('databaseMode') != '600'):
                raise ValueError('Private runtime storage report is not valid')
            if previous and result.get('bootId') == previous.get('bootId'):
                time.sleep(3)
                continue
            if previous and (result.get('fixtureSha256') != previous.get('fixtureSha256') or
                             result.get('boots', 0) <= previous.get('boots', 0)):
                raise ValueError('Private SQLite/media did not survive the operation')
            operation.report.setdefault('storage', {})[phase] = result
            operation.save()
            return result
        except RequestFailure as error:
            if error.status not in (None, 502, 503, 504):
                raise
            time.sleep(3)
    raise ValueError('New runtime boot was not verified in time')


def execute_persistence(root, request):
    operation = Recovery(root, 'prepare', request['expected_build_uuid'])
    operation.report['action'] = 'persistence'
    failed = False
    try:
        operation.health('healthBefore')
        from hostinger_managed_qa import check_probe_settings
        check_probe_settings(operation.api('settingsBefore', SITE + '/builds/settings'),
                             operation.api('environmentBefore', SITE + '/builds/settings/env'))
        history = operation.api('buildsBefore', SITE + '/builds')
        if (not history or history[0].get('uuid') != request['expected_build_uuid'] or
            any(row.get('state') in ('pending','running') for row in history)):
            raise ValueError('Reconcile changed build history before storage operation')
        name = operation.upload_archive(profile_archive(root), 'punctum-storage-qa-')
        build_profile(operation, name, 'initialProfile')
        first = storage_health(operation, 'initialBoot')
        operation.api('restart', SITE + '/server/restart', {})  # single POST, no blind retry
        operation.report['restartsRequested'] = 1
        restarted = storage_health(operation, 'afterRestart', first)
        # Upload another exclusive copy: public_html may be replaced during each build.
        name = operation.upload_archive(profile_archive(root), 'punctum-storage-qa-')
        build_profile(operation, name, 'rebuiltProfile')
        storage_health(operation, 'afterRebuild', restarted)
        operation.report['persistenceStatus'] = 'PRIVATE_SQLITE_MEDIA_BACKUP_RESTART_REBUILD_VERIFIED'
    except (RequestFailure, ValueError, KeyError, TypeError) as error:
        failed = True
        operation.report['failure'] = {'type':type(error).__name__}
        if isinstance(error, RequestFailure):
            operation.report['failure'].update(operation=error.label, status=error.status)
    finally:
        operation.save()
        if operation.report.get('buildRequestAttempted'):
            # Restore the known byte-identical stateless probe, even when the profile failed.
            try:
                history = operation.api('buildsBeforeRecovery', SITE + '/builds')
                if not history or any(row.get('state') in ('pending','running') for row in history):
                    raise ValueError('A managed build is still active; refusing a competing restore')
                restored = Recovery(root, 'restore-probe', history[0]['uuid'])
                restored.run()
                operation.report['probeRecovery'] = restored.report
            except (RequestFailure, ValueError, KeyError, TypeError) as error:
                failed = True
                operation.report['probeRecoveryFailure'] = {'type':type(error).__name__}
                if isinstance(error, RequestFailure):
                    operation.report['probeRecoveryFailure'].update(operation=error.label, status=error.status)
        operation.report['status'] = ('BLOCKED_OR_FAILED' if failed else 'PRIVATE_PERSISTENCE_VERIFIED_AND_PROBE_RESTORED')
        operation.save()
        print(json.dumps(operation.report, indent=2))
    if failed:
        raise SystemExit(1)
