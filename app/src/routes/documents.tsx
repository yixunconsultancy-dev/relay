import { useMemo, useState } from "react";
import {
  FileText,
  FileSliders,
  FileType,
  FolderOpen,
  ScrollText,
  ExternalLink,
  Trash2,
  ClipboardList,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  contactSlug,
  deleteGeneratedDocument,
  formatBytes,
  matchContactSlug,
  openDocument,
  revealDocumentInFinder,
  revealFilesInFinder,
  useGeneratedDocuments,
  type DocumentKind,
  type GeneratedDocument,
} from "@/lib/documents";
import { useContacts } from "@/lib/queries";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<DocumentKind, typeof FileText> = {
  appointment_summary: FileText,
  proposal: ScrollText,
  slides: FileSliders,
  writeup: FileType,
  policy_summary: ClipboardList,
};

function ext(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function DocumentsRoute() {
  const docs = useGeneratedDocuments();
  const contacts = useContacts();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<Set<DocumentKind>>(new Set());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [contactSlugFilter, setContactSlugFilter] = useState("");

  // Multi-select state: set of selected file paths
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk-action states
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const slugToName = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of contacts.data ?? []) {
      const s = contactSlug(c.name);
      if (s) out.set(s, c.name);
    }
    return out;
  }, [contacts.data]);

  const knownSlugs = useMemo(() => Array.from(slugToName.keys()), [slugToName]);

  const docMatchedSlug = useMemo(() => {
    const out = new Map<string, string | null>();
    for (const d of docs.data ?? []) {
      out.set(d.path, matchContactSlug(d.contact_slug, knownSlugs));
    }
    return out;
  }, [docs.data, knownSlugs]);

  const dropdownContacts = useMemo(() => {
    const used = new Set<string>();
    for (const d of docs.data ?? []) {
      const matched = docMatchedSlug.get(d.path);
      if (matched) used.add(matched);
    }
    return Array.from(used)
      .map((slug) => ({ slug, name: slugToName.get(slug) ?? slug }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [docs.data, docMatchedSlug, slugToName]);

  const filtered = useMemo(() => {
    if (!docs.data) return [];
    const q = search.trim().toLowerCase();
    return docs.data.filter((d) => {
      if (kindFilter.size && !kindFilter.has(d.kind)) return false;
      if (contactSlugFilter && docMatchedSlug.get(d.path) !== contactSlugFilter)
        return false;
      if (fromDate && d.date_iso && d.date_iso < fromDate) return false;
      if (toDate && d.date_iso && d.date_iso > toDate) return false;
      if (q) {
        const matchedSlug = docMatchedSlug.get(d.path);
        const matchedName = matchedSlug ? slugToName.get(matchedSlug) : "";
        const hay = [
          d.filename,
          d.kind,
          DOCUMENT_KIND_LABEL[d.kind],
          d.contact_slug ?? "",
          matchedName ?? "",
          ext(d.filename),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [docs.data, search, kindFilter, contactSlugFilter, fromDate, toDate, docMatchedSlug, slugToName]);

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkConfirmDelete(false);
    setBulkError(null);
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      clearSelection();
    } else {
      setSelected(new Set(filtered.map((d) => d.path)));
    }
  }

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    setBulkError(null);
    const paths = Array.from(selected);
    const errors: string[] = [];
    for (const path of paths) {
      try {
        await deleteGeneratedDocument(path);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    queryClient.invalidateQueries({ queryKey: ["documents", "generated"] });
    setSelected(new Set());
    setBulkConfirmDelete(false);
    setIsBulkDeleting(false);
    if (errors.length) setBulkError(`${errors.length} file(s) could not be deleted.`);
  }

  async function handleRevealSelected() {
    setIsRevealing(true);
    setBulkError(null);
    try {
      await revealFilesInFinder(Array.from(selected));
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRevealing(false);
    }
  }

  const allFilteredSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="flex h-full">
      <aside className="w-72 shrink-0 border-r border-border bg-bg-surface/40 px-5 py-6 overflow-auto">
        <h2 className="awm-label mb-3">Filters</h2>

        <div className="space-y-4">
          <div>
            <span className="awm-label mb-1.5 block">Type</span>
            <div className="flex flex-col gap-1">
              {DOCUMENT_KINDS.map((k) => {
                const isOn = kindFilter.has(k);
                return (
                  <label
                    key={k}
                    className="flex items-center gap-2 text-sm text-fg/80 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() =>
                        setKindFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(k)) next.delete(k);
                          else next.add(k);
                          return next;
                        })
                      }
                      className="accent-gold"
                    />
                    {DOCUMENT_KIND_LABEL[k]}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <span className="awm-label mb-1.5 block">Contact</span>
            <select
              value={contactSlugFilter}
              onChange={(e) => setContactSlugFilter(e.target.value)}
              className="w-full h-9 rounded-sm border border-border bg-bg-surface px-2 text-sm focus:border-gold/60 focus:outline-none"
            >
              <option value="">All contacts</option>
              {dropdownContacts.map(({ slug, name }) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="awm-label mb-1.5 block">Date range</span>
            <div className="grid grid-cols-2 gap-2">
              <DateInput
                value={fromDate}
                onChange={setFromDate}
                placeholder="From"
                ariaLabel="From"
              />
              <DateInput
                value={toDate}
                onChange={setToDate}
                placeholder="To"
                ariaLabel="To"
              />
            </div>
            {(fromDate || toDate) && (
              <p className="mt-1.5 text-[11px] text-gold/80">
                Filter active{fromDate && ` from ${fromDate}`}
                {toDate && ` to ${toDate}`}
              </p>
            )}
          </div>

          <button
            type="button"
            className="text-[11px] uppercase tracking-wider font-condensed font-bold text-fg-muted hover:text-fg"
            onClick={() => {
              setSearch("");
              setKindFilter(new Set());
              setContactSlugFilter("");
              setFromDate("");
              setToDate("");
            }}
          >
            Clear filters
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="font-display text-3xl font-light text-fg leading-none">
                Documents
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                {filtered.length} of {docs.data?.length ?? 0} generated artifacts
                {selected.size > 0 && (
                  <span className="ml-2 text-gold font-medium">
                    · {selected.size} selected
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Select-all toggle */}
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  title={allFilteredSelected ? "Deselect all" : "Select all"}
                  className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
                >
                  {allFilteredSelected ? (
                    <CheckCircle2 className="h-4 w-4 text-gold" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                  {allFilteredSelected ? "Deselect all" : "Select all"}
                </button>
              )}
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search filename, type, contact…"
                className="w-64"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6 pb-24">
          {docs.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : docs.isError ? (
            <p className="text-sm text-status-error">
              Could not load documents: {String(docs.error)}
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-sm border border-border bg-bg-surface p-6 text-sm text-fg-muted italic">
              No generated documents match your filters. Generate one from a
              contact detail page.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((d) => (
                <DocumentCard
                  key={d.path}
                  doc={d}
                  isSelected={selected.has(d.path)}
                  onToggleSelect={() => toggleSelect(d.path)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Floating action toolbar — appears when ≥1 document is selected */}
        {selected.size > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-md border border-border bg-bg-surface shadow-lg px-4 py-3">
            <span className="font-condensed text-xs font-bold tracking-wider text-fg-muted uppercase">
              {selected.size} selected
            </span>

            <div className="h-4 w-px bg-border" />

            {/* Reveal in Finder */}
            <button
              type="button"
              onClick={handleRevealSelected}
              disabled={isRevealing || isBulkDeleting}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-gold/60 px-3 py-1.5 text-xs text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {isRevealing ? "Opening…" : "Reveal in Finder"}
            </button>

            {/* Delete selected */}
            {bulkConfirmDelete ? (
              <>
                <span className="text-xs text-fg-muted">Delete {selected.size} file{selected.size !== 1 ? "s" : ""}?</span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-status-error/40 text-status-error hover:bg-status-error/10 px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                >
                  {isBulkDeleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirmDelete(false)}
                  disabled={isBulkDeleting}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-xs text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setBulkConfirmDelete(true)}
                disabled={isBulkDeleting}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-status-error/40 px-3 py-1.5 text-xs text-fg-muted hover:text-status-error hover:bg-status-error/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected
              </button>
            )}

            <div className="h-4 w-px bg-border" />

            {/* Clear selection */}
            <button
              type="button"
              onClick={clearSelection}
              className="p-1 rounded-sm text-fg-muted hover:text-fg hover:bg-bg-raised/60 transition-colors"
              title="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {bulkError && (
              <span className="text-xs text-status-error">{bulkError}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface DocumentCardProps {
  doc: GeneratedDocument;
  isSelected: boolean;
  onToggleSelect: () => void;
}

function DocumentCard({ doc, isSelected, onToggleSelect }: DocumentCardProps) {
  const queryClient = useQueryClient();
  const Icon = KIND_ICON[doc.kind];
  const [isOpening, setIsOpening] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setError(null);
    setIsOpening(true);
    try {
      await openDocument(doc.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsOpening(false);
    }
  }

  async function handleReveal() {
    setError(null);
    try {
      await revealDocumentInFinder(doc.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteGeneratedDocument(doc.path);
      queryClient.invalidateQueries({ queryKey: ["documents", "generated"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleSelect}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") onToggleSelect(); }}
      className={cn(
        "relative rounded-sm border bg-bg-surface p-4 transition-colors cursor-pointer",
        isSelected
          ? "border-gold/60 bg-gold/[0.04]"
          : "border-border hover:border-gold/40 hover:bg-bg-raised/40"
      )}
    >
      {/* Circular select button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        className={cn(
          "absolute top-3 right-3 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
          isSelected
            ? "border-gold bg-gold text-bg-base"
            : "border-border bg-bg-base hover:border-gold/60"
        )}
        title={isSelected ? "Deselect" : "Select"}
        aria-pressed={isSelected}
      >
        {isSelected && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,6 5,9 10,3" />
          </svg>
        )}
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className="rounded-sm border border-border bg-bg-base p-3 shrink-0">
          <Icon className="h-5 w-5 text-gold" />
        </div>
        <Badge tone="neutral">{ext(doc.filename) || doc.kind}</Badge>
      </div>

      <h3 className="mt-3 font-body text-sm font-semibold text-fg leading-snug break-words pr-2">
        {doc.filename}
      </h3>
      <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
        <span>{DOCUMENT_KIND_LABEL[doc.kind]}</span>
        <span className="tabular-nums">{formatBytes(doc.size)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-subtle">
        <span>{formatShortDate(doc.date_iso ?? doc.modified_at ?? "")}</span>
      </div>

      {confirmDelete ? (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-fg-muted">Delete permanently?</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 rounded-sm border border-status-error/40 text-status-error hover:bg-status-error/10 px-2.5 py-1 text-xs transition-colors disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 text-xs text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleOpen(); }}
            disabled={isOpening}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-gold/60 px-2.5 py-1 text-xs text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
          >
            <ExternalLink className="h-3 w-3" />
            {isOpening ? "Opening…" : "Open"}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleReveal(); }}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-gold/60 px-2.5 py-1 text-xs text-fg hover:bg-bg-raised/60 transition-colors"
            title="Reveal in Finder"
          >
            <FolderOpen className="h-3 w-3" />
            Reveal
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-status-error/40 px-2.5 py-1 text-xs text-fg-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
            title="Delete document"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs normal-case tracking-normal text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}
