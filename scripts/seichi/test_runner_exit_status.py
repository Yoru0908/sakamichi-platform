#!/usr/bin/env python3
"""Exercise the runners' actual EXIT traps without running a sync or sending alerts."""

import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
RUNNERS = {
    "run_oversea_sync.sh": "oversea",
    "run_shimizu_hinata_sync.sh": "shimizu-hinata",
    "run_fumi_sync.sh": "fumi",
}


class RunnerExitStatusTests(unittest.TestCase):
    def test_exit_trap_preserves_status_and_job(self):
        for filename, job in RUNNERS.items():
            # Extract the real trap so this test catches shell expansion order,
            # including command substitutions before the status argument.
            trap = next(line for line in (HERE / filename).read_text().splitlines()
                        if line.startswith("trap "))
            for job_status in (0, 1, 7):
                for alert_status in (0, 9):
                    with self.subTest(runner=filename, job_status=job_status,
                                      alert_status=alert_status):
                        with tempfile.TemporaryDirectory(prefix="seichi-exit-test-") as tmp:
                            root = Path(tmp)
                            bin_dir = root / "bin"
                            bin_dir.mkdir()
                            mock = bin_dir / "python3"
                            mock.write_text(
                                '#!/usr/bin/env bash\n'
                                'printf "%s\\0" "$@" > "$TEST_ALERT_ARGS_DIR/${1##*/}.args"\n'
                                'exit "$TEST_ALERT_EXIT"\n'
                            )
                            mock.chmod(0o755)
                            log = root / "sync.log"
                            run_report = root / "run.json"
                            started = "2026-10-22T15:00:00Z"
                            stage = "fetch" if job_status else "complete"
                            outcome = "none" if job_status else "unchanged"
                            harness = root / filename
                            harness.write_text(
                                "#!/usr/bin/env bash\nset -euo pipefail\n"
                                f"LOG_FILE={shlex.quote(str(log))}\n"
                                f"SEICHI_SCRIPT_DIR={shlex.quote(str(root))}\n"
                                f"SEICHI_RUN_REPORT={shlex.quote(str(run_report))}\n"
                                f"SEICHI_STARTED_AT={started}\n"
                                f"SEICHI_STAGE={stage}\n"
                                f"SEICHI_OUTCOME={outcome}\n"
                                f"REPO_DIR={shlex.quote(str(root))}\n"
                                f"{trap}\n"
                                '(exit "$TEST_JOB_EXIT")\n'
                            )
                            env = {
                                **os.environ,
                                "PATH": str(bin_dir) + os.pathsep + os.environ.get("PATH", "/usr/bin:/bin"),
                                "TEST_ALERT_ARGS_DIR": str(root),
                                "TEST_ALERT_EXIT": str(alert_status),
                                "TEST_JOB_EXIT": str(job_status),
                            }
                            result = subprocess.run(["bash", str(harness)], env=env,
                                                    capture_output=True, text=True, timeout=5)
                            self.assertEqual(result.returncode, job_status, result.stderr)
                            self.assertEqual(
                                (root / "job_alert.py.args").read_bytes().decode().split("\0")[:-1],
                                [str(root / "job_alert.py"), job, str(job_status), str(log)],
                            )
                            self.assertEqual(
                                (root / "job_run_report.py.args").read_bytes().decode().split("\0")[:-1],
                                [str(root / "job_run_report.py"), "finish", job, str(run_report),
                                 started, stage, str(job_status), str(root), outcome],
                            )


if __name__ == "__main__":
    unittest.main()
