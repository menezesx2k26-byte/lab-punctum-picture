"""Deploy and exercise only the existing synthetic Hostinger QA destination."""
import hashlib
import io
import json
import os
import re
import secrets
import subprocess
import time
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


def ready(operation, phase):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            status, headers, raw = operation.request(phase, 'https://' + DOMAIN + '/api/health')
            if status == 200 and 'noindex' in headers.get('X-Robots-Tag',''):
                return
        except RequestFailure as error:
            if error.status not in (None,404,502,503,504):
                raise
        time.sleep(3)
    raise ValueError('Managed candidate did not become ready')


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
        put(operation,'candidateEnvironmentWrite',SITE + '/builds/settings/env',{'env_vars':[{'key':k,'value':v} for k,v in environment.items()]})
        operation.report['environmentWrites'] += 1
        build(operation,name,settings,'candidate')
        ready(operation,'candidateReady')
        functional_env = {**environment,'PUNCTUM_QA_TEST_PASSWORD':password}
        initial = functional(operation,root,'exercise',functional_env)
        runtime_receipts(operation,'initial')
        functional(operation,root,'browser',functional_env)
        operation.api('candidateRestart',SITE + '/server/restart',{})
        ready(operation,'candidateAfterRestart')
        after_restart = functional(operation,root,'after-restart',functional_env)
        if after_restart['thumbnailSha256'] != initial['thumbnailSha256']:
            raise ValueError('Managed media changed after restart')
        runtime_receipts(operation,'afterRestart')
        name = operation.upload_archive(archive,'punctum-node-candidate-')
        build(operation,name,settings,'candidateRebuild')
        ready(operation,'candidateAfterRebuild')
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
                history = operation.api('historyBeforeRollback',SITE + '/builds')
                if any(row.get('state') in ('pending','running') for row in history):
                    raise ValueError('Build still active; no competing rollback is submitted')
                put(operation,'rollbackEnvironment',SITE + '/builds/settings/env',{'env_vars':[]})
                put(operation,'rollbackSettings',SITE + '/builds/settings',PROBE_SETTINGS)
                name = operation.upload_archive(probe_archive(root),'punctum-recovery-v2-')
                identifier = build(operation,name,PROBE_SETTINGS,'probeRollback')
                operation.health('probeRestored')
                check_probe_settings(operation.api('rollbackSettingsVerified',SITE + '/builds/settings'),
                                     operation.api('rollbackEnvironmentVerified',SITE + '/builds/settings/env'))
                operation.report['probeRollback'] = {'status':'VERIFIED','build':identifier}
            except (RequestFailure,ValueError,KeyError,TypeError) as error:
                operation.report['probeRollback'] = {'status':'NOT_VERIFIED','type':type(error).__name__}
                if isinstance(error,RequestFailure): operation.report['probeRollback'].update(operation=error.label,httpStatus=error.status)
        operation.save()
        print(json.dumps(operation.report,indent=2))
    if failed: raise SystemExit(1)
