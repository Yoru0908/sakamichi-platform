#!/usr/bin/env python3
"""QQ alert for the seichi sync jobs: once on the first failure, once on recovery — never on every run.

Called from each run_*.sh via `trap ... EXIT` after the job holds its locks:
    python3 job_alert.py <job> <exit_status> [log_file]

Why: the fumi sync failed silently for ~17 days (2026-09-10 → 09-27) after fumi's blog changed domain.
NapCat credentials are reused from blog-push-service/.env (same as disk-guard); nothing new is stored.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

RUNTIME_DIR = Path(os.environ.get("SEICHI_RUNTIME_DIR", "/vol1/seichi-sync"))
STATE_PATH = RUNTIME_DIR / "state" / "job-alerts.json"
ENV_PATH = Path(os.environ.get("SEICHI_ALERT_ENV", "/home/srzwyuu/blog-push-service/.env"))


def load_env(path: Path) -> dict:
    env = {}
    if path.exists():
        for raw in path.read_text(errors="replace").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def last_error(log_file: str | None) -> str:
    if not log_file or not Path(log_file).exists():
        return ""
    lines = [l.strip() for l in Path(log_file).read_text(errors="replace").splitlines()[-200:] if l.strip()]
    errors = [l for l in lines if any(k in l for k in ("Error", "error", "unexpected", "Traceback", "failed"))]
    return (errors or lines or [""])[-1][:300]


def transition(state: dict, job: str, status: int) -> str | None:
    """Update state for one run; return the kind of message to send ('fail' / 'recover') or None."""
    entry = state.setdefault(job, {"failing": False, "failures": 0})
    if status != 0:
        entry["failures"] += 1
        if not entry["failing"]:
            entry["failing"] = True
            return "fail"
        return None
    was_failing, entry["failing"] = entry["failing"], False
    if was_failing:
        return "recover"
    entry["failures"] = 0
    return None


def message(kind: str, job: str, entry: dict, log_file: str | None) -> str:
    if kind == "fail":
        return f"【圣巡同步失败】{job}\n{last_error(log_file)}\n日志: {log_file or '-'}\n（恢复前不再重复提醒）"
    return f"【圣巡同步已恢复】{job}（此前连续失败 {entry['failures']} 次）"


def send(text: str) -> bool:
    if os.environ.get("SEICHI_ALERT_DRY_RUN"):
        print(f"[dry-run alert] {text}")
        return True
    env = load_env(ENV_PATH)
    api = (env.get("NAPCAT_API") or "").rstrip("/")
    groups = env.get("SEICHI_ALERT_GROUPS") or env.get("DISK_GUARD_GROUPS") or env.get("BLOG_PUSH_DEFAULT_GROUPS") or ""
    group_ids = [g.strip() for g in groups.split(",") if g.strip()]
    if not api or not group_ids:
        print(f"job_alert: NapCat not configured (api={bool(api)}, groups={group_ids}); alert not sent", file=sys.stderr)
        return False
    headers = {"Content-Type": "application/json"}
    if env.get("NAPCAT_TOKEN"):
        headers["Authorization"] = f"Bearer {env['NAPCAT_TOKEN']}"
    ok = True
    for gid in group_ids:
        req = urllib.request.Request(f"{api}/send_group_msg", data=json.dumps({"group_id": int(gid), "message": text}).encode(), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                body = json.loads(res.read() or b"{}")
                ok = ok and res.status == 200 and body.get("retcode") == 0
        except Exception as exc:  # alerting must never break the job itself
            print(f"job_alert: sending to group {gid} failed: {exc}", file=sys.stderr)
            ok = False
    return ok


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("usage: job_alert.py <job> <exit_status> [log_file]", file=sys.stderr)
        return 2
    job, status, log_file = argv[1], int(argv[2]), (argv[3] if len(argv) > 3 else None)
    state = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}
    kind = transition(state, job, status)
    if kind:
        text = message(kind, job, state[job], log_file)
        sent = send(text)
        if kind == "recover":
            state[job]["failures"] = 0
        if kind == "fail" and not sent:
            state[job]["failing"] = False  # retry the alert on the next failing run
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    tmp.replace(STATE_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
