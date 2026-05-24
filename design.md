# AWM Relationship OS Kit — Deliverable Design Schemas

This file defines two implementable visual schemes for bot-generated Relationship OS Kit deliverables: a dark internal working mode and a light client-facing/advisory documentation mode.

The purpose is not to make the kit feel like a public SaaS product. The purpose is to make consultant outputs calm, legible, private, and professional across PPT, PDF/Word-style documents, and Markdown notes.

## Source direction

Built from:

- `references/brand-recommendations.md`: Relationship OS positioning, private operating aid, direct/calm/boundaried voice.
- `SOUL.md`: internal practice assistant boundaries, no sending, no financial recommendations, no pretending writes succeeded.
- AWM canonical design system: true black/charcoal base, restrained gold accent, Cormorant Garamond + Barlow + JetBrains Mono, angular 2-6px geometry, no emoji, no pill buttons, no bright SaaS colors.

## Shared design principles

- Boring and robust beats flashy. Outputs should survive PDF export, screenshots, printing, and consultant reuse.
- Use hierarchy, spacing, and thin rules instead of decoration.
- Gold is an accent, not a background flood.
- Mark private/internal material clearly. The Relationship OS is an operating aid, not an official client communication system.
- Use plain text fallbacks in Markdown. Never rely on images or icons to carry meaning.
- Preserve per-consultant data isolation. Deliverables should never imply shared data, central CRM status, or compliance approval.

---

# Scheme 1 — Dark mode: Private Command Desk

## Visual rationale

Private Command Desk is for the FC's own late-night preparation work: meeting prep, relationship review, follow-up triage, and draft analysis. It uses the AWM true-black system with charcoal surfaces and restrained gold markers so the output feels focused, quiet, and premium without becoming theatrical. It should look like a disciplined internal desk, not a chatbot transcript or dashboard toy.

## Color tokens

Use these tokens for dark-mode PPT slides, HTML/PDF reports, and Markdown-to-HTML exports.

```css
:root[data-scheme="awm-dark"] {
  --ros-bg: #050505;
  --ros-surface: #0E0E0E;
  --ros-surface-raised: #1A1A1A;
  --ros-border: #2A2A2A;
  --ros-border-subtle: rgba(255,255,255,0.08);

  --ros-text: #F5F1E8;
  --ros-text-soft: #D8D0C3;
  --ros-text-muted: #A6A6A6;
  --ros-text-faint: #6F6F6F;

  --ros-accent: #C6A34F;
  --ros-accent-bright: #E2BC6A;
  --ros-accent-dim: rgba(198,163,79,0.35);
  --ros-accent-wash: rgba(198,163,79,0.10);

  --ros-success: #7A8F62;
  --ros-warning: #B58B3B;
  --ros-error: #B85C52;

  --ros-chart-1: #C6A34F;
  --ros-chart-2: #8F7B4A;
  --ros-chart-3: #B7B0A4;
  --ros-chart-4: #5F6B5A;
  --ros-chart-grid: rgba(255,255,255,0.10);
}
```

Implementation notes:

- Primary background: `#050505`.
- Cards and tables: `#0E0E0E` or `#1A1A1A`.
- Borders: `#2A2A2A`, 1px.
- Accent: `#C6A34F` only. Use bright gold only for small active highlights.
- Avoid cyan, blue, purple, bright green, gradients, and neon effects in this scheme.

## Typography stack

Preferred stack:

- Display / cover title: `Cormorant Garamond`, Georgia, serif.
- Body / tables / notes: `Barlow`, `Helvetica Neue`, Arial, sans-serif.
- Condensed labels: `Barlow Condensed`, `Arial Narrow`, Arial, sans-serif.
- Mono / IDs / metadata: `JetBrains Mono`, `SFMono-Regular`, Consolas, monospace.

PPT fallback stack:

- If custom fonts are unavailable, use Georgia for display and Arial for body.
- Do not use decorative fonts or Calibri-heavy default styling if avoidable.

Type scale:

```text
Cover title:      52-64px, Cormorant Garamond, 300, line-height 1.05, tracking -0.02em
Slide title:      34-44px, Cormorant Garamond, 300/400, line-height 1.12
Section label:    12-14px, Barlow Condensed, 600, uppercase, tracking 0.16em
Body:             16-18px, Barlow, 400, line-height 1.5
Small body:       13-14px, Barlow, 400, line-height 1.45
Caption:          11-12px, Barlow, 400, line-height 1.35, muted
Mono metadata:    11-13px, JetBrains Mono, 400/500, line-height 1.4
Table header:     11-12px, Barlow Condensed, 600, uppercase, tracking 0.10em
Table cell:       12-14px, Barlow, 400, line-height 1.35
```

Rationale: Cormorant gives AWM editorial gravitas, Barlow keeps operational outputs readable, and JetBrains Mono makes IDs/dates/source records feel structured.

## Spacing scale

Use a simple 4px-derived scale so the Developer can translate it directly into CSS variables, `python-pptx` point values, and ReportLab constants.

```text
space-1:   4px
space-2:   8px
space-3:   12px
space-4:   16px
space-5:   20px
space-6:   24px
space-8:   32px
space-10:  40px
space-12:  48px
space-16:  64px
space-20:  80px
space-24:  96px
```

Slide margins:

- 16:9 PPT: 56px left/right, 44px top/bottom.
- Dense chart slides: 44px left/right, 36px top/bottom.
- Cover slide: 72px left/right, 64px top/bottom.

Document margins:

- A4/Letter PDF: 54pt outer margin, 46pt top, 50pt bottom.
- Tables: 8-10pt cell padding.
- Markdown: one blank line between blocks; avoid nested lists beyond two levels.

## Shape and elevation

```text
Radius:         2px small, 4px default, 6px large. Never pill.
Border:         1px solid #2A2A2A or rgba(255,255,255,0.08).
Shadow:         Optional only in HTML/PDF: 0 8px 32px rgba(0,0,0,0.55).
Gold rule:      1px line, #C6A34F at 45-70% opacity.
Watermark:      8-10% opacity text or logo; never compete with content.
```

---

# Scheme 2 — Light mode: Cypress Ledger

## Visual rationale

Cypress Ledger is for client-facing or client-adjacent advisory materials that need to feel AWM-aligned without pretending to be official compliance-approved collateral. It uses warm paper, deep cypress/forest ink, bonsai-like restraint, thin gold rules, and lots of whitespace. The mood is natural, calm, and precise: a consultant's prepared advisory note, not a marketing brochure.

## Color tokens

Use these tokens for proposals, client review notes, printable PDFs, and light-mode slide exports.

```css
:root[data-scheme="awm-light"] {
  --ros-bg: #FAF7F0;
  --ros-paper: #FFFDF8;
  --ros-surface: #F3EBDD;
  --ros-surface-raised: #FFFFFF;
  --ros-border: #D8CDBA;
  --ros-border-strong: #B9AA8D;

  --ros-ink: #18231E;
  --ros-ink-soft: #334139;
  --ros-text: #1B1B18;
  --ros-text-soft: #4A473F;
  --ros-text-muted: #777064;
  --ros-text-faint: #A49A8A;

  --ros-accent: #C6A34F;
  --ros-accent-bright: #DDB966;
  --ros-accent-deep: #815D46;
  --ros-accent-wash: #F1E4BF;

  --ros-cypress: #22372D;
  --ros-moss: #6F7A55;
  --ros-clay: #815D46;
  --ros-sand: #EFCFA0;

  --ros-success: #6F7A55;
  --ros-warning: #B58B3B;
  --ros-error: #9F514A;

  --ros-chart-1: #18231E;
  --ros-chart-2: #C6A34F;
  --ros-chart-3: #6F7A55;
  --ros-chart-4: #815D46;
  --ros-chart-grid: #E1D7C6;
}
```

Implementation notes:

- Main page background: `#FAF7F0` or white paper `#FFFDF8`.
- Primary ink: `#18231E` for headings, rules, and logo treatment.
- Gold remains the premium accent, used for thin lines, section numbers, and selected chart values.
- Cypress/moss/clay are secondary support tones for nature warmth, not a multi-color decorative palette.
- Avoid pale low-contrast grey text. Use `#4A473F` for secondary copy.

## Typography stack

Preferred stack:

- Display / cover title: `Cormorant Garamond`, Georgia, serif.
- Body / explanatory text: `Barlow`, `Helvetica Neue`, Arial, sans-serif.
- Condensed labels: `Barlow Condensed`, `Arial Narrow`, Arial, sans-serif.
- Mono / source metadata: `JetBrains Mono`, `SFMono-Regular`, Consolas, monospace.

Type scale:

```text
Cover title:      48-60px, Cormorant Garamond, 300/400, line-height 1.08
Slide title:      32-40px, Cormorant Garamond, 300/400, line-height 1.12
Document h1:      28-34pt, Cormorant Garamond, 400, line-height 1.1
Document h2:      18-22pt, Cormorant Garamond, 500, line-height 1.18
Section label:    10-12pt, Barlow Condensed, 600, uppercase, tracking 0.14em
Body:             10.5-11.5pt PDF / 16px HTML, Barlow, 400, line-height 1.5
Caption:          8.5-9.5pt PDF / 12px HTML, Barlow, 400, muted
Mono metadata:    8.5-10pt PDF / 12px HTML, JetBrains Mono, 400
Table header:     8.5-9.5pt, Barlow Condensed, 600, uppercase
Table cell:       9.5-10.5pt, Barlow, 400
```

Rationale: the light scheme should read like a premium memo. The serif heading makes it feel considered; the sans body keeps it operational and scannable.

## Spacing scale

Use the same base scale as dark mode for implementation simplicity.

```text
space-1:   4px
space-2:   8px
space-3:   12px
space-4:   16px
space-5:   20px
space-6:   24px
space-8:   32px
space-10:  40px
space-12:  48px
space-16:  64px
space-20:  80px
space-24:  96px
```

Document margins:

- Client-facing PDF: 58pt left/right, 52pt top, 54pt bottom.
- Proposal: 64pt cover margins, 52pt body margins.
- Review note: 48pt margins for denser content.
- Table padding: 7-9pt vertical, 9-12pt horizontal.

Slide margins:

- Cover: 76px left/right, 64px top/bottom.
- Content: 56px left/right, 44px top/bottom.
- Chart: 52px left/right, 40px top/bottom.

## Shape and elevation

```text
Radius:         2px small, 4px default, 6px large. No pills.
Border:         1px solid #D8CDBA.
Gold rule:      1px #C6A34F, usually horizontal or left accent.
Cypress rule:   1px #18231E at 25-45% opacity.
Shadow:         Avoid in print. Use borders and paper layering instead.
Texture:        Optional very subtle warm paper tint only; no visible pattern required.
```

## Logo and asset usage

Use AWM assets only where they support clarity and ownership:

- Dark logo on light materials: `/Users/luc/Documents/paperclip/AWM Design System/assets/logo_dark.png`.
- Light/reversed logo on dark materials: `/Users/luc/Documents/paperclip/AWM Design System/assets/logo_light.png`.
- Minimum width: 80px in slides; 54pt in PDF/document headers.
- Preferred placement: cover centered or top-left; internal pages top-left or footer-left.
- Watermark use: bottom-right, 6-10% opacity, only on generated internal drafts or review copies.
- Do not place logo next to statements that imply official AIA/FA compliance approval unless that approval exists.
- For Relationship OS-specific internal outputs, a text lockup is acceptable: `AWM Relationship OS Kit` in Barlow Condensed uppercase with a thin gold rule.

Optional background assets:

- Use `bg_mountain_clouds.png`, `bg_dark_water.jpg`, or `bg_network_mesh.png` only for title/section slides.
- Do not use photographic backgrounds in dense documents or Markdown exports.
- For Cypress Ledger, favor white/cream paper and thin botanical restraint over full-bleed photography.

---

# Branded asset usage — per deliverable, per scheme

Use these rules when implementing generated Relationship OS PPT, PDF, and Markdown deliverables. All asset paths reference the canonical AWM Design System source directory:

`/Users/luc/Documents/paperclip/AWM Design System/assets/`

Do not invent substitute marks, illustrations, or stock imagery. Use the filenames below exactly, and keep the required footer attribution visible on every generated slide/page/export:

`Private FC operating aid. Not financial advice. Review before any client-facing use.`

## Asset use defaults

- Dark surfaces use `logo_white_wordmark.png` for covers and primary document headers; use `logo_white_mark.png` only as a small watermark or compact footer mark.
- Light surfaces use `logo_dark.png` as the primary mark. `logo_light.png` is reserved for reversed marks on dark or image-backed panels, not white paper.
- Full-bleed photography is for PPT covers and proposal covers only. Body slides/pages must use restrained cropped strips, low-opacity watermarks, or no imagery.
- Text over imagery always requires a scrim or solid text panel. Minimum contrast target is WCAG AA; if in doubt, increase overlay opacity before increasing type size.
- Footer attribution sits in the safe area on every slide/page: 11px/8.5pt Barlow or JetBrains Mono, never below 55% contrast against its background.

## Contrast contract for branded assets

This contract exists because the scheme name alone is not enough: a dark export must paint a dark surface before using cream ink, and a light export must use dark cypress/charcoal ink on cream or white paper. The Developer should verify rendered PNG/PDF previews against these foreground/background pairs, not only against token names.

| Surface | Background / image treatment | Foreground hex | Contrast assertion |
|---|---|---|---|
| PPT dark cover | `bg_dark_water.jpg` + `#050505` / `#000000` scrim at 58-65%; increase to 75% if text crosses gold reflection | heading `#F5F1E8`, body `#D8D0C3` | AA pass. Fallback `#050505` / `#F5F1E8` = 18.08:1; `#050505` / `#D8D0C3` = 13.33:1. |
| PPT dark body | solid `#050505`; `bg_constellation.png` watermark limited to 10-14% and kept out of dense text areas | heading `#F5F1E8`, body `#D8D0C3` | AA pass. Plain dark surface body pair = 13.33:1. |
| PPT light cover | `#FAF7F0` cream with `bg_mountain_clouds.png` faded/masked; image never under text | heading `#18231E`, body `#4A473F` | AA pass. `#FAF7F0` / `#18231E` = 15.12:1; `#FAF7F0` / `#4A473F` = 8.67:1. |
| PPT light body | `#FAF7F0` canvas and `#FFFDF8` cards; watermark at 5-8% only outside text | heading `#18231E`, body `#4A473F` | AA pass. Weakest listed body pair remains 8.67:1. |
| PDF appointment dark | page fill `#050505`; content panels `#0E0E0E`; no implicit white paper | heading `#F5F1E8`, body `#D8D0C3` | AA pass. `#0E0E0E` / `#F5F1E8` = 17.13:1; `#0E0E0E` / `#D8D0C3` = 12.62:1. |
| PDF appointment light | page fill `#FAF7F0` or `#FFFDF8`; no body imagery | heading `#18231E`, body `#4A473F` or `#1B1B18` | AA pass. `#FFFDF8` / `#1B1B18` = 16.98:1; `#FFFDF8` / `#4A473F` = 9.12:1. |
| PDF proposal dark | cover `bg_mountain_dusk.jpeg` + 62-70% black overlay; interiors `#050505` / `#0E0E0E` | heading `#F5F1E8`, body `#D8D0C3` | AA pass on painted dark interiors; cover must add local title panel if the moon/sky crosses text. |
| PDF proposal light | cream/paper field `#FFFDF8` over `#FAF7F0`; clouds only outside body copy | heading `#18231E`, body `#4A473F` / `#1B1B18` | AA pass. No image may sit behind assumptions, tables, or required language. |
| Markdown raw notes | portable plain text; renderer theme owns contrast | n/a | No visual contrast dependency in raw Markdown. |

Forbidden pairings: cream `#F5F1E8` text on white/cream PDF paper; gold `#C6A34F` as paragraph/body copy; pale beige body copy over `bg_mountain_clouds.png`; any watermark under text that drops actual rendered contrast below WCAG AA 4.5:1.

## 1. PPT slides — dark scheme (`awm-dark`)

Look and feel: dark-water full-bleed cover with white wordmark top-left and a 60% black scrim under the title block.

- Cover background asset: `bg_dark_water.jpg` full-bleed on the 16:9 canvas, cropped center-right so gold reflections sit in the lower-right third and do not sit directly under the title.
- Cover treatment: overlay `#050505` at 58-65% alpha across the whole slide; add a second local title-panel scrim at `rgba(0,0,0,0.42)` behind the title if the crop is busy.
- Cover logo: `logo_white_wordmark.png`, top-left, 112-132px wide, 56px from left and 44px from top. Keep at 100% opacity.
- Cover text safe area: title block left-aligned within x=72px to x=680px, y=210px to y=520px. No text may cross into the brightest water reflection zone.
- Body background asset: `bg_constellation.png` as a top-right atmospheric watermark only, 34-42% of slide width, aligned to top/right, opacity 10-14%. Body canvas remains solid `#050505`.
- Body logo: `logo_white_mark.png`, bottom-right watermark, 42-52px wide, 8% opacity; omit if the slide already contains a dense chart.
- Body content: cards use `#0E0E0E` with 1px `#2A2A2A` borders; optional 1px gold rule under the section label.
- Footer rule: attribution bottom-left at x=56px, y=bottom safe area, `#A6A6A6` at 80% opacity; slide/page number bottom-right. If a third-party or source-heavy slide is generated, add `Source: Relationship OS notes / consultant review required` above the footer in muted text.

## 2. PPT slides — light scheme (`awm-light`, cypress/bonsai-compatible)

Look and feel: warm paper slide with a faded mountain-cloud wash at the edge, dark AWM mark top-left, and a thin gold rule anchoring the title.

- Cover background asset: `bg_mountain_clouds.png`, not full strength. Place as a right-side vertical image field covering the right 38-44% of the slide, crop to the soft cloud/mountain area, opacity 16-22% over `#FAF7F0`.
- Cover mask: apply a left-to-right cream gradient/mask so the image fades to transparent before x=58% of the slide. If gradient support is unreliable, place a `#FAF7F0` rectangle at 88-92% opacity over the image.
- Cover logo: `logo_dark.png`, top-left, 96-116px wide, 56px from left and 42px from top.
- Cover text safe area: title block left-aligned from x=76px to x=660px. Never set type directly over the faded image; the image is atmosphere only.
- Body background asset: `bg_network_mesh.png` as a bottom-right paper watermark, 32-36% slide width, opacity 5-8%, masked/faded to `#FAF7F0`. Do not use dark full-bleed body imagery.
- Body logo: `logo_dark.png` in the header, 72-84px wide, top-left; use a text lockup instead if vertical space is tight.
- Body content: `#FFFDF8` cards on `#FAF7F0`, 1px `#D8CDBA` borders, cypress headings, gold as a thin rule only.
- Footer rule: attribution bottom-left in `#777064`; page/slide number bottom-right. Add a 1px `#D8CDBA` horizontal rule 18px above the footer on body slides.

## 3. PDF appointment summary — dark scheme

Look and feel: black working memo with a compact white AWM header band, low-opacity mark watermark, and print-safe tables.

- Header asset: `logo_white_wordmark.png` in a solid `#050505` header band, 54-64pt wide, aligned left with the document margin.
- Header band placement: full page width, 42-48pt high; logo baseline visually centered. Add a 1pt gold rule at the bottom of the band at 55% opacity.
- Body imagery: no photographic backgrounds. Use `logo_white_mark.png` as an optional bottom-right watermark only, 48-60pt wide, 6-8% opacity.
- Treatment: dark PDFs must print acceptably. Use `#0E0E0E` sections and `#2A2A2A` borders, but avoid large image fills and avoid text below 8.5pt.
- Text readability: all body copy sits on solid fill, not image. Tables use alternating `#0E0E0E` and `#131313` fills with off-white text.
- Footer attribution: every page, bottom-left inside the 50pt bottom margin, 8.5pt `#A6A6A6`; page number bottom-right.

## 4. PDF appointment summary — light scheme

Look and feel: restrained cream appointment note with dark AWM logo, cypress section headings, and only a faint structural watermark.

- Header asset: `logo_dark.png`, 54-62pt wide, top-left inside the 52pt top margin.
- Header treatment: no heavy band. Use a 1pt gold rule under the metadata row, 120-160pt long, aligned left.
- Optional background asset: `bg_network_mesh.png` cropped to the lower-right corner, 110-140pt wide, opacity 4-6%, clipped so it never touches body text.
- Body treatment: page background `#FAF7F0`, content panels `#FFFDF8`, borders `#D8CDBA`. Use cypress `#18231E` for headings.
- Text readability: imagery may not appear behind metadata, tables, or action lists. If the watermark conflicts with table continuation pages, remove it.
- Footer attribution: bottom-left, 8.5pt `#777064`; page number bottom-right; footer line must remain visible in grayscale print.

## 5. PDF proposal — dark scheme

Look and feel: cinematic dark proposal cover using mountain dusk, then restrained black interiors with a quiet AWM watermark.

- Cover background asset: `bg_mountain_dusk.jpeg` full-bleed, cropped so the moon/bright sky does not sit behind the title. Use the darker lower/side region for type.
- Cover treatment: overlay `#050505` at 62-70% alpha; add a bottom-up black gradient or solid title panel if export tooling cannot guarantee contrast.
- Cover logo: `logo_white_wordmark.png`, centered near top or top-left, 118-150px wide / 70-86pt wide. Use top-left for operational proposals, centered for more formal discussion drafts.
- Cover text safe area: title and client/date block sit in a solid or scrimmed area with at least 40px/30pt padding. Use Cormorant for title, Barlow for metadata.
- Interior asset: `logo_white_mark.png` bottom-right watermark, 48pt wide, 6% opacity, or no watermark on dense table pages.
- Interior treatment: no full-bleed photography. Use black canvas with `#0E0E0E` panels and gold section dividers. Any section opener may use a 20-24pt high crop strip from `bg_dark_water.jpg` at 18-24% opacity under a dark overlay.
- Text readability: all proposal body copy is on solid panels. Do not set compliance language over photography.
- Footer attribution: every page in muted off-white, bottom-left. Cover footer may sit over the scrim at 80% opacity; interior footer sits below a `#2A2A2A` rule.

## 6. PDF proposal — light scheme

Look and feel: premium cypress-on-cream discussion draft with a soft mountain-cloud cover field and minimal botanical restraint.

- Cover background asset: `bg_mountain_clouds.png`, placed as a top or right image field only, opacity 14-18%, masked into cream. Do not use full-bleed dark photography for light proposals.
- Cover logo: `logo_dark.png`, top-left or centered, 64-78pt wide. Keep at 100% opacity.
- Cover treatment: `#FFFDF8` paper field over `#FAF7F0`, 1pt `#D8CDBA` border, 1pt gold rule under the document title. Image may sit outside the paper field as atmosphere.
- Interior asset: `bg_network_mesh.png` as a 4-5% opacity lower-right watermark on section opener pages only; omit on normal body pages.
- Interior treatment: cypress headings, warm paper panels, gold rules under H1/H2. Use `logo_dark.png` in the running header at 48-54pt wide for formal pages; otherwise text lockup is sufficient.
- Text readability: no image behind body text, tables, assumptions, or required language. Keep body text at 10.5-11.5pt and secondary text no lighter than `#777064`.
- Footer attribution: every page bottom-left in `#777064`; page number bottom-right. Include draft/review language near the cover footer: `Draft prepared from private Relationship OS notes. Review and adapt before client use.`

## 7. Markdown — Obsidian contact note

Look and feel: clean plain Markdown contact record with an optional sibling AWM banner path, not a decorative document.

- Markdown file treatment: keep the `.md` body plain. Do not embed HTML styling or image-dependent meaning.
- Optional banner asset: `bg_network_mesh.png` copied by the generator into a sibling assets folder only when exporting a styled preview, e.g. `./assets/bg_network_mesh.png`.
- Banner placement guidance: if used, add a single top link after frontmatter: `![[assets/bg_network_mesh.png]]` for Obsidian-style vaults or `![AWM relationship context banner](assets/bg_network_mesh.png)` for portable Markdown.
- Banner treatment: export/preview renderer must crop to a 6:1 horizontal strip, opacity 8-12% over dark previews or 4-6% over light previews. In raw Markdown it remains optional and removable.
- Logo guidance: do not place AWM logos inside routine contact notes by default. If a styled HTML/PDF preview is generated, use `logo_dark.png` or `logo_white_mark.png` in the preview chrome, not as note content.
- Footer/privacy: include the plain-text privacy line near the top and/or frontmatter: `privacy: private_operating_aid`. No visual footer required in raw Markdown.

## 8. Markdown — appointment-summary `.md`

Look and feel: plain appointment summary Markdown with optional exported banner only; the note itself stays portable and consultant-readable.

- Markdown file treatment: frontmatter records `scheme: awm-dark` or `scheme: awm-light`; body starts with H1, metadata, and the privacy line.
- Optional banner asset for styled export: use `bg_mountain_clouds.png` for `awm-light` previews and `bg_dark_water.jpg` for `awm-dark` previews, copied into the output's sibling assets folder if the generator needs offline rendering.
- Banner placement: if the consultant wants visible branding in Obsidian, place one image link directly after frontmatter and before H1. Otherwise omit the banner entirely.
- Banner treatment: crop to 6:1 or 8:1 strip. Dark preview uses `bg_dark_water.jpg` with 55-65% black overlay and `logo_white_wordmark.png` in the top-left of the preview chrome. Light preview uses `bg_mountain_clouds.png` at 8-12% opacity over cream with `logo_dark.png` in preview chrome.
- Text readability: never rely on the image to label the document. The H1, metadata, review state, and source notes must be readable in any Markdown viewer without assets.
- Footer/privacy: raw Markdown repeats the privacy line near the top. Styled PDF/HTML exports add the required footer attribution on every page.

## Implementation asset checklist

- Required logo files: `logo_white_wordmark.png`, `logo_white_mark.png`, `logo_light.png`, `logo_dark.png`.
- Required background files: `bg_dark_water.jpg`, `bg_mountain_clouds.png`, `bg_mountain_dusk.jpeg`, `bg_city_night.jpg`, `bg_network_mesh.png`, `bg_constellation.png`, `bg_roses_dark.jpg`.
- Preferred choices in this spec: `bg_dark_water.jpg`, `bg_mountain_clouds.png`, `bg_mountain_dusk.jpeg`, `bg_network_mesh.png`, `bg_constellation.png`, `logo_white_wordmark.png`, `logo_white_mark.png`, `logo_dark.png`.
- Available but not default for Relationship OS generated deliverables: `bg_city_night.jpg` is too surveillance/nocturnal for client-facing Relationship OS documents; reserve for CRM/demo dashboards. `bg_roses_dark.jpg` is premium but too decorative for operating-aid documents; reserve for closing/deck accent slides. `logo_light.png` remains a fallback reversed mark when the full white wordmark is visually too wide.

---

# Component styles

## Cover slide

Dark mode:

```text
Canvas:       #050505
Background:   optional dark water/network image at 18-30% opacity, or no image
Logo:         top-left or centered, light logo, 80-120px wide
Eyebrow:      Barlow Condensed, uppercase, #C6A34F, 13px, tracking 0.18em
Title:        Cormorant Garamond, #F5F1E8, 56-64px
Subtitle:     Barlow, #A6A6A6, 18-20px
Footer:       JetBrains Mono, #6F6F6F, 11px
Rule:         1px gold line, 80-160px wide under title
```

Light mode:

```text
Canvas:       #FAF7F0 or #FFFDF8
Logo:         top-left or centered, dark logo, 90-120px wide
Eyebrow:      Barlow Condensed, uppercase, #815D46, 12-13px, tracking 0.16em
Title:        Cormorant Garamond, #18231E, 52-60px
Subtitle:     Barlow, #4A473F, 17-19px
Footer:       JetBrains Mono, #777064, 10-11px
Rule:         1px #C6A34F, 100-180px wide
```

Rationale: covers should make the deliverable feel intentional and private before any data appears.

## Content slide

Dark mode:

```text
Header:       section label left, date/status right
Title:        36-42px Cormorant, off-white
Body:         17px Barlow, muted off-white
Layout:       60/40 or 50/50 columns with 32-48px gutter
Cards:        #0E0E0E fill, #2A2A2A border, 4px radius, 20-24px padding
Emphasis:     gold left rule or gold section number, never large gold block
Footer:       source/confidentiality line in mono, 11px
```

Light mode:

```text
Header:       small cypress text + gold rule
Title:        34-40px Cormorant, #18231E
Body:         16-17px Barlow, #4A473F
Layout:       generous whitespace, 2 columns max
Cards:        #FFFDF8 fill, #D8CDBA border, 4px radius, 20-24px padding
Emphasis:     pale gold wash (#F1E4BF) only for small callout background
Footer:       privacy/source note, #777064, 10-11px
```

## Chart slide

Dark mode:

```text
Canvas:       #050505
Plot area:    #0E0E0E or transparent
Grid:         rgba(255,255,255,0.10), 1px
Axis labels:  Barlow, #A6A6A6, 11-12px
Primary data: #C6A34F
Secondary:    #8F7B4A, #B7B0A4, #5F6B5A
Annotation:   #F5F1E8 text with gold hairline pointer
Legend:       top-right or bottom-left, no boxed legend unless needed
```

Light mode:

```text
Canvas:       #FAF7F0
Plot area:    #FFFDF8
Grid:         #E1D7C6, 1px
Axis labels:  Barlow, #777064, 10-11px
Primary data: #18231E
Highlight:    #C6A34F
Secondary:    #6F7A55, #815D46, #B9AA8D
Annotation:   #1B1B18 text with cypress or gold pointer
```

Chart rules:

- Max 4 series unless the data requires more.
- Use direct labels when possible instead of legends.
- No rainbow palettes.
- Use muted gridlines and strong value labels for the consultant's key insight.
- Never visualize sensitive personal data without the private/internal watermark.

## Callout boxes

Dark mode:

```text
Background:   #0E0E0E
Border:       1px #2A2A2A plus optional left border #C6A34F
Radius:       4px
Padding:      16-20px
Title:        Barlow Condensed uppercase, #C6A34F, 12px
Body:         Barlow, #D8D0C3, 14-16px
```

Light mode:

```text
Background:   #FFFDF8 or #F1E4BF for high-priority note
Border:       1px #D8CDBA
Left rule:    2px #C6A34F or #18231E
Radius:       4px
Padding:      16-20px
Title:        Barlow Condensed uppercase, #815D46, 10-12pt
Body:         Barlow, #4A473F, 10.5-11.5pt
```

Callout types:

- `Next action`: gold left rule.
- `Risk / watch item`: muted warning `#B58B3B`, not aggressive yellow.
- `Privacy note`: border only, no highlight fill.
- `Source note`: mono label plus body text.

## Tables

Dark mode:

```text
Header bg:    #1A1A1A
Header text:  #C6A34F, Barlow Condensed uppercase
Cell bg:      #0E0E0E
Alt row:      #131313
Border:       #2A2A2A, 1px
Cell text:    #D8D0C3, 12-14px
Important:    gold text only for one key value per row
```

Light mode:

```text
Header bg:    #F3EBDD
Header text:  #18231E, Barlow Condensed uppercase
Cell bg:      #FFFDF8
Alt row:      #FAF7F0
Border:       #D8CDBA, 1px
Cell text:    #1B1B18, 9.5-10.5pt
Important:    #815D46 or #18231E bold, not bright color
```

Table rules:

- Prefer 4-6 columns. Split wide data into sections rather than shrinking type below 9pt.
- Left-align text, right-align numbers/dates, center only status marks if unavoidable.
- In Markdown, use simple tables only when they stay readable in plain text.

## Headers and footers

Dark mode:

```text
Header left:  AWM Relationship OS Kit / document type
Header right: generated date or consultant name
Footer left:  Private operating aid
Footer right: page number or source store
Color:        #6F6F6F or #A6A6A6
Rule:         top or bottom 1px #2A2A2A
```

Light mode:

```text
Header left:  AWM logo or text lockup
Header right: document type / date
Footer left:  Private operating aid. Review before sharing.
Footer right: page number
Color:        #777064
Rule:         1px #D8CDBA or thin gold segment on cover only
```

Footer language should be explicit but not alarming. Example: `Private operating aid. Review before sharing. Not financial advice.`

---

# Document templates

## Appointment summary

Use for post-meeting summaries and consultant prep records.

Recommended scheme:

- Dark mode for internal prep and post-call notes.
- Light mode only if converted into a clean review note for sharing or filing.

Structure:

```text
Title: Appointment Summary
Metadata: client/contact, date, meeting type, generated timestamp, source store
Privacy mark: Private operating aid. Review before sharing.

1. Conversation snapshot
   Short factual summary in 3-5 bullets.

2. Relationship context
   Personal/business context, preferences, open loops.

3. Needs and opportunities
   Non-advice framing: interests, questions, possible topics to review.

4. Follow-up actions
   Owner, action, due date, status.

5. Source notes
   Original touchpoint references or note excerpts.
```

Layout guidance:

- Use a two-column metadata band at the top.
- Put follow-up actions in a table.
- Use callouts for `Next action` and `Risk / watch item`.
- Never present generated interpretation as fact without source note support.

## Proposal

Use for internal proposal drafts and consultant-prepared advisory documents. This kit can structure the document; it should not make financial recommendations on its own.

Recommended scheme:

- Light mode Cypress Ledger for client-facing draft format.
- Add visible draft/privacy language until reviewed.

Structure:

```text
Cover
- Proposal / Discussion Draft
- Client/contact name
- Consultant name
- Date
- AWM logo or text lockup

1. Context
   Why this document exists; neutral summary of the client's stated goals/questions.

2. Current understanding
   Facts known from Relationship OS notes; label assumptions clearly.

3. Topics for discussion
   Areas to explore with the consultant, not automated recommendations.

4. Options to review
   Placeholder structure only. Require consultant/compliance review.

5. Open questions
   Missing facts, documents, risk tolerance, priorities.

6. Next steps
   Clear owner/action/date table.

Appendix: Source notes
```

Layout guidance:

- Use warm paper background and cypress headings.
- Use a gold rule under section titles.
- Use tables for next steps and assumptions.
- Use an `Internal draft` watermark unless explicitly cleared for client-facing use.

Required language:

`Draft prepared from private Relationship OS notes. Review and adapt before client use. This document is not financial advice and does not represent compliance approval.`

## Client review note

Use for periodic review prep, annual review packs, or concise relationship status notes.

Recommended scheme:

- Light mode for reviewed notes.
- Dark mode for consultant-only preparation.

Structure:

```text
Title: Client Review Note
Metadata: client/contact, review date, consultant, generated timestamp

1. Relationship status
   Current stage, recent touchpoints, sentiment, known preferences.

2. Key changes since last review
   Bullets grounded in touchpoints.

3. Open commitments
   Action table with owner and due date.

4. Topics to prepare
   Questions or themes to raise; no automatic advice.

5. Watch items
   Sensitive context, missing information, compliance notes.

6. Source log
   Recent notes and dates.
```

Layout guidance:

- First page should fit a one-page executive summary where possible.
- Use a small status table rather than decorative score cards.
- Watch items should use a restrained warning treatment, not red unless urgent.

---

# Markdown output guidance

Markdown must remain useful inside an FC's Obsidian-style vault without custom CSS.

Recommended frontmatter:

```yaml
---
type: relationship-os-deliverable
scheme: awm-dark | awm-light
document_type: appointment_summary | proposal | client_review_note | deck_outline | memo
client_or_contact: "Name"
consultant: "Name"
generated_at: "YYYY-MM-DDTHH:MM:SS"
source_store: "sqlite"
consultant_view: "csv | google | obsidian"
privacy: "private_operating_aid"
review_required: true
---
```

Markdown style rules:

- Start with a clear H1 and privacy line.
- Use `##` sections only; avoid deep heading nesting.
- Put actions in simple tables.
- Put source notes at the end.
- Avoid HTML-only styling in `.md` unless exporting to PDF.
- No emoji, no decorative icons, no AI flourish language.

Example privacy line:

`Private operating aid. Review before sharing. Not financial advice.`

---

# Privacy and watermarking guidance

Use explicit marks based on audience and review state.

## Internal-only outputs

Apply to:

- Dark prep slides.
- Appointment summaries for consultant use.
- Raw relationship notes.
- Any generated output containing sensitive context.

Required mark:

`Private operating aid. Internal use only. Review before sharing.`

Visual treatment:

- Dark mode: footer text in `#6F6F6F`, optional diagonal watermark at 6% opacity for PDFs.
- Light mode: footer text in `#777064`, optional bottom-right logo/text watermark at 6-10% opacity.

## Draft client-facing outputs

Apply to:

- Proposal drafts.
- Review notes that may be shared after consultant review.
- Slide decks generated from private notes.

Required mark:

`Draft. Review and approve before client use. Not financial advice.`

Visual treatment:

- Cover: small `Draft` label in top-right or footer.
- Every page/slide: footer privacy line.
- Do not use alarming red draft stamps; use muted cypress or warm grey.

## Approved/shared outputs

Only use this state if a consultant explicitly marks the output as reviewed.

Required mark:

`Prepared for discussion. Not financial advice.`

If approval/compliance status is unknown, do not remove draft/private language.

---

# Implementation hints for Developer

## CSS variables

Create two CSS variable maps from the tokens above:

```css
.ros-theme-dark { color-scheme: dark; }
.ros-theme-light { color-scheme: light; }
```

Recommended shared variables:

```css
--ros-radius-sm: 2px;
--ros-radius-md: 4px;
--ros-radius-lg: 6px;
--ros-space-1: 4px;
--ros-space-2: 8px;
--ros-space-3: 12px;
--ros-space-4: 16px;
--ros-space-6: 24px;
--ros-space-8: 32px;
--ros-space-12: 48px;
--ros-space-16: 64px;
--ros-font-display: 'Cormorant Garamond', Georgia, serif;
--ros-font-body: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
--ros-font-condensed: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif;
--ros-font-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
```

## Python constants

Use dictionaries so `python-pptx`, ReportLab, and WeasyPrint can share names.

```python
AWM_DARK = {
    "bg": "050505",
    "surface": "0E0E0E",
    "raised": "1A1A1A",
    "border": "2A2A2A",
    "text": "F5F1E8",
    "text_muted": "A6A6A6",
    "accent": "C6A34F",
    "success": "7A8F62",
    "warning": "B58B3B",
    "error": "B85C52",
}

AWM_LIGHT = {
    "bg": "FAF7F0",
    "paper": "FFFDF8",
    "surface": "F3EBDD",
    "border": "D8CDBA",
    "ink": "18231E",
    "text": "1B1B18",
    "text_muted": "777064",
    "accent": "C6A34F",
    "cypress": "22372D",
    "moss": "6F7A55",
    "clay": "815D46",
}

FONTS = {
    "display": "Cormorant Garamond",
    "body": "Barlow",
    "condensed": "Barlow Condensed",
    "mono": "JetBrains Mono",
    "ppt_display_fallback": "Georgia",
    "ppt_body_fallback": "Arial",
}

SPACING = {
    "xs": 4,
    "sm": 8,
    "md": 16,
    "lg": 24,
    "xl": 32,
    "2xl": 48,
    "3xl": 64,
}
```

## `python-pptx` notes

- Use 16:9 widescreen: 13.333 x 7.5 inches.
- Convert pixel guidance to inches/points consistently; keep margins as constants.
- Use solid fills and thin lines. Avoid gradient fills unless manually tested in exported PPT.
- If Cormorant/Barlow are unavailable on the system, set Georgia/Arial fallbacks rather than failing generation.
- Keep chart colors limited to the scheme's 4 chart tokens.
- Do not place text over images unless a dark overlay rectangle is applied.

## ReportLab / PDF notes

- Use paragraph styles named after document roles: `CoverTitle`, `SectionLabel`, `Body`, `Caption`, `TableHeader`, `PrivacyFooter`.
- Use borders and background fills that print cleanly in grayscale.
- Keep watermark opacity low and text selectable where possible.
- Use table repeat rows for long action tables.

## WeasyPrint / HTML notes

- Use CSS variables and `@media print` to remove shadows and strengthen low-contrast borders.
- Embed or link Google fonts only when network access is acceptable. Otherwise fallback gracefully.
- Define page footers with `@page` margin boxes if possible.

## Markdown / Obsidian notes

- Emit plain Markdown first, optional styled HTML/PDF second.
- Use frontmatter to record scheme and privacy state.
- File naming should be safe and predictable: `YYYY-MM-DD_contact-name_document-type.md`.
- Never write directly into Luc's vault from this kit. Generate into the consultant's configured output directory.

---

# Do / Do not

## Do

- Use short, direct headings.
- Use `you` only where the consultant is the reader.
- Put review/privacy state in every generated file.
- Use gold for hierarchy and emphasis, not decoration.
- Keep document structures consistent across modes.
- Label assumptions and source notes clearly.

## Do not

- Do not use emoji, sparkles, robot imagery, chat bubbles with faces, or mascot-style AI cues.
- Do not use bright SaaS blue, neon cyan, purple gradients, or rainbow charts.
- Do not use pill buttons or heavily rounded cards.
- Do not imply the kit sends client messages.
- Do not imply financial advice, compliance approval, or official CRM status.
- Do not generate client-facing outputs without draft/review language by default.

---

# Recommended defaults

If the generator receives no explicit scheme:

- Use `awm-dark` for internal prep, appointment summaries, raw notes, daily focus, and draft analyses.
- Use `awm-light` for proposals, client review notes, printable PDFs, and presentation decks intended for review or possible sharing.
- Always set `privacy: private_operating_aid` and `review_required: true` until the consultant explicitly changes state.
