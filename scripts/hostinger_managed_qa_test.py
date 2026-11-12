import io
import shutil
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from pathlib import Path

import hostinger_managed_qa as qa
from hostinger_candidate_qa import candidate_archive


class RecoveryContractTests(unittest.TestCase):
    def test_candidate_source_excludes_environment_databases_and_operational_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = ['services/punctum-hostinger-node/server.mjs','app/page.tsx','app/.env','public/state.sqlite','outputs/report.json','.git/config']
            for path in paths:
                target = root / path
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text('fixture')
            archive, files = candidate_archive(root, paths)
            with zipfile.ZipFile(io.BytesIO(archive)) as source:
                self.assertEqual(set(source.namelist()), {'services/punctum-hostinger-node/server.mjs','app/page.tsx'})
            self.assertEqual(len(files),2)

    def test_candidate_source_never_follows_a_tracked_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'app').mkdir()
            (root/'private.txt').write_text('private fixture')
            (root/'app/leak.ts').symlink_to(root/'private.txt')
            with self.assertRaisesRegex(ValueError,'symlink'):
                candidate_archive(root,['app/leak.ts'])

    def test_recovery_archive_matches_the_verified_drive_backup(self):
        archive = qa.probe_archive(Path(__file__).resolve().parents[1])
        self.assertEqual(len(archive), 2384)
        self.assertEqual(qa.digest(archive), "918755f5d4c1ebb1064cafceb4dfbfc20491a309d47147c6fe6e57a2731a75ca")
        with zipfile.ZipFile(io.BytesIO(archive)) as source:
            self.assertEqual(source.namelist(), ["README.md", "app.mjs", "package.json", "server.mjs"])

    def test_changed_probe_cannot_be_mistaken_for_a_recovery_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "services/punctum-hostinger-qa"
            shutil.copytree(Path(__file__).resolve().parents[1] / "services/punctum-hostinger-qa", target)
            (target / "app.mjs").write_text("different probe")
            with self.assertRaisesRegex(ValueError, "backup digest"):
                qa.probe_archive(root)

    def test_upload_credentials_cannot_be_sent_to_an_unrelated_host(self):
        for url in ["http://srv2282-files.hstgr.io/upload", "https://hstgr.io.attacker.test/upload", "https://user:password@srv2282-files.hstgr.io/upload", "https://srv2282-files.hstgr.io/upload?token=secret"]:
            with self.assertRaises(ValueError):
                qa.upload_base(url)
        self.assertEqual(qa.upload_base("https://srv2282-files.hstgr.io/scope/upload/"), "https://srv2282-files.hstgr.io/scope/upload")

    def test_live_settings_must_still_describe_only_the_disposable_probe(self):
        qa.check_probe_settings(dict(qa.PROBE_SETTINGS), [])
        for field, value in [("entry_file", "other.mjs"), ("build_script", "deploy"), ("node_version", 22)]:
            settings = dict(qa.PROBE_SETTINGS)
            settings[field] = value
            with self.assertRaises(ValueError):
                qa.check_probe_settings(settings, [])
        with self.assertRaises(ValueError):
            qa.check_probe_settings(dict(qa.PROBE_SETTINGS), [{"name": "UNEXPECTED_ENV"}])

    def test_transient_read_is_retried_but_a_build_post_is_never_retried(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            calls = []
            def failing_read(label, url, method, headers, body):
                calls.append(method)
                recovery.report['checks'][label] = {'status': 500}
                raise qa.RequestFailure(label, 500)
            with patch.object(recovery, 'request', side_effect=failing_read), patch.object(qa.time, 'sleep'):
                with self.assertRaises(qa.RequestFailure):
                    recovery.api('read', '/read')
                self.assertEqual(calls, ['GET', 'GET', 'GET'])
                calls.clear()
                with self.assertRaises(qa.RequestFailure):
                    recovery.api('build', '/build', {'source_type': 'archive'})
                self.assertEqual(calls, ['POST'])

    def test_inspection_cannot_accept_an_arbitrary_archive_or_path(self):
        for name in ['../app.zip', 'production.zip', 'https://example.test/app.zip', None]:
            with self.assertRaises(ValueError):
                qa.Recovery(Path('.'), 'inspect-upload', 'expected', name)

    def test_restore_keeps_proven_entrypoint_when_autodetection_suggests_the_wrong_one(self):
        name = 'punctum-recovery-v2-' + 'a' * 32 + '.zip'
        build_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            root = Path(directory)
            shutil.copytree(Path(__file__).resolve().parents[1] / 'services/punctum-hostinger-qa', root / 'services/punctum-hostinger-qa')
            recovery = qa.Recovery(root, 'restore-probe', 'expected', name)
            posts = []
            def api(label, path, payload=None):
                if payload is not None:
                    posts.append((path, payload))
                    return {'uuid': build_id}
                if label in ('settingsBefore', 'settingsAfter'):
                    return dict(qa.PROBE_SETTINGS)
                if label in ('environmentBefore', 'environmentAfter'):
                    return []
                if label == 'buildsBefore':
                    return [{'uuid': 'expected', 'state': 'completed'}]
                if label == 'uploadedFileInventory':
                    return {'items': [{'name': name}]}
                if label == 'archiveDetection':
                    return {'node_version': 22, 'entry_file': 'app.mjs'}
                if label == 'restoreBuildState':
                    return {'uuid': build_id, 'state': 'completed', 'options': posts[0][1]}
                if label == 'restoreBuildLogs':
                    return []
                self.fail('Unexpected API operation: ' + label)
            with patch.object(recovery, 'api', side_effect=api), patch.object(recovery, 'health'):
                recovery.run()
            self.assertEqual(len(posts), 1)
            self.assertEqual(posts[0][1]['node_version'], 24)
            self.assertEqual(posts[0][1]['entry_file'], 'server.mjs')
            self.assertEqual(posts[0][1]['source_options']['archive_path'], name)
            self.assertEqual(recovery.report['status'], 'IDENTICAL_PROBE_RECOVERY_VERIFIED_IN_PLACE')


if __name__ == "__main__":
    unittest.main()
