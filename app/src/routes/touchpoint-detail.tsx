import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit3, Save, Undo2 } from "lucide-react";

import {
  Badge,
  SENTIMENT_TONE,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { queryKeys, useTouchpoint } from "@/lib/queries";
import { updateTouchpoint, updateTouchpointNotes } from "@/lib/mutations";
import { formatShortDate, humanize, formatRelative } from "@/lib/format";
import {
  REAL_INTERACTION_TOUCHPOINT_TYPES,
  TOUCHPOINT_TYPE_LABEL,
  SENTIMENTS,
  type Sentiment,
  type TouchpointType,
} from "@/lib/enums";

interface EditDraft {
  date: string;
  type: string;
  sentiment: string;
  summary: string;
  topics: string;
  action_items: string;
}

export function TouchpointDetailRoute() {
  const { touchpointId } = useParams<{ touchpointId: string }>();
  const touchpoint = useTouchpoint(touchpointId);
  const queryClient = useQueryClient();

  // Notes (annotation) state — always editable
  const [notes, setNotes] = useState("");
  const seededFor = useRef<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Edit-mode state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    date: "", type: "", sentiment: "", summary: "", topics: "", action_items: "",
  });

  useEffect(() => {
    if (!touchpoint.data) return;
    if (seededFor.current === touchpoint.data.id) return;
    setNotes(touchpoint.data.notes ?? "");
    seededFor.current = touchpoint.data.id;
    setLastSavedAt(null);
  }, [touchpoint.data]);

  function enterEdit() {
    if (!touchpoint.data) return;
    setDraft({
      date: touchpoint.data.date ?? "",
      type: touchpoint.data.type ?? "",
      sentiment: touchpoint.data.sentiment ?? "",
      summary: touchpoint.data.summary ?? "",
      topics: touchpoint.data.topics ?? "",
      action_items: touchpoint.data.action_items ?? "",
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function updateDraft<K extends keyof EditDraft>(key: K, val: string) {
    setDraft((prev) => ({ ...prev, [key]: val }));
  }

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!touchpointId) throw new Error("Missing touchpoint id");
      await updateTouchpoint(touchpointId, {
        date: draft.date,
        type: draft.type,
        sentiment: draft.sentiment,
        summary: draft.summary,
        topics: draft.topics,
        action_items: draft.action_items,
      });
    },
    onSuccess: () => {
      setEditing(false);
      if (touchpointId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.touchpoint(touchpointId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.touchpoints });
    },
  });

  const saveNotes = useMutation({
    mutationFn: async () => {
      if (!touchpointId) throw new Error("Missing touchpoint id");
      await updateTouchpointNotes(touchpointId, notes);
    },
    onSuccess: () => {
      setLastSavedAt(new Date());
      if (touchpointId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.touchpoint(touchpointId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.touchpoints });
    },
  });

  // keep old alias so the JSX below doesn't need a full rename
  const save = saveNotes;

  if (touchpoint.isPending) {
    return <p className="p-8 text-sm text-fg-muted">Loading touchpoint…</p>;
  }
  if (touchpoint.isError) {
    return (
      <p className="p-8 text-sm text-status-error">
        Could not load touchpoint: {String(touchpoint.error)}
      </p>
    );
  }
  if (!touchpoint.data) {
    return (
      <div className="p-8">
        <Link
          to="/contacts"
          className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <p className="mt-6 text-fg-muted">Touchpoint not found.</p>
      </div>
    );
  }

  const t = touchpoint.data;
  const notesDirty = notes !== (t.notes ?? "");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
        <Link
          to={`/contacts/${t.contact_id}`}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-condensed text-fg-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> {t.contact_name}
        </Link>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h1 className="font-display text-3xl font-light text-fg leading-none">
              Touchpoint · {formatShortDate(editing ? draft.date : t.date)}
            </h1>
            {!editing && t.type && <Badge tone="neutral">{TOUCHPOINT_TYPE_LABEL[t.type as TouchpointType] ?? humanize(t.type)}</Badge>}
            {!editing && t.sentiment && (
              <Badge tone={SENTIMENT_TONE[t.sentiment as Sentiment]}>
                {humanize(t.sentiment)}
              </Badge>
            )}
            {t.meeting_number && (
              <span className="text-xs text-fg-muted">Meeting #{t.meeting_number}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Edit-mode controls */}
            {editing ? (
              <>
                {saveEdit.isError && (
                  <span className="text-xs text-status-error">
                    {(saveEdit.error as Error).message}
                  </span>
                )}
                <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={saveEdit.isPending}>
                  <Undo2 className="h-3.5 w-3.5" /> Cancel
                </Button>
                <Button variant="gold" size="sm" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
                  <Save className="h-3.5 w-3.5" />
                  {saveEdit.isPending ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : (
              <>
                {lastSavedAt && !notesDirty && (
                  <span className="text-xs text-status-success">
                    Notes saved {lastSavedAt.toLocaleTimeString()}
                  </span>
                )}
                <Button variant="secondary" size="sm" onClick={enterEdit}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!notesDirty || save.isPending}
                  onClick={() => setNotes(t.notes ?? "")}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Discard
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  disabled={!notesDirty || save.isPending}
                  onClick={() => save.mutate()}
                >
                  <Save className="h-3.5 w-3.5" />
                  {save.isPending ? "Saving…" : "Save notes"}
                </Button>
              </>
            )}
          </div>
        </div>
        {save.isError && (
          <p className="mt-2 text-xs text-status-error">
            {(save.error as Error).message ?? String(save.error)}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto px-8 py-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-8">
        <section className="space-y-5">

          {/* ── Edit mode ── */}
          {editing ? (
            <div className="rounded-sm border border-gold/30 bg-bg-surface p-5 space-y-4">
              <p className="awm-label text-gold">Editing touchpoint</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Date" htmlFor="te-date">
                  <Input
                    id="te-date"
                    type="date"
                    value={draft.date}
                    onChange={(e) => updateDraft("date", e.target.value)}
                  />
                </Field>
                <Field label="Type" htmlFor="te-type">
                  <EnumSelect
                    id="te-type"
                    value={draft.type}
                    onChange={(v) => updateDraft("type", v)}
                    options={REAL_INTERACTION_TOUCHPOINT_TYPES}
                    labels={TOUCHPOINT_TYPE_LABEL}
                  />
                </Field>
                <Field label="Sentiment" htmlFor="te-sentiment">
                  <EnumSelect
                    id="te-sentiment"
                    value={draft.sentiment}
                    onChange={(v) => updateDraft("sentiment", v)}
                    options={SENTIMENTS}
                  />
                </Field>
                <Field label="Topics (comma)" htmlFor="te-topics">
                  <Input
                    id="te-topics"
                    value={draft.topics}
                    onChange={(e) => updateDraft("topics", e.target.value)}
                    placeholder="retirement, protection"
                  />
                </Field>
              </div>
              <Field label="Summary" htmlFor="te-summary">
                <Textarea
                  id="te-summary"
                  rows={3}
                  value={draft.summary}
                  onChange={(e) => updateDraft("summary", e.target.value)}
                />
              </Field>
              <Field label="Action items" htmlFor="te-actions">
                <Textarea
                  id="te-actions"
                  rows={2}
                  value={draft.action_items}
                  onChange={(e) => updateDraft("action_items", e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <>
              <div>
                <h2 className="awm-label mb-1.5">Summary</h2>
                <p className="font-body text-base text-fg/90 leading-snug whitespace-pre-wrap">
                  {t.summary || <span className="italic text-fg-subtle">No summary.</span>}
                </p>
              </div>

              {t.action_items && (
                <div className="rounded-sm border-l-2 border-gold-dim bg-bg-surface px-4 py-3">
                  <h2 className="awm-label mb-1.5">Action items</h2>
                  <p className="font-body text-sm text-fg/85 whitespace-pre-wrap leading-snug">
                    {t.action_items}
                  </p>
                </div>
              )}

              {t.topics && (
                <div>
                  <h2 className="awm-label mb-1.5">Topics</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {t.topics.split(",").map((s) => s.trim()).filter(Boolean).map((topic) => (
                      <span key={topic} className="font-mono text-xs text-status-info">
                        #{topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {t.raw_input && t.raw_input !== t.summary && (
                <div>
                  <h2 className="awm-label mb-1.5">Raw input</h2>
                  <blockquote className="border-l-2 border-border pl-3 italic text-sm text-fg/70">
                    {t.raw_input}
                  </blockquote>
                </div>
              )}
            </>
          )}

          <div className="rounded-sm border border-border bg-bg-surface p-4">
            <Field
              label="Annotation"
              hint="Private notes on this touchpoint — not part of the AI-generated content."
              htmlFor="td-notes"
            >
              <Textarea
                id="td-notes"
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything to remember about this interaction…"
              />
            </Field>
          </div>
        </section>

        <aside className="space-y-4 text-sm">
          <div className="rounded-sm border border-border bg-bg-surface p-4">
            <h3 className="awm-label mb-2">Metadata</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <dt className="text-fg-muted">Contact</dt>
              <dd>
                <Link to={`/contacts/${t.contact_id}`} className="text-fg hover:text-gold">
                  {t.contact_name}
                </Link>
              </dd>
              <dt className="text-fg-muted">Date</dt>
              <dd className="text-fg/85">{formatShortDate(t.date)}</dd>
              <dt className="text-fg-muted">Originally logged</dt>
              <dd className="text-fg/85">{formatRelative(t.created_at) || "—"}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EnumSelect({
  id,
  value,
  onChange,
  options,
  labels,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === "" ? "—" : (labels?.[opt] ?? humanize(opt))}
        </option>
      ))}
    </select>
  );
}
