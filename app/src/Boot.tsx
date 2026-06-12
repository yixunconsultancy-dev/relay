import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { Loader2 } from "lucide-react";

import App from "@/App";
import { FirstRunRoute } from "@/routes/first-run";
import { tryResolveKitRoot } from "@/lib/kit-root";
import { applyScheme, getStoredScheme } from "@/lib/theme";
import { resetDbConnection } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

type BootState =
  | { phase: "checking" }
  | { phase: "needs-picker"; error?: string }
  | { phase: "ready" };

export function Boot() {
  const [state, setState] = useState<BootState>({ phase: "checking" });

  useEffect(() => {
    // App UI theme is local to this install — read from localStorage only.
    // The kit's settings.design_scheme is for deliverable rendering and is
    // managed separately in the Settings screen.
    applyScheme(getStoredScheme());

    let cancelled = false;
    async function run() {
      const root = await tryResolveKitRoot();
      if (cancelled) return;
      if (!root) {
        setState({ phase: "needs-picker" });
        return;
      }
      await runMigrations();
      setState({ phase: "ready" });
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFirstRunResolved() {
    // Reset the DB singleton so it picks up the new path, run any pending
    // migrations (e.g. journal_entries), then enter the app.
    resetDbConnection();
    await runMigrations();
    setState({ phase: "ready" });
  }

  if (state.phase === "checking") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-base text-fg-muted">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm">Locating kit…</span>
      </div>
    );
  }

  if (state.phase === "needs-picker") {
    return (
      <FirstRunRoute
        initialError={state.error}
        onResolved={handleFirstRunResolved}
      />
    );
  }

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
