#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${SEICHI_REPO_DIR:-/vol1/sakamichi-platform}"
RUNTIME_DIR="${SEICHI_RUNTIME_DIR:-/vol1/seichi-sync}"
JOB_DIR="$RUNTIME_DIR/shimizu-hinata"
LOG_DIR="$RUNTIME_DIR/logs"
LOG_FILE="$LOG_DIR/shimizu-hinata-sync.log"
TMP_DIR="$RUNTIME_DIR/tmp"
STATE_DIR="$RUNTIME_DIR/state"
RAW_DIR="$RUNTIME_DIR/raw"
REPORT_DIR="$RUNTIME_DIR/reports"
LOCK_FILE="$RUNTIME_DIR/shimizu-hinata-sync.lock"
PUBLISH_LOCK_FILE="$RUNTIME_DIR/git-publish.lock"
CANDIDATE="$JOB_DIR/shimizu-hinata.geojson"
PROMOTED="$JOB_DIR/hinatazaka-all-promoted.geojson"
CURRENT="$REPO_DIR/public/seichi/hinatazaka-all.geojson"
MAX_ADDITIONS="${SHIMIZU_MAX_ADDITIONS:-50}"
MAX_REMOVALS="${SHIMIZU_MAX_REMOVALS:-10}"

mkdir -p "$JOB_DIR" "$LOG_DIR" "$TMP_DIR" "$STATE_DIR" "$RAW_DIR" "$REPORT_DIR"
if [[ -f "$LOG_FILE" ]] && (( $(stat -c %s "$LOG_FILE") > 5242880 )); then
  mv -f "$LOG_FILE" "$LOG_FILE.1"
fi
exec >>"$LOG_FILE" 2>&1

export TMPDIR="$TMP_DIR"
export PATH="/vol1/@appcenter/nodejs_v22/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date -Is)] another Shimizu Hinata sync is running; skipped"
  exit 0
fi
exec 8>"$PUBLISH_LOCK_FILE"
if ! flock -n 8; then
  echo "[$(date -Is)] another seichi publisher is running; skipped"
  exit 0
fi

echo "[$(date -Is)] Shimizu Hinata sync started"
vol1_percent=$(df -P /vol1 | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if (( vol1_percent >= 85 )); then
  echo "[$(date -Is)] /vol1 usage is ${vol1_percent}%; refusing to write"
  exit 1
fi

cd "$REPO_DIR"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "[$(date -Is)] tracked working tree is dirty; refusing to sync"
  git status --short
  exit 1
fi

git fetch origin sakamichi-platform
git checkout sakamichi-platform
git merge --ff-only origin/sakamichi-platform
if (( $(git rev-list --count origin/sakamichi-platform..HEAD) > 0 )); then
  echo "[$(date -Is)] retrying a previously committed sync push"
  git push origin HEAD:sakamichi-platform
fi

python3 scripts/seichi/sync_mymaps_sources.py \
  --source shimizu-hinata-main \
  --output "$CANDIDATE" \
  --state-dir "$STATE_DIR" \
  --save-raw \
  --raw-dir "$RAW_DIR"

python3 scripts/seichi/promote_shimizu_hinata.py \
  --current "$CURRENT" \
  --candidate "$CANDIDATE" \
  --output "$PROMOTED" \
  --report "$REPORT_DIR/shimizu-hinata-latest.json" \
  --max-additions "$MAX_ADDITIONS" \
  --max-removals "$MAX_REMOVALS"

python3 scripts/seichi/test_sync_mymaps_sources.py
python3 scripts/seichi/test_promote_shimizu_hinata.py

if cmp -s "$CURRENT" "$PROMOTED"; then
  echo "[$(date -Is)] no production data changes"
  exit 0
fi

cp "$PROMOTED" "${CURRENT}.tmp.sync"
mv -f "${CURRENT}.tmp.sync" "$CURRENT"
git diff --check -- public/seichi/hinatazaka-all.geojson
git add public/seichi/hinatazaka-all.geojson
git -c user.name="Sakamichi Seichi Sync" \
    -c user.email="seichi-sync@46log.com" \
    commit -m "data: 自动同步清水ひなた圣巡地图"

# A concurrent human push is never overwritten; a non-fast-forward push fails.
git push origin HEAD:sakamichi-platform
echo "[$(date -Is)] Shimizu Hinata sync committed and pushed"
