#!/bin/bash
# -----------------------------------------------------------------------------
# 生日贺卡自动抓取与推送脚本
# -----------------------------------------------------------------------------

# 设定项目工作目录 (必须为绝对路径)
PROJECT_DIR="/Users/yoru/Documents/SA/项目/sakamichi-tools项目统合/sakamichi-platform"
cd "$PROJECT_DIR" || exit 1

# 获取最新代码
git pull origin master

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

# 检查 Node.js 路径，Cron 环境下可能找不到 PATH，使用 absolute 路径或从 system 寻找
NODE_BIN=$(which node || echo "/usr/local/bin/node")

# 运行抓取脚本
$NODE_BIN scripts/fetch-birthday-cards.js

# 检查数据是否有更新
if git status --porcelain | grep -q "public/data/birthday-cards.json"; then
  echo "🎂 发现生日贺卡数据更新！正在提交并推送..."
  git add public/data/birthday-cards.json
  git commit -m "chore(data): auto-update birthday cards [skip ci]"
  git push origin master
  echo "✅ 推送完成，Cloudflare Pages 将自动触发重构。"
else
  echo "🎂 生日贺卡数据无变化，无需更新。"
fi
