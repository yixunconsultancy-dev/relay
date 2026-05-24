# Relationship OS Kit Handoff Review Brief

Date: 2026-05-20  
Workspace: `Relationship OS Kit`

## Purpose

This document is for handing the current work to Hermes, Claude Code, Codex, or
another reviewer for critique. It captures the product direction, recent
implementation changes, verification status, and open questions that need a
careful review.

## Product Context

The kit is a private Relationship OS for financial consultants. The consultant
logs relationship notes through Telegram. A dedicated Hermes profile reads
`SOUL.md`, calls `scripts/relationship_os.py`, and turns natural-language notes
into structured relationship records.

The v0 scope is intentionally narrow:

- Contacts
- Touchpoints
- Reminders
- Daily focus summaries
- Meeting prep
- Obsidian-style Markdown export
- Draft appointment summaries, proposals, slide decks, and topic writeups

The system must not send client-facing messages, make financial
recommendations, or access data outside the consultant's own Relationship OS
setup.

## Major Product Rule

We added this rule across the runtime and setup docs:

> The agent's structured source of truth is SQLite. Google Sheets, local CSV,
> and Obsidian Markdown are consultant-facing views.

The consultant chooses where they want to review their Relationship OS:

- Google Sheets
- Local CSV
- Obsidian Markdown

The consultant does not choose the agent's internal memory format. PDFs and
slide decks are generated deliverables, not living data stores.

## Why This Rule Exists

CSV was useful for demos but is awkward as the real agent memory. Markdown is
excellent for Obsidian-style review and narrative notes, but weak as the primary
structured database. SQLite gives the agent a safer local source of truth with
tables, structured reads/writes, and less parsing fragility.

Google Sheets, CSV, and Markdown can still be useful as human-facing outputs.
The product should keep those as views/mirrors rather than canonical storage.

## Implementation Timeline

This section explains how the project reached the current state. It is included
so reviewers can distinguish foundational runtime work from later design and
architecture changes.

### 1. Initial MVP Direction

The project started as a narrow Relationship OS bot for financial consultants:

```text
Telegram note -> Hermes agent -> Relationship OS helper -> sheet-style output
```

The first goal was not a full CRM. It was to prove that a consultant could send
a natural-language Telegram note and have the system create structured records
for:

- Contacts
- Touchpoints
- Reminders
- Daily focus / prep

At this stage, local CSV files under `data/local_sheet/` acted as the dry-run
store, and Google Sheets was the intended live store.

### 2. Early Runtime Implementation

The early implementation created:

- `scripts/relationship_os.py`
- `SOUL.md`
- `AGENTS.md`
- `HERMES_SETUP.md`
- `DATA_SCHEMA.md`
- `REMINDER_RULES.md`
- `RELATIONSHIP_RULES.md`
- `PRIVACY_AND_BOUNDARIES.md`
- Telegram/Hermes setup docs
- Local dry-run CSV files
- Basic tests

The helper script supported:

- `init`
- `status`
- `log --text "..."`
- `today`
- `prep --name "Name"`
- `demo --reset`

The system could parse simple meeting notes, create or update a contact, log a
touchpoint, and create a follow-up reminder.

### 3. Fresh Consultant Testing

We tested the kit as if a new consultant were starting with a fresh local
desktop and a fresh Hermes profile.

Important findings:

- A new Hermes profile should be separate from the user's personal assistant.
- The consultant profile should be limited to the `terminal` tool.
- The bot should use a dedicated Telegram bot token, not an existing personal
  Hermes assistant bot.
- Hermes setup may prompt for model/provider configuration before the bot can
  run.
- Telegram slash commands can be intercepted by the Hermes gateway before the
  Relationship OS agent sees them.

That last finding changed the product command style. The runtime docs now use
plain text commands like `status`, `today`, and `prep Demo Client`, not
`/status`, `/today`, or `/prep`.

### 4. Live Telegram / Local Store Validation

In live testing, a Telegram message like this successfully wrote structured
data:

```text
Had coffee with Hayden today. He is interested in retirement planning, follow up next Friday.
```

The system wrote rows into:

- `Contacts.csv`
- `Touchpoints.csv`
- `Reminders.csv`

That validated the core v0 loop: Telegram input, Hermes interpretation, helper
script write, and readable local output.

### 5. Command And Tooling Hardening

During testing, some Hermes behaviors needed tightening:

- Slash commands were removed from consultant-facing docs because gateway-level
  routing could intercept them.
- The default Telegram command menu was cleared for the test bot.
- The Hermes profile was locked down so the Relationship OS assistant would not
  create, install, edit, or remove Hermes skills.
- The runtime instruction now says Telegram messages from the consultant are
  product commands, not Hermes administration requests.

This produced the current rule: all durable Relationship OS mutation should go
through `scripts/relationship_os.py`.

### 6. Paperclip Expansion

Paperclip / multi-agent work later expanded the project beyond the basic
CSV/Sheets MVP. That work appears to have contributed breadth and polish:

- AWM-oriented design direction
- `design.md`
- `branding_assets_spec.md`
- reference notes under `references/`
- showcase examples under `showcase_examples/`
- generated PDF and PPTX deliverables
- visual preview artifacts
- contrast QA via `scripts/check_design_contrast.py`
- `scripts/regenerate_showcase.py`

The helper script was expanded to support:

- `export-md`
- `appointment-summary`
- `proposal`
- `slides`
- `writeup`

Paperclip seems to have been most useful for design system thinking,
deliverable generation, artifact packaging, and visual QA habits.

### 7. Post-Paperclip Review And Fixes

After the Paperclip expansion, review found a few integration issues:

- New docs had reintroduced slash-command style instructions for generated
  deliverables.
- Some generated PDF previews rendered literal Markdown divider text such as
  `---`.

Fixes applied:

- Replaced slash-style deliverable instructions with plain text command forms:
  - `appointment-summary Contact Name [YYYY-MM-DD]`
  - `proposal Contact Name Topic`
  - `slides Contact Name Purpose`
  - `writeup Topic`
- Removed slash aliases from the relevant command docs.
- Updated PDF rendering logic to skip Markdown horizontal rule markers.
- Regenerated showcase artifacts.
- Re-ran tests and contrast checks.

This reinforced the pattern that Paperclip helped generate breadth, but the
final integration pass still needed live-runtime review.

### 8. CSV Readability Discussion

The local CSV output was inspected and found to be database-shaped rather than
consultant-shaped. It contained useful structured rows, but it was not pleasant
for a human consultant to read every morning.

That led to a product distinction:

- The agent needs a structured source of truth.
- The consultant needs a readable view.

The planned consultant-facing views are:

- Google Sheets for familiar dashboards and mobile access
- Obsidian Markdown for note-native consultants
- Local CSV for privacy-first local testing and fallback

Future work should make the human-facing views cleaner with tabs or pages like:

- Today
- Follow-Ups
- Contacts Summary
- Conversation Timeline
- Relationship Health

### 9. SQLite Architecture Decision

After comparing CSV, Markdown, and SQLite as the agent's base memory, we chose
SQLite as the default source of truth.

Reasoning:

- CSV is simple but fragile for updates, dedupe, joins, and future automation.
- Markdown is excellent for human narrative notes, but weak as canonical
  structured memory.
- SQLite is built into Python, local-first, queryable, structured, and does not
  require a server.

This produced the current product rule:

```text
Agent source of truth: SQLite
Consultant-facing view: Google Sheets, local CSV, or Obsidian Markdown
```

### 10. Today's Implementation

Today's work made that rule concrete:

- Added `SQLiteStore`.
- Made SQLite the default `RELATIONSHIP_OS_STORE`.
- Added `RELATIONSHIP_OS_DB_PATH`.
- Added `RELATIONSHIP_OS_CONSULTANT_VIEW`.
- Added sync from SQLite to CSV, Google Sheets, or Obsidian Markdown views.
- Updated `.env.example`.
- Updated `scripts/bootstrap_hermes_profile.sh`.
- Updated agent, setup, privacy, schema, troubleshooting, design, and reference
  docs.
- Added a unit test proving SQLite syncs into the local CSV view.

After today's changes, running the demo writes to SQLite first and mirrors to
the default CSV consultant view.

### 11. Hermes-As-Parser Refactor

A review session identified that natural-language parsing was still happening
inside `scripts/relationship_os.py` via regex, despite Hermes already reading
every consultant Telegram message. The regex layer produced visible bugs:

- "next Friday" resolving to this week's Friday (the `force_next` branch in
  `next_weekday` did not actually advance the date when the target weekday
  was later in the same week).
- `extract_action_items` overlapping triggers, emitting duplicated snippets
  like `"... Prepare closing roleplay tomorrow; Prepare closing roleplay
  tomorrow"`.
- `extract_name` mis-extracting topic keywords as contact names — e.g.
  "Spoke to Mary about retirement next Tuesday" returning `"retirement"`
  because the `about [Capitalised word]` pattern fired after the real name
  was consumed.

The architecture was flipped:

- Hermes is now the parser. It reads the consultant's Telegram message,
  extracts the structured fields (`contact_name`, `touch_date`,
  `touchpoint_type`, `sentiment`, `summary`, `topics`, `action_items`,
  `contact_type`, `relationship_stage`, `reminder_due`, `reminder_priority`,
  `reminder_context`, `reminder_type`, `raw_input`) per a documented schema
  in `SOUL.md` under "Touchpoint Extraction", writes the JSON to a temp
  file, then calls `log-touchpoint --json-file <path>`.
- `scripts/relationship_os.py` is now a typed, validated write API. The new
  `log-touchpoint` subcommand accepts either `--json <string>` (with `-`
  meaning stdin), `--json-file <path>`, or individual `--contact-name`,
  `--touch-date`, etc. flags for ad-hoc terminal use. Unknown enum values,
  malformed dates, and missing required fields are rejected before any row
  is written.
- The regex parser functions (`extract_name`, `clean_candidate_name`,
  `normalize_name`, `extract_action_items`, `parse_due_date`, `next_weekday`,
  `infer_touchpoint_type`, `infer_contact_type`, `infer_stage`,
  `infer_sentiment`, `extract_topics`, `summarize`, `parse_note`) were
  deleted, along with the `TOPIC_KEYWORDS`, `ACTION_TRIGGERS`, `WEEKDAYS`,
  and `MONTHS` constant tables and the `ParsedNote` dataclass that fed them.
- The `log --text` CLI subcommand was removed entirely. There is no
  backwards-compatible alias.
- `cmd_demo` no longer feeds sample strings through a parser. It constructs
  three `TouchpointInput` dataclasses directly with the same data Hermes
  would have produced, then calls `log_touchpoint(store, input)`. Tests
  likewise call `log-touchpoint --json` with structured inputs.
- `SOUL.md` gained a "Touchpoint Extraction" section describing the schema
  Hermes is expected to produce, with a worked example. The stale "call the
  log command with the original message text" instruction was replaced.
- `CLAUDE.md`, `README.md`, `START_HERE.md`, `HERMES_SETUP.md`, and the
  bootstrap script no longer reference the removed `log` command.
- A new unit test (`test_log_touchpoint_validates_enums`) covers the
  validator: bad sentiment values, missing required fields, malformed
  reminder dates, and case-insensitive coercion of valid enums.

Verification on today's date (2026-05-20, a Wednesday): `demo --reset` now
produces a Demo Client reminder due `2026-05-29` — the correct "next Friday"
— rather than the buggy `2026-05-22`. The Test suite grew from 8 tests to 9
and all pass.

This change moves the burden of natural-language understanding to the system
best suited for it (the LLM) and reduces the script's job to "validate and
store a structured payload." The script is now ~300 lines smaller and has no
opinion about English.

### 12. Section-Based Deck Composition

Slide generation moved from a hardcoded 5-section template to a composable
section list payload. Motivated by a near-term consultant scenario:
"generate a deck with the appointment summaries of each touchpoint, plus a
presentation on maximising credit cards in Singapore." The old template
couldn't span both contact-specific data and arbitrary topical content.

The new architecture keeps the deterministic-layout guarantee (every slide
of a given type looks identical across consultants and across LLM
providers) while letting Hermes vary deck length and content composition.
The split is now:

- **Hermes decides:** which sections appear, in what order, with what
  content (titles and bullets for Hermes-authored sections).
- **Script decides:** the per-slide layout, fonts, brand imagery, scheme
  treatment, pagination at content-density limits, automatic cover and
  closing slides.

Section types added (in `VALID_SECTION_TYPES`):

- `contact_context` — script-rendered from the Contact record.
- `touchpoint_summary` — script-rendered list, paginates at 5 per slide.
- `touchpoint_detail` — Hermes-authored bullets per touchpoint; script
  formats title as `YYYY-MM-DD · Type · Sentiment`.
- `content` — fully Hermes-authored title + bullets, paginates at 6
  bullets per slide.
- `open_items` — script-rendered from the Reminders table, paginates at 6
  per slide.

Cover and closing slides are auto-prepended and auto-appended; consultants
and Hermes do not include them in section lists. The closing slide uses
new scheme defaults (`closing_image1.png` for awm-light, `closing_image2.png`
for awm-dark) and renders a clean closing image with the brand footer — no
"thank you" text.

Content density rules borrowed from the frontend-slides skill:

- Max 6 bullets per content slide.
- Max 5 touchpoint entries per summary slide.
- Max 6 reminders per open-items slide.
- Overflow paginates with a "(cont.)" suffix on the title.

API changes:

- `slides Contact Name Purpose` (positional form) still works — maps to a
  default section list `[contact_context, touchpoint_summary (limit 5),
  open_items]`. Backwards-compatible.
- `slides --json <string>` and `slides --json-file <path>` accept the new
  payload shape: `{contact_name, purpose, sections: [...]}`.
- New `SlideSection` dataclass, `slide_section_from_dict` validator,
  `section_to_slides` dispatcher, `build_deck` orchestrator, and
  `write_rendered_slides` writer.
- New `RenderedSlide` dataclass and `slide_type` parameter on
  `add_ppt_slide` for explicit "cover" / "body" / "closing" dispatch.

`SOUL.md` gained a "Deck Composition" section with the payload schema, the
five Hermes-specifiable section types, content density rules, when to use
`touchpoint_detail` vs `touchpoint_summary`, and a worked example with the
credit-cards scenario.

`BRAND_ASSET_FILENAMES` extended with `closing_image1/2/3/6` (the four
unique closing images). `SCHEME_BRAND_DEFAULTS` gained a `closing_background`
key per scheme.

Tests added: `test_slide_section_validation` (4 error cases + 3 happy paths),
`test_content_section_paginates_at_six_bullets`,
`test_build_deck_always_brackets_with_cover_and_closing`,
`test_slides_json_payload_end_to_end`. Total: 13 tests, all pass.

End-to-end verified: a payload with an 8-bullet credit-cards content
section produces 8 slides (cover + contact_context + touchpoint_summary +
credit-cards page 1 (6 bullets) + credit-cards page 2 (2 bullets) + best
cards + open_items + closing). The positional form still produces a
5-slide default deck.

### 13. Reminder Lifecycle, Audit Log, Compliance Test, AI-Guided Setup

A polish pass before consultant shipping. Closed the biggest production
gap (no way to mark reminders done), added the foundation for safe
future two-way sync (Events audit table), prevented a serious accidental
regression (Draft notice compliance test), and replaced the
hypothetical setup wizard with a documentation file written for the
consultant's own AI agent.

Runtime additions:

- **`Events` audit table.** Append-only SQLite table with columns
  `id, timestamp, kind, contact_id, subject_id, payload, source`. Every
  durable write writes one row: `touchpoint_logged`, `reminder_completed`,
  `reminder_snoozed`, `reminder_cancelled`, `contact_created`,
  `contact_updated`. `log_event(store, kind, ...)` is the helper. The
  table is intentionally excluded from `sync_consultant_views` (via the
  new `CONSULTANT_VIEW_TABS` constant) — it's diagnostic, not
  consultant-facing.
- **`mark_reminder_status(store, reminder_id, new_status, snoozed_until=...)`.**
  Shared core function backing all lifecycle commands.
- **`resolve_reminder(store, ...)`.** Looks up a reminder by `reminder_id`,
  or by `contact_name` + optional `context_match`. Raises a
  disambiguation error if multiple pending reminders match.
- **`complete-reminder` command.** Marks `pending` → `done`. Accepts
  `--json`, `--json-file`, `--reminder-id`, or
  `--contact-name` + `--context-match`. Emits a `reminder_completed`
  event.
- **`snooze-reminder` command.** Marks `pending` → `snoozed` with a new
  `snoozed_until` date. Requires `--new-due-date` (or `snoozed_until` in
  JSON). Emits a `reminder_snoozed` event.
- **`cancel-reminder` command.** Marks `pending` → `cancelled`. Emits a
  `reminder_cancelled` event.
- **`events` query command.** Filters by `--contact-id`, `--kind`,
  `--since` with a default `--limit 50`. Useful for "what happened on
  date X?" debugging and as the foundation for the v1.1 reconcile pass.
- **`completes_reminder_ids` field in `log-touchpoint`.** Optional list of
  reminder IDs that the new touchpoint closes. Each is marked done
  atomically with the touchpoint write and logged as a
  `reminder_completed` event with payload
  `{"closed_by_touchpoint_id": <new_touchpoint_id>}`. Also surfaced as
  a `--completes-reminder-ids` flag for symmetry. Hermes uses this for
  the natural "I did what I said I would" pattern: one Telegram
  message, one helper call, two rows updated, full audit trail.

Deprecations:

- **`RELATIONSHIP_OS_STORE=google` (legacy).** When selected, the script
  now prints a stderr deprecation warning, and `cmd_status` includes a
  `deprecated_store` line in the response. Behaviour preserved for
  backward compatibility; new setups are steered to
  `STORE=sqlite, VIEW=google`. `.env.example` documents the migration.

Documentation:

- **`SOUL.md` gained a "Reminder Lifecycle" section.** Describes the
  three commands and when to use each, the
  inferring-completion-from-touchpoint pattern via
  `completes_reminder_ids`, the standalone-completion path, snooze and
  cancel forms, and a brief note on the audit log.
- **`SETUP.md` (new).** Written for the consultant's helper AI agent
  (Claude Code, Codex CLI, etc.). 8 phases, each with prompt list,
  commands to run, and verification checks. Replaces the previously
  planned setup wizard.
- **`START_HERE.md` gained a "Setup With Your AI Agent" section** as the
  primary recommended path. The numbered manual steps remain as a
  fallback.
- **`README.md`** updated to reference `SETUP.md`.

Tests:

- **`test_draft_notice_appears_in_every_deliverable`.** Compliance guard.
  Runs the full deliverable generation flow (appointment-summary,
  proposal, slides, writeup) and asserts the `Draft only` string survives
  in every emitted `.md`, `.pdf`, and `.pptx` output. Catches accidental
  removal of compliance language by a future agent editing templates.

End-to-end verified: `complete-reminder --contact-name "Demo Client"
--context-match "retirement"` closes the matching reminder, writes a
`reminder_completed` event, and re-syncs the consultant view. `events
--since 2026-05-20` returns the rolling audit history.

Test count: 13 → 14, all pass.

### 14. v2 Direction Decided: Desktop App As Consultant Surface

During the pass-13 review, the field-level reconcile work (planned as
the v1.1 sync pass) was reconsidered against a different option: build a
native macOS desktop app that reads and writes the same SQLite database
as Hermes, removing the "separate consultant view file" entirely.

The desktop-app option dissolves the merge-conflict problem at its
source. SQLite in WAL mode handles concurrent access between the app and
Hermes natively; there is no synced file to reconcile because the app
*is* the view. CSV / Google Sheets / Obsidian outputs are demoted to
optional export formats.

The consultant's primary use case — pasting bulk reference data (policy
numbers, sums assured, premiums) into a contact's profile — is served
better by a native edit surface than by spreadsheet-driven sync. The
secondary use case (logging touchpoints on the go from Telegram) is
served by Hermes exactly as today; the app polls the Events table to
reflect Hermes-written changes within a few seconds.

The architectural pivot was chosen and scoped:

- **`app/SCOPING.md` (new).** ~250-line spec written for the coding
  agent that will build the app: goals, stack, file layout, data model,
  concurrency model, eight screen specs, Hermes-integration shape,
  out-of-process robustness requirements, seven build phases, and
  explicit MVP acceptance criteria.
- **Stack locked:** Tauri v2 (Rust shell, native macOS feel),
  React 18 + TypeScript + Vite, shadcn/ui + Tailwind for components,
  TanStack Query for caching, `@tauri-apps/plugin-sql` for direct
  SQLite access in WAL mode.
- **macOS-only for MVP.** Apple Developer signing required to avoid
  install warnings. Windows/Linux deferred until after macOS ships.
- **Distribution model:** the app lives inside the kit folder under
  `app/dist/AWMRelationshipOS.app` after build. Single download for
  consultants; the kit's Python scripts and the app coexist in one
  folder.
- **Deliverable generation strategy:** the app shells out to
  `scripts/relationship_os.py` for PDF / PPTX / MD writeup commands.
  Reuses all the kit's brand-asset, design-token, and section-based
  deck logic verbatim.

Cancelled by this pivot (previously open):

- Field-level reconcile across CSV / Google Sheets / Obsidian.
- Polished consultant view tabs (Today / Follow-Ups / Timeline /
  Health) as Google Sheets tabs — replaced by app screens.
- Incremental Google Sheets sync.

Kit docs updated to reflect the pivot:

- `README.md` gained a "Roadmap note" at the top pointing to
  `app/SCOPING.md` and explaining the demotion of CSV / Sheets /
  Obsidian to optional export formats.
- `HANDOFF_REVIEW_BRIEF.md` "Known Risks" section #1 rewritten to
  describe the desktop-app direction rather than the cancelled
  reconcile work.

Estimated build effort: 14-19 days of focused Claude Code work across
the seven phases laid out in `app/SCOPING.md`.

## Recent Implementation Work

### Runtime

Updated `scripts/relationship_os.py`:

- Added `SQLiteStore`.
- Made `RELATIONSHIP_OS_STORE=sqlite` the default.
- Added `RELATIONSHIP_OS_DB_PATH`, defaulting to
  `./data/relationship_os.sqlite3`.
- Added `RELATIONSHIP_OS_CONSULTANT_VIEW`, supporting:
  - `csv`
  - `google`
  - `obsidian`
  - `none`
- Added view sync from SQLite into the selected consultant-facing view.
- Kept legacy `local`/CSV and `google` store modes for compatibility, but docs
  now describe SQLite as the intended source of truth.
- Refactored Markdown export so it can be called as part of Obsidian view sync.
- Updated `status` output to show the SQLite store and consultant view.

Default `.env.example` now uses:

```text
RELATIONSHIP_OS_STORE=sqlite
RELATIONSHIP_OS_DB_PATH=./data/relationship_os.sqlite3
RELATIONSHIP_OS_CONSULTANT_VIEW=csv
```

### Hermes Bootstrap

Updated `scripts/bootstrap_hermes_profile.sh`:

- Sets `RELATIONSHIP_OS_STORE=sqlite`.
- Sets `RELATIONSHIP_OS_DB_PATH` to the kit's local SQLite file.
- Defaults `RELATIONSHIP_OS_CONSULTANT_VIEW=csv`.
- Prints both the SQLite source path and local CSV view path.

### Docs Updated

Updated these files to reflect the SQLite-source / view-layer model:

- `AGENTS.md`
- `SOUL.md`
- `CLAUDE.md`
- `README.md`
- `DATA_SCHEMA.md`
- `START_HERE.md`
- `HERMES_SETUP.md`
- `GOOGLE_SHEETS_SETUP.md`
- `TELEGRAM_BOT_SETUP.md`
- `TROUBLESHOOTING.md`
- `PRIVACY_AND_BOUNDARIES.md`
- `docs/CONSULTANT_TEST_PLAN.md`
- `EXAMPLE_DATA.md`
- `design.md`
- `branding_assets_spec.md`
- `references/brand-recommendations.md`
- `references/comparable-tools.md`
- `references/setup-ux-recommendations.md`

### Tests

Updated `tests/test_relationship_os.py`:

- Added a test proving SQLite is the source of truth and syncs to the local CSV
  consultant-facing view.

## Latest Verification (2026-05-24)

After the post-review polish pass documented in
`APP_BUG_FIX_BRIEF_FOR_CLAUDECODE.md`:

```bash
python3 -m unittest discover -s tests   # 47 tests, OK (46 unit + 1 concurrent-write soak)
cd app && npm test                      # 28 TypeScript tests, OK
cd app/src-tauri && cargo test          # 11 Rust tests, OK
cd app && npx tsc --noEmit              # clean
```

The original "Current Verification" snapshot below is from 2026-05-20 and is
preserved as a historical record. Do not rely on its numbers — refer to the
latest verification above.

## Current Verification (2026-05-20 — historical snapshot)

Commands run successfully:

```bash
python3 -m py_compile scripts/relationship_os.py
python3 scripts/relationship_os.py --env .env.example demo --reset
python3 scripts/relationship_os.py --env .env.example status
python3 scripts/relationship_os.py --env .env.example export-md --dry-run
python3 -m unittest tests/test_relationship_os.py
```

Unit test result:

```text
Ran 8 tests
OK
```

Current status output after demo reset:

```text
Relationship OS store: sqlite at data/relationship_os.sqlite3
Consultant views: csv
Rows: {'Contacts': 3, 'Touchpoints': 3, 'Reminders': 3, 'Daily Focus': 0, 'Settings': 9}
```

## Important Prior Context

Earlier live Telegram/Hermes testing revealed that Telegram slash commands can
be intercepted by the Hermes gateway before the Relationship OS agent sees
them. Runtime docs now instruct the consultant to use plain text commands:

- `status`
- `today`
- `prep Name`
- `export-md`
- `appointment-summary Contact Name [YYYY-MM-DD]`
- `proposal Contact Name Topic`
- `slides Contact Name Purpose`
- `writeup Topic`

Do not reintroduce slash-command instructions unless the gateway routing has
been deliberately changed and tested.

Earlier testing also showed that a fresh Hermes profile should be isolated from
the user's personal assistant profile and should be limited to the `terminal`
tool for this kit.

## Known Risks And Review Targets

Please review these carefully.

### 1. v2 Consultant Surface: Native Desktop App

**Status: open, scheduled as the next major build pass.**

The product is pivoting away from CSV / Google Sheets / Obsidian as
canonical consultant views. The v2 consultant-facing surface is a native
macOS desktop app (Tauri + React + shadcn/ui) that reads and writes the
same `data/relationship_os.sqlite3` as Hermes. Spec lives at
`app/SCOPING.md`.

This pivot dissolves the field-level reconcile / two-way sync project
that was previously scheduled here: both the app and Hermes write to the
same SQLite database with WAL mode handling concurrency. No diff/merge
logic is needed. The CSV / Sheets / Obsidian outputs are demoted to
optional *export* formats rather than the daily edit surface.

What stays from the kit:

- `scripts/relationship_os.py` as the Hermes-facing typed write API.
- The Touchpoint Extraction schema and Reminder Lifecycle commands in
  `SOUL.md`.
- The deliverable generators (appointment-summary, proposal, slides,
  writeup) — the app calls them by shelling out.
- The Events audit table — both writers (app + Hermes) emit events to
  it, becoming the unified history surface.
- All brand assets and design tokens.

What goes away:

- Field-level reconcile / `CONSULTANT_MANAGED_FIELDS` work — cancelled.
- "Polished consultant view tabs" (Today / Follow-Ups / Timeline /
  Health) inside Google Sheets — replaced by app screens.
- Incremental Sheets sync — moot since Sheets is no longer canonical.

Out-of-scope for the desktop app MVP (per `app/SCOPING.md`):

- Multi-consultant on one machine.
- Cloud sync, mobile companion, backups.
- Login or password protection.
- Telegram bot management UI.
- Windows / Linux support (revisit after macOS MVP).

Open work items live in `app/SCOPING.md` under "Build Phases" — seven
incremental phases, each independently verifiable. No time estimates;
ship a phase when its acceptance criteria are met.

### 2. Brand Asset Library Is Larger Than The Renderer Uses

**Status: partially resolved in pass 12 (section-based decks).**

11 of the kit's 33 brand image files are now wired into the renderer
(9 originals + 2 closing images added when the section-based deck work
landed). 22 files remain reserved for future use — closing-image
variants, alternative backgrounds, and the th25 campaign set.

The current renderer is still deterministic: every body slide of a given
scheme uses the same background watermark. The cover slide and closing
slide each use a single scheme-default image. To vary imagery across
slides (per-slide rotation) or to add campaign-themed schemes (e.g.
`awm-th25`), the script needs new knobs:

- A per-slide `background_asset` override in `add_ppt_slide`.
- A new entry in `SCHEME_BRAND_DEFAULTS` for the campaign scheme.
- (Already done for closing slides via `closing_background`.)

Review question: should the renderer gain a per-slide imagery knob before
v1, or is the current single-watermark per scheme intentional for the
"private FC operating aid" tone? The user's recommendation in the last
review was to keep the deterministic single-watermark default and only
add knobs when a real use case demands it.

### Closed In Previous Passes

These review-target sections from earlier handoff briefs have been
resolved and are no longer open questions. Listed here so a reviewer
doesn't waste time re-raising them.

- **Google Sheets semantics / `STORE=google` deprecation.** Closed in
  pass 13. Legacy `RELATIONSHIP_OS_STORE=google` mode now prints a
  stderr deprecation warning when selected and surfaces a
  `deprecated_store` line in `cmd_status`. `.env.example` documents the
  migration path. Behaviour preserved for existing setups; new setups are
  steered to SQLite.
- **Conflict / audit model.** Closed in pass 13. SQLite now has an
  append-only `Events` table (`touchpoint_logged`, `reminder_completed`,
  `reminder_snoozed`, `reminder_cancelled`, `contact_created`,
  `contact_updated`) with a `log_event` helper and an `events` query
  command. The Events table is intentionally excluded from
  consultant-view sync — it's diagnostic, not consultant-facing.
- **Setup UX.** Closed in pass 13 via `SETUP.md`, addressed to the
  consultant's helper AI agent (Claude Code, Codex CLI, etc.). The
  agent reads `SETUP.md`, prompts for the values, runs each phase, and
  verifies before moving on. `START_HERE.md` gained a "Setup With Your
  AI Agent" section as the primary recommended path. No setup wizard
  was built — the AI-guided path turned out to be both cheaper and more
  adaptive.

## Suggested Review Procedure

1. Read `SOUL.md`, `AGENTS.md`, and `README.md` first.
2. Inspect `scripts/relationship_os.py`, especially:
   - `SQLiteStore`
   - `get_store`
   - `consultant_view_modes`
   - `sync_consultant_views`
   - `cmd_init`
   - `TouchpointInput` and `touchpoint_input_from_dict` (validator)
   - `log_touchpoint` (the typed write core) and `cmd_log_touchpoint` (CLI)
   - `cmd_export_markdown`
3. Run the verification commands above.
4. Test each consultant-facing view mode:
   - `RELATIONSHIP_OS_CONSULTANT_VIEW=csv`
   - `RELATIONSHIP_OS_CONSULTANT_VIEW=obsidian`
   - `RELATIONSHIP_OS_CONSULTANT_VIEW=google` if credentials are available
5. Critique whether the product rule is now clear enough for future agents.
6. Flag any docs that still imply CSV or Google Sheets are canonical.

## What Not To Do During Review

- Do not add client-facing messaging features.
- Do not reintroduce Telegram slash-command instructions.
- Do not store credentials outside `.env`.
- Do not make PDF, slides, Apple Notes, or free-form Markdown the canonical
  store.
- Do not merge this with the user's personal Hermes assistant setup.

## Desired Outcome From Reviewer

Please return:

- Bugs or regressions found, with file and line references.
- Product concerns about the SQLite/view-layer architecture.
- Missing tests.
- Any confusing setup language.
- Recommendation on whether to keep, hide, or remove legacy CSV/Google store
  modes.
- A proposed next-step plan for making the consultant-facing Sheets/CSV/Markdown
  views more readable.
