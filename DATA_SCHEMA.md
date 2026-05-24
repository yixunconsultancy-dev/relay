# Data Schema

This defines the v0 structured data model. The product rule is that the agent's
source of truth is SQLite. Consultant-facing views are mirrored from that source
as Google Sheets, local CSV files, or Obsidian Markdown.

SQLite keeps one table per tab below. In local CSV view mode, each tab is
mirrored as a CSV file. In Google Sheets view mode, each tab is mirrored as a
separate sheet within the workbook. In Obsidian view mode, structured rows are
rendered into Markdown notes for human review.

The v0 schema intentionally supports only contacts, touchpoints, reminders,
daily focus, and settings. Recruitment, advisor coaching, policy detail,
household mapping, knowledge base search, and calendar integration are future
modules unless later schema tabs are added.

## Tab: Contacts

| Column | Type | Description |
|---|---|---|
| id | text | Unique identifier (auto-generated) |
| name | text | Full name |
| type | enum | `client`, `prospect`, `candidate`, `advisor`, `other` |
| relationship_stage | enum | `cold`, `warming`, `warm`, `hot`, `client`, `inactive` |
| phone | text | Phone number |
| email | text | Email address |
| occupation | text | Job title / profession |
| company | text | Company / employer |
| birthday | date | Date of birth |
| family | text | Key family members and relationships |
| policies | text | Active policies (type, provider, sum assured) |
| financial_concerns | text | Key financial concerns or goals |
| interests | text | Personal interests, hobbies |
| referral_source | text | How they were introduced |
| next_review_date | date | Next scheduled review |
| last_touch_date | date | Date of most recent touchpoint |
| notes | text | Free-form notes |
| created_at | datetime | When the record was created |
| updated_at | datetime | Last modification |

## Tab: Touchpoints

| Column | Type | Description |
|---|---|---|
| id | text | Unique identifier |
| contact_id | text | Links to Contacts.id |
| contact_name | text | Denormalized name for readability |
| date | date | When the interaction happened |
| type | enum | `meeting`, `call`, `coffee`, `lunch`, `event`, `message`, `referral`, `other` |
| sentiment | enum | `positive`, `neutral`, `negative`, `mixed` |
| summary | text | What happened (1-3 sentences) |
| topics | text | Comma-separated topics discussed |
| action_items | text | What needs to happen next |
| meeting_number | number | Nth interaction with this contact |
| raw_input | text | Original message from the FC (for reference) |
| notes | text | Optional FC annotation on this touchpoint (consultant-managed). |
| created_at | datetime | When this entry was logged |

## Tab: Reminders

| Column | Type | Description |
|---|---|---|
| id | text | Unique identifier |
| contact_id | text | Links to Contacts.id (optional for general reminders) |
| contact_name | text | Denormalized name |
| due_date | date | When this reminder is due |
| type | enum | `follow_up`, `review`, `birthday`, `anniversary`, `renewal`, `nomination`, `claims`, `custom` |
| priority | enum | `high`, `medium`, `low` |
| context | text | Why this reminder exists and what to do |
| status | enum | `pending`, `done`, `snoozed`, `cancelled` |
| snoozed_until | date | If snoozed, the new due date |
| source_touchpoint_id | text | Links to the touchpoint that generated this reminder |
| created_at | datetime | When this reminder was created |
| completed_at | datetime | When marked done |

## Tab: Daily Focus

| Column | Type | Description |
|---|---|---|
| date | date | The focus date |
| priority_1 | text | Top priority for the day |
| priority_2 | text | Second priority |
| priority_3 | text | Third priority |
| follow_ups_due | text | List of contacts needing attention today |
| reflection | text | End-of-day reflection / journal entry |
| bottlenecks | text | Recurring issues identified |
| created_at | datetime | When this entry was generated |

## Tab: Settings

| Column | Type | Description |
|---|---|---|
| key | text | Setting name |
| value | text | Setting value |

Default settings:

| Key | Default | Description |
|---|---|---|
| timezone | Asia/Singapore | Consultant's timezone |
| reminder_time | 08:00 | When daily reminders are sent |
| reminder_frequency | daily | `daily`, `weekdays`, `custom` |
| follow_up_default_days | 7 | Default days until follow-up if not specified |
| review_interval_months | 12 | Default months between client reviews |
| name | (consultant's name) | FC's name for personalisation |
| vault_dir | vault | Local Markdown vault/export directory |
| design_path | design.md | Optional design-token Markdown file for PDF/PPT output |
| design_scheme | awm-light | Preferred design scheme when multiple schemes are available |

## ID Generation

Use format: `{type_prefix}_{timestamp}_{random4}`
- Contacts: `c_20260513_a1b2`
- Touchpoints: `t_20260513_c3d4`
- Reminders: `r_20260513_e5f6`
