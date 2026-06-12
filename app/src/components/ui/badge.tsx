import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5",
    "font-condensed text-[10px] font-bold uppercase tracking-[0.08em]",
    "whitespace-nowrap",
  ].join(" "),
  {
    variants: {
      tone: {
        gold: "bg-gold/[0.15] text-gold border-gold-dim",
        neutral: "bg-fg/5 text-fg/55 border-fg/10",
        success: "bg-status-success/10 text-status-success border-status-success/30",
        warning: "bg-gold/15 text-gold border-gold-dim",
        info: "bg-status-info/10 text-status-info border-status-info/30",
        danger: "bg-status-error/10 text-status-error border-status-error/30",
        cyan: "bg-status-info/10 text-status-info border-status-info/25",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, dot = false, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
      )}
      {children}
    </span>
  )
);
Badge.displayName = "Badge";

// Stable mapping from contact type / stage / sentiment to a visual tone.

import type {
  ContactType,
  RelationshipStage,
  Sentiment,
  ReminderPriority,
  ReminderStatus,
} from "@/lib/enums";
import type { PortfolioTag } from "@/lib/schema";

export const CONTACT_TYPE_TONE: Record<ContactType, BadgeProps["tone"]> = {
  cold: "neutral",
  warming: "warning",
  in_conversation: "info",
  client: "gold",
};

export const STAGE_TONE: Record<RelationshipStage, BadgeProps["tone"]> = {
  hot: "danger",
  warm: "gold",
  warming: "warning",
  cold: "neutral",
  client: "success",
  inactive: "neutral",
};

export const SENTIMENT_TONE: Record<Sentiment, BadgeProps["tone"]> = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
  mixed: "warning",
};

export const PRIORITY_TONE: Record<ReminderPriority, BadgeProps["tone"]> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export const REMINDER_STATUS_TONE: Record<ReminderStatus, BadgeProps["tone"]> = {
  pending: "warning",
  snoozed: "info",
  done: "success",
  cancelled: "neutral",
};

// Portfolio tone mapping — visual cue for risk profile.
// Cautious/Steady = calm tones; Balanced = centred gold; Adventurous = warm;
// Ferrari = loudest; Custom = neutral.
export const PORTFOLIO_TAG_TONE: Record<PortfolioTag, BadgeProps["tone"]> = {
  pro_cautious: "info",
  pro_balanced: "gold",
  pro_adventurous: "warning",
  elite_balanced: "gold",
  elite_adventurous: "warning",
  steady: "success",
  ferrari: "danger",
  custom: "neutral",
};
