#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_DIR/release"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BUNDLE_NAME="discord-bot-transfer-${STAMP}.tar.gz"
BUNDLE_PATH="$RELEASE_DIR/$BUNDLE_NAME"

mkdir -p "$RELEASE_DIR"

cd "$PROJECT_DIR"

tar \
  --exclude='./.git' \
  --exclude='./.next' \
  --exclude='./dist' \
  --exclude='./node_modules' \
  --exclude='./runtime' \
  --exclude='./release' \
  --exclude='./.env' \
  --exclude='./.env.local' \
  --exclude='./infra/lavalink/application.yml' \
  --exclude='./tsconfig.tsbuildinfo' \
  -czf "$BUNDLE_PATH" \
  .

echo "$BUNDLE_PATH"
