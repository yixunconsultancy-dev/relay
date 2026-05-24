# AWMOS Live Test Review - 2026-05-21

Source: `exports/awmosdemobot_telegram_session_20260521_155036.md`

## What Worked

- Hermes could operate the SQLite kit from Telegram: status, today, prep, log touchpoint, reminder creation, document generation, and PDF resend all worked.
- Voice notes were usable when Telegram/Hermes produced a clean transcript.
- The assistant made the right compliance call when asked to Google product details: it refused to invent Secure Flexi Term facts.
- The PDF resend path worked through `MEDIA:<path>`.

## Fixed Immediately

- `requirements.txt` now includes `pillow>=10.0.0`, because branded PDF generation failed in the live run until Pillow was installed manually.
- `appointment-summary Vincent 2026-05-24` now uses `2026-05-24` in generated filenames instead of today's date.
- Python tests cover the dated appointment-summary dry-run path.

Verification:

- `python3 -m unittest tests/test_relationship_os.py` passed, 17 tests.

## Bugs And Near-Term Implementation

1. Correction and merge flow

   The "Sarah" to "Sarah Lim" correction could cancel the mistaken reminder but could not move/delete/merge the mistaken touchpoint. Add app and/or CLI support for:
   - merge duplicate contacts
   - move touchpoint to another contact
   - move/cancel linked reminders
   - audit the correction

2. Fuzzy reminder completion

   "Marked the SRS thing done" failed because `complete-reminder` requires a contact or reminder ID. Add:
   - `search-reminders --query <text>` returning candidates
   - app UI for candidate confirmation
   - Hermes pattern: search first, ask "Did you mean...", then complete by ID

3. Duplicate reminder detection

   Demo Client already had duplicate pending reminders for the same date/context. Add duplicate warnings for:
   - same contact
   - same due date
   - highly similar context

4. Structured contact updates from Hermes

   The Vincent "write this in his contact page" request was logged as a touchpoint/profile note. Add a validated `update-contact` CLI command so Hermes can update fields like occupation, client status, policies, financial concerns, income, and notes without direct DB writes.

5. Policy tracking module

   Secure Flexi Term and premium details do not belong only in generic notes. Add a `Policies` table/module with:
   - contact_id
   - insurer
   - plan_name
   - policy_type
   - sum_assured
   - premium_amount
   - premium_frequency
   - start_date
   - review_date
   - notes

6. Assistant activity/debug timeline

   The user explicitly asked whether session logs are kept. Add a local debug timeline that stores:
   - inbound note/transcript
   - proposed structured payload
   - helper command run
   - created contact/touchpoint/reminder IDs
   - errors
   - generated document paths

## Voice-Note-First Capture

This should not be treated as "just log voice notes directly." The useful workflow is an inbox/draft capture system.

Recommended MVP:

- Add a `CaptureDrafts` table:
  - id
  - source: telegram_voice, telegram_text, app_quick_log
  - raw_text / transcript
  - audio_path if retained
  - proposed_payload_json
  - contact_candidates_json
  - status: pending, approved, rejected
  - created_at, approved_at
- Hermes writes uncertain voice captures to drafts instead of canonical touchpoints.
- App shows a Capture Inbox where the consultant can edit transcript, choose contact, review extracted fields, and approve.
- On approval, the app/agent calls existing validated write APIs.

Policy:

- Clean, high-confidence notes can still be logged directly.
- Low-confidence or mixed-language transcripts should become drafts.
- If audio is retained, copy it into a controlled local folder and set a retention policy. Do not rely on Hermes' transient `audio_cache` path.

## Product Knowledge Library

Do not make this ad-hoc web search. Make it a local approved-source library.

Recommended MVP:

- Add a Product Library section backed by local files plus structured metadata.
- Store approved product facts with:
  - product_name
  - provider/insurer
  - category
  - source_file
  - source_date/version
  - approved_summary
  - internal_notes
  - last_reviewed_at
  - retired/stale flag
- Allow import of brochures/PDFs/Markdown notes.
- Agent can draft a summary, but a human must approve it before it becomes usable in generated documents.
- Generated appointment summaries can cite the approved product library entry and source date.

Guardrails:

- If the library does not contain a product, the assistant should say so and ask for a source.
- Product facts should be shown as source-backed context, not financial recommendations.
- Client-facing documents should mark product context as draft/internal until reviewed.

## Suggested Build Order

1. Correction/merge flow.
2. Fuzzy reminder search and completion.
3. Structured contact update command for Hermes.
4. Capture Drafts / voice inbox.
5. Policy tracking table.
6. Product Knowledge Library.
7. Meeting prep mode that combines contact profile, policies, reminders, product notes, and generated documents.

## Other Observations

- Gateway memory jumped from roughly 199MB to 818MB after voice/doc activity. Worth watching across longer sessions.
- Telegram command menu registered 100 commands and hid 36. Consider reducing consultant-facing command noise.
- Several responses took 20-33 seconds. Acceptable for prototype, but worth improving for correction flows and document generation.
