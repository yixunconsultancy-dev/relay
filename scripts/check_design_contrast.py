#!/usr/bin/env python3
"""One-shot contrast sanity check for Relationship OS branded outputs."""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple


ROOT = Path(__file__).resolve().parents[1]
RELATIONSHIP_OS = ROOT / "scripts" / "relationship_os.py"


def load_relationship_os():
    spec = importlib.util.spec_from_file_location("relationship_os", RELATIONSHIP_OS)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules["relationship_os"] = module
    spec.loader.exec_module(module)
    return module


def rgb(hex_color: str) -> Tuple[float, float, float]:
    value = hex_color.strip()
    if not value.startswith("#") or len(value) != 7:
        raise ValueError(f"Expected #RRGGBB, got {hex_color!r}")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (1, 3, 5))  # type: ignore[return-value]


def linear(channel: float) -> float:
    if channel <= 0.03928:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    r, g, b = rgb(hex_color)
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)


def contrast_ratio(foreground: str, background: str) -> float:
    fg_lum = luminance(foreground)
    bg_lum = luminance(background)
    lighter = max(fg_lum, bg_lum)
    darker = min(fg_lum, bg_lum)
    return (lighter + 0.05) / (darker + 0.05)


def contrast_rows(tokens_by_scheme: Dict[str, Dict[str, str]]) -> List[Tuple[str, str, str, str, float]]:
    rows: List[Tuple[str, str, str, str, float]] = []
    for scheme, tokens in tokens_by_scheme.items():
        combos = [
            ("cover/title", tokens["primary"], tokens["background"]),
            ("section label", tokens.get("accent_text", tokens["accent"]), tokens["background"]),
            ("body text", tokens["text"], tokens["surface"]),
            ("secondary body", tokens.get("text_soft", tokens["muted"]), tokens["surface"]),
            ("footer attribution", tokens["footer"], tokens["background"]),
        ]
        for style, foreground, background in combos:
            rows.append((scheme, style, foreground, background, contrast_ratio(foreground, background)))
    return rows


def render_table(rows: Iterable[Tuple[str, str, str, str, float]]) -> str:
    lines = [
        "| Scheme | Text style | Foreground | Background | Contrast | Result |",
        "| --- | --- | --- | --- | ---: | --- |",
    ]
    for scheme, style, foreground, background, ratio in rows:
        result = "PASS" if ratio >= 4.5 else "FAIL"
        lines.append(f"| {scheme} | {style} | {foreground} | {background} | {ratio:.2f}:1 | {result} |")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check renderer text style contrast against declared design colors.")
    parser.add_argument("--design", default=str(ROOT / "design.md"), help="Path to design.md")
    parser.add_argument("--min-ratio", type=float, default=4.5, help="Minimum acceptable contrast ratio")
    args = parser.parse_args()

    rel = load_relationship_os()
    design = Path(args.design)
    tokens = {
        "awm-dark": rel.load_design_tokens(design, "awm-dark"),
        "awm-light": rel.load_design_tokens(design, "awm-light"),
    }
    rows = contrast_rows(tokens)
    print(render_table(rows))
    failing = [row for row in rows if row[4] < args.min_ratio]
    if failing:
        print(f"\nFAIL: {len(failing)} contrast combinations are below {args.min_ratio}:1.", file=sys.stderr)
        return 1
    print(f"\nPASS: all checked text/background combinations are >= {args.min_ratio}:1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
