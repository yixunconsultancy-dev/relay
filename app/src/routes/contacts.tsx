import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  Bell,
  Cake,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Plus,
  Search,
  Send,
  Upload,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import {
  Badge,
  CONTACT_TYPE_TONE,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import {
  useContacts,
  usePendingReminderCountByContact,
  queryKeys,
} from "@/lib/queries";
import {
  createContact,
  bulkImportContacts,
  sendClientBrief,
  type BulkImportContactsResult,
  type SendClientBriefResult,
} from "@/lib/kit";
import { resetDbConnection } from "@/lib/db";
import {
  CONTACT_TYPES,
  type ContactType,
} from "@/lib/enums";
import { formatShortDate, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Excel template download helper ─────────────────────────────────────────────

/** Ask the Python kit to generate a styled .xlsx template, then open it. */
async function downloadXlsxTemplate(templateName: "clients" | "policies") {
  try {
    // 1. Python writes the .xlsx to vault/Downloads/ and returns its path.
    let result: { ok: boolean; exit_code: number; stdout: string; stderr: string };
    try {
      result = await invoke<{ ok: boolean; exit_code: number; stdout: string; stderr: string }>(
        "run_kit_command",
        { args: ["--format=json", "generate-template", "--name", templateName], jsonPayload: null }
      );
    } catch (invokeErr) {
      alert(`[Step 1 — run_kit_command invoke failed]\n${String(invokeErr)}`);
      return;
    }

    if (!result.ok) {
      alert(`[Step 1 — Python generate-template failed (exit ${result.exit_code})]\nstderr: ${result.stderr}\nstdout: ${result.stdout}`);
      return;
    }

    let payload: { ok: boolean; path: string };
    try {
      payload = JSON.parse(result.stdout) as { ok: boolean; path: string };
    } catch (parseErr) {
      alert(`[Step 2 — JSON.parse failed]\nstdout was: ${result.stdout}\nerror: ${String(parseErr)}`);
      return;
    }

    if (!payload.ok || !payload.path) {
      alert(`[Step 2 — unexpected payload]\n${result.stdout}`);
      return;
    }

    // 2. Rust opens the file — only Rust has the entitlements to launch apps.
    try {
      await invoke("open_vault_file", { path: payload.path });
    } catch (openErr) {
      alert(`[Step 3 — open_vault_file failed]\npath: ${payload.path}\nerror: ${String(openErr)}`);
    }
  } catch (e) {
    alert(`[downloadXlsxTemplate — unexpected error]\n${String(e)}`);
  }
}

type SortKey = "name" | "type" | "last_touch" | "birthday";
type SortDir = "asc" | "desc";

/** Compare two values for sorting, with blanks always sinking to the bottom
 * regardless of direction (so empty birthdays don't dominate the top). */
function compareValues(a: string, b: string, dir: SortDir): number {
  const ae = !a.trim();
  const be = !b.trim();
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  const c = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? c : -c;
}

export function ContactsRoute() {
  const contacts = useContacts();
  const reminderCounts = usePendingReminderCountByContact();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<ContactType>>(new Set());
  const [pendingOnly, setPendingOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  /** Click a column header to sort. Same column toggles asc/desc; a new
   * column resets to ascending. */
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Per-contact brief send state. Keyed by contact id so multiple buttons
  // can be in different states simultaneously.
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [briefResult, setBriefResult] = useState<SendClientBriefResult | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  async function handleSendBrief(contactId: string) {
    setSendingId(contactId);
    setBriefError(null);
    try {
      const r = await sendClientBrief(contactId);
      if (r.ok) {
        setSentIds((prev) => {
          const next = new Set(prev);
          next.add(contactId);
          return next;
        });
        // Clear the visual "sent" tick after 3s.
        setTimeout(() => {
          setSentIds((prev) => {
            const next = new Set(prev);
            next.delete(contactId);
            return next;
          });
        }, 3000);
      } else {
        // Either telegram_not_configured or another structured failure —
        // open the dialog with the full payload so we can show the preview.
        setBriefResult(r);
      }
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingId(null);
    }
  }

  // New client dialog
  const [newOpen, setNewOpen] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newMiddleName, setNewMiddleName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newType, setNewType] = useState<string>("warming");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Bulk import state
  const [importResult, setImportResult] = useState<BulkImportContactsResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const bulkImport = useMutation({
    mutationFn: async () => {
      const file = await openFilePicker({
        title: "Select client file (CSV or Excel)",
        filters: [{ name: "CSV / Excel", extensions: ["csv", "xlsx"] }],
        multiple: false,
      });
      if (!file) return null;
      const filePath = typeof file === "string" ? file : (file as { path: string }).path ?? String(file);
      return bulkImportContacts(filePath);
    },
    onSuccess: (result) => {
      if (!result) return; // user cancelled picker
      setImportResult(result);
      if (result.created > 0) {
        // The Python subprocess writes to SQLite while the Tauri SQL plugin
        // holds an open connection. In WAL mode, that open connection may be
        // reading from a snapshot that predates Python's commit.
        // Dropping and reopening the connection forces a fresh snapshot, so the
        // next SELECT sees all of Python's newly-inserted rows.
        resetDbConnection();
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts }).then(() =>
          queryClient.refetchQueries({ queryKey: queryKeys.contacts })
        );
      }
    },
    onError: (e) => setImportError(e instanceof Error ? e.message : String(e)),
  });

  function resetNew() {
    setNewFirstName(""); setNewMiddleName(""); setNewLastName("");
    setNewType("warming");
    setNewPhone(""); setNewEmail("");
  }

  // Combine the three name fields into a single display name for the DB.
  // Middle name is optional; filter() drops blanks so "John  Doe" never happens.
  const combinedNewName = [
    newFirstName.trim(),
    newMiddleName.trim(),
    newLastName.trim(),
  ].filter(Boolean).join(" ");

  const canCreateNew = newFirstName.trim().length > 0 && newLastName.trim().length > 0;

  const newContact = useMutation({
    mutationFn: () => createContact({
      name: combinedNewName,
      type: newType,
      relationship_stage: "warming",
      phone: newPhone.trim(),
      email: newEmail.trim(),
    }),
    onSuccess: (result) => {
      // Same WAL-snapshot workaround as the bulk-import path:
      // the Python subprocess just committed the new contact row, but the
      // Tauri SQL plugin's open connection is reading from a pre-commit
      // snapshot. Drop the connection so the next query (including the
      // detail page we navigate to below) opens a fresh one and sees the
      // new row. Without this, the detail route renders "Contact not found".
      resetDbConnection();
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      setNewOpen(false);
      resetNew();
      navigate(`/contacts/${result.contact.id}`);
    },
  });

  const rows = useMemo(() => {
    if (!contacts.data) return [];
    const q = search.trim().toLowerCase();
    const counts = reminderCounts.data ?? {};
    const filtered = contacts.data.filter((c) => {
      const archivedAt = (c.archived_at || "").trim();
      if (!showArchived && archivedAt) return false;
      if (typeFilter.size && !typeFilter.has(c.type as ContactType))
        return false;
      if (pendingOnly && !(counts[c.id] > 0)) return false;
      if (q) {
        const haystack = [
          c.name,
          c.occupation,
          c.company,
          c.email,
          c.phone,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return compareValues(a.name || "", b.name || "", sortDir);
        case "type":
          return compareValues(
            humanize(a.type || ""),
            humanize(b.type || ""),
            sortDir
          );
        case "last_touch":
          return compareValues(
            a.last_touch_date || "",
            b.last_touch_date || "",
            sortDir
          );
        case "birthday":
          // Birthdays are YYYY-MM-DD; compare on month-day so order is
          // calendar-based (Jan → Dec), not "born earliest".
          return compareValues(
            (a.birthday || "").slice(5),
            (b.birthday || "").slice(5),
            sortDir
          );
      }
    });
  }, [contacts.data, reminderCounts.data, search, typeFilter, pendingOnly, showArchived, sortKey, sortDir]);

  const totalShown = rows.length;
  const total = contacts.data?.length ?? 0;
  const archivedCount = useMemo(
    () => (contacts.data ?? []).filter((c) => (c.archived_at || "").trim()).length,
    [contacts.data]
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6 sticky top-0 z-10">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl font-light text-fg leading-none">
              Contacts
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              {totalShown.toLocaleString()} of {total.toLocaleString()} shown
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, role, company…"
                className="pl-9"
              />
            </div>
            <button
              type="button"
              onClick={() => downloadXlsxTemplate("clients")}
              title="Download Excel import template"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-xs text-fg-muted hover:border-gold/60 hover:text-fg hover:bg-bg-raised/60 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Template
            </button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => { setImportError(null); bulkImport.mutate(); }}
              disabled={bulkImport.isPending}
            >
              <Upload className="h-4 w-4" />
              {bulkImport.isPending ? "Importing…" : "Import"}
            </Button>
            <Button variant="gold" size="md" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              New client
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <FilterChips
            label="Type"
            options={CONTACT_TYPES}
            selected={typeFilter}
            onToggle={(opt) =>
              setTypeFilter((prev) => toggle(prev, opt as ContactType))
            }
          />
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider font-condensed font-bold text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-gold"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
            />
            <Bell className="h-3 w-3" />
            Has pending reminders
          </label>
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 text-xs uppercase tracking-wider font-condensed font-bold text-fg-muted cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-gold"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <Archive className="h-3 w-3" />
              Show archived ({archivedCount})
            </label>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {contacts.isPending ? (
          <p className="p-8 text-sm text-fg-muted">Loading contacts…</p>
        ) : contacts.isError ? (
          <p className="p-8 text-sm text-status-error">
            Could not load contacts: {String(contacts.error)}
          </p>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            {total === 0 ? (
              <>
                <p className="font-display text-xl text-fg-muted">
                  No contacts yet.
                </p>
                <p className="mt-2 text-sm text-fg-subtle max-w-md mx-auto">
                  Send a message to your Cronos Telegram bot like
                  <span className="text-fg/80 italic">
                    {" "}"Had coffee with Anna today, follow up next Friday"
                  </span>
                  {" "}and a contact will appear here.
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-xl text-fg-muted">
                  No contacts match these filters.
                </p>
                <p className="mt-2 text-sm text-fg-subtle">
                  Clear search or adjust filters to see your{" "}
                  {total.toLocaleString()} contact{total === 1 ? "" : "s"}.
                </p>
              </>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-bg-base/95 backdrop-blur">
              <tr className="awm-label border-b border-border text-left">
                <th className="px-8 py-3 font-condensed">
                  <SortHeader
                    label="Name"
                    column="name"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-3 font-condensed">
                  <SortHeader
                    label="Type"
                    column="type"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-3 font-condensed">
                  <SortHeader
                    label="Last touch"
                    column="last_touch"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-3 font-condensed">
                  <SortHeader
                    label="Birthday"
                    column="birthday"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={handleSort}
                  />
                </th>
                <th className="px-3 py-3 font-condensed text-right">Summary</th>
                <th className="px-8 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/40 hover:bg-bg-surface/60 transition-colors"
                >
                  <td className="px-8 py-3">
                    <Link
                      to={`/contacts/${c.id}`}
                      className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
                    >
                      {c.name}
                    </Link>
                    {(c.occupation || c.company) && (
                      <div className="text-xs text-fg-muted mt-0.5">
                        {[c.occupation, c.company].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {c.type && (
                      <Badge tone={CONTACT_TYPE_TONE[c.type as ContactType] ?? "neutral"}>
                        {humanize(c.type)}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-fg/80 tabular-nums">
                    {formatShortDate(c.last_touch_date)}
                  </td>
                  <td className="px-3 py-3 text-sm text-fg/80 tabular-nums">
                    {c.birthday ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Cake className="h-3.5 w-3.5 text-fg-subtle" />
                        {formatShortDate(c.birthday)}
                      </span>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSendBrief(c.id)}
                      disabled={sendingId === c.id}
                      title="Send a pre-meeting brief to your Telegram"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs transition-colors",
                        sentIds.has(c.id)
                          ? "border-status-success/60 text-status-success bg-status-success/10"
                          : "border-border text-fg-muted hover:border-gold/60 hover:text-fg hover:bg-bg-raised/60",
                        sendingId === c.id && "opacity-60 cursor-wait"
                      )}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendingId === c.id
                        ? "Sending…"
                        : sentIds.has(c.id)
                        ? "Sent"
                        : "Brief"}
                    </button>
                  </td>
                  <td className="px-8 py-3">
                    <Link to={`/contacts/${c.id}`} aria-label={`Open ${c.name}`}>
                      <ChevronRight className="h-4 w-4 text-fg-subtle" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Bulk import error dialog ── */}
      <Dialog open={!!importError} onOpenChange={(o) => { if (!o) setImportError(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import failed</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-sm text-status-error">{importError}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setImportError(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk import results dialog ── */}
      <Dialog open={!!importResult} onOpenChange={(o) => { if (!o) setImportResult(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import complete</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-sm border border-border bg-bg-surface p-3">
                <p className="font-condensed text-2xl font-bold text-gold">{importResult?.created ?? 0}</p>
                <p className="mt-0.5 text-xs text-fg-muted uppercase tracking-wider">Created</p>
              </div>
              <div className="rounded-sm border border-border bg-bg-surface p-3">
                <p className="font-condensed text-2xl font-bold text-fg-muted">{importResult?.skipped ?? 0}</p>
                <p className="mt-0.5 text-xs text-fg-muted uppercase tracking-wider">Skipped</p>
              </div>
              <div className="rounded-sm border border-border bg-bg-surface p-3">
                <p className={cn("font-condensed text-2xl font-bold", (importResult?.errors ?? 0) > 0 ? "text-status-error" : "text-fg-muted")}>{importResult?.errors ?? 0}</p>
                <p className="mt-0.5 text-xs text-fg-muted uppercase tracking-wider">Errors</p>
              </div>
            </div>
            {(importResult?.skipped_details?.length ?? 0) > 0 && (
              <div>
                <p className="awm-label mb-1">Skipped (duplicates)</p>
                <ul className="space-y-0.5 max-h-32 overflow-auto">
                  {importResult!.skipped_details.map((s, i) => (
                    <li key={i} className="text-xs text-fg-muted">Row {s.row}: <span className="text-fg">{s.name}</span> — {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {(importResult?.error_details?.length ?? 0) > 0 && (
              <div>
                <p className="awm-label mb-1">Errors</p>
                <ul className="space-y-0.5 max-h-32 overflow-auto">
                  {importResult!.error_details.map((e, i) => (
                    <li key={i} className="text-xs text-status-error">Row {e.row}: {e.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="gold" size="sm" onClick={() => setImportResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Brief send error (unexpected — network / invalid response) ── */}
      <Dialog open={!!briefError} onOpenChange={(o) => { if (!o) setBriefError(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Brief send failed</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-sm text-status-error">{briefError}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setBriefError(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Brief result: structured non-ok (e.g. telegram_not_configured) ── */}
      <Dialog open={!!briefResult} onOpenChange={(o) => { if (!o) setBriefResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {briefResult?.code === "telegram_not_configured"
                ? "Connect Telegram to send briefs"
                : "Brief not sent"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm text-fg/90">{briefResult?.message}</p>

            {briefResult?.code === "telegram_not_configured" && (
              <div className="space-y-3">
                <p className="text-xs text-fg-muted">
                  To send pre-meeting briefs to your Telegram, you'll need to:
                </p>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs text-fg/90">
                  <li>
                    Message <span className="font-mono text-gold">@BotFather</span> on
                    Telegram and create a bot. It'll give you a <em>bot token</em>.
                  </li>
                  <li>
                    Message your new bot once (any text), then visit
                    {" "}<span className="font-mono text-gold">api.telegram.org/bot&lt;token&gt;/getUpdates</span>
                    {" "}to find your <em>chat ID</em>.
                  </li>
                  <li>
                    Open <span className="font-mono text-gold">.env</span> in your kit folder and set:
                    <pre className="mt-1 p-2 rounded-sm bg-bg-surface text-fg/90 text-xs font-mono leading-relaxed">
{`TELEGRAM_BOT_TOKEN=<your token>
AUTHORIZED_USER_ID=<your chat id>`}
                    </pre>
                  </li>
                  <li>Restart the app, then try Brief again.</li>
                </ol>

                {briefResult?.missing && briefResult.missing.length > 0 && (
                  <p className="text-xs text-fg-muted">
                    Missing right now: <span className="text-fg/90">{briefResult.missing.join(", ")}</span>
                  </p>
                )}
              </div>
            )}

            {briefResult?.preview && (
              <div className="space-y-1">
                <p className="awm-label">Preview of the message</p>
                <pre className="rounded-sm border border-border bg-bg-surface p-3 text-xs font-mono text-fg/90 whitespace-pre-wrap max-h-64 overflow-auto">
                  {briefResult.preview}
                </pre>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="gold" size="sm" onClick={() => setBriefResult(null)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New client dialog ── */}
      <Dialog open={newOpen} onOpenChange={(o) => { if (!o) resetNew(); setNewOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new client</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="First name *" htmlFor="nc-first-name">
                <Input
                  id="nc-first-name"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="Sarah"
                  autoFocus
                />
              </Field>
              <Field label="Middle name" htmlFor="nc-middle-name">
                <Input
                  id="nc-middle-name"
                  value={newMiddleName}
                  onChange={(e) => setNewMiddleName(e.target.value)}
                  placeholder="(optional)"
                />
              </Field>
              <Field label="Last name *" htmlFor="nc-last-name">
                <Input
                  id="nc-last-name"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Lim"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type" htmlFor="nc-type" className="col-span-2">
                <select
                  id="nc-type"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
                >
                  <option value="cold">Cold</option>
                  <option value="warming">Warming</option>
                  <option value="in_conversation">In Conversation</option>
                  <option value="client">Client</option>
                </select>
              </Field>
              <Field label="Phone" htmlFor="nc-phone">
                <Input
                  id="nc-phone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+65 9123 4567"
                />
              </Field>
              <Field label="Email" htmlFor="nc-email">
                <Input
                  id="nc-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
            </div>
            {newContact.isError && (
              <p className="text-xs text-status-error">
                {(newContact.error as Error).message}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => { setNewOpen(false); resetNew(); }}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={!canCreateNew || newContact.isPending}
              onClick={() => newContact.mutate()}
            >
              {newContact.isPending ? "Creating…" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Clickable column header with stacked up/down chevrons. The active chevron
 * is gold; the other dims to fg-subtle. Single click toggles asc/desc on the
 * same column, or sets a new column to ascending. */
function SortHeader({
  label,
  column,
  activeKey,
  dir,
  onClick,
}: {
  label: string;
  column: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
}) {
  const isActive = activeKey === column;
  return (
    <button
      type="button"
      onClick={() => onClick(column)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors uppercase tracking-wider",
        isActive ? "text-fg" : "text-fg-muted hover:text-fg"
      )}
    >
      <span>{label}</span>
      <span className="flex flex-col leading-none">
        <ChevronUp
          className={cn(
            "h-2.5 w-2.5 -mb-0.5",
            isActive && dir === "asc" ? "text-gold" : "text-fg-subtle"
          )}
        />
        <ChevronDown
          className={cn(
            "h-2.5 w-2.5",
            isActive && dir === "desc" ? "text-gold" : "text-fg-subtle"
          )}
        />
      </span>
    </button>
  );
}

function FilterChips<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  selected: Set<T>;
  onToggle: (opt: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="awm-label mr-1">{label}</span>
      {options.map((opt) => {
        const isOn = selected.has(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={cn(
              "rounded-sm border px-2 py-1 font-condensed text-[10px] font-bold uppercase tracking-[0.08em] transition-colors",
              isOn
                ? "border-gold bg-gold/15 text-gold"
                : "border-border text-fg-muted hover:border-border-strong hover:text-fg"
            )}
          >
            {humanize(opt)}
          </button>
        );
      })}
    </div>
  );
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
