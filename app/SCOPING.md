# AWM Relationship OS — Desktop App Scoping

This document specifies the v2 consultant-facing surface for the AWM
Relationship OS Kit: a local-only macOS desktop app that reads and writes
the kit's existing `data/relationship_os.sqlite3` directly. It replaces
CSV / Google Sheets / Obsidian as the *daily edit surface*; those formats
remain available as *export targets* but are no longer canonical.

This doc is written for Claude Code (or another coding agent) to build
against. The kit's existing Python code stays — Hermes still writes to
the same SQLite via `scripts/relationship_os.py`. The app is the
consultant's view when they're at their laptop; Hermes via Telegram
remains the on-the-go path. Both writers share the same database.

## Goals And Non-Goals

### Goals

- Replace the database-shaped CSV/Sheets view with a proper consultant UI:
  Today screen, contact detail with inline editing, touchpoint timeline,
  reminders board, generated-document browser.
- Concurrent SQLite access between the app and Hermes, with no merge
  logic. SQLite WAL mode handles this natively.
- Local-only operation. No cloud sync, no auth, no telemetry. The
  database file is the entire data surface.
- Reuse the kit's deliverable generation (PDF / PPTX / MD writeup) by
  shelling out to `scripts/relationship_os.py` from the app.
- Distribute as a single signed `.app` bundle that lives inside the kit
  folder under `app/dist/AWMRelationshipOS.app`.

### Non-goals (for MVP)

- Multi-consultant support on one machine. One database per laptop.
- Cloud sync, multi-device sync, mobile companion app.
- User authentication, password protection, encryption at rest.
- Direct Telegram bot management from the app.
- Plugin system or extensibility.
- Windows or Linux support (revisit after macOS MVP ships).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Tauri v2** | Rust backend, web frontend. Small bundle (~10 MB), native feel, low memory. |
| Frontend | **React 18 + Vite + TypeScript** | Standard, well-supported by Claude Code. |
| Component library | **shadcn/ui** (Radix + Tailwind) | Polished components without designing from scratch. Copy-paste model — no runtime dep. |
| Styling | **Tailwind CSS** | Required by shadcn/ui. |
| Routing | **React Router v6** | Familiar API, plenty of examples. |
| Data fetching | **TanStack Query** | Cache invalidation, polling, optimistic updates. |
| SQLite access | **`@tauri-apps/plugin-sql`** | Direct SQLite from the JS side. Open with `PRAGMA journal_mode=WAL`. |
| Forms | **React Hook Form + Zod** | Schema-validated forms matching the kit's enum lists. |
| Date/time | **date-fns** | Lightweight, immutable. |
| Icons | **lucide-react** | Comes with shadcn/ui examples. |

Reuse the kit's design tokens from `design.md` for colours and typography
where possible. Two themes: `awm-light` (default) and `awm-dark`. App
theme should match the kit's `RELATIONSHIP_OS_DESIGN_SCHEME` setting on
launch, with a toggle in Settings.

## Visual Reference

`app/design/` collects style references from the AWM Design System. Read
`app/design/README.md` first — it indexes everything. The main pieces:

- **`app/design/dark-reference.html`** — full dark-mode CRM dashboard
  mockup, single self-contained HTML file. Open in a browser to see the
  target visual feel.
- **`app/design/dark-reference-README.md`** — the designer's notes on
  the mockup: intended screens, components, colour rules.
- **`app/design/colors_and_type.css`** — canonical AWM CSS variables
  (dark scheme). Use as a source of truth alongside the kit's
  `design.md`.
- **`app/design/components/`** — 13 small per-component HTML files
  (buttons, badges, cards, forms, colours, type ramps, shadows,
  spacing, data-viz). These are copy-paste-ready recipes: each is a
  single self-contained HTML demonstrating one component family with
  its variants and the exact CSS that produces them.

Use these as a **style / component reference**, not a feature spec:

- **What to borrow:** colour palette (forest blacks, gold accent, cream
  text), typography pairing (Cormorant Garamond display + Barlow body +
  Barlow Condensed labels + JetBrains Mono numerics), sidebar layout
  pattern, panel/card treatments, the "stat card" component, table
  styling, tab patterns, search-box treatment, button styles, the
  general sense of "private, considered, slightly editorial" rather
  than "loud SaaS dashboard." The kit's existing `design.md` already
  defines the same tokens; the mockup is a worked example of how they
  compose into UI.
- **What NOT to borrow:** the *features* shown there. The mockup
  includes Total AUM / IRR / Pipeline / IUL / UL — those are US-style
  life-insurance and sales-pipeline concepts that don't match this
  kit's domain (the kit is intentionally not a pipeline tool; see
  `references/comparable-tools.md`). The mockup also has more top-level
  nav items than the MVP needs (Policies, Pipeline, Training, Calendar)
  — those are explicitly out-of-scope per the "What This Does Not
  Build" section below.

The mockup's nav items roughly map to MVP screens as follows:

| Mockup nav item | MVP screen | Notes |
|---|---|---|
| Dashboard | **Today** | Adopt the layout pattern; replace the AUM/IRR/Pipeline stats with reminders-due-now, needs-attention, today's touchpoints. |
| Clients | **Contacts list** | Adopt the table layout; replace policy/cash-value columns with type/stage/last-touch/pending-reminders. |
| Policies | *out of scope* | Policies are a free-text field on Contact records, not a separate top-level entity, for v1. |
| Pipeline | *out of scope* | Kit is deliberately not a sales-pipeline tool. |
| Presentations | **Documents browser** | Adopt the grid/card layout; surface `vault/Generated/` outputs. |
| Training | *out of scope* | |
| Calendar | *out of scope* | Calendar integration is a future module per SOUL.md. |
| Settings | **Settings** | Direct map. |

And these MVP screens have no direct mockup analogue (build from
scratch, using the same tokens and component vocabulary):

- Contact detail (the main daily-use page — touchpoint timeline + edit
  form for consultant-managed fields)
- Touchpoint detail
- Reminders board (kanban)
- Daily Focus editor

The mockup and all the per-component HTMLs are **dark mode only**. The
MVP must support both `awm-light` and `awm-dark`. Use the same
CSS-variable pattern the mockup uses (`:root { --forest: ...; }`) but
populate the variables from the kit's `design.md` per the active scheme.
Both schemes are defined in `design.md` as
`:root[data-scheme="awm-light"]` and `:root[data-scheme="awm-dark"]`
blocks.

To preview any reference file in a browser:
```bash
open app/design/dark-reference.html        # the main mockup
open app/design/components/buttons.html    # any component reference
```

Do not link to these files from the app itself; they are build-time
references for the coding agent.

## File Layout

```
Relationship OS Kit/                 # the existing kit folder
├── app/                              # NEW — desktop app lives here
│   ├── SCOPING.md                    # this file
│   ├── design/                       # style references (do not import directly)
│   │   ├── README.md                 # index of what's in this folder
│   │   ├── dark-reference.html       # full dark-mode CRM mockup
│   │   ├── dark-reference-README.md  # designer's notes on the mockup
│   │   ├── colors_and_type.css       # canonical AWM CSS variables (dark)
│   │   └── components/               # per-component pattern HTMLs (buttons, badges, forms, etc.)
│   ├── src-tauri/                    # Rust backend (auto-generated by Tauri CLI)
│   ├── src/                          # React frontend
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── routes/                   # one file per screen
│   │   │   ├── today.tsx
│   │   │   ├── contacts.tsx
│   │   │   ├── contact-detail.tsx
│   │   │   ├── touchpoint-detail.tsx
│   │   │   ├── reminders.tsx
│   │   │   ├── daily-focus.tsx
│   │   │   ├── documents.tsx
│   │   │   └── settings.tsx
│   │   ├── lib/
│   │   │   ├── db.ts                 # tauri-plugin-sql wrapper
│   │   │   ├── schema.ts             # TS types mirroring DATA_SCHEMA.md
│   │   │   ├── enums.ts              # VALID_TOUCHPOINT_TYPES, etc.
│   │   │   ├── events.ts             # event-table polling for change detection
│   │   │   └── deliver.ts            # shell-out helpers for PDF/PPTX/MD
│   │   ├── components/               # shared UI components
│   │   └── styles/
│   ├── public/                       # icons, splash
│   ├── tauri.conf.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── scripts/relationship_os.py        # unchanged
├── data/relationship_os.sqlite3      # SHARED with Hermes
├── ...                               # rest of the kit unchanged
```

The Tauri app launches with the kit folder as its working directory. The
SQLite path is `../data/relationship_os.sqlite3` relative to the app's
location, or resolved via `RELATIONSHIP_OS_DB_PATH` env var when set.

## Data Model

Source of truth: `data/relationship_os.sqlite3`. Schema is defined in
`DATA_SCHEMA.md` at the kit root. The app reads and writes the same
tables:

- `contacts` — one row per person.
- `touchpoints` — one row per interaction.
- `reminders` — pending / done / snoozed / cancelled follow-ups.
- `daily_focus` — consultant journal entries.
- `settings` — key/value preferences.
- `events` — append-only audit log. App polls this for change detection.

Field ownership (which both writers respect):

| Hermes-managed | Consultant-managed |
|---|---|
| `last_touch_date`, `relationship_stage`, `type`, `created_at`, `updated_at` | `phone`, `email`, `occupation`, `company`, `birthday`, `family`, `policies`, `financial_concerns`, `interests`, `referral_source`, `next_review_date`, `notes` |

The app's contact edit screen makes Hermes-managed fields **read-only**
(grayed out, with a tooltip explaining "this field is updated when you
log new touchpoints"). Consultant-managed fields are editable.

Touchpoint records are atomic — the app can view them but does not allow
editing the past beyond annotating `notes`. To log a new touchpoint from
the app, the consultant fills a form that calls the same Python
`log-touchpoint` API (shelled out) so the entry validates against the
exact same schema Hermes uses.

Reminder lifecycle commands (`complete-reminder`, `snooze-reminder`,
`cancel-reminder`) are also shelled out for the same reason — single
write path, consistent validation, single Events table row per state
change.

## Concurrency Model

Both the app and Hermes write to the same `data/relationship_os.sqlite3`.

- Open the database with `PRAGMA journal_mode=WAL` on app startup. The
  Python kit's `SQLiteStore.connect()` also sets WAL + FK explicitly, so
  the mode is set regardless of which writer opens the DB first.
- WAL allows one writer + many readers concurrently. SQLite handles
  serialization. No application-level locking required.
- Use `PRAGMA foreign_keys=ON` for safety (we currently don't enforce
  FKs in schema, but this is forward-compatible). Set by both writers
  on every connection (FK enforcement is per-connection, not persistent).
- A 5-second `busy_timeout` is set on both writers so write-vs-write
  contention waits briefly rather than erroring with "database is locked".
- The app polls the `events` table every 3 seconds for new rows since
  the last seen `id`. When new events arrive, invalidate the relevant
  TanStack Query caches:
  - `touchpoint_logged` → invalidate contacts + touchpoints + the
    affected contact's detail view.
  - `reminder_completed` / `reminder_snoozed` / `reminder_cancelled` →
    invalidate reminders.
  - `contact_created` → invalidate contacts list.
  - `contact_updated` → invalidate the affected contact's detail view.

Use `data_version` PRAGMA as a cheap "did anything change" check before
doing the full events poll; it bumps any time the database file's
content changes.

## Screens

8 screens for the MVP. Sidebar navigation on the left, screen content
on the right.

### 1. Today (home)

Default landing screen.

**Sections:**
- **Header:** today's date in the consultant's timezone, a "good morning, $name" greeting.
- **Reminders due now:** all pending reminders with `due_date <= today`. Sorted by priority (high → medium → low) then due date. Each shows contact name, context, priority chip, due date, and an inline "Mark done" button.
- **Needs attention:** contacts the script flags as cooling (warm/hot with no touchpoint in 30 days) or at-risk (client with no touchpoint in 60 days). Each links to the contact detail page.
- **Today's logged touchpoints:** anything logged today, sorted reverse-chronological. Shows the raw input + type + sentiment.
- **Quick log button (top-right):** opens a modal form to log a touchpoint manually from the app.

**Actions:**
- Mark reminder done → shells out to `complete-reminder --reminder-id <id>`.
- Click contact → navigate to contact detail.
- Quick log → opens touchpoint form modal; submit shells out to `log-touchpoint --json-file`.

### 2. Contacts list

**Layout:** searchable / filterable data table.

**Columns:**
- Name (links to contact detail).
- Type chip (client / prospect / candidate / advisor).
- Stage chip (cold / warming / warm / hot / client / inactive).
- Last touch date.
- Pending reminders count.
- Action: row click → contact detail.

**Filters:**
- Search box (matches name, occupation, company).
- Type filter (multi-select).
- Stage filter (multi-select).
- "Has pending reminders" toggle.

**Sorting:** by name (default), last touch date, stage urgency.

### 3. Contact detail

**Layout:** two-column. Left: contact fields (editable inline). Right: touchpoint timeline + reminders + generated documents.

**Left column — fields:**
- Name (read-only after creation; Hermes-managed).
- Type and stage chips with read-only labels (Hermes-managed; tooltip explains).
- Phone, email, occupation, company, birthday — editable text.
- Family, policies, financial_concerns, interests — editable multi-line. These are the "paste reference data here" fields.
- Referral source, next_review_date — editable.
- Notes — large editable multi-line at the bottom.
- Save button — writes changes to SQLite + writes a `contact_updated` event with the diff in the payload.

**Right column — three stacked panels:**

- **Touchpoint timeline.** Reverse-chronological. Each row: date, type chip, sentiment chip, summary, action items. Click expands inline to show raw_input and topics.

- **Pending reminders.** List of this contact's reminders with status filter (pending by default, optional "show all"). Each row: due date, priority, context, status, action buttons (Mark done / Snooze / Cancel).

- **Generated documents.** Browse files under `vault/Generated/{appointment_summary,proposal,slides,writeup}/` filtered by this contact. Click to open with the OS default app (via Tauri's `shell.open`).

**Top actions:**
- Generate Appointment Summary → shells out, then refreshes the documents panel.
- Generate Proposal → opens a small modal asking for topic, then shells out.
- Generate Slides → opens a modal asking for purpose + optional structured sections (see deck composition in SOUL.md); then shells out.

### 4. Touchpoint detail

Click a touchpoint from the timeline → open this view (or open it as a
modal/slide-over from the timeline; MVP can use a separate route).

Shows everything in the Touchpoints table for that row: date, type,
sentiment, summary, topics, action items, raw_input, meeting_number.

For MVP, this is read-only except for an "annotate" field that lets the
consultant add personal notes (stored in a new `notes` column on
Touchpoints? Or in a separate `touchpoint_notes` table to keep
Touchpoints atomic). **Decision needed during build — recommend adding a
`notes` column to the Touchpoints schema.**

### 5. Reminders board

**Layout:** kanban-style columns: `Pending`, `Due Today`, `Snoozed`, `Done (last 7 days)`.

Each card shows: contact name (link), context, priority chip, due date.
Drag to move between columns? Tier-2. For MVP, cards have button actions:
"Mark done", "Snooze (open date picker)", "Cancel".

Filter at top: by contact, by priority, by reminder type.

### 6. Daily Focus

Editor for the consultant's daily journal entry.

**Today's entry:** if a row exists for today's date, load it; otherwise
create a new one on first save.

Fields:
- Priority 1 / 2 / 3 (three text inputs).
- Follow-ups due (auto-populated from today's due reminders; read-only display).
- Reflection (large textarea).
- Bottlenecks (large textarea).
- Save button → writes to `daily_focus` table.

**History:** below today's entry, a collapsed list of previous Daily Focus
entries by date. Click to expand or open.

### 7. Documents browser

Browse `vault/Generated/` outputs across all contacts.

**Layout:** filter sidebar (type: appointment_summary / proposal / slides /
writeup; contact filter; date range), main pane is a grid of document
cards with thumbnail (where available — PDFs and PPTX previews from
`showcase_examples/previews/` pattern; for v1, just a type icon).

Click a card → open the file with OS default app.

### 8. Settings

- Consultant name and timezone (mirrored to `settings` table).
- Theme: awm-light / awm-dark.
- Connected view: which export format the kit syncs to (csv / google /
  obsidian / none) — defaults to `none` since the app replaces the view.
- Hermes connection status: poll for whether a Hermes gateway is running
  (check via process list or a small lock file). Show last-event-from-
  Hermes timestamp from the Events table.
- Database path (read-only, shows the resolved path).
- Open kit folder in Finder button.
- Open Hermes profile folder in Finder button.
- About: app version, kit version, link to README.

## Hermes Integration

The desktop app does **not** invoke Hermes. Hermes runs as its own
process (`hermes -p relationshiposdemo gateway run`) and writes to the
SQLite database through the same `scripts/relationship_os.py` entry
points. The app and Hermes are peer writers.

What the app does instead:

- **Polls `events` table** for cross-process change notifications.
- **Shells out to the Python kit** for any operation that needs the kit's
  validation logic: logging touchpoints, completing/snoozing/cancelling
  reminders, generating deliverables, exporting Markdown.

The Rust backend exposes a single Tauri command, `run_kit_command(args:
Vec<String>, json_payload: Option<String>) -> Result<String>`, which:

1. Resolves the kit folder relative to the app's location.
2. Constructs the command: `python3 scripts/relationship_os.py [args]`.
3. If `json_payload` is provided, writes it to a temp file and adds
   `--json-file <path>` to the args.
4. Executes the subprocess, captures stdout + stderr.
5. Returns the parsed JSON output on success, or an error string.

The frontend's `lib/deliver.ts` wraps this for typed access:
`generateAppointmentSummary(contactName: string, date?: string)`,
`logTouchpointFromForm(input: TouchpointInput)`, etc.

## Out-Of-Process Robustness

The app must not crash or corrupt the database when:

- Hermes writes concurrently. → WAL mode handles this.
- The user closes their laptop mid-write. → SQLite's atomic commit
  handles this; WAL ensures recovery on next open.
- The kit folder is moved/renamed while the app is running. → Detect via
  file-watch on the SQLite path; show a "kit not found" banner; pause
  writes.
- The Python interpreter is missing or the wrong version. → On first
  launch, run `python3 --version`. If not found or < 3.10, show an
  "install Python 3.10+" panel with macOS instructions.
- The user's database is corrupted. → Catch SQLite errors gracefully,
  surface a "your database appears corrupted; try restoring from
  `data/relationship_os.sqlite3.bak`" message.

## Build Phases (Suggested Order)

The MVP is best built in 7 incremental phases. Each phase produces a
running app — no big-bang integration at the end. No time estimates: ship
each phase when it satisfies its acceptance criteria, not on a clock.

### Phase 1: Scaffold + SQLite connection

- `npm create tauri-app@latest` with React + TypeScript template.
- Add Tailwind, shadcn/ui, React Router, TanStack Query.
- Install `@tauri-apps/plugin-sql`.
- Open the kit's SQLite database with `PRAGMA journal_mode=WAL`.
- Render a stubbed sidebar nav and an empty "Hello world" main pane.
- Acceptance: app builds, launches, connects to SQLite, prints row counts
  on the home screen.

### Phase 2: Contacts list + read-only contact detail

- Build the contacts table (Phase 2 screen) with search and filters.
- Click a row → contact detail screen with all fields displayed
  (read-only for now).
- Side panel shows touchpoint timeline (read-only) and pending reminders
  (read-only).
- Acceptance: from a fresh `demo --reset`, the app shows 3 contacts with
  their touchpoints and reminders correctly.

### Phase 3: Contact editing + write path

- Make the consultant-managed fields editable.
- Save button writes via direct SQLite UPDATE on consultant-managed
  fields only.
- Emit a `contact_updated` event row from the app's Rust side or via a
  shell-out to a new helper, whichever is simpler.
- Hermes-managed fields display as grayed-out with explanation tooltips.
- Acceptance: editing `policies` field in the app persists; restarting
  the app shows the saved value; running `python3 scripts/relationship_os.py
  --format=json events --kind contact_updated --limit 1` shows the event.

### Phase 4: Reminders board + lifecycle actions

- Build the kanban-style reminders board (Phase 5 screen).
- Mark done / snooze / cancel buttons shell out to the kit's lifecycle
  commands.
- After each action, refresh the board via TanStack Query invalidation.
- Acceptance: action buttons reliably update reminder status; Events
  table records each change; sidebar reminder badges update.

### Phase 5: Today screen + Daily Focus + events polling

- Build the Today home screen (Phase 1 screen).
- Build the Daily Focus editor (Phase 6 screen).
- Implement the Events table polling loop in the React app: on every
  poll, fetch new events, dispatch TanStack Query invalidations.
- Acceptance: log a touchpoint from Telegram (or from a separate kit
  CLI call); within 5 seconds, the Today screen reflects the new data
  without manual refresh.

### Phase 6: Deliverables panel + Documents browser

- Build the Documents browser (Phase 7 screen).
- Add the deliverable generation buttons to the contact detail screen.
- Each button opens a small form (where needed), then shells out to the
  Python kit, displays a progress spinner, refreshes the documents
  panel on success.
- Acceptance: clicking "Generate Appointment Summary" produces a PDF
  under `vault/Generated/appointment_summary/`; the Documents browser
  shows it; clicking it opens it in Preview.

### Phase 7: Polish + Touchpoint detail + Settings + packaging

- Build the Touchpoint detail view (Phase 4 screen).
- Build the Settings screen (Phase 8 screen).
- Theme switcher (awm-light / awm-dark).
- App icon design (use logo_dark.png as base).
- macOS code signing (requires Apple Developer account).
- Build via `tauri build` → produces `.dmg` under
  `app/src-tauri/target/release/bundle/dmg/`.
- Acceptance: signed `.dmg` installs cleanly on a fresh macOS user; app
  launches without "unidentified developer" warning; first-run works on
  a fresh kit checkout.

## Acceptance Criteria For MVP Ship

- All 8 screens function as specified.
- Hermes-written touchpoints, reminder lifecycle actions, and contact
  changes propagate to the open app within 5 seconds via events polling.
- App-initiated writes propagate to the SQLite database immediately and
  are visible to Hermes on its next read.
- Concurrent app and Hermes writes do not corrupt the database. Verified
  by `tests/test_concurrent_writes.py` (3 subprocess writers × 10 SQLite
  writes each, asserts no "database is locked" errors and WAL mode is
  set). A longer 30-minute soak test against the actual app is still
  recommended before each major release.
- `python3 -m unittest discover -s tests` still passes (no regression in
  the Python kit — currently 47 tests).
- `cd app && npm test` passes (currently 28 TypeScript tests covering
  `mutations.ts` and `polling.ts` — the JS business-logic layer).
- `cd app/src-tauri && cargo test` passes (currently 11 Rust tests
  covering `inject_json_file_arg`, `parse_generated_filename`, and the
  directory-setting validator).
- Signed `.dmg` installs on a fresh macOS user account without security
  warnings.
- Time-to-first-meaningful-screen on launch is under 2 seconds.
- Memory footprint under 200 MB at rest with the demo dataset loaded.

## What This Does Not Build (Explicitly)

These are out of MVP scope. They go in a v2 list:

- Multi-consultant on one machine.
- Cloud sync, multi-device sync, backups.
- A mobile companion app.
- Hermes setup or Telegram bot management UI.
- Login or password protection.
- Custom field types or schema extensibility.
- Plugins or scripting.
- Reports / analytics / charts.
- Search across notes content (just contact name search for MVP).
- Tags / labels.
- File attachments (e.g. dragging a PDF onto a contact). Files in
  `vault/Generated/` are browsable but consultants can't attach new
  files via the app in MVP.
- Two-way sync to Google Sheets / CSV / Obsidian. Those become export
  formats only. A "sync to Sheets" button can be added in v2 if
  consultants request it; for MVP, the app is the canonical view.
- Calendar integration.
- Custom design schemes beyond awm-light / awm-dark.
- Recruitment, advisor coaching, and policy detail modules. These are
  already future modules per `SOUL.md` and the existing data schema
  supports them — they can be added as views in v2 without schema
  changes.

## Notes For The Coding Agent

- **Read these kit files first before starting:** `DATA_SCHEMA.md`,
  `SOUL.md` (especially "Storage Interface" and "Reminder Lifecycle"
  sections), `scripts/relationship_os.py` (focus on the dataclasses,
  validators, and `VALID_*` enum sets), `design.md` (color tokens),
  and `app/design/dark-reference.html` (the visual reference — see the
  "Visual Reference" section above for what to borrow and what to
  ignore).
- **Mirror enum sets in TypeScript.** The kit's `VALID_TOUCHPOINT_TYPES`,
  `VALID_SENTIMENTS`, etc. should have matching TS const arrays in
  `app/src/lib/enums.ts`. Use Zod schemas built from these for form
  validation.
- **Don't reimplement business logic.** When in doubt, shell out. The
  Python kit is the source of truth for parsing, validation, and
  generation. The app is the UI.
- **Don't invent new schema columns** without updating
  `DATA_SCHEMA.md` and adding the column to `HEADERS` in
  `scripts/relationship_os.py`. The one schema change explicitly
  contemplated is a `notes` column on the Touchpoints table for the
  Touchpoint detail screen — if added, update both the kit and the app
  in the same change.
- **Test with `python3 scripts/relationship_os.py demo --reset` data.**
  That seeds three realistic contacts with touchpoints and reminders.
- **Brand assets** live in `assets/`. Use `logo_dark.png` as the app
  icon base. Generate the `.icns` during the build.
- **Keep the app folder self-contained.** Do not modify files outside
  `app/` without explicit reason. The Python kit should keep working
  identically with or without the app present.
