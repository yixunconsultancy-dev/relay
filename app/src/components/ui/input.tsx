import * as React from "react";

import { cn } from "@/lib/utils";

const inputClass = [
  "block w-full rounded-sm border border-border bg-bg-surface px-3 py-2",
  "font-body text-sm text-fg placeholder:text-fg-subtle",
  "transition-colors duration-150 ease-out",
  "focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "read-only:cursor-default read-only:text-fg/70 read-only:bg-bg-base/40",
].join(" ");

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type ?? "text"}
    ref={ref}
    className={cn(inputClass, "h-9", className)}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows ?? 3}
    className={cn(inputClass, "min-h-[64px] resize-y leading-snug", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "font-condensed text-[10px] font-bold uppercase tracking-[0.12em] text-gold/70",
      className
    )}
    {...props}
  />
));
FieldLabel.displayName = "FieldLabel";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  htmlFor,
  className,
  children,
  ...props
}) => (
  <div className={cn("flex flex-col gap-1.5", className)} {...props}>
    <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
    {children}
    {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
  </div>
);
