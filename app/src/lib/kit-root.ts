// Thin wrappers around the Rust kit-root commands. Used by the first-run
// screen and the Settings page.

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export interface SetKitRootResult {
  ok: boolean;
  db_path: string;
}

export async function resolveKitRoot(): Promise<string> {
  return invoke<string>("resolve_kit_root");
}

export async function tryResolveKitRoot(): Promise<string | null> {
  try {
    return await resolveKitRoot();
  } catch {
    return null;
  }
}

export async function validateKitRoot(path: string): Promise<boolean> {
  return invoke<boolean>("validate_kit_root", { path });
}

export async function setKitRoot(path: string): Promise<SetKitRootResult> {
  return invoke<SetKitRootResult>("set_kit_root", { path });
}

export async function forgetKitRoot(): Promise<void> {
  return invoke<void>("forget_kit_root");
}

/**
 * Open a native folder picker and validate the selection. Returns:
 *   - null if the user cancelled
 *   - { ok: true, path } on a valid kit folder
 *   - { ok: false, path, error } if the user picked something that isn't a kit
 */
export type FolderPickResult =
  | { ok: true; path: string }
  | { ok: false; path: string; error: string }
  | null;

export async function pickKitFolder(): Promise<FolderPickResult> {
  const picked = await openDialog({
    title: "Locate your AWMOS kit folder",
    directory: true,
    multiple: false,
  });
  if (!picked) return null;
  const path = typeof picked === "string" ? picked : picked[0];
  const isKit = await validateKitRoot(path);
  if (!isKit) {
    return {
      ok: false,
      path,
      error:
        "That folder doesn't look like a kit (it needs data/relationship_os.sqlite3 and scripts/relationship_os.py).",
    };
  }
  return { ok: true, path };
}
