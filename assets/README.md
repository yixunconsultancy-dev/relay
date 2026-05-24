# Brand Assets

These files are the AWM Relationship OS Kit's brand asset library. They are
the source images the kit pulls from when rendering PDFs, PPTX decks, and
preview PNGs.

The library is shipped with the kit so any consultant who downloads it has
a complete, self-contained set without needing to fetch anything else.

## Source

Copied from `/Users/luc/Documents/paperclip/AWM Design System/assets/`. The
AWM Design System remains the canonical brand library. If the brand evolves,
update `design.md` (the source of truth for design tokens) and re-copy the
relevant image files into this folder.

`design.md` is the single source of truth for colors, typography, and
schemes. This folder is the single source of imagery the renderers can use.

## Currently Used By The Renderer (11 files)

These files are referenced by `BRAND_ASSET_FILENAMES` and
`SCHEME_BRAND_DEFAULTS` in `scripts/relationship_os.py`. The current PPTX
and PDF templates pull from them deterministically — every body slide in a
generated deck uses the same background watermark, and the auto-appended
closing slide uses the scheme's closing image.

| File | Use |
|---|---|
| `logo_dark.png` | Dark logo: awm-light cover + closing slide + PDF header |
| `logo_light.png` | Light logo (alternative; not in active rotation) |
| `logo_white_wordmark.png` | White wordmark: awm-dark cover + closing slide + PDF header |
| `logo_white_mark.png` | White mark: awm-dark PDF watermark |
| `bg_mountain_clouds.png` | awm-light cover slide background |
| `bg_mountain_dusk.jpeg` | Reserved alternative awm-light background (defined but not active) |
| `bg_dark_water.jpg` | awm-dark cover slide background |
| `bg_network_mesh.png` | awm-light body slide watermark + PDF watermark |
| `bg_constellation.png` | awm-dark body slide watermark |
| `closing_image1.png` | awm-light closing slide background |
| `closing_image2.png` | awm-dark closing slide background |

## Available For Future Use (22 files)

These are shipped with the kit so they're locally available when the kit
gains the ability to vary imagery across slides, generate longer or more
visually-varied decks, or compose campaign-themed deliverables. The current
renderer does **not** use them — adding them to a deliverable requires a
small script enhancement (see "Future work" below).

### Alternative backgrounds

| File | Note |
|---|---|
| `bg_city_night.jpg` | Urban night background; candidate for a future "city" scheme |
| `bg_roses_dark.jpg` | Floral dark background; candidate for warmer-toned variants |

### Closing-themed imagery (6 unused files)

Two of the eight `closing_image*` files (`closing_image1.png` and
`closing_image2.png`) are now wired into the awm-light and awm-dark
closing slides respectively. The remaining six are reserved for future
variant closing styles or per-deck Hermes selection.

`closing_image3.jpg`, `closing_image4.jpg`, `closing_image5.png`,
`closing_image6.jpg`, `closing_image7.png`, `closing_image8.jpg`.

Note: `closing_image4.jpg` is bit-identical to `bg_roses_dark.jpg`,
`closing_image5.png` to `logo_dark.png`, `closing_image7.png` to
`logo_light.png`, and `closing_image8.jpg` to `bg_dark_water.jpg`. Both
names are kept because the AWM Design System references them under both
namespaces.

### th25 campaign imagery (15 files)

Reserved for a Time-Horizon-25 campaign theme.

`th25_image1.png` through `th25_image15.png`.

Note: several `th25_image*` files are bit-identical to the
currently-used backgrounds/logos (e.g. `th25_image14.png` = `bg_mountain_clouds.png`,
`th25_image15.png` = `bg_network_mesh.png`, `th25_image7.png` = `logo_dark.png`).
The duplicates are intentional so external references to the th25 names
still resolve.

## Future Work

The current renderer is deterministic — it picks the same per-scheme
defaults from `SCHEME_BRAND_DEFAULTS` on every call. To use the reserved
images, one of these has to happen:

1. **Per-slide imagery.** Extend `add_ppt_slide` so it can accept a
   `background_asset` override for the body slide watermark, and let
   Hermes pick from the reserved library when generating a longer deck.
2. **Campaign themes.** Add a new scheme entry to `SCHEME_BRAND_DEFAULTS`
   (e.g. `awm-th25`) and a `--design-scheme` flag that picks th25 imagery
   as the default for that scheme.
3. **Closing slides.** Add a new section type to `slide_sections` (e.g.
   "Next Steps + Closing") that uses one of the `closing_image*` files.

None of those are wired up yet.

## Overriding This Folder

If a consultant has their own brand, set `RELATIONSHIP_OS_BRAND_ASSETS_DIR`
in their `.env` to a folder containing files of the same names. The script
will use whichever folder is configured.

If `RELATIONSHIP_OS_BRAND_ASSETS_DIR` is not set, the kit defaults to this
folder (`./assets/`).
