import unittest
from hostinger_managed_schedule import command, job_receipt


class ManagedScheduleTests(unittest.TestCase):
    def test_provider_command_and_scoped_receipt(self):
        for mode in ('hourly', 'daily'):
            result = command(mode)
            self.assertLessEqual(len(result), 255)
            self.assertIn('current/nodejs/cron.mjs ' + mode, result)
            self.assertNotIn('%', result)
        self.assertIsNone(job_receipt({'output': 'not a receipt'}, 'hourly'))
        self.assertIsNone(job_receipt({'output': '{"status":"CANDIDATE_SCHEDULED_JOB_PASS","cronMode":"daily"}'}, 'hourly'))
        receipt = job_receipt({'output': '{"status":"CANDIDATE_SCHEDULED_JOB_PASS","cronMode":"hourly"}'}, 'hourly')
        self.assertEqual(receipt['cronMode'], 'hourly')
        with self.assertRaises(AssertionError):
            command('other')


if __name__ == '__main__':
    unittest.main()
