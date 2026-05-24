import { useEffect, useMemo, useState } from "react";
import { Search, Link2, X } from "lucide-react";

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

interface Props {
  // Don't show the contact picker for the contact's own ID.
  ownContactId: string;
  // Called with the @c_<id> string when the user picks a contact, or with
  // "" when they clear the link (to fall back to plain text).
  onPick: (value: string) => void;
}

/** Small icon button + dialog that lets the consultant pick an existing
 *  contact as referral source. On select, sets the referral_source field
 *  to "@c_<id>" — the contact-detail form persists it like any text. */
export function ReferralLinkButton({ ownContactId, onPick }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold transition-colors font-condensed uppercase tracking-wider"
        onClick={() => setOpen(true)}
        title="Link an existing contact as referral source"
      >
        <Link2 className="h-3 w-3" />
        Link contact
      </button>
      <ReferralPickerDialog
        open={open}
        onOpenChange={setOpen}
        ownContactId={ownContactId}
        onPick={(value) => {
          onPick(value);
          setOpen(false);
        }}
      />
    </>
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownContactId: string;
  onPick: (value: string) => void;
}

function ReferralPickerDialog({
  open,
  onOpenChange,
  ownContactId,
  onPick,
}: DialogProps) {
  const contacts = useContacts();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const candidates = useMemo(() => {
    const data = contacts.data ?? [];
    const q = query.trim().toLowerCase();
    return data
      .filter((c) => c.id !== ownContactId && !c.archived_at)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [contacts.data, query, ownContactId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pick referral source</DialogTitle>
          <DialogDescription>
            Pick an existing client / contact as the referral source. They'll
            show up as a connecting edge in the graph view. To keep a
            free-text source like "ABC Immigration", just type it directly
            into the field — no need to link.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Search contacts" htmlFor="ref-search">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-subtle" />
              <Input
                id="ref-search"
                className="pl-8"
                placeholder="Search contacts by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          </Field>
          <ul className="mt-3 max-h-56 overflow-auto rounded-sm border border-border bg-bg-surface divide-y divide-border">
            {contacts.isPending && (
              <li className="p-3 text-sm text-fg-muted italic">Loading…</li>
            )}
            {!contacts.isPending && candidates.length === 0 && (
              <li className="p-3 text-sm text-fg-muted italic">
                {query ? "No matches." : "No other contacts available."}
              </li>
            )}
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(`@${c.id}`)}
                  className="w-full text-left px-3 py-2 hover:bg-bg-raised transition-colors"
                >
                  <span className="text-sm font-semibold text-fg">{c.name}</span>
                  {(c.type || c.occupation) && (
                    <p className="text-[10px] text-fg-subtle mt-0.5">
                      {[c.type, c.occupation, c.company].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPick("")}
          >
            <X className="h-3 w-3" />
            Clear link
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Parse a referral_source value. Returns {linkedContactId, plainText}. */
export function parseReferralSource(raw: string): {
  linkedContactId: string | null;
  plainText: string;
} {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { linkedContactId: null, plainText: "" };
  const m = /^@(c_[a-zA-Z0-9_]+)$/.exec(trimmed);
  if (m) return { linkedContactId: m[1], plainText: "" };
  return { linkedContactId: null, plainText: trimmed };
}
