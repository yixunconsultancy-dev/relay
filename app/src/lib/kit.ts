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

export interface RenameContactResult {
  ok: boolean;
  contact_id: string;
  from: string;
  to: string;
  touchpoints_updated: number;
  reminders_updated: number;
  message: string;
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
