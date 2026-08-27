#!/bin/bash
set -euo pipefail

set -a
source /home/srzwyuu/fortune-soldout-watcher/.env
set +a

LOG_DIR=/vol1/fortune-soldout-watcher/logs
mkdir -p "$LOG_DIR"

exec /vol1/@appcenter/nodejs_v22/bin/node \
  /home/srzwyuu/fortune-soldout-watcher/watcher.mjs \
  >> "$LOG_DIR/watcher.log" 2>&1
