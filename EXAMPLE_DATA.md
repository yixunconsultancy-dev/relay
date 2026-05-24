# Example Data - What The Consultant View Looks Like

This file includes future-flavored relationship examples. In v0, candidate,
advisor coaching, and policy details are stored as contacts, touchpoints, notes,
topics, and reminders. Dedicated recruitment, coaching, and policy tabs are
future modules.

This shows what each structured table or mirrored sheet-style view looks like
with realistic sample data after a few days of use.

---

## Tab: Contacts

| id | name | type | relationship_stage | phone | email | occupation | company | birthday | family | policies | financial_concerns | interests | referral_source | next_review_date | last_touch_date | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| c_20260510_a1b2 | Tan Wei Ming | client | client | +65 9123 4567 | weiming@email.com | Business Owner | WM Trading Pte Ltd | 1985-03-14 | Wife: Sarah, Son: Ethan (3), Daughter: Chloe (newborn) | Term Life $500k (AIA), CI $200k (Prudential), Investment-linked $50k/yr | Retirement planning, education fund for kids, income protection gap | Golf, wine collecting | Cold call 2023 | 2026-05-13 | Very analytical. Prefers data over stories. Wife influences decisions. |
| c_20260510_c3d4 | Sarah Lim | prospect | warm | +65 8234 5678 | sarah.lim@gmail.com | Marketing Director | Unilever | 1990-07-22 | Husband: David, No kids | None | Wants to start investing, unsure about insurance | Running, travel | Referral from Wei Ming | 2026-05-20 | 2026-05-09 | Referred by Wei Ming after lunch. Interested but cautious. |
| c_20260511_e5f6 | Marcus Tan | candidate | warming | +65 9345 6789 | marcus.t@outlook.com | Fresh graduate | — | 2001-11-03 | Parents: both teachers | — | High income ambition, parents skeptical about FA career | Crypto, fitness | LinkedIn outreach | — | 2026-05-11 | Strong communicator. Needs to see earning potential to commit. Parents need convincing. |
| c_20260512_g7h8 | Jason Wong | advisor | warm | +65 8456 7890 | jason.w@awm.com | Financial Advisor | AWM | 1995-06-18 | Single | — | — | Basketball | Recruited 2025 | — | 2026-05-12 | 8 months in. Good activity but struggles with closing. Confidence issue. |

---

## Tab: Touchpoints

| id | contact_id | contact_name | date | type | sentiment | summary | topics | action_items | meeting_number | raw_input |
|---|---|---|---|---|---|---|---|---|---|---|
| t_20260509_a1b2 | c_20260510_c3d4 | Sarah Lim | 2026-05-09 | lunch | positive | Second meeting with Sarah. She's interested in retirement planning but wants to understand options before committing. Mentioned she's going to Japan 10-22 May. | retirement, investment | Follow up after Japan trip, prepare retirement comparison | 2 | Had lunch with Sarah today, second time meeting, she's in Japan from 10-22 May, maybe business next. |
| t_20260511_c3d4 | c_20260511_e5f6 | Marcus Tan | 2026-05-11 | meeting | mixed | First interview with Marcus. Very ambitious but parents are against FA career. Needs to see real earnings data. Suggested he shadow me for a day. | recruitment, onboarding | Send earnings breakdown, arrange shadowing day | 1 | Met Marcus, fresh grad, high income ambition, parents skeptical. Offered shadowing day next week. |
| t_20260512_e5f6 | c_20260512_g7h8 | Jason Wong | 2026-05-12 | call | neutral | Weekly check-in with Jason. He had 5 meetings last week but closed 0. Says prospects keep asking to "think about it." Classic closing issue. | coaching, closing, confidence | Prepare closing roleplay for next 1-on-1, review his meeting scripts | 4 | Called Jason for weekly check. 5 meetings zero close again. Prospects all say think about it. Need to work on his closing. |
| t_20260513_g7h8 | c_20260510_a1b2 | Tan Wei Ming | 2026-05-13 | meeting | positive | Annual review with Wei Ming. New daughter Chloe born in March. Wants to add education fund and increase CI coverage. Wife Sarah joined — she wants liquidity, prefers investment-linked. Follow up next Tuesday with SRS angle. | annual review, CI, education fund, investment-linked | Prepare education fund comparison, CI top-up options, SRS illustration for wife | 6 | Annual review with Wei Ming. New baby Chloe born March. Wants education planning. Wife prefers liquidity. Follow up Tuesday with SRS angle. |

---

## Tab: Reminders

| id | contact_id | contact_name | due_date | type | priority | context | status | snoozed_until | source_touchpoint_id |
|---|---|---|---|---|---|---|---|---|---|
| r_20260509_a1b2 | c_20260510_c3d4 | Sarah Lim | 2026-05-23 | follow_up | medium | Follow up after Japan trip. Ask about the trip, then warm into retirement planning conversation. | pending | — | t_20260509_a1b2 |
| r_20260511_c3d4 | c_20260511_e5f6 | Marcus Tan | 2026-05-14 | follow_up | medium | Send earnings breakdown and arrange shadowing day. | pending | — | t_20260511_c3d4 |
| r_20260512_e5f6 | c_20260512_g7h8 | Jason Wong | 2026-05-15 | follow_up | high | Prepare closing roleplay exercise for 1-on-1. Review his meeting scripts before the session. | pending | — | t_20260512_e5f6 |
| r_20260513_g7h8 | c_20260510_a1b2 | Tan Wei Ming | 2026-05-20 | follow_up | high | Prepare education fund comparison, CI top-up options, and SRS illustration. Tuesday follow-up meeting. | pending | — | t_20260513_g7h8 |
| r_20260510_h1j2 | c_20260510_a1b2 | Tan Wei Ming | 2026-06-14 | birthday | medium | Wei Ming's wife Sarah birthday on Jul 22. Consider small gift or card. | pending | — | — |
| r_20260510_k3l4 | c_20260510_a1b2 | Tan Wei Ming | 2027-05-13 | review | high | Annual review due. Last review was 2026-05-13. | pending | — | t_20260513_g7h8 |

---

## Tab: Daily Focus

| date | priority_1 | priority_2 | priority_3 | follow_ups_due | reflection | bottlenecks |
|---|---|---|---|---|---|---|
| 2026-05-13 | Annual review with Tan Wei Ming (10am) | Prepare closing roleplay for Jason Wong | Review Marcus Tan shadowing logistics | Sarah Lim (Japan trip ends 22 May — reminder 23 May), Jason Wong (weekly check-in) | Good review with Wei Ming. Wife joining was unexpected but useful — she's the real decision maker on investments. Need to prepare SRS numbers. Jason still struggling, might need to escalate coaching approach. | Jason's closing issue is recurring — 3rd week of zero close. Standard roleplay may not be enough. Consider confidence-first approach instead of technique. |
| 2026-05-14 | Send Marcus Tan earnings data | Draft education fund comparison for Wei Ming | Prep Jason's roleplay materials | Marcus Tan (send earnings breakdown, arrange shadowing) | — | — |

---

## Tab: Settings

| key | value |
|---|---|
| timezone | Asia/Singapore |
| reminder_time | 08:00 |
| reminder_frequency | weekdays |
| follow_up_default_days | 7 |
| review_interval_months | 12 |
| name | Luc |

---

## How it flows

Here's the scenario that produced the data above:

**Day 1 (May 9):** Luc texts the bot:
> "Had lunch with Sarah today, second time meeting, she's in Japan from 10-22 May, maybe business next."

The bot creates Sarah's contact (warm, prospect), logs the lunch touchpoint, and sets a follow-up reminder for May 23 (after her trip).

**Day 2 (May 11):** Luc texts:
> "Met Marcus, fresh grad, high income ambition, parents skeptical. Offered shadowing day next week."

The bot creates Marcus (warming, candidate), logs the interview, and sets a follow-up for May 14.

**Day 3 (May 12):** Luc texts:
> "Called Jason for weekly check. 5 meetings zero close again. Prospects all say think about it. Need to work on his closing."

The bot logs the coaching touchpoint for Jason (advisor), flags the closing issue, and sets a high-priority reminder to prepare roleplay materials.

**Day 4 (May 13):** Luc texts:
> "Annual review with Wei Ming. New baby Chloe born March. Wants education planning. Wife prefers liquidity. Follow up Tuesday with SRS angle."

The bot updates Wei Ming's contact (adds Chloe to family), logs the review touchpoint, creates a follow-up for Tuesday with specific prep items, and schedules the next annual review for 2027.

**Morning of May 13:** Luc asks "plan my day" and gets the Daily Focus summary showing his top 3 priorities and who needs attention.
