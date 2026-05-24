import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LinkContactDialog } from "@/components/link-contact-dialog";
import {
  useContacts,
  useRelationshipsForContact,
} from "@/lib/queries";
import { unlinkContact } from "@/lib/kit";
import {
  RELATIONSHIP_KIND_LABEL,
  type RelationshipKind,
} from "@/lib/enums";

interface Props {
  contactId: string;
}

interface LinkedDisplay {
  relationshipId: string;
  otherContactId: string;
  otherName: string;
  kind: RelationshipKind;
  label: string;
  // True if this contact is the "to" side (e.g. they're someone else's
  // parent, so we display from their perspective).
  reversed: boolean;
}

/** Linked-relationships list + Add button. Lives under the Family textarea on
 *  the contact-detail page. */
export function FamilyPanel({ contactId }: Props) {
  const relationships = useRelationshipsForContact(contactId);
  const contacts = useContacts();
  const queryClient = useQueryClient();
  const [linkOpen, setLinkOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contactNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts.data ?? []) map.set(c.id, c.name);
    return map;
  }, [contacts.data]);

  // Reduce raw rows to the "from this contact's perspective" view.
  // parent ↔ child gets flipped so the displayed kind always matches what
  // the OTHER contact is TO this one.
  const linked: LinkedDisplay[] = useMemo(() => {
    const rows = relationships.data ?? [];
    return rows.map((r) => {
      const isFrom = r.from_contact_id === contactId;
      const otherId = isFrom ? r.to_contact_id : r.from_contact_id;
      const otherName = contactNameById.get(otherId) ?? "(unknown contact)";
      let displayKind = r.kind as RelationshipKind;
      // For parent/child, flip the kind when shown from the "to" side
      // so it reads naturally ("Alice is the parent of Bob" — Bob's detail
      // page shows Alice as "parent", not as "child").
      if (!isFrom) {
        if (r.kind === "parent") displayKind = "child";
        else if (r.kind === "child") displayKind = "parent";
      }
      return {
        relationshipId: r.id,
        otherContactId: otherId,
        otherName,
        kind: displayKind,
        label: r.label,
        reversed: !isFrom,
      };
    });
  }, [relationships.data, contactNameById, contactId]);

  const linkedIds = useMemo(
    () => linked.map((l) => l.otherContactId),
    [linked]
  );

  const unlink = useMutation({
    mutationFn: (relId: string) => unlinkContact(relId),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    onSettled: () => setBusyId(null),
  });

  return (
    <div className="mt-2 rounded-sm border border-border bg-bg-surface/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="awm-label inline-flex items-center gap-1.5">
          <Link2 className="h-3 w-3" />
          Linked family / contacts
        </h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setLinkOpen(true)}
          disabled={contacts.isPending}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      {relationships.isPending ? (
        <p className="text-xs text-fg-muted italic">Loading…</p>
      ) : linked.length === 0 ? (
        <p className="text-xs text-fg-muted italic">
          No linked contacts yet. Use the "Add" button to link family members,
          referral sources, or business contacts.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((l) => (
            <li
              key={l.relationshipId}
              className="flex items-center gap-2 text-sm"
            >
              <Link
                to={`/contacts/${l.otherContactId}`}
                className="font-body font-semibold text-fg hover:text-gold transition-colors flex-1 min-w-0 truncate"
              >
                {l.otherName}
              </Link>
              <span className="font-condensed text-[10px] uppercase tracking-wider text-gold/80">
                {RELATIONSHIP_KIND_LABEL[l.kind]}
              </span>
              {l.label && (
                <span className="text-[10px] text-fg-muted italic truncate max-w-32">
                  ({l.label})
                </span>
              )}
              <button
                type="button"
                onClick={() => unlink.mutate(l.relationshipId)}
                disabled={busyId === l.relationshipId}
                className="text-fg-subtle hover:text-status-error transition-colors disabled:opacity-50"
                aria-label={`Unlink ${l.otherName}`}
                title="Unlink"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 text-xs text-status-error border-l-2 border-status-error/40 pl-2">
          {error}
        </p>
      )}

      <LinkContactDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        fromContactId={contactId}
        excludeContactIds={linkedIds}
        defaultKind="family"
      />
    </div>
  );
}
