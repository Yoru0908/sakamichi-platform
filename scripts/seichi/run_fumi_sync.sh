#!/usr/bin/env bash
set -euo pipefail

# The whole job is one function: bash reads it completely before running it, so the `git merge` below can replace
# this file mid-run without bash executing the new file from the old byte offset (2026-10-05: that skipped --baseline).
main() {

REPO_DIR="${SEICHI_REPO_DIR:-/vol1/sakamichi-platform}"
RUNTIME_DIR="${SEICHI_RUNTIME_DIR:-/vol1/seichi-sync}"
JOB_DIR="$RUNTIME_DIR/fumi"
LOG_DIR="$RUNTIME_DIR/logs"
LOG_FILE="$LOG_DIR/fumi-sync.log"
TMP_DIR="$RUNTIME_DIR/tmp"
CACHE_DIR="$JOB_DIR/cache"
REPORT_DIR="$RUNTIME_DIR/reports"
LOCK_FILE="$RUNTIME_DIR/fumi-sync.lock"
PUBLISH_LOCK_FILE="$RUNTIME_DIR/git-publish.lock"
CANDIDATE="$JOB_DIR/fumi-articles.geojson"
PROMOTED="$JOB_DIR/sakurazaka-all-promoted.geojson"
REVIEWED="$JOB_DIR/fumi-articles-reviewed.geojson"
REVIEW_REPORT="$REPORT_DIR/fumi-review-latest.json"
CRAWL_REPORT="$REPORT_DIR/fumi-crawl-latest.json"
PROMOTE_REPORT="$REPORT_DIR/fumi-latest.json"
CURRENT="$REPO_DIR/public/seichi/sakurazaka-all.geojson"

mkdir -p "$JOB_DIR" "$LOG_DIR" "$TMP_DIR" "$CACHE_DIR" "$REPORT_DIR"
if [[ -f "$LOG_FILE" ]] && (( $(stat -c %s "$LOG_FILE") > 5242880 )); then
  mv -f "$LOG_FILE" "$LOG_FILE.1"
fi
exec >>"$LOG_FILE" 2>&1

export TMPDIR="$TMP_DIR"
export PATH="/vol1/@appcenter/nodejs_v22/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date -Is)] another fumi sync is running; skipped"
  exit 0
fi
exec 8>"$PUBLISH_LOCK_FILE"
if ! flock -n 8; then
  echo "[$(date -Is)] another seichi publisher is running; skipped"
  exit 0
fi

# Alert once on the first failure and once on recovery (after the locks, so a skipped run is not a "success").
trap 'python3 "$(dirname "${BASH_SOURCE[0]}")/job_alert.py" fumi "$?" "$LOG_FILE" || true' EXIT
echo "[$(date -Is)] fumi sync started"
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

python3 scripts/seichi/sync_fumi_articles.py \
  --baseline scripts/seichi/fumi_baseline.json \
  --cache-dir "$CACHE_DIR" \
  --output "$CANDIDATE" \
  --report "$CRAWL_REPORT"

# Names chosen while Jev was down, or town-level points whose lookup hit an outage, would be published for good
# (append-only, keys include the coordinate). Skip this run; the next cycle retries from cache.
if python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); sys.exit(0 if r.get("jevFailed") or r.get("locateDeferred") else 1)' "$CRAWL_REPORT"; then
  echo "[$(date -Is)] Jev or a lookup service was unavailable; not publishing this run"
  exit 0
fi

# Held spots (no name / town-level coordinate / suspected duplicate) are reported to QQ once and left out.
python3 scripts/seichi/fumi_review.py \
  --candidate "$CANDIDATE" \
  --current "$CURRENT" \
  --curated public/seichi/yamakawa-ui.geojson \
  --overrides scripts/seichi/fumi_overrides.json \
  --crawl-report "$CRAWL_REPORT" \
  --output "$REVIEWED" \
  --report "$REVIEW_REPORT"

python3 scripts/seichi/promote_fumi_articles.py \
  --current "$CURRENT" \
  --candidate "$REVIEWED" \
  --output "$PROMOTED" \
  --report "$PROMOTE_REPORT"

python3 scripts/seichi/test_sync_fumi_articles.py
python3 scripts/seichi/test_place_extract.py
python3 scripts/seichi/test_fumi_locate.py
python3 scripts/seichi/test_promote_fumi_articles.py
python3 scripts/seichi/test_fumi_review.py
python3 scripts/seichi/test_append_member_spots.py

if cmp -s "$CURRENT" "$PROMOTED"; then
  echo "[$(date -Is)] no production data changes"
  exit 0
fi

cp "$PROMOTED" "${CURRENT}.tmp.sync"
mv -f "${CURRENT}.tmp.sync" "$CURRENT"
# Her new spots also go into the curated 山川宇衣 map, so every page reading it stays in step with the combined map.
python3 scripts/seichi/append_member_spots.py \
  --combined "$CURRENT" \
  --curated public/seichi/yamakawa-ui.geojson \
  --baseline scripts/seichi/fumi_baseline.json
git diff --check -- public/seichi/sakurazaka-all.geojson public/seichi/yamakawa-ui.geojson
git add public/seichi/sakurazaka-all.geojson public/seichi/yamakawa-ui.geojson
git -c user.name="Sakamichi Seichi Sync" \
    -c user.email="seichi-sync@46log.com" \
    commit -m "data: 自动同步 fumi 圣巡地图"

# A concurrent human push is never overwritten; a non-fast-forward push fails.
git push origin HEAD:sakamichi-platform
echo "[$(date -Is)] fumi sync committed and pushed"
}

main "$@"
