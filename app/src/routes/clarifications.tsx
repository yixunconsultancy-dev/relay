import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePendingClarifications } from "@/lib/queries";
import { resolveClarification } from "@/lib/kit";
import type { ClarificationRow } from "@/lib/schema";

/** Parse hermes_guess JSON safely — return null if empty or malformed. */
function parseGuess(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function ClarificationsRoute() {
  const queryClient = useQueryClient();
  const clarifications = usePendingClarifications();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logAnyway = useMutation({
    mutationFn: (id: string) => resolveClarification(id, "log_anyway"),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["clarifications", "pending"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    onSettled: () => setBusyId(null),
  });

  const discard = useMutation({
    mutationFn: (id: string) => resolveClarification(id, "discard"),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["clarifications", "pending"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    onSettled: () => setBusyId(null),
  });

  const items = clarifications.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
        <p className="awm-label flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3" />
          Clarifications
        </p>
        <h1 className="mt-1 font-display text-3xl font-light text-fg leading-none">
          {clarifications.isPending
            ? "Loading…"
            : items.length === 0
              ? "Nothing pending."
              : `${items.length} item${items.length === 1 ? "" : "s"} to triage`}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Bulk-import items Cronos wasn't confident enough to log straight
          through. Accept the guess, edit before logging, or discard.
        </p>
      </header>

      {error && (
        <div className="px-8 py-3 border-b border-status-error/30 bg-status-error/[0.06] text-xs text-status-error">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto p-8">
        {!clarifications.isPending && items.length === 0 ? (
          <p className="rounded-sm border border-border bg-bg-surface p-6 text-sm text-fg-muted italic">
            Clarification queue is empty. When Cronos is unsure during a bulk
            import, items land here for your review.
          </p>
        ) : (
          <ul className="space-y-3 max-w-3xl">
            {items.map((c) => (
              <ClarificationCard
                key={c.id}
                item={c}
                busy={busyId === c.id}
                onLogAnyway={() => logAnyway.mutate(c.id)}
                onDiscard={() => discard.mutate(c.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  item: ClarificationRow;
  busy: boolean;
  onLogAnyway: () => void;
  onDiscard: () => void;
}

function ClarificationCard({ item, busy, onLogAnyway, onDiscard }: CardProps) {
  const guess = useMemo(() => parseGuess(item.hermes_guess), [item.hermes_guess]);
  const canLogAnyway = guess !== null;

  return (
    <li className="rounded-sm border border-border bg-bg-surface p-4">
      <div className="flex items-start gap-3 mb-3">
        <Badge tone="neutral">{item.source_context || "unknown"}</Badge>
        <p className="text-xs text-fg-muted leading-snug">{item.reason}</p>
      </div>

      <div className="text-sm text-fg/90 leading-snug border-l-2 border-gold-dim pl-3 mb-3 italic">
        "{item.source_input}"
      </div>

      {guess && (
        <div className="mb-3">
          <h3 className="awm-label mb-1.5">Cronos's best guess</h3>
          <dl className="text-xs space-y-1">
            {Object.entries(guess).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-fg-subtle min-w-24 font-condensed uppercase tracking-wider">
                  {k}
                </dt>
                <dd className="text-fg/85 flex-1 break-words">
                  {typeof v === "string"
                    ? v
                    : Array.isArray(v)
                      ? v.join(", ")
                      : typeof v === "object"
                        ? JSON.stringify(v)
                        : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
        <Button
          size="sm"
          variant="primary"
          onClick={onLogAnyway}
          disabled={busy || !canLogAnyway}
          title={canLogAnyway ? "Log Cronos's guess as-is" : "No structured guess to log"}
        >
          <Check className="h-3.5 w-3.5" />
          Log as guess
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onDiscard}
          disabled={busy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Discard
        </Button>
        <span className="text-[10px] text-fg-subtle ml-auto">
          {item.created_at}
        </span>
      </div>
    </li>
  );
}
