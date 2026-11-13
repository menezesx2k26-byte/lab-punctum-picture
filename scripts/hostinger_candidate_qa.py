"""Deploy and exercise only the existing synthetic Hostinger QA destination."""
import hashlib
import io
import json
import os
import re
import secrets
import subprocess
import time
import uuid
import zipfile
from hostinger_managed_qa import API, SITE, DOMAIN, Recovery, RequestFailure, PROBE_SETTINGS, check_probe_settings, probe_archive, digest

ALLOWED_ROOTS = {'app','build','config','db','drizzle','migrations','public','shared','worker'}
ALLOWED_FILES = {'package.json','package-lock.json','next.config.ts','tsconfig.json','worker-configuration.d.ts','wrangler.jsonc'}


def candidate_archive(root, tracked):
    output = io.BytesIO()
    files = []
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(tracked):
            parts = path.split('/')
            if (path.startswith('/') or '..' in parts or any(p.startswith('.env') for p in parts) or
                any(p in ('node_modules','.git','dist','outputs','backups') for p in parts) or
                path.endswith(('.sqlite','.db','.pem','.key','.zip'))):
                continue
            allowed = (parts[0] in ALLOWED_ROOTS or path in ALLOWED_FILES or
                       path.startswith('services/punctum-hostinger-node/'))
            if not allowed:
                continue
            if (root / path).is_symlink():
                raise ValueError('Source archive refuses tracked symlinks')
            data = (root / path).read_bytes()
            archive.writestr(path, data)
            files.append({'path':path,'bytes':len(data),'sha256':digest(data)})
    if not any(f['path'] == 'services/punctum-hostinger-node/server.mjs' for f in files):
        raise ValueError('Candidate entrypoint is absent from the source archive')
    return output.getvalue(), files


def put(operation, label, path, payload):
    headers = {'Authorization':'Bearer ' + operation.token,'Accept':'application/json',
               'Content-Type':'application/json','User-Agent':'Punctum QA inventory/1.0'}
    operation.request(label, API + path, 'PUT', headers, json.dumps(payload).encode())


def confirm_environment_keys(operation, label, expected, permitted):
    # An acknowledged GET can briefly lag a PUT that returned an ambiguous 500.
    # Poll only reads, and fail immediately on any unrelated or duplicate key.
    for delay in (0, 2, 5, 10):
        if delay:
            time.sleep(delay)
        rows = operation.api(label, SITE + '/builds/settings/env')
        if not isinstance(rows, list):
            raise ValueError('Invalid environment key readback')
        keys = [row.get('key') for row in rows if isinstance(row, dict)]
        if len(keys) != len(rows) or len(set(keys)) != len(keys) or not set(keys) <= permitted:
            raise ValueError('Unexpected environment key readback')
        operation.report.setdefault('environmentReadbackCounts', {}).setdefault(label, []).append(len(keys))
        if set(keys) == expected:
            return rows
    raise ValueError('Expected environment key readback did not converge')


def write_candidate_environment(operation, environment):
    """Handle the provider's ambiguous HTTP 500 after a full env replacement.

    A full set of masked keys proves only that the API accepted the shape,
    NOT that the values are correct. The candidate remains provisional until
    the real functional login, SSL, persistence and source guards all pass.
    """
    payload = {'env_vars':[{'key':k,'value':v} for k,v in environment.items()]}
    operation.report['candidateEnvironmentAcceptance'] = 'NOT_VERIFIED'
    try:
        put(operation,'candidateEnvironmentWrite',SITE + '/builds/settings/env',payload)
    except RequestFailure as error:
        if error.status not in (None,500,502,503,504):
            raise
        keys = set(environment)
        readback = confirm_environment_keys(operation, 'candidateEnvironmentReadbackAfterHttpError', keys, keys)
        operation.report['candidateEnvironmentAcceptance'] = 'PROVISIONAL_KEYS_ONLY'
        operation.report['candidateEnvironmentKeyCount'] = len(readback)
        operation.report['candidateEnvironmentHttpError'] = error.status
        return
    operation.report['environmentWrites'] += 1
    operation.report['candidateEnvironmentAcceptance'] = 'ACKNOWLEDGED'


def build(operation, name, settings, phase):
    operation.report['buildRequestAttempted'] = True
    operation.save()
    payload = {**settings,'source_type':'archive','source_options':{'archive_path':name}}
    result = operation.api(phase + 'Start', SITE + '/builds', payload)
    identifier = result.get('uuid') if isinstance(result,dict) else None
    if not isinstance(identifier,str) or len(identifier) != 36:
        raise ValueError('Unknown build acknowledgement; do not repeat POST')
    operation.report['buildsStarted'] += 1
    operation.report.setdefault('managedBuilds',[]).append({'phase':phase,'uuid':identifier})
    operation.save()
    deadline = time.monotonic() + 660
    while time.monotonic() < deadline:
        state = operation.api(phase + 'State', SITE + '/builds/' + identifier)
        if state.get('state') == 'completed':
            options = state.get('options',{})
            if any(options.get(k) != v for k,v in settings.items()):
                raise ValueError('Completed candidate build has unexpected settings')
            return identifier
        if state.get('state') == 'failed':
            logs = operation.api(phase + 'Logs', SITE + '/builds/' + identifier + '/logs')
            content = json.dumps(logs).lower()
            operation.report['failedBuildDiagnostics'] = {
                'sha256':digest(json.dumps(logs,sort_keys=True).encode()),
                'outOfMemory':any(x in content for x in ('out of memory','heap limit','killed','oom')),
                'missingDependency':'cannot find' in content or 'not found' in content,
                'typescriptError':'error ts' in content,
            }
            raise ValueError('Managed candidate build failed')
        time.sleep(4)
    raise ValueError('Managed candidate build deadline exceeded; reconcile without a competing build')


def ready(operation, phase, previous_boot=None):
    source = operation.report.get('sourceSha')
    if not isinstance(source, str) or not re.fullmatch(r'[a-f0-9]{40}', source):
        raise ValueError('Managed readiness requires the deployed source SHA')
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            status, headers, raw = operation.request(
                phase, 'https://' + DOMAIN + '/api/health?check=' + uuid.uuid4().hex,
                headers={'Cache-Control': 'no-cache'},
            )
            boot = headers.get('X-Punctum-QA-Boot', '')
            if (status == 200 and 'noindex' in headers.get('X-Robots-Tag', '') and
                    headers.get('X-Punctum-QA-Source') == source and boot != previous_boot and
                    re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', boot)):
                health = json.loads(raw)
                if isinstance(health, dict) and health.get('ok') is True and health.get('service') == 'punctum-picture':
                    operation.report.setdefault('candidateBoots', {})[phase] = boot
                    return boot
        except RequestFailure as error:
            if error.status not in (None, 404, 502, 503, 504):
                raise
        time.sleep(3)
    raise ValueError('Managed source and runtime boot were not verified')


TRACED_ROUTES = (
    '/api/health', '/admin/api/session', '/portfolio', '/arquivo', '/contato', '/',
    '/admin', '/admin/studio', '/admin/api/studio', '/admin/api/me', '/media/:id/card', '/ensaios/:qa',
    '/admin/api/uploads/:id/complete',
)


def trace_correlation(event):
    request_id = event.get('requestId')
    if isinstance(request_id, str) and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', request_id):
        return {'requestId': request_id}
    return {}


def runtime_receipts(operation, phase):
    try:
        logs = operation.api(phase + 'RuntimeLogs', SITE + '/runtime-logs?period=1h&limit=1000')
        # Decode strings recursively without publishing arbitrary logs.
        strings = []
        def visit(value):
            if isinstance(value,str): strings.append(value)
            elif isinstance(value,dict):
                for item in value.values(): visit(item)
            elif isinstance(value,list):
                for item in value: visit(item)
        visit(logs)
        receipts = []
        for value in strings:
            for line in value.splitlines():
                prefix = 'PUNCTUM_MANAGED_QA '
                position = line.find(prefix)
                if position < 0: continue
                try: receipt = json.JSONDecoder().raw_decode(line[position+len(prefix):])[0]
                except ValueError: continue
                if (receipt.get('schema') == 1 and receipt.get('sourceSha') == os.environ.get('GITHUB_SHA') and
                    receipt.get('manifest',{}).get('scope') == 'SYNTHETIC_QA_ONLY'):
                    receipts.append(receipt)
        operation.report.setdefault('runtimeReceipts',{})[phase] = receipts
        safe_trace = []
        for chunk in strings:
            for line in chunk.splitlines():
                prefix = 'PUNCTUM_QA_TRACE '
                index = line.find(prefix)
                if index < 0: continue
                try: event = json.JSONDecoder().raw_decode(line[index+len(prefix):])[0]
                except ValueError: continue
                if not isinstance(event,dict): continue
                if event.get('route') not in TRACED_ROUTES: continue
                if event.get('event') not in ('start','finish','abort'): continue
                record = {'event':event['event'],'route':event['route']}
                if event['event'] == 'finish' and type(event.get('status')) is int and 100 <= event['status'] <= 599:
                    record['status'] = event['status']
                if event['event'] != 'start' and type(event.get('ms')) is int and 0 <= event['ms'] <= 120000:
                    record['ms'] = event['ms']
                if event['route'] == '/admin/api/session' and event['event'] == 'abort':
                    for field in ('requestComplete', 'requestReadableEnded'):
                        if type(event.get(field)) is bool:
                            record[field] = event[field]
                record.update(trace_correlation(event))
                safe_trace.append(record)
        operation.report.setdefault('runtimeRouteTrace',{})[phase] = safe_trace[-140:]
        worker_phase = []
        for chunk in strings:
            for line in chunk.splitlines():
                prefix = 'PUNCTUM_QA_PHASE '
                index = line.find(prefix)
                if index < 0: continue
                try: event = json.JSONDecoder().raw_decode(line[index+len(prefix):])[0]
                except ValueError: continue
                if not isinstance(event,dict) or event.get('route') not in TRACED_ROUTES: continue
                phase_name = event.get('phase')
                start_phase = phase_name in ('start', 'body-start')
                if phase_name not in ('start', 'returned', 'error', 'pending'):
                    body_phase = event['route'] == '/admin/api/session' and phase_name in (
                        'body-start', 'body-read', 'body-error')
                    studio_phase = event['route'] in ('/admin', '/admin/studio', '/admin/api/studio', '/admin/api/me') and phase_name in (
                        'session-start', 'session-key-ready', 'session-verified', 'session-end',
                        'studio-draft-start', 'studio-draft-end', 'studio-history-end', 'render-start', 'render-end')
                    media_phase = event['route'] in ('/media/:id/card', '/admin/api/uploads/:id/complete') and phase_name in (
                        'media-original-start', 'media-original-end', 'media-body-start',
                        'media-body-end', 'media-sharp-start', 'media-sharp-end',
                        'media-metadata-start', 'media-metadata-end', 'media-decode-start', 'media-decode-end')
                    public_render_phase = event['route'] in ('/', '/portfolio', '/arquivo', '/contato', '/ensaios/:qa') and phase_name in (
                        'render-start', 'render-end')
                    upload_phase = event['route'] == '/admin/api/uploads/:id/complete' and phase_name in (
                        'session-start', 'session-key-ready', 'session-verified', 'session-end',
                        'rate-limit-start', 'rate-limit-end', 'upload-json-start', 'upload-json-end',
                        'upload-validation-start', 'upload-validation-end', 'upload-commit-start', 'upload-commit-end')
                    if not (body_phase or studio_phase or media_phase or public_render_phase or upload_phase):
                        continue
                record = {'phase':event['phase'],'route':event['route']}
                if event['phase'] == 'returned' and type(event.get('status')) is int and 100 <= event['status'] <= 599:
                    record['status'] = event['status']
                if not start_phase and type(event.get('ms')) is int and 0 <= event['ms'] <= 120000:
                    record['ms'] = event['ms']
                if not start_phase and 'ms' not in record: continue
                loop_busy = event.get('loopBusyPct')
                if phase_name in ('returned', 'error', 'pending') and type(loop_busy) is int and 0 <= loop_busy <= 100:
                    record['loopBusyPct'] = loop_busy
                cpu_ms = event.get('cpuMs')
                if phase_name in ('returned', 'error', 'pending') and type(cpu_ms) is int and 0 <= cpu_ms <= 120000:
                    record['cpuMs'] = cpu_ms
                record.update(trace_correlation(event))
                worker_phase.append(record)
        operation.report.setdefault('runtimeWorkerPhase',{})[phase] = worker_phase[-200:]
        # Synthetic QA receipts include a successful SIGKILL regression case.
        # Exclude receipt lines before classifying actual process failures.
        content = '\n'.join(line for value in strings for line in value.splitlines()
                            if 'PUNCTUM_MANAGED_QA ' not in line)
        operation.report.setdefault('runtimeSignals',{})[phase] = {
            'outOfMemory':any(x in content.lower() for x in ('out of memory','heap limit','sigkill','enomem')),
            'errorKinds':sorted(set(re.findall(r'\b(?:[A-Za-z]+Error|ERR_[A-Z_]+)\b',content)))[:20],
        }
    except (RequestFailure,ValueError,TypeError):
        operation.report.setdefault('runtimeReceipts',{})[phase] = {'status':'NOT_VERIFIED'}
    operation.save()


def functional(operation, root, phase, environment):
    child_env = {k:v for k,v in os.environ.items() if k != 'HOSTINGER_API'}
    child_env.update(environment)
    completed = subprocess.run(['node','scripts/hostinger-managed-functional.mjs',phase], cwd=root,
                               env=child_env, capture_output=True, text=True, timeout=300)
    if completed.returncode:
        # Node assertions print only fixed check labels; still keep arbitrary stderr out of artifacts.
        known = ['managed authentication status','managed cookie flags','managed original upload',
                 'managed HTML','managed CSP','managed noindex','managed native Sharp WebP',
                 'managed contact create','managed browser layout','managed browser navigation',
                 'managed upload intent','managed upload complete','managed cover',
                 'publish synthetic fixture','create synthetic draft','request-time synthetic album SSR']
        operation.report['functionalFailure'] = {'phase':phase,'exitCode':completed.returncode,
            'check':next((label for label in known if label in completed.stderr),'UNCLASSIFIED'),
            'stderrSha256':digest(completed.stderr.encode())}
        failure_file = root / 'outputs/hostinger-managed-functional' / ('failure-' + phase + '.json')
        if failure_file.is_file():
            operation.report['functionalFailure']['diagnostic'] = json.loads(failure_file.read_text())
        raise ValueError('Managed functional QA failed')
    report = json.loads(completed.stdout.strip().splitlines()[-1])
    operation.report.setdefault('functional',{})[phase] = report
    operation.save()
    return report


def recover_candidate_probe(operation, root):
    """Recover only the known QA probe; verify PUTs even after ambiguous 500s.

    A failed settings write can be committed despite an HTTP 500. Always read
    back the final state. Do not spend another build when the original probe
    never changed, and never overwrite an unknown third-party deployment.
    """
    history = operation.api('historyBeforeRollback',SITE + '/builds')
    if not isinstance(history,list) or not history or any(
            row.get('state') in ('pending','running') for row in history):
        raise ValueError('Build history is unavailable or still active')
    current = history[0]
    known_builds = {row['uuid'] for row in operation.report.get('managedBuilds',[])
                    if row.get('phase') in ('candidate','candidateRebuild')}
    if current.get('uuid') != operation.expected_build and current.get('uuid') not in known_builds:
        raise ValueError('An unknown build replaced the probe; manual reconciliation required')

    environment_before = operation.api('rollbackEnvironmentBefore',SITE + '/builds/settings/env')
    if not isinstance(environment_before,list):
        raise ValueError('Cannot inspect QA environment before rollback')
    actual_keys = sorted(row.get('key') for row in environment_before)
    if actual_keys and actual_keys != sorted(operation.report.get('environmentKeys',[])):
        raise ValueError('Unexpected environment keys; refusing destructive replacement')
    if environment_before:
        try:
            put(operation,'rollbackEnvironment',SITE + '/builds/settings/env',{'env_vars':[]})
        except RequestFailure as error:
            if error.status not in (None,500,502,503,504):
                raise
            operation.report['rollbackEnvironmentWriteUncertain'] = error.status
    environment_after = confirm_environment_keys(operation, 'rollbackEnvironmentVerified', set(), set(actual_keys))

    settings_before = operation.api('rollbackSettingsBefore',SITE + '/builds/settings')
    candidate_settings = operation.report.get('candidateSettings')
    if (not isinstance(settings_before,dict) or
            (any(settings_before.get(k) != v for k,v in PROBE_SETTINGS.items()) and
             (not isinstance(candidate_settings,dict) or
              any(settings_before.get(k) != v for k,v in candidate_settings.items())))):
        raise ValueError('Unknown build settings; refusing replacement')
    if any(settings_before.get(k) != v for k,v in PROBE_SETTINGS.items()):
        try:
            put(operation,'rollbackSettings',SITE + '/builds/settings',PROBE_SETTINGS)
        except RequestFailure as error:
            if error.status not in (None,500,502,503,504):
                raise
            operation.report['rollbackSettingsWriteUncertain'] = error.status
    check_probe_settings(operation.api('rollbackSettingsVerified',SITE + '/builds/settings'),
                         environment_after)

    if current.get('uuid') == operation.expected_build:
        if current.get('state') != 'completed':
            raise ValueError('Original probe build is not complete')
        operation.health('probeRestored')
        operation.report['probeRollback'] = {
            'status':'VERIFIED','mode':'NO_REBUILD_REQUIRED','build':current['uuid']}
        return

    if current.get('state') not in ('completed','failed'):
        raise ValueError('Candidate build is not in a recoverable terminal state')
    name = operation.upload_archive(probe_archive(root),'punctum-recovery-v2-')
    identifier = build(operation,name,PROBE_SETTINGS,'probeRollback')
    operation.health('probeRestored')
    check_probe_settings(operation.api('rollbackSettingsVerifiedAfterBuild',SITE + '/builds/settings'),
                         operation.api('rollbackEnvironmentVerifiedAfterBuild',SITE + '/builds/settings/env'))
    operation.report['probeRollback'] = {'status':'VERIFIED','mode':'REBUILD','build':identifier}


def execute_candidate(root, request):
    operation = Recovery(root,'prepare',request['expected_build_uuid'])
    operation.report['action'] = 'candidate'
    settings = json.loads((root/'services/punctum-hostinger-node/hostinger-settings.candidate.json').read_text())
    baseline_settings = None
    modified = False
    failed = False
    try:
        probe_archive(root)
        operation.health('probeBefore')
        baseline_settings = operation.api('settingsBefore',SITE + '/builds/settings')
        check_probe_settings(baseline_settings,operation.api('environmentBefore',SITE + '/builds/settings/env'))
        history = operation.api('historyBefore',SITE + '/builds')
        if not history or history[0].get('uuid') != request['expected_build_uuid'] or any(row.get('state') in ('pending','running') for row in history):
            raise ValueError('Reconcile changed provider state before candidate deployment')
        tracked = subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().strip('\0').split('\0')
        archive, files = candidate_archive(root,tracked)
        operation.report['candidateArchive'] = {'sha256':digest(archive),'bytes':len(archive),'files':len(files),
                                               'fileManifestSha256':digest(json.dumps(files,sort_keys=True).encode())}
        name = operation.upload_archive(archive,'punctum-node-candidate-')
        password = secrets.token_hex(24)
        environment = {'PUNCTUM_QA_ORIGIN':'https://' + DOMAIN,
            'PUNCTUM_QA_DB_FILE':'/home/u571409090/punctum-qa-private-20261112/application.sqlite',
            'PUNCTUM_QA_ADMIN_EMAIL':'admin@example.test',
            'PUNCTUM_QA_ADMIN_PASSWORD_HASH':hashlib.sha256(password.encode()).hexdigest(),
            'PUNCTUM_QA_ADMIN_SESSION_SECRET':secrets.token_hex(32),
            'PUNCTUM_QA_MANAGED_BOOTSTRAP':'1','PUNCTUM_QA_SOURCE_SHA':os.environ['GITHUB_SHA']}
        operation.report['environmentKeys'] = sorted(environment)
        operation.report['candidateSettings'] = settings
        modified = True
        put(operation,'candidateSettingsWrite',SITE + '/builds/settings',settings)
        operation.report['settingsWrites'] += 1
        write_candidate_environment(operation,environment)
        build(operation,name,settings,'candidate')
        initial_boot = ready(operation,'candidateReady')
        functional_env = {**environment,'PUNCTUM_QA_TEST_PASSWORD':password}
        initial = functional(operation,root,'exercise',functional_env)
        runtime_receipts(operation,'initial')
        functional(operation,root,'browser',functional_env)
        operation.api('candidateRestart',SITE + '/server/restart',{})
        restarted_boot = ready(operation,'candidateAfterRestart', previous_boot=initial_boot)
        after_restart = functional(operation,root,'after-restart',functional_env)
        if after_restart['thumbnailSha256'] != initial['thumbnailSha256']:
            raise ValueError('Managed media changed after restart')
        runtime_receipts(operation,'afterRestart')
        name = operation.upload_archive(archive,'punctum-node-candidate-')
        build(operation,name,settings,'candidateRebuild')
        rebuilt_boot = ready(operation,'candidateAfterRebuild', previous_boot=restarted_boot)
        if rebuilt_boot == initial_boot:
            raise ValueError('Rebuild returned the original runtime boot')
        after_rebuild = functional(operation,root,'after-rebuild',functional_env)
        if after_rebuild['thumbnailSha256'] != initial['thumbnailSha256']:
            raise ValueError('Managed media changed after rebuild')
        runtime_receipts(operation,'afterRebuild')
        functional(operation,root,'archive',functional_env)
        current = operation.api('settingsAfter',SITE + '/builds/settings')
        if any(current.get(k) != v for k,v in settings.items()):
            raise ValueError('Saved candidate settings drifted')
        env_after = operation.api('environmentAfter',SITE + '/builds/settings/env')
        if sorted(row.get('key') for row in env_after) != sorted(environment):
            raise ValueError('Candidate environment keys drifted')
        operation.report['status'] = 'MANAGED_SYNTHETIC_NODE_QA_VERIFIED'
    except (RequestFailure,ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError) as error:
        failed = True
        operation.report['status'] = 'BLOCKED_OR_FAILED'
        operation.report['failure'] = {'type':type(error).__name__}
        if isinstance(error,RequestFailure): operation.report['failure'].update(operation=error.label,status=error.status)
        if modified: runtime_receipts(operation,'beforeRollback')
    finally:
        if failed and modified:
            try:
                recover_candidate_probe(operation, root)
            except (RequestFailure,ValueError,KeyError,TypeError) as error:
                operation.report['probeRollback'] = {'status':'NOT_VERIFIED','type':type(error).__name__}
                if isinstance(error,RequestFailure): operation.report['probeRollback'].update(operation=error.label,httpStatus=error.status)
        operation.save()
        print(json.dumps(operation.report,indent=2))
    if failed: raise SystemExit(1)
