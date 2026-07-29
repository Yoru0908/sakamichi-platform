#!/bin/bash
# -----------------------------------------------------------------------------
# 生日贺卡自动抓取与推送脚本
# -----------------------------------------------------------------------------

# 设定项目工作目录 (基于脚本自身位置，兼容本地 Mac 与 Homeserver 部署)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

# Cloudflare Pages production 分支（46log.com 监听此分支自动重建）
PRODUCTION_BRANCH="sakamichi-platform"
# 开发分支（与 production 保持同步）
DEV_BRANCH="master"

# cron 在 production 分支上工作，确保 push 后 Cloudflare 自动重建
git checkout "$PRODUCTION_BRANCH" 2>/dev/null
git pull origin "$PRODUCTION_BRANCH"

# 加载本地环境变量 (.env 文件，切勿提交至公网 Git)
if [ -f .env ]; then
  # 过滤注释行并导出变量
  export $(grep -v '^#' .env | xargs)
fi

# 确保凭证存在
if [ -z "$SAKURAZAKA_EMAIL" ] || [ -z "$SAKURAZAKA_PASSWORD" ]; then
  echo "❌ 错误: 未能在环境变量或 .env 中找到 SAKURAZAKA_EMAIL / SAKURAZAKA_PASSWORD"
  exit 1
fi

# 检查 Node.js 路径，Cron 环境下可能找不到 PATH，依次尝试常见位置
NODE_BIN="$(which node 2>/dev/null || echo "")"
if [ -z "$NODE_BIN" ]; then
  for candidate in /vol1/@appcenter/nodejs_v22/bin/node /usr/local/bin/node /opt/homebrew/bin/node; do
    [ -x "$candidate" ] && NODE_BIN="$candidate" && break
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo "❌ 错误: 未找到 node 可执行文件"
  exit 1
fi

# 运行抓取脚本
$NODE_BIN scripts/fetch-birthday-cards.js

# 检查数据是否有更新
if git status --porcelain | grep -q "public/data/birthday-cards.json"; then
  echo "🎂 发现生日贺卡数据更新！正在提交并推送..."
  git add public/data/birthday-cards.json
  git commit -m "chore(data): auto-update birthday cards [skip ci]"
  # 先 push production 分支触发 Cloudflare 重建
  git push origin "$PRODUCTION_BRANCH"
  echo "✅ 已推送 $PRODUCTION_BRANCH，Cloudflare Pages 自动触发重构。"
  # 同步到 master 分支保持一致
  git checkout "$DEV_BRANCH" 2>/dev/null && git merge --ff-only "$PRODUCTION_BRANCH" 2>/dev/null && git push origin "$DEV_BRANCH" && git checkout "$PRODUCTION_BRANCH"
  echo "✅ 已同步 $DEV_BRANCH 分支。"
else
  echo "🎂 生日贺卡数据无变化，无需更新。"
fi
