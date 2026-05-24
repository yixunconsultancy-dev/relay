# Claude Code CLI Kickoff

Paste the contents of this file into Claude Code CLI when you start the
desktop-app build session, either as the first message or as the body of
a `/goal` command if your CLI has that enabled. Everything Claude Code
needs to know about the project state and what to build first is below.

---

## Project state (as of 2026-05-20)

You are picking up the AWM Relationship OS Kit at the point where its
v2 consultant-facing surface — a native macOS desktop app — is fully
scoped but not yet built. The Python backend (Hermes-facing typed write
API, deliverable generators, schema, audit log) is finished and shipping.
Your job is to build the desktop app under `app/` per the existing
scoping document, then keep going phase by phase until the MVP ships.

The full scope lives in `app/SCOPING.md`. Read it carefully before
touching code — every screen, every data model decision, every shell-out
contract is in there. Read `app/design/README.md` next for the style
references (per-component HTML recipes, the dark-mode mockup, the CSS
variables file). Read `DATA_SCHEMA.md`, `SOUL.md`, and
`scripts/relationship_os.py` for the Python kit's interfaces — your app
will be a peer writer alongside Hermes, both reading and writing the same
`data/relationship_os.sqlite3` in WAL mode.

The stack is locked: Tauri v2 (Rust shell) + React 18 + Vite +
TypeScript + Tailwind + shadcn/ui + TanStack Query + React Router +
`@tauri-apps/plugin-sql`. macOS-only for v1. The app lives entirely
inside `app/` and shells out to the Python kit for deliverable
generation; it does not reimplement deliverable logic.

The kit folder you are working in already has 14 passing Python unit
tests, ~20 MB of brand assets in `assets/`, generated showcase artifacts
in `showcase_examples/`, and a working `python3 scripts/relationship_os.py
demo --reset` flow you can use to seed the SQLite database with realistic
test data. Don't modify the Python kit unless `app/SCOPING.md` explicitly
calls for it (the only contemplated kit-side change is adding a `notes`
column to the Touchpoints table during Phase 4, and only if you actually
need it for the touchpoint detail screen).

## Before you write any code: verify the toolchain

Run these checks. If any fail, install the missing tool *before* asking
me to confirm anything else:

```bash
rustc --version              # Need Rust 1.70+. Install via https://rustup.rs if missing.
cargo --version              # Comes with Rust.
node --version               # Need Node 18+. Install via brew install node, or use nvm.
npm --version                # Comes with Node.
xcrun --version              # macOS native dev tools. Install with: xcode-select --install
sw_vers -productVersion      # Confirm macOS 12+; Tauri's macOS bundler needs it.
```

If `rustc` is missing, run `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` and source the env. If `xcrun` errors, run `xcode-select --install` and let it finish before continuing. Don't proceed to Phase 1 with missing tools.

## Reading list (in this order)

1. `app/SCOPING.md` — the whole spec. Goal, stack, file layout, data model, concurrency model, 8 screen specs, Hermes integration, out-of-scope list, 7 build phases, acceptance criteria.
2. `app/design/README.md` — index of the style references in `app/design/`.
3. `app/design/dark-reference.html` — open it in a browser via `open app/design/dark-reference.html` and look at the actual visual target.
4. `app/design/dark-reference-README.md` — designer's notes on the mockup.
5. `app/design/components/buttons.html`, `cards.html`, `forms.html`, `badges.html` — the most-used component recipes. Each is a tiny self-contained HTML with the exact CSS to reproduce.
6. `DATA_SCHEMA.md` — the SQLite schema, source of truth.
7. `SOUL.md` "Storage Interface", "Touchpoint Extraction", "Reminder Lifecycle", "Deck Composition" sections — these describe what Hermes does, so you understand what the app coexists with.
8. `scripts/relationship_os.py` — focus on `TouchpointInput`, `touchpoint_input_from_dict`, the `VALID_*` enum sets, `log_touchpoint`, `mark_reminder_status`, `log_event`. These are the validation rules you'll mirror in TypeScript.

## What I want you to build right now: Phase 1

From `app/SCOPING.md` "Build Phases" → Phase 1: Scaffold + SQLite connection.

Concretely:

1. Create the Tauri app under `app/` (do not nest under `app/app/` — the Tauri project goes directly in `app/`). Use `npm create tauri-app@latest` with the React + TypeScript + Vite template, configured for macOS only.
2. Install Tailwind CSS and configure it to scan the React source.
3. Install shadcn/ui via the CLI (`npx shadcn@latest init`) with the slate base colour scheme. Add the Button, Card, and Sheet components to start.
4. Install `@tauri-apps/plugin-sql` and register the sqlite feature in `src-tauri/Cargo.toml`.
5. Install TanStack Query (`@tanstack/react-query`) and React Router (`react-router-dom`).
6. Wire up the SQLite connection in a `src/lib/db.ts` file. Open the database at `../data/relationship_os.sqlite3` relative to the kit folder (path-resolve via Tauri's `path` API at runtime, with `RELATIONSHIP_OS_DB_PATH` env var as override). Open it with `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON`.
7. Render a single stubbed home screen at `/` that displays the row count for each of the six tables: Contacts, Touchpoints, Reminders, Daily Focus, Settings, Events. Plain text, not styled — this is a connectivity smoke test, not a UI.
8. Confirm the app launches via `npm run tauri dev` and shows the row counts.
9. Run `python3 scripts/relationship_os.py demo --reset` from a separate terminal, then click "refresh" in the app (or reload it). The row counts should change to 3 / 3 / 3 / 0 / 9 / 6.

## Phase 1 acceptance criteria

Before you mark Phase 1 done and move to Phase 2:

- `npm run tauri dev` launches the app cleanly with no console errors.
- The home screen shows row counts for all six tables.
- After running `demo --reset` from the Python kit, refreshing the app shows the new counts.
- WAL mode is confirmed active (you can verify by checking that `data/relationship_os.sqlite3-wal` and `data/relationship_os.sqlite3-shm` files appear after the first write).
- `npm run tauri build` produces an unsigned `.app` bundle under `app/src-tauri/target/release/bundle/macos/` (signing comes in Phase 7).
- Nothing in the Python kit has been modified — `python3 -m unittest tests/test_relationship_os.py` from the kit root still passes 14/14.
- `git status` (if you initialise a git repo) shows changes only under `app/` and the new app dependencies; no kit files touched.

When Phase 1 is verified, **stop, summarise what you built, and report back before starting Phase 2.** I want to review the scaffold before you keep going. After review I'll tell you to proceed to Phase 2.

## What to NOT do

- Do not modify any file outside `app/` unless explicitly directed to. The kit's Python code, SOUL.md, the existing tests, and the brand assets in `assets/` are all stable and must stay that way. Adding the optional `notes` column to Touchpoints during Phase 4 is the one exception, and only if you decide it's needed.
- Do not reimplement deliverable generation (PDF / PPTX / MD writeup). Always shell out to `python3 scripts/relationship_os.py appointment-summary ...` etc. The validation, brand assets, design tokens, and template logic all live in the Python kit and must stay there as the single source of truth.
- Do not invent new screens, new tables, or new fields beyond what `app/SCOPING.md` describes. If you discover something you genuinely need that's not in the spec, stop and ask me before adding it.
- Do not borrow features from `app/design/dark-reference.html` that aren't in the MVP scope (Policies, Pipeline, Training, Calendar are out — see SCOPING.md "What This Does Not Build"). Borrow the *style*, not the feature set.
- Do not introduce new top-level dependencies casually. Every new npm package or Rust crate should be defensible against the goal of "small, self-contained, locally-runnable desktop app." Avoid analytics, telemetry, auth, sync, cloud SDKs entirely.

## How to coordinate with me

After each phase passes its acceptance criteria, stop and report. I will:

- Review what landed.
- Open the app and click through it (you can suggest specific test scenarios).
- Confirm the kit's Python tests still pass.
- Either tell you to proceed to the next phase or ask for fixes.

If you hit a blocker — a missing toolchain, a Tauri/shadcn version mismatch, an unclear bit of the spec — stop and ask. Don't guess.

If you make a design or architectural decision that isn't covered by `app/SCOPING.md` (e.g. "shadcn/ui Sheet vs Dialog for the touchpoint editor"), document it in a short `app/DECISIONS.md` log so I can review the rationale later without re-reading the whole codebase.

Good luck. Start with the toolchain checks above, then move into the reading list, then begin Phase 1.
