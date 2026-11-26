"""CI coverage guard: every test folder that Pages runs after merge must also
run on a pull request that touches it.

pages.yml runs `node --test app/test/*.test.mjs site/test/*.test.mjs` only on
push to main. Before this guard, a PR that changed only `site/**` started no
PR workflow at all, so site/test failed (if it failed) after the merge.
The workflows are parsed as text so the check needs no YAML library.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / '.github' / 'workflows'


def pull_request_paths(text):
    """Return the `paths:` globs under `on: pull_request:`, or None if the
    workflow has no pull_request trigger. Handles inline and block lists."""
    m = re.search(r'^  pull_request:\n((?:    .*\n|\s*\n)*)', text, re.M)
    if not m:
        return None
    block = m.group(1)
    inline = re.search(r'^    paths:\s*\[(.*)\]', block, re.M)
    if inline:
        return [p.strip().strip('\'"') for p in inline.group(1).split(',') if p.strip()]
    listed = re.search(r'^    paths:\n((?:      - .*\n)+)', block, re.M)
    if listed:
        return [l.split('- ', 1)[1].strip().strip('\'"') for l in listed.group(1).splitlines()]
    return []  # pull_request with no paths filter = every PR


def node_test_dirs(text):
    dirs = set()
    for line in text.splitlines():
        if 'node --test' in line:
            dirs.update(re.findall(r'\b([a-z]+/test)/\*\.test\.mjs', line))
    return dirs


class PullRequestCoverage(unittest.TestCase):
    def test_pages_test_dirs_run_on_their_own_pull_requests(self):
        pages = (WORKFLOWS / 'pages.yml').read_text(encoding='utf-8')
        needed = node_test_dirs(pages)
        self.assertEqual(needed, {'app/test', 'site/test'})
        for test_dir in sorted(needed):
            top = test_dir.split('/')[0]
            covering = []
            for wf in sorted(WORKFLOWS.glob('*.yml')):
                text = wf.read_text(encoding='utf-8')
                paths = pull_request_paths(text)
                if paths is None or test_dir not in node_test_dirs(text):
                    continue
                if paths == [] or f'{top}/**' in paths:
                    covering.append(wf.name)
            with self.subTest(test_dir=test_dir):
                self.assertTrue(covering, f'no PR workflow runs {test_dir} when {top}/** changes')

    def test_parser_reads_both_list_styles(self):
        inline = "on:\n  pull_request:\n    paths: ['firmware/**', 'app/**']\n"
        block = "on:\n  pull_request:\n    paths:\n      - 'demo/**'\n      - 'x.yml'\n  workflow_dispatch:\n"
        self.assertEqual(pull_request_paths(inline), ['firmware/**', 'app/**'])
        self.assertEqual(pull_request_paths(block), ['demo/**', 'x.yml'])
        self.assertIsNone(pull_request_paths("on:\n  push:\n    branches: [main]\n"))


if __name__ == '__main__':
    unittest.main()
