#!/bin/bash
# Double-click this file to build Cronos and install it into /Applications.
set -e
cd "$(dirname "$0")"
source "$HOME/.cargo/env" 2>/dev/null || true

echo "=============================================="
echo "  Building Cronos — first build takes ~5-10 min"
echo "=============================================="
npm install
npm run tauri build -- --bundles app

echo "Quitting any running Cronos..."
osascript -e 'quit app id "com.awm.relationshipos"' >/dev/null 2>&1 || true
sleep 1

echo "Installing to /Applications..."
ditto "src-tauri/target/release/bundle/macos/Cronos.app" "/Applications/Cronos.app"

echo
echo "✅ Done! Cronos is now in your Applications folder."
echo "   Opening it now — right-click its Dock icon and"
echo "   choose Options > Keep in Dock."
open "/Applications/Cronos.app"
