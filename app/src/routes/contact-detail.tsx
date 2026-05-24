import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  FolderOpen,
  GitMerge,
  History,
  Info,
  Plus,
  Save,
  Search,
  Shield,
  Undo2,
  X,
} from "lucide-react";

import {
  Badge,
  CONTACT_TYPE_TONE,
  PRIORITY_TONE,
  REMINDER_STATUS_TONE,
  SENTIMENT_TONE,
  STAGE_TONE,
} from "@/components/ui/badge";
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
import { Field, Input, Textarea } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { GenerateButtons } from "@/components/generate-buttons";
import {
  queryKeys,
  useContact,
  useContacts,
  usePoliciesByContact,
  useRemindersByContact,
  useTouchpointsByContact,
} from "@/lib/queries";
import { updateContact } from "@/lib/mutations";
import {
  addPolicy,
  archiveContact,
  archivePolicy,
  mergeContacts,
  renameContact,
  unarchiveContact,
  updatePolicy,
  type PolicyPayload,
} from "@/lib/kit";
import {
  contactSlug,
  DOCUMENT_KIND_LABEL,
  formatBytes,
  matchContactSlug,
  openDocument,
  revealDocumentInFinder,
  useGeneratedDocuments,
} from "@/lib/documents";
import {
  POLICY_STATUSES,
  type ContactRow,
  type PolicyRow,
} from "@/lib/schema";
import {
  type ContactType,
  type RelationshipStage,
  type ReminderPriority,
  type ReminderStatus,
  type Sentiment,
} from "@/lib/enums";
import {
  EDITABLE_CONTACT_FIELDS,
  type EditableContactField,
} from "@/lib/schema";
import { formatShortDate, formatRelative, humanize } from "@/lib/format";
import { FamilyPanel } from "@/components/family-panel";
import {
  ReferralLinkButton,
  parseReferralSource,
} from "@/components/referral-link-button";

type EditableValues = Record<EditableContactField, string>;

/** Tiny inline hint shown under the referral_source input. If the value
 *  parses as a contact ID (@c_xxx), look up the contact name and show
 *  "linked to: Name". Otherwise show "plain text". */
function ReferralLinkHint({ raw }: { raw: string }) {
  const parsed = parseReferralSource(raw);
  const allContacts = useContacts();
  if (!raw.trim()) {
    return (
      <span className="text-[10px] text-fg-subtle">
        Not set
      </span>
    );
  }
  if (parsed.linkedContactId) {
    const c = allContacts.data?.find((x) => x.id === parsed.linkedContactId);
    return c ? (
      <span className="text-[10px] text-gold inline-flex items-center gap-1">
        Linked to <span className="font-semibold">{c.name}</span>
      </span>
    ) : (
      <span className="text-[10px] text-status-error">
        Linked to unknown contact ({parsed.linkedContactId})
      </span>
    );
  }
  return (
    <span className="text-[10px] text-fg-subtle">
      Plain text
    </span>
  );
}

function policyDetailRows(policy: PolicyRow): Array<[string, string]> {
  const rows: Array<[string, string | undefined]> = [
    ["Policy number", policy.policy_number],
    ["Need category", policy.needs_category],
    ["Premium term", policy.premium_term],
    ["Policy term", policy.policy_term],
    ["Payment method", policy.payment_method],
    ["Start date", policy.start_date ? formatShortDate(policy.start_date) : ""],
    ["Review frequency", policy.review_frequency],
    ["Last reviewed", policy.last_reviewed ? formatShortDate(policy.last_reviewed) : ""],
    ["Surrender value", policy.surrender_value],
    ["Policy owner", policy.policy_owner],
    ["Life assured", policy.life_assured],
    ["Payor", policy.payor],
    ["Beneficiaries", policy.beneficiaries],
    ["Riders", policy.riders],
    ["Servicing rep", policy.servicing_rep],
    ["Notes", policy.notes],
  ];
  return rows
    .map(([label, value]) => [label, value?.trim() ?? ""] as [string, string])
    .filter(([, value]) => value.length > 0);
}

function buildInitialValues(
  source: Partial<Record<EditableContactField, string>> | null | undefined
): EditableValues {
  const out = {} as EditableValues;
  for (const key of EDITABLE_CONTACT_FIELDS) {
    out[key] = (source?.[key] ?? "") as string;
  }
  return out;
}

export function ContactDetailRoute() {
  const { contactId } = useParams<{ contactId: string }>();
  const contact = useContact(contactId);
  const touchpoints = useTouchpointsByContact(contactId);
  const reminders = useRemindersByContact(contactId);
  const policies = usePoliciesByContact(contactId);
  const allDocuments = useGeneratedDocuments();
  const allContacts = useContacts();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<EditableValues>(() =>
    buildInitialValues(contact.data ?? undefined)
  );
  const [lastSavedFields, setLastSavedFields] = useState<EditableContactField[]>(
    []
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [openingDocumentPath, setOpeningDocumentPath] = useState<string | null>(
    null
  );
  const [showAllReminders, setShowAllReminders] = useState(false);
  const [showImportTouchpoints, setShowImportTouchpoints] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const navigate = useNavigate();
  // Track the contact id so we re-seed form values when the user navigates
  // between contacts without clobbering an in-progress edit on the same one.
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!contact.data) return;
    if (seededFor.current === contact.data.id) return;
    setValues(buildInitialValues(contact.data));
    seededFor.current = contact.data.id;
    setLastSavedFields([]);
    setSaveError(null);
  }, [contact.data]);

  const initial = useMemo(
    () => buildInitialValues(contact.data ?? undefined),
    [contact.data]
  );

  const dirtyFields = useMemo(() => {
    const out: EditableContactField[] = [];
    for (const key of EDITABLE_CONTACT_FIELDS) {
      if ((values[key] ?? "") !== (initial[key] ?? "")) out.push(key);
    }
    return out;
  }, [values, initial]);

  // Documents are listed with `contact_slug` = the full slug-portion of the
  // filename (e.g. "demo-client-retirement"). Recover the actual contact by
  // longest-prefix matching against known contact slugs so we don't
  // false-positively attach "demo-client-retirement.pdf" to a contact named
  // just "Demo" (or vice versa).
  const knownSlugs = useMemo(
    () => (allContacts.data ?? []).map((cc) => contactSlug(cc.name)),
    [allContacts.data]
  );
  const contactSlugValue = contact.data ? contactSlug(contact.data.name) : "";
  const contactDocuments = useMemo(
    () =>
      (allDocuments.data ?? []).filter(
        (d) => matchContactSlug(d.contact_slug, knownSlugs) === contactSlugValue
      ),
    [allDocuments.data, knownSlugs, contactSlugValue]
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error("Missing contact id");
      const changes: Partial<EditableValues> = {};
      for (const k of dirtyFields) changes[k] = values[k];
      return updateContact({ id: contactId, changes });
    },
    onSuccess: (result) => {
      setLastSavedFields(result.changedFields);
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      if (contactId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.contact(contactId) });
      }
    },
    onError: (e) => {
      setSaveError(e instanceof Error ? e.message : String(e));
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error("Missing contact id");
      return archiveContact(contactId);
    },
    onSuccess: () => {
      setArchiveError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      if (contactId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.contact(contactId) });
      }
    },
    onError: (e) => setArchiveError(e instanceof Error ? e.message : String(e)),
  });

  const unarchive = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error("Missing contact id");
      return unarchiveContact(contactId);
    },
    onSuccess: () => {
      setArchiveError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      if (contactId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.contact(contactId) });
      }
    },
    onError: (e) => setArchiveError(e instanceof Error ? e.message : String(e)),
  });

  function update<K extends EditableContactField>(key: K, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function discard() {
    setValues(initial);
    setLastSavedFields([]);
    setSaveError(null);
  }

  async function handleOpenDocument(path: string) {
    setDocumentError(null);
    setOpeningDocumentPath(path);
    try {
      await openDocument(path);
    } catch (e) {
      setDocumentError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpeningDocumentPath(null);
    }
  }

  async function handleRevealDocument(path: string) {
    setDocumentError(null);
    try {
      await revealDocumentInFinder(path);
    } catch (e) {
      setDocumentError(e instanceof Error ? e.message : String(e));
    }
  }

  if (contact.isPending) {
    return <p className="p-8 text-sm text-fg-muted">Loading contact…</p>;
  }
  if (contact.isError) {
    return (
      <p className="p-8 text-sm text-status-error">
        Could not load contact: {String(contact.error)}
      </p>
    );
  }
  if (!contact.data) {
    return (
      <div className="p-8">
        <Link
          to="/contacts"
          className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to contacts
        </Link>
        <p className="mt-6 text-fg-muted">Contact not found.</p>
      </div>
    );
  }

  const c = contact.data;
  const pendingReminders = (reminders.data ?? []).filter(
    (r) => r.status === "pending"
  );
  const visibleReminders = showAllReminders
    ? (reminders.data ?? [])
    : pendingReminders;
  const dirty = dirtyFields.length > 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-5 sticky top-0 z-10">
        <Link
          to="/contacts"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-condensed text-fg-muted hover:text-fg transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h1 className="font-display text-3xl font-light text-fg leading-none">
              {c.name}
            </h1>
            {c.type && (
              <Badge tone={CONTACT_TYPE_TONE[c.type as ContactType]}>
                {humanize(c.type)}
              </Badge>
            )}
            {c.relationship_stage && (
              <Badge
                tone={STAGE_TONE[c.relationship_stage as RelationshipStage]}
              >
                {humanize(c.relationship_stage)}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {dirty && (
              <span className="text-xs text-fg-muted">
                {dirtyFields.length} unsaved field
                {dirtyFields.length === 1 ? "" : "s"}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRenameOpen(true)}
              disabled={save.isPending || archive.isPending || unarchive.isPending}
              title="Rename this contact (cascades to touchpoints and reminders)"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Rename
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMergeOpen(true)}
              disabled={save.isPending || archive.isPending || unarchive.isPending}
              title="Merge this contact into another"
            >
              <GitMerge className="h-3.5 w-3.5" />
              Merge
            </Button>
            {(c.archived_at || "").trim() ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => unarchive.mutate()}
                disabled={unarchive.isPending}
                title="Unarchive this contact"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                {unarchive.isPending ? "Unarchiving…" : "Unarchive"}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm(`Archive ${c.name}? They'll be hidden from default lists. You can unarchive later.`)) {
                    archive.mutate();
                  }
                }}
                disabled={archive.isPending || save.isPending}
                title="Archive this contact (soft-delete; reversible)"
              >
                <Archive className="h-3.5 w-3.5" />
                {archive.isPending ? "Archiving…" : "Archive"}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={discard}
              disabled={!dirty || save.isPending}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              <Save className="h-3.5 w-3.5" />
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
        {(c.archived_at || "").trim() && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-status-warning">
            <Archive className="h-3 w-3" />
            Archived {formatRelative(c.archived_at)} — hidden from default lists
          </p>
        )}
        {archiveError && (
          <p className="mt-2 text-xs text-status-error">{archiveError}</p>
        )}
        {(c.occupation || c.company) && (
          <p className="mt-2 text-sm text-fg-muted">
            {[c.occupation, c.company].filter(Boolean).join(" · ")}
          </p>
        )}
        {saveError && (
          <p className="mt-2 text-xs text-status-error">{saveError}</p>
        )}
        {!saveError && lastSavedFields.length > 0 && !dirty && (
          <p className="mt-2 text-xs text-status-success">
            Saved {lastSavedFields.length} field
            {lastSavedFields.length === 1 ? "" : "s"}: {" "}
            {lastSavedFields.map(humanize).join(", ")}.
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto px-8 py-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-8">
        {/* Left column: editable form */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="awm-label">Profile</h2>
            <span className="text-xs text-fg-subtle inline-flex items-center gap-1">
              <Info className="h-3 w-3" /> Hermes-managed fields are
              read-only.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Phone" htmlFor="phone">
              <Input
                id="phone"
                value={values.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+65 9123 4567"
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Occupation" htmlFor="occupation">
              <Input
                id="occupation"
                value={values.occupation}
                onChange={(e) => update("occupation", e.target.value)}
              />
            </Field>
            <Field label="Company" htmlFor="company">
              <Input
                id="company"
                value={values.company}
                onChange={(e) => update("company", e.target.value)}
              />
            </Field>
            <Field label="Birthday" htmlFor="birthday">
              <DateInput
                id="birthday"
                value={values.birthday}
                onChange={(v) => update("birthday", v)}
                placeholder="Birthday"
              />
            </Field>
            <Field label="Referral source" htmlFor="referral_source">
              <Input
                id="referral_source"
                value={values.referral_source}
                onChange={(e) => update("referral_source", e.target.value)}
                placeholder="Plain text (e.g. ABC Immigration) or click Link"
              />
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <ReferralLinkHint
                  raw={values.referral_source}
                />
                <ReferralLinkButton
                  ownContactId={contactId ?? ""}
                  onPick={(v) => update("referral_source", v)}
                />
              </div>
            </Field>
            <Field
              label="Last touch (auto)"
              hint="Updated when you log new touchpoints"
            >
              <Input
                readOnly
                value={
                  c.last_touch_date
                    ? `${formatShortDate(c.last_touch_date)} · ${formatRelative(c.last_touch_date)}`
                    : "—"
                }
              />
            </Field>
            <Field
              label="Next scheduled review"
              htmlFor="next_review_date"
              hint="Annual review / policy review checkpoint. For ad-hoc meetings, use a reminder instead."
            >
              <DateInput
                id="next_review_date"
                value={values.next_review_date}
                onChange={(v) => update("next_review_date", v)}
                placeholder="Next review"
              />
            </Field>
          </div>

          <div className="mt-6 space-y-4">
            <Field label="Address" htmlFor="address">
              <Textarea
                id="address"
                rows={2}
                value={values.address}
                onChange={(e) => update("address", e.target.value)}
              />
            </Field>
            <Field label="Financial concerns" htmlFor="financial_concerns">
              <Textarea
                id="financial_concerns"
                rows={3}
                value={values.financial_concerns}
                onChange={(e) => update("financial_concerns", e.target.value)}
              />
            </Field>
            <Field label="Interests" htmlFor="interests">
              <Textarea
                id="interests"
                rows={2}
                value={values.interests}
                onChange={(e) => update("interests", e.target.value)}
              />
            </Field>
            <Field label="Family" htmlFor="family">
              <Textarea
                id="family"
                rows={3}
                value={values.family}
                onChange={(e) => update("family", e.target.value)}
                placeholder="Free text — e.g. 'wife and 2 kids in primary school'. Link specific contacts via the panel below."
              />
              {contactId && <FamilyPanel contactId={contactId} />}
            </Field>
            {/* Legacy free-text policies field — superseded by the structured
                Policies module on the right panel. Render read-only and only
                when there's existing content, so old data is recoverable but
                doesn't invite new entries. */}
            {(values.policies || "").trim() && (
              <Field
                label="Legacy policy notes (read-only)"
                htmlFor="policies"
                hint="Use the Policies panel on the right for structured records. Edit here only to copy values across, then clear."
              >
                <Textarea
                  id="policies"
                  rows={3}
                  value={values.policies}
                  onChange={(e) => update("policies", e.target.value)}
                />
              </Field>
            )}
            <Field label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                rows={5}
                value={values.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* Right column: timeline + reminders */}
        <section className="space-y-8">
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-baseline gap-2">
                <h2 className="awm-label">Touchpoint timeline</h2>
                <span className="text-xs text-fg-subtle">
                  {(() => {
                    const all = touchpoints.data ?? [];
                    const visible = showImportTouchpoints
                      ? all
                      : all.filter((t) => t.type !== "import");
                    return all.length === visible.length
                      ? `${all.length} entries`
                      : `${visible.length} of ${all.length} entries`;
                  })()}
                </span>
              </div>
              {(touchpoints.data ?? []).some((t) => t.type === "import") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowImportTouchpoints((v) => !v)}
                >
                  {showImportTouchpoints ? "Hide imports" : "Show imports"}
                </Button>
              )}
            </div>
            {touchpoints.isPending ? (
              <p className="text-sm text-fg-muted">Loading…</p>
            ) : !touchpoints.data?.length ? (
              <p className="text-sm text-fg-subtle italic">
                No touchpoints logged yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {(showImportTouchpoints
                  ? touchpoints.data
                  : touchpoints.data.filter((t) => t.type !== "import")
                ).map((t) => (
                  <li
                    key={t.id}
                    className="rounded-sm border border-border bg-bg-surface p-4"
                  >
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-fg tabular-nums">
                        {formatShortDate(t.date)}
                      </span>
                      <span className="text-fg-subtle">·</span>
                      {t.type && (
                        <Badge tone="neutral">{humanize(t.type)}</Badge>
                      )}
                      {t.sentiment && (
                        <Badge tone={SENTIMENT_TONE[t.sentiment as Sentiment]}>
                          {humanize(t.sentiment)}
                        </Badge>
                      )}
                      {t.meeting_number && (
                        <span className="ml-auto text-fg-subtle">
                          Meeting #{t.meeting_number}
                        </span>
                      )}
                    </div>
                    {t.summary && (
                      <p className="mt-2 text-sm text-fg/90 leading-snug">
                        {t.summary}
                      </p>
                    )}
                    {t.topics && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.topics
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((topic) => (
                            <span
                              key={topic}
                              className="font-mono text-[10px] text-status-info"
                            >
                              #{topic}
                            </span>
                          ))}
                      </div>
                    )}
                    {t.action_items && (
                      <div className="mt-3 border-l-2 border-gold-dim pl-3">
                        <div className="awm-label mb-1">Action items</div>
                        <p className="text-xs text-fg/80 whitespace-pre-wrap">
                          {t.action_items}
                        </p>
                      </div>
                    )}
                    <div className="mt-3 text-right">
                      <Link
                        to={`/touchpoints/${t.id}`}
                        className="text-[11px] uppercase tracking-wider font-condensed font-bold text-gold/70 hover:text-gold"
                      >
                        Open detail →
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <PoliciesSection
              contactId={c.id}
              contactName={c.name}
              policies={policies.data ?? []}
              isPending={policies.isPending}
              onChanged={() => {
                if (contactId) {
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.policiesByContact(contactId),
                  });
                }
              }}
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="awm-label">Generate</h2>
              <Link
                to="/documents"
                className="text-[11px] uppercase tracking-wider font-condensed font-bold text-fg-muted hover:text-fg inline-flex items-center gap-1"
              >
                <FolderOpen className="h-3 w-3" /> All documents
              </Link>
            </div>
            <GenerateButtons contactName={c.name} />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="awm-label">Generated documents</h2>
              <span className="text-xs text-fg-subtle">
                {contactDocuments.length}
              </span>
            </div>
            {allDocuments.isPending ? (
              <p className="text-sm text-fg-muted">Loading…</p>
            ) : contactDocuments.length === 0 ? (
              <p className="text-sm text-fg-subtle italic">
                Nothing generated for this contact yet.
              </p>
            ) : (
              <>
                {documentError && (
                  <p className="mb-2 rounded-sm border border-status-error/30 bg-status-error/[0.08] p-2 text-xs text-status-error">
                    Could not open document: {documentError}
                  </p>
                )}
                <ul className="space-y-2">
                  {contactDocuments.map((d) => (
                    <li
                      key={d.path}
                      className="rounded-sm border border-border bg-bg-surface p-3 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-fg font-semibold truncate">
                          {d.filename}
                        </p>
                        <p className="text-xs text-fg-muted">
                          {DOCUMENT_KIND_LABEL[d.kind]} ·{" "}
                          {formatBytes(d.size)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDocument(d.path)}
                        aria-label="Open document"
                        disabled={openingDocumentPath === d.path}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {openingDocumentPath === d.path ? "Opening" : "Open"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevealDocument(d.path)}
                        aria-label="Reveal in Finder"
                        title="Reveal in Finder"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-baseline gap-2">
                <h2 className="awm-label">
                  {showAllReminders ? "Reminder history" : "Pending reminders"}
                </h2>
                <span className="text-xs text-fg-subtle">
                  {visibleReminders.length} of {(reminders.data ?? []).length}
                </span>
              </div>
              {(reminders.data ?? []).length > pendingReminders.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllReminders((v) => !v)}
                >
                  <History className="h-3.5 w-3.5" />
                  {showAllReminders ? "Pending only" : "Show all"}
                </Button>
              )}
            </div>
            {reminders.isPending ? (
              <p className="text-sm text-fg-muted">Loading…</p>
            ) : !visibleReminders.length ? (
              <p className="text-sm text-fg-subtle italic">
                {showAllReminders
                  ? "No reminders logged for this contact."
                  : "No pending reminders for this contact."}
              </p>
            ) : (
              <ul className="space-y-2">
                {visibleReminders.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-sm border border-border bg-bg-surface p-3 flex items-start gap-3"
                  >
                    <div className="flex flex-col items-center min-w-12">
                      <span className="text-xs text-fg/80 tabular-nums">
                        {formatShortDate(r.due_date)}
                      </span>
                      <span className="text-[10px] text-fg-subtle uppercase tracking-wider mt-0.5">
                        {formatRelative(r.due_date)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.priority && (
                          <Badge
                            tone={PRIORITY_TONE[r.priority as ReminderPriority]}
                          >
                            {humanize(r.priority)}
                          </Badge>
                        )}
                        {r.status && (
                          <Badge
                            tone={
                              REMINDER_STATUS_TONE[r.status as ReminderStatus]
                            }
                          >
                            {humanize(r.status)}
                          </Badge>
                        )}
                        {r.type && (
                          <span className="text-[10px] uppercase tracking-wider font-condensed text-fg-muted">
                            {humanize(r.type)}
                          </span>
                        )}
                      </div>
                      {r.context && (
                        <p className="mt-1.5 text-sm text-fg/85 leading-snug">
                          {r.context}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <MergeContactDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        fromContact={c}
        candidates={(allContacts.data ?? []).filter((other) => other.id !== c.id)}
        onMerged={(intoId) => {
          setMergeOpen(false);
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
          queryClient.invalidateQueries({ queryKey: queryKeys.touchpoints });
          queryClient.invalidateQueries({ queryKey: queryKeys.reminders });
          navigate(`/contacts/${intoId}`);
        }}
      />

      <RenameContactDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        contact={c}
        onRenamed={() => {
          setRenameOpen(false);
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
          queryClient.invalidateQueries({ queryKey: queryKeys.contact(c.id) });
          queryClient.invalidateQueries({ queryKey: queryKeys.touchpoints });
          queryClient.invalidateQueries({ queryKey: queryKeys.reminders });
        }}
      />
    </div>
  );
}

function RenameContactDialog({
  open,
  onOpenChange,
  contact,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactRow;
  onRenamed: () => void;
}) {
  const [newName, setNewName] = useState(contact.name);
  useEffect(() => {
    if (open) setNewName(contact.name);
  }, [open, contact.name]);

  const rename = useMutation({
    mutationFn: async () => {
      const trimmed = newName.trim();
      if (!trimmed) throw new Error("Name cannot be empty.");
      if (trimmed === contact.name) throw new Error("Name is unchanged.");
      return renameContact(contact.id, trimmed);
    },
    onSuccess: () => onRenamed(),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename contact</DialogTitle>
          <DialogDescription>
            Rename{" "}
            <span className="text-fg font-semibold">{contact.name}</span>.
            All touchpoints and reminders attached to this contact will be
            updated in lockstep.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!rename.isPending) rename.mutate();
          }}
        >
          <DialogBody className="space-y-3">
            <Field label="New full name" htmlFor="rename-name">
              <Input
                id="rename-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </Field>
            {rename.isError && (
              <p className="text-xs text-status-error" role="alert">
                {rename.error instanceof Error ? rename.error.message : String(rename.error)}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={rename.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gold"
              size="sm"
              disabled={rename.isPending || !newName.trim() || newName.trim() === contact.name}
            >
              <Edit3 className="h-3.5 w-3.5" />
              {rename.isPending ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeContactDialog({
  open,
  onOpenChange,
  fromContact,
  candidates,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromContact: ContactRow;
  candidates: ContactRow[];
  onMerged: (intoId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedInto, setSelectedInto] = useState<ContactRow | null>(null);
  const [confirmStage, setConfirmStage] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedInto(null);
      setConfirmStage(false);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates.slice(0, 20);
    return candidates
      .filter((c) => {
        const hay = [c.name, c.occupation, c.company, c.email]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [candidates, search]);

  const merge = useMutation({
    mutationFn: async () => {
      if (!selectedInto) throw new Error("No target contact selected.");
      return mergeContacts(fromContact.id, selectedInto.id);
    },
    onSuccess: (result) => {
      onMerged(result.into_id);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge contact</DialogTitle>
          <DialogDescription>
            Move all touchpoints and reminders from{" "}
            <span className="text-fg font-semibold">{fromContact.name}</span>{" "}
            into another contact. The source contact will be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {!confirmStage ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search contacts to merge into…"
                  className="pl-9"
                />
              </div>
              <ul className="max-h-64 overflow-auto border border-border rounded-sm divide-y divide-border/40">
                {filtered.length === 0 ? (
                  <li className="p-3 text-xs text-fg-subtle italic">
                    No other contacts.
                  </li>
                ) : (
                  filtered.map((c) => {
                    const isSelected = selectedInto?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedInto(c)}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            isSelected
                              ? "bg-gold/10 text-fg"
                              : "text-fg/85 hover:bg-bg-raised/40"
                          }`}
                        >
                          <div className="font-semibold">{c.name}</div>
                          {(c.occupation || c.company) && (
                            <div className="text-xs text-fg-muted">
                              {[c.occupation, c.company].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-fg/85">
                Merge <span className="font-semibold">{fromContact.name}</span>{" "}
                into <span className="font-semibold">{selectedInto?.name}</span>?
              </p>
              <ul className="text-xs text-fg-muted list-disc pl-5 space-y-1">
                <li>All touchpoints will be reassigned to {selectedInto?.name}.</li>
                <li>All reminders will be reassigned to {selectedInto?.name}.</li>
                <li>
                  Consultant-managed fields merge field-by-field. Where both
                  contacts have a value, {selectedInto?.name}'s wins; the
                  other value lands in the notes field with a merge marker.
                </li>
                <li className="text-status-error/90">
                  The source contact{" "}
                  <span className="font-semibold">{fromContact.name}</span>{" "}
                  will be deleted. This cannot be undone (events table will
                  record the merge).
                </li>
              </ul>
            </div>
          )}
          {merge.isError && (
            <p className="text-xs text-status-error" role="alert">
              {merge.error instanceof Error ? merge.error.message : String(merge.error)}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={merge.isPending}
          >
            Cancel
          </Button>
          {!confirmStage ? (
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => setConfirmStage(true)}
              disabled={!selectedInto}
            >
              <GitMerge className="h-3.5 w-3.5" />
              Continue
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmStage(false)}
                disabled={merge.isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => merge.mutate()}
                disabled={merge.isPending || !selectedInto}
              >
                <GitMerge className="h-3.5 w-3.5" />
                {merge.isPending ? "Merging…" : "Merge contacts"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PoliciesSection({
  contactId,
  contactName,
  policies,
  isPending,
  onChanged,
}: {
  contactId: string;
  contactName: string;
  policies: PolicyRow[];
  isPending: boolean;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyRow | null>(null);
  const [expandedPolicyIds, setExpandedPolicyIds] = useState<Set<string>>(
    () => new Set()
  );

  function togglePolicyDetails(policyId: string) {
    setExpandedPolicyIds((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) {
        next.delete(policyId);
      } else {
        next.add(policyId);
      }
      return next;
    });
  }

  return (
    <>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="awm-label inline-flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          Policies
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add policy
        </Button>
      </div>
      {isPending ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : policies.length === 0 ? (
        <p className="text-sm text-fg-subtle italic">
          No policies on file for this contact.
        </p>
      ) : (
        <ul className="space-y-2">
          {policies.map((p) => {
            const detailRows = policyDetailRows(p);
            const isExpanded = expandedPolicyIds.has(p.id);
            return (
              <li
                key={p.id}
                className="rounded-sm border border-border bg-bg-surface p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-body text-sm font-semibold text-fg">
                    {p.plan_name || "(unnamed plan)"}
                  </span>
                  {p.insurer && (
                    <span className="text-xs text-fg-muted">· {p.insurer}</span>
                  )}
                  {p.status && p.status !== "active" && (
                    <Badge tone="warning">{humanize(p.status)}</Badge>
                  )}
                  {p.policy_type && (
                    <span className="text-[10px] uppercase tracking-wider font-condensed text-fg-muted ml-auto">
                      {humanize(p.policy_type)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg/85">
                  {p.premium_amount && (
                    <span>
                      <span className="text-fg-muted">Premium:</span>{" "}
                      {p.premium_amount}
                      {p.premium_frequency ? ` / ${p.premium_frequency}` : ""}
                    </span>
                  )}
                  {p.sum_assured && (
                    <span>
                      <span className="text-fg-muted">Sum assured:</span>{" "}
                      {p.sum_assured}
                    </span>
                  )}
                  {p.current_value && (
                    <span>
                      <span className="text-fg-muted">Current value:</span>{" "}
                      {p.current_value}
                      {p.valuation_date
                        ? ` as of ${formatShortDate(p.valuation_date)}`
                        : ""}
                    </span>
                  )}
                  {p.review_date && (
                    <span>
                      <span className="text-fg-muted">Review:</span>{" "}
                      {formatShortDate(p.review_date)}
                    </span>
                  )}
                </div>
                {isExpanded && detailRows.length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
                    {detailRows.map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="font-condensed uppercase tracking-wider text-[10px] text-fg-muted">
                          {label}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap break-words text-fg/85">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  {detailRows.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePolicyDetails(p.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Details
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingPolicy(p)}
                  >
                    Edit
                  </Button>
                  <ArchivePolicyButton policy={p} onArchived={onChanged} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PolicyFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        contactId={contactId}
        contactName={contactName}
        mode="add"
        onSaved={() => {
          setAddOpen(false);
          onChanged();
        }}
      />
      <PolicyFormDialog
        open={editingPolicy !== null}
        onOpenChange={(open) => !open && setEditingPolicy(null)}
        contactId={contactId}
        contactName={contactName}
        mode="edit"
        existing={editingPolicy}
        onSaved={() => {
          setEditingPolicy(null);
          onChanged();
        }}
      />
    </>
  );
}

function ArchivePolicyButton({
  policy,
  onArchived,
}: {
  policy: PolicyRow;
  onArchived: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const archive = useMutation({
    mutationFn: () => archivePolicy(policy.id),
    onSuccess: () => {
      setConfirming(false);
      onArchived();
    },
  });

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        <Archive className="h-3 w-3" />
        Archive
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-xs text-fg-muted">Sure?</span>
      <Button
        variant="danger"
        size="sm"
        disabled={archive.isPending}
        onClick={() => archive.mutate()}
      >
        {archive.isPending ? "…" : "Yes"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={archive.isPending}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function PolicyFormDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  mode,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  mode: "add" | "edit";
  existing?: PolicyRow | null;
  onSaved: () => void;
}) {
  const blank: PolicyPayload = {
    insurer: "",
    plan_name: "",
    policy_type: "",
    policy_number: "",
    sum_assured: "",
    premium_amount: "",
    premium_frequency: "",
    premium_term: "",
    policy_term: "",
    payment_method: "",
    start_date: "",
    review_date: "",
    review_frequency: "",
    last_reviewed: "",
    current_value: "",
    valuation_date: "",
    surrender_value: "",
    policy_owner: "",
    life_assured: "",
    payor: "",
    beneficiaries: "",
    riders: "",
    servicing_rep: "",
    needs_category: "",
    status: "active",
    notes: "",
  };
  const [form, setForm] = useState<PolicyPayload>(blank);

  useEffect(() => {
    if (open && mode === "edit" && existing) {
      setForm({
        insurer: existing.insurer,
        plan_name: existing.plan_name,
        policy_type: existing.policy_type,
        policy_number: existing.policy_number,
        sum_assured: existing.sum_assured,
        premium_amount: existing.premium_amount,
        premium_frequency: existing.premium_frequency,
        premium_term: existing.premium_term,
        policy_term: existing.policy_term,
        payment_method: existing.payment_method,
        start_date: existing.start_date,
        review_date: existing.review_date,
        review_frequency: existing.review_frequency,
        last_reviewed: existing.last_reviewed,
        current_value: existing.current_value,
        valuation_date: existing.valuation_date,
        surrender_value: existing.surrender_value,
        policy_owner: existing.policy_owner,
        life_assured: existing.life_assured,
        payor: existing.payor,
        beneficiaries: existing.beneficiaries,
        riders: existing.riders,
        servicing_rep: existing.servicing_rep,
        needs_category: existing.needs_category,
        status: existing.status || "active",
        notes: existing.notes,
      });
    } else if (open && mode === "add") {
      setForm(blank);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, existing?.id]);

  function update<K extends keyof PolicyPayload>(key: K, value: PolicyPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "edit" && existing) {
        return updatePolicy(existing.id, form);
      }
      return addPolicy({ ...form, contact_id: contactId });
    },
    onSuccess: () => {
      onSaved();
    },
  });

  const canSave = Boolean((form.insurer || "").trim() && (form.plan_name || "").trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add policy" : "Edit policy"}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? "New policy for " : "Editing policy on "}
            <span className="text-fg font-semibold">{contactName}</span>.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave && !save.isPending) save.mutate();
          }}
        >
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Insurer" htmlFor="pf-insurer">
                <Input
                  id="pf-insurer"
                  value={form.insurer ?? ""}
                  onChange={(e) => update("insurer", e.target.value)}
                  placeholder="e.g. AIA"
                />
              </Field>
              <Field label="Plan name" htmlFor="pf-plan">
                <Input
                  id="pf-plan"
                  value={form.plan_name ?? ""}
                  onChange={(e) => update("plan_name", e.target.value)}
                  placeholder="e.g. Secure Flexi Term"
                />
              </Field>
              <Field label="Policy number" htmlFor="pf-number">
                <Input
                  id="pf-number"
                  value={form.policy_number ?? ""}
                  onChange={(e) => update("policy_number", e.target.value)}
                  placeholder="optional"
                />
              </Field>
              <Field label="Policy type" htmlFor="pf-type">
                <Input
                  id="pf-type"
                  value={form.policy_type ?? ""}
                  onChange={(e) => update("policy_type", e.target.value)}
                  placeholder="protection / savings / investment-linked / ci"
                />
              </Field>
              <Field label="Status" htmlFor="pf-status">
                <select
                  id="pf-status"
                  value={form.status ?? "active"}
                  onChange={(e) => update("status", e.target.value)}
                  className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
                >
                  {POLICY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Need category" htmlFor="pf-need">
                <Input
                  id="pf-need"
                  value={form.needs_category ?? ""}
                  onChange={(e) => update("needs_category", e.target.value)}
                  placeholder="protection / retirement / education"
                />
              </Field>
              <Field label="Premium amount" htmlFor="pf-prem-amount">
                <Input
                  id="pf-prem-amount"
                  value={form.premium_amount ?? ""}
                  onChange={(e) => update("premium_amount", e.target.value)}
                  placeholder="e.g. $2,050"
                />
              </Field>
              <Field label="Premium frequency" htmlFor="pf-prem-freq">
                <Input
                  id="pf-prem-freq"
                  value={form.premium_frequency ?? ""}
                  onChange={(e) => update("premium_frequency", e.target.value)}
                  placeholder="annual / monthly / single-pay"
                />
              </Field>
              <Field label="Premium term" htmlFor="pf-prem-term">
                <Input
                  id="pf-prem-term"
                  value={form.premium_term ?? ""}
                  onChange={(e) => update("premium_term", e.target.value)}
                  placeholder="e.g. 20 years"
                />
              </Field>
              <Field label="Policy term" htmlFor="pf-policy-term">
                <Input
                  id="pf-policy-term"
                  value={form.policy_term ?? ""}
                  onChange={(e) => update("policy_term", e.target.value)}
                  placeholder="e.g. whole life"
                />
              </Field>
              <Field label="Payment method" htmlFor="pf-payment-method">
                <Input
                  id="pf-payment-method"
                  value={form.payment_method ?? ""}
                  onChange={(e) => update("payment_method", e.target.value)}
                  placeholder="GIRO / CPF / credit card"
                />
              </Field>
              <Field label="Sum assured" htmlFor="pf-sum" className="col-span-2">
                <Input
                  id="pf-sum"
                  value={form.sum_assured ?? ""}
                  onChange={(e) => update("sum_assured", e.target.value)}
                  placeholder="e.g. S$500,000"
                />
              </Field>
              <Field label="Current value" htmlFor="pf-current-value">
                <Input
                  id="pf-current-value"
                  value={form.current_value ?? ""}
                  onChange={(e) => update("current_value", e.target.value)}
                  placeholder="e.g. S$35,423"
                />
              </Field>
              <Field label="Valuation date" htmlFor="pf-valuation">
                <Input
                  id="pf-valuation"
                  type="date"
                  value={form.valuation_date ?? ""}
                  onChange={(e) => update("valuation_date", e.target.value)}
                />
              </Field>
              <Field label="Surrender value" htmlFor="pf-surrender">
                <Input
                  id="pf-surrender"
                  value={form.surrender_value ?? ""}
                  onChange={(e) => update("surrender_value", e.target.value)}
                  placeholder="if known"
                />
              </Field>
              <Field label="Policy owner" htmlFor="pf-owner">
                <Input
                  id="pf-owner"
                  value={form.policy_owner ?? ""}
                  onChange={(e) => update("policy_owner", e.target.value)}
                  placeholder={contactName}
                />
              </Field>
              <Field label="Life assured" htmlFor="pf-life-assured">
                <Input
                  id="pf-life-assured"
                  value={form.life_assured ?? ""}
                  onChange={(e) => update("life_assured", e.target.value)}
                  placeholder={contactName}
                />
              </Field>
              <Field label="Payor" htmlFor="pf-payor">
                <Input
                  id="pf-payor"
                  value={form.payor ?? ""}
                  onChange={(e) => update("payor", e.target.value)}
                  placeholder="premium payor"
                />
              </Field>
              <Field label="Start date" htmlFor="pf-start">
                <Input
                  id="pf-start"
                  type="date"
                  value={form.start_date ?? ""}
                  onChange={(e) => update("start_date", e.target.value)}
                />
              </Field>
              <Field label="Review date" htmlFor="pf-review">
                <Input
                  id="pf-review"
                  type="date"
                  value={form.review_date ?? ""}
                  onChange={(e) => update("review_date", e.target.value)}
                />
              </Field>
              <Field label="Review frequency" htmlFor="pf-review-frequency">
                <Input
                  id="pf-review-frequency"
                  value={form.review_frequency ?? ""}
                  onChange={(e) => update("review_frequency", e.target.value)}
                  placeholder="annual / semi-annual"
                />
              </Field>
              <Field label="Last reviewed" htmlFor="pf-last-reviewed">
                <Input
                  id="pf-last-reviewed"
                  type="date"
                  value={form.last_reviewed ?? ""}
                  onChange={(e) => update("last_reviewed", e.target.value)}
                />
              </Field>
              <Field label="Servicing rep" htmlFor="pf-servicing">
                <Input
                  id="pf-servicing"
                  value={form.servicing_rep ?? ""}
                  onChange={(e) => update("servicing_rep", e.target.value)}
                  placeholder="adviser / rep"
                />
              </Field>
              <Field label="Beneficiaries" htmlFor="pf-beneficiaries" className="col-span-2">
                <Textarea
                  id="pf-beneficiaries"
                  rows={2}
                  value={form.beneficiaries ?? ""}
                  onChange={(e) => update("beneficiaries", e.target.value)}
                />
              </Field>
              <Field label="Riders" htmlFor="pf-riders" className="col-span-2">
                <Textarea
                  id="pf-riders"
                  rows={2}
                  value={form.riders ?? ""}
                  onChange={(e) => update("riders", e.target.value)}
                />
              </Field>
              <Field label="Notes" htmlFor="pf-notes" className="col-span-2">
                <Textarea
                  id="pf-notes"
                  rows={3}
                  value={form.notes ?? ""}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </Field>
            </div>
            {save.isError && (
              <p className="text-xs text-status-error" role="alert">
                {save.error instanceof Error ? save.error.message : String(save.error)}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gold"
              size="sm"
              disabled={!canSave || save.isPending}
            >
              <Save className="h-3.5 w-3.5" />
              {save.isPending
                ? mode === "add"
                  ? "Adding…"
                  : "Saving…"
                : mode === "add"
                  ? "Add policy"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
