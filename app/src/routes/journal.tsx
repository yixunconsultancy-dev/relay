import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Minus, Plus, Check, ChevronDown, ChevronUp, DollarSign, CalendarDays } from "lucide-react";

import { useJournalEntry, useJournalHistory, upsertJournalEntry } from "@/lib/queries";
import { useSettings } from "@/lib/queries";
import { todayIso } from "@/lib/format";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

function isToday(iso: string, today: string): boolean {
  return iso === today;
}

// ── Stepper input ─────────────────────────────────────────────────────────────

function Stepper({
  value,
  onChange,
  label,
  hint,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-bg-surface px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fg">{label}</span>
        {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-bg-base text-fg-muted hover:border-gold hover:text-gold transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-8 text-center text-2xl font-display font-light text-fg tabular-nums leading-none">
          {value}
        </span>
        <button
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-bg-base text-fg-muted hover:border-gold hover:text-gold transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Currency input ────────────────────────────────────────────────────────────

function CurrencyInput({
  value,
  onChange,
  label,
  hint,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  hint?: string;
}) {
  const [raw, setRaw] = useState(value === 0 ? "" : value.toFixed(2));

  // Keep local string in sync if parent resets (e.g. on load from DB)
  useEffect(() => {
    setRaw(value === 0 ? "" : value.toFixed(2));
  }, [value]);

  function handleBlur() {
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0) {
      onChange(0);
      setRaw("");
    } else {
      const rounded = Math.round(parsed * 100) / 100;
      onChange(rounded);
      setRaw(rounded.toFixed(2));
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-bg-surface px-5 py-4">
      <div className="flex flex-col gap-0.5 flex-1">
        <span className="text-sm font-semibold text-fg">{label}</span>
        {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <DollarSign className="h-4 w-4 text-fg-muted flex-shrink-0" />
        <input
          type="number"
          min="0"
          step="0.01"
          value={raw}
          placeholder="0.00"
          onChange={(e) => setRaw(e.target.value)}
          onBlur={handleBlur}
          className="w-36 rounded-sm border border-border bg-bg-base px-3 py-2 text-right text-sm font-semibold text-fg tabular-nums placeholder:text-fg-subtle outline-none focus:border-gold transition-colors"
        />
      </div>
    </div>
  );
}

// ── Yes / No toggle ───────────────────────────────────────────────────────────

function YesNo({
  value,
  onChange,
  label,
  hint,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-bg-surface px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fg">{label}</span>
        {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(false)}
          className={`h-8 px-4 rounded-sm border text-xs font-bold tracking-wider uppercase transition-colors ${
            !value
              ? "border-gold bg-gold/10 text-gold"
              : "border-border bg-bg-base text-fg-muted hover:border-fg-muted"
          }`}
        >
          No
        </button>
        <button
          onClick={() => onChange(true)}
          className={`h-8 px-4 rounded-sm border text-xs font-bold tracking-wider uppercase transition-colors ${
            value
              ? "border-gold bg-gold/10 text-gold"
              : "border-border bg-bg-base text-fg-muted hover:border-fg-muted"
          }`}
        >
          Yes
        </button>
      </div>
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({
  entry,
  today,
}: {
  entry: {
    date: string;
    appointments: number;
    fyc_opened: number;
    fyc_closed: number;
    new_candidate_conversation: number;
    win_challenge: string;
  };
  today: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="rounded-sm border border-border bg-bg-surface overflow-hidden">
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-bg-raised transition-colors"
      >
        <div className="flex flex-col min-w-[90px]">
          <span className="text-sm font-semibold text-fg">
            {fmtDisplayDate(entry.date)}
          </span>
          {isToday(entry.date, today) && (
            <span className="text-[10px] uppercase tracking-wider text-gold font-bold">
              Today
            </span>
          )}
        </div>
        <div className="flex gap-6 flex-1">
          <div className="flex flex-col items-center">
            <span className="text-lg font-display font-light text-fg leading-none">{entry.appointments}</span>
            <span className="text-[9px] uppercase tracking-wider text-fg-muted mt-0.5">Appt</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-lg font-display font-light text-fg leading-none">
              ${entry.fyc_opened.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-fg-muted mt-0.5">FYC Open</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-lg font-display font-light text-fg leading-none">
              ${entry.fyc_closed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-fg-muted mt-0.5">FYC Close</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-lg font-display font-light leading-none">
              {entry.new_candidate_conversation ? (
                <span className="text-gold">Y</span>
              ) : (
                <span className="text-fg-muted">N</span>
              )}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-fg-muted mt-0.5">Cand.</span>
          </div>
        </div>
        {entry.win_challenge ? (
          expanded ? (
            <ChevronUp className="h-4 w-4 text-fg-muted flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-fg-muted flex-shrink-0" />
          )
        ) : (
          <div className="w-4" />
        )}
      </button>
      {expanded && entry.win_challenge && (
        <div className="px-5 pb-4 pt-1 border-t border-border">
          <p className="text-sm text-fg/80 leading-relaxed italic">
            "{entry.win_challenge}"
          </p>
        </div>
      )}
    </li>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function JournalRoute() {
  const settings = useSettings();
  const today = todayIso(settings.data?.timezone);

  // Selected date — defaults to today, user can change to any past/present date
  const [selectedDate, setSelectedDate] = useState(today);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const selectedEntry = useJournalEntry(selectedDate);
  const history = useJournalHistory(90);
  const queryClient = useQueryClient();

  // Form state
  const [appointments, setAppointments] = useState(0);
  const [fycOpened, setFycOpened] = useState(0);
  const [fycClosed, setFycClosed] = useState(0);
  const [newCandidate, setNewCandidate] = useState(false);
  const [winChallenge, setWinChallenge] = useState("");
  const [saved, setSaved] = useState(false);

  // When the selected date changes, reset the form immediately so stale
  // values from the previous date don't linger while the new query loads.
  useEffect(() => {
    setAppointments(0);
    setFycOpened(0);
    setFycClosed(0);
    setNewCandidate(false);
    setWinChallenge("");
    setSaved(false);
  }, [selectedDate]);

  // Once the entry for the selected date loads, populate the form.
  useEffect(() => {
    if (selectedEntry.data) {
      setAppointments(selectedEntry.data.appointments);
      setFycOpened(selectedEntry.data.fyc_opened);
      setFycClosed(selectedEntry.data.fyc_closed);
      setNewCandidate(selectedEntry.data.new_candidate_conversation === 1);
      setWinChallenge(selectedEntry.data.win_challenge);
    }
  }, [selectedEntry.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertJournalEntry({
        date: selectedDate,
        appointments,
        fyc_opened: fycOpened,
        fyc_closed: fycClosed,
        new_candidate_conversation: newCandidate ? 1 : 0,
        win_challenge: winChallenge,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const isToday = selectedDate === today;
  const pastEntries = (history.data ?? []).filter((e) => e.date !== selectedDate);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="h-5 w-5 text-gold" />
        <span className="awm-label">END OF DAY</span>
      </div>
      <h1 className="text-4xl font-serif font-light text-fg mb-1">Journal</h1>
      <p className="text-fg-muted text-sm mb-8">
        Log today's activity. Every entry is saved and tracked for insights over time.
      </p>

      {/* Date selector */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <p className="awm-label">{fmtDisplayDate(selectedDate)}</p>
            {isToday && (
              <span className="text-[10px] uppercase tracking-wider text-gold font-bold bg-gold/10 border border-gold/30 rounded-sm px-1.5 py-0.5 leading-none">
                Today
              </span>
            )}
          </div>
          {selectedEntry.data ? (
            <p className="text-xs text-fg-muted mt-0.5">Entry exists — saving will overwrite.</p>
          ) : selectedEntry.isPending ? null : (
            <p className="text-xs text-fg-muted mt-0.5">No entry for this date yet.</p>
          )}
        </div>
        {/* Hidden native date input — triggered by the button */}
        <div className="relative">
          <input
            ref={dateInputRef}
            type="date"
            max={today}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            tabIndex={-1}
          />
          <button
            onClick={() => dateInputRef.current?.showPicker?.()}
            className="flex items-center gap-2 rounded-sm border border-border bg-bg-surface px-4 py-2 text-sm text-fg-muted hover:border-gold hover:text-gold transition-colors"
          >
            <CalendarDays className="h-4 w-4" />
            Change date
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-3 max-w-2xl">
        <Stepper
          value={appointments}
          onChange={setAppointments}
          label="New Appointments Set"
          hint="Business or non-business"
        />
        <CurrencyInput
          value={fycOpened}
          onChange={setFycOpened}
          label="FYC Opened"
          hint="FYC submitted today, business that's newly submitted, not quotation resubmission"
        />
        <CurrencyInput
          value={fycClosed}
          onChange={setFycClosed}
          label="FYC Closed"
          hint="First year commission cases closed today"
        />
        <YesNo
          value={newCandidate}
          onChange={setNewCandidate}
          label="New Candidate Conversation"
          hint="Did you start a new candidate conversation today?"
        />

        {/* Win / Challenge */}
        <div className="rounded-sm border border-border bg-bg-surface px-5 py-4 flex flex-col gap-3">
          <div>
            <span className="text-sm font-semibold text-fg">Win or Challenge of the Day</span>
            <p className="text-xs text-fg-muted mt-0.5">Reflect on what stood out today.</p>
          </div>
          <textarea
            value={winChallenge}
            onChange={(e) => setWinChallenge(e.target.value)}
            placeholder="What was your biggest win or challenge today?"
            rows={4}
            className="w-full resize-none rounded-sm border border-border bg-bg-base px-4 py-3 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-gold transition-colors leading-relaxed"
          />
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 rounded-sm border border-gold bg-gold/10 px-6 py-2.5 text-sm font-bold tracking-wider uppercase text-gold hover:bg-gold/20 transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              "Saving…"
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              "Save Entry"
            )}
          </button>
          {saveMutation.isError && (
            <span className="text-xs text-red-400">
              Something went wrong. Try again.
            </span>
          )}
        </div>
      </div>

      {/* History */}
      {pastEntries.length > 0 && (
        <div className="mt-12">
          <h2 className="awm-label mb-4">Past Entries</h2>
          <ul className="flex flex-col gap-2 max-w-2xl">
            {pastEntries.map((entry) => (
              <HistoryRow key={entry.date} entry={entry} today={today} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
