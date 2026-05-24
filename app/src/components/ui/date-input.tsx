import { useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// WKWebView's native `<input type="date">` shows today's date as a faint
// placeholder when the value is empty, which makes the field look populated.
// This wrapper hides the date picker until focus and shows an explicit
// "(any)" placeholder so an empty field clearly reads as empty.
export function DateInput({
  value,
  onChange,
  placeholder,
  id,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const showDate = focused || Boolean(value);
  const placeholderText = placeholder ?? "Pick a date";
  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        aria-label={ariaLabel}
        type={showDate ? "date" : "text"}
        readOnly={!showDate}
        value={value}
        placeholder={showDate ? undefined : `${placeholderText} (none)`}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "block w-full rounded-sm border bg-bg-surface px-3 py-2 pr-7",
          "font-body text-sm placeholder:text-fg-subtle",
          "transition-colors duration-150 ease-out h-9",
          "focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20",
          value
            ? "border-gold/40 text-fg"
            : "border-border text-fg-subtle"
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={`Clear ${placeholderText.toLowerCase()}`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-fg-muted hover:text-fg hover:bg-fg/10"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
