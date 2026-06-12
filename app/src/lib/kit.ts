// Typed wrappers around the Rust `run_kit_command` shell-out.
// Every operation that needs the Python kit's validation goes through here
// so the subprocess args and JSON payloads stay in one place.

import { invoke } from "@tauri-apps/api/core";

import type { TouchpointType, Sentiment, ContactType, RelationshipStage, ReminderPriority, ReminderType } from "@/lib/enums";

export interface KitCommandResult {
  ok: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
}

export class KitCommandError extends Error {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  constructor(message: string, result: KitCommandResult) {
    super(message);
    this.name = "KitCommandError";
    this.exitCode = result.exit_code;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
  }
}

async function runKit(args: string[], payload?: object): Promise<KitCommandResult> {
  const result = await invoke<KitCommandResult>("run_kit_command", {
    args,
    jsonPayload: payload ? JSON.stringify(payload) : null,
  });
  if (!result.ok) {
    throw new KitCommandError(
      `relationship_os.py ${args.join(" ")} exited ${result.exit_code}: ${result.stderr || result.stdout || "no output"}`,
      result
    );
  }
  return result;
}

/** Parse the JSON the kit CLI emits with `--format json`. */
function parseKitJson<T = unknown>(result: KitCommandResult): T {
  const out = result.stdout.trim();
  if (!out) throw new Error("kit command produced no stdout");
  try {
    return JSON.parse(out) as T;
  } catch (e) {
    throw new Error(
      `Could not parse kit JSON output: ${(e as Error).message}\n${out.slice(0, 400)}`
    );
  }
}

// ---- Contact creation ----

export interface CreateContactResult {
  ok: boolean;
  contact: { id: string; name: string; type: string };
  message: string;
}

export async function createContact(payload: {
  name: string;
  type: string;
  relationship_stage: string;
  phone?: string;
  email?: string;
  occupation?: string;
  company?: string;
}): Promise<CreateContactResult> {
  const args = [
    "--format=json",
    "create-contact",
    "--name", payload.name,
    "--type", payload.type,
    "--stage", payload.relationship_stage,
  ];
  if (payload.phone)      args.push("--phone",      payload.phone);
  if (payload.email)      args.push("--email",      payload.email);
  if (payload.occupation) args.push("--occupation", payload.occupation);
  if (payload.company)    args.push("--company",    payload.company);
  const r = await runKit(args);
  return parseKitJson<CreateContactResult>(r);
}

// ---- Reminder lifecycle ----

export interface ReminderActionResult {
  ok: boolean;
  reminder?: {
    id: string;
    status: string;
    completed_at?: string;
    snoozed_until?: string;
  };
  message?: string;
}

export async function completeReminder(
  reminderId: string
): Promise<ReminderActionResult> {
  const r = await runKit([
    "--format=json",
    "complete-reminder",
    "--reminder-id",
    reminderId,
  ]);
  return parseKitJson<ReminderActionResult>(r);
}

export async function snoozeReminder(
  reminderId: string,
  newDueDate: string
): Promise<ReminderActionResult> {
  const r = await runKit([
    "--format=json",
    "snooze-reminder",
    "--reminder-id",
    reminderId,
    "--new-due-date",
    newDueDate,
  ]);
  return parseKitJson<ReminderActionResult>(r);
}

export async function cancelReminder(
  reminderId: string
): Promise<ReminderActionResult> {
  const r = await runKit([
    "--format=json",
    "cancel-reminder",
    "--reminder-id",
    reminderId,
  ]);
  return parseKitJson<ReminderActionResult>(r);
}

// ---- Touchpoint logging ----

export interface TouchpointInputPayload {
  contact_name: string;
  touch_date: string; // YYYY-MM-DD
  touchpoint_type: TouchpointType;
  sentiment: Sentiment;
  summary: string;
  raw_input: string;
  topics?: string[];
  action_items?: string;
  contact_type?: ContactType;
  relationship_stage?: RelationshipStage;
  reminder_due?: string; // YYYY-MM-DD
  reminder_priority?: ReminderPriority;
  reminder_context?: string;
  reminder_type?: ReminderType;
  completes_reminder_ids?: string[];
}

export interface TouchpointLogResult {
  ok: boolean;
  contact: { id: string; name: string; stage: string };
  touchpoint: { id: string; type: string };
  reminder?: { id: string; due_date: string; priority: string };
  message: string;
}

export async function logTouchpoint(
  payload: TouchpointInputPayload
): Promise<TouchpointLogResult> {
  const r = await runKit(["--format=json", "log-touchpoint"], payload);
  return parseKitJson<TouchpointLogResult>(r);
}

// ---- Deliverable generation ----

export interface AppointmentSummaryResult {
  ok: boolean;
  pdf_path?: string;
  md_path?: string;
  contact: { id: string; name: string };
}

export async function generateAppointmentSummary(
  contactName: string,
  date?: string
): Promise<AppointmentSummaryResult> {
  const args = ["--format=json", "appointment-summary", "--name", contactName];
  if (date) args.push("--date", date);
  const r = await runKit(args);
  return parseKitJson<AppointmentSummaryResult>(r);
}

export interface PolicySummaryResult {
  ok: boolean;
  pdf_path?: string;
  md_path?: string;
}

export async function generatePolicySummary(
  contactName: string
): Promise<PolicySummaryResult> {
  const r = await runKit([
    "--format=json",
    "policy-summary",
    "--name",
    contactName,
  ]);
  return parseKitJson<PolicySummaryResult>(r);
}

export interface ProposalResult {
  ok: boolean;
  pdf_path?: string;
  md_path?: string;
}

export async function generateProposal(
  contactName: string,
  topic: string
): Promise<ProposalResult> {
  const r = await runKit([
    "--format=json",
    "proposal",
    "--name",
    contactName,
    "--topic",
    topic,
  ]);
  return parseKitJson<ProposalResult>(r);
}

export interface SlidesResult {
  ok: boolean;
  pptx_path?: string;
}

export async function generateSlides(
  contactName: string,
  purpose: string
): Promise<SlidesResult> {
  const r = await runKit([
    "--format=json",
    "slides",
    "--name",
    contactName,
    "--purpose",
    purpose,
  ]);
  return parseKitJson<SlidesResult>(r);
}

export interface WriteupResult {
  ok: boolean;
  md_path?: string;
}

export async function generateWriteup(topic: string): Promise<WriteupResult> {
  const r = await runKit([
    "--format=json",
    "writeup",
    "--topic",
    topic,
  ]);
  return parseKitJson<WriteupResult>(r);
}

// ---- Merge contacts ----

export interface MergeContactsResult {
  ok: boolean;
  from_id: string;
  from_name: string;
  into_id: string;
  into_name: string;
  touchpoints_moved: number;
  reminders_moved: number;
  field_diff: Record<string, { from: string; to: string; action: string }>;
  message: string;
}

export async function mergeContacts(
  fromId: string,
  intoId: string
): Promise<MergeContactsResult> {
  const r = await runKit([
    "--format=json",
    "merge-contacts",
    "--from",
    fromId,
    "--into",
    intoId,
  ]);
  return parseKitJson<MergeContactsResult>(r);
}

// ---- Find reminders (fuzzy search) ----

export interface FindRemindersCandidate {
  id: string;
  contact_id: string;
  contact_name: string;
  due_date: string;
  status: string;
  context: string;
  type: string;
  priority: string;
}

export interface FindRemindersResult {
  ok: boolean;
  query: string;
  status: string;
  count: number;
  candidates: FindRemindersCandidate[];
}

export async function findReminders(
  query: string,
  options?: { status?: string; limit?: number }
): Promise<FindRemindersResult> {
  const args = ["--format=json", "find-reminders"];
  if (query) args.push("--query", query);
  if (options?.status) args.push("--status", options.status);
  if (options?.limit) args.push("--limit", String(options.limit));
  const r = await runKit(args);
  return parseKitJson<FindRemindersResult>(r);
}

// ---- Update contact (Hermes-side; kit also accepts app calls) ----

export interface UpdateContactKitResult {
  ok: boolean;
  contact_id: string;
  contact_name: string;
  diff: Record<string, { from: string; to: string; action: string }>;
  message: string;
}

export async function updateContactField(
  contactId: string,
  field: string,
  value: string,
  options?: { replace?: boolean }
): Promise<UpdateContactKitResult> {
  const args = [
    "--format=json",
    "update-contact",
    "--id",
    contactId,
    "--field",
    field,
    "--value",
    value,
  ];
  if (options?.replace) args.push("--replace");
  const r = await runKit(args);
  return parseKitJson<UpdateContactKitResult>(r);
}

/** Batch variant: update multiple fields atomically via JSON payload.
 *  The `source` field on the resulting `contact_updated` event defaults to
 *  "hermes:update-contact-fields" but can be overridden — the app passes
 *  "app:edit-contact" so the Settings "last Hermes event" filter
 *  (source NOT LIKE 'app:%') keeps excluding app-initiated edits. */
export async function updateContactBatch(
  contactId: string,
  updates: Record<string, string>,
  options?: { replace?: boolean; source?: string }
): Promise<UpdateContactKitResult> {
  const payload: Record<string, unknown> = {
    id: contactId,
    updates,
  };
  if (options?.replace) payload.replace = true;
  if (options?.source) payload.source = options.source;
  const r = await runKit(["--format=json", "update-contact"], payload);
  return parseKitJson<UpdateContactKitResult>(r);
}

// ---- Settings ----

export interface UpdateSettingResult {
  ok: boolean;
  key: string;
  value: string;
  previous_value: string;
  changed: boolean;
  message: string;
}

export async function updateSetting(
  key: string,
  value: string
): Promise<UpdateSettingResult> {
  const r = await runKit([
    "--format=json",
    "update-setting",
    "--key",
    key,
    "--value",
    value,
  ]);
  return parseKitJson<UpdateSettingResult>(r);
}

// ---- Policies (Pass B) ----

export interface PolicyPayload {
  contact_id?: string;
  contact_name?: string;
  insurer?: string;
  plan_name?: string;
  policy_type?: string;
  policy_number?: string;
  sum_assured?: string;
  premium_amount?: string;
  premium_frequency?: string;
  premium_term?: string;
  policy_term?: string;
  payment_method?: string;
  start_date?: string;
  review_date?: string;
  review_frequency?: string;
  last_reviewed?: string;
  current_value?: string;
  valuation_date?: string;
  surrender_value?: string;
  policy_owner?: string;
  life_assured?: string;
  payor?: string;
  beneficiaries?: string;
  riders?: string;
  servicing_rep?: string;
  needs_category?: string;
  status?: string;
  notes?: string;
  // Investments dashboard fields
  portfolio?: string;
  portfolio_tag?: string;
  total_premiums_paid?: string;
  lock_in_period?: string;
  lock_in_end_date?: string;
  premium_holiday_months?: string;
  product_id?: string;
  has_nomination?: string;
}

export interface PolicyResult {
  ok: boolean;
  policy?: PolicyPayload & { id: string; created_at: string; updated_at: string };
  policy_id?: string;
  diff?: Record<string, { from: string; to: string }>;
  message: string;
}

export async function addPolicy(payload: PolicyPayload): Promise<PolicyResult> {
  const r = await runKit(["--format=json", "add-policy"], payload);
  return parseKitJson<PolicyResult>(r);
}

export async function updatePolicy(
  policyId: string,
  changes: Partial<PolicyPayload>
): Promise<PolicyResult> {
  const r = await runKit(
    ["--format=json", "update-policy", "--id", policyId],
    changes
  );
  return parseKitJson<PolicyResult>(r);
}

export async function archivePolicy(policyId: string): Promise<PolicyResult> {
  const r = await runKit(["--format=json", "archive-policy", "--id", policyId]);
  return parseKitJson<PolicyResult>(r);
}

/** Soft-delete a policy: sets deleted_at so it disappears from the client
 *  card and the Investments dashboard, and reappears in the Trash page's
 *  Policies section until restored or purged. */
export async function discardPolicy(policyId: string): Promise<PolicyResult> {
  const r = await runKit(["--format=json", "discard-policy", "--id", policyId]);
  return parseKitJson<PolicyResult>(r);
}

/** Restore a trashed policy: clears deleted_at so it reappears on the client
 *  card. Idempotent — calling on an active policy returns ok with a no-op
 *  message. */
export async function restorePolicy(policyId: string): Promise<PolicyResult> {
  const r = await runKit(["--format=json", "restore-policy", "--id", policyId]);
  return parseKitJson<PolicyResult>(r);
}

/** Permanently remove a policy row. Only callable from the Trash page's
 *  Delete-forever action; cannot be undone. */
export async function purgePolicy(policyId: string): Promise<PolicyResult> {
  const r = await runKit(["--format=json", "purge-policy", "--id", policyId]);
  return parseKitJson<PolicyResult>(r);
}

// ---- Investment Products catalog ----

export interface InvestmentProductPayload {
  name?: string;
  premium_term?: string;
  lock_in_period?: string;
  notes?: string;
}

export interface InvestmentProductResult {
  ok: boolean;
  product?: InvestmentProductPayload & {
    id: string;
    archived_at: string;
    created_at: string;
    updated_at: string;
  };
  product_id?: string;
  updated_fields?: string[];
  message: string;
}

export async function addInvestmentProduct(
  payload: InvestmentProductPayload
): Promise<InvestmentProductResult> {
  const r = await runKit(["--format=json", "add-product"], payload);
  return parseKitJson<InvestmentProductResult>(r);
}

export async function updateInvestmentProduct(
  productId: string,
  changes: Partial<InvestmentProductPayload>
): Promise<InvestmentProductResult> {
  const r = await runKit(
    ["--format=json", "update-product", "--id", productId],
    changes
  );
  return parseKitJson<InvestmentProductResult>(r);
}

export async function archiveInvestmentProduct(
  productId: string
): Promise<InvestmentProductResult> {
  const r = await runKit(["--format=json", "archive-product", "--id", productId]);
  return parseKitJson<InvestmentProductResult>(r);
}

// ---- Investments bulk upsert ----

/** One near-match suggestion when the sheet's client_name didn't exact-match a
 *  contact. Score is difflib's similarity ratio (0..1); 1.0 == identical. */
export interface InvestmentNameCandidate {
  contact_id: string;
  name: string;
  score: number;
}

/** A row that couldn't be auto-resolved by name and needs the user to pick.
 *  The UI shows these in a dialog; the chosen contact_id (or "__skip__") is
 *  then passed back as part of `nameResolution` on the apply call. */
export interface InvestmentDecisionRow {
  row: number;
  client_name: string;
  policy_number: string;
  product_name: string;
  candidates: InvestmentNameCandidate[];
}

/** A row that couldn't be matched at all — Jovial must create the contact
 *  first, then re-run the import. These are NEVER created on apply. */
export interface InvestmentErrorRow {
  row: number;
  client_name: string;
  reason: string;
}

export interface BulkUpsertInvestmentsResult {
  ok: boolean;
  /** True when called with dry-run; in that case nothing was written. */
  dry_run?: boolean;
  created: number;
  /** IDs of any policies created on this run. Empty on dry-run. */
  created_ids?: string[];
  updated: number;
  skipped: number;
  skipped_rows: Array<{
    row: number;
    policy_number?: string;
    client_name?: string;
    product_name?: string;
    reason: string;
  }>;
  /** Rows whose client_name needs the user to disambiguate. Empty when every
   *  row resolves cleanly. */
  needs_decision?: InvestmentDecisionRow[];
  /** Rows the import can't process at all (no exact and no fuzzy match). */
  errors?: InvestmentErrorRow[];
  as_of: string;
  message: string;
}

/** Map of normalised sheet client_name → contact_id (or "__skip__"). The
 *  Python side normalises by lowercasing + collapsing whitespace so the UI
 *  can pass the names exactly as they appeared in the dry-run response. */
export type InvestmentNameResolution = Record<string, string>;

export async function bulkUpsertInvestments(
  filePath: string,
  asOf: string,
  opts: {
    dryRun?: boolean;
    nameResolution?: InvestmentNameResolution;
  } = {}
): Promise<BulkUpsertInvestmentsResult> {
  const args = ["--format=json", "bulk-upsert-investments", "--file", filePath];
  if (asOf) args.push("--as-of", asOf);
  if (opts.dryRun) args.push("--dry-run");
  if (opts.nameResolution && Object.keys(opts.nameResolution).length > 0) {
    args.push("--name-resolution", JSON.stringify(opts.nameResolution));
  }
  const r = await runKit(args);
  return parseKitJson<BulkUpsertInvestmentsResult>(r);
}

// ---- Send client brief to Telegram ----

/** Result from send-client-brief. ok=true means delivered. ok=false with code
 * "telegram_not_configured" means the user hasn't set up the bot yet — the
 * UI should show a setup prompt and may display the preview text inline. */
export interface SendClientBriefResult {
  ok: boolean;
  code?: "telegram_not_configured";
  message: string;
  contact_id?: string;
  contact_name?: string;
  missing?: string[];
  preview?: string;
}

export async function sendClientBrief(
  contactId: string
): Promise<SendClientBriefResult> {
  const r = await runKit([
    "--format=json",
    "send-client-brief",
    "--id",
    contactId,
  ]);
  return parseKitJson<SendClientBriefResult>(r);
}

// ---- Contact maintenance ----

export interface ArchiveContactResult {
  ok: boolean;
  contact_id: string;
  contact_name: string;
  archived_at?: string;
  message: string;
}

export async function archiveContact(contactId: string): Promise<ArchiveContactResult> {
  const r = await runKit(["--format=json", "archive-contact", "--id", contactId]);
  return parseKitJson<ArchiveContactResult>(r);
}

export async function unarchiveContact(contactId: string): Promise<ArchiveContactResult> {
  const r = await runKit(["--format=json", "unarchive-contact", "--id", contactId]);
  return parseKitJson<ArchiveContactResult>(r);
}

export interface TrashContactResult {
  ok: boolean;
  contact_id: string;
  contact_name: string;
  deleted_at: string;
  message: string;
}

/** Soft-delete: moves the contact to the Trash page. */
export async function trashContact(contactId: string): Promise<TrashContactResult> {
  const r = await runKit(["--format=json", "delete-contact", "--id", contactId]);
  return parseKitJson<TrashContactResult>(r);
}

export interface RestoreContactResult {
  ok: boolean;
  contact_id: string;
  contact_name: string;
  message: string;
}

/** Restore a trashed contact back to the active list. */
export async function restoreFromTrash(contactId: string): Promise<RestoreContactResult> {
  const r = await runKit(["--format=json", "restore-contact", "--id", contactId]);
  return parseKitJson<RestoreContactResult>(r);
}

export interface PurgeContactResult {
  ok: boolean;
  contact_id: string;
  contact_name: string;
  touchpoints_deleted: number;
  reminders_deleted: number;
  policies_deleted: number;
  relationships_deleted: number;
  message: string;
}

/** Permanent delete from the Trash page. Also call purgeContactDocumentFolder separately. */
export async function purgeContact(contactId: string): Promise<PurgeContactResult> {
  const r = await runKit(["--format=json", "purge-contact", "--id", contactId]);
  return parseKitJson<PurgeContactResult>(r);
}

export interface BulkImportPoliciesResult {
  ok: boolean;
  contact_id: string;
  contact_name: string;
  created: number;
  policy_ids: string[];
  message: string;
}

export async function bulkImportPolicies(
  contactId: string,
  filePath: string
): Promise<BulkImportPoliciesResult> {
  const r = await runKit([
    "--format=json", "bulk-import-policies",
    "--id", contactId,
    "--file", filePath,
  ]);
  return parseKitJson<BulkImportPoliciesResult>(r);
}

export interface BulkImportContactsResult {
  ok: boolean;
  created: number;
  skipped: number;
  errors: number;
  contacts: { id: string; name: string }[];
  skipped_details: { row: number; name: string; reason: string }[];
  error_details: { row: number; reason: string }[];
  message: string;
}

export async function bulkImportContacts(
  filePath: string
): Promise<BulkImportContactsResult> {
  const r = await runKit([
    "--format=json", "bulk-import-contacts",
    "--file", filePath,
  ]);
  return parseKitJson<BulkImportContactsResult>(r);
}

export interface RenameContactResult {
  ok: boolean;
  contact_id: string;
  from: string;
  to: string;
  touchpoints_updated: number;
  reminders_updated: number;
  message: string;
}

// ---- Contact relationships ----

import type { RelationshipKind } from "@/lib/enums";

export interface LinkContactResult {
  ok: boolean;
  id?: string;
  from_contact_id?: string;
  to_contact_id?: string;
  kind?: string;
  label?: string;
  duplicate?: boolean;
  message: string;
}

export async function linkContact(
  fromContactId: string,
  toContactId: string,
  kind: RelationshipKind,
  options?: { label?: string; notes?: string }
): Promise<LinkContactResult> {
  const args = [
    "--format=json",
    "link-contact",
    "--from", fromContactId,
    "--to", toContactId,
    "--kind", kind,
  ];
  if (options?.label) args.push("--label", options.label);
  if (options?.notes) args.push("--notes", options.notes);
  const r = await runKit(args);
  return parseKitJson<LinkContactResult>(r);
}

export async function unlinkContact(
  relationshipId: string
): Promise<{ ok: boolean; id: string; message: string }> {
  const r = await runKit([
    "--format=json",
    "unlink-contact",
    "--id", relationshipId,
  ]);
  return parseKitJson<{ ok: boolean; id: string; message: string }>(r);
}

// ---- Clarifications ----

export interface ResolveClarificationResult {
  ok: boolean;
  id: string;
  resolution: "log_anyway" | "log_corrected" | "discard";
  logged_touchpoint_id: string | null;
  message: string;
}

/** Resolve a queued clarification. For log_corrected, pass the corrected
 *  touchpoint payload; the kit will validate and call log_touchpoint with it. */
export async function resolveClarification(
  clarificationId: string,
  resolution: "log_anyway" | "log_corrected" | "discard",
  correctedPayload?: TouchpointInputPayload
): Promise<ResolveClarificationResult> {
  const args = [
    "--format=json",
    "resolve-clarification",
    "--id", clarificationId,
    "--resolution", resolution,
  ];
  if (resolution === "log_corrected" && !correctedPayload) {
    throw new Error("log_corrected requires a correctedPayload");
  }
  const r = await runKit(args, resolution === "log_corrected" ? correctedPayload as unknown as object : undefined);
  return parseKitJson<ResolveClarificationResult>(r);
}

export async function renameContact(
  contactId: string,
  newName: string
): Promise<RenameContactResult> {
  const r = await runKit([
    "--format=json",
    "rename-contact",
    "--id",
    contactId,
    "--new-name",
    newName,
  ]);
  return parseKitJson<RenameContactResult>(r);
}
