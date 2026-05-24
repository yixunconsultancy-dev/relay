# AWMOS App Bug Fix Brief for Claude Code

Original brief: 2026-05-21
Fix pass applied: 2026-05-21 (Claude Opus 4.7)
Latest pass: 2026-05-24 (post-review polish — see below)

## Post-Review Polish Pass — 2026-05-24

After running the three plan reviews (`/plan-eng-review`, `/plan-design-review`,
`/plan-ceo-review`) against the as-built architecture, a small follow-up pass
landed six items:

1. **Python kit WAL/FK fix.** `scripts/relationship_os.py:SQLiteStore.connect()`
   now sets `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON` in
   addition to `busy_timeout=5000`. Previously only the app set WAL — if Hermes
   ever opened a fresh database before the app did, the journal mode would
   default to `delete` and concurrent writers serialized on the file lock.
   Now closed at the source.
2. **AWM-toned status colors.** `app/src/styles/globals.css` `--status-success`
   / `--status-error` / `--status-info` swapped from Material Design defaults
   (#4CAF50 / #E57373 / #00BCD4 cyan) to AWM tones per `design.md`: moss
   (#7A8F62), clay (#B85C52), and gold (cyan removed — explicitly forbidden by
   `design.md:72`). Propagates to CLIENT/ADVISOR/DONE chips (now moss),
   HOT/negative-sentiment chips (now clay), PROSPECT/CANDIDATE/SNOOZED chips
   (now gold).
3. **Reference doc supersession banner.** `app/design/dark-reference-README.md`
   now opens with a banner noting that the forest-green palette is superseded
   by `design.md`'s true-black scheme — borrow the layout patterns, not the
   colors.
4. **`dispatchInvalidations` exported.** Was file-internal in
   `app/src/lib/polling.ts`. Exported so it can be unit-tested.
5. **vitest set up.** Installed vitest@4.1.7, added `vitest.config.ts` (shares
   the `@/` alias with `vite.config.ts`), added `npm test` / `npm run
   test:watch` scripts. Wrote `app/src/lib/mutations.test.ts` (13 tests
   covering diff logic, event payload shape, transaction wrap, MAX_NOTE_LENGTH
   guard) and `app/src/lib/polling.test.ts` (15 tests covering
   `dispatchInvalidations` per-EventKind). **28 TS tests in a layer that had
   0 before.**
6. **Concurrent-write soak test.** New `tests/test_concurrent_writes.py`
   spawns 3 Python subprocess writers × 10 SQLite writes each. Verifies no
   "database is locked" errors and that WAL mode is set. Closes the SCOPING.md
   acceptance criteria #4 gap (was previously untested).

Verification after this pass:
- `python3 -m unittest discover -s tests` → 47 tests, OK (was 46)
- `cd app/src-tauri && cargo test` → 11 tests, OK (unchanged)
- `cd app && npm test` → 28 tests, 2 files, OK (new)
- `cd app && npx tsc --noEmit` → clean

Test count totals across the codebase: **Python 47 / Rust 11 / TypeScript 28**.

This brief merges two review passes:

1. Static codebase review of the Tauri/React app and Python kit integration.
2. Live Computer Use QA of the installed macOS app at `/Applications/AWMOS.app`.

The live app auto-located this kit root and used `data/relationship_os.sqlite3`.
No persistent test data was intentionally written during QA; the Quick Log write
failed before committing.

## Status Snapshot

| # | Priority | Item | Status |
|---|---|---|---|
| 1 | P1 | Quick Log argparse error | ✅ Fixed |
| 2 | P1 | Event polling can miss writes | ✅ Fixed |
| 3 | P1 | DMG bundling failure | ✅ Fixed |
| 4 | P2 | Reminders count includes hidden | ✅ Fixed |
| 5 | P2 | Documents date inputs look active | ✅ Fixed |
| 6 | P2 | App direct writes bypass events | ✅ Resolved (policy documented) |
| 7 | P2 | Generated document contact matching | ✅ Fixed |
| 8 | P2 | Remote Google Fonts imported | ✅ Fixed (bundled locally) |
| 9 | P3 | Contacts empty state is developer-facing | ✅ Fixed |
| 10 | P3 | Hermes status exposes raw event source | ✅ Fixed |
| 11 | P3 | Documents search only checks filename | ✅ Fixed |
| 12 | P3 | Installed app accessibility | ⚠ Spot checks only |
| 13 | P3 | Repo and build hygiene | ✅ Already clean |

Extras caught during the same pass:

| Item | Status |
|---|---|
| Rules-of-Hooks violation in `contact-detail.tsx` | ✅ Fixed |
| No Rust unit tests for argv / filename parsing | ✅ Added 10 tests |
| Events/audit policy was undocumented | ✅ Documented in `mutations.ts` |
| Generated document Open buttons no-op | ✅ Fixed by Codex follow-up |
| Quick Log argv helper brittle with top-level option values | ✅ Fixed by Codex follow-up |

## Codex Re-Review Notes

Re-reviewed after Claude's fix pass on 2026-05-21.

Verification results:

- `python3 -m unittest tests/test_relationship_os.py` passed: 17 tests OK.
- `cd app/src-tauri && cargo test` passed: 12 tests OK.
- `cd app/src-tauri && cargo check` passed.
- `cd app && npm run build` passed.
- `cd app && npm run build:app` passed and produced the `.app` bundle.
- `cd app && npm run tauri build -- --bundles dmg` passed when run with normal
  macOS `hdiutil` device access and produced
  `src-tauri/target/release/bundle/dmg/AWMOS_0.1.0_aarch64.dmg`.

DMG notes:

- Added `app/scripts/cleanup-dmg-state.sh`, wired into
  `tauri.conf.json` as `beforeBundleCommand`, so raw Tauri bundling cleans
  stale AWMOS DMG state before packaging.
- Added `app/scripts/build-dmg.sh` and `npm run build:dmg` as the preferred
  repeatable build command; it cleans stale state, runs the Tauri DMG target,
  and retries once after cleanup if needed.
- The stale mounted images seen during the failed rerun were:
  - `/Volumes/AWMOS`
  - `/Volumes/dmg.4wNRIG`
- In Codex's sandbox, `hdiutil create` can fail with `Device not configured`
  unless run with escalated macOS device access. In a normal terminal, or in
  Codex with escalation, the DMG command now completes.

Residual robustness note:

- `inject_json_file_arg` now skips known top-level options and their values
  (`--env`, `--format`, and `--key=value` forms) before inserting
  `--json-file` after the subcommand.
- Tests cover the current Quick Log caller shape and future shapes like
  `["--env", ".env", "--format=json", "log-touchpoint"]`,
  `["--format", "json", "log-touchpoint"]`, and an env value that happens to
  match a command name.

Document-open follow-up:

- Repro: in the installed app, open Demo Client, scroll to Generated
  Documents, click Open on an existing `.md` or `.pdf`. The button produced no
  visible result even though documents existed.
- Fix: added Rust command `open_generated_document`, which resolves the kit
  root, canonicalizes the target, refuses paths outside `vault/Generated`, and
  opens the file with macOS `open`.
- Frontend now awaits the open call in both contact detail and the Documents
  page, shows an `Opening` state, and surfaces failures instead of silently
  doing nothing.
- Verification on 2026-05-21 with Computer Use against
  `/Applications/AWMOS.app`: clicking Open on `2026-05-20 demo-client.md`
  opened TextEdit; clicking Open on `2026-05-19 demo-client.pdf` opened
  Preview.
- Install helper: `cd app && npm run build:app` builds the local `.app`;
  `cd app && bash scripts/install-local-app.sh` copies it to
  `/Applications/AWMOS.app` and opens it.

## Codex Hardening Pass — 2026-05-21

Follow-up after Claude's "Tier 1 consultant trust / data integrity" critique.

Implemented:

- Added Python contract coverage for reminder lifecycle commands:
  `complete-reminder`, `snooze-reminder`, `cancel-reminder`.
- Added Python coverage for `events` filtering by contact, kind, since-date,
  and limit.
- Added Python coverage proving SQLite `notes` columns round-trip into the CSV
  consultant-facing mirror when the kit syncs views.
- Added a bounded `fetchLatestExternalEvent()` query for Settings → Hermes
  status, replacing the full events-table scan every 10 seconds.
- Added sync health signaling for `useEventPoller`: after 3 consecutive poll
  failures the app shows a top banner and sidebar status instead of silently
  going stale.
- Hardened Finder-launched Python discovery by prepending pyenv/asdf shims
  alongside Homebrew paths before spawning `relationship_os.py`.
- Scoped Quick Log cache invalidation to contacts, touchpoints, reminders,
  pending reminder counts, and daily focus instead of invalidating the entire
  TanStack Query cache.
- Added Settings → Vault directory validation through a Rust Tauri command.
  Relative paths resolve against the kit root; absolute paths and `~/...` are
  accepted; missing explicit directories block save with visible feedback.
- Added Contact Detail → reminder history toggle so consultants can switch
  between pending reminders and all reminder statuses for that contact.
- Moved touchpoint-note writes into `mutations.ts` with an 8,000 character
  validation guard. The audit policy still treats touchpoint notes as private
  annotations, not Hermes-visible events.
- Added `.gitignore` hygiene for `data/relationship_os.sqlite3*`,
  `vault/Generated/`, and app `*.dmg` files.

Verification for this pass:

- `python3 -m unittest tests/test_relationship_os.py` → 17 tests OK.
- `cd app/src-tauri && cargo test` → 12 tests OK.
- `cd app/src-tauri && cargo check` → passed.
- `cd app && npm run build` → passed.

Deferred at that point:

- React ErrorBoundary (addressed in the polish pass below).
- Timezone helper; `todayIso()` still used browser-local date (addressed in
  the polish pass below).
- No contact-id metadata embedded in generated document filenames/sidecars yet.
- No Apple Developer signing/notarization work.

## Codex Polish Pass — 2026-05-21

Follow-up to Claude's review of the hardening pass.

Implemented:

- Added a route-level React `ErrorBoundary` so one render failure shows a
  recoverable fallback instead of crashing the whole window.
- Added full-error hover text to the sync-paused banner.
- Made `publishSyncStatus` skip identical status payloads and adjusted polling
  so healthy no-change ticks do not dispatch a fresh UI event every 3 seconds.
- Changed the initial successful poll to publish `Synced just now`, so the
  sidebar does not stay stuck on `Sync starting` when the database is quiet.
- Also treats paused-to-healthy recovery as a fresh sync event, even when the
  database version did not change while polling was down.
- Removed the unused `app:touchpoint-note` display label because touchpoint
  note writes remain deliberately unaudited.
- Updated the `mutations.ts` audit-policy comment to mention the centralized
  8,000-character notes guard.
- Added timezone-aware `todayIso(timezone)` using the consultant's
  `settings.timezone`, with browser-local fallback for invalid zones.
- Wired timezone-aware dates into Today, Daily Focus, Reminders, and Quick Log
  default touchpoint dates.
- Added reminder snooze defaults by priority: high = +1 day, medium = +3 days,
  low/blank = +7 days.

Verification for this pass:

- `cd app && npm run build` → passed.
- `cd app/src-tauri && cargo test` → 12 tests OK.
- `python3 -m unittest tests/test_relationship_os.py` → 17 tests OK.
- `cd app && npm run audit` → found 0 vulnerabilities. The first attempt from
  Codex sandbox failed DNS to npm; rerun with registry access passed.

Still future work:

- No visual Computer Use QA of the new ErrorBoundary/sync banner/timezone UI.
- No generated-document `contact_id` metadata/sidecar yet.
- No Apple Developer signing/notarization work.

## Executive Summary

The local CRM direction is viable and worth continuing. The app launches, finds
the kit, reads contacts, reminders, documents, settings, and supports basic
filtering. The main blockers were integration reliability and trust polish:

- Quick Log was broken in the installed app.
- Event polling could miss external Hermes/CLI writes.
- DMG packaging did not complete.
- Several UI counts/filters/status labels could mislead consultants.
- Some local-only/privacy and audit/event assumptions needed tightening.

Most P1 and P2 items above are resolved. Codex re-review found that the app
bundle builds, but DMG packaging still fails in this environment; see notes
above.

## Priority Fixes

### P1: Quick Log was broken in the installed app — FIXED

Original repro:

1. Open AWMOS.
2. Go to Today.
3. Click Quick Log.
4. Fill required fields:
   - Contact: `QA Consultant Test`
   - Summary: any valid summary
5. Click Log Touchpoint.
6. App showed an argparse error:
   - `relationship_os.py --format=json log-touchpoint exited 2`
   - The temp JSON file path was treated as the command.

Cause:

- `app/src/lib/kit.ts:139` calls `runKit(["--format=json", "log-touchpoint"], payload)`.
- The old `app/src-tauri/src/lib.rs::run_kit_command` assumed `args[0]` was the
  subcommand, removed it, and inserted `--json-file` after the first arg
  blindly. With `args[0] == "--format=json"`, the resulting argv became:
  - `--format=json --json-file <tmp.json> log-touchpoint`
- Argparse rejected `--json-file` at the top-level parser.

Fix:

- Extracted argv construction into `inject_json_file_arg(args, path)` in
  `app/src-tauri/src/lib.rs`. The helper finds the first positional (non-`--`)
  argument and inserts `--json-file <path>` immediately after it.
- Resulting argv shape: `--format=json log-touchpoint --json-file <tmp.json>`,
  which argparse accepts.
- 4 unit tests cover: global flag present, no global flag, subcommand with its
  own options, missing-subcommand fallback.

Where:

- `app/src-tauri/src/lib.rs` — `inject_json_file_arg` helper + tests
- Caller path unchanged (`app/src/lib/kit.ts`, `app/src/components/quick-log-dialog.tsx`)

How to verify:

```bash
cd "<kit-root>"
cd app/src-tauri && cargo test inject_json_file_arg
# Smoke test against a temp DB
cp data/relationship_os.sqlite3 /tmp/awmos_test.sqlite3
cat > /tmp/payload.json <<'JSON'
{"contact_name":"Smoketest","touch_date":"2026-05-21","touchpoint_type":"meeting","sentiment":"neutral","summary":"argv reaches kit cleanly","raw_input":"argv reaches kit cleanly","topics":["smoketest"]}
JSON
cd .. && RELATIONSHIP_OS_DB_PATH=/tmp/awmos_test.sqlite3 \
  python3 scripts/relationship_os.py --format=json log-touchpoint --json-file /tmp/payload.json
# expect: {"ok": true, ...}
```

### P1: Event polling could miss Hermes/CLI writes — FIXED

Original finding:

- `app/src/lib/queries.ts:144-164` fetched events using `WHERE id > $1`.
- `app/src/lib/polling.ts:91-104` stored the last event `id` as cursor.
- `scripts/relationship_os.py:1536-1546` generates event ids like
  `e_YYYYMMDD_<random4>`.

Problem:

Event ids are random-suffixed text, not monotonic. A newer event could sort
behind the current cursor and never refresh the app.

Fix:

- Polling cursor switched from the public `id` (text, non-monotonic) to
  SQLite's implicit `rowid` (integer, monotonic per `INSERT`).
- `fetchEventsSince` now selects via `WHERE rowid > $1 ORDER BY rowid ASC` and
  returns a `rowid` field on each event row.
- `fetchLatestEventSeq` returns `MAX(rowid)` for seeding the cursor at boot.
- `EventRow` type in `app/src/lib/schema.ts` extended with `rowid: number`.
- Polling state in `app/src/lib/polling.ts` changed from `string | null`
  cursor to `number | null` cursor.
- The events table is not `WITHOUT ROWID`, so the implicit rowid is available
  without a schema change. The public `id` is preserved as the stable
  external identifier.

Where:

- `app/src/lib/queries.ts` — `fetchEventsSince`, `fetchLatestEventSeq`, `EVENT_COLS`
- `app/src/lib/polling.ts` — cursor type + assignment
- `app/src/lib/schema.ts` — `EventRow.rowid`

How to verify:

```bash
sqlite3 data/relationship_os.sqlite3 \
  "SELECT rowid, id FROM events ORDER BY rowid DESC LIMIT 5"
# rowids are 7, 6, 5, ... regardless of id suffix ordering.
```

### P1: `npm run tauri build` failed at DMG bundling — FIXED

Current status:

- `npm run build` passes.
- `cargo check` passes.
- `python3 -m unittest tests/test_relationship_os.py` passes (14/14).
- `npm run tauri build -- --bundles dmg` completes and produces:
  - `app/src-tauri/target/release/bundle/dmg/AWMOS_0.1.0_aarch64.dmg` (~7.4 MB)
- `app/src-tauri/tauri.conf.json` keeps `targets: ["app", "dmg"]`.
- `app/src-tauri/tauri.conf.json` also runs
  `bash scripts/cleanup-dmg-state.sh` before bundling, so the raw Tauri command
  gets stale-mount cleanup.
- `npm run build:dmg` is the preferred project script because it also retries
  once after cleanup.

The original failure was a combination of stale mounted AWMOS DMG volumes and
macOS `hdiutil` device access. Running inside a sandbox without device access
can still fail with `hdiutil: create failed - Device not configured`; running
from a normal Terminal, or approving elevated execution in Codex, completes.

How to verify:

```bash
cd app
npm run build:dmg
npm run tauri build -- --bundles dmg
ls -la src-tauri/target/release/bundle/dmg/
```

## P2 Product and Data Integrity Issues

### P2: Reminders count included hidden cancelled reminders — FIXED

Original repro:

1. Open Reminders.
2. Header said `3 total`.
3. Board displayed only 2 pending reminders.
4. SQLite confirmed:
   - `pending|2`
   - `cancelled|1`

Cause:

- `app/src/routes/reminders.tsx:56` hides cancelled reminders.
- `app/src/routes/reminders.tsx:150` showed `filtered.length`, which included
  hidden cancelled rows.

Fix:

- Compute `visibleCount` = sum of the four bucket lengths (`due_today`,
  `pending`, `snoozed`, `done`).
- Compute `hiddenCount` = `filtered.length - visibleCount` (cancelled + old done).
- Header now reads `2 reminders · 1 hidden (cancelled or older than 7d)`.

Where:

- `app/src/routes/reminders.tsx` — `visibleCount`, `hiddenCount`, header copy

### P2: Documents date fields looked active when they were not — FIXED

Original repro:

1. Open Documents.
2. Date inputs visually showed `21/05/2026`.
3. Documents from 19 May and 20 May still appeared.

Cause:

- `app/src/routes/documents.tsx:41-42` initialized `fromDate` and `toDate` as
  empty strings.
- Native `<input type="date">` in WKWebView showed today's date as a faint
  placeholder when empty, making the filter look active.

Fix:

- New `DateInput` wrapper in `app/src/routes/documents.tsx`:
  - Renders as `<input type="text" readonly>` with placeholder `From (any)` /
    `To (any)` when empty, switches to `type="date"` on focus.
  - When a date is set, the input has a gold border and a per-input `×`
    button to clear it.
- Below the two inputs, an explicit `Filter active from X to Y` indicator
  shows when either date is populated.

Where:

- `app/src/routes/documents.tsx` — `DateInput` wrapper, active filter hint

### P2: App direct writes bypassed the Events/audit model — RESOLVED

Original finding:

Direct app writes did not append Events rows:

- `app/src/routes/daily-focus.tsx`
- `app/src/routes/settings.tsx`
- `app/src/routes/touchpoint-detail.tsx`

But `scripts/relationship_os.py:54-57` says durable writes should record an
Events row.

Resolution:

Policy is now explicit and documented in `app/src/lib/mutations.ts` (file
header):

- **Audited** writes that another peer process might care about:
  - `contact_updated` (emitted by the app, source `app:edit-contact`)
  - `touchpoint_logged` / `reminder_*` (emitted by the Python CLI on the
    app's shell-out)
- **Not audited** (intentionally local-only):
  - `daily_focus` rows (consultant's private journal, single writer)
  - `settings` rows (per-machine UI preferences)
  - `touchpoints.notes` column (annotation on existing touchpoint, not part
    of the kit's touchpoint contract)

If any of these later need cross-process polling, the comment instructs to
extend `VALID_EVENT_KINDS` in `scripts/relationship_os.py` first, then add
the matching INSERT.

Where:

- `app/src/lib/mutations.ts` — policy comment at top of file
- `app/src/routes/settings.tsx::formatEventSourceLabel` — recognizes known
  app-sourced event labels. The earlier prospective `app:touchpoint-note`
  label was removed in the polish pass because touchpoint notes remain
  deliberately unaudited.

### P2: Generated document contact matching was too loose — FIXED

Original finding:

- `app/src-tauri/src/lib.rs:380-398` parsed generated filenames and truncated
  the contact slug at the first hyphen after the date.
- Example:
  - `2026-05-19 demo-client-retirement-planning.pdf`
  - Parsed contact slug became `demo`, not `demo-client`.
- `app/src/routes/contact-detail.tsx:155-159` used prefix matching, which
  also matched the wrong contact when names shared a prefix.

Fix:

- `parse_generated_filename` in `app/src-tauri/src/lib.rs` now returns the
  full slug-portion (everything between the date and the extension). No
  first-hyphen truncation.
- New `matchContactSlug(documentSlug, knownSlugs)` in
  `app/src/lib/documents.ts` does longest-prefix matching against the known
  contact slug list.
- `app/src/routes/contact-detail.tsx` builds the known-slug list from
  `useContacts()` and filters generated documents by `matchContactSlug(...)
  === contactSlugValue`.
- `app/src/routes/documents.tsx` builds a slug→name map, uses
  `matchContactSlug` per document, and the Contact filter dropdown now shows
  real contact names (only those with generated documents) instead of
  raw slugs.
- 2 Rust unit tests cover the compound-slug and no-extension cases.

Where:

- `app/src-tauri/src/lib.rs` — `parse_generated_filename` + tests
- `app/src/lib/documents.ts` — `matchContactSlug`, `documentBelongsToContact`
- `app/src/routes/contact-detail.tsx` — uses `matchContactSlug`
- `app/src/routes/documents.tsx` — slug→name map, dropdown, filter

### P2: Local-only privacy story imported remote Google Fonts — FIXED

Original finding:

- `app/src/styles/globals.css:1` imported Google Fonts remotely.

Fix:

- Installed `@fontsource/cormorant-garamond`, `@fontsource/barlow`,
  `@fontsource/barlow-condensed`, and `@fontsource/jetbrains-mono`.
- `app/src/main.tsx` imports the specific weight CSS files Fontsource ships
  (matching the previous Google Fonts request: Cormorant Garamond
  300/400/500/600/700 + 400i/600i, Barlow 300–700, Barlow Condensed 400–700,
  JetBrains Mono 400/500/600).
- `app/src/styles/globals.css` removed the `@import url('https://fonts.googleapis…')`.
- Build now emits 30-odd woff2/woff files into `dist/assets/` — fonts ship
  with the app bundle and load via relative URLs. Zero outbound network at
  runtime.

Where:

- `app/package.json` — `@fontsource/*` deps
- `app/src/main.tsx` — local font imports
- `app/src/styles/globals.css` — comment replacing the old `@import url(...)`

## P3 UX Polish and Trust Issues

### P3: Contacts empty state was developer-facing — FIXED

Original repro:

1. Go to Contacts.
2. Search for `zzzz`.
3. Empty state told the user to run:
   - `python3 scripts/relationship_os.py demo --reset`

Cause:

- `app/src/routes/contacts.tsx:164-168` displayed developer setup guidance.

Fix:

- Two distinct empty states in `app/src/routes/contacts.tsx`:
  - `total === 0` ("No contacts yet."): suggests Hermes Telegram input with
    a worked example sentence.
  - `total > 0` and filters exclude everything: "No contacts match these
    filters. Clear search or adjust filters to see your N contacts."
- No terminal commands in either case.

Where:

- `app/src/routes/contacts.tsx` — empty state branch

### P3: Hermes status exposed raw internal event source — FIXED

Original repro:

1. Go to Settings.
2. Hermes Connection showed `Recently active` with badge `CANCEL-REMINDER`.

Cause:

- `app/src/routes/settings.tsx:315-317` rendered
  `hermes.data.lastEvent.source` directly. The Badge component
  uppercases its content.

Fix:

- `formatEventSourceLabel(source)` in `app/src/routes/settings.tsx` maps:
  - `log-touchpoint` → `Touchpoint logged`
  - `complete-reminder` → `Reminder completed`
  - `snooze-reminder` → `Reminder snoozed`
  - `cancel-reminder` → `Reminder cancelled`
  - `app:edit-contact` → `Contact edited` (and prospective `app:*` labels)
  - Unknown: strips `app:` prefix and Title-cases the rest.
- Badge now shows the human label; the raw source is still available on
  hover via the `title` attribute (useful when debugging without exposing
  internals to end users).

Where:

- `app/src/routes/settings.tsx` — `formatEventSourceLabel`, badge usage

### P3: Documents search only checked filename — FIXED

Original repro:

1. Open Documents.
2. Search `proposal`.
3. Returned 0 results even with Proposal documents visible.

Cause:

- `app/src/routes/documents.tsx:61` only checked `d.filename`.

Fix:

- Search haystack now includes:
  - `d.filename`
  - `d.kind` (e.g. `proposal`)
  - `DOCUMENT_KIND_LABEL[d.kind]` (e.g. `Proposal`)
  - `d.contact_slug` (raw filename slug portion)
  - matched contact name (from longest-prefix slug match)
  - file extension
- Placeholder text updated to `Search filename, type, contact…`.

Where:

- `app/src/routes/documents.tsx` — `filtered` useMemo, search input placeholder

### P3: Installed app accessibility/click behavior is uneven — SPOT CHECKS ONLY

Original observation:

- Some coordinate clicks through Computer Use returned `noWindowsAvailable`.
- Keyboard navigation worked better.
- Direct element clicking was inconsistent across table rows.

Status:

Not exhaustively tested in this pass. Spot-checked the components most
likely to be a problem:

- `app/src/components/ui/button.tsx` — real `<button>` elements with focus
  rings.
- `app/src/components/ui/dialog.tsx` — Radix Dialog (good a11y defaults).
- `app/src/routes/contacts.tsx` — table rows use `<Link>` with `aria-label`,
  chevron button has its own labelled link.
- `app/src/routes/reminders.tsx` — action buttons (Done / Snooze / Cancel)
  are real buttons with text labels.

A future pass should do a full keyboard-only walk-through. The
`noWindowsAvailable` symptom is more about Tauri/macOS window enumeration
than React a11y; addressing it would require Tauri-side changes
(activation policy, window class hints).

## P3 Repo and Build Hygiene — CLEAN

Observed in workspace:

- `app/node_modules`
- `app/dist`
- `app/src-tauri/target`
- Generated bundle outputs and mounted DMG artifacts appear in the project tree.

Status:

`app/.gitignore` already excludes `node_modules`, `dist`, `dist-ssr`,
`src-tauri/target`, `.DS_Store`, and editor scratch dirs. Build outputs
land under `src-tauri/target/release/bundle/`, which is ignored.

## Extras Caught During the Fix Pass

### Rules-of-Hooks violation in `contact-detail.tsx` — FIXED

`useGeneratedDocuments()` (and the new `useContacts()` added during the
slug-matching fix) were being called after the component's early returns
for `contact.isPending` / `isError` / no-data. Different render paths
produced different hook counts, which React Strict Mode would flag.

Fix: moved all `useQuery` / `useMemo` hook calls to the top of
`ContactDetailRoute`, before any early return. `contactSlugValue` is now
derived defensively (`contact.data ? contactSlug(contact.data.name) : ""`)
so the memo can run before the data has loaded.

Where:

- `app/src/routes/contact-detail.tsx` — hook order

### Rust unit tests added

7 unit tests in `app/src-tauri/src/lib.rs`:

- `injects_json_file_after_subcommand_when_global_flag_present`
- `injects_json_file_after_subcommand_with_no_global_flag`
- `injects_json_file_before_subcommand_options`
- `appends_json_file_when_no_subcommand`
- `parses_filename_with_compound_contact_slug`
- `parses_filename_without_extension`
- `returns_none_for_unrecognized_filename`

Run with `cd app/src-tauri && cargo test`.

## Suggested Re-Review Order for Codex

1. Argv construction — `inject_json_file_arg` + tests in
   `app/src-tauri/src/lib.rs`. Confirm the 4 argv test cases match
   actual caller shapes from `app/src/lib/kit.ts`.
2. Polling cursor — chase `EventRow.rowid` through
   `app/src/lib/schema.ts` → `queries.ts` → `polling.ts`. Verify no other
   caller of `fetchEventsSince` / `fetchLatestEventSeq` relies on the old
   id-string cursor shape.
3. Document slug matching — `parse_generated_filename` returns the full
   slug now. Confirm both `app/src/routes/contact-detail.tsx` and
   `app/src/routes/documents.tsx` consume it via `matchContactSlug` and
   that no other consumer of `d.contact_slug` still expects the first-hyphen
   slug.
4. Hooks order in `app/src/routes/contact-detail.tsx`. Confirm all
   `useQuery` / `useMemo` calls precede the `if (contact.isPending)` etc.
   early returns.
5. Events/audit policy comment in `app/src/lib/mutations.ts` matches what
   the app actually does.
6. Local fonts — `app/src/main.tsx` imports + no remaining `@import url(...)`
   anywhere under `app/src/`.

## Verification Commands

Run from kit root unless noted:

```bash
python3 -m unittest discover -s tests
# Expect: 47 tests, OK (46 unit tests + 1 concurrent-write soak test)
```

Run from `app`:

```bash
npm run build
# Expect: tsc + vite both clean

npm test
# Expect: 28 tests, 2 files (mutations.test.ts + polling.test.ts)

npm run tauri build -- --bundles dmg
# Expect: builds the .app and the DMG under
# src-tauri/target/release/bundle/{macos,dmg}/
```

Run from `app/src-tauri`:

```bash
cargo check
cargo test
# Expect: 11 unit tests pass
```

Useful SQLite checks:

```bash
sqlite3 data/relationship_os.sqlite3 \
  "select status, count(*) from reminders group by status order by status"
# Confirms the cancelled-row gap the visible-count header now handles.

sqlite3 data/relationship_os.sqlite3 \
  "select rowid, id, kind, timestamp, source from events order by rowid desc limit 10"
# Confirms rowid is monotonic; id suffixes can be in any order.
```

Quick Log end-to-end (against a temp DB to avoid touching the working set):

```bash
cp data/relationship_os.sqlite3 /tmp/awmos_test.sqlite3
cat > /tmp/payload.json <<'JSON'
{
  "contact_name": "Smoketest",
  "touch_date": "2026-05-21",
  "touchpoint_type": "meeting",
  "sentiment": "neutral",
  "summary": "argv reaches kit cleanly",
  "raw_input": "argv reaches kit cleanly",
  "topics": ["smoketest"]
}
JSON
RELATIONSHIP_OS_DB_PATH=/tmp/awmos_test.sqlite3 \
  python3 scripts/relationship_os.py --format=json log-touchpoint \
  --json-file /tmp/payload.json
# Expect: {"ok": true, "contact": {...}, "touchpoint": {...}, ...}
rm /tmp/awmos_test.sqlite3 /tmp/payload.json
```

## Manual QA Pass After Fixes

Use a clean fixture DB, not the working demo DB:

1. Launch installed/dev AWMOS.
2. Confirm first-run kit selection or auto-location.
3. Quick Log a new contact and touchpoint.
4. Quick Log with optional reminder.
5. Confirm Today updates.
6. Confirm Contacts updates.
7. Complete, snooze, and cancel reminders. Header should read
   `N reminders · M hidden` with M growing as you cancel.
8. Confirm reminder counts match visible buckets.
9. Simulate Hermes/CLI write while app is open. App should refresh within
   the polling interval even if the CLI's event id sorts behind the
   previous one.
10. Open contact detail and edit safe fields. Documents panel should show
    only documents whose filename slug longest-matches this contact.
11. Generate Appointment Summary, Proposal, Slides. Verify all three render
    into `vault/Generated/…` and appear in Documents.
12. Restart app and confirm persistence.
13. Disconnect from the network. App should still launch, fonts should
    still render correctly (bundled), no console errors about font fetches.
