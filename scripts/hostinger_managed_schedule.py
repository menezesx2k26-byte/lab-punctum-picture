"""Configure and observe only Punctum's jobs on its imported staging dataset."""
import json
import os
import pathlib
import re
import time
from hostinger_managed_qa import DOMAIN, SITE, USERNAME, Recovery, RequestFailure

CRON = f'/accounts/{USERNAME}/cron-jobs'
DEPLOYMENT = f'/home/{USERNAME}/domains/{DOMAIN}/hbuilds'


def command(mode):
    assert mode in ('hourly', 'daily')
    result = (f'/opt/alt/alt-nodejs24/root/bin/node --env-file={DEPLOYMENT}/config/.env '
              f'{DEPLOYMENT}/current/nodejs/cron.mjs {mode}')
    assert len(result) <= 255 and '%' not in result
    return result


def job_receipt(value, mode):
    if isinstance(value, str):
        for line in value.splitlines():
            try:
                result = json.loads(line)
            except ValueError:
                continue
            if result.get('status') == 'CANDIDATE_SCHEDULED_JOB_PASS' and result.get('cronMode') == mode:
                return result
    elif isinstance(value, dict):
        return next((receipt for child in value.values() if (receipt := job_receipt(child, mode))), None)
    elif isinstance(value, list):
        return next((receipt for child in value if (receipt := job_receipt(child, mode))), None)
    return None


def execute(root):
    config = json.loads((root / 'requests/punctum-managed-production.json').read_text())
    assert config['action'] == 'schedule-managed' and config['domain'] == DOMAIN
    op = Recovery(root, 'prepare', config['expected_build_uuid'])
    op.output = root / 'outputs/punctum-managed-production'
    op.output.mkdir(parents=True, exist_ok=True)
    op.report.update(action='schedule-managed', scope='imported-managed-staging-dataset', dnsTouched=False,
                     sourceWrites=0, jobs={}, status='IN_PROGRESS')
    try:
        history = op.api('history', SITE + '/builds')
        assert history[0]['uuid'] == config['expected_build_uuid'] and history[0]['state'] == 'completed'
        assert not any(row.get('state') in ('pending', 'running') for row in history)
        status, headers, raw = op.request('originHealth', 'https://' + DOMAIN + '/api/health')
        assert status == 200 and json.loads(raw).get('ok') and 'noindex' in headers.get('X-Robots-Tag', '')
        assert headers.get('X-Punctum-QA-Source') == config['deployed_source_sha']
        schedules = config['cron_schedules']
        assert set(schedules) == {'hourly', 'daily'}
        assert re.fullmatch(r'\d{1,2} \* \* \* \*', schedules['hourly'])
        assert re.fullmatch(r'\d{1,2} \d{1,2} \* \* \*', schedules['daily'])
        for mode, schedule in schedules.items():
            cmd = command(mode)
            before = op.api('cronBefore' + mode, CRON)
            assert isinstance(before, list)
            owned = [row for row in before if row.get('command') == cmd]
            assert len(owned) <= 1
            assert not any(DOMAIN in row.get('command', '') and row.get('command') != cmd
                and row.get('command', '').endswith('/cron.mjs ' + mode) for row in before), 'Punctum job already scheduled elsewhere'
            if owned:
                assert owned[0].get('time') == schedule, 'Existing Punctum schedule differs'
                job = owned[0]
            else:
                try:
                    job = op.api('create' + mode, CRON, {'time': schedule, 'command': cmd})
                except RequestFailure as error:
                    if error.status not in (None, 500, 502, 503, 504):
                        raise
                    matches = [row for row in op.api('reconcile' + mode, CRON)
                               if row.get('command') == cmd and row.get('time') == schedule]
                    assert len(matches) == 1, 'Job creation not reconciled'
                    job = matches[0]
            assert isinstance(job.get('uid'), str) and re.fullmatch(r'[A-Za-z0-9_-]{3,100}', job['uid'])
            op.report['jobs'][mode] = {'uid': job['uid'], 'scheduleUtc': schedule, 'command': cmd}
            op.save()
        deadline = time.monotonic() + 660
        pending = set(schedules)
        while pending and time.monotonic() < deadline:
            for mode in sorted(pending):
                try:
                    output = op.api('output' + mode, CRON + '/' + op.report['jobs'][mode]['uid'] + '/output')
                except RequestFailure as error:
                    if error.status not in (None, 404, 500, 502, 503, 504):
                        raise
                    continue
                receipt = job_receipt(output, mode)
                if receipt:
                    assert receipt.get('environment') == 'staging', 'Wrong scheduled dataset'
                    op.report['jobs'][mode]['receipt'] = receipt
                    pending.remove(mode)
                    op.save()
                else:
                    codes = sorted(set(re.findall(r'\b(?:MANAGED_[A-Z0-9_]+|CANDIDATE_[A-Z0-9_]+|ERR_[A-Z0-9_]+|ENOENT|EACCES)\b', json.dumps(output))))
                    if codes:
                        op.report['jobs'][mode]['errors'] = codes
                        raise ValueError('Managed cron failed')
            if pending:
                time.sleep(12)
        assert not pending, 'Scheduled execution not yet observed'
        op.report['status'] = 'MANAGED_STAGING_SCHEDULES_VERIFIED'
    except Exception as error:
        op.report['status'] = 'SCHEDULES_NOT_VERIFIED'
        op.report['failure'] = {'type': type(error).__name__, 'label': getattr(error, 'label', None),
            'message': str(error)[:160] if isinstance(error, (AssertionError, ValueError)) else None}
    finally:
        op.save()
        print(json.dumps(op.report, indent=2))
    if op.report['status'] != 'MANAGED_STAGING_SCHEDULES_VERIFIED':
        raise SystemExit(1)


if __name__ == '__main__':
    execute(pathlib.Path.cwd())
