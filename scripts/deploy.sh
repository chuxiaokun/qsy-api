#!/usr/bin/env bash
# 一键上传并部署（Git Bash / WSL / macOS / Linux）
# 用法：在项目根目录执行  bash scripts/deploy.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONFIG="$ROOT/deploy.env"
if [[ ! -f "$CONFIG" ]]; then
  echo "请先复制 deploy.env.example 为 deploy.env 并填写服务器信息。"
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG"

: "${DEPLOY_HOST:?deploy.env 缺少 DEPLOY_HOST}"
: "${DEPLOY_PATH:?deploy.env 缺少 DEPLOY_PATH}"
: "${PM2_NAME:?deploy.env 缺少 PM2_NAME}"
PACKAGE_MANAGER="${PACKAGE_MANAGER:-npm}"

echo ">>> 同步代码到 ${DEPLOY_HOST}:${DEPLOY_PATH}"
tar \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.env \
  --exclude=deploy.env \
  --exclude=uploads \
  --exclude='*.log' \
  -czf - . \
  | ssh "$DEPLOY_HOST" "mkdir -p '$DEPLOY_PATH' && cd '$DEPLOY_PATH' && tar -xzf -"

case "$PACKAGE_MANAGER" in
  pnpm) INSTALL_CMD="pnpm install --prod" ;;
  *)    INSTALL_CMD="npm install --omit=dev" ;;
esac

echo ">>> 安装依赖并重启 PM2: $PM2_NAME"
ssh "$DEPLOY_HOST" bash -s <<REMOTE
set -e
cd '$DEPLOY_PATH'
$INSTALL_CMD
if pm2 describe '$PM2_NAME' >/dev/null 2>&1; then
  pm2 restart '$PM2_NAME'
else
  pm2 start src/index.js --name '$PM2_NAME'
fi
pm2 save 2>/dev/null || true
curl -sf http://127.0.0.1:3000/health || echo '(health 未通过，请检查 .env 与 PM2 日志)'
REMOTE

echo ">>> 部署完成"
