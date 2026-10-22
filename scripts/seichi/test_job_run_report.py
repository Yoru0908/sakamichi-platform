#!/usr/bin/env python3
"""Run status cannot retain an old validated report after a fetch failure."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from job_run_report import main, report


class RunReportTests(unittest.TestCase):
    def test_start_then_fetch_failure_replaces_old_success(self):
        with tempfile.TemporaryDirectory(prefix="seichi-report-test-") as tmp:
            path = Path(tmp) / "job-run-latest.json"
            path.write_text(json.dumps({"status": "success", "production_commit": "old"}))
            start = "2026-10-22T15:00:00Z"
            main(["report", "start", "shimizu-hinata", str(path), start])
            running = json.loads(path.read_text())
            self.assertEqual(running["status"], "running")
            self.assertIsNone(running["finished_at"])
            self.assertIsNone(running["production_commit"])
            main(["report", "progress", "shimizu-hinata", str(path), start, "fetch"])
            progress = json.loads(path.read_text())
            self.assertEqual((progress["status"], progress["stage"]), ("running", "fetch"))
            self.assertEqual(progress["started_at"], start)
            main(["report", "finish", "shimizu-hinata", str(path), start,
                  "fetch", "7", str(Path(tmp) / "not-a-repo"), "none"])
            failed = json.loads(path.read_text())
            self.assertEqual((failed["job"], failed["status"], failed["stage"], failed["exit_code"]),
                             ("shimizu-hinata", "failed", "fetch", 7))
            self.assertEqual(failed["started_at"], start)
            self.assertIsNotNone(failed["finished_at"])
            self.assertIsNone(failed["production_commit"])
            self.assertEqual(list(Path(tmp).iterdir()), [path])

    @patch("job_run_report.subprocess.check_output", side_effect=["a" * 40 + "\n", "sakamichi-platform\n"])
    def test_success_records_commit_and_branch(self, git):
        result = report("oversea", "2026-10-22T15:00:00Z", stage="complete", exit_code=0,
                        repo=Path("/repo"), outcome="unchanged")
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["outcome"], "unchanged")
        self.assertEqual(result["production_commit"], "a" * 40)
        self.assertEqual(result["production_branch"], "sakamichi-platform")
        self.assertEqual(git.call_count, 2)

    @patch("job_run_report.subprocess.check_output")
    def test_deferred_is_not_published_success(self, git):
        result = report("fumi", "2026-10-22T15:00:00Z", stage="fetch", exit_code=0,
                        repo=Path("/repo"), outcome="deferred")
        self.assertEqual(result["status"], "deferred")
        self.assertIsNone(result["production_commit"])
        git.assert_not_called()


if __name__ == "__main__":
    unittest.main()
