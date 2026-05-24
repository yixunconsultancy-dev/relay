# AWM Relationship OS Kit — Branding Asset Usage Addendum

One-line position: use fewer, larger, real AWM assets with strict contrast overlays so the Relationship OS outputs feel like private financial-consultant operating tools, not generic token-themed exports.

## Implementation constants

Use these constants before surface-specific overrides.

- PPT canvas: 16:9 widescreen, 13.333in x 7.5in.
- EMU conversion: 1in = 914400 EMU.
- Shared PPT safe margins:
  - Cover: 0.70in left/right, 0.55in top/bottom.
  - Content: 0.55in left/right, 0.42in top/bottom.
- PDF page assumption: A4 or Letter portrait. Keep same optical layout on either page size.
- Gold accent: `#C6A34F` only. Never use gold as a large flood background.
- Dark text: use `#F5F1E8` or `#E8E8E8` on dark surfaces.
- Light text: use `#18231E` for headings and `#1B1B18` / `#4A473F` for body.
- Fonts: Cormorant Garamond for titles, Barlow for body, Barlow Condensed for labels, JetBrains Mono for metadata. Fallbacks: Georgia, Arial, Arial Narrow, Consolas.
- Logo assets live under `AWM Design System/assets/`.
- Do not crop logos. Preserve aspect ratio. Prefer width-constrained placement for wordmarks and height-constrained placement for header marks.
- Do not stretch backgrounds. Use cover-crop to fill the frame, centered unless surface-specific crop guidance says otherwise.
- All background imagery behind text must include a solid or translucent overlay sufficient for AA contrast.

## Contrast contract

This contract is non-negotiable: every named dark output must paint a dark surface before using cream/white ink, and every named light output must use dark cypress/charcoal ink on cream/white paper. Scheme names describe the visible page/slide surface, not only token family.

| Canonical pair | Surface / background | Body ink | Heading ink | AA verdict |
|---|---|---|---|---|
| Dark PPT cover | `bg_dark_water.jpg` full-bleed + `#000000` scrim at 68% opacity; fallback fill `#050505` | `#D8D0C3` | `#F5F1E8` | AA pass. Fallback contrast `#050505` / `#D8D0C3` = 13.33:1; `#050505` / `#F5F1E8` = 18.08:1. Scrim must be increased to 75% if title crosses a bright gold reflection. |
| Dark PPT content | Solid `#050505`; optional water texture must be reduced to 15-18% visibility then covered by 82-88% `#050505` overlay | `#D8D0C3` | `#F5F1E8` | AA pass. Plain-surface contrast is 13.33:1 for body and 18.08:1 for headings. |
| Light PPT cover | `#FAF7F0` cream canvas + faint `bg_mountain_clouds.png` at 12-16% visibility under 78-84% cream overlay | `#4A473F` | `#18231E` | AA pass. Contrast `#FAF7F0` / `#4A473F` = 8.67:1; `#FAF7F0` / `#18231E` = 15.12:1. |
| Light PPT content | `#FAF7F0` canvas with optional `#FFFDF8` content panel | `#4A473F` | `#18231E` | AA pass. Same light-surface pair as cover; dark ink on cream must not be replaced by pale beige body copy. |
| Dark PDF body | Page fill `#050505`; content cards `#0E0E0E` / `#1A1A1A`; no implicit white paper | `#D8D0C3` | `#F5F1E8` | AA pass. Contrast `#0E0E0E` / `#F5F1E8` = 17.13:1. A file named `-dark.pdf` must visibly have this dark page fill. |
| Light PDF body | Page fill `#FAF7F0` or `#FFFDF8`; no photographic body background | `#4A473F` or `#1B1B18` | `#18231E` | AA pass. Contrast `#FFFDF8` / `#1B1B18` = 16.98:1; `#FFFDF8` / `#4A473F` = 9.12:1. |
| MD frontmatter banner | Plain Markdown; renderer theme decides surface | n/a | n/a | n/a. Keep portable text; do not rely on embedded image contrast. |

Disallowed pairings:

- Dark scheme: `#F5F1E8` cream text on implicit white/cream PDF paper is forbidden. It only measures about 1.13:1 against `#FFFFFF`, which is unreadable and fails AA.
- Dark scheme: gold `#C6A34F` is forbidden as paragraph/body copy; use it only for hairlines, labels, and small accents.
- Light scheme: pale beige/grey body copy over `bg_mountain_clouds.png` is forbidden. The image must be heavily washed out, and body copy must remain `#4A473F` or darker.
- Any scheme: if watermark opacity, image crop, or local bright/dark patch lowers body contrast, remove the watermark/image behind text instead of compensating with decorative effects.

### Contrast table for Developer implementation

| Surface | Background (asset + fill) | Foreground hex | Contrast verdict |
|---|---|---|---|
| Dark PPT cover | `AWM Design System/assets/bg_dark_water.jpg` + 68% `#000000` scrim; fallback `#050505` | Heading `#F5F1E8`; body `#D8D0C3` | AA pass; fallback ratios 18.08:1 / 13.33:1. |
| Dark PPT content | `#050505` surface; optional water vignette reduced to 15-18% visibility under 82-88% dark overlay | Heading `#F5F1E8`; body `#D8D0C3` | AA pass; body ratio 13.33:1 on `#050505`. |
| Light PPT cover | `#FAF7F0` plus faint `bg_mountain_clouds.png` under 78-84% cream overlay | Heading `#18231E`; body `#4A473F` | AA pass; heading 15.12:1, body 8.67:1. |
| Light PPT content | `#FAF7F0` with optional `#FFFDF8` content panel | Heading `#18231E`; body `#4A473F` | AA pass; do not regress to light ink. |
| Dark PDF body | Page fill `#050505`; cards/header `#0E0E0E`; no implicit white page | Heading `#F5F1E8`; body `#D8D0C3` | AA pass; `#0E0E0E` / `#F5F1E8` = 17.13:1. |
| Light PDF body | `#FAF7F0` or `#FFFDF8` page fill; no body imagery | Heading `#18231E`; body `#4A473F` or `#1B1B18` | AA pass; weakest listed body pair is 8.67:1. |
| MD frontmatter banner | n/a, plain text | n/a | n/a. |

## Asset choices at a glance

| Surface | Primary logo | Background / image choice | Reason |
|---|---|---|---|
| Dark PPT cover | `logo_white_wordmark.png` | `bg_dark_water.jpg` | Black/gold water reads premium and quiet; strongest match to Private Command Desk. |
| Dark PPT content | `logo_white_mark.png` | Plain `#050505` plus optional 18% water vignette | Content must be operational and legible. |
| Light PPT cover | `logo_dark.png` | Cream paper plus faint `bg_mountain_clouds.png` | Cypress Ledger needs calm, advisory restraint rather than theatrical photography. |
| Light PPT content | `logo_dark.png` | Clean cream/paper only | Dense content should behave like a memo. |
| Dark PDF | `logo_white_wordmark.png` | Dark header strip; optional white mark watermark | Clear ownership without brochure energy. |
| Light PDF | `logo_dark.png` | Cream/paper header; no watermark by default | Clean enough for filing or reviewed consultant notes. |
| Markdown | No required embedded image | Frontmatter + portable text banner | Obsidian notes must remain portable and plain-text useful. |

---

# 1. Dark PPT — Private Command Desk

## Surface: Dark PPT cover slide

- Background asset: `AWM Design System/assets/bg_dark_water.jpg`.
- Treatment:
  - Full-bleed image, cover-cropped to 13.333in x 7.5in.
  - Crop preference: keep gold reflection/water texture in lower-right or right half; do not center a bright patch behind the title.
  - Apply black overlay scrim: `#000000` at 68% opacity across the full slide.
  - Add a left-to-right dark gradient if supported: left 82% black to right 55% black. If gradients are risky in PPT export, use a solid 68% scrim only.
  - Add a very subtle bottom vignette: black rectangle from y=5.9in to 7.5in at 35% opacity.
- Logo placement:
  - Asset: `AWM Design System/assets/logo_white_wordmark.png`.
  - Position: top-left, x=0.70in, y=0.50in.
  - Dimensions: width=2.15in, height auto (~0.45in). EMU: x=640080, y=457200, w=1965960.
  - Rationale: top-left wordmark establishes ownership without making the cover look like a corporate ad.
- Text regions:
  - Eyebrow label: x=0.78in, y=2.05in, w=5.6in, h=0.25in. Barlow Condensed uppercase, 12-13pt, tracking wide, `#C6A34F`.
  - Title: x=0.75in, y=2.35in, w=7.1in, h=1.45in. Cormorant Garamond 44-52pt, light/regular, line-height ~1.05, `#F5F1E8`.
  - Gold rule: x=0.78in, y=4.05in, w=1.35in, h=0.01in. 1pt `#C6A34F` at 70% opacity.
  - Subtitle/byline: x=0.78in, y=4.25in, w=5.8in, h=0.60in. Barlow 14-16pt, `#D8D0C3`.
  - Metadata/footer: x=0.78in, y=6.82in, w=6.8in, h=0.25in. JetBrains Mono 8.5-9.5pt, `#6F6F6F`.
- Required copy placement:
  - Eyebrow example: `PRIVATE COMMAND DESK`.
  - Title example: `Relationship Review` or generated deck title.
  - Subtitle example: `Prepared for [Consultant] · [Client/contact]`.
  - Footer: `Private operating aid. Internal use only. Review before sharing.`
- Optional mockup:

```text
┌──────────────────────────────────────────────────────────────┐
│  AWM WORDMARK                                                │
│                                                              │
│                                                              │
│  PRIVATE COMMAND DESK                                        │
│  Relationship Review                                         │
│  ━━━━━                                                       │
│  Prepared for Consultant · Contact                           │
│                                                              │
│                                      dark water + gold glint  │
│  Private operating aid...                                    │
└──────────────────────────────────────────────────────────────┘
```

- Do not:
  - Do not center the wordmark on this cover; centered logo plus big title becomes brochure-like.
  - Do not place title over the brightest gold reflection unless the scrim is increased to 75%.
  - Do not add decorative icons, neon lines, or extra image layers.

## Surface: Dark PPT content slide

- Background asset: primary treatment is no full-bleed photo; use `#050505` canvas.
- Optional background asset: `AWM Design System/assets/bg_dark_water.jpg` only as a low-opacity texture.
- Treatment:
  - Default: solid `#050505`.
  - Optional: place `bg_dark_water.jpg` full-bleed, apply grayscale/desaturate if available, opacity/effective visibility 15-18%, then overlay `#050505` at 82-88% opacity. The final slide should read as almost plain black.
  - Add a header hairline rule: x=0.55in, y=0.78in, w=12.25in, 1pt `#2A2A2A`.
  - Add a short gold segment over the rule: x=0.55in, y=0.78in, w=1.15in, 1pt `#C6A34F` at 65% opacity.
- Logo placement:
  - Asset: `AWM Design System/assets/logo_white_mark.png`.
  - Position: top-right, x=12.18in, y=0.35in.
  - Dimensions: width=0.54in, height auto (~0.22in). EMU: x=11137440, y=320040, w=493776.
  - If `logo_white_mark.png` renders visually too wide because it includes framing whitespace, use `logo_white_wordmark.png` width=1.15in at x=11.62in instead.
- Text regions:
  - Header left label: x=0.55in, y=0.36in, w=4.2in, h=0.22in. `AWM RELATIONSHIP OS KIT`, Barlow Condensed 9-10pt uppercase, `#A6A6A6`.
  - Header right metadata/date: x=8.7in, y=0.36in, w=2.9in, h=0.22in. JetBrains Mono 8.5pt, `#6F6F6F`, right-aligned.
  - Slide title: x=0.72in, y=1.06in, w=7.9in, h=0.70in. Cormorant Garamond 34-40pt, `#F5F1E8`.
  - Body/content grid: x=0.72in, y=2.05in, w=11.85in, h=4.50in.
  - Recommended two-column layout: left column w=6.95in, gutter=0.42in, right column w=4.45in.
  - Cards: fill `#0E0E0E`, border `#2A2A2A`, radius 4px, padding 0.18-0.24in.
  - Bullets/body: Barlow 13-15pt, `#D8D0C3`; secondary text `#A6A6A6`.
  - Footer: x=0.55in, y=7.03in, w=12.25in, h=0.18in. JetBrains Mono 7.5-8.5pt, `#6F6F6F`.
- Do not:
  - Do not use full-strength photography behind tables or bullet lists.
  - Do not set body text below 12pt on PPT.
  - Do not use cyan/network colors from older slide assets in this Relationship OS dark scheme.

---

# 2. Light PPT — Cypress Ledger

## Surface: Light PPT cover slide

- Background asset: `AWM Design System/assets/bg_mountain_clouds.png`.
- Treatment:
  - Base canvas: `#FAF7F0`.
  - Place `bg_mountain_clouds.png` full-bleed cover-cropped, opacity/effective visibility 12-16%.
  - Apply warm cream overlay: `#FAF7F0` at 78-84% opacity.
  - The final impression should be a quiet letterhead texture, not a landscape slide.
  - Add thin double-rule frame:
    - Outer line: x=0.50in, y=0.45in, w=12.33in, h=6.60in, 0.75pt `#D8CDBA`.
    - Inner top-left gold segment only: x=0.70in, y=0.66in, w=1.45in, 1pt `#C6A34F`.
- Logo placement:
  - Asset: `AWM Design System/assets/logo_dark.png`.
  - Position: top-left, x=0.78in, y=0.72in.
  - Dimensions: width=1.25in, height auto within 0.70in. If the source image includes excess canvas, fit it into a 1.25in x 0.70in box without cropping.
  - Rationale: dark mark on warm paper gives the cypress/bonsai advisory mood without relying on decorative botanical assets.
- Text regions:
  - Eyebrow label: x=0.82in, y=2.05in, w=5.8in, h=0.25in. Barlow Condensed uppercase, 11-12pt, `#8F7332`.
  - Title: x=0.78in, y=2.38in, w=7.2in, h=1.35in. Cormorant Garamond 42-50pt, `#18231E`.
  - Subtitle: x=0.82in, y=4.02in, w=6.3in, h=0.55in. Barlow 13.5-15pt, `#4A473F`.
  - Byline/date: x=0.82in, y=6.60in, w=5.2in, h=0.22in. JetBrains Mono 8.5-9pt, `#777064`.
  - Optional right-side quiet label: x=9.3in, y=5.95in, w=2.6in, h=0.25in. `CYPRESS LEDGER`, Barlow Condensed 10pt, `#B9AA8D`.
- Optional mockup:

```text
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ AWM DARK LOGO                              faint clouds   │ │
│ │                                                          │ │
│ │ CYPRESS LEDGER                                           │ │
│ │ Client Review Note                                       │ │
│ │ Calm subtitle/byline                                     │ │
│ │                                                          │ │
│ │ 2026-05-19 · Prepared for review                         │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- Do not:
  - Do not use full-strength mountain photography on light covers.
  - Do not place the logo over a busy or high-contrast mountain edge.
  - Do not use rounded pill labels; use flat text and hairlines.

## Surface: Light PPT content slide

- Background asset: none by default. No heavy background imagery on content pages.
- Treatment:
  - Canvas: `#FAF7F0`.
  - Main content panel optional: `#FFFDF8` fill, 1pt `#D8CDBA` border, radius 4px, x=0.66in, y=1.78in, w=12.0in, h=4.85in.
  - Header rule: x=0.55in, y=0.80in, w=12.25in, 0.75pt `#D8CDBA`.
  - Gold segment: x=0.55in, y=0.80in, w=1.20in, 1pt `#C6A34F`.
- Logo placement:
  - Asset: `AWM Design System/assets/logo_dark.png`.
  - Position: top-left, x=0.55in, y=0.30in.
  - Dimensions: width=0.82in, height auto within 0.40in. If the PNG includes excess canvas, fit inside 0.82in x 0.40in.
- Text regions:
  - Header label: x=1.48in, y=0.36in, w=3.8in, h=0.20in. Barlow Condensed uppercase 9-10pt, `#334139`.
  - Header metadata: x=8.6in, y=0.36in, w=3.55in, h=0.20in. JetBrains Mono 8pt, `#777064`, right-aligned.
  - Slide title: x=0.72in, y=1.06in, w=8.2in, h=0.55in. Cormorant Garamond 32-38pt, `#18231E`.
  - Body region: x=0.88in, y=2.05in, w=11.45in, h=4.20in.
  - Body typography: Barlow 12.5-14pt, `#4A473F`; section labels Barlow Condensed 9.5-10.5pt, `#8F7332`.
  - Tables: header fill `#F3EBDD`; borders `#D8CDBA`; important value in `#18231E` bold or `#8F7332`, not bright gold.
  - Footer: x=0.55in, y=7.03in, w=12.25in, h=0.18in. `Private operating aid. Review before sharing. Not financial advice.` in Barlow/JetBrains Mono 7.5-8.5pt, `#777064`.
- Do not:
  - Do not use photographic backgrounds on content pages.
  - Do not use low-contrast beige text for body copy.
  - Do not exceed two columns unless it is a table slide.

---

# 3. Appointment Summary PDF — Dark + Light

## Surface: Appointment Summary PDF — dark header and intro block

- Background asset: none for body; optional watermark only.
- Treatment:
  - Page background: `#050505` for dark PDF exports.
  - Body cards/sections: `#0E0E0E` or `#1A1A1A`, border `#2A2A2A`, radius 4px if renderer supports it.
  - Header strip: full-width dark raised strip, x=0, y=0, h=58pt, fill `#0E0E0E`.
  - Header bottom rule: 1pt `#2A2A2A` full width, plus 72pt gold segment at left (`#C6A34F`, 65% opacity).
- Logo placement:
  - Asset: `AWM Design System/assets/logo_white_wordmark.png`.
  - Alignment: left.
  - Position: x=42pt, y=17pt within header strip.
  - Dimensions: height=24pt, width auto (~115pt). Do not exceed 135pt width.
- Header text:
  - Right side: `APPOINTMENT SUMMARY` / generated date, x from page width - 230pt, y=18pt, w=188pt, right-aligned.
  - Font: Barlow Condensed / JetBrains Mono 8-9pt, uppercase, `#A6A6A6`.
- Cover/intro block treatment:
  - First page only, below header: x=42pt, y=86pt, w=page width - 84pt, h=92-118pt.
  - Fill `#0E0E0E`, border `#2A2A2A`, optional left rule 2pt `#C6A34F`.
  - Title: Cormorant Garamond 26-30pt, `#F5F1E8`.
  - Metadata rows: Barlow 9.5-10.5pt, `#D8D0C3`; labels Barlow Condensed uppercase `#C6A34F`.
- Optional watermark:
  - Asset: `AWM Design System/assets/logo_white_mark.png`.
  - Position: bottom-right, x=page width - 160pt, y=page height - 170pt if coordinate origin top-left; otherwise 34pt from bottom and right.
  - Dimensions: width=120pt, height auto.
  - Opacity: 4-6% only. If opacity is not reliable in renderer, skip watermark rather than creating visible clutter.
- Footer:
  - Rule: x=42pt, y=page height - 38pt, w=page width - 84pt, 0.5pt `#2A2A2A`.
  - Text: `Private operating aid — not official client communication`.
  - Font: JetBrains Mono or Barlow 7.5-8.5pt, `#6F6F6F`, left-aligned.
  - Page number/source: right-aligned in same line.
- Do not:
  - Do not use a photographic page background in PDFs with paragraphs/tables.
  - Do not use a visible watermark above 8% opacity.
  - Do not let the AWM wordmark imply compliance approval; keep disclaimer visible.

## Surface: Appointment Summary PDF — light header and intro block

- Background asset: none by default.
- Treatment:
  - Page background: `#FAF7F0` or white paper `#FFFDF8`.
  - Header strip: x=0, y=0, h=58pt, fill `#FFFDF8`.
  - Header bottom rule: 0.75pt `#D8CDBA` full width, plus 72pt gold segment at left (`#C6A34F`).
- Logo placement:
  - Asset: `AWM Design System/assets/logo_dark.png`.
  - Alignment: left.
  - Position: x=42pt, y=12pt.
  - Dimensions: fit inside width=80pt, height=32pt. The source file is 16:9 with likely padding; fit, do not crop.
- Header text:
  - Right side: `APPOINTMENT SUMMARY` / generated date, x=page width - 230pt, y=18pt, w=188pt, right-aligned.
  - Font: Barlow Condensed / JetBrains Mono 8-9pt, `#777064`.
- Cover/intro block treatment:
  - First page only: x=42pt, y=86pt, w=page width - 84pt, h=92-118pt.
  - Fill `#FFFDF8`, border `#D8CDBA`, left rule 2pt `#C6A34F`.
  - Title: Cormorant Garamond 26-30pt, `#18231E`.
  - Metadata rows: Barlow 9.5-10.5pt, `#4A473F`; labels `#8F7332`.
- Optional watermark:
  - Skip by default on light PDFs. It adds little value and can look like stationery clutter.
  - If a draft/internal mark is required, use text watermark `PRIVATE OPERATING AID` at 5-6% opacity, bottom-right, not the logo.
- Footer:
  - Rule: x=42pt, y=page height - 38pt, w=page width - 84pt, 0.5pt `#D8CDBA`.
  - Text: `Private operating aid — not official client communication`.
  - Font: Barlow or JetBrains Mono 7.5-8.5pt, `#777064`, left-aligned.
- Do not:
  - Do not add mountain/cloud imagery inside the PDF body.
  - Do not use pale grey body copy; maintain print legibility.
  - Do not place the logo in both header and watermark on the same page.

---

# 4. Markdown / Obsidian note

## Surface: Markdown note file

- Background asset: none. Do not require embedded images.
- Treatment:
  - The `.md` output stays clean portable text.
  - Use frontmatter to preserve scheme/branding metadata for future HTML/PDF exports.
  - Provide an optional text banner that renders acceptably in plain Obsidian without CSS.
- Logo placement:
  - None required.
  - Do not embed `logo_dark.png` or `logo_white_wordmark.png` by default; image paths will break portability across consultants and vaults.
- Suggested frontmatter:

```yaml
---
type: relationship-os-deliverable
scheme: awm-dark # awm-dark | awm-light
branding: awm
document_type: appointment_summary # appointment_summary | proposal | client_review_note | deck_outline | memo
client_or_contact: "Name"
consultant: "Name"
generated_at: "YYYY-MM-DDTHH:MM:SS"
source_store: "sqlite"
consultant_view: "csv" # csv | google | obsidian
privacy: "private_operating_aid"
review_required: true
asset_policy: "no_embedded_brand_images_in_markdown"
---
```

- Optional portable banner snippet:

```markdown
> [!note] AWM Relationship OS Kit
> Private operating aid. Review before sharing. Not financial advice.
> Scheme: `awm-dark` · Source: `sqlite` · View: `csv` · Generated: `YYYY-MM-DD`
```

- Preferred note opening:

```markdown
# Appointment Summary — Client Name

Private operating aid. Review before sharing. Not financial advice.

| Field | Value |
|---|---|
| Consultant | Name |
| Meeting date | YYYY-MM-DD |
| Source store | sqlite |
| Consultant view | csv |
| Generated | YYYY-MM-DD HH:MM |
```

- Do not:
  - Do not require Obsidian CSS snippets for the note to make sense.
  - Do not include HTML-only layout unless the file is explicitly an export source for PDF.
  - Do not use emoji, decorative icons, or image banners.

---

# Developer handoff notes

1. Add asset constants in the renderer rather than hardcoding paths inside every function:

```python
AWM_ASSETS = {
    "logo_white_wordmark": "/Users/luc/Documents/paperclip/AWM Design System/assets/logo_white_wordmark.png",
    "logo_white_mark": "/Users/luc/Documents/paperclip/AWM Design System/assets/logo_white_mark.png",
    "logo_dark": "/Users/luc/Documents/paperclip/AWM Design System/assets/logo_dark.png",
    "logo_light": "/Users/luc/Documents/paperclip/AWM Design System/assets/logo_light.png",
    "bg_dark_water": "/Users/luc/Documents/paperclip/AWM Design System/assets/bg_dark_water.jpg",
    "bg_mountain_clouds": "/Users/luc/Documents/paperclip/AWM Design System/assets/bg_mountain_clouds.png",
}
```

2. Build helpers:
   - `add_cover_background(slide, image_path, overlay_color, overlay_opacity)`.
   - `add_awm_logo(...)`.
   - `add_privacy_footer(...)`.
   - `add_header_rule(...)`.

3. Asset sizing pitfalls:
   - `logo_dark.png` and `logo_light.png` are 1920x1080 images, likely with surrounding canvas. Fit them into a box; do not assume visible mark fills the bitmap.
   - `logo_white_wordmark.png` is 2535x527 and works well width-constrained.
   - `logo_white_mark.png` is 3492x1426 and should be used only small/subtle unless cropped by a designer later.

4. Acceptance checks:
   - Every PPT cover visibly includes an AWM logo and one real background/image treatment.
   - Every PPT content slide includes a logo or mark plus a header rule, but content remains legible.
   - Every PDF includes a branded header strip, logo, footer disclaimer, and no busy body background.
   - Markdown remains portable and does not depend on image paths.
   - No gold floods, no neon, no emoji, no stock-business imagery, no pill buttons.

5. Final visual bar: if a screenshot is viewed at thumbnail size, it should immediately read as AWM through black/cream, gold hairlines, Cormorant headings, and a placed logo; at full size, it should read as a private consultant operating aid rather than a marketing brochure.
