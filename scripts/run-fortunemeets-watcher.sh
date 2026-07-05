#!/bin/bash
set -a
source /home/srzwyuu/fortune-soldout-watcher/.env
set +a
/vol1/@appcenter/nodejs_v22/bin/node /home/srzwyuu/fortune-soldout-watcher/fortunemeets-watcher.mjs >> /home/srzwyuu/fortune-soldout-watcher/logs/fortunemeets-watcher.log 2>&1
