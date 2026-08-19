#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
else
  echo "Keeping existing .env"
fi

mkdir -p infra/lavalink

if [ ! -f infra/lavalink/application.yml ]; then
  cp infra/lavalink/application.yml.example infra/lavalink/application.yml
  echo "Created infra/lavalink/application.yml from example"
else
  echo "Keeping existing infra/lavalink/application.yml"
fi

echo "Installing Node dependencies"
npm ci

echo "Generating Prisma client"
node ./node_modules/prisma/build/index.js generate

echo "Applying Prisma migrations"
node ./node_modules/prisma/build/index.js migrate deploy

echo "Building web and bot runtime"
node ./node_modules/next/dist/bin/next build --webpack
node ./node_modules/typescript/bin/tsc -p tsconfig.server.json

cat <<'EOF'

Quick setup completed.

Next steps:
1. Review .env and fill in production values. This script never overwrites an existing .env.
2. Install Lavalink with:
   ./deploy/install-lavalink.sh
3. Make sure these values match:
   - .env: LAVALINK_URL=http://127.0.0.1:2333
   - .env: LAVALINK_PASSWORD=<same password as Lavalink>
4. Bootstrap or update the admin account if needed:
   npm run admin:bootstrap -- --username admin --password "replace-this-password"
5. Start services:
   pm2 start ecosystem.config.cjs

If you already manage Lavalink outside PM2, start only the app:
   pm2 start ecosystem.config.cjs --only discord-bot-admin
EOF
