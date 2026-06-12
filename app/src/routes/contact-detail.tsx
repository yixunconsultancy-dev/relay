import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/lib/db";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Download,
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
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import {
  Badge,
  CONTACT_TYPE_TONE,
  PRIORITY_TONE,
  REMINDER_STATUS_TONE,
  SENTIMENT_TONE,
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
  useInvestmentProducts,
  usePoliciesByContact,
  useRelationshipsForContact,
  useRemindersByContact,
  useTouchpointsByContact,
} from "@/lib/queries";
import { updateContact } from "@/lib/mutations";
import { resetDbConnection } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  addPolicy,
  archiveContact,
  archivePolicy,
  bulkImportPolicies,
  createContact,
  discardPolicy,
  linkContact,
  mergeContacts,
  renameContact,
  restoreFromTrash,
  trashContact,
  unarchiveContact,
  updatePolicy,
  type PolicyPayload,
} from "@/lib/kit";
import {
  contactSlug,
  DOCUMENT_KIND_LABEL,
  fileTypeFromName,
  formatBytes,
  importContactDocumentFile,
  deleteContactDocumentFile,
  openContactDocumentFile,
  revealContactDocumentFile,
  matchContactSlug,
  openDocument,
  revealDocumentInFinder,
  useGeneratedDocuments,
} from "@/lib/documents";
import {
  POLICY_STATUSES,
  NEED_CATEGORIES,
  NEED_CATEGORY_LABEL,
  type ContactRow,
  type ContactDocumentRow,
  type PolicyRow,
  type NeedCategory,
  type Beneficiary,
} from "@/lib/schema";
import { useDocumentsByContact } from "@/lib/queries";
import { parseCustomFields, propagateFieldToAllContacts, saveCustomFields, type CustomFields } from "@/lib/custom-fields";
import {
  TOUCHPOINT_TYPE_LABEL,
  type ContactType,
  type ReminderPriority,
  type ReminderStatus,
  type Sentiment,
  type TouchpointType,
} from "@/lib/enums";
import {
  EDITABLE_CONTACT_FIELDS,
  type EditableContactField,
} from "@/lib/schema";
import { formatShortDate, formatRelative, formatMoney, humanize } from "@/lib/format";
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

/**
 * Decode a policy's `sum_assured` JSON column into a human-readable string.
 *
 * The column stores a JSON object keyed by need_category ({"savings_investments":
 * "25000", "death": "100000"}). The raw text shouldn't be shown on the card —
 * we render one "<Category Label>: $X,XXX" line per entry instead, falling
 * back to the formatted money value alone if there's only one category.
 *
 * Defensive: returns the raw string untouched for legacy/non-JSON values so
 * a malformed cell doesn't blank out.
 */
function formatSumAssured(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const entries = Object.entries(obj as Record<string, string>).filter(
        ([, v]) => (v || "").toString().trim()
      );
      if (entries.length === 0) return "";
      // Single-category sums are just rendered as the formatted money figure;
      // multi-category sums get one line per category so it stays readable.
      if (entries.length === 1) {
        const [cat, val] = entries[0];
        const label = NEED_CATEGORY_LABEL[cat as NeedCategory] ?? humanize(cat);
        return `${label}: ${formatMoney(val)}`;
      }
      return entries
        .map(([cat, val]) => {
          const label =
            NEED_CATEGORY_LABEL[cat as NeedCategory] ?? humanize(cat);
          return `${label}: ${formatMoney(val)}`;
        })
        .join(" · ");
    }
  } catch {
    /* fall through */
  }
  // Legacy free-text sum_assured (e.g. "100,000"). Format as money if it
  // looks numeric; otherwise show as-is.
  const numeric = Number(trimmed.replace(/[,$\s]/g, ""));
  return isFinite(numeric) && numeric > 0 ? formatMoney(numeric) : trimmed;
}

/**
 * Decode the multi-select needs_category CSV column into the human labels.
 * "death,savings_investments" → "Death, Savings/Investments".
 */
function formatNeedsCategory(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => NEED_CATEGORY_LABEL[t as NeedCategory] ?? humanize(t))
    .join(", ");
}

/** Decode the beneficiaries JSON array into "Name (Relationship) — XX%" pieces.
 *  Joined with " · " so the card stays compact; the dot separator matches the
 *  pattern used elsewhere on the page (Sum assured multi-category, etc.). */
function formatBeneficiaries(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      const parts: string[] = [];
      for (const b of arr) {
        const name = String(b?.name ?? "").trim();
        if (!name) continue;
        const rel = String(b?.relationship ?? "").trim();
        const pct = String(b?.percentage ?? "").trim();
        let piece = name;
        if (rel) piece += ` (${rel})`;
        if (pct) piece += ` — ${pct}%`;
        parts.push(piece);
      }
      if (parts.length > 0) return parts.join(" · ");
    }
  } catch {
    /* legacy free-text beneficiaries — show as-is */
  }
  return raw.trim();
}

function policyDetailRows(policy: PolicyRow): Array<[string, string]> {
  const rows: Array<[string, string | undefined]> = [
    ["Policy number", policy.policy_number],
    ["Need category", formatNeedsCategory(policy.needs_category)],
    ["Premium term", policy.premium_term],
    ["Policy term", policy.policy_term],
    ["Payment method", policy.payment_method],
    ["Start date", policy.start_date ? formatShortDate(policy.start_date) : ""],
    ["Review frequency", policy.review_frequency],
    ["Last reviewed", policy.last_reviewed ? formatShortDate(policy.last_reviewed) : ""],
    ["Surrender value", policy.surrender_value ? formatMoney(policy.surrender_value) : ""],
    ["Policy owner", policy.policy_owner],
    ["Life assured", policy.life_assured],
    ["Payor", policy.payor],
    ["Beneficiaries", formatBeneficiaries(policy.beneficiaries)],
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

// ── Excel template download helper ───────────────────────────────────────────

/** Ask the Python kit to generate a styled .xlsx template, then open it. */
async function downloadXlsxTemplate(templateName: "clients" | "policies") {
  try {
    // 1. Python writes the .xlsx to vault/Downloads/ and returns its path.
    let result: { ok: boolean; exit_code: number; stdout: string; stderr: string };
    try {
      result = await invoke<{ ok: boolean; exit_code: number; stdout: string; stderr: string }>(
        "run_kit_command",
        { args: ["--format=json", "generate-template", "--name", templateName], jsonPayload: null }
      );
    } catch (invokeErr) {
      alert(`[Step 1 — run_kit_command invoke failed]\n${String(invokeErr)}`);
      return;
    }

    if (!result.ok) {
      alert(`[Step 1 — Python generate-template failed (exit ${result.exit_code})]\nstderr: ${result.stderr}\nstdout: ${result.stdout}`);
      return;
    }

    let payload: { ok: boolean; path: string };
    try {
      payload = JSON.parse(result.stdout) as { ok: boolean; path: string };
    } catch (parseErr) {
      alert(`[Step 2 — JSON.parse failed]\nstdout was: ${result.stdout}\nerror: ${String(parseErr)}`);
      return;
    }

    if (!payload.ok || !payload.path) {
      alert(`[Step 2 — unexpected payload]\n${result.stdout}`);
      return;
    }

    // 2. Rust opens the file — only Rust has the entitlements to launch apps.
    try {
      await invoke("open_vault_file", { path: payload.path });
    } catch (openErr) {
      alert(`[Step 3 — open_vault_file failed]\npath: ${payload.path}\nerror: ${String(openErr)}`);
    }
  } catch (e) {
    alert(`[downloadXlsxTemplate — unexpected error]\n${String(e)}`);
  }
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  const moveToTrash = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error("Missing contact id");
      return trashContact(contactId);
    },
    onSuccess: () => {
      setDeleteOpen(false);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      queryClient.invalidateQueries({ queryKey: queryKeys.trashedContacts });
      navigate("/contacts");
    },
    onError: (e) => setDeleteError(e instanceof Error ? e.message : String(e)),
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
              <Badge tone={CONTACT_TYPE_TONE[c.type as ContactType] ?? "neutral"}>
                {humanize(c.type)}
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
              variant="ghost"
              size="sm"
              onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
              disabled={save.isPending || archive.isPending || moveToTrash.isPending}
              title="Move this contact to the Trash"
              className="text-status-error hover:text-status-error hover:bg-status-error/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
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
        {deleteError && (
          <p className="mt-2 text-xs text-status-error">{deleteError}</p>
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
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {/* Type — single pipeline stage selector */}
            <Field label="Type" htmlFor="contact-type" className="col-span-2">
              <select
                id="contact-type"
                value={values.type ?? c.type ?? ""}
                onChange={(e) => update("type", e.target.value)}
                className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
              >
                <option value="cold">Cold</option>
                <option value="warming">Warming</option>
                <option value="in_conversation">In Conversation</option>
                <option value="client">Client</option>
              </select>
            </Field>
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
            <Field label="Referred By" htmlFor="referral_source">
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
                        <Badge tone="neutral">{TOUCHPOINT_TYPE_LABEL[t.type as TouchpointType] ?? humanize(t.type)}</Badge>
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
                  // Reset the Tauri SQL connection so the next read sees the
                  // policy Python just wrote (WAL snapshot otherwise sticks).
                  resetDbConnection();
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.policiesByContact(contactId),
                  });
                  // Also invalidate the global policies list so the
                  // Investments dashboard refreshes.
                  queryClient.invalidateQueries({ queryKey: queryKeys.policies });
                }
              }}
            />
          </div>

          <div>
            <UploadedDocumentsSection contactId={c.id} />
          </div>

          <div>
            <CustomFieldsSection contact={c} />
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

      {/* ── Permanent delete confirmation ── */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!o) setDeleteError(null); setDeleteOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {c.name} to Trash?</DialogTitle>
            <DialogDescription>
              <strong>{c.name}</strong> will be moved to the Trash page. You can restore them from there, or permanently delete them later.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {deleteError && (
              <p className="text-xs text-status-error">{deleteError}</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setDeleteOpen(false); setDeleteError(null); }}
              disabled={moveToTrash.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="border-status-error/40 text-status-error hover:bg-status-error/10"
              onClick={() => moveToTrash.mutate()}
              disabled={moveToTrash.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {moveToTrash.isPending ? "Moving…" : "Move to Trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleBulkImport() {
    setImportError(null);
    const picked = await openFilePicker({
      title: "Select a policy file (CSV or Excel)",
      filters: [{ name: "CSV / Excel", extensions: ["csv", "xlsx"] }],
      multiple: false,
    });
    if (!picked) return;
    const filePath = typeof picked === "string" ? picked : (picked as string[])[0];
    if (!filePath) return;
    setImporting(true);
    try {
      await bulkImportPolicies(contactId, filePath);
      onChanged();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

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
      <div className="flex items-center justify-between mb-3">
        <h2 className="awm-label inline-flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          Policies
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadXlsxTemplate("policies")}
            title="Download Excel policy template"
            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] text-fg-muted hover:border-gold/60 hover:text-fg hover:bg-bg-raised/60 transition-colors"
          >
            <Download className="h-3 w-3" />
            Template
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBulkImport}
            disabled={importing}
            title="Import multiple policies from a CSV file"
          >
            <Plus className="h-3.5 w-3.5" />
            {importing ? "Importing…" : "Import CSV"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add policy
          </Button>
        </div>
      </div>
      {importError && (
        <p className="mb-2 text-xs text-status-error">{importError}</p>
      )}
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
                      {formatMoney(p.premium_amount)}
                      {p.premium_frequency ? ` / ${p.premium_frequency}` : ""}
                    </span>
                  )}
                  {/* sum_assured stores JSON keyed by need_category — render
                      via formatSumAssured so the card shows
                      "Savings/Investments: $25,000" instead of raw JSON. */}
                  {(() => {
                    const sa = formatSumAssured(p.sum_assured);
                    return sa ? (
                      <span>
                        <span className="text-fg-muted">Sum assured:</span>{" "}
                        {sa}
                      </span>
                    ) : null;
                  })()}
                  {p.current_value && (
                    <span>
                      <span className="text-fg-muted">Current value:</span>{" "}
                      {formatMoney(p.current_value)}
                      {p.valuation_date
                        ? ` as of ${formatShortDate(p.valuation_date)}`
                        : ""}
                    </span>
                  )}
                  {/* Total premiums paid mirrors the Investments dashboard so
                      Jovial doesn't need to switch pages to compare premiums
                      paid vs current fund value at a glance. */}
                  {p.total_premiums_paid && (
                    <span>
                      <span className="text-fg-muted">Total paid:</span>{" "}
                      {formatMoney(p.total_premiums_paid)}
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
                  <DiscardPolicyButton policy={p} onDiscarded={onChanged} />
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

/** Editable table of beneficiaries shown inside PolicyFormDialog when the
 * Nomination toggle is set to Yes. Always renders at least 2 rows so the
 * table is interactive even right after the user toggles Yes. Add Row button
 * appends a blank row. Removal happens by clearing all three fields in a row
 * (it'll be ignored by the activeBens filter in the parent). */
function BeneficiariesTable({
  rows,
  onChange,
  suggestions = [],
}: {
  rows: Beneficiary[];
  onChange: (next: Beneficiary[]) => void;
  /** Pre-ordered list of contact names (family-linked first, all others
   *  after). Surfaced as a native datalist on each Name input so Jovial
   *  can pick a known family contact instead of retyping. Names not in
   *  this list still save fine — they'll be auto-created as new contacts
   *  and linked back to this client when the policy is saved. */
  suggestions?: string[];
}) {
  // A single datalist is shared across all Name inputs (HTML allows reuse via
  // the `list=` attribute). Generate a stable id so multiple dialogs on the
  // page don't collide.
  const listId = "beneficiary-suggestions";
  function updateRow(i: number, patch: Partial<Beneficiary>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...rows, { name: "", relationship: "", percentage: "" }]);
  }
  function removeRow(i: number) {
    // Keep at least 2 rows so the table never visually collapses.
    if (rows.length <= 2) {
      updateRow(i, { name: "", relationship: "", percentage: "" });
      return;
    }
    onChange(rows.filter((_, idx) => idx !== i));
  }
  // Running total so the user sees how close they are to 100.
  const total = rows.reduce((s, r) => {
    const n = parseFloat(r.percentage);
    return s + (isFinite(n) ? n : 0);
  }, 0);
  return (
    <div className="space-y-2">
      {/* Native datalist of likely beneficiary names. Family-linked contacts
          are surfaced first so they'll match against partial typing before
          unrelated contacts. The list ID is referenced by each Name input's
          `list` attribute (declared above). */}
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="awm-label border-b border-border text-left">
            <th className="py-1.5 pr-2 font-condensed">Name</th>
            <th className="py-1.5 pr-2 font-condensed">Relationship</th>
            <th className="py-1.5 pr-2 font-condensed w-24">%</th>
            <th className="py-1.5 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/30">
              <td className="py-1.5 pr-2">
                <Input
                  value={r.name}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                  placeholder="Full name"
                  list={suggestions.length > 0 ? listId : undefined}
                />
              </td>
              <td className="py-1.5 pr-2">
                <Input
                  value={r.relationship}
                  onChange={(e) => updateRow(i, { relationship: e.target.value })}
                  placeholder="Spouse / Child / …"
                />
              </td>
              <td className="py-1.5 pr-2">
                <Input
                  value={r.percentage}
                  onChange={(e) =>
                    // Allow digits + a single decimal point, no other characters.
                    updateRow(i, { percentage: e.target.value.replace(/[^0-9.]/g, "") })
                  }
                  placeholder="0"
                  inputMode="decimal"
                />
              </td>
              <td className="py-1.5 text-right">
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-fg-subtle hover:text-status-error text-xs"
                  title="Clear / remove row"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-gold hover:text-gold/80"
        >
          + Add row
        </button>
        <span
          className={cn(
            "text-xs tabular-nums",
            Math.abs(total - 100) < 0.01 ? "text-status-success" : "text-fg-muted"
          )}
        >
          Total: {total.toFixed(total % 1 === 0 ? 0 : 2)}%
        </span>
      </div>
    </div>
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
  // Confirmation rendered below — kept the early-return shape from before
  // so the diff stays focused on adding the new DiscardPolicyButton.

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

/**
 * Discard button: moves a policy to Trash (soft-delete via deleted_at).
 * Distinct from Archive — Archive keeps the policy on the card with a
 * status badge ("Archived"), Discard removes it entirely until Jovial
 * either restores it from the Trash page or permanently deletes it.
 *
 * Same two-step confirm pattern as ArchivePolicyButton.
 */
function DiscardPolicyButton({
  policy,
  onDiscarded,
}: {
  policy: PolicyRow;
  onDiscarded: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const discard = useMutation({
    mutationFn: () => discardPolicy(policy.id),
    onSuccess: () => {
      setConfirming(false);
      // The Trash page Policies section reads from the trashed-policies
      // query; invalidate so the just-discarded row appears there.
      resetDbConnection();
      queryClient.invalidateQueries({ queryKey: queryKeys.trashedPolicies });
      onDiscarded();
    },
  });

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        title="Move this policy to Trash"
        className="text-status-error hover:text-status-error hover:bg-status-error/10"
      >
        <Trash2 className="h-3 w-3" />
        Discard
      </Button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-xs text-fg-muted">Move to Trash?</span>
      <Button
        variant="danger"
        size="sm"
        disabled={discard.isPending}
        onClick={() => discard.mutate()}
      >
        {discard.isPending ? "…" : "Yes"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={discard.isPending}
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

  // Structured state for fields that have rich UI but get stringified into
  // the flat form payload at save time. Keeping them separate avoids fragile
  // two-way sync between checkbox state and a comma-separated string.
  const [needCategories, setNeedCategories] = useState<Set<NeedCategory>>(new Set());
  const [benefits, setBenefits] = useState<Partial<Record<NeedCategory, string>>>({});
  const [hasNomination, setHasNomination] = useState<"yes" | "no" | "">("");
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([
    { name: "", relationship: "", percentage: "" },
    { name: "", relationship: "", percentage: "" },
  ]);

  // Pull the investment-product catalog so we can suggest those names on the
  // Plan Name input. Picking one of them automatically makes the policy show
  // up on the Investments dashboard (backend resolves product_id by name).
  const investmentProducts = useInvestmentProducts();

  // Beneficiary intelligence: surface this client's existing family-linked
  // contacts as suggestions in the Name field, and have the save flow
  // auto-create a contact + family relationship for any beneficiary name
  // we don't already know about.
  const queryClient = useQueryClient();
  const allContacts = useContacts();
  const relationshipsForClient = useRelationshipsForContact(contactId);

  // Names of contacts already linked to this client via the Family panel.
  // These are the most likely picks for a beneficiary, so we surface them
  // first in the suggestion datalist.
  const beneficiarySuggestions = useMemo(() => {
    const rels = relationshipsForClient.data ?? [];
    const byId = new Map<string, string>();
    for (const c of allContacts.data ?? []) byId.set(c.id, c.name);
    const linkedIds = new Set<string>();
    for (const r of rels) {
      const other = r.from_contact_id === contactId ? r.to_contact_id : r.from_contact_id;
      if (other) linkedIds.add(other);
    }
    const linked: string[] = [];
    const others: string[] = [];
    for (const c of allContacts.data ?? []) {
      if (c.id === contactId) continue;
      const name = (c.name || "").trim();
      if (!name) continue;
      if (linkedIds.has(c.id)) linked.push(name);
      else others.push(name);
    }
    // De-dupe while preserving the linked-first ordering.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of [...linked, ...others]) {
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
    return out;
  }, [allContacts.data, relationshipsForClient.data, contactId]);

  // ── Parsing helpers ────────────────────────────────────────────────────
  // The flat-string columns on PolicyRow store JSON or comma-separated lists
  // for these rich fields. Parse on read; serialise on save.
  function parseNeedCategories(raw: string | undefined): Set<NeedCategory> {
    const out = new Set<NeedCategory>();
    if (!raw) return out;
    for (const tok of raw.split(",")) {
      const v = tok.trim() as NeedCategory;
      if (NEED_CATEGORIES.includes(v)) out.add(v);
    }
    return out;
  }
  function parseBenefits(raw: string | undefined): Partial<Record<NeedCategory, string>> {
    if (!raw) return {};
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
    } catch {
      // Legacy: plain number/string. Drop it — the user will re-enter under
      // the new structured form. (We don't try to guess which category.)
    }
    return {};
  }
  function parseBeneficiaries(raw: string | undefined): Beneficiary[] {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.map((b) => ({
          name: String(b?.name ?? ""),
          relationship: String(b?.relationship ?? ""),
          percentage: String(b?.percentage ?? ""),
        }));
      }
    } catch {
      // Legacy free-text beneficiaries → drop; user re-enters in the table.
    }
    return [];
  }

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
        has_nomination: existing.has_nomination || "",
      });
      // Hydrate structured state from the stored JSON / CSV columns.
      setNeedCategories(parseNeedCategories(existing.needs_category));
      setBenefits(parseBenefits(existing.sum_assured));
      const parsedBens = parseBeneficiaries(existing.beneficiaries);
      // Always show at least 2 rows so the table is interactive even when the
      // policy was saved with fewer.
      while (parsedBens.length < 2) {
        parsedBens.push({ name: "", relationship: "", percentage: "" });
      }
      setBeneficiaries(parsedBens);
      setHasNomination(
        (existing.has_nomination as "yes" | "no" | "") ||
          (parsedBens.some((b) => b.name.trim()) ? "yes" : "")
      );
    } else if (open && mode === "add") {
      setForm(blank);
      setNeedCategories(new Set());
      setBenefits({});
      setHasNomination("");
      setBeneficiaries([
        { name: "", relationship: "", percentage: "" },
        { name: "", relationship: "", percentage: "" },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, existing?.id]);

  function update<K extends keyof PolicyPayload>(key: K, value: PolicyPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Beneficiaries validation ───────────────────────────────────────────
  // Compute once per render so the dialog footer can show the reason a save
  // is blocked. Empty rows are ignored entirely.
  const activeBens = beneficiaries.filter(
    (b) => b.name.trim() || b.relationship.trim() || b.percentage.trim()
  );
  const partialRowExists = activeBens.some(
    (b) => !(b.name.trim() && b.relationship.trim() && b.percentage.trim())
  );
  const totalPct = activeBens.reduce((sum, b) => {
    const n = parseFloat(b.percentage);
    return sum + (isFinite(n) ? n : 0);
  }, 0);
  // Sum-to-100 only enforced when nomination is yes and at least one row
  // has content. Small floating-point tolerance.
  const pctNotHundred =
    hasNomination === "yes" && activeBens.length > 0 && Math.abs(totalPct - 100) > 0.01;

  // Helpful, single-sentence reason that the Save button is disabled. Surfaced
  // in the footer so the user knows what to fix.
  let saveBlockReason: string | null = null;
  if (!(form.plan_name || "").trim()) saveBlockReason = "Plan name is required to save.";
  else if (partialRowExists)
    saveBlockReason = "Each beneficiary row must have Name, Relationship, and Percentage all filled.";
  else if (pctNotHundred)
    saveBlockReason = `Beneficiary percentages must add up to 100 (currently ${totalPct}).`;

  const canSave = saveBlockReason === null;

  const save = useMutation({
    mutationFn: async () => {
      // Serialise the structured UI state back into the flat policy payload.
      // The columns are TEXT in SQLite; we use JSON / CSV encodings that the
      // dialog parses back on next open.
      const payload: PolicyPayload = {
        ...form,
        needs_category: Array.from(needCategories).join(","),
        sum_assured: JSON.stringify(
          // Only include benefits for currently-selected need categories,
          // so deselecting drops the stored amount.
          Object.fromEntries(
            Array.from(needCategories)
              .filter((c) => (benefits[c] ?? "").trim())
              .map((c) => [c, (benefits[c] ?? "").trim()])
          )
        ),
        has_nomination: hasNomination,
        beneficiaries:
          hasNomination === "yes"
            ? JSON.stringify(
                activeBens.map((b) => ({
                  name: b.name.trim(),
                  relationship: b.relationship.trim(),
                  percentage: b.percentage.trim(),
                }))
              )
            : "",
      };
      const result =
        mode === "edit" && existing
          ? await updatePolicy(existing.id, payload)
          : await addPolicy({ ...payload, contact_id: contactId });

      // Auto-create + link any beneficiaries that aren't already contacts.
      //
      // Why: Jovial nominated "Yihan" as a 50% beneficiary; if Yihan isn't
      // in the contacts list yet, she expects this to also add Yihan as a
      // family-linked contact (so the Family panel and Clients list both
      // stay in sync with reality).
      //
      // Best-effort: any failure here (duplicate name, network blip,
      // backend validation) is swallowed per-beneficiary — the policy is
      // already saved and we don't want a bookkeeping side-effect to make
      // it look like the policy save itself failed.
      if (hasNomination === "yes" && activeBens.length > 0) {
        // Build a case-insensitive lookup of existing contacts. Trashed
        // contacts are excluded (deleted_at set) so a tombstoned name can
        // be reused, matching the duplicate-check behaviour in Python.
        const existingByLowerName = new Map<string, string>(); // name → contact_id
        for (const c of allContacts.data ?? []) {
          if ((c.deleted_at || "").trim()) continue;
          const key = (c.name || "").trim().toLowerCase();
          if (key) existingByLowerName.set(key, c.id);
        }
        let createdAny = false;
        for (const b of activeBens) {
          const nm = b.name.trim();
          if (!nm) continue;
          const key = nm.toLowerCase();
          if (existingByLowerName.has(key)) {
            // Already a contact — make sure they're linked as family
            // (idempotent on the Python side; duplicates return ok:true).
            try {
              await linkContact(contactId, existingByLowerName.get(key)!, "family", {
                label: b.relationship.trim(),
              });
            } catch {
              /* best-effort */
            }
            continue;
          }
          try {
            const created = await createContact({
              name: nm,
              type: "warming",
              relationship_stage: "warming",
            });
            await linkContact(contactId, created.contact.id, "family", {
              label: b.relationship.trim(),
            });
            existingByLowerName.set(key, created.contact.id);
            createdAny = true;
          } catch {
            /* best-effort — duplicate / validation errors don't block */
          }
        }
        if (createdAny) {
          // Force a fresh SQLite connection so the just-created rows from
          // Python are visible to the next read (WAL snapshot workaround).
          resetDbConnection();
          await queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
        }
        await queryClient.invalidateQueries({
          queryKey: ["relationships", "for-contact", contactId],
        });
      }
      return result;
    },
    onSuccess: () => {
      onSaved();
    },
    // useMutation captures errors automatically via `save.error`; we render
    // them inline below so silent failures don't leave the user wondering
    // why the Save button "doesn't work".
  });

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
                  // Datalist gives a dropdown of the investment-product
                  // catalog as suggestions. Picking one (or typing a matching
                  // name) auto-links the policy to that product and makes it
                  // appear on the Investments dashboard.
                  list="investment-products-list"
                />
                <datalist id="investment-products-list">
                  {(investmentProducts.data ?? []).map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>
                {(investmentProducts.data ?? []).some(
                  (p) => p.name.toLowerCase() === (form.plan_name || "").trim().toLowerCase()
                ) && (
                  <p className="mt-1 text-[10px] text-gold/80">
                    Investment plan detected — will show on the Investments page.
                  </p>
                )}
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
              <Field label="Premium amount" htmlFor="pf-prem-amount">
                <Input
                  id="pf-prem-amount"
                  value={form.premium_amount ?? ""}
                  onChange={(e) => update("premium_amount", e.target.value)}
                  placeholder="e.g. $2,050"
                />
              </Field>
              <Field label="Premium frequency" htmlFor="pf-prem-freq">
                <select
                  id="pf-prem-freq"
                  value={form.premium_frequency ?? ""}
                  onChange={(e) => update("premium_frequency", e.target.value)}
                  className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
                >
                  <option value="">— Select —</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Semi-Annual">Semi-Annual</option>
                  <option value="Annual">Annual</option>
                </select>
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
              {/* Need category multi-select. Drives the dynamic benefit rows
                  below — picking "Death" surfaces a "Death Benefit" input. */}
              <Field label="Need category (multi-select)" htmlFor="pf-need" className="col-span-2">
                <div id="pf-need" className="flex flex-wrap gap-1.5">
                  {NEED_CATEGORIES.map((cat) => {
                    const isOn = needCategories.has(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setNeedCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(cat)) {
                              next.delete(cat);
                              // Also clear the corresponding benefit amount.
                              setBenefits((b) => {
                                const nb = { ...b };
                                delete nb[cat];
                                return nb;
                              });
                            } else {
                              next.add(cat);
                            }
                            return next;
                          });
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-condensed font-bold uppercase tracking-[0.08em] transition-colors",
                          isOn
                            ? "border-gold/60 bg-gold/15 text-gold"
                            : "border-border bg-bg-surface/40 text-fg-muted hover:border-gold/40 hover:text-fg"
                        )}
                      >
                        {NEED_CATEGORY_LABEL[cat]}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* Benefits / sum-assured rows — one per selected need category. */}
              {needCategories.size > 0 && (
                <div className="col-span-2 space-y-2 rounded-sm border border-border bg-bg-surface/30 p-3">
                  <p className="awm-label">Benefits / Sum Assured</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from(needCategories).map((cat) => (
                      <Field
                        key={cat}
                        label={`${NEED_CATEGORY_LABEL[cat]} Benefit`}
                        htmlFor={`pf-benefit-${cat}`}
                      >
                        <Input
                          id={`pf-benefit-${cat}`}
                          value={benefits[cat] ?? ""}
                          onChange={(e) =>
                            setBenefits((b) => ({ ...b, [cat]: e.target.value }))
                          }
                          placeholder="e.g. $500,000"
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              )}
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
              {/* ── Nomination ────────────────────────────────────────── */}
              <div className="col-span-2 rounded-sm border border-border bg-bg-surface/30 p-3 space-y-3">
                <Field label="Nomination" htmlFor="pf-nom-toggle">
                  <div id="pf-nom-toggle" className="flex items-center gap-1.5">
                    {(["yes", "no"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setHasNomination(hasNomination === opt ? "" : opt)}
                        className={cn(
                          "inline-flex items-center rounded-sm border px-3 py-1 text-xs font-condensed font-bold uppercase tracking-[0.08em] transition-colors",
                          hasNomination === opt
                            ? "border-gold/60 bg-gold/15 text-gold"
                            : "border-border bg-bg-surface/40 text-fg-muted hover:border-gold/40 hover:text-fg"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </Field>

                {/* Conditional beneficiaries table */}
                {hasNomination === "yes" && (
                  <BeneficiariesTable
                    rows={beneficiaries}
                    onChange={setBeneficiaries}
                    suggestions={beneficiarySuggestions}
                  />
                )}
              </div>
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
          {save.isError && (
            <p className="px-6 pb-1 text-xs text-status-error">
              Save failed: {(save.error as Error).message}
            </p>
          )}
          {!canSave && saveBlockReason && (
            <p className="px-6 pb-1 text-[10px] text-fg-subtle">{saveBlockReason}</p>
          )}
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

// ── Uploaded Documents Section ────────────────────────────────────────────────

function UploadedDocumentsSection({ contactId }: { contactId: string }) {
  const docs = useDocumentsByContact(contactId);
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleUpload() {
    setUploadError(null);
    const picked = await openFilePicker({
      title: "Select a document to upload",
      filters: [
        { name: "Documents", extensions: ["pdf", "xlsx", "xls", "csv", "pptx", "ppt", "docx", "doc", "png", "jpg", "jpeg"] },
      ],
      multiple: false,
    });
    if (!picked) return;
    const srcPath = typeof picked === "string" ? picked : (picked as string[])[0];
    if (!srcPath) return;

    setUploading(true);
    try {
      const fileName = srcPath.split(/[\\/]/).pop() ?? "document";
      const destPath = await importContactDocumentFile(srcPath, contactId, fileName);
      const fileType = fileTypeFromName(fileName);
      const db = await getDb();
      const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO contact_documents (id, contact_id, file_name, file_path, file_type, file_size, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, 0, $6)`,
        [id, contactId, fileName, destPath, fileType, now]
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.documentsByContact(contactId) });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: ContactDocumentRow) {
    try {
      await deleteContactDocumentFile(doc.file_path);
    } catch {
      // File may already be gone — remove DB row anyway.
    }
    const db = await getDb();
    await db.execute(`DELETE FROM contact_documents WHERE id = $1`, [doc.id]);
    queryClient.invalidateQueries({ queryKey: queryKeys.documentsByContact(contactId) });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="awm-label">Uploaded Documents</h2>
        <Button variant="ghost" size="sm" onClick={handleUpload} disabled={uploading}>
          <Plus className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {uploadError && (
        <p className="mb-2 text-xs text-status-error">{uploadError}</p>
      )}
      {docs.isPending ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : !docs.data || docs.data.length === 0 ? (
        <p className="text-sm text-fg-subtle italic">
          No documents uploaded yet. Click Upload to add a PDF, Excel, PowerPoint, or Word file.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {docs.data.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-sm border border-border/60 bg-bg-surface px-3 py-2 hover:bg-bg-raised group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-fg font-medium truncate">{doc.file_name}</p>
                <p className="text-xs text-fg-muted">
                  {doc.file_type.toUpperCase()}
                  {" · "}
                  {new Date(doc.uploaded_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openContactDocumentFile(doc.file_path).catch(() => {})}
                  title="Open"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revealContactDocumentFile(doc.file_path).catch(() => {})}
                  title="Reveal in Finder"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(doc)}
                  title="Remove document"
                  className="text-status-error hover:text-status-error"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Custom Fields Section ─────────────────────────────────────────────────────

function CustomFieldsSection({ contact }: { contact: ContactRow }) {
  const queryClient = useQueryClient();

  // Local working copy — initialised from the contact row.
  const [fields, setFields] = useState<CustomFields>(() =>
    parseCustomFields(contact.custom_fields)
  );

  // Keep in sync when the contact is refreshed from the server.
  useEffect(() => {
    setFields(parseCustomFields(contact.custom_fields));
    setDirty(false);
  }, [contact.custom_fields]);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // "Add field" inline form state.
  const [addingKey, setAddingKey] = useState("");
  const [addingVal, setAddingVal] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);
  const [propagateAll, setPropagateAll] = useState(false);
  const [propagating, setPropagating] = useState(false);
  const [propagateMsg, setPropagateMsg] = useState<string | null>(null);

  // Editing a field name inline.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingKeyDraft, setEditingKeyDraft] = useState("");

  function updateValue(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function deleteField(key: string) {
    setFields((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDirty(true);
  }

  function startRenameKey(key: string) {
    setEditingKey(key);
    setEditingKeyDraft(key);
  }

  function commitRenameKey(oldKey: string) {
    const newKey = editingKeyDraft.trim();
    if (!newKey || newKey === oldKey) {
      setEditingKey(null);
      return;
    }
    setFields((prev) => {
      const next: CustomFields = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k === oldKey ? newKey : k] = v;
      }
      return next;
    });
    setEditingKey(null);
    setDirty(true);
  }

  async function addField() {
    const key = addingKey.trim();
    const val = addingVal.trim();
    if (!key) return;

    // Add to this contact's local state.
    setFields((prev) => ({ ...prev, [key]: val }));
    setAddingKey("");
    setAddingVal("");
    setShowAddRow(false);
    setDirty(true);

    // Optionally seed the key (blank) on every other contact.
    if (propagateAll) {
      setPropagating(true);
      setPropagateMsg(null);
      try {
        const count = await propagateFieldToAllContacts(key);
        setPropagateMsg(`"${key}" added to ${count} other client${count !== 1 ? "s" : ""}.`);
        // Refresh the contacts list so other open detail pages reflect the change.
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
      } catch (e) {
        setPropagateMsg(`Could not propagate: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setPropagating(false);
        setPropagateAll(false);
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await saveCustomFields(contact.id, fields);
      queryClient.invalidateQueries({ queryKey: ["contacts", contact.id] });
      setDirty(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const entries = Object.entries(fields);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="awm-label inline-flex items-center gap-1.5">
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <path d="M5 8h6M5 5h6M5 11h4" strokeLinecap="round" />
          </svg>
          Custom Fields
        </h2>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => { setFields(parseCustomFields(contact.custom_fields)); setDirty(false); setSaveError(null); }}>
              <X className="h-3.5 w-3.5" />
              Discard
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowAddRow(true); setAddingKey(""); setAddingVal(""); }}
            disabled={showAddRow}
          >
            <Plus className="h-3.5 w-3.5" />
            Add field
          </Button>
          {dirty && (
            <Button variant="gold" size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </div>

      {saveError && (
        <p className="mb-2 text-xs text-status-error">{saveError}</p>
      )}
      {propagating && (
        <p className="mb-2 text-xs text-fg-muted">Adding field to all clients…</p>
      )}
      {propagateMsg && !propagating && (
        <p className={cn("mb-2 text-xs", propagateMsg.startsWith("Could not") ? "text-status-error" : "text-gold/80")}>
          {propagateMsg}
        </p>
      )}

      {entries.length === 0 && !showAddRow ? (
        <p className="text-sm text-fg-subtle italic">
          No custom fields yet. Click "Add field" to create one — e.g. Annual Income, Risk Appetite.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
              {/* Field name — click to rename */}
              {editingKey === key ? (
                <input
                  autoFocus
                  value={editingKeyDraft}
                  onChange={(e) => setEditingKeyDraft(e.target.value)}
                  onBlur={() => commitRenameKey(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRenameKey(key);
                    if (e.key === "Escape") setEditingKey(null);
                  }}
                  className="h-8 rounded-sm border border-gold/60 bg-bg-surface px-2 text-sm text-fg focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startRenameKey(key)}
                  title="Click to rename"
                  className="h-8 flex items-center px-2 rounded-sm border border-transparent hover:border-border text-sm font-medium text-fg-muted hover:text-fg transition-colors text-left truncate"
                >
                  {key}
                </button>
              )}

              {/* Field value */}
              <input
                value={value}
                onChange={(e) => updateValue(key, e.target.value)}
                className="h-8 rounded-sm border border-border bg-bg-surface px-2 text-sm text-fg focus:border-gold/60 focus:outline-none"
              />

              {/* Delete */}
              <button
                type="button"
                onClick={() => deleteField(key)}
                title="Remove field"
                className="h-8 w-8 flex items-center justify-center rounded-sm text-fg-subtle hover:text-status-error hover:bg-status-error/10 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Add-field inline form */}
          {showAddRow && (
            <div className="pt-1 border-t border-border/50 space-y-2">
              <div className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                <input
                  autoFocus
                  value={addingKey}
                  onChange={(e) => setAddingKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addField(); if (e.key === "Escape") setShowAddRow(false); }}
                  placeholder="Field name"
                  className="h-8 rounded-sm border border-gold/40 bg-bg-surface px-2 text-sm text-fg placeholder:text-fg-subtle focus:border-gold/60 focus:outline-none"
                />
                <input
                  value={addingVal}
                  onChange={(e) => setAddingVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addField(); if (e.key === "Escape") setShowAddRow(false); }}
                  placeholder="Value for this client (optional)"
                  className="h-8 rounded-sm border border-border bg-bg-surface px-2 text-sm text-fg placeholder:text-fg-subtle focus:border-gold/60 focus:outline-none"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={addField}
                    disabled={!addingKey.trim() || propagating}
                    className="h-8 w-8 flex items-center justify-center rounded-sm border border-gold/40 text-gold hover:bg-gold/10 transition-colors disabled:opacity-40"
                    title="Confirm"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddRow(false); setPropagateAll(false); }}
                    className="h-8 w-8 flex items-center justify-center rounded-sm border border-border text-fg-muted hover:text-fg hover:bg-bg-raised/60 transition-colors"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Propagate checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none pl-0.5">
                <input
                  type="checkbox"
                  checked={propagateAll}
                  onChange={(e) => setPropagateAll(e.target.checked)}
                  className="accent-gold"
                />
                <span className="text-xs text-fg-muted">
                  Add this field to <span className="text-fg font-medium">all clients</span> (blank — won't overwrite existing values)
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </>
  );
}
