# Relationship Rules

Rules governing how the bot tracks, scores, and manages client relationships.

## Relationship Stages

| Stage | Definition | Typical Signals |
|---|---|---|
| cold | No prior interaction or very old contact | No touchpoints, or last touch > 6 months ago |
| warming | Initial contact made, building rapport | 1-2 touchpoints, recent first meeting |
| warm | Active relationship, regular contact | 3+ touchpoints, meets regularly, mutual interest |
| hot | High engagement, likely conversion or active opportunity | Frequent contact, expressed intent, specific needs identified |
| client | Existing policyholder or active client | Has active policies, in servicing mode |
| inactive | Was active but has gone quiet | Was warm/hot/client but no touch in 90+ days |

## Stage Progression Rules

When logging a touchpoint, evaluate whether the stage should change:

1. **cold → warming**: First meaningful interaction logged
2. **warming → warm**: 3rd touchpoint logged, or FC explicitly marks as warm
3. **warm → hot**: FC mentions specific opportunity, client expresses buying intent, or FC marks as hot
4. **hot → client**: Policy recorded, or FC confirms conversion
5. **Any → inactive**: No touchpoint in 90 days (auto-flag, don't auto-change without FC confirmation)
6. **inactive → warming**: New touchpoint logged after inactive period

Never auto-downgrade a stage without flagging the FC first. Stage upgrades can be auto-suggested but should be confirmed.

## Touchpoint Scoring

Each touchpoint has implicit weight for relationship health:

| Type | Weight | Notes |
|---|---|---|
| meeting (in-person) | 5 | Strongest relationship signal |
| lunch/coffee | 4 | Social context, high trust |
| call | 3 | Direct but less personal |
| event | 2 | Shared experience |
| message | 1 | Low-touch but maintains presence |
| referral | 5 | Strong trust indicator (giving or receiving) |

## Health Indicators

Flag contacts that may need attention:

- **Cooling**: Warm or hot contact with no touchpoint in 30 days
- **At risk**: Client with no touchpoint in 60 days
- **Dormant**: Any contact with no touchpoint in 90 days
- **Overdue review**: Client past their next_review_date

## Contact Deduplication

When parsing a name from input:

1. Exact match on full name → use existing contact
2. Fuzzy match (first name only, common nickname) → suggest match, ask FC to confirm
3. No match → create new contact, flag for FC review if name is very common

## Family and Network Tracking

When the FC mentions family members:

- Store in the contact's `family` field
- If a family member becomes a separate contact, link them via notes
- Track referral chains: who introduced whom
