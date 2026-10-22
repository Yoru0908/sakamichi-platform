#!/usr/bin/env python3
"""Atomic per-run status, separate from crawler/promoter business reports. No notifications."""

from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def write_report(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def report(job: str, started: str, *, stage: str = "preflight", exit_code: int | None = None,
           repo: Path | None = None, outcome: str | None = None) -> dict:
    status = "running" if exit_code is None else "failed" if exit_code else "deferred" if outcome == "deferred" else "success"
    data = {
        "job": job,
        "started_at": started,
        "finished_at": None if exit_code is None else datetime.now(timezone.utc).isoformat(),
        "status": status,
        "stage": stage,
        "exit_code": exit_code,
        "outcome": outcome,
        "production_commit": None,
        "production_branch": None,
    }
    if status == "success" and repo is not None:
        # The runner has completed its fast-forward / pending-push check and,
        # when data changed, its push. Never label a failed local commit as live.
        for field, args in (("production_commit", ["rev-parse", "HEAD"]),
                            ("production_branch", ["branch", "--show-current"])):
            data[field] = subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()
    return data


def main(argv: list[str]) -> int:
    if len(argv) not in (5, 6, 9) or argv[1] not in ("start", "progress", "finish"):
        raise ValueError("usage: job_run_report.py start job path started | progress job path started stage | finish job path started stage exit_code repo outcome")
    action, job, path, started = argv[1:5]
    if action == "start":
        if len(argv) != 5:
            raise ValueError("start takes job, path, started")
        data = report(job, started)
    elif action == "progress":
        if len(argv) != 6:
            raise ValueError("progress takes job, path, started, stage")
        data = report(job, started, stage=argv[5])
    else:
        if len(argv) != 9:
            raise ValueError("finish takes job, path, started, stage, exit_code, repo, outcome")
        stage, status, repo, outcome = argv[5:9]
        data = report(job, started, stage=stage, exit_code=int(status), repo=Path(repo), outcome=outcome)
    write_report(Path(path), data)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
