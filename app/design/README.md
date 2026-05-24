# Design References For The Desktop App

This folder collects style references for the AWM Relationship OS desktop
app (see `../SCOPING.md`). Everything here is a **reference**, not source
code that ships in the app — copy patterns and tokens, don't import these
files directly.

All references come from the AWM Design System (the consultant's brand
design library). The kit's own `design.md` (one level up) defines the
canonical design tokens; these files are worked examples of how the
tokens compose into UI.

## Files

| Path | What it is | What to do with it |
|---|---|---|
| `dark-reference.html` | Self-contained HTML mockup of a full dark-mode CRM dashboard. Single-file with all CSS / JS inline. | Open in a browser to see the target visual feel. Borrow the layout patterns (sidebar, top header, stat cards, tabs, tables). Ignore features that aren't in the kit's MVP scope (Policies, Pipeline, Training, Calendar — see SCOPING.md). |
| `dark-reference-README.md` | Designer's notes about the dark-reference mockup: intended screens, components, colour rules, type rules. | Read first for context before opening the HTML. |
| `colors_and_type.css` | Canonical AWM colour and typography CSS variables, dark-themed. | Use as the source for `:root[data-scheme="awm-dark"]` token values. The kit's `design.md` is the actual source of truth; this file is its dark-mode CSS-rendered form. |
| `components/badges.html` | Badge variants: gold (warning), neutral, cyan (info), green (success), red (error). | Recipe for status chips in the contacts table and reminders board. |
| `components/buttons.html` | Primary / secondary / gold-accent / danger button styles, three sizes. | Recipe for buttons everywhere in the app. |
| `components/cards.html` | Card / panel container patterns. | Recipe for the stat cards, panels, and detail surfaces. |
| `components/colors-neutrals.html` | Neutral colour palette swatches with hex values. | Sanity-check colour decisions. |
| `components/colors-primary.html` | Primary / gold palette swatches. | Same. |
| `components/colors-semantic.html` | Semantic colour swatches (success / warning / error). | Same. |
| `components/data-viz.html` | Chart / data-viz colour palette. | Not used in MVP (no charts), but available if a v2 analytics view is added. |
| `components/forms.html` | Input / textarea / select / radio / checkbox styles. | Recipe for the contact-edit form and the touchpoint-log modal. |
| `components/shadows.html` | Shadow elevation tiers. | Sanity-check elevation decisions. |
| `components/spacing.html` | Spacing scale demonstration. | Use as the basis for Tailwind's spacing token customisation if you customise it (default Tailwind spacing is fine for MVP). |
| `components/type-body.html` | Body type ramp (Barlow regular). | Recipe for body text sizes / weights / line-heights. |
| `components/type-display.html` | Display type ramp (Cormorant Garamond). | Recipe for headlines and stat numbers. |
| `components/type-scale.html` | Combined type scale from caption to display. | Useful overview. |

## What's NOT here

Things from the AWM Design System that were considered and skipped:

- `preview/backgrounds.html` (4 MB, base64-embedded brand backgrounds) — the same backgrounds are in `../../assets/` as separate image files.
- `preview/logo.html` (463 KB, logo variants) — logos are in `../../assets/`.
- `ui_kits/training_hub/` — internal training LMS, out of scope.
- `slides/` — presentation deck templates, not relevant to the desktop app (the kit's own deck generator covers this).
- The various `uploads/` raw files — mostly duplicates of brand assets already in `../../assets/`.

## Light mode

The mockup and all the component preview HTMLs are **dark mode only**.
The MVP must support both `awm-light` and `awm-dark`. For light-mode
colour values, see the kit's `../../design.md` — it contains both schemes
in `:root[data-scheme="awm-light"]` and `:root[data-scheme="awm-dark"]`
blocks. The light scheme follows the same component vocabulary as dark
(same buttons, same badges, same cards) with inverted backgrounds and
darker text.

A useful next step for someone building the app would be to generate
light-mode versions of the most-used component preview HTMLs
(`buttons.html`, `badges.html`, `forms.html`, `cards.html`) so the
visual targets exist for both themes. Not blocking for MVP — Tailwind
+ shadcn/ui give you both modes for free when the theme tokens are
populated correctly.
