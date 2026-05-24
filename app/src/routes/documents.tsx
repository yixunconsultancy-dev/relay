import { useMemo, useState } from "react";
import {
  FileText,
  FileSliders,
  FileType,
  FolderOpen,
  ScrollText,
  ExternalLink,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  contactSlug,
  formatBytes,
  matchContactSlug,
  openDocument,
  revealDocumentInFinder,
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
};

function ext(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function DocumentsRoute() {
  const docs = useGeneratedDocuments();
  const contacts = useContacts();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<Set<DocumentKind>>(new Set());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // Selected contact slug for the filter. Empty string = "All contacts".
  const [contactSlugFilter, setContactSlugFilter] = useState("");

  // Map of contact slug → display name, used for dropdown labels and for
  // resolving each document's filename-slug to a contact.
  const slugToName = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of contacts.data ?? []) {
      const s = contactSlug(c.name);
      if (s) out.set(s, c.name);
    }
    return out;
  }, [contacts.data]);
  const knownSlugs = useMemo(
    () => Array.from(slugToName.keys()),
    [slugToName]
  );

  // Per-document matched contact slug (longest-prefix against known slugs).
  // null if the filename doesn't correspond to any known contact.
  const docMatchedSlug = useMemo(() => {
    const out = new Map<string, string | null>();
    for (const d of docs.data ?? []) {
      out.set(d.path, matchContactSlug(d.contact_slug, knownSlugs));
    }
    return out;
  }, [docs.data, knownSlugs]);

  // Dropdown options: only contacts that actually have generated documents.
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

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="font-display text-3xl font-light text-fg leading-none">
                Documents
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                {filtered.length} of {docs.data?.length ?? 0} generated artifacts
              </p>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename, type, contact…"
              className="w-72"
            />
          </div>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
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
                <DocumentCard key={d.path} doc={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentCard({ doc }: { doc: GeneratedDocument }) {
  const Icon = KIND_ICON[doc.kind];
  const [isOpening, setIsOpening] = useState(false);
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

  return (
    <div
      className={cn(
        "rounded-sm border border-border bg-bg-surface p-4",
        "hover:border-gold/40 hover:bg-bg-raised/40 transition-colors"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-sm border border-border bg-bg-base p-3">
          <Icon className="h-5 w-5 text-gold" />
        </div>
        <Badge tone="neutral">{ext(doc.filename) || doc.kind}</Badge>
      </div>
      <h3 className="mt-3 font-body text-sm font-semibold text-fg leading-snug break-words">
        {doc.filename}
      </h3>
      <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
        <span>{DOCUMENT_KIND_LABEL[doc.kind]}</span>
        <span className="tabular-nums">{formatBytes(doc.size)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-subtle">
        <span>{formatShortDate(doc.date_iso ?? doc.modified_at ?? "")}</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpen}
          disabled={isOpening}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-gold/60 px-2.5 py-1 text-xs text-fg hover:bg-bg-raised/60 transition-colors disabled:opacity-50"
        >
          <ExternalLink className="h-3 w-3" />
          {isOpening ? "Opening…" : "Open"}
        </button>
        <button
          type="button"
          onClick={handleReveal}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border hover:border-gold/60 px-2.5 py-1 text-xs text-fg hover:bg-bg-raised/60 transition-colors"
          title="Reveal in Finder"
        >
          <FolderOpen className="h-3 w-3" />
          Reveal
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs normal-case tracking-normal text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}
