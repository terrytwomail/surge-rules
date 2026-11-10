import contextlib
import copy
import io
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from tools import audit


class IntegrityTests(unittest.TestCase):
    def setUp(self):
        self.lock = {'sources': {
            'SUKKA': {'repo': 'example/rules', 'branch': 'main', 'commit': 'fixed',
                      'files': {'rules.conf': audit.sha256('DOMAIN,example.com')}},
            'OWN': {'repo': 'example/panel', 'branch': 'main', 'commit': 'fixed',
                    'files': {'panel.js': audit.sha256('script')}}}}

    def run_command(self, command, fetch, latest='fixed'):
        output = io.StringIO()
        original = copy.deepcopy(self.lock)
        with patch.object(audit, 'fetch', side_effect=fetch), \
             patch.object(audit, 'latest_sha', return_value=latest) as latest_mock, \
             patch.object(audit, 'load_protect', return_value=[]), \
             contextlib.redirect_stdout(output):
            status = command(self.lock, SimpleNamespace(out=None))
        self.assertEqual(self.lock, original, '檢查不得修改固定版本')
        return status, output.getvalue(), latest_mock

    def good_fetch(self, repo, sha, path):
        return 'script' if path.endswith('.js') else 'DOMAIN,example.com'

    def test_unchanged_sources_and_own_are_checked(self):
        status, output, latest = self.run_command(audit.cmd_report, self.good_fetch)
        self.assertEqual(status, 0)
        self.assertIn('OWN：固定版本完整性通過', output)
        latest.assert_called_once_with('example/rules', 'main')

    def test_mismatch_fails_check_and_unchanged_report(self):
        for command in (audit.cmd_check, audit.cmd_report):
            with self.subTest(command=command.__name__):
                status, output, _ = self.run_command(command, lambda *args: 'tampered')
                self.assertEqual(status, 1)
                self.assertIn('雜湊不符', output)
                self.assertNotIn('所有使用中的檔案都沒有變化', output)

    def test_own_mismatch_alone_fails(self):
        self.lock['sources']['OWN']['files']['panel.js'] = 'wrong'
        status, output, _ = self.run_command(audit.cmd_report, self.good_fetch)
        self.assertEqual(status, 1)
        self.assertIn('panel.js', output)

    def test_missing_pin_and_fetch_failure_are_reported(self):
        self.lock['sources']['SUKKA']['commit'] = ''
        for command in (audit.cmd_check, audit.cmd_report):
            status, output, _ = self.run_command(command, lambda *args: (_ for _ in ()).throw(OSError('offline')))
            self.assertEqual(status, 1)
            self.assertIn('尚未固定提交', output)
            self.assertIn('取得失敗', output)

    def test_upstream_change_is_report_only(self):
        def fetch(repo, sha, path):
            return 'DOMAIN,example.org' if sha == 'new' else self.good_fetch(repo, sha, path)
        status, output, _ = self.run_command(audit.cmd_report, fetch, latest='new')
        self.assertEqual(status, 0)
        self.assertIn('新增 1、刪除 1', output)
        self.assertIn('fixed → new', output)

    def test_deleted_upstream_file_fails(self):
        def fetch(repo, sha, path):
            if sha == 'new':
                raise OSError('404')
            return self.good_fetch(repo, sha, path)
        status, output, _ = self.run_command(audit.cmd_report, fetch, latest='new')
        self.assertEqual(status, 1)
        self.assertIn('上游已刪除或無法取得', output)


if __name__ == '__main__':
    unittest.main()
