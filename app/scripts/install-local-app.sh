#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Cronos.app"
BUNDLE_ID="com.awm.relationshipos"
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_APP="$APP_ROOT/src-tauri/target/release/bundle/macos/$APP_NAME"
DEST_APP="/Applications/$APP_NAME"

if [[ ! -d "$SOURCE_APP" ]]; then
  echo "Could not find built app at:"
  echo "  $SOURCE_APP"
  echo
  echo "Run this first:"
  echo "  npm run build:app"
  exit 1
fi

echo "Quitting any running Cronos instance..."
osascript -e "quit app id \"$BUNDLE_ID\"" >/dev/null 2>&1 || true
sleep 1

echo "Installing latest build to:"
echo "  $DEST_APP"
ditto "$SOURCE_APP" "$DEST_APP"

echo "Opening installed app..."
open "$DEST_APP"

echo "Done."
