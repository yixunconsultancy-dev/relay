# Reminder Rules

Rules for creating, scheduling, and managing reminders.

v0 supports follow-up reminders created from touchpoints. Calendar-derived,
policy-derived, health-derived, recurring, and snooze lifecycle logic are
product rules for future iterations unless the runtime has implemented the
needed fields.

## Auto-Generated Reminders

The bot creates reminders automatically from:

### Touchpoint-Derived
- **Follow-up mentioned**: "follow up next week" → reminder on that date
- **Meeting scheduled**: "meeting on Thursday" → prep reminder 1 day before
- **Travelling**: "she's in Japan from 10-22 May" → reminder on return date
- **No explicit follow-up**: After any touchpoint, create a default follow-up at `follow_up_default_days` from Settings

### Calendar-Derived (future)
- **Birthday**: Reminder 3 days before, every year
- **Policy anniversary**: Reminder 14 days before
- **Next review date**: Reminder 7 days before
- **Renewal date**: Reminder 30 days before

### Health-Derived (future)
- **Cooling contact**: Auto-reminder when a warm/hot contact has no touchpoint in 30 days
- **At-risk client**: Auto-reminder when a client has no touchpoint in 60 days

## Daily Focus Generation

Each day (at `reminder_time` from Settings), compile:

1. **Reminders due today** — sorted by priority (high → medium → low)
2. **Overdue reminders** — anything past due and still pending
3. **Contacts needing attention** — based on health indicators from RELATIONSHIP_RULES.md
4. **Today's meetings** — if any meetings were scheduled via touchpoints

Format as a concise daily briefing, not a wall of text.

## Reminder Lifecycle

```
pending → done       (FC completes the action)
pending → snoozed    (FC defers: "remind me Friday instead")
pending → cancelled  (FC says "skip this" or "no longer needed")
snoozed → pending    (snoozed_until date arrives)
```

## Snooze Rules (future)

When the FC snoozes a reminder:

- Update `snoozed_until` to the new date
- Set status to `snoozed`
- On the new date, flip back to `pending`
- If snoozed more than 3 times, flag it: "This reminder has been deferred 3 times — want to cancel it or handle it now?"

## Priority Assignment

| Trigger | Priority |
|---|---|
| FC explicitly says "urgent" or "important" | high |
| Client with active policy | high |
| Hot prospect | high |
| Warm contact, standard follow-up | medium |
| Cold/warming contact | low |
| Birthday/anniversary | medium |
| Overdue by 7+ days | auto-escalate to high |

## Duplicate Prevention

Before creating a reminder:

1. Check if a pending/snoozed reminder exists for the same contact with a due date within 3 days
2. If yes, merge: update the existing reminder's context with new information
3. If no, create new

## Completion

When the FC logs a touchpoint that addresses a pending reminder:

- Auto-mark the reminder as `done`
- Set `completed_at` to now
- Example: Reminder says "Follow up with Sarah" → FC logs "Called Sarah today" → auto-complete
