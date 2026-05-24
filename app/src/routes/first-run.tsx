import { useState } from "react";
import { FolderSearch, Sparkles, ChevronRight, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pickKitFolder, setKitRoot } from "@/lib/kit-root";

interface FirstRunProps {
  initialError?: string;
  onResolved: (kitRoot: string) => void;
}

export function FirstRunRoute({ initialError, onResolved }: FirstRunProps) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    setBusy(true);
    setError(null);
    try {
      const result = await pickKitFolder();
      if (!result) {
        setBusy(false);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      const saved = await setKitRoot(result.path);
      onResolved(saved.db_path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg-base text-fg px-8">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <span className="awm-label">AWMOS</span>
        </div>
        <h1 className="font-display text-4xl font-light text-fg leading-tight">
          Locate your kit folder
        </h1>
        <p className="mt-3 text-sm text-fg-muted leading-relaxed">
          The app needs to know which kit folder to read and write. A kit
          folder contains{" "}
          <code className="text-gold">data/relationship_os.sqlite3</code> and{" "}
          <code className="text-gold">scripts/relationship_os.py</code>. Pick it
          once and we'll remember.
        </p>

        {error && (
          <div className="mt-6 rounded-sm border border-status-error/40 bg-status-error/[0.06] p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-status-error mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-condensed uppercase tracking-wider text-status-error">
                Couldn't open the kit
              </p>
              <p className="mt-1 text-sm text-fg/85 leading-snug">{error}</p>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          <Button variant="gold" size="lg" disabled={busy} onClick={pick}>
            <FolderSearch className="h-4 w-4" />
            {busy ? "Opening picker…" : "Choose kit folder"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <details className="mt-10 text-xs text-fg-subtle">
          <summary className="cursor-pointer awm-label">Advanced</summary>
          <p className="mt-3 leading-relaxed">
            You can also point the app at a kit by setting
            <code className="text-gold mx-1">RELATIONSHIP_OS_KIT_ROOT</code>
            (e.g.{" "}
            <code className="text-gold">
              launchctl setenv RELATIONSHIP_OS_KIT_ROOT /path/to/kit
            </code>
            ). The picker writes its selection to{" "}
            <code className="text-gold">
              ~/Library/Application Support/com.awm.relationshipos/config.json
            </code>
            — clear it to see this screen again.
          </p>
        </details>
      </div>
    </div>
  );
}
