#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("job_alert", Path(__file__).with_name("job_alert.py"))
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class JobAlertTest(unittest.TestCase):
    def test_alerts_once_on_failure_then_once_on_recovery(self):
        state = {}
        self.assertIsNone(MODULE.transition(state, "fumi", 0))
        self.assertEqual("fail", MODULE.transition(state, "fumi", 1))
        self.assertIsNone(MODULE.transition(state, "fumi", 1))   # no repeat while still failing
        self.assertIsNone(MODULE.transition(state, "fumi", 1))
        self.assertEqual(3, state["fumi"]["failures"])
        self.assertEqual("recover", MODULE.transition(state, "fumi", 0))
        self.assertIsNone(MODULE.transition(state, "fumi", 0))

    def test_jobs_are_independent(self):
        state = {}
        self.assertEqual("fail", MODULE.transition(state, "fumi", 1))
        self.assertIsNone(MODULE.transition(state, "oversea", 0))
        self.assertEqual("fail", MODULE.transition(state, "oversea", 1))

    def test_message_includes_last_error_line(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".log", delete=False) as log:
            log.write("started\npromote_fumi_articles.py: unexpected fumi source URL: https://x/\n")
        text = MODULE.message("fail", "fumi", {"failures": 1}, log.name)
        self.assertIn("unexpected fumi source URL", text)
        self.assertIn("fumi", text)


if __name__ == "__main__":
    unittest.main()
