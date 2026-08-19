#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

INSTALL_DIR="${INSTALL_DIR:-/opt/lavalink}"
LAVALINK_VERSION="${LAVALINK_VERSION:-4.2.2}"
YOUTUBE_PLUGIN_VERSION="${YOUTUBE_PLUGIN_VERSION:-1.18.0}"
LAVALINK_JAR_URL="${LAVALINK_JAR_URL:-https://github.com/lavalink-devs/Lavalink/releases/download/${LAVALINK_VERSION}/Lavalink.jar}"
YOUTUBE_PLUGIN_URL="${YOUTUBE_PLUGIN_URL:-https://maven.lavalink.dev/releases/dev/lavalink/youtube/youtube-plugin/${YOUTUBE_PLUGIN_VERSION}/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd java

mkdir -p "$INSTALL_DIR/plugins"

echo "Downloading Lavalink ${LAVALINK_VERSION}"
curl -fL "$LAVALINK_JAR_URL" -o "$INSTALL_DIR/Lavalink.jar"

echo "Downloading youtube-plugin ${YOUTUBE_PLUGIN_VERSION}"
curl -fL "$YOUTUBE_PLUGIN_URL" -o "$INSTALL_DIR/plugins/youtube-plugin.jar"

if [ ! -f "$INSTALL_DIR/application.yml" ]; then
  cp "$PROJECT_DIR/infra/lavalink/application.yml.example" "$INSTALL_DIR/application.yml"
  echo "Created $INSTALL_DIR/application.yml from repo example"
else
  echo "Keeping existing $INSTALL_DIR/application.yml"
fi

cat <<EOF

Lavalink installed into: $INSTALL_DIR

Review these files before start:
- $INSTALL_DIR/application.yml
- $PROJECT_DIR/.env

Required value alignment:
- .env LAVALINK_PASSWORD must match lavalink.server.password in $INSTALL_DIR/application.yml
- .env LAVALINK_URL should be http://127.0.0.1:2333 when app and Lavalink share the same server

Manual smoke test:
java -jar "$INSTALL_DIR/Lavalink.jar" --spring.config.location="$INSTALL_DIR/application.yml"
EOF
