import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import {
  KitCommandError,
  logTouchpoint,
  type TouchpointInputPayload,
} from "@/lib/kit";
import { queryKeys, useContacts, useSettings } from "@/lib/queries";
import {
  REAL_INTERACTION_TOUCHPOINT_TYPES,
  TOUCHPOINT_TYPE_LABEL,
  SENTIMENTS,
  REMINDER_PRIORITIES,
  REMINDER_TYPES,
  type TouchpointType,
  type Sentiment,
  type ReminderPriority,
  type ReminderType,
} from "@/lib/enums";
import { humanize, todayIso } from "@/lib/format";

interface QuickLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultContactName?: string;
}

interface FormState {
  contact_name: string;
  touch_date: string;
  touchpoint_type: TouchpointType;
  sentiment: Sentiment;
  summary: string;
  raw_input: string;
  topics: string;
  action_items: string;
  reminder_due: string;
  reminder_priority: ReminderPriority | "";
  reminder_context: string;
  reminder_type: ReminderType;
}

function initialState(defaultContact: string, today: string): FormState {
  return {
    contact_name: defaultContact,
    touch_date: today,
    touchpoint_type: "casual_message",
    sentiment: "neutral",
    summary: "",
    raw_input: "",
    topics: "",
    action_items: "",
    reminder_due: "",
    reminder_priority: "",
    reminder_context: "",
    reminder_type: "follow_up",
  };
}

export function QuickLogDialog({
  open,
  onOpenChange,
  defaultContactName = "",
}: QuickLogDialogProps) {
  const settings = useSettings();
  const contacts = useContacts();
  const today = todayIso(settings.data?.timezone);
  const [form, setForm] = useState<FormState>(() =>
    initialState(defaultContactName, today)
  );
  const queryClient = useQueryClient();

  function reset() {
    setForm(initialState(defaultContactName, today));
  }

  useEffect(() => {
    if (open) return;
    setForm(initialState(defaultContactName, today));
  }, [defaultContactName, open, today]);

  const log = useMutation({
    mutationFn: async () => {
      const payload: TouchpointInputPayload = {
        contact_name: form.contact_name.trim(),
        touch_date: form.touch_date,
        touchpoint_type: form.touchpoint_type,
        sentiment: form.sentiment,
        summary: form.summary.trim(),
        raw_input: form.raw_input.trim() || form.summary.trim(),
        topics: form.topics
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        action_items: form.action_items.trim(),
      };
      if (form.reminder_due) {
        payload.reminder_due = form.reminder_due;
        if (form.reminder_priority) payload.reminder_priority = form.reminder_priority;
        if (form.reminder_context) payload.reminder_context = form.reminder_context;
        payload.reminder_type = form.reminder_type;
      }
      return logTouchpoint(payload);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.contact(result.contact.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.touchpoints }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.touchpointsByContact(result.contact.id),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.remindersByContact(result.contact.id),
        }),
        queryClient.invalidateQueries({
          queryKey: ["reminders", "pending-counts"],
        }),
        queryClient.invalidateQueries({ queryKey: ["daily-focus"] }),
      ]);
      reset();
      onOpenChange(false);
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function canSubmit(): boolean {
    return Boolean(
      form.contact_name.trim() && form.summary.trim() && form.touch_date
    );
  }

  function submit() {
    if (!canSubmit() || log.isPending) return;
    log.mutate();
  }

  function errorMessage(error: unknown): string {
    if (error instanceof KitCommandError) {
      return "Could not log this touchpoint. Check the required fields and try again.";
    }
    if (error instanceof Error) return error.message;
    return String(error);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a touchpoint</DialogTitle>
          <DialogDescription>
            Capture a private relationship note, next step, and optional
            reminder.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact name" htmlFor="ql-contact" className="col-span-2">
                <ContactAutocomplete
                  id="ql-contact"
                  value={form.contact_name}
                  onChange={(v) => update("contact_name", v)}
                  contactNames={(contacts.data ?? [])
                    .filter((c) => !c.archived_at)
                    .map((c) => c.name)}
                />
              </Field>
              <Field label="Date" htmlFor="ql-date">
                <Input
                  id="ql-date"
                  type="date"
                  value={form.touch_date}
                  onChange={(e) => update("touch_date", e.target.value)}
                />
              </Field>
              <Field label="Type" htmlFor="ql-type">
                <EnumSelect
                  id="ql-type"
                  value={form.touchpoint_type}
                  onChange={(v) => update("touchpoint_type", v as TouchpointType)}
                  options={REAL_INTERACTION_TOUCHPOINT_TYPES}
                  labels={TOUCHPOINT_TYPE_LABEL}
                />
              </Field>
              <Field label="Sentiment" htmlFor="ql-sentiment">
                <EnumSelect
                  id="ql-sentiment"
                  value={form.sentiment}
                  onChange={(v) => update("sentiment", v as Sentiment)}
                  options={SENTIMENTS}
                />
              </Field>
              <Field label="Topics (comma)" htmlFor="ql-topics">
                <Input
                  id="ql-topics"
                  value={form.topics}
                  onChange={(e) => update("topics", e.target.value)}
                  placeholder="retirement, protection"
                />
              </Field>
            </div>

            <Field label="Summary" htmlFor="ql-summary">
              <Textarea
                id="ql-summary"
                rows={3}
                value={form.summary}
                onChange={(e) => update("summary", e.target.value)}
                placeholder="One to three sentences describing the interaction."
              />
            </Field>

            <Field label="Action items" htmlFor="ql-actions">
              <Textarea
                id="ql-actions"
                rows={2}
                value={form.action_items}
                onChange={(e) => update("action_items", e.target.value)}
                placeholder="What needs to happen next."
              />
            </Field>

            <details className="rounded-sm border border-border bg-bg-base/40 px-3 py-2">
              <summary className="awm-label cursor-pointer">
                Optional reminder
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <Field label="Reminder due" htmlFor="ql-rdue">
                  <Input
                    id="ql-rdue"
                    type="date"
                    value={form.reminder_due}
                    onChange={(e) => update("reminder_due", e.target.value)}
                  />
                </Field>
                <Field label="Priority" htmlFor="ql-rprio">
                  <EnumSelect
                    id="ql-rprio"
                    value={form.reminder_priority}
                    onChange={(v) =>
                      update(
                        "reminder_priority",
                        v as ReminderPriority | ""
                      )
                    }
                    options={["", ...REMINDER_PRIORITIES]}
                  />
                </Field>
                <Field label="Type" htmlFor="ql-rtype">
                  <EnumSelect
                    id="ql-rtype"
                    value={form.reminder_type}
                    onChange={(v) => update("reminder_type", v as ReminderType)}
                    options={REMINDER_TYPES}
                  />
                </Field>
                <Field label="Context" htmlFor="ql-rctx" className="col-span-2">
                  <Input
                    id="ql-rctx"
                    value={form.reminder_context}
                    onChange={(e) => update("reminder_context", e.target.value)}
                    placeholder="Why this reminder exists / what to do."
                  />
                </Field>
              </div>
            </details>

            {log.isError && (
              <p className="text-xs text-status-error" role="alert">
                {errorMessage(log.error)}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={log.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gold"
              size="sm"
              disabled={!canSubmit() || log.isPending}
            >
              {log.isPending ? "Logging" : "Log touchpoint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactAutocomplete({
  id,
  value,
  onChange,
  contactNames,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  contactNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches =
    value.trim().length > 0
      ? contactNames.filter((n) =>
          n.toLowerCase().includes(value.toLowerCase())
        )
      : [];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        placeholder="e.g. Sarah Lim"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => value.trim() && setOpen(true)}
        className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-gold/60 focus:outline-none"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-sm border border-border bg-bg-surface shadow-lg max-h-48 overflow-y-auto">
          {matches.slice(0, 8).map((name) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent input blur before click registers
                  onChange(name);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-fg hover:bg-bg-raised transition-colors"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && value.trim().length > 0 && matches.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-sm border border-border bg-bg-surface px-3 py-2 text-xs text-fg-muted italic shadow-lg">
          No existing client — will create a new profile.
        </div>
      )}
    </div>
  );
}

function EnumSelect({
  id,
  value,
  onChange,
  options,
  labels,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === "" ? "—" : (labels?.[opt] ?? humanize(opt))}
        </option>
      ))}
    </select>
  );
}
