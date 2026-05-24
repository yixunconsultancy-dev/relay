#!/usr/bin/env python3
"""Relationship OS v0 command helper.

This script is intentionally small: Hermes can call it from Telegram sessions,
and consultants can run it locally during setup. The product rule is that the
agent's structured source of truth is SQLite; CSV, Google Sheets, and Markdown
are consultant-facing views or legacy compatibility modes.
"""

from __future__ import annotations

import argparse
import contextlib
import csv
import json
import os
import re
import shutil
import sqlite3
import sys
import textwrap
import unicodedata
import uuid
import zlib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOCAL_DIR = ROOT / "data" / "local_sheet"
DEFAULT_DB_PATH = ROOT / "data" / "relationship_os.sqlite3"
DEFAULT_VAULT_DIR = ROOT / "vault"
DEFAULT_DESIGN_PATH = ROOT / "design.md"
DEFAULT_BRAND_ASSETS_DIR = ROOT / "assets"

AI_SECTION_START = "<!-- relationship-os:generated:start -->"
AI_SECTION_END = "<!-- relationship-os:generated:end -->"
DRAFT_NOTICE = (
    "Draft only. Relationship OS outputs are private operating aids for FC review; "
    "they are not auto-sent and are not compliance-approved client recommendations."
)
BRAND_FOOTER_ATTRIBUTION = "Private FC operating aid. Not financial advice. Review before any client-facing use."

CONTACTS = "Contacts"
TOUCHPOINTS = "Touchpoints"
REMINDERS = "Reminders"
DAILY_FOCUS = "Daily Focus"
SETTINGS = "Settings"
EVENTS = "Events"
POLICIES = "Policies"
CLARIFICATIONS = "Clarifications"

# Append-only audit table. Every durable write (touchpoint logged, reminder
# completed/snoozed/cancelled, etc.) records one row here so the consultant or
# a future reconcile pass can answer "what happened on date X?" and "what
# closed reminder r_xxx?" without grepping through application logs.
VALID_EVENT_KINDS = {
    "touchpoint_logged",
    "reminder_completed",
    "reminder_snoozed",
    "reminder_cancelled",
    "contact_created",
    "contact_updated",
    "contact_merged",
    "contact_archived",
    "contact_unarchived",
    "contact_renamed",
    "reminder_duplicate_skipped",
    "policy_created",
    "policy_updated",
    "policy_archived",
    "clarification_queued",
    "clarification_resolved",
}

# Tables mirrored to the consultant-facing view. The Events table is
# intentionally excluded — it's diagnostic, not consultant-facing.
CONSULTANT_VIEW_TABS = [CONTACTS, TOUCHPOINTS, REMINDERS, POLICIES, DAILY_FOCUS, SETTINGS]

HEADERS: Dict[str, List[str]] = {
    CONTACTS: [
        "id",
        "name",
        "type",
        "relationship_stage",
        "phone",
        "email",
        "occupation",
        "company",
        "address",
        "birthday",
        "family",
        "policies",
        "financial_concerns",
        "interests",
        "referral_source",
        "next_review_date",
        "last_touch_date",
        "notes",
        # ISO timestamp when this contact was archived (soft-deleted). Empty
        # means active. Archived contacts are hidden from default app views
        # but stay in the DB so the audit trail and historical touchpoints
        # are preserved.
        "archived_at",
        "created_at",
        "updated_at",
    ],
    TOUCHPOINTS: [
        "id",
        "contact_id",
        "contact_name",
        "date",
        "type",
        "sentiment",
        "summary",
        "topics",
        "action_items",
        "meeting_number",
        "raw_input",
        "notes",
        "created_at",
    ],
    REMINDERS: [
        "id",
        "contact_id",
        "contact_name",
        "due_date",
        "type",
        "priority",
        "context",
        "status",
        "snoozed_until",
        "source_touchpoint_id",
        "created_at",
        "completed_at",
    ],
    DAILY_FOCUS: [
        "date",
        "priority_1",
        "priority_2",
        "priority_3",
        "follow_ups_due",
        "reflection",
        "bottlenecks",
        "created_at",
    ],
    SETTINGS: ["key", "value"],
    EVENTS: [
        "id",
        "timestamp",
        "kind",
        "contact_id",
        "subject_id",
        "payload",
        "source",
    ],
    POLICIES: [
        "id",
        "contact_id",
        "insurer",
        "plan_name",
        "policy_type",
        "policy_number",
        "sum_assured",
        "premium_amount",
        "premium_frequency",
        "premium_term",
        "policy_term",
        "payment_method",
        "start_date",
        "review_date",
        "review_frequency",
        "last_reviewed",
        "current_value",
        "valuation_date",
        "surrender_value",
        "policy_owner",
        "life_assured",
        "payor",
        "beneficiaries",
        "riders",
        "servicing_rep",
        "needs_category",
        "status",
        "notes",
        "created_at",
        "updated_at",
    ],
    # Clarification queue — items Hermes wasn't confident enough to log.
    # Used during bulk imports (consultant forwards 20 Excel rows; Hermes
    # parses each; the unclear ones land here for triage instead of one-by-one
    # inline questions).
    CLARIFICATIONS: [
        "id",
        # Verbatim consultant input that triggered the clarification.
        "source_input",
        # Where the input came from. "bulk_import" / "telegram" / "manual".
        "source_context",
        # Hermes's best-guess extraction as JSON. The consultant can accept
        # it as-is via resolve-clarification --resolution log_anyway.
        "hermes_guess",
        # Human-readable reason (e.g., "Two contacts named Sarah —
        # disambiguation required.")
        "reason",
        # pending / resolved / abandoned
        "status",
        # log_anyway / log_corrected / discard / "" (when pending)
        "resolution",
        # Corrected payload (JSON) if log_corrected. Empty otherwise.
        "resolution_payload",
        "created_at",
        "resolved_at",
    ],
}

DEFAULT_SETTINGS = {
    "timezone": "Asia/Singapore",
    "reminder_time": "08:00",
    "reminder_frequency": "daily",
    "follow_up_default_days": "7",
    "review_interval_months": "12",
    "name": "Demo Consultant",
    "vault_dir": "vault",
    "design_path": "design.md",
    "design_scheme": "awm-light",
}

VALID_SETTING_KEYS = set(DEFAULT_SETTINGS)
VALID_DESIGN_SCHEMES = {"awm-light", "awm-dark"}

DEFAULT_DESIGN_TOKENS = {
    "primary": "#1F3A5F",
    "accent": "#2F855A",
    "accent_text": "#2F855A",
    "background": "#FFFFFF",
    "text": "#172033",
    "muted": "#6B7280",
    "font_heading": "Aptos Display",
    "font_body": "Aptos",
    "scheme": "awm-light",
    "surface": "#FFFFFF",
    "border": "#D8CDBA",
    "text_soft": "#4A473F",
    "footer": "#777064",
    "brand_footer_attribution": BRAND_FOOTER_ATTRIBUTION,
}

BRAND_ASSET_FILENAMES = {
    "logo_dark": "logo_dark.png",
    "logo_light": "logo_light.png",
    "logo_white_wordmark": "logo_white_wordmark.png",
    "logo_white_mark": "logo_white_mark.png",
    "bg_mountain_clouds": "bg_mountain_clouds.png",
    "bg_mountain_dusk": "bg_mountain_dusk.jpeg",
    "bg_dark_water": "bg_dark_water.jpg",
    "bg_network_mesh": "bg_network_mesh.png",
    "bg_constellation": "bg_constellation.png",
    # Closing-slide imagery (unique closing files; 4, 5, 7, 8 are
    # bit-identical to assets above and reachable by their main names).
    "closing_image1": "closing_image1.png",
    "closing_image2": "closing_image2.png",
    "closing_image3": "closing_image3.jpg",
    "closing_image6": "closing_image6.jpg",
}

SCHEME_BRAND_DEFAULTS = {
    "awm-dark": {
        "background": "#050505",
        "surface": "#0E0E0E",
        "border": "#2A2A2A",
        "primary": "#F5F1E8",
        "text": "#D8D0C3",
        "text_soft": "#A6A6A6",
        "muted": "#A6A6A6",
        "footer": "#A6A6A6",
        "accent_text": "#C6A34F",
        "logo_cover": "logo_white_wordmark",
        "logo_body": "logo_white_wordmark",
        "watermark_logo": "logo_white_mark",
        "cover_background": "bg_dark_water",
        "body_background": "bg_constellation",
        "closing_background": "closing_image6",
        "pdf_header_logo": "logo_white_wordmark",
        "pdf_watermark": "logo_white_mark",
    },
    "awm-light": {
        "background": "#FAF7F0",
        "surface": "#FFFDF8",
        "border": "#D8CDBA",
        "primary": "#18231E",
        "text": "#1B1B18",
        "text_soft": "#4A473F",
        "muted": "#777064",
        "footer": "#777064",
        "accent_text": "#815D46",
        "logo_cover": "logo_dark",
        "logo_body": "logo_dark",
        "watermark_logo": "logo_dark",
        "cover_background": "bg_mountain_clouds",
        "body_background": "bg_network_mesh",
        "closing_background": "bg_mountain_dusk",
        "pdf_header_logo": "logo_dark",
        "pdf_watermark": "bg_network_mesh",
    },
}

# Enum values Hermes must use when calling log-touchpoint. The script
# validates against these; it does not try to interpret free-form English.
#
# `import` is the type used by bulk-import flows (xlsx/csv ingestion). It is
# explicitly NOT a real consultant interaction: it does not update
# `last_touch_date` on the contact, and the UI hides these by default in the
# timeline. Everything else IS treated as a real interaction.
VALID_TOUCHPOINT_TYPES = {
    "meeting",
    "call",
    "coffee",
    "lunch",
    "event",
    "message",
    "referral",
    "other",
    "import",
}

# Touchpoint types that represent a real consultant-client interaction.
# Only these update `contacts.last_touch_date` and the "needs attention"
# attention calculator. Imports, sync, and other system-generated touchpoints
# must NOT pollute these signals.
REAL_INTERACTION_TOUCHPOINT_TYPES = {
    "meeting",
    "call",
    "coffee",
    "lunch",
    "event",
    "message",
    "referral",
    "other",
}
VALID_SENTIMENTS = {"positive", "neutral", "negative", "mixed"}
VALID_CONTACT_TYPES = {"client", "prospect", "candidate", "advisor", "other"}
VALID_STAGES = {"cold", "warming", "warm", "hot", "client", "inactive"}
VALID_PRIORITIES = {"high", "medium", "low"}
VALID_REMINDER_TYPES = {
    "follow_up",
    "review",
    "birthday",
    "anniversary",
    "renewal",
    "nomination",
    "claims",
    "custom",
}

# Policy status taxonomy. "archived" is the soft-delete state — we never
# actually delete a policy row so the audit trail survives.
VALID_POLICY_STATUSES = {"active", "lapsed", "surrendered", "claimed", "archived"}

# Editable policy fields. `id`, `contact_id`, `created_at`, `updated_at` are
# managed by the kit and can't be overwritten via update-policy.
EDITABLE_POLICY_FIELDS = {
    "insurer",
    "plan_name",
    "policy_type",
    "policy_number",
    "sum_assured",
    "premium_amount",
    "premium_frequency",
    "premium_term",
    "policy_term",
    "payment_method",
    "start_date",
    "review_date",
    "review_frequency",
    "last_reviewed",
    "current_value",
    "valuation_date",
    "surrender_value",
    "policy_owner",
    "life_assured",
    "payor",
    "beneficiaries",
    "riders",
    "servicing_rep",
    "needs_category",
    "status",
    "notes",
}

POLICY_DATE_FIELDS = ("start_date", "review_date", "last_reviewed", "valuation_date")

# Fields the consultant owns and Hermes may write via `update-contact`.
# `name` is intentionally excluded — name changes should go through a contact
# merge or a deliberate rename flow, not a casual field update.
CONSULTANT_MANAGED_FIELDS = {
    "phone",
    "email",
    "occupation",
    "company",
    "address",
    "birthday",
    "family",
    "policies",
    "financial_concerns",
    "interests",
    "referral_source",
    "next_review_date",
    "notes",
}

# Fields Hermes must never overwrite — they're derived from touchpoints or
# merges and have their own update paths.
HERMES_MANAGED_FIELDS = {
    "id",
    "name",
    "type",
    "relationship_stage",
    "last_touch_date",
    "created_at",
    "updated_at",
}

# Free-text fields where `update-contact` appends with a date prefix by
# default (preserving prior content). Use --replace to force overwrite.
APPEND_BY_DEFAULT_FIELDS = {
    "family",
    "policies",
    "financial_concerns",
    "interests",
    "notes",
}

# Stopwords removed before computing reminder-context Jaccard similarity for
# duplicate detection.
_CONTEXT_STOPWORDS = {
    "the", "a", "an", "and", "or", "to", "on", "in", "at", "for", "of",
    "with", "about", "next", "this", "that", "i", "you", "we", "he", "she",
    "follow", "up", "followup", "his", "her", "their", "it", "is", "be",
    "will", "would", "can", "should", "do", "did", "from", "by", "as",
}


class RelationshipOSError(RuntimeError):
    pass


@dataclass
class TouchpointInput:
    """Structured payload describing one logged interaction.

    Hermes is responsible for extracting these fields from the consultant's
    natural-language Telegram message. The script validates and stores them;
    it does not attempt to parse English itself.
    """

    contact_name: str
    touch_date: date
    touchpoint_type: str
    sentiment: str
    summary: str
    raw_input: str
    topics: List[str] = field(default_factory=list)
    action_items: str = ""
    contact_type: str = ""
    relationship_stage: str = ""
    reminder_due: Optional[date] = None
    reminder_priority: str = ""
    reminder_context: str = ""
    reminder_type: str = "follow_up"
    completes_reminder_ids: List[str] = field(default_factory=list)
    allow_duplicate_reminder: bool = False


VALID_REMINDER_STATUSES = {"pending", "done", "snoozed", "cancelled"}


# Slide section types Hermes may include in a deck payload. The script
# always prepends a cover slide and appends a closing slide, so consultants
# / Hermes never specify those types explicitly.
VALID_SECTION_TYPES = {
    "contact_context",
    "touchpoint_summary",
    "touchpoint_detail",
    "content",
    "open_items",
}

# Content density limits per slide. Borrowed from the frontend-slides skill
# (Content density limits table). The pagination rule is: if a section would
# exceed the limit, split into multiple slides — never cram.
MAX_BULLETS_PER_CONTENT_SLIDE = 6
MAX_TOUCHPOINT_ENTRIES_PER_SUMMARY_SLIDE = 5
MAX_OPEN_ITEMS_PER_SLIDE = 6


@dataclass
class SlideSection:
    """One section of a slide deck. Hermes provides these; the script renders
    each one with the deterministic layout for that scheme."""

    type: str
    title: str = ""
    bullets: List[str] = field(default_factory=list)
    limit: Optional[int] = None
    touchpoint_id: str = ""


@dataclass
class RenderedSlide:
    """A slide ready to be emitted to PPTX. Built by section_to_slides()
    after pagination. add_ppt_slide() dispatches on `type`."""

    type: str  # "cover", "body", "closing"
    title: str = ""
    bullets: List[str] = field(default_factory=list)


def slide_section_from_dict(payload: object) -> SlideSection:
    """Validate and coerce a JSON-style section payload into a SlideSection."""
    if not isinstance(payload, dict):
        raise RelationshipOSError("Each section must be a JSON object.")
    section_type = str(payload.get("type") or "").strip().lower()
    if not section_type:
        raise RelationshipOSError("Section requires 'type'.")
    if section_type in {"cover", "closing"}:
        raise RelationshipOSError(
            f"Section type {section_type!r} is auto-added by the script; do not include it."
        )
    if section_type not in VALID_SECTION_TYPES:
        raise RelationshipOSError(
            f"Section type must be one of {sorted(VALID_SECTION_TYPES)}; got {section_type!r}."
        )

    section = SlideSection(type=section_type)

    if section_type == "content":
        title = str(payload.get("title") or "").strip()
        if not title:
            raise RelationshipOSError("content section requires 'title'.")
        bullets = payload.get("bullets") or []
        if not isinstance(bullets, list) or not bullets:
            raise RelationshipOSError("content section requires a non-empty 'bullets' list.")
        section.title = title
        section.bullets = [str(b).strip() for b in bullets if str(b).strip()]

    elif section_type == "touchpoint_detail":
        touchpoint_id = str(payload.get("touchpoint_id") or "").strip()
        if not touchpoint_id:
            raise RelationshipOSError("touchpoint_detail section requires 'touchpoint_id'.")
        bullets = payload.get("bullets") or []
        if not isinstance(bullets, list) or not bullets:
            raise RelationshipOSError("touchpoint_detail section requires non-empty 'bullets'.")
        section.touchpoint_id = touchpoint_id
        section.bullets = [str(b).strip() for b in bullets if str(b).strip()]

    elif section_type == "touchpoint_summary":
        limit = payload.get("limit")
        if limit is not None:
            try:
                section.limit = max(int(limit), 1)
            except (ValueError, TypeError):
                raise RelationshipOSError(
                    "touchpoint_summary 'limit' must be a positive integer."
                )

    # contact_context and open_items take no extra parameters
    return section


class Store:
    name = "base"

    def ensure(self) -> None:
        raise NotImplementedError

    def read(self, tab: str) -> List[Dict[str, str]]:
        raise NotImplementedError

    def append(self, tab: str, row: Dict[str, str]) -> None:
        raise NotImplementedError

    def replace(self, tab: str, rows: List[Dict[str, str]]) -> None:
        raise NotImplementedError

    def location(self) -> str:
        raise NotImplementedError


def sqlite_table_name(tab: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", tab.lower()).strip("_")


class SQLiteStore(Store):
    name = "sqlite"

    def __init__(self, db_path: Path):
        self.db_path = db_path

    def connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        # 5s busy_timeout so simultaneous writes between the app and Hermes
        # wait briefly for the other writer to finish instead of erroring
        # with "database is locked" immediately. WAL still allows concurrent
        # readers; this only changes write-vs-write contention behavior.
        conn = sqlite3.connect(self.db_path, timeout=5.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 5000")
        # WAL is persistent in the DB file, but only AFTER any connection sets
        # it once. If Hermes opens a fresh DB before the Tauri app, the journal
        # mode would default to 'delete' and concurrent writers serialize on
        # the file-level lock. Setting WAL here closes that window.
        # foreign_keys is per-connection (not persistent) — the app sets it on
        # every open, so we mirror that for symmetry and forward compatibility.
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def ensure(self) -> None:
        with contextlib.closing(self.connect()) as conn, conn:
            for tab, headers in HEADERS.items():
                table = sqlite_table_name(tab)
                columns = ", ".join(f'"{header}" TEXT' for header in headers)
                conn.execute(f'CREATE TABLE IF NOT EXISTS "{table}" ({columns})')
                existing = {
                    row["name"]
                    for row in conn.execute(f'PRAGMA table_info("{table}")').fetchall()
                }
                for header in headers:
                    if header not in existing:
                        conn.execute(f'ALTER TABLE "{table}" ADD COLUMN "{header}" TEXT')
            settings_table = sqlite_table_name(SETTINGS)
            settings_count = conn.execute(f'SELECT COUNT(*) FROM "{settings_table}"').fetchone()[0]
            if settings_count == 0:
                for key, value in DEFAULT_SETTINGS.items():
                    conn.execute(
                        f'INSERT INTO "{settings_table}" ("key", "value") VALUES (?, ?)',
                        (key, value),
                    )

    def read(self, tab: str) -> List[Dict[str, str]]:
        table = sqlite_table_name(tab)
        headers = HEADERS[tab]
        with contextlib.closing(self.connect()) as conn, conn:
            try:
                columns = ", ".join(f'"{header}"' for header in headers)
                rows = conn.execute(f'SELECT {columns} FROM "{table}"').fetchall()
            except sqlite3.OperationalError:
                return []
        return [{header: str(row[header] or "") for header in headers} for row in rows]

    def append(self, tab: str, row: Dict[str, str]) -> None:
        self.ensure()
        self._append_raw(tab, row)

    def _append_raw(self, tab: str, row: Dict[str, str]) -> None:
        table = sqlite_table_name(tab)
        headers = HEADERS[tab]
        placeholders = ", ".join("?" for _ in headers)
        columns = ", ".join(f'"{header}"' for header in headers)
        values = [row.get(key, "") for key in headers]
        with contextlib.closing(self.connect()) as conn, conn:
            conn.execute(f'INSERT INTO "{table}" ({columns}) VALUES ({placeholders})', values)

    def replace(self, tab: str, rows: List[Dict[str, str]]) -> None:
        self.ensure()
        table = sqlite_table_name(tab)
        headers = HEADERS[tab]
        placeholders = ", ".join("?" for _ in headers)
        columns = ", ".join(f'"{header}"' for header in headers)
        values = [[row.get(key, "") for key in headers] for row in rows]
        with contextlib.closing(self.connect()) as conn, conn:
            conn.execute(f'DELETE FROM "{table}"')
            conn.executemany(f'INSERT INTO "{table}" ({columns}) VALUES ({placeholders})', values)

    def reset(self) -> None:
        if self.db_path.exists():
            self.db_path.unlink()

    def location(self) -> str:
        return str(self.db_path)


class LocalCsvStore(Store):
    name = "local"

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

    def path_for(self, tab: str) -> Path:
        return self.base_dir / f"{tab.replace(' ', '_')}.csv"

    def ensure(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)
        for tab, headers in HEADERS.items():
            path = self.path_for(tab)
            if not path.exists():
                with path.open("w", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=headers)
                    writer.writeheader()
        if not self.read(SETTINGS):
            for key, value in DEFAULT_SETTINGS.items():
                self._append_raw(SETTINGS, {"key": key, "value": value})

    def read(self, tab: str) -> List[Dict[str, str]]:
        path = self.path_for(tab)
        if not path.exists():
            return []
        with path.open(newline="", encoding="utf-8") as f:
            return [dict(row) for row in csv.DictReader(f)]

    def append(self, tab: str, row: Dict[str, str]) -> None:
        self.ensure()
        self._append_raw(tab, row)

    def _append_raw(self, tab: str, row: Dict[str, str]) -> None:
        path = self.path_for(tab)
        with path.open("a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=HEADERS[tab], extrasaction="ignore")
            writer.writerow({key: row.get(key, "") for key in HEADERS[tab]})

    def replace(self, tab: str, rows: List[Dict[str, str]]) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)
        path = self.path_for(tab)
        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=HEADERS[tab], extrasaction="ignore")
            writer.writeheader()
            for row in rows:
                writer.writerow({key: row.get(key, "") for key in HEADERS[tab]})

    def location(self) -> str:
        return str(self.base_dir)


class GoogleSheetsStore(Store):
    name = "google"

    def __init__(self, sheet_id: str, key_path: str):
        try:
            import gspread  # type: ignore
        except ImportError as exc:
            raise RelationshipOSError(
                "Google mode requires gspread. Install dependencies with "
                "`python3 -m pip install -r requirements.txt`."
            ) from exc
        self.gspread = gspread
        self.sheet_id = sheet_id
        self.key_path = key_path
        self.client = gspread.service_account(filename=key_path)
        self.sheet = self.client.open_by_key(sheet_id)

    def worksheet(self, tab: str):
        try:
            return self.sheet.worksheet(tab)
        except Exception:
            return self.sheet.add_worksheet(title=tab, rows=1000, cols=len(HEADERS[tab]) + 2)

    def ensure(self) -> None:
        for tab, headers in HEADERS.items():
            ws = self.worksheet(tab)
            existing = ws.row_values(1)
            if existing[: len(headers)] != headers:
                ws.update("A1", [headers])
        if not self.read(SETTINGS):
            for key, value in DEFAULT_SETTINGS.items():
                self._append_raw(SETTINGS, {"key": key, "value": value})

    def read(self, tab: str) -> List[Dict[str, str]]:
        ws = self.worksheet(tab)
        rows = ws.get_all_records()
        return [{str(k): str(v) for k, v in row.items()} for row in rows]

    def append(self, tab: str, row: Dict[str, str]) -> None:
        self.ensure()
        self._append_raw(tab, row)

    def _append_raw(self, tab: str, row: Dict[str, str]) -> None:
        ws = self.worksheet(tab)
        ws.append_row([row.get(key, "") for key in HEADERS[tab]], value_input_option="USER_ENTERED")

    def replace(self, tab: str, rows: List[Dict[str, str]]) -> None:
        ws = self.worksheet(tab)
        values = [HEADERS[tab]]
        values.extend([[row.get(key, "") for key in HEADERS[tab]] for row in rows])
        ws.clear()
        ws.update("A1", values)

    def location(self) -> str:
        return f"https://docs.google.com/spreadsheets/d/{self.sheet_id}/edit"


def load_env(path: Optional[Path]) -> None:
    if not path or not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def get_store() -> Store:
    mode = os.getenv("RELATIONSHIP_OS_STORE", "sqlite").strip().lower()
    if mode in {"sqlite", "local_sqlite"}:
        db_path = Path(os.getenv("RELATIONSHIP_OS_DB_PATH", str(DEFAULT_DB_PATH))).expanduser()
        return SQLiteStore(db_path)
    if mode == "google":
        # Legacy compatibility mode: Google Sheets is the canonical store.
        # Deprecated — SQLite is the source of truth in current docs, with
        # Google Sheets available as a consultant-facing view via
        # RELATIONSHIP_OS_CONSULTANT_VIEW=google. Kept reachable for kits
        # initialised before the SQLite migration.
        print(
            "Warning: RELATIONSHIP_OS_STORE=google is deprecated. "
            "Switch to RELATIONSHIP_OS_STORE=sqlite with "
            "RELATIONSHIP_OS_CONSULTANT_VIEW=google for new setups.",
            file=sys.stderr,
        )
        sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
        key_path = os.getenv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", "").strip()
        if not sheet_id:
            raise RelationshipOSError("GOOGLE_SHEET_ID is required for Google mode.")
        if not key_path:
            raise RelationshipOSError("GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required for Google mode.")
        return GoogleSheetsStore(sheet_id=sheet_id, key_path=key_path)
    if mode not in {"local", "csv", "local_csv"}:
        raise RelationshipOSError(
            "RELATIONSHIP_OS_STORE must be sqlite, local, or google. "
            "Use RELATIONSHIP_OS_CONSULTANT_VIEW for csv, google, or obsidian outputs."
        )
    base_dir = Path(os.getenv("RELATIONSHIP_OS_LOCAL_DIR", str(DEFAULT_LOCAL_DIR))).expanduser()
    return LocalCsvStore(base_dir)


def consultant_view_modes() -> List[str]:
    raw = os.getenv("RELATIONSHIP_OS_CONSULTANT_VIEW", "csv").strip().lower()
    if raw in {"", "none", "off", "false"}:
        return []
    aliases = {
        "local": "csv",
        "local-csv": "csv",
        "local_csv": "csv",
        "sheets": "google",
        "google_sheets": "google",
        "google-sheets": "google",
        "md": "obsidian",
        "markdown": "obsidian",
    }
    modes: List[str] = []
    for item in re.split(r"[\s,]+", raw):
        if not item:
            continue
        mode = aliases.get(item, item)
        if mode not in {"csv", "google", "obsidian"}:
            raise RelationshipOSError(
                "RELATIONSHIP_OS_CONSULTANT_VIEW must be csv, google, obsidian, or none."
            )
        if mode not in modes:
            modes.append(mode)
    return modes


def sync_consultant_views(store: Store) -> List[str]:
    """Mirror the SQLite source of truth into the consultant's chosen view."""
    if not isinstance(store, SQLiteStore):
        return []

    synced: List[str] = []
    for mode in consultant_view_modes():
        if mode == "csv":
            csv_dir = Path(os.getenv("RELATIONSHIP_OS_LOCAL_DIR", str(DEFAULT_LOCAL_DIR))).expanduser()
            csv_store = LocalCsvStore(csv_dir)
            csv_store.ensure()
            for tab in CONSULTANT_VIEW_TABS:
                csv_store.replace(tab, store.read(tab))
            synced.append(f"csv:{csv_dir}")
        elif mode == "google":
            sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
            key_path = os.getenv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH", "").strip()
            if not sheet_id:
                raise RelationshipOSError("GOOGLE_SHEET_ID is required for Google consultant view.")
            if not key_path:
                raise RelationshipOSError(
                    "GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required for Google consultant view."
                )
            sheets_store = GoogleSheetsStore(sheet_id=sheet_id, key_path=key_path)
            sheets_store.ensure()
            for tab in CONSULTANT_VIEW_TABS:
                sheets_store.replace(tab, store.read(tab))
            synced.append(f"google:{sheets_store.location()}")
        elif mode == "obsidian":
            vault_dir = configured_vault_dir(store)
            export_markdown_from_store(store, vault_dir, dry_run=False)
            synced.append(f"obsidian:{vault_dir}")
    return synced


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def today_in_settings(store: Optional[Store] = None) -> date:
    tz_name = os.getenv("CONSULTANT_TIMEZONE") or os.getenv("RELATIONSHIP_OS_TIMEZONE")
    if store:
        settings = {row.get("key"): row.get("value") for row in store.read(SETTINGS)}
        tz_name = tz_name or settings.get("timezone")
    tz_name = tz_name or "Asia/Singapore"
    try:
        return datetime.now(ZoneInfo(tz_name)).date()
    except Exception:
        return date.today()


def make_id(prefix: str, base: Optional[date] = None) -> str:
    base = base or date.today()
    return f"{prefix}_{base.strftime('%Y%m%d')}_{uuid.uuid4().hex[:4]}"


def parse_iso_date_strict(value: object, field_name: str) -> date:
    """Parse an ISO YYYY-MM-DD date, raising RelationshipOSError on bad input."""
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        raise RelationshipOSError(
            f"{field_name} must be ISO YYYY-MM-DD; got {value!r}."
        )


def topics_to_list(raw: object) -> List[str]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    return [item.strip() for item in str(raw).split(",") if item.strip()]


def touchpoint_input_from_dict(payload: object, default_date: date) -> TouchpointInput:
    """Validate and coerce a JSON-style payload into a TouchpointInput.

    Hermes is expected to assemble this payload from the consultant's
    Telegram message. We validate enums, parse dates, and reject anything
    that does not match the schema in SOUL.md.
    """
    if not isinstance(payload, dict):
        raise RelationshipOSError("log-touchpoint payload must be a JSON object.")

    contact_name = str(payload.get("contact_name") or "").strip()
    if not contact_name:
        raise RelationshipOSError("contact_name is required.")

    touchpoint_type = str(payload.get("touchpoint_type") or "").strip().lower()
    if not touchpoint_type:
        raise RelationshipOSError("touchpoint_type is required.")
    if touchpoint_type not in VALID_TOUCHPOINT_TYPES:
        raise RelationshipOSError(
            f"touchpoint_type must be one of {sorted(VALID_TOUCHPOINT_TYPES)}; got {touchpoint_type!r}."
        )

    sentiment = str(payload.get("sentiment") or "").strip().lower()
    if not sentiment:
        raise RelationshipOSError("sentiment is required.")
    if sentiment not in VALID_SENTIMENTS:
        raise RelationshipOSError(
            f"sentiment must be one of {sorted(VALID_SENTIMENTS)}; got {sentiment!r}."
        )

    summary = str(payload.get("summary") or "").strip()
    if not summary:
        raise RelationshipOSError("summary is required.")

    raw_input = str(payload.get("raw_input") or summary)

    touch_date_raw = payload.get("touch_date") or payload.get("date")
    touch_date = (
        parse_iso_date_strict(touch_date_raw, "touch_date") if touch_date_raw else default_date
    )

    contact_type = str(payload.get("contact_type") or "").strip().lower()
    if contact_type and contact_type not in VALID_CONTACT_TYPES:
        raise RelationshipOSError(
            f"contact_type must be one of {sorted(VALID_CONTACT_TYPES)}; got {contact_type!r}."
        )

    relationship_stage = str(payload.get("relationship_stage") or "").strip().lower()
    if relationship_stage and relationship_stage not in VALID_STAGES:
        raise RelationshipOSError(
            f"relationship_stage must be one of {sorted(VALID_STAGES)}; got {relationship_stage!r}."
        )

    reminder_due_raw = payload.get("reminder_due")
    reminder_due = (
        parse_iso_date_strict(reminder_due_raw, "reminder_due") if reminder_due_raw else None
    )

    reminder_priority = str(payload.get("reminder_priority") or "").strip().lower()
    if reminder_priority and reminder_priority not in VALID_PRIORITIES:
        raise RelationshipOSError(
            f"reminder_priority must be one of {sorted(VALID_PRIORITIES)}; got {reminder_priority!r}."
        )

    reminder_type = str(payload.get("reminder_type") or "follow_up").strip().lower()
    if reminder_due and reminder_type not in VALID_REMINDER_TYPES:
        raise RelationshipOSError(
            f"reminder_type must be one of {sorted(VALID_REMINDER_TYPES)}; got {reminder_type!r}."
        )

    raw_completes = payload.get("completes_reminder_ids") or []
    if not isinstance(raw_completes, list):
        raise RelationshipOSError("completes_reminder_ids must be a list of reminder IDs.")
    completes_reminder_ids = [str(item).strip() for item in raw_completes if str(item).strip()]

    return TouchpointInput(
        contact_name=contact_name,
        touch_date=touch_date,
        touchpoint_type=touchpoint_type,
        sentiment=sentiment,
        summary=summary,
        raw_input=raw_input,
        topics=topics_to_list(payload.get("topics")),
        action_items=str(payload.get("action_items") or "").strip(),
        contact_type=contact_type,
        relationship_stage=relationship_stage,
        reminder_due=reminder_due,
        reminder_priority=reminder_priority,
        reminder_context=str(payload.get("reminder_context") or "").strip(),
        reminder_type=reminder_type,
        completes_reminder_ids=completes_reminder_ids,
        allow_duplicate_reminder=bool(payload.get("allow_duplicate_reminder", False)),
    )


def settings_map(store: Store) -> Dict[str, str]:
    settings = DEFAULT_SETTINGS.copy()
    for row in store.read(SETTINGS):
        if row.get("key"):
            settings[row["key"]] = row.get("value", "")
    return settings


def cmd_update_setting(args: argparse.Namespace) -> Dict[str, object]:
    """Update one whitelisted local kit setting."""
    store = get_store()
    store.ensure()
    key = (args.key or "").strip()
    value = "" if args.value is None else str(args.value)
    if key not in VALID_SETTING_KEYS:
        raise RelationshipOSError(
            f"Unknown setting {key!r}. Allowed settings: {', '.join(sorted(VALID_SETTING_KEYS))}."
        )
    if key == "design_scheme" and value not in VALID_DESIGN_SCHEMES:
        raise RelationshipOSError(
            f"design_scheme must be one of {sorted(VALID_DESIGN_SCHEMES)}; got {value!r}."
        )

    rows = store.read(SETTINGS)
    target = next((row for row in rows if row.get("key") == key), None)
    old_value = target.get("value", "") if target else ""
    if target:
        target["value"] = value
        store.replace(SETTINGS, rows)
    else:
        store.append(SETTINGS, {"key": key, "value": value})
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "update-setting",
        "key": key,
        "value": value,
        "previous_value": old_value,
        "changed": old_value != value,
        "synced_views": synced,
        "message": f"Updated setting {key}.",
    }


def resolve_kit_path(value: str, default: Path) -> Path:
    if not value:
        return default
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return path


def configured_vault_dir(store: Store, explicit: Optional[str] = None) -> Path:
    settings = settings_map(store)
    raw = (
        explicit
        or os.getenv("RELATIONSHIP_OS_VAULT_DIR")
        or os.getenv("RELATIONSHIP_OS_MARKDOWN_DIR")
        or settings.get("vault_dir")
        or settings.get("markdown_output_path")
        or str(DEFAULT_VAULT_DIR)
    )
    return resolve_kit_path(raw, DEFAULT_VAULT_DIR)


def configured_design_path(store: Store) -> Path:
    settings = settings_map(store)
    raw = os.getenv("RELATIONSHIP_OS_DESIGN_PATH") or settings.get("design_path") or str(DEFAULT_DESIGN_PATH)
    return resolve_kit_path(raw, DEFAULT_DESIGN_PATH)


def configured_design_scheme(store: Store) -> str:
    settings = settings_map(store)
    return os.getenv("RELATIONSHIP_OS_DESIGN_SCHEME") or settings.get("design_scheme") or "awm-light"


def safe_filename(value: str, fallback: str = "untitled", max_length: int = 90) -> str:
    """Return a stable, readable filename stem safe for Obsidian and most filesystems."""

    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_value = re.sub(r"[\\/:\n\r\t]+", " ", ascii_value)
    ascii_value = re.sub(r"[^A-Za-z0-9._ -]+", "", ascii_value)
    ascii_value = re.sub(r"[\s_]+", "-", ascii_value.strip(" .-_")).lower()
    ascii_value = ascii_value.strip(".-")
    if not ascii_value:
        ascii_value = fallback
    return ascii_value[:max_length].rstrip(".-") or fallback


def split_items(value: str) -> List[str]:
    return [item.strip() for item in re.split(r"[,;]", value or "") if item.strip()]


def yaml_value(value: object) -> str:
    if value is None:
        return '""'
    if isinstance(value, list):
        return "[" + ", ".join(json.dumps(str(item), ensure_ascii=False) for item in value) + "]"
    return json.dumps(str(value), ensure_ascii=False)


def render_frontmatter(fields: Dict[str, object]) -> str:
    lines = ["---"]
    for key, value in fields.items():
        lines.append(f"{key}: {yaml_value(value)}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def parse_frontmatter_value(value: str) -> object:
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            return [item.strip().strip('"') for item in value[1:-1].split(",") if item.strip()]
    if value.startswith('"') and value.endswith('"'):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value.strip('"')
    return value


def parse_markdown_frontmatter(text: str) -> Dict[str, object]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---\n", 4)
    if end < 0:
        return {}
    frontmatter = text[4:end]
    parsed: Dict[str, object] = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        parsed[key.strip()] = parse_frontmatter_value(raw_value)
    return parsed


def read_markdown_frontmatter(path: Path) -> Dict[str, object]:
    return parse_markdown_frontmatter(path.read_text(encoding="utf-8"))


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---\n", 4)
    if end < 0:
        return text
    return text[end + len("\n---\n") :]


def write_generated_markdown(path: Path, fields: Dict[str, object], body: str, dry_run: bool = False) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    generated = f"{AI_SECTION_START}\n{body.strip()}\n{AI_SECTION_END}\n"
    prefix = ""
    suffix = ""
    if path.exists():
        existing_body = strip_frontmatter(path.read_text(encoding="utf-8"))
        start = existing_body.find(AI_SECTION_START)
        end = existing_body.find(AI_SECTION_END)
        if start >= 0 and end >= start:
            prefix = existing_body[:start].strip("\n")
            suffix = existing_body[end + len(AI_SECTION_END) :].strip("\n")
        elif existing_body.strip():
            suffix = existing_body.strip("\n")
    parts = [render_frontmatter(fields)]
    if prefix:
        parts.append(prefix + "\n\n")
    parts.append(generated)
    if suffix:
        parts.append("\n" + suffix + "\n")
    path.write_text("".join(parts), encoding="utf-8")


def contact_note_stem(contact: Dict[str, str]) -> str:
    return safe_filename(contact.get("name", "") or contact.get("id", ""), fallback=contact.get("id", "contact"))


def contact_note_path(vault_dir: Path, contact: Dict[str, str]) -> Path:
    return vault_dir / "Contacts" / f"{contact_note_stem(contact)}.md"


def touchpoint_note_base_stem(touchpoint: Dict[str, str]) -> str:
    raw_date = touchpoint.get("date", "")[:10] or "undated"
    raw_name = touchpoint.get("contact_name") or touchpoint.get("contact_id") or touchpoint.get("id") or "touchpoint"
    return f"{safe_filename(raw_date, fallback='undated')} {safe_filename(raw_name, fallback='contact')}"


def build_touchpoint_paths(vault_dir: Path, touchpoints: Sequence[Dict[str, str]]) -> Dict[str, Path]:
    paths: Dict[str, Path] = {}
    counts: Dict[str, int] = {}
    ordered = sorted(touchpoints, key=lambda row: (row.get("date", ""), row.get("contact_name", ""), row.get("id", "")))
    for row in ordered:
        base = touchpoint_note_base_stem(row)
        counts[base] = counts.get(base, 0) + 1
        stem = base if counts[base] == 1 else f"{base}-{counts[base]}"
        key = row.get("id") or f"{base}-{counts[base]}"
        paths[key] = vault_dir / "Touchpoints" / f"{stem}.md"
    return paths


def wiki_link(path: Path, vault_dir: Path, label: str) -> str:
    target = path.with_suffix("").relative_to(vault_dir).as_posix()
    return f"[[{target}|{label}]]"


def contact_wikilink(contact: Optional[Dict[str, str]], vault_dir: Path, fallback_name: str) -> str:
    if contact:
        return wiki_link(contact_note_path(vault_dir, contact), vault_dir, contact.get("name", fallback_name))
    return fallback_name


def contact_tags(contact: Dict[str, str]) -> List[str]:
    tags = ["relationship-os", "contact"]
    for key in ("type", "relationship_stage"):
        if contact.get(key):
            tags.append(safe_filename(contact[key], fallback="tag"))
    return tags


def touchpoint_tags(touchpoint: Dict[str, str]) -> List[str]:
    tags = ["relationship-os", "touchpoint"]
    for item in [touchpoint.get("type", ""), touchpoint.get("sentiment", ""), *split_items(touchpoint.get("topics", ""))]:
        if item:
            tags.append(safe_filename(item, fallback="tag"))
    return list(dict.fromkeys(tags))


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    color = hex_color.strip()
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        color = "#172033"
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def brand_assets_dir() -> Path:
    return Path(os.getenv("RELATIONSHIP_OS_BRAND_ASSETS_DIR", str(DEFAULT_BRAND_ASSETS_DIR))).expanduser()


def resolve_design_asset(text: str, filename: str) -> str:
    escaped = re.escape(filename)
    for match in re.finditer(rf"(?P<path>(?:~|/)[^\s`'\"\)]+{escaped})", text):
        path = Path(match.group("path")).expanduser()
        if path.exists():
            return str(path)
    return str(brand_assets_dir() / filename)


def apply_brand_defaults(tokens: Dict[str, str], text: str, scheme: str) -> None:
    scheme_defaults = SCHEME_BRAND_DEFAULTS.get(scheme, SCHEME_BRAND_DEFAULTS["awm-light"])
    tokens["scheme"] = scheme
    for key, value in scheme_defaults.items():
        if key not in tokens or tokens.get(key) == DEFAULT_DESIGN_TOKENS.get(key) or key in {
            "logo_cover",
            "logo_body",
            "watermark_logo",
            "cover_background",
            "body_background",
            "closing_background",
            "pdf_header_logo",
            "pdf_watermark",
        }:
            tokens[key] = value

    for asset_key, filename in BRAND_ASSET_FILENAMES.items():
        if filename in text or asset_key in scheme_defaults.values():
            tokens[f"asset_{asset_key}"] = resolve_design_asset(text, filename)

    for usage_key in (
        "logo_cover",
        "logo_body",
        "watermark_logo",
        "cover_background",
        "body_background",
        "closing_background",
        "pdf_header_logo",
        "pdf_watermark",
    ):
        asset_key = tokens.get(usage_key, "")
        asset_path = tokens.get(f"asset_{asset_key}", "")
        if asset_path:
            tokens[f"{usage_key}_path"] = asset_path

    footer_match = re.search(
        r"`([^`]*Private FC operating aid\. Not financial advice\. Review before any client-facing use\.[^`]*)`",
        text,
    )
    tokens["brand_footer_attribution"] = footer_match.group(1) if footer_match else BRAND_FOOTER_ATTRIBUTION


def load_design_tokens(path: Path, scheme: str = "awm-light") -> Dict[str, str]:
    tokens = DEFAULT_DESIGN_TOKENS.copy()
    if not path.exists():
        apply_brand_defaults(tokens, "", scheme)
        return tokens
    text = path.read_text(encoding="utf-8")
    block_match = re.search(
        rf":root\[data-scheme=[\"']{re.escape(scheme)}[\"']\]\s*\{{(?P<body>.*?)\n\}}",
        text,
        flags=re.S,
    )
    token_text = block_match.group("body") if block_match else text
    css_values = {
        key.lower().replace("-", "_"): value.upper()
        for key, value in re.findall(r"(?:--)?([A-Za-z0-9_-]+)\s*[:=]\s*(#[0-9A-Fa-f]{6})", token_text)
    }
    token_preferences = {
        # Prefer the scheme's heading/ink token, but fall back to text before the
        # generic default so dark-mode titles stay legible on #050505.
        "primary": ("ros_ink", "ros_cypress", "ros_text", "primary", "ink", "heading"),
        "accent": ("ros_accent", "accent", "gold"),
        "accent_text": ("ros_accent_deep", "ros_accent", "accent_text", "accent", "gold"),
        "background": ("ros_paper", "ros_bg", "background", "bg", "paper"),
        "text": ("ros_text", "ros_ink", "text", "ink"),
        "muted": ("ros_text_muted", "ros_text_soft", "muted"),
        "text_soft": ("ros_text_soft", "ros_text_muted", "text_soft", "muted"),
        "surface": ("ros_surface", "ros_paper", "surface", "paper"),
        "border": ("ros_border", "border"),
        "footer": ("ros_text_muted", "ros_text_soft", "footer"),
    }
    for token_key, preferred_names in token_preferences.items():
        for preferred in preferred_names:
            if preferred in css_values:
                tokens[token_key] = css_values[preferred]
                break
    for key, value in re.findall(r"(font[_ -]?(?:heading|body)|(?:heading|body)[_ -]?font)\s*[:=]\s*([A-Za-z0-9 ._-]+)", text, flags=re.I):
        normalized = key.lower().replace("-", "_").replace(" ", "_")
        token_key = "font_heading" if "heading" in normalized else "font_body"
        tokens[token_key] = value.strip()
    if "Cormorant Garamond" in text:
        tokens["font_heading"] = "Cormorant Garamond"
    if "Barlow" in text:
        tokens["font_body"] = "Barlow"
    apply_brand_defaults(tokens, text, scheme)
    return tokens


def plain_text_from_markdown(markdown: str) -> List[str]:
    lines = []
    for raw in markdown.splitlines():
        line = raw.strip()
        if not line:
            lines.append("")
            continue
        line = re.sub(r"^#{1,6}\s*", "", line)
        line = re.sub(r"^\-\s+\[[ xX]\]\s*", "- ", line)
        line = re.sub(r"^\-\s+", "- ", line)
        line = re.sub(r"\*\*(.*?)\*\*", r"\1", line)
        line = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", line)
        line = re.sub(r"\[(.*?)\]\([^)]*\)", r"\1", line)
        lines.extend(textwrap.wrap(line, width=88) or [""])
    return lines


def pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def design_asset_path(tokens: Dict[str, str], key: str) -> Optional[Path]:
    raw = tokens.get(f"{key}_path") or tokens.get(key) or ""
    if not raw:
        return None
    path = Path(raw).expanduser()
    return path if path.exists() else None


def import_pillow():
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore
    except ImportError as exc:
        raise RelationshipOSError(
            "Branded rendering requires Pillow. Install dependencies with `python3 -m pip install pillow`."
        ) from exc
    return Image, ImageDraw, ImageFont


def crop_alpha_bounds(image):
    if image.mode != "RGBA":
        return image
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    return image.crop(bbox) if bbox else image


def cover_crop(image, target_ratio: float):
    width, height = image.size
    current_ratio = width / height
    if current_ratio > target_ratio:
        new_width = int(height * target_ratio)
        left = max((width - new_width) // 2, 0)
        return image.crop((left, 0, left + new_width, height))
    new_height = int(width / target_ratio)
    top = max((height - new_height) // 2, 0)
    return image.crop((0, top, width, top + new_height))


def blend_color(image, color: str, alpha: float):
    Image, _ImageDraw, _ImageFont = import_pillow()
    overlay = Image.new("RGB", image.size, hex_to_rgb(color))
    return Image.blend(image.convert("RGB"), overlay, max(0.0, min(alpha, 1.0)))


def image_with_opacity(path: Path, output: Path, opacity: float = 1.0, crop: bool = True) -> Path:
    Image, _ImageDraw, _ImageFont = import_pillow()
    image = Image.open(path).convert("RGBA")
    if crop:
        image = crop_alpha_bounds(image)
    if opacity < 1:
        alpha = image.getchannel("A").point(lambda value: int(value * opacity))
        image.putalpha(alpha)
    image.save(output)
    return output


def build_ppt_cover_background(tokens: Dict[str, str], output: Path, width: int = 1920, height: int = 1080) -> Path:
    Image, _ImageDraw, _ImageFont = import_pillow()
    scheme = tokens.get("scheme", "awm-light")
    background = tokens.get("background", "#FAF7F0")
    canvas = Image.new("RGB", (width, height), hex_to_rgb(background))
    asset = design_asset_path(tokens, "cover_background")
    if asset:
        image = Image.open(asset).convert("RGB")
        if scheme == "awm-dark":
            image = cover_crop(image, width / height).resize((width, height))
            canvas = blend_color(image, tokens.get("background", "#050505"), 0.62)
        else:
            field_width = int(width * 0.42)
            crop = cover_crop(image, field_width / height).resize((field_width, height))
            wash = Image.blend(Image.new("RGB", crop.size, hex_to_rgb(background)), crop, 0.18)
            canvas.paste(wash, (width - field_width, 0))
    canvas.save(output)
    return output


def build_pdf_background(tokens: Dict[str, str], page_number: int, page_count: int, width: int = 1224, height: int = 1584):
    Image, ImageDraw, _ImageFont = import_pillow()
    scheme = tokens.get("scheme", "awm-light")
    scale = width / 612
    background = tokens.get("background", "#FAF7F0")
    surface = tokens.get("surface", "#FFFDF8")
    border = tokens.get("border", "#D8CDBA")
    canvas = Image.new("RGB", (width, height), hex_to_rgb(background))
    draw = ImageDraw.Draw(canvas, "RGBA")

    def pt(value: float) -> int:
        return int(round(value * scale))

    if scheme == "awm-dark":
        header_fill = tokens.get("background", "#050505")
        draw.rectangle([0, 0, width, pt(58)], fill=(*hex_to_rgb(header_fill), 255))
        draw.rectangle([0, pt(58), width, pt(59)], fill=(*hex_to_rgb(tokens.get("accent", "#C6A34F")), 150))
        draw.rectangle([pt(46), pt(92), width - pt(46), height - pt(66)], fill=(*hex_to_rgb(surface), 255))
        draw.rectangle([pt(46), pt(92), width - pt(46), height - pt(66)], outline=(*hex_to_rgb(border), 255), width=pt(1))
        watermark = design_asset_path(tokens, "pdf_watermark")
        if watermark:
            mark = Image.open(watermark).convert("RGBA")
            mark = crop_alpha_bounds(mark)
            mark.thumbnail((pt(96), pt(96)))
            alpha = mark.getchannel("A").point(lambda value: int(value * 0.08))
            mark.putalpha(alpha)
            canvas.paste(mark, (width - pt(142), height - pt(170)), mark)
        logo = design_asset_path(tokens, "pdf_header_logo")
        if logo:
            mark = Image.open(logo).convert("RGBA")
            mark = crop_alpha_bounds(mark)
            mark.thumbnail((pt(104), pt(32)))
            canvas.paste(mark, (pt(46), pt(18)), mark)
        draw.rectangle([pt(46), height - pt(54), width - pt(46), height - pt(53)], fill=(*hex_to_rgb(border), 255))
    else:
        draw.rectangle([pt(42), pt(78), width - pt(42), height - pt(66)], fill=(*hex_to_rgb(surface), 255))
        draw.rectangle([pt(42), pt(78), width - pt(42), height - pt(66)], outline=(*hex_to_rgb(border), 255), width=pt(1))
        draw.rectangle([pt(52), pt(68), pt(204), pt(69)], fill=(*hex_to_rgb(tokens.get("accent", "#C6A34F")), 210))
        watermark = design_asset_path(tokens, "pdf_watermark")
        if watermark:
            mark = Image.open(watermark).convert("RGBA")
            mark = cover_crop(mark, 1).resize((pt(140), pt(140)))
            alpha = mark.getchannel("A").point(lambda value: int(value * 0.06))
            mark.putalpha(alpha)
            canvas.paste(mark, (width - pt(185), height - pt(230)), mark)
        logo = design_asset_path(tokens, "pdf_header_logo")
        if logo:
            mark = Image.open(logo).convert("RGBA")
            mark = crop_alpha_bounds(mark)
            mark.thumbnail((pt(66), pt(32)))
            canvas.paste(mark, (pt(52), pt(28)), mark)
        draw.rectangle([pt(52), height - pt(54), width - pt(52), height - pt(53)], fill=(*hex_to_rgb(border), 255))
    return canvas


def pdf_line_items(markdown: str) -> List[Tuple[str, str]]:
    items: List[Tuple[str, str]] = []
    for raw in markdown.splitlines():
        line = raw.strip()
        if line in {"---", "***", "___"}:
            items.append(("space", ""))
            continue
        if not line or line == BRAND_FOOTER_ATTRIBUTION:
            items.append(("space", ""))
            continue
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            items.append(("heading", re.sub(r"^#{1,6}\s*", "", line)))
            continue
        line = re.sub(r"^\-\s+\[[ xX]\]\s*", "- ", line)
        line = re.sub(r"\*\*(.*?)\*\*", r"\1", line)
        line = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", line)
        line = re.sub(r"\[(.*?)\]\([^)]*\)", r"\1", line)
        prefix = "- " if line.startswith("- ") else ""
        wrapped = textwrap.wrap(line[2:] if prefix else line, width=78) or [""]
        for idx, wrapped_line in enumerate(wrapped):
            text = (prefix if idx == 0 else "  ") + wrapped_line if prefix else wrapped_line
            items.append(("body", text))
    while items and items[-1][0] == "space":
        items.pop()
    return items


def chunk_pdf_items(items: List[Tuple[str, str]], max_lines: int = 36) -> List[List[Tuple[str, str]]]:
    chunks: List[List[Tuple[str, str]]] = []
    current: List[Tuple[str, str]] = []
    line_count = 0
    for style, text in items:
        cost = 2 if style == "heading" else 1
        if current and line_count + cost > max_lines:
            chunks.append(current)
            current = []
            line_count = 0
        current.append((style, text))
        line_count += cost
    chunks.append(current or [("body", "")])
    return chunks


def pdf_image_object(image) -> bytes:
    rgb = image.convert("RGB")
    compressed = zlib.compress(rgb.tobytes())
    return (
        f"<< /Type /XObject /Subtype /Image /Width {rgb.width} /Height {rgb.height} "
        f"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length {len(compressed)} >>\n"
    ).encode("ascii") + b"stream\n" + compressed + b"\nendstream"


def pdf_text_commands(text: str, x: float, y: float, size: float, color: str, font: str) -> List[str]:
    r, g, b = (channel / 255 for channel in hex_to_rgb(color))
    return [
        f"/{font} {size:.1f} Tf",
        f"{r:.3f} {g:.3f} {b:.3f} rg",
        f"1 0 0 1 {x:.1f} {y:.1f} Tm",
        f"({pdf_escape(text)}) Tj",
    ]


def write_basic_pdf(path: Path, title: str, markdown: str, tokens: Dict[str, str], dry_run: bool = False) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    items = pdf_line_items(markdown)
    chunks = chunk_pdf_items(items)

    kids: List[str] = []
    objects: Dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        4: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    }
    next_id = 5
    scheme = tokens.get("scheme", "awm-light")
    header_color = tokens.get("primary", "#18231E") if scheme != "awm-dark" else "#F5F1E8"
    body_color = tokens.get("text", "#1B1B18")
    heading_color = tokens.get("primary", "#18231E")
    footer_color = tokens.get("footer", "#777064")
    attribution = tokens.get("brand_footer_attribution", BRAND_FOOTER_ATTRIBUTION)

    for idx, chunk in enumerate(chunks):
        page_number = idx + 1
        background = build_pdf_background(tokens, page_number, len(chunks))
        image_id = next_id
        next_id += 1
        content_id = next_id
        next_id += 1
        page_id = next_id
        next_id += 1
        kids.append(f"{page_id} 0 R")
        objects[image_id] = pdf_image_object(background)
        commands = [
            f"q 612 0 0 792 0 0 cm /Bg{page_number} Do Q",
            "BT",
        ]
        if scheme == "awm-dark":
            commands.extend(pdf_text_commands(title, 176, 752, 13, header_color, "F2"))
        else:
            commands.extend(pdf_text_commands(title, 132, 742, 13, header_color, "F2"))
        y = 660
        for style, line in chunk:
            if style == "space":
                y -= 8
                continue
            if style == "heading":
                y -= 8
                commands.extend(pdf_text_commands(line, 58, y, 12, heading_color, "F2"))
                y -= 18
                continue
            commands.extend(pdf_text_commands(line, 58, y, 10.5, body_color, "F1"))
            y -= 13
        commands.extend(pdf_text_commands(attribution, 54, 34, 8.5, footer_color, "F1"))
        commands.extend(pdf_text_commands(f"{page_number}/{len(chunks)}", 532, 34, 8.5, footer_color, "F1"))
        commands.append("ET")
        stream = "\n".join(commands).encode("utf-8")
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> "
            f"/XObject << /Bg{page_number} {image_id} 0 R >> >> /Contents {content_id} 0 R >>"
        ).encode("utf-8")
        objects[content_id] = b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
    objects[2] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(chunks)} >>".encode("utf-8")

    pdf = b"%PDF-1.4\n"
    offsets = [0]
    max_id = next_id - 1
    for object_id in range(1, max_id + 1):
        offsets.append(len(pdf))
        pdf += f"{object_id} 0 obj\n".encode("ascii") + objects[object_id] + b"\nendobj\n"
    xref_at = len(pdf)
    pdf += f"xref\n0 {max_id + 1}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        pdf += f"{offset:010d} 00000 n \n".encode("ascii")
    pdf += (
        f"trailer\n<< /Size {max_id + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n"
    ).encode("ascii")
    path.write_bytes(pdf)


def tokenize_context(text: str) -> set:
    """Lowercased word set with stopwords removed. Used for reminder dedup."""
    if not text:
        return set()
    cleaned = re.sub(r"[^a-z0-9\s]+", " ", text.lower())
    return {w for w in cleaned.split() if w and w not in _CONTEXT_STOPWORDS}


def context_similarity(a: str, b: str) -> float:
    """Jaccard similarity between two reminder-context strings (0.0–1.0)."""
    ta, tb = tokenize_context(a), tokenize_context(b)
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def find_duplicate_reminder(
    store: Store,
    contact_id: str,
    new_due: date,
    new_context: str,
    *,
    day_window: int = 7,
    similarity_threshold: float = 0.5,
) -> Optional[Dict[str, str]]:
    """Return an existing pending reminder that looks like a duplicate, or None.

    A duplicate is: same contact, pending status, due_date within ±day_window
    days, and reminder-context Jaccard similarity ≥ similarity_threshold.
    """
    for row in store.read(REMINDERS):
        if row.get("contact_id") != contact_id:
            continue
        if (row.get("status") or "pending") != "pending":
            continue
        existing_due_raw = row.get("due_date") or ""
        existing_due = parse_iso_date(existing_due_raw)
        if not existing_due:
            continue
        if abs((existing_due - new_due).days) > day_window:
            continue
        if context_similarity(new_context, row.get("context") or "") < similarity_threshold:
            continue
        return row
    return None


def find_contact(store: Store, name: str) -> Optional[Dict[str, str]]:
    wanted = name.casefold()
    for row in store.read(CONTACTS):
        if row.get("name", "").casefold() == wanted:
            return row
    return None


def find_contact_by_id(store: Store, contact_id: str) -> Optional[Dict[str, str]]:
    for row in store.read(CONTACTS):
        if row.get("id") == contact_id:
            return row
    return None


def update_contact(store: Store, contact_id: str, updates: Dict[str, str]) -> None:
    rows = store.read(CONTACTS)
    changed = False
    for row in rows:
        if row.get("id") == contact_id:
            row.update({key: value for key, value in updates.items() if value != ""})
            row["updated_at"] = now_iso()
            changed = True
            break
    if not changed:
        raise RelationshipOSError(f"Could not update contact id {contact_id}.")
    store.replace(CONTACTS, rows)


def touch_count(store: Store, contact_id: str) -> int:
    return sum(1 for row in store.read(TOUCHPOINTS) if row.get("contact_id") == contact_id)


def find_reminder(store: Store, reminder_id: str) -> Optional[Dict[str, str]]:
    for row in store.read(REMINDERS):
        if row.get("id") == reminder_id:
            return row
    return None


def mark_reminder_status(
    store: Store,
    reminder_id: str,
    new_status: str,
    *,
    snoozed_until: Optional[date] = None,
) -> Dict[str, str]:
    """Update one reminder's status. Returns the updated reminder dict.

    Used both by the standalone complete/snooze/cancel-reminder commands and
    by log-touchpoint's `completes_reminder_ids` path.
    """
    if new_status not in VALID_REMINDER_STATUSES:
        raise RelationshipOSError(
            f"reminder status must be one of {sorted(VALID_REMINDER_STATUSES)}; got {new_status!r}."
        )
    if new_status == "snoozed" and not snoozed_until:
        raise RelationshipOSError("snoozed_until is required when status is 'snoozed'.")

    rows = store.read(REMINDERS)
    updated_row: Optional[Dict[str, str]] = None
    for row in rows:
        if row.get("id") != reminder_id:
            continue
        row["status"] = new_status
        if new_status == "done" or new_status == "cancelled":
            row["completed_at"] = now_iso()
            row["snoozed_until"] = ""
        elif new_status == "snoozed":
            row["snoozed_until"] = snoozed_until.isoformat() if snoozed_until else ""
            row["completed_at"] = ""
        else:  # pending
            row["snoozed_until"] = ""
        updated_row = row
        break
    if updated_row is None:
        raise RelationshipOSError(f"No reminder with id {reminder_id!r}.")
    store.replace(REMINDERS, rows)
    return updated_row


def log_event(
    store: Store,
    kind: str,
    *,
    contact_id: str = "",
    subject_id: str = "",
    payload: Optional[Dict[str, object]] = None,
    source: str = "",
) -> str:
    """Append one row to the Events audit table.

    `kind` should be a value from VALID_EVENT_KINDS. `subject_id` is the
    touchpoint / reminder / contact ID this event describes. `payload` is
    JSON-serialised for forward compatibility (so we can add fields later
    without schema changes). Returns the new event ID.
    """
    if kind not in VALID_EVENT_KINDS:
        raise RelationshipOSError(
            f"event kind must be one of {sorted(VALID_EVENT_KINDS)}; got {kind!r}."
        )
    event_id = make_id("e")
    row = {
        "id": event_id,
        "timestamp": now_iso(),
        "kind": kind,
        "contact_id": contact_id,
        "subject_id": subject_id,
        "payload": json.dumps(payload or {}, sort_keys=True),
        "source": source,
    }
    store.append(EVENTS, row)
    return event_id


def read_events(
    store: Store,
    *,
    contact_id: str = "",
    kind: str = "",
    since: Optional[date] = None,
) -> List[Dict[str, str]]:
    """Filtered read over the Events table. Newest first."""
    rows = list(store.read(EVENTS))
    rows.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    out: List[Dict[str, str]] = []
    for row in rows:
        if contact_id and row.get("contact_id") != contact_id:
            continue
        if kind and row.get("kind") != kind:
            continue
        if since:
            ts = row.get("timestamp", "")
            try:
                event_date = date.fromisoformat(ts[:10])
            except (ValueError, TypeError):
                continue
            if event_date < since:
                continue
        out.append(row)
    return out


def cmd_init(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    if args.reset:
        if isinstance(store, LocalCsvStore):
            shutil.rmtree(store.base_dir, ignore_errors=True)
        elif isinstance(store, SQLiteStore):
            store.reset()
    store.ensure()
    synced_views = sync_consultant_views(store)
    return {
        "ok": True,
        "store": store.name,
        "location": store.location(),
        "tabs": list(HEADERS),
        "synced_views": synced_views,
    }


def cmd_status(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    payload: Dict[str, object] = {
        "ok": True,
        "store": store.name,
        "location": store.location(),
        "consultant_views": consultant_view_modes() if isinstance(store, SQLiteStore) else [],
        "counts": {tab: len(store.read(tab)) for tab in HEADERS},
    }
    if isinstance(store, GoogleSheetsStore):
        payload["deprecated_store"] = (
            "RELATIONSHIP_OS_STORE=google is deprecated. Use sqlite with "
            "CONSULTANT_VIEW=google for new setups."
        )
    return payload


def log_touchpoint(store: Store, data: TouchpointInput) -> Dict[str, object]:
    """Write a touchpoint (and optional reminder) for a structured payload.

    This is the only durable write path for logged interactions. It does not
    parse natural language; callers are expected to hand in validated fields.
    """
    store.ensure()
    base = data.touch_date

    # Only real consultant-client interactions update last_touch_date. Imports
    # and other system-generated touchpoints must not pollute "last touch" or
    # the cooling/at-risk attention calculator.
    is_real_interaction = data.touchpoint_type in REAL_INTERACTION_TOUCHPOINT_TYPES

    existing = find_contact(store, data.contact_name)
    created_contact = False
    if existing:
        contact_id = existing["id"]
        updates: Dict[str, str] = {}
        if is_real_interaction:
            updates["last_touch_date"] = data.touch_date.isoformat()
        if data.contact_type:
            updates["type"] = data.contact_type
        if data.relationship_stage:
            updates["relationship_stage"] = data.relationship_stage
        if updates:
            update_contact(store, contact_id, updates)
        contact = find_contact(store, data.contact_name) or existing
    else:
        created_contact = True
        contact_id = make_id("c", base)
        contact = {
            "id": contact_id,
            "name": data.contact_name,
            "type": data.contact_type or "prospect",
            "relationship_stage": data.relationship_stage or "warming",
            # New contact created from an import has no real interaction yet;
            # leave last_touch_date blank so the contact doesn't look "fresh".
            "last_touch_date": data.touch_date.isoformat() if is_real_interaction else "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        store.append(CONTACTS, contact)
        log_event(
            store,
            "contact_created",
            contact_id=contact_id,
            subject_id=contact_id,
            payload={"name": data.contact_name, "type": contact["type"]},
            source="log-touchpoint",
        )

    meeting_number = touch_count(store, contact_id) + 1
    touchpoint_id = make_id("t", base)
    touchpoint = {
        "id": touchpoint_id,
        "contact_id": contact_id,
        "contact_name": data.contact_name,
        "date": data.touch_date.isoformat(),
        "type": data.touchpoint_type,
        "sentiment": data.sentiment,
        "summary": data.summary,
        "topics": ", ".join(data.topics),
        "action_items": data.action_items,
        "meeting_number": str(meeting_number),
        "raw_input": data.raw_input,
        "created_at": now_iso(),
    }
    store.append(TOUCHPOINTS, touchpoint)
    log_event(
        store,
        "touchpoint_logged",
        contact_id=contact_id,
        subject_id=touchpoint_id,
        payload={
            "touchpoint_type": data.touchpoint_type,
            "sentiment": data.sentiment,
            "topics": data.topics,
        },
        source="log-touchpoint",
    )

    result: Dict[str, object] = {
        "ok": True,
        "created_contact": created_contact,
        "contact": {
            "id": contact_id,
            "name": data.contact_name,
            "stage": contact.get("relationship_stage", ""),
        },
        "touchpoint": {
            "id": touchpoint_id,
            "type": data.touchpoint_type,
            "topics": data.topics,
        },
    }

    if data.reminder_due:
        # Dedup guard: if the consultant (or Hermes) already has a pending
        # reminder for this contact with a similar context and a due date
        # within ±7 days, skip silently and log the skip rather than create
        # a near-duplicate. The consultant can force a duplicate by setting
        # `allow_duplicate_reminder: true` in the payload.
        duplicate = None
        if not data.allow_duplicate_reminder:
            duplicate = find_duplicate_reminder(
                store, contact_id, data.reminder_due, data.reminder_context
            )
        if duplicate:
            log_event(
                store,
                "reminder_duplicate_skipped",
                contact_id=contact_id,
                subject_id=duplicate.get("id", ""),
                payload={
                    "existing_reminder_id": duplicate.get("id"),
                    "existing_due_date": duplicate.get("due_date"),
                    "existing_context": duplicate.get("context"),
                    "would_have_due_date": data.reminder_due.isoformat(),
                    "would_have_context": data.reminder_context,
                    "from_touchpoint_id": touchpoint_id,
                },
                source="log-touchpoint",
            )
            result["reminder_skipped"] = {
                "reason": "duplicate",
                "existing_reminder_id": duplicate.get("id"),
                "existing_due_date": duplicate.get("due_date"),
                "existing_context": duplicate.get("context"),
            }
        else:
            reminder_id = make_id("r", base)
            reminder = {
                "id": reminder_id,
                "contact_id": contact_id,
                "contact_name": data.contact_name,
                "due_date": data.reminder_due.isoformat(),
                "type": data.reminder_type,
                "priority": data.reminder_priority or "medium",
                "context": data.reminder_context,
                "status": "pending",
                "source_touchpoint_id": touchpoint_id,
                "created_at": now_iso(),
            }
            store.append(REMINDERS, reminder)
            result["reminder"] = {
                "id": reminder_id,
                "due_date": data.reminder_due.isoformat(),
                "priority": reminder["priority"],
            }

    # Close any reminders the consultant said this touchpoint addresses.
    # We silently skip unknown IDs because Hermes may occasionally hallucinate
    # a touchpoint linkage — we'd rather log the touchpoint than reject it.
    completed_reminders: List[str] = []
    for rid in data.completes_reminder_ids:
        try:
            mark_reminder_status(store, rid, "done")
        except RelationshipOSError:
            continue
        log_event(
            store,
            "reminder_completed",
            contact_id=contact_id,
            subject_id=rid,
            payload={"closed_by_touchpoint_id": touchpoint_id},
            source="log-touchpoint",
        )
        completed_reminders.append(rid)
    if completed_reminders:
        result["completed_reminders"] = completed_reminders

    result["synced_views"] = sync_consultant_views(store)
    message = f"Logged {data.touchpoint_type} with {data.contact_name}."
    if result.get("reminder"):
        message += f" Reminder set for {data.reminder_due.isoformat()}."
    elif result.get("reminder_skipped"):
        skipped = result["reminder_skipped"]
        message += (
            f" No new reminder created — already pending for "
            f"{skipped.get('existing_due_date')}: "
            f"{skipped.get('existing_context') or 'no context'}."
        )
    if completed_reminders:
        message += f" Closed {len(completed_reminders)} reminder(s)."
    result["message"] = message
    return result


def cmd_log_touchpoint(args: argparse.Namespace) -> Dict[str, object]:
    """CLI wrapper. Accepts either --json/--json-file or individual flags."""
    store = get_store()
    store.ensure()
    base = today_in_settings(store)

    if args.json_file:
        payload = json.loads(Path(args.json_file).expanduser().read_text(encoding="utf-8"))
    elif args.json is not None:
        json_text = sys.stdin.read() if args.json == "-" else args.json
        payload = json.loads(json_text)
    else:
        flag_payload = {
            "contact_name": args.contact_name,
            "touch_date": args.touch_date,
            "touchpoint_type": args.touchpoint_type,
            "sentiment": args.sentiment,
            "summary": args.summary,
            "raw_input": args.raw_input,
            "topics": args.topics,
            "action_items": args.action_items,
            "contact_type": args.contact_type,
            "relationship_stage": args.relationship_stage,
            "reminder_due": args.reminder_due,
            "reminder_priority": args.reminder_priority,
            "reminder_context": args.reminder_context,
            "reminder_type": args.reminder_type,
            "completes_reminder_ids": (
                [s.strip() for s in args.completes_reminder_ids.split(",") if s.strip()]
                if args.completes_reminder_ids else None
            ),
            "allow_duplicate_reminder": (
                True if getattr(args, "allow_duplicate_reminder", False) else None
            ),
        }
        payload = {k: v for k, v in flag_payload.items() if v is not None}

    data = touchpoint_input_from_dict(payload, base)
    return log_touchpoint(store, data)


def resolve_reminder(
    store: Store,
    *,
    reminder_id: str = "",
    contact_name: str = "",
    context_match: str = "",
    only_pending: bool = True,
) -> Dict[str, str]:
    """Find one reminder by ID, or by (contact_name + optional context match).

    If multiple candidates match by (contact_name + context_match), raises a
    disambiguation error listing the matches so Hermes can ask the consultant
    which one. Used by both the standalone reminder commands and the
    log-touchpoint auto-complete path.
    """
    if reminder_id:
        row = find_reminder(store, reminder_id)
        if not row:
            raise RelationshipOSError(f"No reminder with id {reminder_id!r}.")
        return row

    if not contact_name:
        raise RelationshipOSError("Either reminder_id or contact_name is required.")

    candidates: List[Dict[str, str]] = []
    needle = contact_name.casefold()
    context_needle = context_match.casefold().strip()
    for row in store.read(REMINDERS):
        if row.get("contact_name", "").casefold() != needle:
            continue
        if only_pending and (row.get("status") or "pending") != "pending":
            continue
        if context_needle:
            haystack = (row.get("context") or "").casefold()
            if context_needle not in haystack:
                continue
        candidates.append(row)

    if not candidates:
        raise RelationshipOSError(
            f"No pending reminders found for {contact_name!r}"
            + (f" matching {context_match!r}." if context_match else ".")
        )
    if len(candidates) > 1:
        listing = "; ".join(
            f"{row.get('id')} ({row.get('due_date') or 'unscheduled'}: {row.get('context') or ''})"
            for row in candidates
        )
        raise RelationshipOSError(
            f"Multiple reminders match for {contact_name!r}: {listing}. "
            "Pass --reminder-id to pick one, or use a narrower --context-match."
        )
    return candidates[0]


def _load_reminder_payload(args: argparse.Namespace) -> Optional[Dict[str, object]]:
    if args.json_file:
        return json.loads(Path(args.json_file).expanduser().read_text(encoding="utf-8"))
    if args.json is not None:
        json_text = sys.stdin.read() if args.json == "-" else args.json
        return json.loads(json_text)
    return None


def _resolve_reminder_from_args(store: Store, args: argparse.Namespace) -> Dict[str, str]:
    payload = _load_reminder_payload(args)
    if payload is not None:
        if not isinstance(payload, dict):
            raise RelationshipOSError("reminder payload must be a JSON object.")
        return resolve_reminder(
            store,
            reminder_id=str(payload.get("reminder_id") or "").strip(),
            contact_name=str(payload.get("contact_name") or "").strip(),
            context_match=str(payload.get("context_match") or "").strip(),
        )
    return resolve_reminder(
        store,
        reminder_id=(args.reminder_id or "").strip(),
        contact_name=(args.contact_name or "").strip(),
        context_match=(args.context_match or "").strip(),
    )


def cmd_complete_reminder(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    reminder = _resolve_reminder_from_args(store, args)
    updated = mark_reminder_status(store, reminder["id"], "done")
    log_event(
        store,
        "reminder_completed",
        contact_id=reminder.get("contact_id", ""),
        subject_id=reminder["id"],
        payload={"closed_via": "complete-reminder"},
        source="complete-reminder",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "complete-reminder",
        "reminder": {
            "id": updated["id"],
            "contact_name": updated.get("contact_name"),
            "context": updated.get("context"),
            "status": "done",
        },
        "synced_views": synced,
        "message": (
            f"Completed reminder {updated['id']} for {updated.get('contact_name')}"
            f" — {updated.get('context') or 'no context'}."
        ),
    }


def cmd_snooze_reminder(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    payload = _load_reminder_payload(args)
    if payload is not None:
        new_due_raw = payload.get("snoozed_until") or payload.get("new_due_date")
    else:
        new_due_raw = args.new_due_date
    if not new_due_raw:
        raise RelationshipOSError(
            "snooze-reminder requires --new-due-date (or 'snoozed_until' in JSON)."
        )
    new_due = parse_iso_date_strict(new_due_raw, "snoozed_until")
    reminder = _resolve_reminder_from_args(store, args)
    updated = mark_reminder_status(store, reminder["id"], "snoozed", snoozed_until=new_due)
    log_event(
        store,
        "reminder_snoozed",
        contact_id=reminder.get("contact_id", ""),
        subject_id=reminder["id"],
        payload={"snoozed_until": new_due.isoformat()},
        source="snooze-reminder",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "snooze-reminder",
        "reminder": {
            "id": updated["id"],
            "contact_name": updated.get("contact_name"),
            "snoozed_until": new_due.isoformat(),
            "status": "snoozed",
        },
        "synced_views": synced,
        "message": (
            f"Snoozed reminder {updated['id']} for {updated.get('contact_name')}"
            f" until {new_due.isoformat()}."
        ),
    }


def cmd_cancel_reminder(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    reminder = _resolve_reminder_from_args(store, args)
    updated = mark_reminder_status(store, reminder["id"], "cancelled")
    log_event(
        store,
        "reminder_cancelled",
        contact_id=reminder.get("contact_id", ""),
        subject_id=reminder["id"],
        payload={"context": reminder.get("context") or ""},
        source="cancel-reminder",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "cancel-reminder",
        "reminder": {
            "id": updated["id"],
            "contact_name": updated.get("contact_name"),
            "status": "cancelled",
        },
        "synced_views": synced,
        "message": (
            f"Cancelled reminder {updated['id']} for {updated.get('contact_name')}."
        ),
    }


def cmd_events(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    since: Optional[date] = None
    if args.since:
        since = parse_iso_date_strict(args.since, "--since")
    rows = read_events(
        store,
        contact_id=(args.contact_id or "").strip(),
        kind=(args.kind or "").strip(),
        since=since,
    )
    if args.limit:
        rows = rows[: args.limit]
    return {
        "ok": True,
        "command": "events",
        "count": len(rows),
        "events": rows,
    }


def parse_iso_date(value: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _brief_reminders_due(store: Store, today: date) -> List[Dict[str, str]]:
    """Pending reminders with due_date <= today, sorted high → low priority."""
    out = []
    for row in store.read(REMINDERS):
        if row.get("status") != "pending":
            continue
        due = parse_iso_date(row.get("due_date", ""))
        if not due or due > today:
            continue
        out.append(row)
    priority_order = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda r: (priority_order.get(r.get("priority", "medium"), 1), r.get("due_date", "")))
    return out


def _brief_birthdays_today(store: Store, today: date) -> List[Dict[str, object]]:
    """Contacts whose birthday matches today's MM-DD."""
    target = (today.month, today.day)
    out: List[Dict[str, object]] = []
    for row in store.read(CONTACTS):
        if row.get("archived_at"):
            continue
        raw = (row.get("birthday") or "").strip()
        if not raw:
            continue
        parsed = parse_iso_date(raw)
        if not parsed:
            # Try DD/MM/YYYY
            try:
                parts = raw.split("/")
                if len(parts) == 3:
                    day = int(parts[0])
                    month = int(parts[1])
                    year_raw = int(parts[2])
                    year = year_raw if year_raw > 100 else (2000 + year_raw if year_raw < 30 else 1900 + year_raw)
                    parsed = date(year, month, day)
            except (ValueError, IndexError):
                pass
        if not parsed:
            continue
        if (parsed.month, parsed.day) != target:
            continue
        age_turning = today.year - parsed.year if parsed.year > 1900 else None
        out.append({
            "name": row.get("name"),
            "contact_id": row.get("id"),
            "age_turning": age_turning,
        })
    return out


def _brief_ripe_signals(store: Store, today: date, limit: int = 5) -> List[Dict[str, object]]:
    """Port of lib/ripe.ts: ≥2 positive touchpoints in last 30d, last touch ≤21d, not client, not archived."""
    WINDOW = 30
    RECENCY = 21
    MIN_POSITIVE = 2

    contacts_by_id: Dict[str, Dict[str, str]] = {}
    for c in store.read(CONTACTS):
        if c.get("archived_at"):
            continue
        if c.get("type") == "client":
            continue
        contacts_by_id[c.get("id", "")] = c

    pos_counts: Dict[str, int] = {}
    last_seen: Dict[str, int] = {}
    for t in store.read(TOUCHPOINTS):
        cid = t.get("contact_id", "")
        if cid not in contacts_by_id:
            continue
        d = parse_iso_date(t.get("date", ""))
        if not d:
            continue
        days_ago = (today - d).days
        if days_ago < 0:
            continue
        if days_ago < last_seen.get(cid, 999999):
            last_seen[cid] = days_ago
        if t.get("sentiment") == "positive" and days_ago <= WINDOW:
            pos_counts[cid] = pos_counts.get(cid, 0) + 1

    out: List[Dict[str, object]] = []
    for cid, c in contacts_by_id.items():
        pc = pos_counts.get(cid, 0)
        ls = last_seen.get(cid)
        if pc < MIN_POSITIVE or ls is None or ls > RECENCY:
            continue
        recency_bonus = 5 if ls <= 7 else 0
        score = pc * 2 + recency_bonus
        out.append({
            "name": c.get("name"),
            "contact_id": cid,
            "positive_count": pc,
            "days_since_last": ls,
            "score": score,
        })
    out.sort(key=lambda r: (-r["score"], r["days_since_last"]))  # type: ignore[arg-type,operator]
    return out[:limit]


def _brief_debt_top(store: Store, today: date, limit: int = 5) -> List[Dict[str, object]]:
    """Port of lib/debt.ts categories (at_risk, cooling, unfollowed_action, stale_prospect)."""
    COOLING = 30
    AT_RISK = 60
    STALE_PROSPECT = 14
    UNFOLLOWED_GRACE = 7
    PRIORITY = {"at_risk": 0, "unfollowed_action": 1, "cooling": 2, "stale_prospect": 3}

    contacts = [c for c in store.read(CONTACTS) if not c.get("archived_at")]
    contacts_by_id = {c.get("id", ""): c for c in contacts}

    flags: List[Dict[str, object]] = []
    for c in contacts:
        ttype = c.get("type", "")
        stage = c.get("relationship_stage", "")
        last = parse_iso_date(c.get("last_touch_date", ""))
        days = (today - last).days if last else None
        no_touch = days is None
        if ttype == "client" and (no_touch or (days or 0) >= AT_RISK):
            flags.append({"category": "at_risk", "name": c.get("name"), "contact_id": c.get("id"), "days_since": days})
            continue
        if stage in ("warm", "hot") and (no_touch or (days or 0) >= COOLING):
            flags.append({"category": "cooling", "name": c.get("name"), "contact_id": c.get("id"), "days_since": days})
            continue
        if ttype == "prospect" and (no_touch or (days or 0) >= STALE_PROSPECT):
            flags.append({"category": "stale_prospect", "name": c.get("name"), "contact_id": c.get("id"), "days_since": days})

    # Unfollowed actions
    reminder_tp_ids = {r.get("source_touchpoint_id") for r in store.read(REMINDERS) if r.get("source_touchpoint_id")}
    for t in store.read(TOUCHPOINTS):
        if not (t.get("action_items") or "").strip():
            continue
        if t.get("id") in reminder_tp_ids:
            continue
        tp_date = parse_iso_date(t.get("date", ""))
        if not tp_date:
            continue
        tp_days = (today - tp_date).days
        if tp_days < UNFOLLOWED_GRACE:
            continue
        contact = contacts_by_id.get(t.get("contact_id", ""))
        if not contact:
            continue
        flags.append({
            "category": "unfollowed_action",
            "name": contact.get("name"),
            "contact_id": contact.get("id"),
            "days_since": tp_days,
            "action_items": t.get("action_items"),
        })

    flags.sort(key=lambda f: (PRIORITY[str(f["category"])], -(f["days_since"] or 9999)))  # type: ignore[arg-type]
    return flags[:limit]


VALID_CLARIFICATION_RESOLUTIONS = {"log_anyway", "log_corrected", "discard"}
VALID_CLARIFICATION_STATUSES = {"pending", "resolved", "abandoned"}


def cmd_queue_clarification(args: argparse.Namespace) -> Dict[str, object]:
    """Park an item Hermes wasn't confident enough to log.

    Used during bulk imports (consultant forwards 20 Excel rows; Hermes
    parses each; the unclear ones land here for the consultant to triage
    later via the AWMOS /clarifications route instead of one-by-one
    inline questions in chat).
    """
    store = get_store()
    store.ensure()

    payload: Optional[Dict[str, object]] = None
    if args.json_file:
        payload = json.loads(Path(args.json_file).expanduser().read_text(encoding="utf-8"))
    elif args.json is not None:
        json_text = sys.stdin.read() if args.json == "-" else args.json
        payload = json.loads(json_text)
    if not isinstance(payload, dict):
        raise RelationshipOSError(
            "queue-clarification requires a JSON payload (--json or --json-file)."
        )

    source_input = str(payload.get("source_input") or "").strip()
    if not source_input:
        raise RelationshipOSError("queue-clarification payload requires `source_input`.")
    source_context = (str(payload.get("source_context") or "bulk_import")).strip() or "bulk_import"
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise RelationshipOSError(
            "queue-clarification payload requires `reason` (why Hermes parked this)."
        )
    hermes_guess = payload.get("hermes_guess")
    if hermes_guess is not None and not isinstance(hermes_guess, (dict, list)):
        raise RelationshipOSError("`hermes_guess` must be a JSON object/array if provided.")

    today = today_in_settings(store)
    cid = make_id("q", today)
    row = {
        "id": cid,
        "source_input": source_input,
        "source_context": source_context,
        "hermes_guess": json.dumps(hermes_guess) if hermes_guess is not None else "",
        "reason": reason,
        "status": "pending",
        "resolution": "",
        "resolution_payload": "",
        "created_at": now_iso(),
        "resolved_at": "",
    }
    store.append(CLARIFICATIONS, row)
    log_event(
        store,
        "clarification_queued",
        contact_id="",
        subject_id=cid,
        payload={
            "source_context": source_context,
            "reason": reason,
            "source_input_excerpt": source_input[:120],
        },
        source=str(payload.get("source") or "hermes:queue-clarification"),
    )
    return {
        "ok": True,
        "command": "queue-clarification",
        "id": cid,
        "status": "pending",
        "message": f"Queued clarification {cid} ({source_context}).",
    }


def cmd_list_clarifications(args: argparse.Namespace) -> Dict[str, object]:
    """List clarifications, optionally filtered by status. Default: pending."""
    store = get_store()
    store.ensure()
    target_status = (args.status or "pending").strip()
    if target_status not in (VALID_CLARIFICATION_STATUSES | {"any"}):
        raise RelationshipOSError(
            f"--status must be one of {sorted(VALID_CLARIFICATION_STATUSES)} or 'any'; got {target_status!r}."
        )
    rows = store.read(CLARIFICATIONS)
    if target_status != "any":
        rows = [r for r in rows if r.get("status") == target_status]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    limit = max(1, int(args.limit or 100))
    rows = rows[:limit]
    out = []
    for r in rows:
        guess: object = r.get("hermes_guess") or ""
        if isinstance(guess, str) and guess:
            try:
                guess = json.loads(guess)
            except (ValueError, json.JSONDecodeError):
                pass
        out.append({
            "id": r.get("id"),
            "source_input": r.get("source_input"),
            "source_context": r.get("source_context"),
            "hermes_guess": guess,
            "reason": r.get("reason"),
            "status": r.get("status"),
            "resolution": r.get("resolution"),
            "created_at": r.get("created_at"),
            "resolved_at": r.get("resolved_at"),
        })
    return {
        "ok": True,
        "command": "list-clarifications",
        "status_filter": target_status,
        "count": len(out),
        "clarifications": out,
    }


def cmd_resolve_clarification(args: argparse.Namespace) -> Dict[str, object]:
    """Resolve a queued clarification by logging (with or without corrections) or discarding.

    Resolutions:
      log_anyway    — take hermes_guess as-is, call log_touchpoint with it
      log_corrected — take --json payload (or --json-file), call log_touchpoint
      discard       — mark as abandoned, no touchpoint logged
    """
    store = get_store()
    store.ensure()

    if not args.clarification_id:
        raise RelationshipOSError("resolve-clarification requires --id <clarification_id>.")
    resolution = (args.resolution or "").strip()
    if resolution not in VALID_CLARIFICATION_RESOLUTIONS:
        raise RelationshipOSError(
            f"--resolution must be one of {sorted(VALID_CLARIFICATION_RESOLUTIONS)}; got {resolution!r}."
        )

    rows = store.read(CLARIFICATIONS)
    target = next((r for r in rows if r.get("id") == args.clarification_id), None)
    if not target:
        raise RelationshipOSError(f"No clarification with id {args.clarification_id!r}.")
    if target.get("status") != "pending":
        raise RelationshipOSError(
            f"Clarification {args.clarification_id!r} is already {target.get('status')!r}; nothing to resolve."
        )

    logged_touchpoint_id: Optional[str] = None
    payload_for_log: Optional[Dict[str, object]] = None

    if resolution == "log_anyway":
        guess_raw = target.get("hermes_guess") or ""
        if not guess_raw:
            raise RelationshipOSError(
                "Cannot log_anyway: this clarification has no hermes_guess. Use log_corrected with a JSON payload instead."
            )
        try:
            payload_for_log = json.loads(guess_raw)
        except json.JSONDecodeError as exc:
            raise RelationshipOSError(f"hermes_guess is not valid JSON: {exc}") from exc

    elif resolution == "log_corrected":
        if args.json_file:
            payload_for_log = json.loads(Path(args.json_file).expanduser().read_text(encoding="utf-8"))
        elif args.json is not None:
            json_text = sys.stdin.read() if args.json == "-" else args.json
            payload_for_log = json.loads(json_text)
        else:
            raise RelationshipOSError(
                "log_corrected requires --json or --json-file with the corrected touchpoint payload."
            )

    if payload_for_log is not None:
        if not isinstance(payload_for_log, dict):
            raise RelationshipOSError("touchpoint payload must be a JSON object.")
        touchpoint_input = touchpoint_input_from_dict(
            payload_for_log, today_in_settings(store)
        )
        result = log_touchpoint(store, touchpoint_input)
        tp = result.get("touchpoint") or {}
        logged_touchpoint_id = tp.get("id") if isinstance(tp, dict) else None

    # Update the clarification row in place via Store.replace (no UPDATE in the
    # generic Store interface).
    resolution_payload_str = (
        json.dumps(payload_for_log) if payload_for_log is not None else ""
    )
    new_rows = []
    for r in rows:
        if r.get("id") == args.clarification_id:
            r = dict(r)
            r["status"] = "resolved" if resolution != "discard" else "abandoned"
            r["resolution"] = resolution
            r["resolution_payload"] = resolution_payload_str
            r["resolved_at"] = now_iso()
        new_rows.append(r)
    store.replace(CLARIFICATIONS, new_rows)

    log_event(
        store,
        "clarification_resolved",
        contact_id="",
        subject_id=args.clarification_id,
        payload={
            "resolution": resolution,
            "logged_touchpoint_id": logged_touchpoint_id or "",
        },
        source=str(getattr(args, "event_source", None) or "app:resolve-clarification"),
    )

    return {
        "ok": True,
        "command": "resolve-clarification",
        "id": args.clarification_id,
        "resolution": resolution,
        "logged_touchpoint_id": logged_touchpoint_id,
        "message": f"Clarification {args.clarification_id} resolved as {resolution}.",
    }


def cmd_today_brief(args: argparse.Namespace) -> Dict[str, object]:
    """Morning-brief composite: reminders due + birthdays today + ripe + debt.

    Designed to be called once at 9am SGT by the morning brief cron job, with
    output sent as a Telegram message to the consultant. Also useful as a
    standalone CLI command — `python3 scripts/relationship_os.py today-brief`
    gives an at-a-glance summary.
    """
    store = get_store()
    store.ensure()
    today = today_in_settings(store)
    settings_map = {row.get("key"): row.get("value") for row in store.read(SETTINGS)}
    consultant_name = (settings_map.get("name") or "Consultant").strip() or "Consultant"

    reminders = _brief_reminders_due(store, today)
    birthdays = _brief_birthdays_today(store, today)
    ripe = _brief_ripe_signals(store, today, limit=5)
    debt = _brief_debt_top(store, today, limit=5)
    debt_total = len([f for f in _brief_debt_top(store, today, limit=10_000)])

    # Human-readable brief for direct Telegram delivery.
    lines = [
        f"Good morning, {consultant_name}.",
        f"{today.strftime('%A, %d %B %Y')}",
        "",
    ]
    lines.append(f"Reminders due today ({len(reminders)})")
    if reminders:
        for r in reminders[:10]:
            prio = (r.get("priority") or "med").upper()
            lines.append(f"  {prio:6s} {r.get('contact_name')} — {r.get('context') or '(no context)'}")
        if len(reminders) > 10:
            lines.append(f"  …and {len(reminders) - 10} more")
    else:
        lines.append("  None.")
    lines.append("")

    lines.append(f"Birthdays today ({len(birthdays)})")
    if birthdays:
        for b in birthdays:
            if b.get("age_turning") is not None:
                lines.append(f"  {b['name']} (turning {b['age_turning']})")
            else:
                lines.append(f"  {b['name']}")
    else:
        lines.append("  None.")
    lines.append("")

    lines.append(f"Ripe to reach out ({len(ripe)})")
    if ripe:
        for r in ripe:
            since = r["days_since_last"]
            since_label = "today" if since == 0 else f"{since}d since last"
            lines.append(f"  {r['name']} — {r['positive_count']} positive in last 30d, {since_label}")
    else:
        lines.append("  No standout opportunities right now.")
    lines.append("")

    lines.append(f"Relationship debt ({debt_total} total, top {len(debt)})")
    if debt:
        for f in debt:
            cat = str(f["category"]).replace("_", " ")
            days = f.get("days_since")
            tail = f"{days}d" if days is not None else "no touch"
            note = ""
            if f.get("action_items"):
                action = str(f["action_items"])[:60]
                if len(str(f["action_items"])) > 60:
                    action += "…"
                note = f' — "{action}"'
            lines.append(f"  {cat:18s}· {f['name']} · {tail}{note}")
    else:
        lines.append("  Inbox zero.")

    brief_text = "\n".join(lines)

    return {
        "ok": True,
        "command": "today-brief",
        "date": today.isoformat(),
        "consultant_name": consultant_name,
        "reminders_due": [
            {
                "id": r.get("id"),
                "contact_name": r.get("contact_name"),
                "contact_id": r.get("contact_id"),
                "context": r.get("context"),
                "priority": r.get("priority"),
                "due_date": r.get("due_date"),
                "type": r.get("type"),
            }
            for r in reminders
        ],
        "birthdays_today": birthdays,
        "ripe_signals": ripe,
        "debt_top": debt,
        "stats": {
            "reminders_due_count": len(reminders),
            "birthdays_today_count": len(birthdays),
            "ripe_count": len(ripe),
            "debt_total_count": debt_total,
        },
        "brief_text": brief_text,
    }


def cmd_today(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    today = today_in_settings(store)
    reminders = []
    for row in store.read(REMINDERS):
        due = parse_iso_date(row.get("due_date", ""))
        if row.get("status") == "pending" and due and due <= today:
            reminders.append(row)
    priority_order = {"high": 0, "medium": 1, "low": 2}
    reminders.sort(key=lambda r: (priority_order.get(r.get("priority", "medium"), 1), r.get("due_date", "")))

    stale_contacts = []
    for row in store.read(CONTACTS):
        last = parse_iso_date(row.get("last_touch_date", ""))
        if not last:
            continue
        days = (today - last).days
        stage = row.get("relationship_stage", "")
        if stage in {"warm", "hot"} and days >= 30:
            stale_contacts.append(f"{row.get('name')} ({days} days)")
        elif stage == "client" and days >= 60:
            stale_contacts.append(f"{row.get('name')} ({days} days)")

    summary = {
        "date": today.isoformat(),
        "due_count": len(reminders),
        "due": [
            {
                "contact_name": r.get("contact_name"),
                "due_date": r.get("due_date"),
                "priority": r.get("priority"),
                "context": r.get("context"),
            }
            for r in reminders[:10]
        ],
        "needs_attention": stale_contacts[:10],
    }
    return {"ok": True, **summary}


def cmd_prep(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    contact = find_contact(store, args.name)
    if not contact:
        raise RelationshipOSError(f"No contact found for {args.name}.")
    contact_id = contact["id"]
    touches = [row for row in store.read(TOUCHPOINTS) if row.get("contact_id") == contact_id]
    touches.sort(key=lambda row: row.get("date", ""), reverse=True)
    reminders = [
        row
        for row in store.read(REMINDERS)
        if row.get("contact_id") == contact_id and row.get("status") == "pending"
    ]
    questions = [
        "What changed since the last conversation?",
        "What is the next practical commitment?",
        "Is there a family, policy, or timing detail worth updating?",
    ]
    topics = ", ".join(dict.fromkeys(t.get("topics", "") for t in touches if t.get("topics"))) or "none logged"
    active_policies = policies_for_contact(store, contact_id, include_archived=False)
    return {
        "ok": True,
        "contact": {
            "name": contact.get("name"),
            "type": contact.get("type"),
            "stage": contact.get("relationship_stage"),
            "last_touch_date": contact.get("last_touch_date"),
            "topics": topics,
            "occupation": contact.get("occupation", ""),
            "company": contact.get("company", ""),
            "birthday": contact.get("birthday", ""),
            "next_review_date": contact.get("next_review_date", ""),
            "family": contact.get("family", ""),
            "interests": contact.get("interests", ""),
            "financial_concerns": contact.get("financial_concerns", ""),
            "referral_source": contact.get("referral_source", ""),
            "notes": contact.get("notes", ""),
        },
        "recent_touchpoints": touches[:5],
        "pending_reminders": reminders[:5],
        "policies": active_policies,
        "suggested_questions": questions,
    }


def indexed_contacts(store: Store) -> Dict[str, Dict[str, str]]:
    return {row.get("id", ""): row for row in store.read(CONTACTS) if row.get("id")}


def rows_for_contact(rows: Sequence[Dict[str, str]], contact_id: str) -> List[Dict[str, str]]:
    return [row for row in rows if row.get("contact_id") == contact_id]


def render_contact_note(
    contact: Dict[str, str],
    touchpoints: Sequence[Dict[str, str]],
    reminders: Sequence[Dict[str, str]],
    vault_dir: Path,
    touchpoint_paths: Dict[str, Path],
) -> Tuple[Dict[str, object], str]:
    fields = {
        "id": contact.get("id", ""),
        "type": contact.get("type", ""),
        "stage": contact.get("relationship_stage", ""),
        "last_touch_date": contact.get("last_touch_date", ""),
        "next_review_date": contact.get("next_review_date", ""),
        "kit": "AWM Relationship OS Kit",
        "privacy": "private_operating_aid",
        "privacy_note": BRAND_FOOTER_ATTRIBUTION,
        "banner_asset": "assets/bg_network_mesh.png",
        "tags": contact_tags(contact),
    }
    lines = [
        f"# {contact.get('name') or 'Unnamed contact'}",
        "",
        "AWM Relationship OS Kit",
        "",
        BRAND_FOOTER_ATTRIBUTION,
        "",
        "## Relationship Snapshot",
    ]
    for label, key in (
        ("Type", "type"),
        ("Stage", "relationship_stage"),
        ("Occupation", "occupation"),
        ("Company", "company"),
        ("Referral source", "referral_source"),
        ("Last touch", "last_touch_date"),
        ("Next review", "next_review_date"),
    ):
        if contact.get(key):
            lines.append(f"- **{label}:** {contact[key]}")

    lines.extend(["", "## Touchpoints Log"])
    if touchpoints:
        for touch in sorted(touchpoints, key=lambda row: row.get("date", ""), reverse=True):
            path = touchpoint_paths.get(touch.get("id", ""))
            label = f"{touch.get('date') or 'undated'} {touch.get('type') or 'touchpoint'}"
            link = wiki_link(path, vault_dir, label) if path else label
            summary = touch.get("summary") or touch.get("raw_input") or ""
            lines.append(f"- {link}: {summary}")
    else:
        lines.append("- No touchpoints logged yet.")

    lines.extend(["", "## Reminders"])
    if reminders:
        for reminder in sorted(reminders, key=lambda row: row.get("due_date", "")):
            status = reminder.get("status") or "pending"
            due = reminder.get("due_date") or "unscheduled"
            lines.append(f"- [{status}] {due} ({reminder.get('priority') or 'medium'}): {reminder.get('context') or ''}")
    else:
        lines.append("- No reminders logged.")

    lines.extend(
        [
            "",
            "## Family",
            contact.get("family") or "_No family notes logged._",
            "",
            "## Policies",
            contact.get("policies") or "_No policy notes logged._",
            "",
            "## Financial Concerns",
            contact.get("financial_concerns") or "_No financial concerns logged._",
            "",
            "## Interests",
            contact.get("interests") or "_No interests logged._",
            "",
            "## Notes",
            contact.get("notes") or "_No additional notes logged._",
            "",
            "---",
            BRAND_FOOTER_ATTRIBUTION,
        ]
    )
    return fields, "\n".join(lines)


def render_touchpoint_note(
    touchpoint: Dict[str, str],
    contact: Optional[Dict[str, str]],
    vault_dir: Path,
) -> Tuple[Dict[str, object], str]:
    contact_name = touchpoint.get("contact_name") or (contact or {}).get("name", "")
    fields = {
        "id": touchpoint.get("id", ""),
        "contact_id": touchpoint.get("contact_id", ""),
        "contact": contact_name,
        "date": touchpoint.get("date", ""),
        "type": touchpoint.get("type", ""),
        "sentiment": touchpoint.get("sentiment", ""),
        "topics": split_items(touchpoint.get("topics", "")),
        "tags": touchpoint_tags(touchpoint),
    }
    lines = [
        f"# {touchpoint.get('date') or 'Undated'} {contact_name or 'Touchpoint'}",
        "",
        f"Contact: {contact_wikilink(contact, vault_dir, contact_name)}",
        "",
        "## Summary",
        touchpoint.get("summary") or "_No summary logged._",
        "",
        "## Topics",
    ]
    topics = split_items(touchpoint.get("topics", ""))
    lines.extend([f"- {topic}" for topic in topics] or ["- No topics logged."])
    lines.extend(
        [
            "",
            "## Action Items",
            touchpoint.get("action_items") or "_No action items logged._",
            "",
            "## Raw Input",
            touchpoint.get("raw_input") or "_No raw input logged._",
        ]
    )
    return fields, "\n".join(lines)


def render_daily_focus_note(row: Dict[str, str]) -> Tuple[Dict[str, object], str]:
    fields = {"date": row.get("date", ""), "type": "daily_focus", "tags": ["relationship-os", "daily-focus"]}
    lines = [
        f"# Daily Focus {row.get('date') or ''}".strip(),
        "",
        "## Priorities",
        f"1. {row.get('priority_1') or '_Not set_'}",
        f"2. {row.get('priority_2') or '_Not set_'}",
        f"3. {row.get('priority_3') or '_Not set_'}",
        "",
        "## Follow-ups Due",
        row.get("follow_ups_due") or "_None logged._",
        "",
        "## Reflection",
        row.get("reflection") or "_No reflection logged._",
        "",
        "## Bottlenecks",
        row.get("bottlenecks") or "_No bottlenecks logged._",
    ]
    return fields, "\n".join(lines)


def render_reminders_index(
    reminders: Sequence[Dict[str, str]],
    contacts_by_id: Dict[str, Dict[str, str]],
    vault_dir: Path,
) -> Tuple[Dict[str, object], str]:
    fields = {
        "type": "reminders_index",
        "generated_at": now_iso(),
        "tags": ["relationship-os", "reminders"],
    }
    lines = ["# Reminders", "", "## Pending"]
    pending = [row for row in reminders if (row.get("status") or "pending") == "pending"]
    if pending:
        for row in sorted(pending, key=lambda item: (item.get("due_date", ""), item.get("priority", ""))):
            contact = contacts_by_id.get(row.get("contact_id", ""))
            contact_label = contact_wikilink(contact, vault_dir, row.get("contact_name", "General"))
            lines.append(
                f"- [ ] {row.get('due_date') or 'unscheduled'} "
                f"({row.get('priority') or 'medium'}) {contact_label}: {row.get('context') or ''}"
            )
    else:
        lines.append("- No pending reminders.")

    completed = [row for row in reminders if (row.get("status") or "") == "done"]
    lines.extend(["", "## Completed"])
    if completed:
        for row in sorted(completed, key=lambda item: item.get("completed_at", ""), reverse=True)[:25]:
            lines.append(f"- [x] {row.get('completed_at') or row.get('due_date') or ''}: {row.get('context') or ''}")
    else:
        lines.append("- No completed reminders.")
    return fields, "\n".join(lines)


def read_vault_index(vault_dir: Path) -> Dict[str, List[Dict[str, object]]]:
    """Read generated Markdown frontmatter, used by tests and import sanity checks."""

    index: Dict[str, List[Dict[str, object]]] = {"Contacts": [], "Touchpoints": [], "Daily": [], "Reminders": []}
    for section in index:
        folder = vault_dir / section
        if not folder.exists():
            continue
        for path in sorted(folder.glob("*.md")):
            data = read_markdown_frontmatter(path)
            data["path"] = str(path)
            index[section].append(data)
    return index


def export_markdown_from_store(store: Store, vault_dir: Path, dry_run: bool = False) -> Dict[str, object]:
    contacts = store.read(CONTACTS)
    touchpoints = store.read(TOUCHPOINTS)
    reminders = store.read(REMINDERS)
    daily_rows = store.read(DAILY_FOCUS)
    contacts_by_id = {row.get("id", ""): row for row in contacts if row.get("id")}
    touchpoint_paths = build_touchpoint_paths(vault_dir, touchpoints)
    output_paths: List[Path] = []

    for contact in contacts:
        contact_touches = rows_for_contact(touchpoints, contact.get("id", ""))
        contact_reminders = rows_for_contact(reminders, contact.get("id", ""))
        fields, body = render_contact_note(contact, contact_touches, contact_reminders, vault_dir, touchpoint_paths)
        path = contact_note_path(vault_dir, contact)
        write_generated_markdown(path, fields, body, dry_run=dry_run)
        output_paths.append(path)

    for touchpoint in touchpoints:
        contact = contacts_by_id.get(touchpoint.get("contact_id", ""))
        fields, body = render_touchpoint_note(touchpoint, contact, vault_dir)
        path = touchpoint_paths.get(touchpoint.get("id", ""))
        if path:
            write_generated_markdown(path, fields, body, dry_run=dry_run)
            output_paths.append(path)

    for row in daily_rows:
        safe_date = safe_filename(row.get("date", "") or "undated", fallback="undated")
        fields, body = render_daily_focus_note(row)
        path = vault_dir / "Daily" / f"{safe_date}.md"
        write_generated_markdown(path, fields, body, dry_run=dry_run)
        output_paths.append(path)

    fields, body = render_reminders_index(reminders, contacts_by_id, vault_dir)
    reminders_index = vault_dir / "Reminders" / "index.md"
    write_generated_markdown(reminders_index, fields, body, dry_run=dry_run)
    output_paths.append(reminders_index)

    return {
        "ok": True,
        "command": "export_markdown",
        "dry_run": dry_run,
        "vault_dir": str(vault_dir),
        "files": [str(path) for path in output_paths],
        "counts": {
            "contacts": len(contacts),
            "touchpoints": len(touchpoints),
            "daily_focus": len(daily_rows),
            "reminders": len(reminders),
        },
        "message": (
            f"{'Would export' if dry_run else 'Exported'} "
            f"{len(output_paths)} Markdown files to {vault_dir}."
        ),
    }


def cmd_export_markdown(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    vault_dir = configured_vault_dir(store, args.output_dir)
    return export_markdown_from_store(store, vault_dir, dry_run=args.dry_run)


def sorted_contact_touchpoints(store: Store, contact_id: str) -> List[Dict[str, str]]:
    touches = rows_for_contact(store.read(TOUCHPOINTS), contact_id)
    touches.sort(key=lambda row: (row.get("date", ""), row.get("meeting_number", ""), row.get("created_at", "")), reverse=True)
    return touches


def pending_contact_reminders(store: Store, contact_id: str) -> List[Dict[str, str]]:
    reminders = [
        row
        for row in store.read(REMINDERS)
        if row.get("contact_id") == contact_id and (row.get("status") or "pending") == "pending"
    ]
    reminders.sort(key=lambda row: row.get("due_date", ""))
    return reminders


def match_contact_tokens(store: Store, tokens: Sequence[str]) -> Tuple[Dict[str, str], List[str]]:
    if not tokens:
        raise RelationshipOSError("Contact name is required.")
    lower_tokens = [token.casefold() for token in tokens]
    candidates = sorted(store.read(CONTACTS), key=lambda row: len(row.get("name", "").split()), reverse=True)
    for contact in candidates:
        name_tokens = contact.get("name", "").split()
        if not name_tokens:
            continue
        if lower_tokens[: len(name_tokens)] == [token.casefold() for token in name_tokens]:
            return contact, list(tokens[len(name_tokens) :])
    name = " ".join(tokens)
    contact = find_contact(store, name)
    if contact:
        return contact, []
    raise RelationshipOSError(f"No contact found for {name}.")


def contact_from_args(store: Store, name: Optional[str], tokens: Sequence[str]) -> Tuple[Dict[str, str], List[str]]:
    if name:
        contact = find_contact(store, name)
        if not contact:
            raise RelationshipOSError(f"No contact found for {name}.")
        return contact, list(tokens)
    return match_contact_tokens(store, tokens)


def parse_optional_date(tokens: List[str], explicit_date: Optional[str]) -> Tuple[Optional[str], List[str]]:
    if explicit_date:
        return explicit_date, tokens
    if tokens and parse_iso_date(tokens[-1]):
        return tokens[-1], tokens[:-1]
    return None, tokens


def generated_paths(vault_dir: Path, kind: str, stem: str, extensions: Sequence[str], output_date: date) -> Dict[str, Path]:
    base = vault_dir / "Generated" / kind / f"{output_date.isoformat()} {safe_filename(stem)}"
    return {ext.lstrip("."): base.with_suffix(f".{ext.lstrip('.')}") for ext in extensions}


def touchpoint_brief(touchpoint: Dict[str, str]) -> str:
    pieces = [touchpoint.get("date", ""), touchpoint.get("type", ""), touchpoint.get("sentiment", "")]
    prefix = " / ".join(piece for piece in pieces if piece)
    return f"{prefix}: {touchpoint.get('summary') or touchpoint.get('raw_input') or ''}"


def render_appointment_summary(contact: Dict[str, str], touches: Sequence[Dict[str, str]], reminders: Sequence[Dict[str, str]]) -> str:
    lines = [
        f"# Appointment Summary: {contact.get('name')}",
        "",
        DRAFT_NOTICE,
        "",
        "## Contact Snapshot",
        f"- Type: {contact.get('type') or 'not logged'}",
        f"- Stage: {contact.get('relationship_stage') or 'not logged'}",
        f"- Last touch: {contact.get('last_touch_date') or 'not logged'}",
        f"- Family: {contact.get('family') or 'not logged'}",
        f"- Policies: {contact.get('policies') or 'not logged'}",
        f"- Financial concerns: {contact.get('financial_concerns') or 'not logged'}",
        "",
        "## Recent Touchpoints",
    ]
    lines.extend([f"- {touchpoint_brief(touch)}" for touch in touches] or ["- No touchpoints logged."])
    lines.extend(["", "## Pending Follow-ups"])
    lines.extend(
        [f"- {row.get('due_date') or 'unscheduled'} ({row.get('priority') or 'medium'}): {row.get('context') or ''}" for row in reminders]
        or ["- No pending reminders."]
    )
    lines.extend(
        [
            "",
            "## Conversation Focus",
            "- Confirm what has changed since the last conversation.",
            "- Clarify the next practical commitment.",
            "- Update relationship, family, policy, and timing details after the appointment.",
            "",
            "---",
            BRAND_FOOTER_ATTRIBUTION,
        ]
    )
    return "\n".join(lines)


def render_proposal(contact: Dict[str, str], topic: str, touches: Sequence[Dict[str, str]], reminders: Sequence[Dict[str, str]]) -> str:
    relevant = [touch for touch in touches if topic.casefold() in (touch.get("topics", "") + " " + touch.get("summary", "")).casefold()]
    if not relevant:
        relevant = list(touches[:3])
    lines = [
        f"# Draft Proposal: {topic}",
        "",
        DRAFT_NOTICE,
        "",
        f"Prepared for internal review before any client use: **{contact.get('name')}**.",
        "",
        "## Relationship Context",
        f"- Contact type: {contact.get('type') or 'not logged'}",
        f"- Relationship stage: {contact.get('relationship_stage') or 'not logged'}",
        f"- Known concerns: {contact.get('financial_concerns') or 'not logged'}",
        f"- Family/policy context: {contact.get('family') or 'not logged'} / {contact.get('policies') or 'not logged'}",
        "",
        "## Topic Framing",
        f"- Topic: {topic}",
        "- Purpose: organize known facts, open questions, and next steps for FC review.",
        "- Compliance note: validate suitability, disclosures, and approved wording before client use.",
        "",
        "## Supporting Notes",
    ]
    lines.extend([f"- {touchpoint_brief(touch)}" for touch in relevant] or ["- No supporting notes logged."])
    lines.extend(["", "## Draft Sections", "1. Client situation recap", "2. Needs and constraints to validate", "3. Options for discussion", "4. Required documentation and compliance checks", "5. Next agreed action"])
    lines.extend(["", "## Open Follow-ups"])
    lines.extend([f"- {row.get('due_date') or 'unscheduled'}: {row.get('context') or ''}" for row in reminders] or ["- No pending reminders."])
    lines.extend(["", "---", BRAND_FOOTER_ATTRIBUTION])
    return "\n".join(lines)


def render_writeup(topic: str, contacts: Sequence[Dict[str, str]], touchpoints: Sequence[Dict[str, str]]) -> str:
    topic_lower = topic.casefold()
    matching_touches = [
        row
        for row in touchpoints
        if topic_lower in (row.get("topics", "") + " " + row.get("summary", "") + " " + row.get("raw_input", "")).casefold()
    ]
    matching_contacts = [
        row
        for row in contacts
        if topic_lower
        in (
            row.get("name", "")
            + " "
            + row.get("financial_concerns", "")
            + " "
            + row.get("interests", "")
            + " "
            + row.get("notes", "")
        ).casefold()
    ]
    lines = [
        f"# Writeup: {topic}",
        "",
        DRAFT_NOTICE,
        "",
        "## Working Summary",
        f"This writeup organizes Relationship OS notes related to **{topic}** for internal review.",
        "",
        "## Related Contacts",
    ]
    lines.extend(
        [
            f"- {row.get('name')} ({row.get('type') or 'type not logged'}, {row.get('relationship_stage') or 'stage not logged'})"
            for row in matching_contacts[:12]
        ]
        or ["- No directly matched contacts."]
    )
    lines.extend(["", "## Related Touchpoints"])
    lines.extend([f"- {touchpoint_brief(row)}" for row in matching_touches[:20]] or ["- No matched touchpoints."])
    lines.extend(
        [
            "",
            "## Gaps To Resolve",
            "- Confirm facts before relying on this summary.",
            "- Add missing policy, family, timing, and suitability context where relevant.",
            "- Use approved compliance language before external use.",
        ]
    )
    return "\n".join(lines)


def write_markdown(path: Path, markdown: str, dry_run: bool = False) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown.rstrip() + "\n", encoding="utf-8")


def cmd_appointment_summary(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    target_date, tokens = parse_optional_date(list(args.tokens), args.date)
    contact, _tail = contact_from_args(store, args.name, tokens)
    touches = sorted_contact_touchpoints(store, contact["id"])
    if target_date:
        exact = [touch for touch in touches if touch.get("date", "")[:10] == target_date]
        touches = exact or [touch for touch in touches if touch.get("date", "")[:10] <= target_date]
    selected_touches = touches[:3]
    reminders = pending_contact_reminders(store, contact["id"])[:5]
    markdown = render_appointment_summary(contact, selected_touches, reminders)
    if target_date:
        output_date = parse_iso_date(target_date)
        if not output_date:
            raise RelationshipOSError("Appointment date must be ISO YYYY-MM-DD.")
    else:
        output_date = today_in_settings(store)
    vault_dir = configured_vault_dir(store, args.output_dir)
    paths = generated_paths(vault_dir, "appointment_summary", contact.get("name", "contact"), ["md", "pdf"], output_date)
    tokens_design = load_design_tokens(configured_design_path(store), configured_design_scheme(store))
    write_markdown(paths["md"], markdown, dry_run=args.dry_run)
    write_basic_pdf(paths["pdf"], f"Appointment Summary: {contact.get('name')}", markdown, tokens_design, dry_run=args.dry_run)
    return {
        "ok": True,
        "command": "appointment_summary",
        "dry_run": args.dry_run,
        "files": [str(paths["md"]), str(paths["pdf"])],
        "message": f"{'Would generate' if args.dry_run else 'Generated'} appointment summary for {contact.get('name')}.",
    }


def cmd_proposal(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    contact, tail = contact_from_args(store, args.name, args.tokens)
    topic = args.topic or " ".join(tail).strip()
    if not topic:
        raise RelationshipOSError("Proposal topic is required.")
    touches = sorted_contact_touchpoints(store, contact["id"])
    reminders = pending_contact_reminders(store, contact["id"])
    markdown = render_proposal(contact, topic, touches, reminders)
    output_date = today_in_settings(store)
    vault_dir = configured_vault_dir(store, args.output_dir)
    paths = generated_paths(vault_dir, "proposal", f"{contact.get('name')} {topic}", ["md", "pdf"], output_date)
    tokens_design = load_design_tokens(configured_design_path(store), configured_design_scheme(store))
    write_markdown(paths["md"], markdown, dry_run=args.dry_run)
    write_basic_pdf(paths["pdf"], f"Draft Proposal: {topic}", markdown, tokens_design, dry_run=args.dry_run)
    return {
        "ok": True,
        "command": "proposal",
        "dry_run": args.dry_run,
        "files": [str(paths["md"]), str(paths["pdf"])],
        "message": f"{'Would generate' if args.dry_run else 'Generated'} proposal draft for {contact.get('name')}.",
    }


def ppt_rgb(color: str):
    from pptx.dml.color import RGBColor  # type: ignore

    return RGBColor(*hex_to_rgb(color))


def add_ppt_picture(slide, path: Optional[Path], left, top, width=None, height=None):
    if not path or not path.exists():
        return None
    return slide.shapes.add_picture(str(path), left, top, width=width, height=height)


def add_ppt_footer(slide, tokens: Dict[str, str], slide_number: int, total_slides: int) -> None:
    from pptx.enum.shapes import MSO_SHAPE  # type: ignore
    from pptx.util import Inches, Pt  # type: ignore

    scheme = tokens.get("scheme", "awm-light")
    width = Inches(13.333)
    y = Inches(7.05)
    if scheme == "awm-dark":
        band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(6.98), width, Inches(0.52))
        band.fill.solid()
        band.fill.fore_color.rgb = ppt_rgb(tokens.get("background", "#050505"))
        band.line.fill.background()
        rule_color = tokens.get("border", "#2A2A2A")
    else:
        band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(6.98), width, Inches(0.52))
        band.fill.solid()
        band.fill.fore_color.rgb = ppt_rgb(tokens.get("background", "#FAF7F0"))
        band.line.fill.background()
        rule_color = tokens.get("border", "#D8CDBA")

    rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.56), Inches(6.91), Inches(12.2), Inches(0.01))
    rule.fill.solid()
    rule.fill.fore_color.rgb = ppt_rgb(rule_color)
    rule.line.fill.background()

    footer = slide.shapes.add_textbox(Inches(0.56), y, Inches(9.9), Inches(0.24))
    paragraph = footer.text_frame.paragraphs[0]
    run = paragraph.add_run()
    run.text = tokens.get("brand_footer_attribution", BRAND_FOOTER_ATTRIBUTION)
    run.font.name = "JetBrains Mono"
    run.font.size = Pt(8.5)
    run.font.color.rgb = ppt_rgb(tokens.get("footer", "#777064"))

    page = slide.shapes.add_textbox(Inches(11.8), y, Inches(0.95), Inches(0.24))
    p = page.text_frame.paragraphs[0]
    p.alignment = 2
    run = p.add_run()
    run.text = f"{slide_number}/{total_slides}"
    run.font.name = "JetBrains Mono"
    run.font.size = Pt(8.5)
    run.font.color.rgb = ppt_rgb(tokens.get("footer", "#777064"))


def build_ppt_closing_background(tokens: Dict[str, str], output: Path, width: int = 1920, height: int = 1080) -> Path:
    """Closing slide background: full-bleed scheme closing image with a tonal wash.

    Mirrors build_ppt_cover_background's treatment so cover and closing read as
    a matched pair. If the asset is missing, falls back to a solid background.
    """
    Image, _ImageDraw, _ImageFont = import_pillow()
    scheme = tokens.get("scheme", "awm-light")
    background = tokens.get("background", "#FAF7F0")
    canvas = Image.new("RGB", (width, height), hex_to_rgb(background))
    asset = design_asset_path(tokens, "closing_background")
    if asset:
        image = Image.open(asset).convert("RGB")
        cropped = cover_crop(image, width / height).resize((width, height))
        if scheme == "awm-dark":
            canvas = blend_color(cropped, tokens.get("background", "#050505"), 0.55)
        else:
            canvas = blend_color(cropped, tokens.get("background", "#FAF7F0"), 0.45)
    canvas.save(output)
    return output


def add_ppt_slide(
    prs,
    title: str,
    bullets: Sequence[str],
    tokens: Dict[str, str],
    slide_number: int,
    total_slides: int,
    temp_dir: Path,
    slide_type: str = "body",
) -> None:
    """Render one slide. `slide_type` is one of 'cover', 'body', 'closing'.

    Cover and closing carry the brand imagery; body carries the watermarked
    card with bullets. The dispatch is explicit so the orchestrator can
    place a closing slide anywhere in the deck (it does not have to be the
    last slide by position to look correct).
    """
    from pptx.enum.shapes import MSO_SHAPE  # type: ignore
    from pptx.util import Inches, Pt  # type: ignore

    slide = prs.slides.add_slide(prs.slide_layouts[6])
    scheme = tokens.get("scheme", "awm-light")
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = ppt_rgb(tokens.get("background", "#FFFFFF"))

    if slide_type == "closing":
        closing_path = build_ppt_closing_background(tokens, temp_dir / f"closing-{scheme}.png")
        add_ppt_picture(slide, closing_path, 0, 0, width=Inches(13.333), height=Inches(7.5))
        logo_path = design_asset_path(tokens, "logo_cover")
        logo_render = (
            image_with_opacity(logo_path, temp_dir / f"closing-logo-{scheme}.png")
            if logo_path else None
        )
        add_ppt_picture(
            slide,
            logo_render,
            Inches(0.56),
            Inches(0.42),
            width=Inches(1.05 if scheme == "awm-dark" else 0.95),
        )
        add_ppt_footer(slide, tokens, slide_number, total_slides)
        return

    if slide_type == "cover":
        cover_path = build_ppt_cover_background(tokens, temp_dir / f"cover-{scheme}.png")
        add_ppt_picture(slide, cover_path, 0, 0, width=Inches(13.333), height=Inches(7.5))
        logo_path = design_asset_path(tokens, "logo_cover")
        logo_render = image_with_opacity(logo_path, temp_dir / f"cover-logo-{scheme}.png") if logo_path else None
        add_ppt_picture(slide, logo_render, Inches(0.56), Inches(0.42), width=Inches(1.45 if scheme == "awm-dark" else 1.25))
        if scheme == "awm-dark":
            panel = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.52), Inches(1.95), Inches(6.6), Inches(3.35))
            panel.fill.solid()
            panel.fill.fore_color.rgb = ppt_rgb("#050505")
            panel.fill.transparency = 18
            panel.line.fill.background()
        title_left = Inches(0.76 if scheme != "awm-dark" else 0.72)
        title_top = Inches(2.25 if scheme != "awm-dark" else 2.32)
        title_width = Inches(6.6)
        eyebrow = slide.shapes.add_textbox(title_left, title_top - Inches(0.45), title_width, Inches(0.28))
        eyebrow_run = eyebrow.text_frame.paragraphs[0].add_run()
        eyebrow_run.text = "AWM RELATIONSHIP OS KIT"
        eyebrow_run.font.name = "Barlow Condensed"
        eyebrow_run.font.size = Pt(11)
        eyebrow_run.font.bold = True
        eyebrow_run.font.color.rgb = ppt_rgb(tokens.get("accent_text", tokens.get("accent", "#C6A34F")))
        title_box = slide.shapes.add_textbox(title_left, title_top, title_width, Inches(1.2))
        title_frame = title_box.text_frame
        title_frame.clear()
        title_run = title_frame.paragraphs[0].add_run()
        title_run.text = title
        title_run.font.name = tokens.get("font_heading", "Georgia")
        title_run.font.size = Pt(36 if scheme != "awm-dark" else 38)
        title_run.font.bold = False
        title_run.font.color.rgb = ppt_rgb(tokens.get("primary", "#18231E"))
        rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, title_left, title_top + Inches(1.18), Inches(1.55), Inches(0.02))
        rule.fill.solid()
        rule.fill.fore_color.rgb = ppt_rgb(tokens.get("accent", "#C6A34F"))
        rule.line.fill.background()
        subtitle = slide.shapes.add_textbox(title_left, title_top + Inches(1.42), title_width, Inches(1.0))
        frame = subtitle.text_frame
        frame.word_wrap = True
        for idx, bullet in enumerate(bullets or ["Private preparation deck for consultant review."]):
            paragraph = frame.paragraphs[0] if idx == 0 else frame.add_paragraph()
            paragraph.text = bullet
            paragraph.font.name = tokens.get("font_body", "Arial")
            paragraph.font.size = Pt(15)
            paragraph.font.color.rgb = ppt_rgb(tokens.get("text_soft", tokens.get("text", "#4A473F")))
        add_ppt_footer(slide, tokens, slide_number, total_slides)
        return

    body_bg = design_asset_path(tokens, "body_background")
    if body_bg:
        watermark = image_with_opacity(body_bg, temp_dir / f"body-bg-{scheme}-{slide_number}.png", opacity=0.10 if scheme == "awm-dark" else 0.07)
        add_ppt_picture(
            slide,
            watermark,
            Inches(8.9 if scheme == "awm-dark" else 9.1),
            Inches(0.25 if scheme == "awm-dark" else 4.1),
            width=Inches(4.1 if scheme == "awm-dark" else 3.7),
        )
    logo_path = design_asset_path(tokens, "logo_body")
    logo_render = image_with_opacity(logo_path, temp_dir / f"body-logo-{scheme}-{slide_number}.png") if logo_path else None
    add_ppt_picture(slide, logo_render, Inches(0.56), Inches(0.34), width=Inches(0.95 if scheme == "awm-dark" else 0.82))

    title_box = slide.shapes.add_textbox(Inches(0.56), Inches(1.02), Inches(8.0), Inches(0.68))
    title_frame = title_box.text_frame
    title_frame.clear()
    title_run = title_frame.paragraphs[0].add_run()
    title_run.text = title
    title_run.font.name = tokens.get("font_heading", "Aptos Display")
    title_run.font.size = Pt(30)
    title_run.font.bold = False
    title_run.font.color.rgb = ppt_rgb(tokens.get("primary", "#1F3A5F"))

    rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.56), Inches(1.82), Inches(2.1), Inches(0.02))
    rule.fill.solid()
    rule.fill.fore_color.rgb = ppt_rgb(tokens.get("accent", "#C6A34F"))
    rule.line.fill.background()

    card = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.72), Inches(2.08), Inches(11.65), Inches(4.42))
    card.fill.solid()
    card.fill.fore_color.rgb = ppt_rgb(tokens.get("surface", "#FFFDF8"))
    card.line.color.rgb = ppt_rgb(tokens.get("border", "#D8CDBA"))

    body = slide.shapes.add_textbox(Inches(1.04), Inches(2.36), Inches(10.96), Inches(3.86))
    frame = body.text_frame
    frame.clear()
    frame.word_wrap = True
    for idx, bullet in enumerate(bullets or ["No notes logged."]):
        paragraph = frame.paragraphs[0] if idx == 0 else frame.add_paragraph()
        paragraph.text = bullet
        paragraph.level = 0
        paragraph.font.name = tokens.get("font_body", "Aptos")
        paragraph.font.size = Pt(17)
        paragraph.font.color.rgb = ppt_rgb(tokens.get("text", "#172033"))
        paragraph.space_after = Pt(8)
    add_ppt_footer(slide, tokens, slide_number, total_slides)


def _paginate_content_slides(title: str, bullets: Sequence[str]) -> List[RenderedSlide]:
    """Split bullets across as many body slides as needed.

    Density rule (borrowed from the frontend-slides skill): at most
    MAX_BULLETS_PER_CONTENT_SLIDE bullets per slide; if more are provided,
    spill onto continuation slides with a "(cont.)" suffix on the title.
    """
    items = [str(b).strip() for b in bullets if str(b).strip()]
    if not items:
        return [RenderedSlide(type="body", title=title, bullets=["(no content)"])]
    per_slide = MAX_BULLETS_PER_CONTENT_SLIDE
    slides: List[RenderedSlide] = []
    for i in range(0, len(items), per_slide):
        chunk = items[i : i + per_slide]
        page_title = title if i == 0 else f"{title} (cont.)"
        slides.append(RenderedSlide(type="body", title=page_title, bullets=chunk))
    return slides


def render_contact_context_section(contact: Dict[str, str]) -> List[RenderedSlide]:
    bullets = [
        f"Type: {contact.get('type') or 'not logged'}",
        f"Stage: {contact.get('relationship_stage') or 'not logged'}",
        f"Known concerns: {contact.get('financial_concerns') or 'not logged'}",
        f"Family/policies: {contact.get('family') or 'not logged'} / {contact.get('policies') or 'not logged'}",
    ]
    return [RenderedSlide(type="body", title="Relationship Context", bullets=bullets)]


def render_touchpoint_summary_section(
    touches: Sequence[Dict[str, str]],
    limit: Optional[int] = None,
) -> List[RenderedSlide]:
    items = list(touches)
    if limit:
        items = items[:limit]
    if not items:
        return [RenderedSlide(type="body", title="Recent Touchpoints", bullets=["No touchpoints logged."])]
    per_slide = MAX_TOUCHPOINT_ENTRIES_PER_SUMMARY_SLIDE
    slides: List[RenderedSlide] = []
    for i in range(0, len(items), per_slide):
        chunk = items[i : i + per_slide]
        title = "Recent Touchpoints" if i == 0 else "Recent Touchpoints (cont.)"
        slides.append(
            RenderedSlide(type="body", title=title, bullets=[touchpoint_brief(t) for t in chunk])
        )
    return slides


def render_touchpoint_detail_section(
    section: SlideSection,
    touchpoint_index: Dict[str, Dict[str, str]],
) -> List[RenderedSlide]:
    touchpoint = touchpoint_index.get(section.touchpoint_id)
    if not touchpoint:
        raise RelationshipOSError(
            f"touchpoint_detail references unknown touchpoint_id {section.touchpoint_id!r}."
        )
    raw_date = (touchpoint.get("date") or "")[:10] or "undated"
    raw_type = (touchpoint.get("type") or "touchpoint").title()
    raw_sentiment = touchpoint.get("sentiment", "")
    title = f"{raw_date} · {raw_type}"
    if raw_sentiment:
        title += f" · {raw_sentiment}"
    return _paginate_content_slides(title, section.bullets)


def render_content_section(section: SlideSection) -> List[RenderedSlide]:
    return _paginate_content_slides(section.title, section.bullets)


def render_open_items_section(reminders: Sequence[Dict[str, str]]) -> List[RenderedSlide]:
    items = list(reminders)
    if not items:
        return [RenderedSlide(type="body", title="Open Items", bullets=["No pending reminders."])]
    per_slide = MAX_OPEN_ITEMS_PER_SLIDE
    formatted = [
        f"{row.get('due_date') or 'unscheduled'}: {row.get('context') or ''}"
        for row in items
    ]
    slides: List[RenderedSlide] = []
    for i in range(0, len(formatted), per_slide):
        chunk = formatted[i : i + per_slide]
        title = "Open Items" if i == 0 else "Open Items (cont.)"
        slides.append(RenderedSlide(type="body", title=title, bullets=chunk))
    return slides


def section_to_slides(
    section: SlideSection,
    contact: Dict[str, str],
    touches: Sequence[Dict[str, str]],
    reminders: Sequence[Dict[str, str]],
    touchpoint_index: Dict[str, Dict[str, str]],
) -> List[RenderedSlide]:
    if section.type == "contact_context":
        return render_contact_context_section(contact)
    if section.type == "touchpoint_summary":
        return render_touchpoint_summary_section(touches, section.limit)
    if section.type == "touchpoint_detail":
        return render_touchpoint_detail_section(section, touchpoint_index)
    if section.type == "content":
        return render_content_section(section)
    if section.type == "open_items":
        return render_open_items_section(reminders)
    raise RelationshipOSError(f"Unknown section type: {section.type!r}")


def default_sections() -> List[SlideSection]:
    """Default section list used by the positional `slides Name Purpose` form."""
    return [
        SlideSection(type="contact_context"),
        SlideSection(type="touchpoint_summary", limit=5),
        SlideSection(type="open_items"),
    ]


def build_deck(
    contact: Dict[str, str],
    purpose: str,
    sections: Sequence[SlideSection],
    touches: Sequence[Dict[str, str]],
    reminders: Sequence[Dict[str, str]],
) -> List[RenderedSlide]:
    """Compose a full deck: auto cover + user sections (with pagination) + auto closing."""
    touchpoint_index = {t.get("id", ""): t for t in touches if t.get("id")}
    deck: List[RenderedSlide] = [
        RenderedSlide(
            type="cover",
            title=f"{contact.get('name', 'Contact')} - {purpose}",
            bullets=[DRAFT_NOTICE],
        ),
    ]
    for section in sections:
        deck.extend(section_to_slides(section, contact, touches, reminders, touchpoint_index))
    deck.append(RenderedSlide(type="closing"))
    return deck


def slide_sections(
    contact: Dict[str, str],
    purpose: str,
    touches: Sequence[Dict[str, str]],
    reminders: Sequence[Dict[str, str]],
) -> List[Tuple[str, List[str]]]:
    """Back-compat shim returning (title, bullets) tuples for the default deck.

    Used by `scripts/regenerate_showcase.py` to render PNG previews of the
    first slides without going through PPTX.
    """
    rendered = build_deck(contact, purpose, default_sections(), touches, reminders)
    return [(slide.title, list(slide.bullets)) for slide in rendered]


def write_rendered_slides(
    path: Path,
    rendered: Sequence[RenderedSlide],
    tokens: Dict[str, str],
    dry_run: bool = False,
) -> None:
    if dry_run:
        return
    try:
        from pptx import Presentation  # type: ignore
        from pptx.util import Inches  # type: ignore
    except ImportError as exc:
        raise RelationshipOSError(
            "Slides generation requires python-pptx. Install dependencies with `python3 -m pip install -r requirements.txt`."
        ) from exc

    path.parent.mkdir(parents=True, exist_ok=True)
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    slides = list(rendered)
    with TemporaryDirectory() as tmp:
        temp_dir = Path(tmp)
        for index, slide in enumerate(slides, start=1):
            add_ppt_slide(
                prs,
                slide.title,
                slide.bullets,
                tokens,
                index,
                len(slides),
                temp_dir,
                slide_type=slide.type,
            )
    prs.save(path)


def write_slides(
    path: Path,
    contact: Dict[str, str],
    purpose: str,
    touches: Sequence[Dict[str, str]],
    reminders: Sequence[Dict[str, str]],
    tokens: Dict[str, str],
    dry_run: bool = False,
    max_slides: Optional[int] = None,
    sections: Optional[Sequence[SlideSection]] = None,
) -> None:
    """Backward-compatible deck writer.

    If `sections` is None, falls back to `default_sections()`. `max_slides`
    clips the rendered slide list (used by `regenerate_showcase.py` for
    2-slide previews).
    """
    sections_to_use = list(sections) if sections is not None else default_sections()
    rendered = build_deck(contact, purpose, sections_to_use, touches, reminders)
    if max_slides:
        rendered = rendered[:max_slides]
    write_rendered_slides(path, rendered, tokens, dry_run=dry_run)


def _load_slides_payload(args: argparse.Namespace) -> Optional[Dict[str, object]]:
    """Read a structured deck payload from --json or --json-file, if provided."""
    if args.json_file:
        return json.loads(Path(args.json_file).expanduser().read_text(encoding="utf-8"))
    if args.json is not None:
        json_text = sys.stdin.read() if args.json == "-" else args.json
        return json.loads(json_text)
    return None


def cmd_slides(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()

    payload = _load_slides_payload(args)

    if payload is not None:
        if not isinstance(payload, dict):
            raise RelationshipOSError("slides payload must be a JSON object.")
        contact_name = str(payload.get("contact_name") or "").strip()
        if not contact_name:
            raise RelationshipOSError("slides payload requires 'contact_name'.")
        contact = find_contact(store, contact_name)
        if not contact:
            raise RelationshipOSError(f"No contact found for {contact_name}.")
        purpose = str(payload.get("purpose") or "").strip()
        if not purpose:
            raise RelationshipOSError("slides payload requires 'purpose'.")
        raw_sections = payload.get("sections")
        if not isinstance(raw_sections, list) or not raw_sections:
            raise RelationshipOSError("slides payload requires a non-empty 'sections' list.")
        sections = [slide_section_from_dict(item) for item in raw_sections]
    else:
        contact, tail = contact_from_args(store, args.name, args.tokens)
        purpose = args.purpose or " ".join(tail).strip()
        if not purpose:
            raise RelationshipOSError("Slides purpose is required.")
        sections = default_sections()

    output_date = today_in_settings(store)
    vault_dir = configured_vault_dir(store, args.output_dir)
    paths = generated_paths(vault_dir, "slides", f"{contact.get('name')} {purpose}", ["pptx"], output_date)
    tokens_design = load_design_tokens(configured_design_path(store), configured_design_scheme(store))
    touches = sorted_contact_touchpoints(store, contact["id"])
    reminders = pending_contact_reminders(store, contact["id"])
    rendered = build_deck(contact, purpose, sections, touches, reminders)
    write_rendered_slides(paths["pptx"], rendered, tokens_design, dry_run=args.dry_run)
    return {
        "ok": True,
        "command": "slides",
        "dry_run": args.dry_run,
        "files": [str(paths["pptx"])],
        "slide_count": len(rendered),
        "message": (
            f"{'Would generate' if args.dry_run else 'Generated'} "
            f"{len(rendered)}-slide deck for {contact.get('name')}."
        ),
    }


def cmd_writeup(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    topic = args.topic or " ".join(args.tokens).strip()
    if not topic:
        raise RelationshipOSError("Writeup topic is required.")
    output_date = today_in_settings(store)
    vault_dir = configured_vault_dir(store, args.output_dir)
    paths = generated_paths(vault_dir, "writeup", topic, ["md"], output_date)
    markdown = render_writeup(topic, store.read(CONTACTS), store.read(TOUCHPOINTS))
    write_markdown(paths["md"], markdown, dry_run=args.dry_run)
    return {
        "ok": True,
        "command": "writeup",
        "dry_run": args.dry_run,
        "files": [str(paths["md"])],
        "message": f"{'Would generate' if args.dry_run else 'Generated'} writeup for {topic}.",
    }


def merge_contact_field_values(
    into_row: Dict[str, str],
    from_row: Dict[str, str],
    today: date,
) -> Tuple[Dict[str, str], Dict[str, Dict[str, str]]]:
    """Merge `from_row` into `into_row`. Returns (updated_into, field_diff).

    Strategy:
    - Consultant-managed fields: if `into` is empty, copy from `from`. If both
      are populated, keep `into`'s value and append `from`'s value to `notes`
      with a `[merged from <name> on YYYY-MM-DD] <field>: <value>` marker so
      nothing is silently lost.
    - `relationship_stage`: upgrade if `from`'s stage is more advanced.
    - `type`: upgrade if `from`'s type is more committed (client > prospect).
    - `last_touch_date`: take the later of the two.
    """
    diff: Dict[str, Dict[str, str]] = {}
    appended_notes: List[str] = []
    from_name = from_row.get("name") or "previous contact"
    today_str = today.isoformat()

    for field_name in CONSULTANT_MANAGED_FIELDS:
        existing = (into_row.get(field_name) or "").strip()
        incoming = (from_row.get(field_name) or "").strip()
        if not incoming or existing == incoming:
            continue
        if not existing:
            into_row[field_name] = incoming
            diff[field_name] = {"from": "", "to": incoming, "action": "copied"}
        else:
            appended_notes.append(
                f"[merged from {from_name} on {today_str}] {field_name}: {incoming}"
            )
            diff[field_name] = {
                "from": existing,
                "to": existing,
                "action": "preserved; other value moved to notes",
            }

    if appended_notes:
        prior = (into_row.get("notes") or "").strip()
        merged_block = "\n".join(appended_notes)
        into_row["notes"] = (prior + "\n\n" + merged_block).strip() if prior else merged_block
        # Reflect the notes change in the diff so the consultant sees what landed.
        diff["notes"] = {
            "from": prior,
            "to": into_row["notes"],
            "action": "appended merge marker(s)",
        }

    stage_order = ["cold", "warming", "warm", "hot", "client", "inactive"]
    s_into = into_row.get("relationship_stage") or ""
    s_from = from_row.get("relationship_stage") or ""
    if s_from and s_from in stage_order:
        if not s_into or stage_order.index(s_from) > stage_order.index(s_into):
            into_row["relationship_stage"] = s_from
            diff["relationship_stage"] = {"from": s_into, "to": s_from, "action": "upgraded"}

    type_order = ["other", "candidate", "advisor", "prospect", "client"]
    t_into = into_row.get("type") or ""
    t_from = from_row.get("type") or ""
    if t_from and t_from in type_order:
        if not t_into or type_order.index(t_from) > type_order.index(t_into):
            into_row["type"] = t_from
            diff["type"] = {"from": t_into, "to": t_from, "action": "upgraded"}

    d_into = parse_iso_date(into_row.get("last_touch_date") or "")
    d_from = parse_iso_date(from_row.get("last_touch_date") or "")
    if d_from and (not d_into or d_from > d_into):
        into_row["last_touch_date"] = d_from.isoformat()
        diff["last_touch_date"] = {
            "from": d_into.isoformat() if d_into else "",
            "to": d_from.isoformat(),
            "action": "took later",
        }

    into_row["updated_at"] = now_iso()
    return into_row, diff


def cmd_merge_contacts(args: argparse.Namespace) -> Dict[str, object]:
    store = get_store()
    store.ensure()
    from_id = (args.from_id or "").strip()
    into_id = (args.into_id or "").strip()
    if not from_id or not into_id:
        raise RelationshipOSError("merge-contacts requires --from and --into.")
    if from_id == into_id:
        raise RelationshipOSError("--from and --into must refer to different contacts.")

    from_contact = find_contact_by_id(store, from_id)
    if not from_contact:
        raise RelationshipOSError(f"No contact with id {from_id!r}.")
    into_contact = find_contact_by_id(store, into_id)
    if not into_contact:
        raise RelationshipOSError(f"No contact with id {into_id!r}.")

    into_name = into_contact.get("name") or ""
    from_name = from_contact.get("name") or ""
    today = today_in_settings(store)

    touchpoint_rows = store.read(TOUCHPOINTS)
    touchpoints_moved = 0
    for row in touchpoint_rows:
        if row.get("contact_id") == from_id:
            row["contact_id"] = into_id
            row["contact_name"] = into_name
            touchpoints_moved += 1
    if touchpoints_moved:
        store.replace(TOUCHPOINTS, touchpoint_rows)

    reminder_rows = store.read(REMINDERS)
    reminders_moved = 0
    for row in reminder_rows:
        if row.get("contact_id") == from_id:
            row["contact_id"] = into_id
            row["contact_name"] = into_name
            reminders_moved += 1
    if reminders_moved:
        store.replace(REMINDERS, reminder_rows)

    contact_rows = store.read(CONTACTS)
    target = next((r for r in contact_rows if r.get("id") == into_id), None)
    if target is None:
        raise RelationshipOSError(f"Contact {into_id!r} disappeared mid-merge.")
    merged_target, field_diff = merge_contact_field_values(target, from_contact, today)
    contact_rows = [r for r in contact_rows if r.get("id") != from_id]
    for i, row in enumerate(contact_rows):
        if row.get("id") == into_id:
            contact_rows[i] = merged_target
            break
    store.replace(CONTACTS, contact_rows)

    log_event(
        store,
        "contact_merged",
        contact_id=into_id,
        subject_id=into_id,
        payload={
            "merged_from_id": from_id,
            "merged_from_name": from_name,
            "touchpoints_moved": touchpoints_moved,
            "reminders_moved": reminders_moved,
            "field_diff": field_diff,
        },
        source="merge-contacts",
    )

    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "merge-contacts",
        "from_id": from_id,
        "from_name": from_name,
        "into_id": into_id,
        "into_name": into_name,
        "touchpoints_moved": touchpoints_moved,
        "reminders_moved": reminders_moved,
        "field_diff": field_diff,
        "synced_views": synced,
        "message": (
            f"Merged {from_name} into {into_name}: "
            f"{touchpoints_moved} touchpoint(s), {reminders_moved} reminder(s) moved."
        ),
    }


def cmd_find_reminders(args: argparse.Namespace) -> Dict[str, object]:
    """Search reminders by free-text query. Used by Hermes when the consultant
    references a reminder without giving a contact name or ID
    (e.g. 'marked the SRS thing done').
    """
    store = get_store()
    store.ensure()
    query = (args.query or "").strip().casefold()
    status_filter = (args.status or "pending").strip().lower()
    if status_filter not in {"pending", "done", "snoozed", "cancelled", "any"}:
        raise RelationshipOSError(
            "--status must be one of: pending, done, snoozed, cancelled, any."
        )
    limit = max(1, args.limit or 10)

    candidates: List[Dict[str, str]] = []
    for row in store.read(REMINDERS):
        row_status = row.get("status") or "pending"
        if status_filter != "any" and row_status != status_filter:
            continue
        if query:
            haystack = " ".join(
                [
                    row.get("context") or "",
                    row.get("type") or "",
                    row.get("contact_name") or "",
                ]
            ).casefold()
            if query not in haystack:
                continue
        candidates.append(
            {
                "id": row.get("id") or "",
                "contact_id": row.get("contact_id") or "",
                "contact_name": row.get("contact_name") or "",
                "due_date": row.get("due_date") or "",
                "status": row_status,
                "context": row.get("context") or "",
                "type": row.get("type") or "",
                "priority": row.get("priority") or "",
            }
        )

    # Empty due_date sinks; otherwise ascending due_date.
    candidates.sort(key=lambda r: (not r["due_date"], r["due_date"]))
    candidates = candidates[:limit]

    return {
        "ok": True,
        "command": "find-reminders",
        "query": args.query or "",
        "status": status_filter,
        "count": len(candidates),
        "candidates": candidates,
    }


def _apply_contact_field_update(
    row: Dict[str, str],
    field_name: str,
    new_value: str,
    *,
    replace: bool,
    today: date,
) -> Tuple[str, str]:
    """Apply append-or-replace semantics to one contact field; return (old, new)."""
    old = row.get(field_name) or ""
    if not replace and field_name in APPEND_BY_DEFAULT_FIELDS:
        entry = f"[{today.isoformat()}] {new_value}"
        written = (old.rstrip() + "\n\n" + entry) if old.strip() else entry
    else:
        written = new_value
    row[field_name] = written
    return old, written


def cmd_update_contact(args: argparse.Namespace) -> Dict[str, object]:
    """Hermes-facing API for editing consultant-managed contact fields.

    Atomic facts (phone, email, etc.) are replaced. Free-text fields
    (family, notes, financial_concerns, interests, policies) are appended
    with a `[YYYY-MM-DD]` date prefix by default — pass `--replace` (or
    `"replace": true` in JSON) to force overwrite.
    """
    store = get_store()
    store.ensure()

    payload: Optional[Dict[str, object]] = None
    if args.json_file:
        payload = json.loads(Path(args.json_file).expanduser().read_text(encoding="utf-8"))
    elif args.json is not None:
        json_text = sys.stdin.read() if args.json == "-" else args.json
        payload = json.loads(json_text)

    # Source defaults to the Hermes-side label, but the app (or any other
    # peer writer) can override via the JSON payload's `source` field so the
    # Settings "last Hermes event" filter (source NOT LIKE 'app:%') keeps
    # working correctly when app-initiated edits shell out through here.
    source = "hermes:update-contact-fields"

    if payload is not None:
        if not isinstance(payload, dict):
            raise RelationshipOSError("update-contact payload must be a JSON object.")
        contact_id = str(payload.get("id") or args.contact_id or "").strip()
        contact_name = str(
            payload.get("name") or payload.get("contact_name") or args.name or ""
        ).strip()
        replace_default = bool(payload.get("replace", False))
        if payload.get("source"):
            source = str(payload["source"]).strip() or source
        updates_payload = payload.get("updates") or {}
        if not isinstance(updates_payload, dict):
            raise RelationshipOSError(
                "update-contact payload `updates` must be an object {field: value}."
            )
        updates_list = [
            (str(k), "" if v is None else str(v), replace_default)
            for k, v in updates_payload.items()
        ]
    else:
        contact_id = (args.contact_id or "").strip()
        contact_name = (args.name or "").strip()
        if not args.field:
            raise RelationshipOSError(
                "update-contact requires --field (or a JSON updates object)."
            )
        if args.value is None:
            raise RelationshipOSError("update-contact requires --value.")
        updates_list = [(args.field.strip(), str(args.value), bool(getattr(args, "replace", False)))]

    if contact_id:
        contact = find_contact_by_id(store, contact_id)
        if not contact:
            raise RelationshipOSError(f"No contact with id {contact_id!r}.")
    elif contact_name:
        contact = find_contact(store, contact_name)
        if not contact:
            raise RelationshipOSError(f"No contact found for {contact_name!r}.")
        contact_id = contact["id"]
    else:
        raise RelationshipOSError("update-contact requires --id, --name, or one of those in JSON.")

    for field_name, _, _ in updates_list:
        if field_name in HERMES_MANAGED_FIELDS:
            raise RelationshipOSError(
                f"Field {field_name!r} is derived from touchpoints or merges and "
                "cannot be set via update-contact."
            )
        if field_name not in CONSULTANT_MANAGED_FIELDS:
            raise RelationshipOSError(
                f"Field {field_name!r} is not in CONSULTANT_MANAGED_FIELDS. "
                f"Allowed: {sorted(CONSULTANT_MANAGED_FIELDS)}."
            )

    today = today_in_settings(store)
    rows = store.read(CONTACTS)
    target = next((r for r in rows if r.get("id") == contact_id), None)
    if target is None:
        raise RelationshipOSError(f"Contact {contact_id!r} disappeared mid-update.")

    diff: Dict[str, Dict[str, str]] = {}
    for field_name, new_value, replace in updates_list:
        old, written = _apply_contact_field_update(
            target, field_name, new_value, replace=replace, today=today
        )
        if old == written:
            continue
        action = "replaced" if replace or field_name not in APPEND_BY_DEFAULT_FIELDS else "appended"
        diff[field_name] = {"from": old, "to": written, "action": action}

    if not diff:
        return {
            "ok": True,
            "command": "update-contact",
            "contact_id": contact_id,
            "contact_name": target.get("name") or "",
            "diff": {},
            "message": "No changes — all proposed values matched the existing ones.",
        }

    target["updated_at"] = now_iso()
    store.replace(CONTACTS, rows)

    log_event(
        store,
        "contact_updated",
        contact_id=contact_id,
        subject_id=contact_id,
        payload={"diff": diff, "field_count": len(diff)},
        source=source,
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "update-contact",
        "contact_id": contact_id,
        "contact_name": target.get("name") or "",
        "diff": diff,
        "synced_views": synced,
        "message": f"Updated {len(diff)} field(s) on {target.get('name')}.",
    }


def find_policy(store: Store, policy_id: str) -> Optional[Dict[str, str]]:
    for row in store.read(POLICIES):
        if row.get("id") == policy_id:
            return row
    return None


def policies_for_contact(store: Store, contact_id: str, *, include_archived: bool = False) -> List[Dict[str, str]]:
    rows = [r for r in store.read(POLICIES) if r.get("contact_id") == contact_id]
    if not include_archived:
        rows = [r for r in rows if (r.get("status") or "active") != "archived"]
    return rows


def _resolve_contact_for_policy(
    store: Store,
    contact_id: str,
    contact_name: str,
) -> Dict[str, str]:
    if contact_id:
        contact = find_contact_by_id(store, contact_id)
        if not contact:
            raise RelationshipOSError(f"No contact with id {contact_id!r}.")
        return contact
    if contact_name:
        contact = find_contact(store, contact_name)
        if not contact:
            raise RelationshipOSError(f"No contact found for {contact_name!r}.")
        return contact
    raise RelationshipOSError("Need --contact-id or --contact-name (or in JSON payload).")


def _load_policy_payload(args: argparse.Namespace) -> Optional[Dict[str, object]]:
    if getattr(args, "json_file", None):
        return json.loads(Path(args.json_file).expanduser().read_text(encoding="utf-8"))
    if getattr(args, "json", None) is not None:
        json_text = sys.stdin.read() if args.json == "-" else args.json
        return json.loads(json_text)
    return None


def cmd_add_policy(args: argparse.Namespace) -> Dict[str, object]:
    """Create a structured policy entry for a contact."""
    store = get_store()
    store.ensure()

    payload = _load_policy_payload(args)
    if payload is not None:
        if not isinstance(payload, dict):
            raise RelationshipOSError("add-policy payload must be a JSON object.")
        contact_id = str(payload.get("contact_id") or args.contact_id or "").strip()
        contact_name = str(payload.get("contact_name") or args.contact_name or "").strip()
        fields = {k: ("" if v is None else str(v)) for k, v in payload.items()
                  if k in EDITABLE_POLICY_FIELDS}
    else:
        contact_id = (args.contact_id or "").strip()
        contact_name = (args.contact_name or "").strip()
        fields = {}
        for fname in EDITABLE_POLICY_FIELDS:
            value = getattr(args, fname, None)
            if value is not None:
                fields[fname] = str(value)

    contact = _resolve_contact_for_policy(store, contact_id, contact_name)
    contact_id = contact["id"]

    if not fields.get("insurer"):
        raise RelationshipOSError("insurer is required.")
    if not fields.get("plan_name"):
        raise RelationshipOSError("plan_name is required.")

    status = fields.get("status") or "active"
    if status not in VALID_POLICY_STATUSES:
        raise RelationshipOSError(
            f"status must be one of {sorted(VALID_POLICY_STATUSES)}; got {status!r}."
        )

    for date_field in POLICY_DATE_FIELDS:
        if fields.get(date_field):
            # Validate ISO format; reject garbage.
            parse_iso_date_strict(fields[date_field], date_field)

    today = today_in_settings(store)
    policy_id = make_id("p", today)
    row = {
        "id": policy_id,
        "contact_id": contact_id,
        "insurer": fields.get("insurer", ""),
        "plan_name": fields.get("plan_name", ""),
        "policy_type": fields.get("policy_type", ""),
        "policy_number": fields.get("policy_number", ""),
        "sum_assured": fields.get("sum_assured", ""),
        "premium_amount": fields.get("premium_amount", ""),
        "premium_frequency": fields.get("premium_frequency", ""),
        "premium_term": fields.get("premium_term", ""),
        "policy_term": fields.get("policy_term", ""),
        "payment_method": fields.get("payment_method", ""),
        "start_date": fields.get("start_date", ""),
        "review_date": fields.get("review_date", ""),
        "review_frequency": fields.get("review_frequency", ""),
        "last_reviewed": fields.get("last_reviewed", ""),
        "current_value": fields.get("current_value", ""),
        "valuation_date": fields.get("valuation_date", ""),
        "surrender_value": fields.get("surrender_value", ""),
        "policy_owner": fields.get("policy_owner", ""),
        "life_assured": fields.get("life_assured", ""),
        "payor": fields.get("payor", ""),
        "beneficiaries": fields.get("beneficiaries", ""),
        "riders": fields.get("riders", ""),
        "servicing_rep": fields.get("servicing_rep", ""),
        "needs_category": fields.get("needs_category", ""),
        "status": status,
        "notes": fields.get("notes", ""),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    store.append(POLICIES, row)
    log_event(
        store,
        "policy_created",
        contact_id=contact_id,
        subject_id=policy_id,
        payload={
            "insurer": row["insurer"],
            "plan_name": row["plan_name"],
            "policy_type": row["policy_type"],
            "premium_amount": row["premium_amount"],
        },
        source="add-policy",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "add-policy",
        "policy": row,
        "contact_name": contact.get("name") or "",
        "synced_views": synced,
        "message": f"Added {row['plan_name']} ({row['insurer']}) for {contact.get('name')}.",
    }


def cmd_update_policy(args: argparse.Namespace) -> Dict[str, object]:
    """Update fields on an existing policy by id."""
    store = get_store()
    store.ensure()

    payload = _load_policy_payload(args)
    if payload is not None:
        if not isinstance(payload, dict):
            raise RelationshipOSError("update-policy payload must be a JSON object.")
        policy_id = str(payload.get("id") or args.policy_id or "").strip()
        updates = {k: ("" if v is None else str(v)) for k, v in payload.items()
                   if k in EDITABLE_POLICY_FIELDS}
    else:
        policy_id = (args.policy_id or "").strip()
        updates = {}
        for fname in EDITABLE_POLICY_FIELDS:
            value = getattr(args, fname, None)
            if value is not None:
                updates[fname] = str(value)

    if not policy_id:
        raise RelationshipOSError("update-policy requires --id.")
    if not updates:
        raise RelationshipOSError("No updatable fields given.")

    if "status" in updates and updates["status"] not in VALID_POLICY_STATUSES:
        raise RelationshipOSError(
            f"status must be one of {sorted(VALID_POLICY_STATUSES)}; got {updates['status']!r}."
        )
    for date_field in POLICY_DATE_FIELDS:
        if updates.get(date_field):
            parse_iso_date_strict(updates[date_field], date_field)

    rows = store.read(POLICIES)
    target = next((r for r in rows if r.get("id") == policy_id), None)
    if target is None:
        raise RelationshipOSError(f"No policy with id {policy_id!r}.")

    diff: Dict[str, Dict[str, str]] = {}
    for field_name, new_value in updates.items():
        old = target.get(field_name) or ""
        if old == new_value:
            continue
        target[field_name] = new_value
        diff[field_name] = {"from": old, "to": new_value}

    if not diff:
        return {
            "ok": True,
            "command": "update-policy",
            "policy_id": policy_id,
            "diff": {},
            "message": "No changes — all proposed values matched the existing ones.",
        }

    target["updated_at"] = now_iso()
    store.replace(POLICIES, rows)
    log_event(
        store,
        "policy_updated",
        contact_id=target.get("contact_id") or "",
        subject_id=policy_id,
        payload={"diff": diff, "field_count": len(diff)},
        source="update-policy",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "update-policy",
        "policy_id": policy_id,
        "policy": target,
        "diff": diff,
        "synced_views": synced,
        "message": f"Updated {len(diff)} field(s) on policy {policy_id}.",
    }


def cmd_list_policies(args: argparse.Namespace) -> Dict[str, object]:
    """List policies for a contact (default: active only; --include-archived for all)."""
    store = get_store()
    store.ensure()
    contact_id = (args.contact_id or "").strip()
    contact_name = (args.contact_name or "").strip()
    contact = _resolve_contact_for_policy(store, contact_id, contact_name)
    rows = policies_for_contact(store, contact["id"], include_archived=bool(args.include_archived))
    return {
        "ok": True,
        "command": "list-policies",
        "contact_id": contact["id"],
        "contact_name": contact.get("name") or "",
        "count": len(rows),
        "policies": rows,
    }


def cmd_archive_policy(args: argparse.Namespace) -> Dict[str, object]:
    """Soft-delete a policy by setting status to archived."""
    store = get_store()
    store.ensure()
    policy_id = (args.policy_id or "").strip()
    if not policy_id:
        raise RelationshipOSError("archive-policy requires --id.")
    rows = store.read(POLICIES)
    target = next((r for r in rows if r.get("id") == policy_id), None)
    if target is None:
        raise RelationshipOSError(f"No policy with id {policy_id!r}.")
    if (target.get("status") or "active") == "archived":
        return {
            "ok": True,
            "command": "archive-policy",
            "policy_id": policy_id,
            "message": "Policy was already archived.",
        }
    previous_status = target.get("status") or "active"
    target["status"] = "archived"
    target["updated_at"] = now_iso()
    store.replace(POLICIES, rows)
    log_event(
        store,
        "policy_archived",
        contact_id=target.get("contact_id") or "",
        subject_id=policy_id,
        payload={"previous_status": previous_status},
        source="archive-policy",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "archive-policy",
        "policy_id": policy_id,
        "previous_status": previous_status,
        "synced_views": synced,
        "message": f"Archived policy {policy_id}.",
    }


def cmd_archive_contact(args: argparse.Namespace) -> Dict[str, object]:
    """Soft-delete a contact: set archived_at, keep all linked data.

    Used for legacy/ambiguous records (e.g. a first-name-only "Hayden" once
    the consultant has resolved into "Hayden Foo" + "Hayden Wang"). The row
    survives so historical touchpoints, reminders and the audit trail are
    intact, but it's hidden from default app lists.
    """
    store = get_store()
    store.ensure()
    contact_id = (args.contact_id or "").strip()
    contact_name = (args.name or "").strip()
    if contact_id:
        contact = find_contact_by_id(store, contact_id)
        if not contact:
            raise RelationshipOSError(f"No contact with id {contact_id!r}.")
    elif contact_name:
        contact = find_contact(store, contact_name)
        if not contact:
            raise RelationshipOSError(f"No contact found for {contact_name!r}.")
        contact_id = contact["id"]
    else:
        raise RelationshipOSError("archive-contact requires --id or --name.")

    rows = store.read(CONTACTS)
    target = next((r for r in rows if r.get("id") == contact_id), None)
    if target is None:
        raise RelationshipOSError(f"Contact {contact_id!r} disappeared mid-archive.")
    if (target.get("archived_at") or "").strip():
        return {
            "ok": True,
            "command": "archive-contact",
            "contact_id": contact_id,
            "contact_name": target.get("name") or "",
            "message": f"{target.get('name')} was already archived.",
        }
    timestamp = now_iso()
    target["archived_at"] = timestamp
    target["updated_at"] = timestamp
    store.replace(CONTACTS, rows)
    log_event(
        store,
        "contact_archived",
        contact_id=contact_id,
        subject_id=contact_id,
        payload={"archived_at": timestamp},
        source="archive-contact",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "archive-contact",
        "contact_id": contact_id,
        "contact_name": target.get("name") or "",
        "archived_at": timestamp,
        "synced_views": synced,
        "message": f"Archived {target.get('name')}.",
    }


def cmd_unarchive_contact(args: argparse.Namespace) -> Dict[str, object]:
    """Reverse archive-contact: clear archived_at so the contact reappears."""
    store = get_store()
    store.ensure()
    contact_id = (args.contact_id or "").strip()
    contact_name = (args.name or "").strip()
    if contact_id:
        contact = find_contact_by_id(store, contact_id)
    elif contact_name:
        contact = find_contact(store, contact_name)
        if contact:
            contact_id = contact["id"]
    else:
        raise RelationshipOSError("unarchive-contact requires --id or --name.")
    if not contact:
        raise RelationshipOSError("Contact not found.")

    rows = store.read(CONTACTS)
    target = next((r for r in rows if r.get("id") == contact_id), None)
    if target is None or not (target.get("archived_at") or "").strip():
        return {
            "ok": True,
            "command": "unarchive-contact",
            "contact_id": contact_id,
            "contact_name": (target or {}).get("name", ""),
            "message": "Contact is not archived.",
        }
    previous = target.get("archived_at")
    target["archived_at"] = ""
    target["updated_at"] = now_iso()
    store.replace(CONTACTS, rows)
    log_event(
        store,
        "contact_unarchived",
        contact_id=contact_id,
        subject_id=contact_id,
        payload={"previous_archived_at": previous},
        source="unarchive-contact",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "unarchive-contact",
        "contact_id": contact_id,
        "contact_name": target.get("name") or "",
        "synced_views": synced,
        "message": f"Unarchived {target.get('name')}.",
    }


def cmd_rename_contact(args: argparse.Namespace) -> Dict[str, object]:
    """Rename a contact and cascade contact_name to touchpoints + reminders.

    Used when the consultant clarifies a first-name-only record ("the
    Hayden I added yesterday is actually Hayden Foo"). The contact_id stays
    the same; everywhere `contact_name` is denormalized gets updated in
    lockstep.
    """
    store = get_store()
    store.ensure()
    contact_id = (args.contact_id or "").strip()
    new_name = (args.new_name or "").strip()
    if not contact_id:
        raise RelationshipOSError("rename-contact requires --id.")
    if not new_name:
        raise RelationshipOSError("rename-contact requires --new-name.")

    rows = store.read(CONTACTS)
    target = next((r for r in rows if r.get("id") == contact_id), None)
    if target is None:
        raise RelationshipOSError(f"No contact with id {contact_id!r}.")
    old_name = target.get("name") or ""
    if old_name == new_name:
        return {
            "ok": True,
            "command": "rename-contact",
            "contact_id": contact_id,
            "contact_name": new_name,
            "message": "Name is already that value.",
        }

    # Refuse if the new name collides with an existing different contact —
    # the user should explicitly merge in that case.
    for r in rows:
        if r.get("id") == contact_id:
            continue
        if (r.get("name") or "").casefold() == new_name.casefold():
            raise RelationshipOSError(
                f"Another contact already exists with the name {new_name!r} "
                f"(id {r.get('id')}). Use merge-contacts if you want to combine them."
            )

    target["name"] = new_name
    target["updated_at"] = now_iso()
    store.replace(CONTACTS, rows)

    touchpoints_updated = 0
    touchpoint_rows = store.read(TOUCHPOINTS)
    for row in touchpoint_rows:
        if row.get("contact_id") == contact_id:
            row["contact_name"] = new_name
            touchpoints_updated += 1
    if touchpoints_updated:
        store.replace(TOUCHPOINTS, touchpoint_rows)

    reminders_updated = 0
    reminder_rows = store.read(REMINDERS)
    for row in reminder_rows:
        if row.get("contact_id") == contact_id:
            row["contact_name"] = new_name
            reminders_updated += 1
    if reminders_updated:
        store.replace(REMINDERS, reminder_rows)

    log_event(
        store,
        "contact_renamed",
        contact_id=contact_id,
        subject_id=contact_id,
        payload={
            "from": old_name,
            "to": new_name,
            "touchpoints_updated": touchpoints_updated,
            "reminders_updated": reminders_updated,
        },
        source="rename-contact",
    )
    synced = sync_consultant_views(store)
    return {
        "ok": True,
        "command": "rename-contact",
        "contact_id": contact_id,
        "from": old_name,
        "to": new_name,
        "touchpoints_updated": touchpoints_updated,
        "reminders_updated": reminders_updated,
        "synced_views": synced,
        "message": f"Renamed {old_name!r} to {new_name!r}.",
    }


def cmd_demo(args: argparse.Namespace) -> Dict[str, object]:
    """Seed three structured demo touchpoints. No NLP — these are hand-built
    payloads identical to what Hermes would produce from the equivalent
    Telegram messages."""
    if args.reset:
        cmd_init(argparse.Namespace(reset=True))
    else:
        cmd_init(argparse.Namespace(reset=False))
    store = get_store()
    base = today_in_settings(store)
    # "Next Friday" in natural English = the Friday of the following calendar
    # week. Compute days to this week's Friday, then add seven.
    days_to_this_friday = (4 - base.weekday()) % 7
    next_friday = base + timedelta(days=days_to_this_friday + 7)
    next_week = base + timedelta(days=7)
    tomorrow = base + timedelta(days=1)

    samples = [
        TouchpointInput(
            contact_name="Demo Client",
            touch_date=base,
            touchpoint_type="coffee",
            sentiment="positive",
            summary="Coffee with Demo Client. Interested in retirement planning.",
            raw_input="Had coffee with Demo Client today. He is interested in retirement planning. Follow up next Friday.",
            topics=["retirement"],
            action_items="Follow up next Friday on retirement planning interest.",
            contact_type="prospect",
            relationship_stage="warm",
            reminder_due=next_friday,
            reminder_priority="medium",
            reminder_context="Follow up on retirement planning interest.",
        ),
        TouchpointInput(
            contact_name="Sarah Lim",
            touch_date=base,
            touchpoint_type="lunch",
            sentiment="positive",
            summary="Lunch with Sarah Lim. Cautious but interested in protection planning.",
            raw_input="Met Sarah Lim for lunch. She is cautious but interested in protection planning. Follow up next week.",
            topics=["protection"],
            action_items="Follow up next week on protection planning.",
            contact_type="prospect",
            relationship_stage="warm",
            reminder_due=next_week,
            reminder_priority="medium",
            reminder_context="Follow up next week on protection planning.",
        ),
        TouchpointInput(
            contact_name="Jason Wong",
            touch_date=base,
            touchpoint_type="call",
            sentiment="negative",
            summary="Weekly coaching call with Jason Wong. Five meetings, zero close again.",
            raw_input="Called Jason Wong for weekly coaching. 5 meetings zero close again. Prepare closing roleplay tomorrow.",
            topics=["coaching"],
            action_items="Prepare closing roleplay for tomorrow's session.",
            contact_type="advisor",
            relationship_stage="warming",
            reminder_due=tomorrow,
            reminder_priority="medium",
            reminder_context="Prepare closing roleplay for tomorrow's session.",
        ),
    ]
    results = [log_touchpoint(store, sample) for sample in samples]
    return {"ok": True, "logged": len(results), "results": results}


def render_text(payload: Dict[str, object]) -> str:
    if not payload.get("ok"):
        return str(payload)
    # `today-brief` pre-formats a Telegram-ready text block — use it directly
    # so cron callers don't need to parse JSON.
    if "brief_text" in payload:
        return str(payload["brief_text"])
    if "message" in payload:
        lines = [str(payload["message"])]
        files = payload.get("files") or []
        if files:
            lines.append("Outputs:")
            for path in files:  # type: ignore[assignment]
                lines.append(f"- {path}")
        return "\n".join(lines)
    if "counts" in payload:
        counts = payload["counts"]
        lines = [f"Relationship OS store: {payload['store']} at {payload['location']}"]
        if payload.get("deprecated_store"):
            lines.append(f"DEPRECATED: {payload['deprecated_store']}")
        views = payload.get("consultant_views") or []
        if views:
            lines.append("Consultant views: " + ", ".join(views))  # type: ignore[arg-type]
        lines.append(f"Rows: {counts}")
        return "\n".join(lines)
    if "due" in payload:
        lines = [f"Today: {payload['date']}"]
        due = payload.get("due") or []
        if due:
            lines.append("Due now:")
            for item in due:  # type: ignore[assignment]
                lines.append(
                    f"- {item['contact_name']} ({item['priority']}): {item['context']} due {item['due_date']}"
                )
        else:
            lines.append("No due reminders.")
        attention = payload.get("needs_attention") or []
        if attention:
            lines.append("Needs attention: " + ", ".join(attention))  # type: ignore[arg-type]
        return "\n".join(lines)
    if "contact" in payload and "suggested_questions" in payload:
        contact = payload["contact"]  # type: ignore[assignment]
        lines = [
            f"Prep: {contact['name']} ({contact['type']}, {contact['stage']})",
            f"Last touch: {contact.get('last_touch_date') or 'none'}",
            f"Topics: {contact.get('topics') or 'none'}",
        ]
        # Profile fields the consultant may want at glance during prep.
        # Only render lines that have content — avoid empty noise.
        profile_bits = [
            ("Occupation", contact.get("occupation")),
            ("Company", contact.get("company")),
            ("Birthday", contact.get("birthday")),
            ("Next review", contact.get("next_review_date")),
            ("Referral source", contact.get("referral_source")),
        ]
        for label, value in profile_bits:
            if value:
                lines.append(f"{label}: {value}")
        long_form_bits = [
            ("Family", contact.get("family")),
            ("Interests", contact.get("interests")),
            ("Financial concerns", contact.get("financial_concerns")),
            ("Notes", contact.get("notes")),
        ]
        for label, value in long_form_bits:
            if value:
                # Indent multi-line values for readability.
                first, *rest = str(value).splitlines() or [""]
                lines.append(f"{label}: {first}")
                for extra in rest:
                    lines.append(f"  {extra}")
        policies = payload.get("policies") or []
        if policies:
            lines.append("Policies:")
            for policy in policies:  # type: ignore[assignment]
                insurer = policy.get("insurer") or "(unknown insurer)"
                plan = policy.get("plan_name") or "(unnamed plan)"
                detail_bits = []
                if policy.get("premium_amount"):
                    freq = policy.get("premium_frequency") or "?"
                    detail_bits.append(f"premium {policy['premium_amount']}/{freq}")
                if policy.get("sum_assured"):
                    detail_bits.append(f"sum {policy['sum_assured']}")
                if policy.get("current_value"):
                    value = policy["current_value"]
                    if policy.get("valuation_date"):
                        value = f"{value} as of {policy['valuation_date']}"
                    detail_bits.append(f"value {value}")
                if policy.get("policy_owner"):
                    detail_bits.append(f"owner {policy['policy_owner']}")
                if policy.get("life_assured"):
                    detail_bits.append(f"life assured {policy['life_assured']}")
                if policy.get("status") and policy.get("status") != "active":
                    detail_bits.append(f"status {policy['status']}")
                detail = " (" + "; ".join(detail_bits) + ")" if detail_bits else ""
                lines.append(f"- {plan} · {insurer}{detail}")
        reminders = payload.get("pending_reminders") or []
        if reminders:
            lines.append("Pending reminders:")
            for reminder in reminders:  # type: ignore[assignment]
                lines.append(f"- {reminder.get('due_date')}: {reminder.get('context')}")
        lines.append("Questions:")
        for question in payload["suggested_questions"]:  # type: ignore[index]
            lines.append(f"- {question}")
        return "\n".join(lines)
    return json.dumps(payload, indent=2)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Relationship OS v0 helper")
    parser.add_argument("--env", default=".env", help="Path to dotenv file")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    sub = parser.add_subparsers(dest="command", required=True)

    init_p = sub.add_parser("init", help="Create tabs/headers")
    init_p.add_argument("--reset", action="store_true", help="Reset the local SQLite or CSV store before init")
    init_p.set_defaults(func=cmd_init)

    status_p = sub.add_parser("status", help="Show store status")
    status_p.set_defaults(func=cmd_status)

    log_p = sub.add_parser(
        "log-touchpoint",
        aliases=["log_touchpoint"],
        help="Log a structured touchpoint. Hermes calls this with extracted fields; "
        "humans can use the individual flags from the terminal.",
    )
    log_p.add_argument("--json", help="JSON payload, or '-' to read JSON from stdin")
    log_p.add_argument("--json-file", help="Path to a JSON file containing the payload")
    log_p.add_argument("--contact-name", help="Contact's full name")
    log_p.add_argument("--touch-date", help="Touchpoint date (ISO YYYY-MM-DD); defaults to today")
    log_p.add_argument(
        "--touchpoint-type",
        help="One of: meeting, call, coffee, lunch, event, message, referral, other",
    )
    log_p.add_argument(
        "--sentiment",
        help="One of: positive, neutral, negative, mixed",
    )
    log_p.add_argument("--summary", help="One- to three-sentence summary of the interaction")
    log_p.add_argument("--raw-input", help="Original consultant message; defaults to --summary")
    log_p.add_argument("--topics", help="Comma-separated topics, e.g. 'retirement,insurance'")
    log_p.add_argument("--action-items", help="Action items mentioned in the interaction")
    log_p.add_argument(
        "--contact-type",
        help="One of: client, prospect, candidate, advisor, other",
    )
    log_p.add_argument(
        "--relationship-stage",
        help="One of: cold, warming, warm, hot, client, inactive",
    )
    log_p.add_argument("--reminder-due", help="Reminder due date (ISO YYYY-MM-DD); omit for no reminder")
    log_p.add_argument("--reminder-priority", help="One of: high, medium, low")
    log_p.add_argument("--reminder-context", help="What the reminder is for")
    log_p.add_argument(
        "--reminder-type",
        help="One of: follow_up (default), review, birthday, anniversary, renewal, nomination, claims, custom",
    )
    log_p.add_argument(
        "--completes-reminder-ids",
        help="Comma-separated reminder IDs this touchpoint closes (atomic write)",
    )
    log_p.add_argument(
        "--allow-duplicate-reminder",
        action="store_true",
        help="Override duplicate-reminder dedup and force-create a near-duplicate.",
    )
    log_p.set_defaults(func=cmd_log_touchpoint)

    today_p = sub.add_parser("today", help="Show due reminders and attention list")
    today_p.set_defaults(func=cmd_today)

    today_brief_p = sub.add_parser(
        "today-brief",
        help="Morning brief composite: reminders due, birthdays today, ripe signals, debt. "
             "Used by the 9am Telegram cron job. Use --format=text for Telegram-ready output.",
    )
    today_brief_p.set_defaults(func=cmd_today_brief)

    queue_clar_p = sub.add_parser(
        "queue-clarification",
        help="Park an item Hermes wasn't confident enough to log (bulk-import escape hatch).",
    )
    queue_clar_p.add_argument("--json", help="Inline JSON payload. Use '-' for stdin.")
    queue_clar_p.add_argument("--json-file", help="Path to JSON payload.")
    queue_clar_p.set_defaults(func=cmd_queue_clarification)

    list_clar_p = sub.add_parser(
        "list-clarifications",
        help="List clarifications (default: pending only).",
    )
    list_clar_p.add_argument(
        "--status",
        default="pending",
        help="pending (default), resolved, abandoned, or any.",
    )
    list_clar_p.add_argument("--limit", type=int, default=100)
    list_clar_p.set_defaults(func=cmd_list_clarifications)

    resolve_clar_p = sub.add_parser(
        "resolve-clarification",
        help="Resolve a queued clarification: log_anyway / log_corrected / discard.",
    )
    resolve_clar_p.add_argument("--id", dest="clarification_id", required=True)
    resolve_clar_p.add_argument(
        "--resolution",
        required=True,
        help="log_anyway / log_corrected / discard",
    )
    resolve_clar_p.add_argument("--json", help="Corrected touchpoint payload (log_corrected only). '-' for stdin.")
    resolve_clar_p.add_argument("--json-file", help="Path to corrected touchpoint payload (log_corrected only).")
    resolve_clar_p.add_argument(
        "--event-source",
        dest="event_source",
        default=None,
        help="Override the source label for the clarification_resolved event (default: app:resolve-clarification).",
    )
    resolve_clar_p.set_defaults(func=cmd_resolve_clarification)

    prep_p = sub.add_parser("prep", help="Prepare for a contact")
    prep_p.add_argument("--name", required=True)
    prep_p.set_defaults(func=cmd_prep)

    export_p = sub.add_parser("export-md", aliases=["export-markdown", "markdown-export"], help="Export store tabs to an Obsidian-style Markdown vault")
    export_p.add_argument("--output-dir", help="Vault output directory; defaults to RELATIONSHIP_OS_VAULT_DIR or Settings.vault_dir")
    export_p.add_argument("--dry-run", action="store_true", help="Preview output paths without writing files")
    export_p.set_defaults(func=cmd_export_markdown)

    appointment_p = sub.add_parser(
        "appointment-summary",
        aliases=["appointment_summary"],
        help="Generate a one-page appointment summary draft",
    )
    appointment_p.add_argument("tokens", nargs="*", help="Contact name tokens, optionally followed by YYYY-MM-DD")
    appointment_p.add_argument("--name", help="Contact name")
    appointment_p.add_argument("--date", help="Optional touchpoint date YYYY-MM-DD")
    appointment_p.add_argument("--output-dir", help="Vault output directory")
    appointment_p.add_argument("--dry-run", action="store_true", help="Preview output paths without writing files")
    appointment_p.set_defaults(func=cmd_appointment_summary)

    proposal_p = sub.add_parser("proposal", help="Generate a proposal draft")
    proposal_p.add_argument("tokens", nargs="*", help="Contact name followed by proposal topic")
    proposal_p.add_argument("--name", help="Contact name")
    proposal_p.add_argument("--topic", help="Proposal topic")
    proposal_p.add_argument("--output-dir", help="Vault output directory")
    proposal_p.add_argument("--dry-run", action="store_true", help="Preview output paths without writing files")
    proposal_p.set_defaults(func=cmd_proposal)

    slides_p = sub.add_parser(
        "slides",
        help=(
            "Generate a draft PPT deck. Use the positional 'Contact Purpose' "
            "form for a default deck, or pass --json / --json-file with a "
            "section list for richer content (see SOUL.md Deck Composition)."
        ),
    )
    slides_p.add_argument("tokens", nargs="*", help="Contact name followed by deck purpose (positional form)")
    slides_p.add_argument("--name", help="Contact name (positional form)")
    slides_p.add_argument("--purpose", help="Deck purpose (positional form)")
    slides_p.add_argument("--json", help="JSON deck payload, or '-' to read from stdin")
    slides_p.add_argument("--json-file", help="Path to a JSON file containing the deck payload")
    slides_p.add_argument("--output-dir", help="Vault output directory")
    slides_p.add_argument("--dry-run", action="store_true", help="Preview output paths without writing files")
    slides_p.set_defaults(func=cmd_slides)

    writeup_p = sub.add_parser("writeup", help="Generate a structured Markdown writeup")
    writeup_p.add_argument("tokens", nargs="*", help="Writeup topic")
    writeup_p.add_argument("--topic", help="Writeup topic")
    writeup_p.add_argument("--output-dir", help="Vault output directory")
    writeup_p.add_argument("--dry-run", action="store_true", help="Preview output paths without writing files")
    writeup_p.set_defaults(func=cmd_writeup)

    # Reminder lifecycle. Each command accepts either --reminder-id directly,
    # or --contact-name (+ optional --context-match) to disambiguate. JSON
    # payloads work too, matching the log-touchpoint pattern.
    for name, func, help_text in (
        ("complete-reminder", cmd_complete_reminder, "Mark a reminder as done"),
        ("cancel-reminder", cmd_cancel_reminder, "Cancel a pending reminder"),
    ):
        rem_p = sub.add_parser(name, help=help_text)
        rem_p.add_argument("--json", help="JSON payload, or '-' to read JSON from stdin")
        rem_p.add_argument("--json-file", help="Path to a JSON file containing the payload")
        rem_p.add_argument("--reminder-id", help="Reminder ID (preferred when known)")
        rem_p.add_argument("--contact-name", help="Contact name (used to disambiguate)")
        rem_p.add_argument("--context-match", help="Substring to match within reminder context")
        rem_p.set_defaults(func=func)

    snooze_p = sub.add_parser("snooze-reminder", help="Snooze a pending reminder to a new date")
    snooze_p.add_argument("--json", help="JSON payload, or '-' to read JSON from stdin")
    snooze_p.add_argument("--json-file", help="Path to a JSON file containing the payload")
    snooze_p.add_argument("--reminder-id", help="Reminder ID (preferred when known)")
    snooze_p.add_argument("--contact-name", help="Contact name (used to disambiguate)")
    snooze_p.add_argument("--context-match", help="Substring to match within reminder context")
    snooze_p.add_argument("--new-due-date", help="New due date (ISO YYYY-MM-DD)")
    snooze_p.set_defaults(func=cmd_snooze_reminder)

    events_p = sub.add_parser("events", help="Query the audit / events log")
    events_p.add_argument("--contact-id", help="Filter by contact ID")
    events_p.add_argument("--kind", help="Filter by event kind")
    events_p.add_argument("--since", help="Only events on or after this date (ISO YYYY-MM-DD)")
    events_p.add_argument("--limit", type=int, default=50, help="Max events to return (default 50)")
    events_p.set_defaults(func=cmd_events)

    # Merge a duplicate contact into the canonical one. Touchpoints and
    # reminders move atomically; consultant-managed fields merge with a
    # prefer-into-keep-from-in-notes strategy; an audit event captures the diff.
    merge_p = sub.add_parser(
        "merge-contacts",
        help="Merge one contact into another (moves touchpoints + reminders, merges fields).",
    )
    merge_p.add_argument("--from", dest="from_id", required=True, help="Contact ID to merge from (will be deleted).")
    merge_p.add_argument("--into", dest="into_id", required=True, help="Contact ID to merge into (survives).")
    merge_p.set_defaults(func=cmd_merge_contacts)

    # Fuzzy reminder search — Hermes calls this when the consultant references
    # a reminder without a contact or ID ("marked the SRS thing done").
    find_rem_p = sub.add_parser(
        "find-reminders",
        help="Search reminders by free-text query (matches context, type, contact name).",
    )
    find_rem_p.add_argument("--query", help="Substring to match (case-insensitive).")
    find_rem_p.add_argument("--status", default="pending", help="pending (default), done, snoozed, cancelled, or any.")
    find_rem_p.add_argument("--limit", type=int, default=10, help="Max candidates to return.")
    find_rem_p.set_defaults(func=cmd_find_reminders)

    # Hermes-facing contact field updates. Append-by-default for free-text
    # fields; replace-by-default for atomic facts. See SOUL.md.
    update_c_p = sub.add_parser(
        "update-contact",
        help="Update consultant-managed contact fields (append-default for free-text).",
    )
    update_c_p.add_argument("--json", help="JSON payload, or '-' to read JSON from stdin")
    update_c_p.add_argument("--json-file", help="Path to a JSON file containing the payload")
    update_c_p.add_argument("--id", dest="contact_id", help="Contact ID (preferred).")
    update_c_p.add_argument("--name", help="Contact name (alternative to --id).")
    update_c_p.add_argument("--field", help="Field to update (single-field form).")
    update_c_p.add_argument("--value", help="New value (single-field form).")
    update_c_p.add_argument(
        "--replace",
        action="store_true",
        help="Force overwrite for free-text fields (default: append with date prefix).",
    )
    update_c_p.set_defaults(func=cmd_update_contact)

    update_s_p = sub.add_parser(
        "update-setting",
        help="Update a whitelisted local kit setting.",
    )
    update_s_p.add_argument("--key", required=True, help="Setting key.")
    update_s_p.add_argument("--value", required=True, help="Setting value.")
    update_s_p.set_defaults(func=cmd_update_setting)

    # Policy management. add/update/list/archive. Policies are structured
    # records per contact: insurer, plan_name, premium, sum_assured, dates.
    add_pol_p = sub.add_parser(
        "add-policy",
        help="Add a structured policy record for a contact.",
    )
    add_pol_p.add_argument("--json", help="JSON payload, or '-' to read JSON from stdin")
    add_pol_p.add_argument("--json-file", help="Path to a JSON file containing the payload")
    add_pol_p.add_argument("--contact-id", help="Contact ID (preferred).")
    add_pol_p.add_argument("--contact-name", help="Contact name (alternative).")
    add_pol_p.add_argument("--insurer", help="Insurer name (required).")
    add_pol_p.add_argument("--plan-name", dest="plan_name", help="Plan name (required).")
    add_pol_p.add_argument("--policy-type", dest="policy_type", help="protection / savings / investment-linked / ci / other.")
    add_pol_p.add_argument("--policy-number", dest="policy_number", help="Policy number / contract number.")
    add_pol_p.add_argument("--sum-assured", dest="sum_assured", help="Free-form sum assured (e.g. 'S$500,000').")
    add_pol_p.add_argument("--premium-amount", dest="premium_amount", help="Free-form premium amount (e.g. '$2,050').")
    add_pol_p.add_argument("--premium-frequency", dest="premium_frequency", help="annual / monthly / single-pay.")
    add_pol_p.add_argument("--premium-term", dest="premium_term", help="Premium-paying term (e.g. '20 years', 'to age 65').")
    add_pol_p.add_argument("--policy-term", dest="policy_term", help="Policy coverage term (e.g. 'whole life', '30 years').")
    add_pol_p.add_argument("--payment-method", dest="payment_method", help="Payment method (e.g. GIRO, CPF OA, credit card).")
    add_pol_p.add_argument("--start-date", dest="start_date", help="Policy start date (ISO YYYY-MM-DD).")
    add_pol_p.add_argument("--review-date", dest="review_date", help="Next review date (ISO YYYY-MM-DD).")
    add_pol_p.add_argument("--review-frequency", dest="review_frequency", help="Review cadence (e.g. annual, semi-annual).")
    add_pol_p.add_argument("--last-reviewed", dest="last_reviewed", help="Last reviewed date (ISO YYYY-MM-DD).")
    add_pol_p.add_argument("--current-value", dest="current_value", help="Current account / investment value.")
    add_pol_p.add_argument("--valuation-date", dest="valuation_date", help="Date current value was observed (ISO YYYY-MM-DD).")
    add_pol_p.add_argument("--surrender-value", dest="surrender_value", help="Current surrender value, if known.")
    add_pol_p.add_argument("--policy-owner", dest="policy_owner", help="Policy owner.")
    add_pol_p.add_argument("--life-assured", dest="life_assured", help="Life assured / insured person.")
    add_pol_p.add_argument("--payor", help="Premium payor.")
    add_pol_p.add_argument("--beneficiaries", help="Named beneficiaries / nomination notes.")
    add_pol_p.add_argument("--riders", help="Attached riders.")
    add_pol_p.add_argument("--servicing-rep", dest="servicing_rep", help="Servicing representative / adviser.")
    add_pol_p.add_argument("--needs-category", dest="needs_category", help="Need served (e.g. protection, retirement, education).")
    add_pol_p.add_argument("--status", help="active (default) / lapsed / surrendered / claimed / archived.")
    add_pol_p.add_argument("--notes", help="Free-text notes on this policy.")
    add_pol_p.set_defaults(func=cmd_add_policy)

    update_pol_p = sub.add_parser(
        "update-policy",
        help="Update fields on an existing policy by id.",
    )
    update_pol_p.add_argument("--json", help="JSON payload, or '-' to read JSON from stdin")
    update_pol_p.add_argument("--json-file", help="Path to a JSON file containing the payload")
    update_pol_p.add_argument("--id", dest="policy_id", help="Policy ID (required).")
    update_pol_p.add_argument("--insurer")
    update_pol_p.add_argument("--plan-name", dest="plan_name")
    update_pol_p.add_argument("--policy-type", dest="policy_type")
    update_pol_p.add_argument("--policy-number", dest="policy_number")
    update_pol_p.add_argument("--sum-assured", dest="sum_assured")
    update_pol_p.add_argument("--premium-amount", dest="premium_amount")
    update_pol_p.add_argument("--premium-frequency", dest="premium_frequency")
    update_pol_p.add_argument("--premium-term", dest="premium_term")
    update_pol_p.add_argument("--policy-term", dest="policy_term")
    update_pol_p.add_argument("--payment-method", dest="payment_method")
    update_pol_p.add_argument("--start-date", dest="start_date")
    update_pol_p.add_argument("--review-date", dest="review_date")
    update_pol_p.add_argument("--review-frequency", dest="review_frequency")
    update_pol_p.add_argument("--last-reviewed", dest="last_reviewed")
    update_pol_p.add_argument("--current-value", dest="current_value")
    update_pol_p.add_argument("--valuation-date", dest="valuation_date")
    update_pol_p.add_argument("--surrender-value", dest="surrender_value")
    update_pol_p.add_argument("--policy-owner", dest="policy_owner")
    update_pol_p.add_argument("--life-assured", dest="life_assured")
    update_pol_p.add_argument("--payor")
    update_pol_p.add_argument("--beneficiaries")
    update_pol_p.add_argument("--riders")
    update_pol_p.add_argument("--servicing-rep", dest="servicing_rep")
    update_pol_p.add_argument("--needs-category", dest="needs_category")
    update_pol_p.add_argument("--status")
    update_pol_p.add_argument("--notes")
    update_pol_p.set_defaults(func=cmd_update_policy)

    list_pol_p = sub.add_parser(
        "list-policies",
        help="List policies for a contact.",
    )
    list_pol_p.add_argument("--contact-id", help="Contact ID (preferred).")
    list_pol_p.add_argument("--contact-name", help="Contact name (alternative).")
    list_pol_p.add_argument(
        "--include-archived",
        action="store_true",
        help="Include archived policies in the result.",
    )
    list_pol_p.set_defaults(func=cmd_list_policies)

    archive_pol_p = sub.add_parser(
        "archive-policy",
        help="Soft-delete a policy (sets status=archived).",
    )
    archive_pol_p.add_argument("--id", dest="policy_id", required=True, help="Policy ID.")
    archive_pol_p.set_defaults(func=cmd_archive_policy)

    # Contact maintenance: archive (soft-delete), unarchive, rename.
    archive_c_p = sub.add_parser(
        "archive-contact",
        help="Soft-delete a contact (sets archived_at). Hidden from default app lists.",
    )
    archive_c_p.add_argument("--id", dest="contact_id", help="Contact ID (preferred).")
    archive_c_p.add_argument("--name", help="Contact name (alternative to --id).")
    archive_c_p.set_defaults(func=cmd_archive_contact)

    unarchive_c_p = sub.add_parser(
        "unarchive-contact",
        help="Reverse archive-contact.",
    )
    unarchive_c_p.add_argument("--id", dest="contact_id", help="Contact ID (preferred).")
    unarchive_c_p.add_argument("--name", help="Contact name (alternative to --id).")
    unarchive_c_p.set_defaults(func=cmd_unarchive_contact)

    rename_c_p = sub.add_parser(
        "rename-contact",
        help="Rename a contact + cascade contact_name to touchpoints and reminders.",
    )
    rename_c_p.add_argument("--id", dest="contact_id", required=True, help="Contact ID.")
    rename_c_p.add_argument("--new-name", dest="new_name", required=True, help="New full name.")
    rename_c_p.set_defaults(func=cmd_rename_contact)

    demo_p = sub.add_parser("demo", help="Populate demo data")
    demo_p.add_argument("--reset", action="store_true")
    demo_p.set_defaults(func=cmd_demo)

    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    load_env(Path(args.env).expanduser())
    try:
        payload = args.func(args)
        if args.format == "json":
            print(json.dumps(payload, indent=2))
        else:
            print(render_text(payload))
        return 0
    except RelationshipOSError as exc:
        if args.format == "json":
            print(json.dumps({"ok": False, "error": str(exc)}))
        else:
            print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
