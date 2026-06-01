#!/usr/bin/env bash
# 一键部署（macOS / Linux）
# 用法：./deploy.sh  或  bash deploy.sh

set -euo pipefail
cd "$(dirname "$0")"
exec bash scripts/deploy.sh
