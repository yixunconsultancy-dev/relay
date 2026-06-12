import { useMemo, useState } from "react";
import { ArchiveRestore, Trash2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  useTrashedContacts,
  useTrashedPolicies,
  useContacts,
} from "@/lib/queries";
import { queryKeys } from "@/lib/queries";
import {
  restoreFromTrash,
  purgeContact,
  restorePolicy,
  purgePolicy,
} from "@/lib/kit";
import {
  purgeContactDocumentFolder,
  purgeContactGeneratedDocuments,
  contactSlug,
} from "@/lib/documents";
import { formatRelative, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { resetDbConnection } from "@/lib/db";

/**
 * Permanently remove a single trashed contact, plus best-effort cleanup of
 * their uploaded files and generated documents. Shared between the per-row
 * "Delete forever" button, multi-select bulk delete, and "Empty Trash".
 */
async function purgeContactFully(contactId: string, contactName: string) {
  await purgeContact(contactId);
  const slug = contactSlug(contactName);
  // Best-effort: if doc cleanup fails for one reason or another we still want
  // the contact row gone, so swallow per-folder errors via allSettled.
  await Promise.allSettled([
    purgeContactDocumentFolder(contactId),
    purgeContactGeneratedDocuments(slug),
  ]);
}

export function TrashRoute() {
  const trashed = useTrashedContacts();
  const trashedPolicies = useTrashedPolicies();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  // Tab between Contacts and Policies trash. Defaults to Contacts since
  // that's the more frequently-used trash; the tab badges show counts so
  // the user can spot a non-empty Policies trash without clicking.
  const [view, setView] = useState<"contacts" | "policies">("contacts");

  // Multi-select state — set of contact IDs currently ticked.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const restore = useMutation({
    mutationFn: (contactId: string) => restoreFromTrash(contactId),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      queryClient.invalidateQueries({ queryKey: queryKeys.trashedContacts });
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const purge = useMutation({
    mutationFn: ({ contactId, contactName }: { contactId: string; contactName: string }) =>
      purgeContactFully(contactId, contactName),
    onSuccess: (_, vars) => {
      setActionError(null);
      setConfirmPurgeId(null);
      // Drop any stale selection entry for the row we just removed.
      setSelected((prev) => {
        if (!prev.has(vars.contactId)) return prev;
        const next = new Set(prev);
        next.delete(vars.contactId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.trashedContacts });
      queryClient.invalidateQueries({ queryKey: ["documents", "generated"] });
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : String(e));
      setConfirmPurgeId(null);
    },
  });

  const contacts = trashed.data ?? [];

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Any change to selection cancels an in-flight confirm so the user can't
    // half-confirm a stale set.
    setBulkConfirm(false);
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkConfirm(false);
  }

  /**
   * Permanently delete a list of contacts sequentially. We don't parallelise
   * because purgeContact ultimately shells out to the Python kit and a
   * concurrent burst risks SQLite "database is locked" under contention.
   */
  async function deleteMany(targets: { id: string; name: string }[]) {
    if (targets.length === 0) return;
    setBulkBusy(true);
    setActionError(null);
    const failures: string[] = [];
    for (const t of targets) {
      try {
        await purgeContactFully(t.id, t.name);
      } catch (e) {
        failures.push(`${t.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBulkBusy(false);
    setBulkConfirm(false);
    setEmptyConfirm(false);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: queryKeys.trashedContacts });
    queryClient.invalidateQueries({ queryKey: ["documents", "generated"] });
    if (failures.length) {
      setActionError(
        `${failures.length} contact${failures.length === 1 ? "" : "s"} could not be deleted. ${failures[0]}`
      );
    }
  }

  async function handleDeleteSelected() {
    const targets = contacts
      .filter((c) => selected.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    await deleteMany(targets);
  }

  async function handleEmptyTrash() {
    const targets = contacts.map((c) => ({ id: c.id, name: c.name }));
    await deleteMany(targets);
  }

  const selectedCount = selected.size;
  const allSelected = contacts.length > 0 && selectedCount === contacts.length;

  const policyCount = trashedPolicies.data?.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6 sticky top-0 z-10">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <Trash2 className="h-6 w-6 text-fg-muted mt-1 shrink-0" />
            <div>
              <h1 className="font-display text-3xl font-light text-fg leading-none">
                Trash
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                {view === "contacts"
                  ? contacts.length === 0
                    ? "No deleted contacts"
                    : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} in trash`
                  : policyCount === 0
                    ? "No discarded policies"
                    : `${policyCount} polic${policyCount === 1 ? "y" : "ies"} in trash`}
                {view === "contacts" && selectedCount > 0 && ` · ${selectedCount} selected`}
              </p>
            </div>
          </div>

          {/* Header-level actions: Select all / Empty trash. Only shown when
              there is something to act on, AND we're on the Contacts tab —
              the Policies tab manages its own actions inside its section. */}
          {view === "contacts" && contacts.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  allSelected
                    ? clearSelection()
                    : setSelected(new Set(contacts.map((c) => c.id)))
                }
                disabled={bulkBusy}
              >
                {allSelected ? "Clear selection" : "Select all"}
              </Button>

              {emptyConfirm ? (
                <>
                  <span className="text-xs text-fg-muted">
                    Permanently delete all {contacts.length} contact{contacts.length === 1 ? "" : "s"} in trash?
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="border-status-error/40 text-status-error hover:bg-status-error/10"
                    onClick={handleEmptyTrash}
                    disabled={bulkBusy}
                  >
                    {bulkBusy ? "Emptying…" : "Yes, empty trash"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEmptyConfirm(false)}
                    disabled={bulkBusy}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-status-error/40 text-status-error hover:bg-status-error/10"
                  onClick={() => setEmptyConfirm(true)}
                  disabled={bulkBusy}
                  title="Permanently delete every contact in trash"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Empty trash
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Tab switcher between Contacts and Policies trash. Each tab gets a
            badge showing its count so a non-zero count is visible without
            having to click into the section. */}
        <div className="mt-5 flex items-center gap-1 border-b border-border/40 -mb-6">
          <TrashTabButton
            label="Contacts"
            count={contacts.length}
            active={view === "contacts"}
            onClick={() => {
              setView("contacts");
              clearSelection();
            }}
          />
          <TrashTabButton
            label="Policies"
            count={policyCount}
            active={view === "policies"}
            onClick={() => {
              setView("policies");
              clearSelection();
            }}
          />
        </div>
      </header>

      <div className="relative flex-1 overflow-auto p-8">
        {actionError && (
          <p className="mb-4 text-xs text-status-error">{actionError}</p>
        )}

        {/* Policies tab — own component, own state. Renders nothing on the
            Contacts tab so its query doesn't run twice. */}
        {view === "policies" && (
          <TrashedPoliciesSection
            policies={trashedPolicies.data ?? []}
            isPending={trashedPolicies.isPending}
          />
        )}

        {view === "contacts" && (<>
        {trashed.isPending ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : contacts.length === 0 ? (
          <div className="py-16 text-center">
            <Trash2 className="h-10 w-10 mx-auto mb-3 text-fg-subtle" />
            <p className="font-display text-xl text-fg-muted">Trash is empty</p>
            <p className="mt-2 text-sm text-fg-subtle">
              Contacts moved to trash will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl">
            {contacts.map((c) => {
              const isSelected = selected.has(c.id);
              return (
                <div
                  key={c.id}
                  // Whole row is now a click target — matches the Documents
                  // page selection UX. Restore / Delete-forever buttons live
                  // inside this region and call stopPropagation so they
                  // remain independently actionable; everything else
                  // (background, text, padding) toggles selection.
                  role="button"
                  tabIndex={0}
                  onClick={() => !bulkBusy && toggleSelect(c.id)}
                  onKeyDown={(e) => {
                    if (bulkBusy) return;
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggleSelect(c.id);
                    }
                  }}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex items-center gap-4 rounded-sm border px-4 py-3 transition-colors cursor-pointer",
                    isSelected
                      ? "border-gold/60 bg-gold/[0.04]"
                      : "border-border/60 bg-bg-surface hover:border-gold/40 hover:bg-bg-raised/40"
                  )}
                >
                  {/* Circular select tick — same style as the Documents page.
                      Clicking it alone (stopPropagation) toggles, and the
                      surrounding row also toggles, so either gesture works. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(c.id);
                    }}
                    disabled={bulkBusy}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                      isSelected
                        ? "border-gold bg-gold text-bg-base"
                        : "border-border bg-bg-base hover:border-gold/60"
                    )}
                    title={isSelected ? "Deselect" : "Select"}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <svg
                        viewBox="0 0 12 12"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="2,6 5,9 10,3" />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg">{c.name}</p>
                    {(c.occupation || c.company) && (
                      <p className="text-xs text-fg-muted mt-0.5">
                        {[c.occupation, c.company].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-fg-subtle mt-0.5">
                      Deleted {formatRelative(c.deleted_at)}
                    </p>
                  </div>

                  <div
                    className="flex items-center gap-2 shrink-0"
                    // Buttons in this region act on the single row, so the
                    // surrounding row-click handler must NOT also fire and
                    // toggle selection at the same time.
                    onClick={(e) => e.stopPropagation()}
                  >
                    {confirmPurgeId === c.id ? (
                      <>
                        <span className="text-xs text-fg-muted">Permanently delete?</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="border-status-error/40 text-status-error hover:bg-status-error/10"
                          onClick={() =>
                            purge.mutate({ contactId: c.id, contactName: c.name })
                          }
                          disabled={purge.isPending || bulkBusy}
                        >
                          {purge.isPending ? "Deleting…" : "Yes, delete"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmPurgeId(null)}
                          disabled={purge.isPending || bulkBusy}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => restore.mutate(c.id)}
                          disabled={restore.isPending || purge.isPending || bulkBusy}
                          title="Restore this contact"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmPurgeId(c.id)}
                          disabled={restore.isPending || purge.isPending || bulkBusy}
                          title="Permanently delete"
                          className="text-status-error hover:text-status-error hover:bg-status-error/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete forever
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {contacts.length > 0 && (
          <p className="mt-6 text-xs text-fg-subtle">
            Contacts in trash are hidden from all lists. Restoring them will return them to the Clients page.
          </p>
        )}

        {/* Floating action bar — appears when ≥1 row is selected. Mirrors the
            Documents page so the multi-select language is consistent across
            the app. */}
        {selectedCount > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-md border border-border bg-bg-surface shadow-lg px-4 py-3">
            <span className="font-condensed text-xs font-bold tracking-wider text-fg-muted uppercase">
              {selectedCount} selected
            </span>

            <div className="h-4 w-px bg-border" />

            {bulkConfirm ? (
              <>
                <span className="text-xs text-fg-muted">
                  Permanently delete {selectedCount} contact{selectedCount === 1 ? "" : "s"}?
                </span>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-status-error/40 text-status-error hover:bg-status-error/10 px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                >
                  {bulkBusy ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirm(false)}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-xs text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setBulkConfirm(true)}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-status-error/40 px-3 py-1.5 text-xs text-fg-muted hover:text-status-error hover:bg-status-error/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected forever
              </button>
            )}

            <div className="h-4 w-px bg-border" />

            <button
              type="button"
              onClick={clearSelection}
              disabled={bulkBusy}
              className="p-1 rounded-sm text-fg-muted hover:text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
              title="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}

/** Header tab button used to switch between the Contacts and Policies trash
 *  sections. Badge displays the count for that section. */
function TrashTabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-condensed font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors",
        active
          ? "text-fg border-gold"
          : "text-fg-muted border-transparent hover:text-fg hover:border-border"
      )}
    >
      {label}
      {count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] tabular-nums",
            active ? "bg-gold/20 text-gold" : "bg-bg-surface text-fg-muted"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Policies-in-trash section. Mirrors the contacts trash UX (multi-select,
 * Restore, Delete forever, Empty section) but operates on policy rows.
 *
 * Kept as its own component so its selection state doesn't pollute the
 * route-level Contacts state — switching tabs clears the selection cleanly
 * because each section's state is local.
 */
function TrashedPoliciesSection({
  policies,
  isPending,
}: {
  policies: import("@/lib/schema").PolicyRow[];
  isPending: boolean;
}) {
  const queryClient = useQueryClient();
  const allContacts = useContacts();

  // Selection + confirmation state. Same shape as the contacts section so
  // the floating action bar UX feels identical.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const contactNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allContacts.data ?? []) m.set(c.id, c.name);
    return m;
  }, [allContacts.data]);

  const restore = useMutation({
    mutationFn: (policyId: string) => restorePolicy(policyId),
    onSuccess: () => {
      setActionError(null);
      resetDbConnection();
      queryClient.invalidateQueries({ queryKey: queryKeys.policies });
      queryClient.invalidateQueries({ queryKey: queryKeys.trashedPolicies });
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const purge = useMutation({
    mutationFn: (policyId: string) => purgePolicy(policyId),
    onSuccess: () => {
      setActionError(null);
      setConfirmPurgeId(null);
      resetDbConnection();
      queryClient.invalidateQueries({ queryKey: queryKeys.trashedPolicies });
    },
    onError: (e) => {
      setActionError(e instanceof Error ? e.message : String(e));
      setConfirmPurgeId(null);
    },
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkConfirm(false);
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkConfirm(false);
  }

  async function purgeMany(ids: string[]) {
    if (ids.length === 0) return;
    setBulkBusy(true);
    setActionError(null);
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await purgePolicy(id);
      } catch (e) {
        failures.push(e instanceof Error ? e.message : String(e));
      }
    }
    setBulkBusy(false);
    setBulkConfirm(false);
    setEmptyConfirm(false);
    setSelected(new Set());
    resetDbConnection();
    queryClient.invalidateQueries({ queryKey: queryKeys.trashedPolicies });
    if (failures.length) {
      setActionError(
        `${failures.length} polic${failures.length === 1 ? "y" : "ies"} could not be deleted. ${failures[0]}`
      );
    }
  }

  const selectedCount = selected.size;
  const allSelected = policies.length > 0 && selectedCount === policies.length;

  return (
    <div className="relative">
      {actionError && (
        <p className="mb-4 text-xs text-status-error">{actionError}</p>
      )}

      {/* Section actions: select-all / empty-section. Mirrors the Contacts
          tab's header buttons but scoped to policies. */}
      {policies.length > 0 && (
        <div className="mb-4 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              allSelected
                ? clearSelection()
                : setSelected(new Set(policies.map((p) => p.id)))
            }
            disabled={bulkBusy}
          >
            {allSelected ? "Clear selection" : "Select all"}
          </Button>
          {emptyConfirm ? (
            <>
              <span className="text-xs text-fg-muted">
                Permanently delete all {policies.length} polic{policies.length === 1 ? "y" : "ies"}?
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="border-status-error/40 text-status-error hover:bg-status-error/10"
                onClick={() => purgeMany(policies.map((p) => p.id))}
                disabled={bulkBusy}
              >
                {bulkBusy ? "Emptying…" : "Yes, empty"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEmptyConfirm(false)}
                disabled={bulkBusy}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="border-status-error/40 text-status-error hover:bg-status-error/10"
              onClick={() => setEmptyConfirm(true)}
              disabled={bulkBusy}
              title="Permanently delete every policy in trash"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Empty policies trash
            </Button>
          )}
        </div>
      )}

      {isPending ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : policies.length === 0 ? (
        <div className="py-16 text-center">
          <Trash2 className="h-10 w-10 mx-auto mb-3 text-fg-subtle" />
          <p className="font-display text-xl text-fg-muted">No discarded policies</p>
          <p className="mt-2 text-sm text-fg-subtle">
            Discarded policies appear here. Restoring puts them back on the client's card.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-w-3xl">
          {policies.map((p) => {
            const isSelected = selected.has(p.id);
            const clientName = contactNameById.get(p.contact_id) ?? "(unknown client)";
            const valueChip =
              p.current_value && p.current_value.trim()
                ? formatMoney(p.current_value)
                : p.premium_amount
                  ? `${formatMoney(p.premium_amount)} / ${p.premium_frequency || ""}`.trim()
                  : "";
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => !bulkBusy && toggleSelect(p.id)}
                onKeyDown={(e) => {
                  if (bulkBusy) return;
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    toggleSelect(p.id);
                  }
                }}
                aria-pressed={isSelected}
                className={cn(
                  "flex items-center gap-4 rounded-sm border px-4 py-3 transition-colors cursor-pointer",
                  isSelected
                    ? "border-gold/60 bg-gold/[0.04]"
                    : "border-border/60 bg-bg-surface hover:border-gold/40 hover:bg-bg-raised/40"
                )}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(p.id);
                  }}
                  disabled={bulkBusy}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                    isSelected
                      ? "border-gold bg-gold text-bg-base"
                      : "border-border bg-bg-base hover:border-gold/60"
                  )}
                  title={isSelected ? "Deselect" : "Select"}
                  aria-pressed={isSelected}
                >
                  {isSelected && (
                    <svg
                      viewBox="0 0 12 12"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">
                    {p.plan_name || "(unnamed plan)"}
                    {p.insurer ? (
                      <span className="text-fg-muted font-normal"> · {p.insurer}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5 truncate">
                    {clientName}
                    {valueChip ? ` · ${valueChip}` : ""}
                  </p>
                  <p className="text-xs text-fg-subtle mt-0.5">
                    Discarded {formatRelative(p.deleted_at)}
                  </p>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {confirmPurgeId === p.id ? (
                    <>
                      <span className="text-xs text-fg-muted">Permanently delete?</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="border-status-error/40 text-status-error hover:bg-status-error/10"
                        onClick={() => purge.mutate(p.id)}
                        disabled={purge.isPending || bulkBusy}
                      >
                        {purge.isPending ? "Deleting…" : "Yes, delete"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmPurgeId(null)}
                        disabled={purge.isPending || bulkBusy}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restore.mutate(p.id)}
                        disabled={restore.isPending || purge.isPending || bulkBusy}
                        title="Restore this policy to the client's card"
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmPurgeId(p.id)}
                        disabled={restore.isPending || purge.isPending || bulkBusy}
                        title="Permanently delete"
                        className="text-status-error hover:text-status-error hover:bg-status-error/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete forever
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {policies.length > 0 && (
        <p className="mt-6 text-xs text-fg-subtle">
          Discarded policies are hidden from the client's card and from the
          Investments dashboard. Restoring brings them back.
        </p>
      )}

      {/* Floating action bar for multi-select. Same UX as the contacts
          section so the muscle memory carries over. */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-md border border-border bg-bg-surface shadow-lg px-4 py-3">
          <span className="font-condensed text-xs font-bold tracking-wider text-fg-muted uppercase">
            {selectedCount} selected
          </span>
          <div className="h-4 w-px bg-border" />
          {bulkConfirm ? (
            <>
              <span className="text-xs text-fg-muted">
                Permanently delete {selectedCount} polic{selectedCount === 1 ? "y" : "ies"}?
              </span>
              <button
                type="button"
                onClick={() => purgeMany(Array.from(selected))}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-sm border border-status-error/40 text-status-error hover:bg-status-error/10 px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
              >
                {bulkBusy ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setBulkConfirm(false)}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-xs text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setBulkConfirm(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-status-error/40 px-3 py-1.5 text-xs text-fg-muted hover:text-status-error hover:bg-status-error/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete selected forever
            </button>
          )}
          <div className="h-4 w-px bg-border" />
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkBusy}
            className="p-1 rounded-sm text-fg-muted hover:text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
            title="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
