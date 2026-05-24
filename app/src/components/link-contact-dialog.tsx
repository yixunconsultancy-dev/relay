import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useContacts } from "@/lib/queries";
import { linkContact, KitCommandError } from "@/lib/kit";
import {
  RELATIONSHIP_KINDS,
  RELATIONSHIP_KIND_LABEL,
  type RelationshipKind,
} from "@/lib/enums";
import type { ContactRow } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The contact this dialog is linking FROM (the one whose detail page
  // we're on).
  fromContactId: string;
  // Optional: contacts to exclude from the picker (e.g. already-linked).
  excludeContactIds?: string[];
  // Restrict the kind set (e.g. family panel only shows family-ish kinds).
  // Defaults to all RELATIONSHIP_KINDS.
  allowedKinds?: readonly RelationshipKind[];
  // Pre-selected kind (so the family panel can default to "family").
  defaultKind?: RelationshipKind;
  // Called when a link is successfully created.
  onSuccess?: () => void;
}

export function LinkContactDialog({
  open,
  onOpenChange,
  fromContactId,
  excludeContactIds = [],
  allowedKinds = RELATIONSHIP_KINDS,
  defaultKind,
  onSuccess,
}: Props) {
  const contacts = useContacts();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<RelationshipKind>(
    defaultKind ?? allowedKinds[0]
  );
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedId(null);
      setKind(defaultKind ?? allowedKinds[0]);
      setLabel("");
      setError(null);
    }
  }, [open, defaultKind, allowedKinds]);

  const exclude = useMemo(
    () => new Set([fromContactId, ...excludeContactIds]),
    [fromContactId, excludeContactIds]
  );

  const candidates = useMemo(() => {
    const data = contacts.data ?? [];
    const q = query.trim().toLowerCase();
    return data
      .filter((c) => !exclude.has(c.id))
      .filter((c) => !c.archived_at)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [contacts.data, query, exclude]);

  const selectedContact = useMemo(
    () => contacts.data?.find((c) => c.id === selectedId) ?? null,
    [contacts.data, selectedId]
  );

  const link = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Pick a contact first.");
      return linkContact(fromContactId, selectedId, kind, {
        label: label.trim() || undefined,
      });
    },
    onSuccess: (result) => {
      if (result.duplicate) {
        // Treat as success — kit returns ok:true with duplicate flag.
        setError(result.message);
      } else {
        setError(null);
        onSuccess?.();
        queryClient.invalidateQueries({ queryKey: ["relationships"] });
        onOpenChange(false);
      }
    },
    onError: (e) => {
      if (e instanceof KitCommandError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a contact</DialogTitle>
          <DialogDescription>
            Pick an existing contact to link as family, friend, or business
            partner. They'll appear on both contacts' detail pages and in
            the graph view.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {/* Search + candidate list */}
            <Field label="Contact" htmlFor="link-search">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle" />
                <Input
                  id="link-search"
                  className="pl-8"
                  placeholder="Search contacts by name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </Field>

            {selectedContact ? (
              <div className="flex items-center gap-3 rounded-sm border border-gold-dim bg-gold/[0.08] px-3 py-2">
                <span className="text-sm font-semibold text-fg flex-1">
                  {selectedContact.name}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-fg-subtle hover:text-fg transition-colors"
                  aria-label="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <ul className="max-h-48 overflow-auto rounded-sm border border-border bg-bg-surface divide-y divide-border">
                {contacts.isPending && (
                  <li className="p-3 text-sm text-fg-muted italic">Loading…</li>
                )}
                {!contacts.isPending && candidates.length === 0 && (
                  <li className="p-3 text-sm text-fg-muted italic">
                    {query ? "No matches." : "No other contacts available."}
                  </li>
                )}
                {candidates.map((c) => (
                  <CandidateRow
                    key={c.id}
                    contact={c}
                    onPick={() => setSelectedId(c.id)}
                  />
                ))}
              </ul>
            )}

            {/* Kind picker */}
            <Field label="Relationship kind">
              <div className="flex flex-wrap gap-1.5">
                {allowedKinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "rounded-sm border px-2.5 py-1 text-[11px] font-condensed uppercase tracking-wider transition-colors",
                      kind === k
                        ? "border-gold bg-gold/[0.15] text-gold"
                        : "border-border text-fg/70 hover:border-fg/30 hover:text-fg"
                    )}
                  >
                    {RELATIONSHIP_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </Field>

            {/* Optional label */}
            <Field
              label="Label (optional)"
              htmlFor="link-label"
              hint="Refine the relationship — e.g. 'son', 'father-in-law', 'business partner since 2018'."
            >
              <Input
                id="link-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Optional refinement"
              />
            </Field>

            {error && (
              <p className="text-xs text-status-error border-l-2 border-status-error/40 pl-2">
                {error}
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={link.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => link.mutate()}
            disabled={!selectedId || link.isPending}
          >
            {link.isPending ? "Linking…" : "Link contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({
  contact,
  onPick,
}: {
  contact: ContactRow;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="w-full text-left px-3 py-2 hover:bg-bg-raised transition-colors flex items-center justify-between gap-2"
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-fg">{contact.name}</span>
          {(contact.type || contact.occupation) && (
            <p className="text-[10px] text-fg-subtle mt-0.5">
              {[contact.type, contact.occupation, contact.company]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}
