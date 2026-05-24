# AWMOS desktop app

Tauri + React + TypeScript + Vite. Reads and writes the kit's
`data/relationship_os.sqlite3` directly (WAL mode) and shells out to
`scripts/relationship_os.py` for validated writes.

See `SCOPING.md` for goals and architecture, `DECISIONS.md` for build-time
choices, and `../APP_BUG_FIX_BRIEF_FOR_CLAUDECODE.md` for the most recent
review pass.

## Install

Use `npm ci` for reproducible installs from the lockfile:

```bash
npm ci
```

Use `npm install` only when intentionally changing or adding a dependency
(it will rewrite `package-lock.json`).

## Common scripts

```bash
npm run dev            # vite dev server
npm run tauri dev      # full Tauri dev (Rust + webview)
npm run build          # tsc + vite build
npm run build:app      # tauri build --bundles app
npm run build:dmg      # tauri build --bundles dmg, with cleanup + retry
npm run install:local  # build:app then copy to /Applications/AWMOS.app
npm run audit          # npm audit --audit-level=moderate
```

## Tests

```bash
npm test                       # vitest, ~28 TS tests in src/lib/
npm run test:watch             # vitest in watch mode
cd src-tauri && cargo test     # ~11 Rust tests (argv injection, filename parsing, etc.)
```

The kit's Python tests live one level up:

```bash
cd .. && python3 -m unittest discover -s tests   # ~47 tests including the concurrent-write soak test
```
