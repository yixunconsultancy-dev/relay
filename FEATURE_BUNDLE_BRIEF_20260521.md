# Post-First-Test Feature Bundle Brief

Written: 2026-05-21, after the first live Telegram session (`exports/awmosdemobot_telegram_session_20260521_155036.md`) and Codex's review (`docs/LIVE_TEST_REVIEW_20260521.md`).

## ✅ STATUS: ALL 7 ITEMS SHIPPED (verified 2026-05-24)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Merge contacts (kit + app) | **Shipped** | `cmd_merge_contacts` at `scripts/relationship_os.py:3516`, `contact_merged` event kind, merge UI in `app/src/routes/contact-detail.tsx`, `test_merge_contacts_*` tests |
| 2 | Fuzzy reminder search | **Shipped** | `cmd_find_reminders` at `scripts/relationship_os.py:3603`, `test_find_reminders_*` tests, SOUL.md "Fuzzy completion" section (line 721) |
| 3 | Duplicate reminder detection + cleanup | **Shipped** | `reminder_duplicate_skipped` event kind, `scripts/cleanup_duplicate_reminders.py`, `test_log_touchpoint_skips_duplicate_*` tests, SOUL.md "Reminder duplicate detection" (line 742) |
| 4 | Hermes `update-contact` command | **Shipped (kit)** | `cmd_update_contact` at `scripts/relationship_os.py:3679`, 5 `test_update_contact_*` tests, SOUL.md "Contact Profile Updates" (line 424). App still uses direct SQL via `mutations.ts::updateContact` — see "Known follow-up" below. |
| 5 | Policies module | **Shipped** | `cmd_add_policy`/`update_policy`/`list_policies`/`archive_policy` at `scripts/relationship_os.py:3839-4034`, 6 policy tests, SOUL.md "Policy Management" (line 572) + "add-policy vs update-contact" (line 639), Policies section on contact-detail (visible on Hayden Foo's screen) |
| 6 | Activity / debug timeline | **Shipped** | `app/src/routes/activity.tsx`, sidebar nav entry |
| 7 | Prep view composition (depends on 5) | **Shipped** | `cmd_prep` calls `policies_for_contact()` at `scripts/relationship_os.py:2384`, surfaces `active_policies` in response (line 2405), `test_prep_includes_active_policies` test |

**Test counts confirming this shipped:** 47 Python tests (up from 17 when this brief was written) + 28 TypeScript tests (vitest setup landed 2026-05-24) + 11 Rust tests.

### Known follow-up from this bundle
Item 4 shipped the Python `update-contact` command but the app's
`app/src/lib/mutations.ts::updateContact` still writes directly to SQLite
instead of shelling out to the new command. Flagged by the 2026-05-24
eng review as architecture finding **A2**. Low urgency (free-text fields
only, no validation drift today), but worth migrating before any
consultant-managed field gains structured validation.

### Where to track new feature work
This brief is closed. New feature bundles should land as their own dated
brief (e.g. `FEATURE_BUNDLE_BRIEF_YYYYMMDD.md`). Status of items in
flight is tracked there; this file is now a historical record of what
the May 2026 bundle delivered.

---

## Original Brief (2026-05-21) — historical planning content

The content below is the original planning document as it was written
on 2026-05-21. It is preserved for the design rationale (why each item
was scoped the way it was). All items have shipped per the status table
above; do not re-implement.

## Scope

**In:**
1. Merge contacts (kit + app)
2. Fuzzy reminder search + completion (kit + Hermes flow)
3. Duplicate reminder detection at write time + one-shot DB cleanup
4. Hermes-side `update-contact` command — Option 1 (direct write) with safety guardrails
5. Policies module (new SQLite table, kit commands, app surface)
6. Assistant activity / debug timeline surface in the app
7. Prep view composition updates (mostly free once 5 lands)

**Explicitly out of scope (deferred or rejected):**
- Voice-note capture / CaptureDrafts inbox. MVP is text-only Telegram input.
- Product Knowledge Library / approved-source product database.
- Coverage adequacy worksheet.
- Meeting prep mode as a separate composite UI (the existing contact-detail page + updated prep CLI output cover this).

**Build order:** items 1-4 are independent and can ship as one pass or split. Item 5 is the biggest and benefits from being its own pass. Item 6 is small UI work, can ship anytime after 1-5. Item 7 is incremental on top of 5.

---

## Item 1 — Merge contacts

**Problem:** Live session created `Sarah` then `Sarah Lim`. Hermes cancelled the mistaken reminder but had no way to move the touchpoint or delete the phantom contact. The orphan `Sarah` row is still in the DB.

### Kit changes

**New command:** `merge-contacts --from <id> --into <id>` in `scripts/relationship_os.py`.

Behavior:
- Both contacts must exist; error otherwise.
- Within a single SQLite transaction:
  - `UPDATE touchpoints SET contact_id = <into>, contact_name = <into.name> WHERE contact_id = <from>`
  - `UPDATE reminders SET contact_id = <into>, contact_name = <into.name> WHERE contact_id = <from>`
  - For each consultant-managed field on `<from>`, if the corresponding field on `<into>` is empty, copy from `<from>`. If both have values, prefer `<into>`'s value and append `<from>`'s into a `notes` block prefixed with `[merged from <from.name> on YYYY-MM-DD]`.
  - Hermes-managed fields (`type`, `relationship_stage`, `last_touch_date`) take the more-recent value.
  - `DELETE FROM contacts WHERE id = <from>`.
  - `INSERT INTO events (kind='contact_merged', subject_id=<into>, payload={merged_from_id, merged_from_name, touchpoints_moved, reminders_moved, fields_merged}, source='merge-contacts')`
- Standard `--json` / `--json-file` / `--format json` support per the existing convention.

**New `VALID_EVENT_KINDS` entry:** `contact_merged`.

### App changes

On `app/src/routes/contact-detail.tsx`:
- New button in the header area: `Merge into another contact…`
- Opens a dialog with a contact picker (search-as-you-type) excluding the current contact.
- On select, shows a confirmation dialog: "Merge `<from.name>` into `<into.name>`? All N touchpoints and M reminders will be moved. This cannot be undone."
- On confirm, shells out via `run_kit_command` to `merge-contacts --from <id> --into <id>`.
- On success, navigate to `/contacts/<into.id>` and invalidate `queryKeys.contacts`.
- The `merge_contacts` Tauri shell-out path follows the existing pattern in `lib/kit.ts`.

### Tests

In `tests/test_relationship_os.py`:
- `test_merge_contacts_moves_touchpoints_and_reminders` — create two contacts, log one touchpoint + reminder to each, merge, assert from-contact gone, into-contact has both touchpoints + both reminders, event emitted.
- `test_merge_contacts_field_strategy` — into has email A, from has email B → into keeps A. Into has empty `family`, from has `"wife and 2 kids"` → into gets `"wife and 2 kids"`. Both have `family` populated → into keeps its own, from's value appears in `notes` with merge prefix.
- `test_merge_contacts_rejects_unknown_id` — error when either id doesn't exist.

---

## Item 2 — Fuzzy reminder search + completion

**Problem:** "Marked the SRS thing done" failed because `complete-reminder` requires either a reminder ID or a contact name. Hermes had no way to search reminders by context alone.

### Kit changes

**New command:** `find-reminders --query <text> [--status pending|done|snoozed|cancelled|any] [--limit 10]` in `scripts/relationship_os.py`.

Behavior:
- Defaults: `--status pending`, `--limit 10`.
- Case-insensitive substring match against `context`, `type`, and `contact_name`.
- Returns JSON: `{"count": N, "candidates": [{"id", "contact_id", "contact_name", "due_date", "status", "context", "type", "priority"}]}`.
- Text format prints a numbered list for terminal use.

**No change to `complete-reminder` semantics** — the disambiguation flow is handled by Hermes, not by relaxing the kit's contract. Keep the existing "either reminder_id or contact_name required" guard so a future caller can't accidentally complete the wrong reminder.

### SOUL.md updates

Add a new section "Fuzzy Reminder Completion" under Reminder Lifecycle. Pattern:

```text
When the consultant says something like "marked the SRS thing done" or
"closed Sarah's protection follow-up" without a clear contact + ID:

1. Call `find-reminders --query <consultant's phrase>` to get candidates.
2. If exactly one match: confirm with the consultant ("Marking 'Follow up on
   SRS option' for Demo Client, due 2026-06-05 — confirm?") then call
   complete-reminder --reminder-id.
3. If multiple matches: list them ("I found 3 reminders matching 'SRS' —
   which one? 1. ... 2. ... 3. ...") and wait for the consultant's pick.
4. If zero matches: tell the consultant ("No pending reminder matches 'SRS'.
   The closest active reminders are: ..."). Don't auto-resolve.
```

### Tests

- `test_find_reminders_matches_context_substring` — log 3 reminders, query for one's context substring, assert single match.
- `test_find_reminders_status_filter` — same set, query with `--status done` returns only the done ones.
- `test_find_reminders_empty_query_returns_all_pending` (or rejects, your call).

---

## Item 3 — Duplicate reminder detection + DB cleanup

**Problem:** Demo Client has 2 identical pending reminders for 2026-05-29; Sarah Lim has 2 pending reminders for 5/26 and 5/27 — both protection-planning follow-ups. Nothing in the kit dedupes at write time.

### Kit changes

In `log_touchpoint` (or the helper layer below it), when a `reminder_due` is included:
- Query existing reminders for the resolved contact where:
  - `status = 'pending'`
  - `abs(due_date - new_due_date) <= 7 days`
  - Context overlap ≥ 0.5 (simple normalized word-set Jaccard: lowercase, drop stopwords like "follow", "up", "on", "about", "the", "and", split on whitespace, intersection / union ≥ 0.5)
- If a duplicate is detected:
  - Default behavior: **skip creating the new reminder.** Log it as a `reminder_duplicate_skipped` event with `{existing_reminder_id, would_have_due_date, would_have_context}`. Include the existing reminder in the response so Hermes can tell the consultant "I logged the touchpoint but you already have a pending reminder for X, due Y."
  - Override via new flag: `--allow-duplicate-reminder` on `log-touchpoint`. When set, write the duplicate anyway.

**New `VALID_EVENT_KINDS` entry:** `reminder_duplicate_skipped`.

### SOUL.md update

Add a short note under Touchpoint Extraction:

```text
When `log-touchpoint` returns a duplicate-reminder notice, tell the
consultant honestly: "Logged the touchpoint. I didn't create a new reminder
because you already have one for <existing.context> due <existing.due_date>.
Tell me if you want both anyway." Do not silently drop the notice.
```

### One-shot cleanup script

`scripts/cleanup_duplicate_reminders.py` — interactive utility:
- Walks pending reminders, groups by `contact_id`.
- For each contact, finds clusters of duplicates per the same rule (≤7 days apart, ≥0.5 context overlap).
- For each cluster, prints: contact name, the N reminders with id/due_date/context/created_at.
- Asks: "Keep which? [1-N / k=keep all / s=skip]"
- Cancels the unselected reminders via `cancel-reminder`, emits `reminder_cancelled` events with source `cleanup-duplicates`.
- Dry-run mode by default; require `--apply` to actually cancel.

Run this once against the live DB to clean Demo Client and Sarah Lim. Document in the script header that it's safe to re-run.

### Tests

- `test_log_touchpoint_skips_duplicate_reminder` — log touchpoint with reminder, log another touchpoint with very similar reminder (same contact, due ±2 days, overlapping context) → assert no second reminder created + event emitted.
- `test_log_touchpoint_allows_duplicate_with_flag` — same scenario with `--allow-duplicate-reminder` → assert second reminder created, no skip event.
- `test_log_touchpoint_distinct_reminders_not_deduped` — same contact, different due date (+30 days) or completely different context → both reminders created.

---

## Item 4 — Hermes `update-contact` command (Option 1 + guardrails)

**Decision:** the consultant has chosen Option 1 — Hermes writes directly to consultant-managed fields, trusting the frontier-model parsing. Guardrails: validate field names, append-by-default for free-text fields, emit diffs to the events table.

### Kit changes

**New command:** `update-contact` in `scripts/relationship_os.py`.

CLI shapes:
- `update-contact --id <contact_id> --field <name> --value <text> [--replace]`
- `update-contact --id <contact_id> --json '{...}'` or `--json-file <path>` for batch updates.
- `update-contact --name <contact_name> ...` as an alternative when Hermes doesn't have the ID handy (uses the same contact-resolution as `prep --name`).

Field policy:
- **Allowed fields** (matches `CONSULTANT_MANAGED_FIELDS`): `phone`, `email`, `occupation`, `company`, `birthday`, `family`, `policies`, `financial_concerns`, `interests`, `referral_source`, `next_review_date`, `notes`.
- **Rejected fields:** anything in `HERMES_MANAGED_FIELDS` (`type`, `relationship_stage`, `last_touch_date`, `created_at`, `updated_at`) — these are derived from touchpoints and shouldn't be overwritten via this command.
- **Append-by-default fields:** `family`, `financial_concerns`, `interests`, `notes`. When updated, prefix the new value with `[YYYY-MM-DD] ` and append to the existing field's content with a blank line separator. Use `--replace` to overwrite instead.
- **Replace-by-default fields:** `phone`, `email`, `occupation`, `company`, `birthday`, `policies`, `referral_source`, `next_review_date`. Direct replacement.
  - Note: once item 5 (Policies module) ships, Hermes should prefer `add-policy` over `update-contact --field policies` for structured policy data. The `policies` field on contacts becomes free-text legacy. Don't remove it — keep for backward-compat — but the SOUL.md guidance should steer Hermes correctly.

Behavior:
- Validates field names against the allowed set; rejects unknown or Hermes-managed fields.
- Bumps `updated_at`.
- Writes a `contact_updated` event with the field-level diff, `source = 'hermes:update-contact-fields'`.

### SOUL.md updates

Add a new top-level section "Contact Profile Updates":

```text
When the consultant tells you a fact about a contact that belongs on their
profile — occupation, family, policies, financial situation, contact info,
referral source — use `update-contact`, not `log-touchpoint`.

Examples:
- "Vincent is a software developer" → update-contact --name Vincent --field occupation --value "software developer"
- "Add to Vincent's profile that he earns 10k/month" → update-contact --name Vincent --field financial_concerns --value "Earns ~$10k/month (~$120k/year)"
- "Sarah Lim's phone is +65 9123 4567" → update-contact --name "Sarah Lim" --field phone --value "+65 9123 4567" --replace

Append-by-default fields (family, financial_concerns, interests, notes):
The new value is appended with a date prefix, so prior entries stay visible.
Use --replace only when the consultant explicitly says "replace" or "the
new value supersedes the old one."

Replace-by-default fields (phone, email, occupation, company, birthday,
referral_source, next_review_date): single-value facts; new value replaces
the old.

Forbidden fields: type, relationship_stage, last_touch_date. These are
derived from touchpoints and update automatically.

For structured policy data (insurer + plan name + premium + sum assured),
use `add-policy` instead of update-contact (see Policy Management section).
```

Also update the existing "Storage Interface" section to add `update-contact` to the command list.

Update the touchpoint-type guidance: Hermes should stop using `touchpoint_type: "other"` for profile-style notes. That was a workaround for this gap.

### App changes

Minimal — the events polling already picks up `contact_updated` events and refreshes the contact detail view. Optional:
- Add a small "Recent Hermes edits" panel on `contact-detail.tsx` showing the last 5 `contact_updated` events sourced from `hermes:*`, with the diff visible. Lets the consultant spot a bad Hermes edit in one glance.

### Tests

- `test_update_contact_append_field_prepends_date` — update `family`, assert new value appended with date prefix.
- `test_update_contact_replace_field_overwrites` — update `phone` with `--replace` (or without, since phone is replace-by-default), assert overwritten.
- `test_update_contact_rejects_hermes_managed_field` — try to update `relationship_stage`, assert RelationshipOSError.
- `test_update_contact_emits_diff_event` — update, query events, assert the payload includes from→to.
- `test_update_contact_by_name_resolves_unique` — `--name "Vincent"` resolves to the single Vincent.

---

## Item 5 — Policies module

**Problem:** Vincent has a Secure Flexi Term policy at $2,050/yr. Right now this lives as free text in a touchpoint or the `policies` field on the contact. No structured surface, no per-policy reminders, no policy timeline.

### Kit changes

**New SQLite table** `policies`:

| column | type | notes |
|---|---|---|
| id | TEXT PRIMARY KEY | `p_YYYYMMDD_xxxx` |
| contact_id | TEXT | FK-ish to contacts.id |
| insurer | TEXT | e.g. "AIA", "Great Eastern" |
| plan_name | TEXT | e.g. "Secure Flexi Term" |
| policy_type | TEXT | e.g. "protection", "savings", "investment-linked", "ci", "other" |
| sum_assured | TEXT | freeform — "S$500,000" or "USD 100,000/yr" |
| premium_amount | TEXT | "$2,050" |
| premium_frequency | TEXT | "annual" / "monthly" / "single-pay" |
| start_date | TEXT (ISO YYYY-MM-DD) | nullable |
| review_date | TEXT (ISO YYYY-MM-DD) | nullable |
| status | TEXT | `active` / `lapsed` / `surrendered` / `claimed` / `archived` |
| notes | TEXT | free text |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

Update `HEADERS` and `Store.ensure` to create the table on first open (the existing ALTER pattern handles column adds but a new table needs an explicit `CREATE TABLE IF NOT EXISTS`).

**New commands:**
- `add-policy --contact-id <id> | --contact-name <name>` plus field flags or `--json` / `--json-file`. Required: `contact_id` (or name) + `insurer` + `plan_name`. Status defaults to `active`.
- `update-policy --id <p_id>` with field flags or JSON. Bumps `updated_at`.
- `list-policies --contact-id <id> | --contact-name <name>` returns JSON or text list.
- `archive-policy --id <p_id>` sets status to `archived` (don't delete; keep history).

**New `VALID_EVENT_KINDS` entries:** `policy_created`, `policy_updated`, `policy_archived`.

### SOUL.md updates

New section "Policy Management":

```text
When the consultant mentions a structured policy detail — insurer, plan
name, sum assured, premium, start date — call `add-policy`. Don't bury
policy data in touchpoint summaries or the contact's free-text `policies`
field.

Examples:
- "Vincent has Secure Flexi Term, $2,050/year premium" →
  add-policy --contact-name Vincent --insurer "<ask if not given>"
  --plan-name "Secure Flexi Term" --policy-type protection
  --premium-amount "$2,050" --premium-frequency annual

If the consultant doesn't give the insurer, ask: "Which insurer issues
the Secure Flexi Term policy?" before calling add-policy.

For policy edits ("change his premium to $2,400") use update-policy with
the policy ID from list-policies.
```

Update `prep --name` output to include a "Policies" section if the contact has any: insurer + plan + premium summary.

### App changes

On `contact-detail.tsx`, add a new "Policies" section between the touchpoint timeline and the generated documents panel:
- Lists active policies with: insurer, plan name, type chip, sum assured, premium + frequency, status.
- Inline edit on each row (calls `update-policy` shell-out).
- "Add policy" button opens a modal with the structured form.
- Archived policies hidden by default with a toggle.

### Tests

- `test_policies_table_created_on_init` — fresh DB, init, assert `policies` table exists with correct columns.
- `test_add_policy_basic` — add, query via list-policies, assert returned.
- `test_update_policy_bumps_updated_at_and_emits_event`.
- `test_archive_policy_changes_status_not_deletes`.
- `test_prep_includes_policies_when_present`.
- Add a `test_draft_notice_still_present_after_policies_section` to the existing compliance guard.

---

## Item 6 — Activity / debug timeline in the app

**Problem:** Consultant explicitly asked "are you keeping this session log anywhere?" The Events table already exists; it just isn't visible.

### App changes

New route `/activity` in the app:
- Renders the Events table reverse-chronologically.
- Filter chips: by `kind` (touchpoint_logged, reminder_*, contact_*, policy_*, contact_merged), by `source` (hermes:*, app:*, cleanup-*), by contact (select from the contacts list), by date range.
- Each row shows: timestamp, kind chip, contact name (link to detail), source label, payload summary (one-line render of the JSON).
- Click a row to expand and show the full payload.
- Add to sidebar nav under Settings or as its own item.

Use `fetchEventsSince(null)` paginated — start with `LIMIT 200`, "Load more" button for older.

### No kit changes needed

The Events table is already the source of truth.

### Tests

JS-side only — light. Optional: a smoke test that mounts the route and asserts it renders without crashing given seed data.

---

## Item 7 — Prep view composition (depends on item 5)

Once policies module lands:
- `prep --name X` output gets a "Policies" section before "Pending reminders."
- App's contact-detail page already shows policies if item 5 wires the section.
- Sidebar "Recent Hermes edits" (item 4) gives context on what Hermes changed recently.

No new commands. This is just making sure items 4 + 5 update the existing prep flow rather than adding parallel surfaces.

---

## Cross-cutting

### SOUL.md re-bootstrap reminder

Every SOUL.md change requires consultants to re-run `bash scripts/bootstrap_hermes_profile.sh <profile>` to pick up the new instructions in their profile dir. Document this in the brief's wrap-up message.

### Event kinds being added

- `contact_merged`
- `reminder_duplicate_skipped`
- `policy_created`
- `policy_updated`
- `policy_archived`

All need to land in `VALID_EVENT_KINDS` in `scripts/relationship_os.py`. The events polling on the app side picks them up automatically since it dispatches by kind; add cases for the new kinds in `app/src/lib/polling.ts` `dispatchInvalidations`:
- `contact_merged` → invalidate contacts list + the surviving contact's detail
- `policy_*` → invalidate the affected contact's detail
- `reminder_duplicate_skipped` → no invalidation needed (no state change)

### Settings event-source label map

`app/src/routes/settings.tsx::formatEventSourceLabel` should learn the new labels:
- `merge-contacts` → "Contacts merged"
- `cleanup-duplicates` → "Duplicates cleaned up"
- `hermes:update-contact-fields` → "Contact edited (Hermes)"
- `add-policy` / `update-policy` / `archive-policy` → "Policy added/updated/archived"

### What is NOT in this brief

- **Voice notes / CaptureDrafts.** MVP is text-only.
- **Product Knowledge Library.** Out of scope.
- **Coverage adequacy worksheet.** Out of scope.
- **Authentication / multi-consultant / cloud sync.** Out of scope per SCOPING.md.

## Suggested execution split

Codex can ship this in one pass or stage it. Reasonable split:

- **Pass A (correctness + Hermes parity):** items 1, 2, 3, 4. Closes the live-test gaps. Roughly: merge command + app dialog + dedup + cleanup script + update-contact + SOUL.md updates + tests.
- **Pass B (policies):** item 5. Bigger; new table, new commands, new app section.
- **Pass C (UI polish):** items 6 + 7. Activity route + prep composition.

Acceptance for each pass:
- All Python tests pass (currently 17 + new tests per item).
- All Rust tests pass (12 + any new).
- `npm run build` clean.
- `npm run audit` clean.
- Re-bootstrap the test Hermes profile and walk through a fresh Telegram session exercising the new flows.

Update `APP_BUG_FIX_BRIEF_FOR_CLAUDECODE.md` after each pass with what shipped, what didn't, and any deferred decisions.
