# AWM CRM App — UI Kit

> **⚠ Color scheme superseded.** This mockup uses the older forest-green
> palette (`#18231E` / `#243028`). The canonical AWM Relationship OS scheme
> is **true-black** (`#050505` / `#0E0E0E` / `#1A1A1A`) per `../../design.md`.
> Use this file for **layout and composition reference only** — sidebar
> pattern, stat-card layout, table structure, badge placement. Get color
> values from `design.md`, not from this file or its CSS.

## Overview
High-fidelity prototype of the Ascendance Wealth Management internal CRM web application for consultants.

## Screens
- **Dashboard** — Stats overview, recent clients table, activity feed
- **Clients** — Full client roster with policy type, cash value, status
- **Policies** (placeholder)
- **Pipeline** (placeholder)
- **Presentations** (placeholder)
- **Training Hub** (placeholder)
- **Calendar** (placeholder)
- **Settings** (placeholder)

## Components
- Sidebar navigation with section groups and badges
- Top header with search and action buttons
- Stat cards with Cormorant Garamond display numbers
- Data table with badge status indicators
- Activity feed with color-coded event dots
- Tab switcher
- Badges: gold (IUL), neutral (UL), cyan (PWV), green/red/gold status

## Design Notes
- Dark forest green (#18231E) base; slightly lighter (#243028) for main area
- Gold (#C6A34F) as primary accent — active states, badges, numbers
- Barlow Condensed for all labels/badges in UPPERCASE
- Cormorant Garamond for large stat numbers
- JetBrains Mono for financial values
- Angular 4px border-radius throughout
- Subtle gold border (18% opacity) for all cards/panels

## Usage
Open `index.html` directly. Navigate using the sidebar — dashboard and clients views are fully interactive.
