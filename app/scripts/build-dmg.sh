#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_BIN="$APP_ROOT/node_modules/.bin/tauri"
CLEANUP_SCRIPT="$APP_ROOT/scripts/cleanup-dmg-state.sh"

if [[ ! -x "$TAURI_BIN" ]]; then
  echo "Could not find Tauri CLI at:"
  echo "  $TAURI_BIN"
  echo
  echo "Run npm install from app/ first."
  exit 1
fi

cleanup_dmg_state() {
  bash "$CLEANUP_SCRIPT"
}

cleanup_dmg_state

if "$TAURI_BIN" build --bundles dmg; then
  exit 0
fi

echo
echo "DMG build failed once. Cleaning Cronos disk-image state and retrying..."
cleanup_dmg_state
"$TAURI_BIN" build --bundles dmg
