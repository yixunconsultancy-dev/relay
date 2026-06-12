import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Pencil,
  Plus,
  Settings,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { Badge, PORTFOLIO_TAG_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  fetchAllPolicies,
  useInvestmentProducts,
  useContacts,
  useSettings,
  queryKeys,
} from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { resetDbConnection } from "@/lib/db";
import {
  addInvestmentProduct,
  archiveInvestmentProduct,
  bulkUpsertInvestments,
  updateInvestmentProduct,
  updatePolicy,
  updateSetting,
  type BulkUpsertInvestmentsResult,
  type InvestmentNameResolution,
  type InvestmentProductPayload,
} from "@/lib/kit";
import { useNavigate } from "react-router-dom";
import {
  PORTFOLIO_TAGS,
  PORTFOLIO_TAG_LABEL,
  type InvestmentProduct,
  type PolicyRow,
  type ContactRow,
  type PortfolioTag,
} from "@/lib/schema";
import { cn } from "@/lib/utils";
import { formatShortDate, formatMoney } from "@/lib/format";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Render a frequency string into a short tag: "Monthly" → "mo", etc. */
function frequencyTag(freq: string): string {
  const f = (freq || "").toLowerCase().trim();
  if (f.startsWith("month")) return "mo";
  if (f.startsWith("quarter")) return "qtr";
  if (f.startsWith("semi")) return "semi";
  if (f.startsWith("annual") || f === "yearly") return "yr";
  if (f.startsWith("single")) return "single";
  return freq || "—";
}

// formatMoney lives in @/lib/format now so the policy card on the contact
// page renders dollar amounts the same way the investments dashboard does.

/** Download the Investments xlsx template (with existing rows seeded). */
async function downloadInvestmentsTemplate() {
  try {
    const result = await invoke<{
      ok: boolean;
      exit_code: number;
      stdout: string;
      stderr: string;
    }>("run_kit_command", {
      args: ["--format=json", "generate-template", "--name", "investments"],
      jsonPayload: null,
    });
    if (!result.ok) {
      alert(`Python generate-template failed:\n${result.stderr || result.stdout}`);
      return;
    }
    const payload = JSON.parse(result.stdout) as { ok: boolean; path: string };
    if (!payload.ok || !payload.path) {
      alert(`Unexpected payload from generate-template:\n${result.stdout}`);
      return;
    }
    await invoke("open_vault_file", { path: payload.path });
  } catch (e) {
    alert(`Template download failed:\n${String(e)}`);
  }
}

// ─── main route ─────────────────────────────────────────────────────────────

type PolicyWithClient = PolicyRow & { _clientName: string };

export function InvestmentsRoute() {
  const queryClient = useQueryClient();
  const products = useInvestmentProducts();
  const contacts = useContacts();
  const settings = useSettings();

  // Live policies query — investment-tracking rows only (i.e. ones with a
  // product_id or where plan_name matches a product in the catalog). For v1
  // we show every active policy and let the user identify investments by the
  // Portfolio column. Once Yixun maps real client policies to real products,
  // we can switch to a filtered view.
  const policies = useQuery({
    queryKey: queryKeys.policies,
    queryFn: fetchAllPolicies,
  });

  const [manageOpen, setManageOpen] = useState(false);
  const [importResult, setImportResult] = useState<BulkUpsertInvestmentsResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Preview/confirm/apply state. preview holds the dry-run classification
  // (which the dialog renders); previewFilePath is the file we'll re-send on
  // apply; decisions is the user's choice per needs_decision row, keyed by
  // the normalised client_name Python expects in --name-resolution.
  const [preview, setPreview] = useState<BulkUpsertInvestmentsResult | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<InvestmentNameResolution>({});
  const [applying, setApplying] = useState(false);

  function normName(s: string): string {
    return s.trim().toLowerCase().split(/\s+/).join(" ");
  }

  // Portfolio filter chips. Empty set = no filter (show all). Anything in
  // the set narrows to those tags only. "_untagged" is a synthetic key for
  // policies with no portfolio_tag set yet.
  const [portfolioFilter, setPortfolioFilter] = useState<Set<string>>(new Set());
  function togglePortfolioFilter(tag: string) {
    setPortfolioFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  const correctAsOf = settings.data?.investments_correct_as_of ?? "";
  const productById = useMemo(() => {
    const m = new Map<string, InvestmentProduct>();
    for (const p of products.data ?? []) m.set(p.id, p);
    return m;
  }, [products.data]);

  const contactById = useMemo(() => {
    const m = new Map<string, ContactRow>();
    for (const c of contacts.data ?? []) m.set(c.id, c);
    return m;
  }, [contacts.data]);

  // Set of plan names (lowercased) that count as "investment plans" — i.e.
  // they have a matching entry in the active product catalog. The Investments
  // dashboard is a derived view filtered to these only; adding/removing
  // products in Manage Products changes which policies appear here.
  const investmentPlanNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of products.data ?? []) {
      if (!p.archived_at?.trim()) set.add(p.name.trim().toLowerCase());
    }
    return set;
  }, [products.data]);

  function isInvestmentPolicy(p: PolicyRow): boolean {
    return investmentPlanNames.has((p.plan_name || "").trim().toLowerCase());
  }

  // Join policies with their client name, apply catalog + portfolio filters,
  // then sort.
  //
  // Policies whose contact is in Trash (or otherwise missing from the active
  // contacts list) are filtered out — restoring the contact automatically
  // brings the policy back since useContacts() picks it up again. This is
  // also what causes a 'Set portfolio' row to disappear from the dashboard
  // when the underlying client is trashed.
  const rows = useMemo<PolicyWithClient[]>(() => {
    const items = (policies.data ?? [])
      .filter((p) => (p.status || "active") !== "archived")
      .filter(isInvestmentPolicy)
      .filter((p) => contactById.has(p.contact_id))
      .filter((p) => {
        if (portfolioFilter.size === 0) return true;
        const tag = (p.portfolio_tag || "").trim() || "_untagged";
        return portfolioFilter.has(tag);
      })
      .map((p) => ({
        ...p,
        _clientName: contactById.get(p.contact_id)?.name ?? "(unknown)",
      }));
    items.sort((a, b) => {
      const byName = a._clientName.localeCompare(b._clientName);
      if (byName !== 0) return byName;
      return (a.plan_name || "").localeCompare(b.plan_name || "");
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies.data, contactById, portfolioFilter, investmentPlanNames]);

  // Compute counts per portfolio tag for chip badges. Only counts investment
  // policies whose contact is active (excludes archived + trashed-client
  // policies that would otherwise inflate the 'Untagged' bucket).
  const portfolioCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of policies.data ?? []) {
      if ((p.status || "active") === "archived") continue;
      if (!isInvestmentPolicy(p)) continue;
      if (!contactById.has(p.contact_id)) continue;
      const tag = (p.portfolio_tag || "").trim() || "_untagged";
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies.data, contactById, investmentPlanNames]);

  // Count of investment policies still missing portfolio_tag — these need
  // Jovial's attention to fill in the investment-specific details.
  const needsSetupCount = useMemo(
    () => rows.filter((r) => !(r.portfolio_tag || "").trim()).length,
    [rows]
  );

  // Persist Correct As Of date when the user changes it via the date input.
  // Saves locally without forcing an import.
  const updateCorrectAsOf = useMutation({
    mutationFn: (value: string) => updateSetting("investments_correct_as_of", value),
    onSuccess: () => {
      resetDbConnection();
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });

  // Inline portfolio-tag setter for the dashboard. Picks from the table get
  // saved immediately so Jovial doesn't have to drill into the detail page
  // for the common case. Custom requires a label, so that one routes to the
  // detail page instead of saving inline.
  const navigate = useNavigate();
  async function quickSetTag(policyId: string, tag: string) {
    if (tag === "custom") {
      navigate(`/policies/${policyId}`);
      return;
    }
    try {
      await updatePolicy(policyId, { portfolio_tag: tag, portfolio: "" });
      resetDbConnection();
      await queryClient.invalidateQueries({ queryKey: queryKeys.policies });
    } catch (e) {
      alert(`Could not set portfolio tag:\n${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Step 1: pick a file and run the import in dry-run mode. The response
  // classifies every row (update / create / needs_decision / error) without
  // writing anything. The preview dialog (below) shows the result and, if any
  // names are ambiguous, lets the user disambiguate before applying.
  const bulkImport = useMutation({
    mutationFn: async () => {
      const file = await openFilePicker({
        title: "Select Investments file (xlsx or CSV)",
        filters: [{ name: "CSV / Excel", extensions: ["csv", "xlsx"] }],
        multiple: false,
      });
      if (!file) return null;
      const filePath =
        typeof file === "string" ? file : (file as { path: string }).path ?? String(file);
      const result = await bulkUpsertInvestments(filePath, correctAsOf, {
        dryRun: true,
      });
      return { result, filePath };
    },
    onSuccess: (payload) => {
      if (!payload) return;
      const { result, filePath } = payload;
      setPreview(result);
      setPreviewFilePath(filePath);
      // Default every needs_decision row to "skip" so nothing gets attached
      // to a contact until the user explicitly picks. If we defaulted to the
      // top fuzzy candidate, a confident-looking but wrong suggestion would
      // get applied if the user just hit Apply without reading.
      const initial: InvestmentNameResolution = {};
      for (const d of result.needs_decision ?? []) {
        initial[normName(d.client_name)] = "__skip__";
      }
      setDecisions(initial);
    },
    onError: (e) =>
      setImportError(e instanceof Error ? e.message : String(e)),
  });

  // Step 2: apply. Re-runs the same import with the user's resolution map and
  // dry_run=false. Updates by policy_number and exact-name creates happen
  // again on this pass (idempotent); fuzzy-decision rows are resolved via
  // the map; error rows are still surfaced for visibility but not written.
  async function applyImport() {
    if (!preview || !previewFilePath) return;
    setApplying(true);
    setImportError(null);
    try {
      const result = await bulkUpsertInvestments(previewFilePath, correctAsOf, {
        nameResolution: decisions,
      });
      setImportResult(result);
      // Done with the preview now — clear it so the next import starts clean.
      setPreview(null);
      setPreviewFilePath(null);
      setDecisions({});
      // Force a fresh connection so newly-inserted rows from Python are visible.
      resetDbConnection();
      queryClient.invalidateQueries({ queryKey: queryKeys.policies });
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setPreviewFilePath(null);
    setDecisions({});
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6 sticky top-0 z-10">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-4 w-4 text-gold" />
              <span className="awm-label">INVESTMENTS</span>
            </div>
            <h1 className="font-display text-3xl font-light text-fg leading-none">
              Investment Tracker
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              Fund positions across {rows.length} polic{rows.length === 1 ? "y" : "ies"}.
              {needsSetupCount > 0 && (
                <>
                  {" · "}
                  <span className="text-gold">
                    {needsSetupCount} need{needsSetupCount === 1 ? "s" : ""} portfolio setup
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Correct As Of */}
            <div className="flex flex-col items-end">
              <span className="awm-label mb-1">Correct as of</span>
              <DateInput
                value={correctAsOf}
                onChange={(v) => updateCorrectAsOf.mutate(v)}
                ariaLabel="Correct as of date"
                className="w-40"
              />
            </div>

            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-xs text-fg-muted hover:border-gold/60 hover:text-fg hover:bg-bg-raised/60 transition-colors"
              title="Manage product catalog"
            >
              <Settings className="h-3.5 w-3.5" />
              Products
            </button>
            <button
              type="button"
              onClick={() => downloadInvestmentsTemplate()}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-xs text-fg-muted hover:border-gold/60 hover:text-fg hover:bg-bg-raised/60 transition-colors"
              title="Download an .xlsx pre-filled with current rows"
            >
              <Download className="h-3.5 w-3.5" />
              Template
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => bulkImport.mutate()}
              disabled={bulkImport.isPending}
            >
              <Upload className="h-4 w-4" />
              {bulkImport.isPending ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>

        {/* ── Portfolio filter chips ── */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="awm-label mr-1">Portfolio</span>
          {PORTFOLIO_TAGS.map((tag) => {
            const count = portfolioCounts[tag] ?? 0;
            const isOn = portfolioFilter.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => togglePortfolioFilter(tag)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-condensed font-bold uppercase tracking-[0.08em] transition-colors",
                  isOn
                    ? "border-gold/60 bg-gold/15 text-gold"
                    : "border-border bg-bg-surface/40 text-fg-muted hover:border-gold/40 hover:text-fg"
                )}
              >
                {PORTFOLIO_TAG_LABEL[tag as PortfolioTag]}
                {count > 0 && (
                  <span className="text-fg-subtle">{count}</span>
                )}
              </button>
            );
          })}
          {(portfolioCounts["_untagged"] ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => togglePortfolioFilter("_untagged")}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border border-dashed px-2 py-0.5 text-[10px] font-condensed font-bold uppercase tracking-[0.08em] transition-colors",
                portfolioFilter.has("_untagged")
                  ? "border-gold/60 bg-gold/15 text-gold"
                  : "border-border text-fg-subtle hover:border-gold/40 hover:text-fg"
              )}
            >
              Untagged
              <span className="text-fg-subtle">{portfolioCounts["_untagged"]}</span>
            </button>
          )}
          {portfolioFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setPortfolioFilter(new Set())}
              className="ml-2 text-[10px] text-fg-subtle hover:text-fg uppercase tracking-wider"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {policies.isLoading || contacts.isLoading || products.isLoading ? (
          <p className="p-8 text-sm text-fg-muted">Loading investments…</p>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-display text-xl text-fg-muted">
              No investment policies yet.
            </p>
            <p className="mt-2 text-sm text-fg-subtle max-w-md mx-auto">
              Add a policy on a client's page using a Plan Name from the
              Investment Products catalog — it'll appear here automatically.
              Use Import to refresh fund values across existing policies each month.
            </p>
          </div>
        ) : (
          <InvestmentsTable
            rows={rows}
            productById={productById}
            onQuickSetTag={quickSetTag}
          />
        )}
      </div>

      {/* ── Manage Products dialog ── */}
      <ManageProductsDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        products={products.data ?? []}
        onChange={() => {
          // The Tauri SQL plugin keeps an open connection that reads from
          // a pre-write WAL snapshot. Force a fresh connection so the
          // refetched data reflects what Python just wrote.
          resetDbConnection();
          queryClient.invalidateQueries({ queryKey: queryKeys.investmentProducts });
        }}
      />

      {/* ── Preview / confirm / apply dialog ──
          Shown after a dry-run. Counts at the top, fuzzy-decision rows in the
          middle (per-row picker), error rows last. Apply runs the import for
          real with the user's choices. */}
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(o) => {
          if (!o && !applying) cancelPreview();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review import</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-4 gap-3 text-center">
              <Stat label="Update" value={preview?.updated ?? 0} tone="gold" />
              <Stat label="Create" value={preview?.created ?? 0} tone="gold" />
              <Stat
                label="Decide"
                value={preview?.needs_decision?.length ?? 0}
                tone={(preview?.needs_decision?.length ?? 0) > 0 ? "muted" : "muted"}
              />
              <Stat
                label="Errors"
                value={preview?.errors?.length ?? 0}
                tone={(preview?.errors?.length ?? 0) > 0 ? "error" : "muted"}
              />
            </div>

            {/* Needs-decision rows — one picker per ambiguous name. */}
            {preview?.needs_decision && preview.needs_decision.length > 0 && (
              <div>
                <p className="awm-label mb-2">Names we weren't sure about</p>
                <p className="text-xs text-fg-muted mb-3">
                  Pick the matching client for each row, or Skip to leave that
                  policy out of this import. Nothing is attached without your pick.
                </p>
                <ul className="space-y-3 max-h-64 overflow-auto">
                  {preview.needs_decision.map((d, i) => {
                    const key = normName(d.client_name);
                    const choice = decisions[key] ?? "__skip__";
                    return (
                      <li
                        key={`${d.row}-${i}`}
                        className="rounded-sm border border-border bg-bg-surface p-3"
                      >
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-fg truncate">
                              {d.client_name || "(blank)"}
                            </p>
                            <p className="text-xs text-fg-subtle">
                              Row {d.row}
                              {d.policy_number ? ` · Policy ${d.policy_number}` : ""}
                              {d.product_name ? ` · ${d.product_name}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {d.candidates.map((c) => (
                            <label
                              key={c.contact_id}
                              className="flex items-center gap-2 text-xs cursor-pointer"
                            >
                              <input
                                type="radio"
                                name={`decide-${i}`}
                                value={c.contact_id}
                                checked={choice === c.contact_id}
                                onChange={() =>
                                  setDecisions((prev) => ({
                                    ...prev,
                                    [key]: c.contact_id,
                                  }))
                                }
                              />
                              <span className="text-fg">{c.name}</span>
                              <span className="text-fg-subtle tabular-nums">
                                {Math.round(c.score * 100)}% match
                              </span>
                            </label>
                          ))}
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="radio"
                              name={`decide-${i}`}
                              value="__skip__"
                              checked={choice === "__skip__"}
                              onChange={() =>
                                setDecisions((prev) => ({
                                  ...prev,
                                  [key]: "__skip__",
                                }))
                              }
                            />
                            <span className="text-fg-muted">
                              Skip — don't import this row
                            </span>
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Errors — rows that can't be matched at all (no exact, no fuzzy).
                Surfaced so Jovial knows exactly which contacts to create first. */}
            {preview?.errors && preview.errors.length > 0 && (
              <div>
                <p className="awm-label mb-2">Errors — create these clients first</p>
                <ul className="space-y-1 max-h-32 overflow-auto">
                  {preview.errors.map((e, i) => (
                    <li key={i} className="text-xs text-fg-muted">
                      Row {e.row}: {e.client_name || "(blank)"} — {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview && preview.updated === 0 && preview.created === 0 && (preview.needs_decision?.length ?? 0) === 0 && (
              <p className="text-xs text-fg-muted">
                Nothing to import. Every row was blank or unresolvable.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={cancelPreview} disabled={applying}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={applyImport}
              disabled={
                applying ||
                !preview ||
                (preview.updated === 0 &&
                  preview.created === 0 &&
                  Object.values(decisions).every((v) => v === "__skip__"))
              }
            >
              {applying ? "Applying…" : "Apply import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import error dialog ── */}
      <Dialog open={Boolean(importError)} onOpenChange={(o) => !o && setImportError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import failed</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-status-error">{importError}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="gold" size="sm" onClick={() => setImportError(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import result dialog ── */}
      <Dialog
        open={Boolean(importResult)}
        onOpenChange={(o) => !o && setImportResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import complete</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Updated" value={importResult?.updated ?? 0} tone="gold" />
              <Stat label="Created" value={importResult?.created ?? 0} tone="muted" />
              <Stat
                label="Skipped"
                value={importResult?.skipped ?? 0}
                tone={importResult?.skipped ? "error" : "muted"}
              />
            </div>
            {importResult?.as_of && (
              <p className="text-xs text-fg-muted">
                Correct as of <span className="text-fg">{importResult.as_of}</span>.
              </p>
            )}
            {importResult?.skipped_rows && importResult.skipped_rows.length > 0 && (
              <div>
                <p className="awm-label mb-1">Skipped rows</p>
                <ul className="space-y-0.5 max-h-32 overflow-auto">
                  {importResult.skipped_rows.map((s, i) => (
                    <li key={i} className="text-xs text-fg-muted">
                      Row {s.row}: {s.policy_number || s.client_name || "(blank)"} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="gold" size="sm" onClick={() => setImportResult(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── table ──────────────────────────────────────────────────────────────────

function InvestmentsTable({
  rows,
  productById,
  onQuickSetTag,
}: {
  rows: PolicyWithClient[];
  productById: Map<string, InvestmentProduct>;
  onQuickSetTag: (policyId: string, tag: string) => Promise<void>;
}) {
  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-bg-base/95 backdrop-blur">
        <tr className="awm-label border-b border-border text-left">
          <th className="px-8 py-3 font-condensed">Client</th>
          <th className="px-3 py-3 font-condensed">Policy</th>
          <th className="px-3 py-3 font-condensed">Premium</th>
          <th className="px-3 py-3 font-condensed">Portfolio</th>
          <th className="px-3 py-3 font-condensed text-right">Total premiums</th>
          <th className="px-8 py-3 font-condensed text-right">Fund value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          // Multi-policy grouping: show client name only on first row of
          // each group. Indented + subtle left border on subsequent rows.
          const prevName = i > 0 ? rows[i - 1]._clientName : null;
          const isGroupStart = row._clientName !== prevName;
          const nextName = i < rows.length - 1 ? rows[i + 1]._clientName : null;
          const isGroupEnd = row._clientName !== nextName;
          // Lock-in and premium term — prefer the product catalog, fall back
          // to anything stored on the policy directly (legacy rows).
          const product =
            (row.product_id && productById.get(row.product_id)) || null;
          const productName = product?.name || row.plan_name || "—";

          return (
            <tr
              key={row.id}
              className={cn(
                "border-b border-border/40 hover:bg-bg-surface/60 transition-colors",
                isGroupEnd && "border-b-border"
              )}
            >
              <td className={cn(
                "px-8 py-3 align-top",
                isGroupStart ? "" : "border-l-2 border-gold/15"
              )}>
                {isGroupStart ? (
                  // Link the client name to the first policy (so click-through
                  // lands on something useful). Could also link to /contacts/:id;
                  // we'll go to the policy since this is the Investments view.
                  <Link
                    to={`/policies/${row.id}`}
                    className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
                  >
                    {row._clientName}
                  </Link>
                ) : (
                  <span className="text-xs text-fg-subtle">↳</span>
                )}
              </td>
              <td className="px-3 py-3 align-top">
                <Link
                  to={`/policies/${row.id}`}
                  className="font-body text-sm text-fg hover:text-gold transition-colors block"
                >
                  {productName}
                </Link>
                {row.policy_number && (
                  <Link
                    to={`/policies/${row.id}`}
                    className="text-xs text-fg-muted hover:text-gold transition-colors mt-0.5 font-mono block"
                  >
                    {row.policy_number}
                  </Link>
                )}
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">
                <span className="text-sm text-fg tabular-nums">
                  {formatMoney(row.premium_amount)}
                </span>
                {row.premium_frequency && (
                  <span className="ml-1.5 text-xs text-fg-muted">
                    / {frequencyTag(row.premium_frequency)}
                  </span>
                )}
              </td>
              <td className="px-3 py-3 align-top">
                {(row.portfolio_tag || "").trim() ? (
                  <PortfolioBadgeCell
                    tag={row.portfolio_tag}
                    customLabel={row.portfolio}
                  />
                ) : (
                  // Inline picker. Choosing a tag writes immediately to the
                  // policy via updatePolicy() — no detour to the detail page
                  // for the common case. Picking 'Custom' redirects to the
                  // detail page since that one needs an extra free-text label.
                  <select
                    aria-label="Set portfolio tag"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) onQuickSetTag(row.id, v);
                    }}
                    className="rounded-sm border border-dashed border-gold/60 bg-gold/10 px-2 py-0.5 text-[10px] font-condensed font-bold uppercase tracking-[0.08em] text-gold hover:bg-gold/15 transition-colors focus:outline-none cursor-pointer"
                  >
                    <option value="">Set portfolio…</option>
                    {PORTFOLIO_TAGS.map((t) => (
                      <option key={t} value={t}>
                        {PORTFOLIO_TAG_LABEL[t]}
                        {t === "custom" ? " (opens detail)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="px-3 py-3 align-top text-right text-sm text-fg/90 tabular-nums">
                {formatMoney(row.total_premiums_paid)}
              </td>
              <td className="px-8 py-3 align-top text-right text-sm font-semibold text-fg tabular-nums">
                {formatMoney(row.current_value)}
                {row.valuation_date && (
                  <div className="text-xs text-fg-subtle font-normal mt-0.5">
                    {formatShortDate(row.valuation_date)}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Render the portfolio cell as a coloured Badge. When the tag is 'custom',
 * show "Custom · <label>" so Jovial can tell custom portfolios apart at a
 * glance without opening the policy. Untagged rows show a dim em-dash. */
function PortfolioBadgeCell({
  tag,
  customLabel,
}: {
  tag: string;
  customLabel: string;
}) {
  const cleanTag = (tag || "").trim() as PortfolioTag | "";
  if (!cleanTag) {
    // Legacy / unmigrated row: if portfolio has a value, show it as neutral text.
    if (customLabel?.trim()) {
      return (
        <span className="text-sm text-fg-muted italic">{customLabel}</span>
      );
    }
    return <span className="text-fg-subtle">—</span>;
  }
  const label = PORTFOLIO_TAG_LABEL[cleanTag as PortfolioTag];
  const tone = PORTFOLIO_TAG_TONE[cleanTag as PortfolioTag];
  if (cleanTag === "custom" && customLabel?.trim()) {
    return (
      <Badge tone={tone}>
        Custom · {customLabel}
      </Badge>
    );
  }
  return <Badge tone={tone}>{label}</Badge>;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "gold" | "muted" | "error";
}) {
  const valueClass =
    tone === "gold"
      ? "text-gold"
      : tone === "error"
      ? "text-status-error"
      : "text-fg-muted";
  return (
    <div className="rounded-sm border border-border bg-bg-surface p-3">
      <p className={cn("font-condensed text-2xl font-bold", valueClass)}>{value}</p>
      <p className="mt-0.5 text-xs text-fg-muted uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ─── Manage Products dialog ─────────────────────────────────────────────────

function ManageProductsDialog({
  open,
  onClose,
  products,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  products: InvestmentProduct[];
  onChange: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InvestmentProductPayload>({});
  const [adding, setAdding] = useState(false);
  const [newProduct, setNewProduct] = useState<InvestmentProductPayload>({
    name: "",
    premium_term: "",
    lock_in_period: "",
  });
  const [error, setError] = useState<string | null>(null);

  function beginEdit(p: InvestmentProduct) {
    setEditingId(p.id);
    setDraft({
      name: p.name,
      premium_term: p.premium_term,
      lock_in_period: p.lock_in_period,
      notes: p.notes,
    });
  }

  async function commitEdit() {
    if (!editingId) return;
    try {
      await updateInvestmentProduct(editingId, draft);
      setEditingId(null);
      setDraft({});
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function commitAdd() {
    if (!(newProduct.name || "").trim()) {
      setError("Name is required.");
      return;
    }
    try {
      await addInvestmentProduct(newProduct);
      setAdding(false);
      setNewProduct({ name: "", premium_term: "", lock_in_period: "" });
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function archive(id: string) {
    try {
      await archiveInvestmentProduct(id);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage products</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-xs text-fg-muted">
            Set premium term and lock-in once per product. New client policies
            of that product inherit these values.
          </p>

          {error && (
            <p className="text-xs text-status-error">{error}</p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="awm-label border-b border-border text-left">
                <th className="py-2 font-condensed">Product</th>
                <th className="py-2 font-condensed">Premium term</th>
                <th className="py-2 font-condensed">Lock-in</th>
                <th className="py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isEditing = editingId === p.id;
                return (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="py-2 pr-3">
                      {isEditing ? (
                        <Input
                          value={draft.name ?? ""}
                          onChange={(e) =>
                            setDraft({ ...draft, name: e.target.value })
                          }
                        />
                      ) : (
                        <span className="text-fg">{p.name}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {isEditing ? (
                        <Input
                          value={draft.premium_term ?? ""}
                          onChange={(e) =>
                            setDraft({ ...draft, premium_term: e.target.value })
                          }
                          placeholder="e.g. 10 years"
                        />
                      ) : (
                        <span className="text-fg-muted">
                          {p.premium_term || "—"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {isEditing ? (
                        <Input
                          value={draft.lock_in_period ?? ""}
                          onChange={(e) =>
                            setDraft({ ...draft, lock_in_period: e.target.value })
                          }
                          placeholder="e.g. 5 years"
                        />
                      ) : (
                        <span className="text-fg-muted">
                          {p.lock_in_period || "—"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => commitEdit()}
                            className="text-xs text-gold hover:text-gold/80"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setDraft({});
                            }}
                            className="text-xs text-fg-muted hover:text-fg"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => beginEdit(p)}
                            className="text-fg-muted hover:text-fg"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Archive ${p.name}? Existing policies stay.`)) {
                                archive(p.id);
                              }
                            }}
                            className="text-fg-muted hover:text-status-error"
                            title="Archive product"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {adding && (
                <tr className="border-b border-border/40 bg-bg-surface/30">
                  <td className="py-2 pr-3">
                    <Input
                      value={newProduct.name ?? ""}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, name: e.target.value })
                      }
                      placeholder="Product name"
                      autoFocus
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      value={newProduct.premium_term ?? ""}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, premium_term: e.target.value })
                      }
                      placeholder="e.g. 10 years"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      value={newProduct.lock_in_period ?? ""}
                      onChange={(e) =>
                        setNewProduct({ ...newProduct, lock_in_period: e.target.value })
                      }
                      placeholder="e.g. 5 years"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => commitAdd()}
                        className="text-xs text-gold hover:text-gold/80"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setNewProduct({ name: "", premium_term: "", lock_in_period: "" });
                        }}
                        className="text-xs text-fg-muted hover:text-fg"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 text-xs text-gold hover:text-gold/80"
            >
              <Plus className="h-3.5 w-3.5" />
              Add product
            </button>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
