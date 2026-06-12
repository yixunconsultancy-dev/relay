import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FolderOpen,
  Moon,
  Save,
  Sun,
  Undo2,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import {
  fetchLatestExternalEvent,
  queryKeys,
  useSettings,
} from "@/lib/queries";
import { updateSetting } from "@/lib/kit";
import {
  applyScheme,
  currentScheme,
  setStoredScheme,
  type Scheme,
} from "@/lib/theme";
import { formatRelative, formatShortDate } from "@/lib/format";

const APP_VERSION = "0.1.0";

async function saveSettings(updates: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await updateSetting(key, value);
  }
}

interface HermesStatus {
  state: "live" | "stale" | "unknown";
  lastEvent: { id: string; timestamp: string; source: string; label: string } | null;
}

interface DirectoryValidation {
  ok: boolean;
  message: string;
  resolved_path: string;
}

async function validateDirectoryPath(path: string): Promise<DirectoryValidation> {
  return invoke<DirectoryValidation>("validate_directory_path", { path });
}

// Map raw `events.source` strings to a short consultant-facing label.
// Sources from the kit CLI use kebab-case (log-touchpoint, cancel-reminder,
// etc.); sources from the app start with `app:`. Unknown sources fall back
// to a Title-cased version of the slug.
function formatEventSourceLabel(source: string): string {
  const known: Record<string, string> = {
    "log-touchpoint": "Touchpoint logged",
    "complete-reminder": "Reminder completed",
    "snooze-reminder": "Reminder snoozed",
    "cancel-reminder": "Reminder cancelled",
    "merge-contacts": "Contacts merged",
    "archive-contact": "Contact archived",
    "unarchive-contact": "Contact unarchived",
    "rename-contact": "Contact renamed",
    "cleanup-duplicates": "Duplicates cleaned up",
    "app:edit-contact": "Contact edited (app)",
    "app:daily-focus": "Daily focus saved",
    "app:settings": "Settings changed",
    "hermes:update-contact-fields": "Contact edited (Cronos)",
    "add-policy": "Policy added",
    "update-policy": "Policy updated",
    "archive-policy": "Policy archived",
  };
  if (known[source]) return known[source];
  const cleaned = source
    .replace(/^app:/, "")
    .replace(/^hermes:/, "")
    .replace(/[-_:]+/g, " ")
    .trim();
  if (!cleaned) return source;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function fetchHermesStatus(): Promise<HermesStatus> {
  // Anything not from `app:*` is treated as Hermes/CLI-originated. Keep this
  // bounded so the settings screen does not scan the full events table forever.
  const last = await fetchLatestExternalEvent();
  if (!last) return { state: "unknown", lastEvent: null };
  const age = Date.now() - Date.parse(last.timestamp);
  return {
    state: age < 24 * 60 * 60 * 1000 ? "live" : "stale",
    lastEvent: {
      id: last.id,
      timestamp: last.timestamp,
      source: last.source,
      label: formatEventSourceLabel(last.source),
    },
  };
}

export function SettingsRoute() {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const hermes = useQuery({
    queryKey: ["settings", "hermes-status"],
    queryFn: fetchHermesStatus,
    refetchInterval: 10000,
  });
  const dbPath = useQuery({
    queryKey: ["settings", "db-path"],
    queryFn: () => invoke<string>("resolve_db_path"),
  });
  const kitRoot = useQuery({
    queryKey: ["settings", "kit-root"],
    queryFn: () => invoke<string>("resolve_kit_root"),
  });

  const [scheme, setScheme] = useState<Scheme>(currentScheme());
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [vaultDir, setVaultDir] = useState("");
  const seeded = settings.data;
  const vaultValidation = useQuery({
    queryKey: ["settings", "vault-directory-validation", vaultDir],
    queryFn: () => validateDirectoryPath(vaultDir),
    enabled: settings.isSuccess,
    retry: false,
    staleTime: 1000,
  });

  // Deliverable scheme is independent of the app's UI theme. It lives in
  // the kit's settings.design_scheme and is read by the Python generators.
  const deliverableScheme: Scheme =
    seeded?.design_scheme === "awm-dark" ? "awm-dark" : "awm-light";

  useEffect(() => {
    if (!seeded) return;
    setName(seeded.name ?? "");
    setTimezone(seeded.timezone ?? "");
    setVaultDir(seeded.vault_dir ?? "");
  }, [seeded]);

  const dirty =
    seeded &&
    (name !== (seeded.name ?? "") ||
      timezone !== (seeded.timezone ?? "") ||
      vaultDir !== (seeded.vault_dir ?? ""));
  const vaultInvalid = vaultValidation.data?.ok === false;

  const save = useMutation({
    mutationFn: async () => {
      const validation = await validateDirectoryPath(vaultDir);
      if (!validation.ok) throw new Error(validation.message);
      return saveSettings({
        name,
        timezone,
        vault_dir: vaultDir,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({
        queryKey: ["settings", "vault-directory-validation", vaultDir],
      });
    },
  });
  const canSaveSettings =
    Boolean(dirty) &&
    !save.isPending &&
    !vaultValidation.isFetching &&
    !vaultInvalid;

  /** App UI theme only — does not touch the kit settings table. */
  function applyAndStoreScheme(next: Scheme) {
    setScheme(next);
    setStoredScheme(next);
    applyScheme(next);
  }

  /** Deliverable scheme — writes directly to settings.design_scheme. */
  const setDeliverableScheme = useMutation({
    mutationFn: (next: Scheme) => saveSettings({ design_scheme: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-light text-fg leading-none">
              Settings
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              Local-only configuration. Saved to the kit's settings table.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => {
                if (!seeded) return;
                setName(seeded.name ?? "");
                setTimezone(seeded.timezone ?? "");
                setVaultDir(seeded.vault_dir ?? "");
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={!canSaveSettings}
              onClick={() => save.mutate()}
            >
              <Save className="h-3.5 w-3.5" />
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        {save.isError && (
          <p className="mt-2 text-xs text-status-error">
            {(save.error as Error).message ?? String(save.error)}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8 max-w-3xl">
        <section className="space-y-4">
          <h2 className="awm-label">Consultant</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Name" htmlFor="settings-name">
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field
              label="Timezone"
              htmlFor="settings-tz"
              hint="IANA, e.g. Asia/Singapore"
            >
              <Input
                id="settings-tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </Field>
            <Field
              label="Vault directory"
              htmlFor="settings-vault"
              hint="Relative to the kit root, or an absolute folder path."
              className="col-span-2"
            >
              <Input
                id="settings-vault"
                value={vaultDir}
                onChange={(e) => setVaultDir(e.target.value)}
              />
              {vaultValidation.isError ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-status-error">
                  <AlertTriangle className="h-3 w-3" />
                  {vaultValidation.error instanceof Error
                    ? vaultValidation.error.message
                    : String(vaultValidation.error)}
                </p>
              ) : vaultValidation.data ? (
                <p
                  className={
                    vaultValidation.data.ok
                      ? "inline-flex items-center gap-1.5 text-xs text-status-success"
                      : "inline-flex items-center gap-1.5 text-xs text-status-error"
                  }
                >
                  {vaultValidation.data.ok ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  {vaultValidation.isFetching
                    ? "Checking directory..."
                    : vaultValidation.data.message}
                </p>
              ) : null}
            </Field>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="awm-label">App theme</h2>
          <p className="text-xs text-fg-subtle">
            Affects this window only. Saved locally; doesn't change generated
            deliverables.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant={scheme === "awm-dark" ? "gold" : "secondary"}
              size="sm"
              onClick={() => applyAndStoreScheme("awm-dark")}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </Button>
            <Button
              variant={scheme === "awm-light" ? "gold" : "secondary"}
              size="sm"
              onClick={() => applyAndStoreScheme("awm-light")}
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="awm-label">Deliverable scheme</h2>
          <p className="text-xs text-fg-subtle">
            Applies to PDFs, slides, and writeups generated by the kit. The
            current setting is{" "}
            <code className="text-gold">design_scheme = {deliverableScheme}</code>
            . Independent of the app theme above.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant={deliverableScheme === "awm-dark" ? "gold" : "secondary"}
              size="sm"
              disabled={setDeliverableScheme.isPending}
              onClick={() => setDeliverableScheme.mutate("awm-dark")}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark deliverables
            </Button>
            <Button
              variant={deliverableScheme === "awm-light" ? "gold" : "secondary"}
              size="sm"
              disabled={setDeliverableScheme.isPending}
              onClick={() => setDeliverableScheme.mutate("awm-light")}
            >
              <Sun className="h-3.5 w-3.5" />
              Light deliverables
            </Button>
          </div>
          {setDeliverableScheme.isError && (
            <p className="text-xs text-status-error">
              {(setDeliverableScheme.error as Error).message ??
                String(setDeliverableScheme.error)}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="awm-label">Cronos connection</h2>
          <div className="rounded-sm border border-border bg-bg-surface p-4 flex items-center gap-4">
            {hermes.data?.state === "live" ? (
              <Wifi className="h-5 w-5 text-status-success" />
            ) : (
              <WifiOff className="h-5 w-5 text-fg-muted" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-body text-sm text-fg">
                  {hermes.data?.state === "live"
                    ? "Recently active"
                    : hermes.data?.state === "stale"
                      ? "Stale"
                      : "No events recorded"}
                </span>
                {hermes.data?.lastEvent && (
                  <Badge tone="neutral" title={hermes.data.lastEvent.source}>
                    {hermes.data.lastEvent.label}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                {hermes.data?.lastEvent
                  ? `Last Hermes/CLI event ${formatRelative(hermes.data.lastEvent.timestamp)} (${formatShortDate(hermes.data.lastEvent.timestamp)})`
                  : "Log a touchpoint via Cronos Telegram or python3 scripts/relationship_os.py log-touchpoint to see the bridge in action."}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="awm-label">Paths</h2>
          <div className="space-y-2">
            <PathRow
              label="Database"
              value={dbPath.data ?? "(resolving…)"}
              icon={<Database className="h-3.5 w-3.5" />}
            />
            <PathRow
              label="Kit root"
              value={kitRoot.data ?? "(resolving…)"}
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              action={
                kitRoot.data
                  ? {
                      label: "Open in Finder",
                      onClick: () => openPath(kitRoot.data!),
                    }
                  : undefined
              }
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="awm-label">About</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-fg-muted">App version</dt>
            <dd className="text-fg/85 font-mono">{APP_VERSION}</dd>
            <dt className="text-fg-muted">Kit interface</dt>
            <dd className="text-fg/85">SQLite + Python kit (shell-out)</dd>
            <dt className="text-fg-muted">Concurrency mode</dt>
            <dd className="text-fg/85">WAL · multi-writer · poll-based</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

function PathRow({
  label,
  value,
  icon,
  action,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-border bg-bg-surface px-3 py-2">
      <span className="text-fg-muted">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="awm-label">{label}</p>
        <p className="font-mono text-xs text-fg/85 truncate">{value}</p>
      </div>
      {action && (
        <Button variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
