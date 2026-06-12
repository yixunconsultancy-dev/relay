#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ROOT="$APP_ROOT/src-tauri/target/release/bundle"
DMG_DIR="$BUNDLE_ROOT/dmg"
MACOS_DIR="$BUNDLE_ROOT/macos"

detach_stale_awmos_images() {
  local device mount
  local failed=0
  while IFS=$'\t' read -r device mount; do
    [[ -z "${device:-}" ]] && continue
    echo "Detaching stale Cronos disk image: $device ${mount:-}"
    if hdiutil detach "$device" >/dev/null 2>&1; then
      continue
    fi
    if hdiutil detach "$device" -force >/dev/null 2>&1; then
      continue
    fi
    echo "Could not detach $device. Close any open Cronos installer windows and rerun this command."
    failed=1
  done < <(
    hdiutil info 2>/dev/null |
      awk -v root="$APP_ROOT" '
        /^image-path[[:space:]]*:/ {
          path = $0
          sub(/^[^:]+:[[:space:]]*/, "", path)
          current = (index(path, root "/src-tauri/target/release/bundle/") == 1)
        }
        /^\/dev\// {
          mount = $NF
          if (mount ~ /^\/Volumes\// && (current || mount == "/Volumes/Cronos")) {
            print $1 "\t" mount
          }
        }
        /^================================================/ {
          current = 0
        }
      '
  )
  return "$failed"
}

remove_stale_dmg_files() {
  shopt -s nullglob
  local file
  for file in "$DMG_DIR"/rw.*.dmg "$DMG_DIR"/Cronos_*.dmg "$MACOS_DIR"/rw.*.dmg; do
    echo "Removing stale DMG build artifact: $file"
    rm -f "$file"
  done
}

detach_stale_awmos_images
remove_stale_dmg_files
