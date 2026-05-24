import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Undo2 } from "lucide-react";

import {
  Badge,
  SENTIMENT_TONE,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { queryKeys, useTouchpoint } from "@/lib/queries";
import { updateTouchpointNotes } from "@/lib/mutations";
import { formatShortDate, humanize, formatRelative } from "@/lib/format";
import type { Sentiment } from "@/lib/enums";

export function TouchpointDetailRoute() {
  const { touchpointId } = useParams<{ touchpointId: string }>();
  const touchpoint = useTouchpoint(touchpointId);
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState("");
  const seededFor = useRef<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!touchpoint.data) return;
    if (seededFor.current === touchpoint.data.id) return;
    setNotes(touchpoint.data.notes ?? "");
    seededFor.current = touchpoint.data.id;
    setLastSavedAt(null);
  }, [touchpoint.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!touchpointId) throw new Error("Missing touchpoint id");
      await updateTouchpointNotes(touchpointId, notes);
    },
    onSuccess: () => {
      setLastSavedAt(new Date());
      if (touchpointId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.touchpoint(touchpointId),
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.touchpoints });
    },
  });

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
  const dirty = notes !== (t.notes ?? "");

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
              Touchpoint · {formatShortDate(t.date)}
            </h1>
            {t.type && <Badge tone="neutral">{humanize(t.type)}</Badge>}
            {t.sentiment && (
              <Badge tone={SENTIMENT_TONE[t.sentiment as Sentiment]}>
                {humanize(t.sentiment)}
              </Badge>
            )}
            {t.meeting_number && (
              <span className="text-xs text-fg-muted">
                Meeting #{t.meeting_number}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {lastSavedAt && !dirty && (
              <span className="text-xs text-status-success">
                Notes saved {lastSavedAt.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => setNotes(t.notes ?? "")}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save className="h-3.5 w-3.5" />
              {save.isPending ? "Saving…" : "Save notes"}
            </Button>
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
          <div>
            <h2 className="awm-label mb-1.5">Summary</h2>
            <p className="font-body text-base text-fg/90 leading-snug whitespace-pre-wrap">
              {t.summary || (
                <span className="italic text-fg-subtle">No summary.</span>
              )}
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
                {t.topics
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((topic) => (
                    <span
                      key={topic}
                      className="font-mono text-xs text-status-info"
                    >
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

          <div className="rounded-sm border border-border bg-bg-surface p-4">
            <Field
              label="Annotation"
              hint="Private notes you keep on this touchpoint. Stored in the touchpoints.notes column."
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
              <dt className="text-fg-muted">ID</dt>
              <dd className="font-mono text-fg/85 break-all">{t.id}</dd>
              <dt className="text-fg-muted">Contact</dt>
              <dd>
                <Link
                  to={`/contacts/${t.contact_id}`}
                  className="text-fg hover:text-gold"
                >
                  {t.contact_name}
                </Link>
              </dd>
              <dt className="text-fg-muted">Date</dt>
              <dd className="text-fg/85">{formatShortDate(t.date)}</dd>
              <dt className="text-fg-muted">Created</dt>
              <dd className="text-fg/85">
                {formatRelative(t.created_at) || "—"}
              </dd>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
