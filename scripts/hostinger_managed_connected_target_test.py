import pathlib
import tempfile
import unittest
from unittest.mock import patch

from hostinger_managed_qa import Recovery, DOMAIN, SITE
from hostinger_candidate_qa import confirm_environment_keys, write_candidate_environment


class ConnectedTargetTests(unittest.TestCase):
    def test_connected_node_operations_preserve_the_selected_domain_and_old_probe_default(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict('os.environ', {'HOSTINGER_API': 'fixture'}):
            root = pathlib.Path(directory)
            old = Recovery(root, 'prepare', None)
            self.assertEqual((old.domain, old.site), (DOMAIN, SITE))
            op = Recovery(root, 'prepare', None, domain='punctumpicture.com')
            self.assertEqual(op.report['target'], 'punctumpicture.com')
            path = '/accounts/u571409090/websites/punctumpicture.com/nodejs/builds/settings/env'
            with patch.object(op, 'api', return_value=[{'key': 'PORT'}]) as api:
                confirm_environment_keys(op, 'read', {'PORT'}, {'PORT'})
                api.assert_called_once_with('read', path)
            with patch('hostinger_candidate_qa.put') as put:
                write_candidate_environment(op, {'PORT': '3000'})
                self.assertEqual(put.call_args.args[2], path)
            with patch.object(op, 'api', side_effect=RuntimeError('STOP_AFTER_CREDENTIALS')) as api:
                with self.assertRaisesRegex(RuntimeError, 'STOP_AFTER_CREDENTIALS'):
                    op.upload_archive(b'fixture', 'punctum-node-candidate-')
                api.assert_called_once_with('uploadCredentials', '/files/upload-urls', {'username': 'u571409090', 'domain': 'punctumpicture.com'})
            with self.assertRaisesRegex(ValueError, 'Unexpected managed website'):
                Recovery(root, 'prepare', None, domain='unrelated.invalid')
