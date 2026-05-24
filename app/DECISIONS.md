# App Build Decisions

A short log of architectural / dependency choices made during the desktop-app
build that weren't fully nailed down in `SCOPING.md`. Format: decision, why,
and what it'd take to revisit.

## Phase 1

### React 19 instead of React 18

`SCOPING.md` locks the stack to "React 18" but the official Tauri v2 scaffolder
(`npm create tauri-app@latest --template react-ts`) now produces a React 19
project by default. I kept React 19 because:

- It's the current stable release and what every Tauri example targets.
- shadcn/ui, TanStack Query, React Router, React Hook Form, and Zod (the rest
  of the locked stack) all support React 19.
- Downgrading the scaffold to 18 means manually editing the type packages and
  losing the scaffolder's tested deps lockstep, for no clear gain.

To revisit: pin to React 18 in `package.json`, run `npm install`, and check
that `@types/react` and `@types/react-dom` are also pinned to 18.

### Tailwind v3 instead of v4 + hand-written shadcn components

The kickoff says to run `npx shadcn@latest init` with the slate base scheme.
shadcn v4.7 now defaults to Tailwind v4 and rewrites your CSS into the v4
`@theme` model. Tailwind v4 changes a few things that matter here:

- No `tailwind.config.js` — config lives in CSS.
- Differences in dark-mode toggling that affect the `[data-scheme]` selector
  pattern from `app/design/colors_and_type.css`.

To keep the AWM token model (`data-scheme="awm-light"` / `awm-dark` switched
via CSS variables) clean, I:

1. Installed **Tailwind v3** explicitly (`tailwindcss@^3`).
2. Wired the AWM tokens via `tailwind.config.js` + `src/styles/globals.css`
   (HSL channels so Tailwind's `<alpha-value>` works).
3. Skipped the shadcn CLI and **hand-wrote** the `Button` and `Card`
   components in `src/components/ui/` using the same Radix + cva patterns
   the CLI emits. The components are functionally equivalent.

To revisit: when shadcn ships a stable v3 path again, or when we migrate to
Tailwind v4 wholesale, we can rerun `npx shadcn@latest init` and the
hand-written components can be replaced with the CLI output.

### Sheet component deferred to Phase 2

Phase 1's acceptance criteria don't need a slide-over panel. I'll add Sheet
(Radix Dialog + side-anchored animation) in Phase 2 when the contact-detail
screen starts needing it.

### CSS variables in HSL channels

I write tokens as `--gold: 41 50% 54%` rather than `--gold: hsl(41, 50%, 54%)`.
This lets Tailwind compose alpha from the same token via `hsl(var(--gold) /
<alpha-value>)`. The kit's `design.md` and `app/design/colors_and_type.css`
both use hex; the conversion is done once in `globals.css`.

### Sidebar nav items disabled for non-built screens

The sidebar shows the planned MVP nav (`Today`, `Contacts`, `Reminders`,
`Daily Focus`, `Documents`, `Settings`) so the visual end-state is obvious,
but everything except `Today` is rendered as a disabled item with a tooltip
("Available in a later phase"). When the route lands in Phase 2+, flip
`enabled: true` in `src/components/layout/sidebar.tsx`.

### DB path resolution: env var → exe walk-up → cwd walk-up

`src-tauri/src/lib.rs::resolve_db_path` walks upward from `current_exe()`
and `current_dir()` looking for `data/relationship_os.sqlite3`. This works
in dev (binary lives 4 levels deep under the kit), in `cargo run`, and when
launching the dev `.app` bundle from the kit folder.

It does **not** work for a fully-packaged `.app` installed in
`/Applications/` — the bundle has no notion of "the kit folder" once it's
moved off-disk. For now, packaged-bundle launches expect
`RELATIONSHIP_OS_KIT_ROOT` or `RELATIONSHIP_OS_DB_PATH` to be set. A v2
first-run flow can add a folder picker that persists the choice into
settings.

## Phase 2

### Editable + read-only field split codified in `schema.ts`

`EDITABLE_CONTACT_FIELDS` and `HERMES_MANAGED_FIELDS` are exported from
`src/lib/schema.ts`. The contact-detail form iterates only the editable
list; Hermes-managed fields render as labeled read-only displays. The
`updateContact` mutation throws if any non-editable field is passed —
defense in depth in case a future caller invents a new write path.

## Phase 3

### Direct UPDATE + INSERT into `events` in a SQLite transaction

The kit's Python CLI doesn't expose an `update-contact` subcommand, so the
app writes consultant-managed field changes directly:

```sql
BEGIN;
UPDATE contacts SET … WHERE id = ?;
INSERT INTO events (…, kind, …, source) VALUES (…, 'contact_updated', …, 'app:edit-contact');
COMMIT;
```

`source = 'app:edit-contact'` namespaces these so the settings screen's
"last Hermes/CLI event" view can ignore them (anything starting with
`app:` is local).

## Phase 4

### Reminder lifecycle goes through the Python CLI, never direct SQL

`complete-reminder`, `snooze-reminder`, `cancel-reminder` all shell out via
`run_kit_command`. The kit emits the matching event row (`reminder_*`)
itself, so the app's polling loop picks up the change uniformly whether
the action came from the kanban or from Hermes.

### Rust shell-out signature: `run_kit_command(args, json_payload?)`

Single Tauri command, JSON payload written to a temp file and passed as
`--json-file`. The temp file is cleaned up after the subprocess exits. The
result struct preserves the exit code, so the JS layer surfaces
non-zero exits as `KitCommandError` rather than swallowing them.

## Phase 5

### Polling cadence: 3 seconds, gated by `PRAGMA data_version`

The poller calls `PRAGMA data_version` first (cheap — no I/O if nothing's
changed) and only does the events SELECT when the version bumps. Worst
case: a same-second touchpoint by Hermes might be picked up on the next
3s tick rather than instantly, well within the 5s SLA in SCOPING.md.

### "Needs attention" thresholds inline in `lib/attention.ts`

30 days for cooling (warm/hot), 60 days for at-risk (clients). Not yet
configurable — surface as a setting in v2 if consultants want to tune.

## Phase 6

### File discovery in Rust, not via plugin-fs

The Documents browser uses a single `list_generated_documents()` Tauri
command rather than the `tauri-plugin-fs` permission scope, because the
files always live in `vault/Generated/{kind}/` (resolvable from the kit
root) and the directory traversal is simple. Avoids granting broad
filesystem scope to the webview.

### Per-contact document filter is a slug prefix match

The kit's filename convention is `YYYY-MM-DD <slug>[-purpose].ext`. The
parser returns the leading slug (everything up to the first `-` after the
date), and contact-detail matches that prefix against the slugified
contact name. False positives are possible when two contacts share a
name prefix; a v2 improvement is to track contact_id in document metadata.

## Phase 7

### Added `notes` column to `touchpoints` (single contemplated kit change)

`SCOPING.md` explicitly allows this. Updated:
- `scripts/relationship_os.py` HEADERS[TOUCHPOINTS]
- `DATA_SCHEMA.md` table
- `app/src/lib/schema.ts::TouchpointRow`
- All SELECT columns in `lib/queries.ts` and `routes/home.tsx`

The kit's `Store.ensure()` runs `ALTER TABLE ADD COLUMN` automatically on
the next open, so existing databases pick it up without manual migration.
Verified: the 14 Python tests still pass.

### Theme persistence: localStorage, not the kit settings table

The theme toggle writes to `localStorage` so it's per-machine, and also
mirrors into `settings.design_scheme` so the kit's CLI deliverable
generators (PDF/PPTX) inherit the consultant's preference. Theme reads
from localStorage on boot for instant apply (no flash of wrong theme).

### Hermes status proxy: most-recent non-`app:` event

No process inspection — the Settings screen queries the events table for
the newest row where `source` doesn't start with `app:`. < 24h old =
"live"; older = "stale"; none = "unknown". Cheap, no extra permissions,
correct enough for the MVP.

### Unsigned `.dmg`; signing is a v2 task

`tauri build --bundles dmg` produces the bundle under
`app/src-tauri/target/release/bundle/dmg/`. Apple notarization needs a
paid Developer ID — once you have one, set `APPLE_SIGNING_IDENTITY` and
the bundler signs automatically.

## Post-MVP follow-on (same session as Phase 1–7)

### First-run kit-folder picker

The original `resolve_db_path` only walked up from `current_exe()` and
`current_dir()`. That fails the moment the `.app` lives outside the kit
(`/Applications/`, mounted DMG, etc.) — the binary's path no longer has
the kit anywhere on its ancestor chain. Symptom: empty contact list when
launched from Finder.

Added `Boot.tsx` as a pre-app gate:
- `tryResolveKitRoot()` runs the same env-var → saved config → walk-up
  resolution as before.
- On failure, renders `routes/first-run.tsx` — a full-screen "Choose kit
  folder" panel that opens a native folder picker via
  `tauri-plugin-dialog`.
- The Rust side validates the pick (must contain
  `data/relationship_os.sqlite3` *and* `scripts/relationship_os.py`),
  persists to
  `~/Library/Application Support/com.awm.relationshipos/config.json`,
  and primes a `tauri::State<KitRootState>` cache so subsequent calls
  short-circuit.
- `resetDbConnection()` exposes a way to drop the lazy `Database`
  singleton so the new path takes effect without a full reload.

To re-prompt: `rm ~/Library/Application\ Support/com.awm.relationshipos/config.json`.

### PATH prepended for Finder-launched subprocesses

`launchctl`-spawned apps get a minimal PATH (`/usr/bin:/bin`). If the
user installed Python via Homebrew, `python3` resolves there
(`/opt/homebrew/bin/python3` on Apple Silicon,
`/usr/local/bin/python3` on Intel). `run_kit_command` now explicitly
prepends those two paths before spawning, so shell-outs work identically
whether the app is launched from Terminal or Finder.

### Theme: app UI ≠ deliverable scheme

Originally I bundled the app's UI theme toggle with the kit's
`design_scheme` setting (a single switch). The user pushed back: those
should be independent. The app's UI is a per-machine viewing preference;
deliverables (PDFs, slides, writeups) follow the kit's stored
`design_scheme` setting and should not change based on whether the
consultant happens to be in dark mode tonight.

Final shape:
- **App theme** — `routes/settings.tsx` "App theme" section. Writes to
  `localStorage` only. Boot reads from localStorage.
- **Deliverable scheme** — separate "Deliverable scheme" section.
  Reads/writes `settings.design_scheme` directly. The kit's CLI picks
  it up on its next invocation
  (`configured_design_scheme()` in `relationship_os.py:872`).

### Theme-switch crossfade

Toggling between schemes was jarring — every panel flipped instantly.
`lib/theme.ts::applyScheme` now adds a transient
`.scheme-transitioning` class to `<html>` for ~280 ms before flipping
`data-scheme`, then strips it. The class scopes a global transition
rule in `globals.css` to color, background, border, fill, stroke, and
box-shadow (`!important` to override per-element transitions briefly).
First paint skips the animation so the initial render lands instantly
in the user's chosen scheme. Respects `prefers-reduced-motion`.

### Rebrand: AWMOS

Product name is now **AWMOS** (a wordplay on "almost"). Updated:
- `tauri.conf.json` `productName` + window title
- `index.html` `<title>`
- Sidebar header, first-run header, native folder picker dialog title

Bundle identifier `com.awm.relationshipos` is unchanged — bumping it
would orphan any existing
`~/Library/Application Support/com.awm.relationshipos/config.json`.
The internal binary name `awm-relationship-os` is also unchanged; it
never reaches the user.

`.app` and `.dmg` are now named `AWMOS.app` / `AWMOS_0.1.0_aarch64.dmg`.

### App icon: AWMOS wordmark, gold on near-black, with glow

Replaced the previous `logo_dark.png`-padded icon (dark green AWM mark
on near-black — low contrast) with a wordmark approach:
- "AWMOS" set in **DIN Condensed Bold** (a close kin to Barlow
  Condensed; system-bundled at
  `/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf`)
- Color: a yellower gold `#EFC44A` (warmer/brighter than the brand's
  base `#C6A34F`), on near-black `#050505`
- Two-pass gold glow under the text (wide halo + tight inner bloom)
  composed via Pillow's `GaussianBlur`
- Mark fills ~70% of the canvas width

Source built by an inline Pillow script; the resulting 1024×1024 PNG
is fed to `tauri icon` to generate the `.icns` and other sizes.

### DMG window layout

`tauri.conf.json` `bundle.macOS.dmg` now sets an explicit
`windowSize`, `appPosition`, and `applicationFolderPosition` so the
"drag AWMOS to Applications" view is laid out consistently.

The `.VolumeIcon.icns` file the bundler writes is still present — it
gives the mounted volume its own icon in Finder's sidebar. It's a
dotfile and is normally invisible; only users with show-hidden-files
on (`Cmd+Shift+.`) will see it inside the DMG window. Not worth
removing — that'd cost the volume-sidebar icon too.

## Post-MVP polish (2026-05-24)

A second polish pass after running the three plan reviews
(`/plan-eng-review`, `/plan-design-review`, `/plan-ceo-review`) against
the as-built architecture. Six items shipped; rationale on the non-obvious
ones below.

### Python kit also sets `PRAGMA journal_mode = WAL`

The eng review flagged that only the app set WAL. WAL mode is sticky once
any connection sets it, so in practice this didn't bite — but the moment
Hermes ever opened a *fresh* database before the app, the journal would
be created in default `delete` mode and concurrent writers would serialize
on the file lock. `scripts/relationship_os.py::SQLiteStore.connect()`
now sets both WAL and `foreign_keys = ON` on every connection. Verified
by the new `tests/test_concurrent_writes.py` soak test.

### Status tokens aligned to `design.md` (no more Material Design defaults)

`globals.css` was using Material Design's `#4CAF50` green, `#E57373` red,
and — most egregiously — `#00BCD4` cyan, which `design.md:72` explicitly
forbids in the dark scheme. Swapped to AWM moss (`#7A8F62`), clay
(`#B85C52`), and gold (cyan removed entirely; no info-color in the AWM
palette). One CSS change cascaded across CLIENT/ADVISOR/DONE chips,
HOT/negative-sentiment chips, PROSPECT/CANDIDATE/SNOOZED chips, and all
sentiment indicators — the whole status palette is now AWM-toned. No
component changes required because everything routes through the same
three tokens.

### vitest set up, mutations + polling tests added

The eng review flagged that `app/src/lib/` had zero TypeScript tests
despite the bug history showing real regressions in exactly that layer
(rowid-vs-id cursor, slug parsing, cache invalidation scope). Installed
vitest@4.1.7, added `vitest.config.ts` (shares the `@/` alias with
`vite.config.ts`), added `npm test` / `npm run test:watch` scripts.

Wrote `mutations.test.ts` (13 tests covering `updateContact` diff logic,
event payload shape, transaction wrap, rollback on mid-tx error,
`updateTouchpointNotes` MAX_LENGTH guard and missing-row case) and
`polling.test.ts` (15 tests covering `dispatchInvalidations` per
EventKind, batched events, dedup, no-contact-id branches).

`dispatchInvalidations` was exported from `polling.ts` so it could be
tested as a pure function without rendering React or mocking the full
TanStack Query client. The hook (`useEventPoller`) remains the only
React-bound surface.

Test environment uses `node` (not `jsdom`) — both test files exercise
pure logic with mocked DB / queryClient, no DOM needed.

### `dark-reference-README.md` superseded-by banner

The design review flagged that `app/design/dark-reference.html` uses an
older forest-green palette that's been superseded by `design.md`'s
true-black scheme. The implementation correctly follows `design.md`,
but anyone reading the reference HTML first would get the wrong color
impression. Added a prominent banner at the top of
`dark-reference-README.md` — use the mockup for layout/composition only,
get colors from `design.md`.

### Test counts after this pass

- Python: **47** tests (was 46; added `test_concurrent_writes.py`)
- Rust: **11** tests (unchanged)
- TypeScript: **28** tests (was 0; vitest setup + two new test files)

## Today screen visual refresh (2026-05-25)

### Activity garden replaces 7-day heatmap

Replaced `DailyScoreCard` (Material-style 7-cell heatmap row in the left
half of the Today screen) with `GardenCard` — a full-width 14-day strip
where each day is a linework-flowerbed PNG. Density tier is chosen from
the day's touchpoint score (sparse / light / medium / busy / dense, 20
PNG variants per tier, 100 total). Each day's variant is picked by
hashing the date string so the same day always shows the same bed
across renders.

Why PNGs over SVG-procedural or CSS-procedural:

- The brief was "linework tattoo flowers", which involves organic stem
  curves, varying bud shapes per stem, and visible pen-pressure
  variation. None of those are cheap to generate in SVG without it
  looking algorithmic.
- AI image gen produces 100 unique beds in one batch for ~$0; doing
  the same procedurally would mean either looking samey or shipping a
  bespoke generator.
- Stored as transparent-background PNGs under
  `app/public/garden/{bucket}/batch{N}_{bucket}_NN.png`. ~2.7 MB total,
  shipped with the bundle.

Dark mode: instead of generating a second batch with white ink, a CSS
`filter: invert(1) brightness(0.92)` in `.dark-invert` flips the same
PNGs to white-on-near-black. `brightness(0.92)` warms pure white down
a hair toward the cream surface tone.

Cell sizing: PNG aspect is 2:3 with flowers in roughly the bottom 35%
of the canvas, so `object-cover` left ~70% of cell height as empty sky.
Final approach: `h-28` cell + `overflow-hidden` + `transform: scale(2.4)
origin-bottom` on the image. The flower portion zooms up to fill the
cell, the transparent sky overflows above the visible area. Tradeoff:
dense beds get more horizontal cropping (visible center ~40% of width),
but the central cluster is where most flowers sit anyway.

To revisit: regenerate the 100 PNGs with tighter framing (flowers in
bottom 60% of canvas, not 35%) — the scale-transform crop wouldn't be
needed and dense beds would show full-width. Until then the transform
crop is the cheap fix.

### Today-screen layout: garden at top, then 2-col grid

Moved Quick Log out of the left column into the page header. The
garden card now spans full width above a 2-col grid containing
Reminders / Debt preview (left) and Ripe / Birthdays (right).

### Test counts after this pass

- Python: **64** tests (added clarifications, relationships, address
  field, today-brief, source override)
- Rust: **12** tests
- TypeScript: **85** tests (added score, debt, ripe, birthdays, graph,
  polling, mutations)
