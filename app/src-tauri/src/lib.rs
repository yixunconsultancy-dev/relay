use std::env;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

/// Walk upward from `start` looking for a kit folder. A kit folder is
/// identified by the presence of `data/relationship_os.sqlite3` AND
/// `scripts/relationship_os.py`. Returns the kit root, not the inner files.
fn find_kit_root(start: &Path) -> Option<PathBuf> {
    let mut current: &Path = start;
    loop {
        let db = current.join("data").join("relationship_os.sqlite3");
        let script = current.join("scripts").join("relationship_os.py");
        if db.exists() && script.exists() {
            return Some(current.to_path_buf());
        }
        match current.parent() {
            Some(parent) if parent != current => current = parent,
            _ => return None,
        }
    }
}

/// True if a path looks like a kit folder. Used to validate user picks.
fn is_kit_root(path: &Path) -> bool {
    path.join("data").join("relationship_os.sqlite3").exists()
        && path.join("scripts").join("relationship_os.py").exists()
}

fn kit_root_candidates() -> Vec<PathBuf> {
    [
        env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf)),
        env::current_dir().ok(),
    ]
    .into_iter()
    .flatten()
    .collect()
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
struct AppConfig {
    kit_root: Option<String>,
}

fn config_path() -> Result<PathBuf, String> {
    let base =
        dirs::config_dir().ok_or_else(|| "Could not resolve user config directory".to_string())?;
    Ok(base.join("com.awm.relationshipos").join("config.json"))
}

fn load_config() -> AppConfig {
    let path = match config_path() {
        Ok(p) => p,
        Err(_) => return AppConfig::default(),
    };
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(_) => return AppConfig::default(),
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn save_config(cfg: &AppConfig) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("failed to create config dir: {e}"))?;
    }
    let bytes =
        serde_json::to_vec_pretty(cfg).map_err(|e| format!("failed to serialize config: {e}"))?;
    std::fs::write(&path, bytes).map_err(|e| format!("failed to write {}: {e}", path.display()))?;
    Ok(())
}

/// Cached kit root for this app instance. Set on first successful resolve
/// or when the user picks a folder. Reads use the cache to avoid repeated
/// filesystem walks; writes update both the cache and the on-disk config.
#[derive(Default)]
struct KitRootState(Mutex<Option<PathBuf>>);

fn resolve_kit_root_impl(state: &State<KitRootState>) -> Result<PathBuf, String> {
    // 1. Cached value for this run.
    if let Ok(guard) = state.0.lock() {
        if let Some(p) = guard.clone() {
            if is_kit_root(&p) {
                return Ok(p);
            }
        }
    }

    // 2. Env var escape hatch.
    if let Ok(env_path) = env::var("RELATIONSHIP_OS_KIT_ROOT") {
        let p = PathBuf::from(env_path.trim());
        if is_kit_root(&p) {
            cache_kit_root(state, &p);
            return Ok(p);
        }
    }

    // 3. Persisted user pick.
    let cfg = load_config();
    if let Some(saved) = cfg.kit_root {
        let p = PathBuf::from(saved.trim());
        if is_kit_root(&p) {
            cache_kit_root(state, &p);
            return Ok(p);
        }
    }

    // 4. Walk-up discovery.
    for start in kit_root_candidates() {
        if let Some(root) = find_kit_root(&start) {
            cache_kit_root(state, &root);
            return Ok(root);
        }
    }

    Err(
        "Could not locate the kit root. Set RELATIONSHIP_OS_KIT_ROOT, launch the app from inside a kit folder, or pick the kit folder from the first-run screen."
            .to_string(),
    )
}

fn cache_kit_root(state: &State<KitRootState>, root: &Path) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(root.to_path_buf());
    }
}

#[tauri::command]
fn resolve_db_path(state: State<KitRootState>) -> Result<String, String> {
    if let Ok(env_path) = env::var("RELATIONSHIP_OS_DB_PATH") {
        if !env_path.trim().is_empty() {
            return Ok(env_path);
        }
    }
    let root = resolve_kit_root_impl(&state)?;
    Ok(root
        .join("data")
        .join("relationship_os.sqlite3")
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
fn resolve_kit_root(state: State<KitRootState>) -> Result<String, String> {
    resolve_kit_root_impl(&state).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn validate_kit_root(path: String) -> Result<bool, String> {
    Ok(is_kit_root(Path::new(&path)))
}

#[derive(Debug, Serialize)]
struct DirectoryValidationResult {
    ok: bool,
    message: String,
    resolved_path: String,
}

fn resolve_directory_setting(root: &Path, raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return root.join("vault");
    }
    if trimmed == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        path
    } else {
        root.join(path)
    }
}

#[tauri::command]
fn validate_directory_path(
    path: String,
    state: State<KitRootState>,
) -> Result<DirectoryValidationResult, String> {
    let root = resolve_kit_root_impl(&state)?;
    let uses_default = path.trim().is_empty();
    let resolved = resolve_directory_setting(&root, &path);
    let resolved_path = resolved.to_string_lossy().into_owned();
    if !resolved.exists() {
        if uses_default {
            return Ok(DirectoryValidationResult {
                ok: true,
                message: format!("Default vault directory will be used: {resolved_path}"),
                resolved_path,
            });
        }
        return Ok(DirectoryValidationResult {
            ok: false,
            message: format!("Directory does not exist: {resolved_path}"),
            resolved_path,
        });
    }
    if !resolved.is_dir() {
        return Ok(DirectoryValidationResult {
            ok: false,
            message: format!("Path is not a directory: {resolved_path}"),
            resolved_path,
        });
    }
    if let Err(e) = std::fs::read_dir(&resolved) {
        return Ok(DirectoryValidationResult {
            ok: false,
            message: format!("App cannot read this directory: {e}"),
            resolved_path,
        });
    }
    Ok(DirectoryValidationResult {
        ok: true,
        message: format!("Directory is available: {resolved_path}"),
        resolved_path,
    })
}

#[derive(Debug, Serialize)]
struct SetKitRootResult {
    ok: bool,
    db_path: String,
}

/// Persist a user-chosen kit folder and prime the cache. The JS side calls
/// this after a successful folder-picker selection; subsequent calls to
/// `resolve_kit_root` / `resolve_db_path` will return the new value.
#[tauri::command]
fn set_kit_root(path: String, state: State<KitRootState>) -> Result<SetKitRootResult, String> {
    let p = PathBuf::from(path.trim());
    if !is_kit_root(&p) {
        return Err(format!(
            "{} does not look like a kit folder (need data/relationship_os.sqlite3 and scripts/relationship_os.py).",
            p.display()
        ));
    }
    let mut cfg = load_config();
    cfg.kit_root = Some(p.to_string_lossy().into_owned());
    save_config(&cfg)?;
    cache_kit_root(&state, &p);
    Ok(SetKitRootResult {
        ok: true,
        db_path: p
            .join("data")
            .join("relationship_os.sqlite3")
            .to_string_lossy()
            .into_owned(),
    })
}

/// Clear the persisted kit root so the next launch shows the picker again.
#[tauri::command]
fn forget_kit_root(state: State<KitRootState>) -> Result<(), String> {
    let mut cfg = load_config();
    cfg.kit_root = None;
    save_config(&cfg)?;
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KitCommandResult {
    pub ok: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Shell out to `python3 scripts/relationship_os.py [args]` from the kit root.
///
/// - `args` is appended verbatim after the script path.
/// - If `json_payload` is Some, it's written to a temporary file and
///   `--json-file <path>` is prepended to the args. This lets the JS side
///   pass typed payloads (touchpoints, deck specs) without shell-escaping.
/// - The subprocess captures stdout + stderr. Non-zero exit codes are
///   returned in the result struct, not raised as errors, so the JS layer
///   can surface them in the UI.
#[tauri::command]
fn run_kit_command(
    args: Vec<String>,
    json_payload: Option<String>,
    state: State<KitRootState>,
) -> Result<KitCommandResult, String> {
    let root = resolve_kit_root_impl(&state)?;
    let script = root.join("scripts").join("relationship_os.py");

    let mut temp_file: Option<tempfile::NamedTempFile> = None;
    let mut final_args = args;
    if let Some(payload) = json_payload {
        let mut tmp = tempfile::Builder::new()
            .prefix("awm-kit-payload-")
            .suffix(".json")
            .tempfile()
            .map_err(|e| format!("failed to create temp file: {e}"))?;
        tmp.write_all(payload.as_bytes())
            .map_err(|e| format!("failed to write payload: {e}"))?;
        let path = tmp.path().to_string_lossy().into_owned();
        inject_json_file_arg(&mut final_args, path);
        temp_file = Some(tmp);
    }

    let python = env::var("RELATIONSHIP_OS_PYTHON").unwrap_or_else(|_| "python3".to_string());

    // When launched from Finder/launchd, PATH usually only has /usr/bin and
    // /bin so `python3` resolves to the system Python. Prepend common Python
    // manager shims and brew bins so the subprocess can still find the user's
    // configured Python.
    let mut current_path = env::var("PATH").unwrap_or_default();
    let mut extras: Vec<String> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        extras.push(
            home.join(".pyenv")
                .join("shims")
                .to_string_lossy()
                .into_owned(),
        );
        extras.push(
            home.join(".asdf")
                .join("shims")
                .to_string_lossy()
                .into_owned(),
        );
    }
    extras.push("/opt/homebrew/bin".to_string());
    extras.push("/usr/local/bin".to_string());
    let current_parts: Vec<&str> = current_path.split(':').filter(|p| !p.is_empty()).collect();
    let additions: Vec<String> = extras
        .into_iter()
        .filter(|extra| !current_parts.iter().any(|p| *p == extra.as_str()))
        .collect();
    if !additions.is_empty() {
        if current_path.is_empty() {
            current_path = additions.join(":");
        } else {
            current_path = format!("{}:{current_path}", additions.join(":"));
        }
    }

    let output = Command::new(&python)
        .arg(&script)
        .args(&final_args)
        .current_dir(&root)
        .env("PATH", &current_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to spawn {python}: {e}"))?;

    drop(temp_file);

    Ok(KitCommandResult {
        ok: output.status.success(),
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

#[derive(Debug, Serialize)]
pub struct GeneratedDocument {
    pub kind: String,
    pub path: String,
    pub filename: String,
    pub size: u64,
    pub modified_at: Option<String>,
    pub contact_slug: Option<String>,
    pub date_iso: Option<String>,
}

#[tauri::command]
fn list_generated_documents(state: State<KitRootState>) -> Result<Vec<GeneratedDocument>, String> {
    let root = resolve_kit_root_impl(&state)?;
    let generated = root.join("vault").join("Generated");
    if !generated.exists() {
        return Ok(Vec::new());
    }
    let kinds = ["appointment_summary", "proposal", "slides", "writeup"];
    let mut out = Vec::new();
    for kind in kinds {
        let dir = generated.join(kind);
        if !dir.exists() {
            continue;
        }
        let entries = match std::fs::read_dir(&dir) {
            Ok(it) => it,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let filename = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            if filename.starts_with('.') {
                continue;
            }
            let meta = entry.metadata().ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified_at = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| format_unix_secs(d.as_secs()));
            let (date_iso, contact_slug) = parse_generated_filename(&filename);
            out.push(GeneratedDocument {
                kind: kind.to_string(),
                path: path.to_string_lossy().into_owned(),
                filename,
                size,
                modified_at,
                contact_slug,
                date_iso,
            });
        }
    }
    out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(out)
}

#[tauri::command]
fn open_generated_document(path: String, state: State<KitRootState>) -> Result<(), String> {
    let target = resolve_generated_document_path(&state, &path)?;

    let status = Command::new("open")
        .arg(&target)
        .status()
        .map_err(|e| format!("failed to launch macOS open: {e}"))?;
    if status.success() {
        return Ok(());
    }

    // macOS `open` returns non-zero when no installed app can handle the
    // file (common for .pptx on machines without PowerPoint or Keynote).
    // Surface a friendlier error and steer the user to Reveal in Finder.
    let ext = target
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("file")
        .to_string();
    Err(format!(
        "macOS couldn't open this {ext} file — no app on this machine is registered to handle it. \
         Try \"Reveal in Finder\" instead, then open it manually or with a different app."
    ))
}

#[tauri::command]
fn reveal_generated_document(path: String, state: State<KitRootState>) -> Result<(), String> {
    let target = resolve_generated_document_path(&state, &path)?;
    let status = Command::new("open")
        .arg("-R")
        .arg(&target)
        .status()
        .map_err(|e| format!("failed to launch macOS open -R: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("macOS open -R exited with status {status}"))
    }
}

/// Shared path-resolution + sandbox check for the document open/reveal commands.
fn resolve_generated_document_path(
    state: &State<KitRootState>,
    path: &str,
) -> Result<PathBuf, String> {
    let root = resolve_kit_root_impl(state)?;
    let generated_root = root.join("vault").join("Generated");
    let generated_root = generated_root
        .canonicalize()
        .map_err(|e| format!("could not resolve generated documents folder: {e}"))?;
    let target = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| format!("could not resolve document path: {e}"))?;

    if !target.starts_with(&generated_root) {
        return Err("refusing to act on a file outside vault/Generated".to_string());
    }
    if !target.is_file() {
        return Err("generated document is not a file".to_string());
    }
    Ok(target)
}

fn format_unix_secs(secs: u64) -> String {
    let secs_in_day = secs % 86400;
    let h = secs_in_day / 3600;
    let m = (secs_in_day % 3600) / 60;
    let s = secs_in_day % 60;
    let days = secs / 86400;
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, h, m, s
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 {
        z / 146097
    } else {
        (z - 146096) / 146097
    };
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

// Insert `--json-file <path>` immediately after the subcommand token.
//
// The kit's argparse exposes `--json-file` as a subparser-level option (e.g.
// on `log-touchpoint`), not as a global flag. Callers pass argv shaped like
// `["--format=json", "log-touchpoint"]`; we must end up with
// `["--format=json", "log-touchpoint", "--json-file", "<path>"]`, not
// `["--format=json", "--json-file", "<path>", "log-touchpoint"]`.
//
// Strategy: skip the kit's top-level options before identifying the
// subcommand. This keeps `--env .env --format=json log-touchpoint` from
// mistaking `.env` for the subcommand. If no positional is found, append at
// the end and let argparse surface the missing-subcommand error.
fn inject_json_file_arg(args: &mut Vec<String>, json_file_path: String) {
    let insert_at = find_kit_subcommand_index(args)
        .map(|i| i + 1)
        .unwrap_or(args.len());
    args.insert(insert_at, "--json-file".to_string());
    args.insert(insert_at + 1, json_file_path);
}

fn find_kit_subcommand_index(args: &[String]) -> Option<usize> {
    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "--env" | "--format" => {
                i += 2;
            }
            "--help" | "-h" => {
                i += 1;
            }
            "--" => {
                return None;
            }
            _ if arg.starts_with("--env=") || arg.starts_with("--format=") => {
                i += 1;
            }
            _ if arg.starts_with("--") => {
                i += 1;
            }
            _ => {
                return Some(i);
            }
        }
    }
    None
}

// Parse a generated-doc filename of the form `YYYY-MM-DD <slug>[-purpose].ext`.
// Returns the date and the full slug-portion (everything after the date and
// before the extension). The contact slug can contain hyphens (e.g.
// "demo-client") and so can the purpose, so we deliberately do NOT split at
// the first hyphen — contact matching is done JS-side by longest-prefix
// against the known contact slugs.
fn parse_generated_filename(name: &str) -> (Option<String>, Option<String>) {
    let dot = name.rfind('.').unwrap_or(name.len());
    let stem = &name[..dot];
    let parts: Vec<&str> = stem.splitn(2, ' ').collect();
    if parts.len() < 2 {
        return (None, None);
    }
    let date_part = parts[0];
    let date_ok = date_part.len() == 10
        && date_part.as_bytes().get(4) == Some(&b'-')
        && date_part.as_bytes().get(7) == Some(&b'-');
    let date = if date_ok {
        Some(date_part.to_string())
    } else {
        None
    };
    let rest = parts[1].trim();
    let contact_slug = if rest.is_empty() {
        None
    } else {
        Some(rest.to_string())
    };
    (date, contact_slug)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn injects_json_file_after_subcommand_when_global_flag_present() {
        // The Quick Log path: ["--format=json", "log-touchpoint"] + payload.
        let mut args = s(&["--format=json", "log-touchpoint"]);
        inject_json_file_arg(&mut args, "/tmp/p.json".to_string());
        assert_eq!(
            args,
            s(&[
                "--format=json",
                "log-touchpoint",
                "--json-file",
                "/tmp/p.json"
            ])
        );
    }

    #[test]
    fn injects_json_file_after_subcommand_with_no_global_flag() {
        let mut args = s(&["log-touchpoint"]);
        inject_json_file_arg(&mut args, "/tmp/p.json".to_string());
        assert_eq!(args, s(&["log-touchpoint", "--json-file", "/tmp/p.json"]));
    }

    #[test]
    fn injects_json_file_before_subcommand_options() {
        // log-touchpoint may already carry its own flags from the caller.
        let mut args = s(&["--format=json", "log-touchpoint", "--contact-name", "X"]);
        inject_json_file_arg(&mut args, "/tmp/p.json".to_string());
        assert_eq!(
            args,
            s(&[
                "--format=json",
                "log-touchpoint",
                "--json-file",
                "/tmp/p.json",
                "--contact-name",
                "X",
            ])
        );
    }

    #[test]
    fn injects_json_file_after_subcommand_when_top_level_options_have_values() {
        let mut args = s(&["--env", ".env.local", "--format=json", "log-touchpoint"]);
        inject_json_file_arg(&mut args, "/tmp/p.json".to_string());
        assert_eq!(
            args,
            s(&[
                "--env",
                ".env.local",
                "--format=json",
                "log-touchpoint",
                "--json-file",
                "/tmp/p.json",
            ])
        );
    }

    #[test]
    fn injects_json_file_after_subcommand_when_format_uses_separate_value() {
        let mut args = s(&["--format", "json", "log-touchpoint"]);
        inject_json_file_arg(&mut args, "/tmp/p.json".to_string());
        assert_eq!(
            args,
            s(&[
                "--format",
                "json",
                "log-touchpoint",
                "--json-file",
                "/tmp/p.json",
            ])
        );
    }

    #[test]
    fn does_not_treat_env_value_that_matches_command_as_subcommand() {
        let mut args = s(&["--env", "status", "--format=json", "log-touchpoint"]);
        inject_json_file_arg(&mut args, "/tmp/p.json".to_string());
        assert_eq!(
            args,
            s(&[
                "--env",
                "status",
                "--format=json",
                "log-touchpoint",
                "--json-file",
                "/tmp/p.json",
            ])
        );
    }

    #[test]
    fn appends_json_file_when_no_subcommand() {
        // Argparse will then complain about the missing subcommand, which is
        // the correct surface — but we must not crash building the argv.
        let mut args = s(&["--format=json"]);
        inject_json_file_arg(&mut args, "/tmp/p.json".to_string());
        assert_eq!(args, s(&["--format=json", "--json-file", "/tmp/p.json"]));
    }

    #[test]
    fn parses_filename_with_compound_contact_slug() {
        // "demo-client" is a single contact; only the date should be stripped.
        let (date, slug) =
            parse_generated_filename("2026-05-19 demo-client-retirement-planning.pdf");
        assert_eq!(date.as_deref(), Some("2026-05-19"));
        assert_eq!(slug.as_deref(), Some("demo-client-retirement-planning"));
    }

    #[test]
    fn parses_filename_without_extension() {
        let (date, slug) = parse_generated_filename("2026-05-19 sarah-lim");
        assert_eq!(date.as_deref(), Some("2026-05-19"));
        assert_eq!(slug.as_deref(), Some("sarah-lim"));
    }

    #[test]
    fn returns_none_for_unrecognized_filename() {
        let (date, slug) = parse_generated_filename("random-thing.pdf");
        assert_eq!(date, None);
        assert_eq!(slug, None);
    }

    #[test]
    fn resolves_relative_directory_setting_against_kit_root() {
        let root = PathBuf::from("/tmp/kit");
        let path = resolve_directory_setting(&root, "vault/Generated");
        assert_eq!(path, PathBuf::from("/tmp/kit/vault/Generated"));
    }

    #[test]
    fn keeps_absolute_directory_setting_absolute() {
        let root = PathBuf::from("/tmp/kit");
        let path = resolve_directory_setting(&root, "/Users/demo/Vault");
        assert_eq!(path, PathBuf::from("/Users/demo/Vault"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(KitRootState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            resolve_db_path,
            resolve_kit_root,
            validate_kit_root,
            validate_directory_path,
            set_kit_root,
            forget_kit_root,
            run_kit_command,
            list_generated_documents,
            open_generated_document,
            reveal_generated_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
