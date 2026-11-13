import io
import shutil
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from pathlib import Path

import hostinger_managed_qa as qa
from hostinger_candidate_qa import candidate_archive, runtime_receipts, recover_candidate_probe, write_candidate_environment


class RecoveryContractTests(unittest.TestCase):
    def test_environment_http_500_can_proceed_only_with_exact_qa_key_readback(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            desired = {"PUNCTUM_QA_ORIGIN":"https://qa.example.test", "PUNCTUM_QA_SOURCE_SHA":"test-sha"}
            keys = [{"key":name,"value":"********"} for name in desired]
            with patch("hostinger_candidate_qa.put", side_effect=qa.RequestFailure("candidateEnvironmentWrite",500)) as write, patch.object(recovery, "api", return_value=keys) as readback:
                write_candidate_environment(recovery, desired)
            write.assert_called_once()
            readback.assert_called_once()
            self.assertEqual(recovery.report["environmentWrites"],0)
            self.assertEqual(recovery.report["candidateEnvironmentAcceptance"], "PROVISIONAL_KEYS_ONLY")
            self.assertEqual(recovery.report["candidateEnvironmentKeyCount"],2)

    def test_environment_http_500_rejects_partial_masked_key_readback(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            with patch("hostinger_candidate_qa.put", side_effect=qa.RequestFailure("candidateEnvironmentWrite",500)), patch.object(recovery, "api", return_value=[{"key":"PUNCTUM_QA_ORIGIN"}]):
                with self.assertRaisesRegex(ValueError, "environment key"):
                    write_candidate_environment(recovery, {"PUNCTUM_QA_ORIGIN":"synthetic","PUNCTUM_QA_SOURCE_SHA":"test"})
            self.assertEqual(recovery.report["environmentWrites"],0)

    def test_environment_write_nontransient_error_must_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            with patch("hostinger_candidate_qa.put", side_effect=qa.RequestFailure("candidateEnvironmentWrite",403)), patch.object(recovery, "api") as readback:
                with self.assertRaises(qa.RequestFailure):
                    write_candidate_environment(recovery, {"PUNCTUM_QA_ORIGIN":"synthetic"})
            readback.assert_not_called()

    def test_environment_acknowledged_write_does_not_need_provisional_readback(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            with patch("hostinger_candidate_qa.put") as write, patch.object(recovery, "api") as readback:
                write_candidate_environment(recovery, {"PUNCTUM_QA_ORIGIN":"synthetic"})
            write.assert_called_once()
            readback.assert_not_called()
            self.assertEqual(recovery.report["environmentWrites"],1)
            self.assertEqual(recovery.report["candidateEnvironmentAcceptance"],"ACKNOWLEDGED")

    def test_candidate_failure_before_build_restores_stored_settings_without_redeploy(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            recovery.report["environmentKeys"] = ["PUNCTUM_QA_ORIGIN"]
            settings = {**qa.PROBE_SETTINGS, "build_script": "build:hostinger:qa"}
            recovery.report["candidateSettings"] = dict(settings)
            history = [{"uuid": "baseline", "state": "completed"}]
            calls = []
            def api(label, path, payload=None):
                if label == "historyBeforeRollback": return history
                if "settings/env" in path: return []
                if "settings" in path: return settings
                raise AssertionError(label)
            def put_settings(operation, label, path, payload):
                calls.append(label)
                self.assertEqual(label, "rollbackSettings")
                settings.update(payload)
            with patch.object(recovery, "api", side_effect=api), patch.object(recovery, "health", return_value=({"service":"probe"},{})) as health, patch("hostinger_candidate_qa.put", side_effect=put_settings), patch("hostinger_candidate_qa.build") as build:
                recover_candidate_probe(recovery, Path(directory))
            self.assertEqual(calls, ["rollbackSettings"])
            health.assert_called_once()
            build.assert_not_called()
            self.assertEqual(recovery.report["probeRollback"]["status"], "VERIFIED")
            self.assertEqual(recovery.report["probeRollback"]["mode"], "NO_REBUILD_REQUIRED")

    def test_candidate_recovery_reconciles_ambiguous_500_with_verified_readback(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            recovery.report["environmentKeys"] = ["PUNCTUM_QA_ORIGIN"]
            env = [{"key":"PUNCTUM_QA_ORIGIN","value":"********"}]
            settings = {**qa.PROBE_SETTINGS, "build_script": "build:hostinger:qa"}
            recovery.report["candidateSettings"] = dict(settings)
            def api(label, path, payload=None):
                if label == "historyBeforeRollback": return [{"uuid":"baseline","state":"completed"}]
                if path.endswith("/settings/env"): return env
                if path.endswith("/settings"): return settings
                raise AssertionError(label)
            def ambiguous_put(operation, label, path, payload):
                if label == "rollbackEnvironment":
                    env.clear()
                    raise qa.RequestFailure(label, 500)
                if label == "rollbackSettings":
                    settings.update(payload)
                    raise qa.RequestFailure(label, 500)
                raise AssertionError(label)
            with patch.object(recovery, "api", side_effect=api), patch.object(recovery, "health", return_value=({},{})), patch("hostinger_candidate_qa.put", side_effect=ambiguous_put), patch("hostinger_candidate_qa.build") as build:
                recover_candidate_probe(recovery, Path(directory))
            build.assert_not_called()
            self.assertEqual(recovery.report["probeRollback"]["status"], "VERIFIED")

    def test_candidate_recovery_refuses_to_delete_unrelated_environment(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            recovery.report["environmentKeys"] = ["PUNCTUM_QA_ORIGIN"]
            def api(label, path, payload=None):
                if label == "historyBeforeRollback": return [{"uuid":"baseline","state":"completed"}]
                if path.endswith("/settings/env"): return [{"key":"UNRELATED_ENV"}]
                raise AssertionError(label)
            with patch.object(recovery, "api", side_effect=api), patch("hostinger_candidate_qa.put") as put_mock:
                with self.assertRaisesRegex(ValueError, "environment"):
                    recover_candidate_probe(recovery, Path(directory))
            put_mock.assert_not_called()

    def test_candidate_recovery_rebuilds_probe_only_for_an_acknowledged_candidate(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            recovery.report["managedBuilds"] = [{"phase":"candidate","uuid":"candidate"}]
            def api(label, path, payload=None):
                if label == "historyBeforeRollback": return [{"uuid":"candidate","state":"completed"}]
                if path.endswith("/settings/env"): return []
                if path.endswith("/settings"): return dict(qa.PROBE_SETTINGS)
                raise AssertionError(label)
            with patch.object(recovery, "api", side_effect=api), patch.object(recovery, "health", return_value=({},{})), patch.object(recovery, "upload_archive", return_value="recovery.zip") as upload, patch("hostinger_candidate_qa.probe_archive", return_value=b"backup"), patch("hostinger_candidate_qa.build", return_value="restored-build") as build:
                recover_candidate_probe(recovery, Path(directory))
            upload.assert_called_once_with(b"backup","punctum-recovery-v2-")
            build.assert_called_once()
            self.assertEqual(recovery.report["probeRollback"], {
                "status":"VERIFIED","mode":"REBUILD","build":"restored-build"})

    def test_candidate_recovery_refuses_unknown_concurrent_deployment(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "baseline")
            recovery.report["managedBuilds"] = [{"phase":"candidate","uuid":"candidate"}]
            with patch.object(recovery, "api", return_value=[{"uuid":"someone-else","state":"completed"}]), patch("hostinger_candidate_qa.put") as put_mock, patch("hostinger_candidate_qa.build") as build:
                with self.assertRaisesRegex(ValueError, "unknown build"):
                    recover_candidate_probe(recovery, Path(directory))
            put_mock.assert_not_called()
            build.assert_not_called()
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

    def test_expected_sigkill_regression_receipt_is_not_reported_as_runtime_oom(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only", "GITHUB_SHA": "test-sha"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            receipt = {"schema": 1, "sourceSha": "test-sha",
                       "manifest": {"scope": "SYNTHETIC_QA_ONLY"},
                       "transactionChecks": {"cases": ["SIGKILL/uncommitted rollback/integrity/FK"]}}
            lines = {"logs": [{"message": "PUNCTUM_MANAGED_QA " + qa.json.dumps(receipt)}]}
            with patch.object(recovery, "api", return_value=lines):
                runtime_receipts(recovery, "initial")
            self.assertEqual(len(recovery.report["runtimeReceipts"]["initial"]), 1)
            self.assertFalse(recovery.report["runtimeSignals"]["initial"]["outOfMemory"])

    def test_actual_runtime_oom_line_remains_detectable(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            lines = {"logs": [{"message": "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"}]}
            with patch.object(recovery, "api", return_value=lines):
                runtime_receipts(recovery, "initial")
            self.assertTrue(recovery.report["runtimeSignals"]["initial"]["outOfMemory"])

    def test_candidate_upload_is_chunked_with_verified_offsets(self):
        chunk = 4 * 1024 * 1024
        archive = b"x" * (2 * chunk + 7)
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            received = bytearray()
            patches = []
            def fake_api(label, path, payload=None):
                self.assertEqual(label, "uploadCredentials")
                return {"url": "https://srv2282-files.hstgr.io/files", "auth_key": "fake", "rest_auth_key": "fake"}
            def fake_request(label, url, method="GET", headers=None, body=None):
                if method == "POST":
                    self.assertEqual(headers["Upload-Length"], str(len(archive)))
                    return 201, {}, b""
                if method == "PATCH":
                    self.assertLessEqual(len(body), chunk)
                    self.assertEqual(int(headers["Upload-Offset"]), len(received))
                    received.extend(body)
                    patches.append(len(body))
                    return 204, {"Upload-Offset": str(len(received))}, b""
                self.fail("Unexpected method " + method)
            with patch.object(recovery, "api", side_effect=fake_api), patch.object(recovery, "request", side_effect=fake_request):
                name = recovery.upload_archive(archive, "punctum-node-candidate-")
            self.assertTrue(name.startswith("punctum-node-candidate-"))
            self.assertEqual(patches, [chunk, chunk, 7])
            self.assertEqual(received, archive)
            self.assertEqual(recovery.report["acknowledgedArchives"][0]["bytes"], len(archive))

    def test_uncertain_tus_patch_reconciles_offset_without_replaying_accepted_bytes(self):
        chunk = 4 * 1024 * 1024
        archive = b"q" * (chunk + 13)
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            received = bytearray()
            methods = []
            def fake_api(label, path, payload=None):
                return {"url": "https://srv2282-files.hstgr.io/files", "auth_key": "fake", "rest_auth_key": "fake"}
            def fake_request(label, url, method="GET", headers=None, body=None):
                methods.append(method)
                if method == "POST": return 201, {}, b""
                if method == "HEAD": return 200, {"Upload-Offset": str(len(received))}, b""
                if method == "PATCH":
                    self.assertEqual(int(headers["Upload-Offset"]), len(received))
                    received.extend(body)
                    if len(received) == chunk:
                        raise qa.RequestFailure(label)
                    return 204, {"Upload-Offset": str(len(received))}, b""
                self.fail("Unexpected method " + method)
            with patch.object(recovery, "api", side_effect=fake_api), patch.object(recovery, "request", side_effect=fake_request):
                recovery.upload_archive(archive, "punctum-node-candidate-")
            self.assertEqual(methods, ["POST", "PATCH", "HEAD", "PATCH"])
            self.assertEqual(received, archive)

    def test_runtime_route_trace_includes_only_bounded_allowlisted_metadata(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            logs = {"logs": [
                {"message": 'PUNCTUM_QA_TRACE {"event":"start","route":"/admin/studio"}'},
                {"message": 'PUNCTUM_QA_TRACE {"event":"finish","route":"/admin/studio","status":200,"ms":305}'},
                {"message": 'PUNCTUM_QA_TRACE {"event":"start","route":"/admin/studio?cookie=SECRET"}'},
                {"message": 'PUNCTUM_QA_TRACE {"event":"start","route":"/secret-path"}'}
            ]}
            with patch.object(recovery, "api", return_value=logs):
                runtime_receipts(recovery, "initial")
            trace = recovery.report["runtimeRouteTrace"]["initial"]
            self.assertEqual(trace, [
                {"event":"start","route":"/admin/studio"},
                {"event":"finish","route":"/admin/studio","status":200,"ms":305}
            ])
            self.assertNotIn("SECRET", qa.json.dumps(recovery.report))

    def test_worker_phase_trace_distinguishes_handler_wait_from_http_delivery(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            logs = {"logs": [
                {"message": 'PUNCTUM_QA_PHASE {"phase":"start","route":"/admin/api/studio"}'},
                {"message": 'PUNCTUM_QA_PHASE {"phase":"returned","route":"/admin/api/studio","status":200,"ms":129}'},
                {"message": 'PUNCTUM_QA_PHASE {"phase":"returned","route":"/admin/api/studio?token=SECRET","status":200,"ms":100}'},
                {"message": 'PUNCTUM_QA_PHASE {"phase":"returned","route":"/admin/api/albums","status":200,"ms":99}'},
                {"message": 'PUNCTUM_QA_PHASE {"phase":"returned","route":"/admin/api/studio","status":200,"ms":-1}'},
            ]}
            with patch.object(recovery, "api", return_value=logs):
                runtime_receipts(recovery, "initial")
            self.assertEqual(recovery.report["runtimeWorkerPhase"]["initial"], [
                {"phase":"start","route":"/admin/api/studio"},
                {"phase":"returned","route":"/admin/api/studio","status":200,"ms":129}
            ])
            self.assertNotIn("SECRET", qa.json.dumps(recovery.report))

    def test_runtime_receipts_keep_readiness_and_failed_candidate_routes(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            routes = ["/api/health", "/admin/api/session", "/arquivo", "/"]
            logs = {"logs": [
                {"message": prefix + qa.json.dumps({key: "start", "route": route})}
                for route in routes
                for prefix, key in [("PUNCTUM_QA_TRACE ", "event"), ("PUNCTUM_QA_PHASE ", "phase")]
            ]}
            with patch.object(recovery, "api", return_value=logs):
                runtime_receipts(recovery, "beforeRollback")
            for key in ["runtimeRouteTrace", "runtimeWorkerPhase"]:
                self.assertEqual([row["route"] for row in recovery.report[key]["beforeRollback"]], routes)

    def test_runtime_log_query_includes_provider_required_period_and_limit(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(qa.os.environ, {"HOSTINGER_API": "test-only"}):
            recovery = qa.Recovery(Path(directory), "prepare", "expected")
            paths = []
            def fake_api(label, path, payload=None):
                paths.append(path)
                return {"logs": []}
            with patch.object(recovery, "api", side_effect=fake_api):
                runtime_receipts(recovery, "initial")
            self.assertEqual(paths, [qa.SITE + "/runtime-logs?period=1h&limit=1000"])
            self.assertEqual(recovery.report["runtimeReceipts"]["initial"], [])

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
