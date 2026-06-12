// Mirrors the VALID_* sets in scripts/relationship_os.py. Keep in sync.
// Hermes and the Python kit reject anything outside these enums — the app
// must use the exact same strings.

export const CONTACT_TYPES = [
  "cold",
  "warming",
  "in_conversation",
  "client",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const RELATIONSHIP_STAGES = [
  "cold",
  "warming",
  "warm",
  "hot",
  "client",
  "inactive",
] as const;
export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

export const TOUCHPOINT_TYPES = [
  "casual_message",
  "non_business_meeting",
  "business_meeting",
  "claim_pos_request",
  "client_event",
  "import",
] as const;
export type TouchpointType = (typeof TOUCHPOINT_TYPES)[number];

// Human-readable labels for each touchpoint type.
export const TOUCHPOINT_TYPE_LABEL: Record<TouchpointType, string> = {
  casual_message: "Casual Message",
  non_business_meeting: "Non Business Meeting",
  business_meeting: "Business Meeting",
  claim_pos_request: "Claim/POS Request",
  client_event: "Client Event",
  import: "Import",
};

// Subset of TOUCHPOINT_TYPES that represent real consultant-client
// interactions. Mirrors REAL_INTERACTION_TOUCHPOINT_TYPES in the Python kit.
// Only these update last_touch_date and feed the "needs attention" math.
export const REAL_INTERACTION_TOUCHPOINT_TYPES: readonly TouchpointType[] = [
  "casual_message",
  "non_business_meeting",
  "business_meeting",
  "claim_pos_request",
  "client_event",
];

export const SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const REMINDER_TYPES = [
  "follow_up",
  "review",
  "birthday",
  "anniversary",
  "renewal",
  "nomination",
  "claims",
  "custom",
] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_PRIORITIES = ["high", "medium", "low"] as const;
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];

export const REMINDER_STATUSES = [
  "pending",
  "done",
  "snoozed",
  "cancelled",
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const EVENT_KINDS = [
  "touchpoint_logged",
  "reminder_completed",
  "reminder_snoozed",
  "reminder_cancelled",
  "contact_created",
  "contact_updated",
  "contact_merged",
  "contact_archived",
  "contact_unarchived",
  "contact_renamed",
  "reminder_duplicate_skipped",
  "policy_created",
  "policy_updated",
  "policy_archived",
  // Trash lifecycle for policies, parallel to contact_archived/etc.
  "policy_discarded",
  "policy_restored",
  "policy_purged",
  "clarification_queued",
  "clarification_resolved",
  "relationship_created",
  "relationship_removed",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const RELATIONSHIP_KINDS = [
  "spouse",
  "parent",
  "child",
  "sibling",
  "family",
  "friend",
  "business_partner",
] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export const RELATIONSHIP_KIND_LABEL: Record<RelationshipKind, string> = {
  spouse: "Spouse",
  parent: "Parent",
  child: "Child",
  sibling: "Sibling",
  family: "Family",
  friend: "Friend",
  business_partner: "Business partner",
};

// Visual ordering for stage urgency. Higher = more urgent to act on.
export const STAGE_URGENCY: Record<RelationshipStage, number> = {
  hot: 5,
  warm: 4,
  warming: 3,
  cold: 2,
  client: 1,
  inactive: 0,
};
