#!/usr/bin/env python3
"""Regenerate branded showcase artifacts and PNG previews."""

from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "relationship_os.py"
SHOWCASE = ROOT / "showcase_examples"
PREVIEWS = SHOWCASE / "previews"
DESIGN = ROOT / "design.md"
ASSETS_DIR = ROOT / "assets"


def load_relationship_os():
    spec = importlib.util.spec_from_file_location("relationship_os", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules["relationship_os"] = module
    spec.loader.exec_module(module)
    return module


def pil_tools():
    from PIL import Image, ImageDraw, ImageFont  # type: ignore

    return Image, ImageDraw, ImageFont


def font(size: int, bold: bool = False, serif: bool = False, mono: bool = False):
    _Image, _ImageDraw, ImageFont = pil_tools()
    candidates = []
    if mono:
        candidates = [
            "/System/Library/Fonts/Menlo.ttc",
            "/System/Library/Fonts/SFNSMono.ttf",
        ]
    elif serif:
        candidates = [
            "/System/Library/Fonts/Supplemental/Georgia.ttf",
            "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        ]
    elif bold:
        candidates = [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
    else:
        candidates = [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def paste_asset(canvas, path: Path | None, box: Tuple[int, int, int, int], opacity: float = 1.0, crop: bool = True) -> None:
    if not path or not path.exists():
        return
    Image, _ImageDraw, _ImageFont = pil_tools()
    image = Image.open(path).convert("RGBA")
    if crop:
        image = image.crop(image.getchannel("A").getbbox() or image.getbbox())
    target_w = max(box[2] - box[0], 1)
    target_h = max(box[3] - box[1], 1)
    image.thumbnail((target_w, target_h))
    if opacity < 1:
        alpha = image.getchannel("A").point(lambda value: int(value * opacity))
        image.putalpha(alpha)
    canvas.paste(image, (box[0], box[1]), image)


def draw_wrapped(draw, text: str, xy: Tuple[int, int], max_width: int, fill: str, font_obj, line_gap: int = 6) -> int:
    words = text.split()
    lines: List[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), trial, font=font_obj)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    x, y = xy
    for line in lines or [""]:
        draw.text((x, y), line, fill=fill, font=font_obj)
        bbox = draw.textbbox((x, y), line, font=font_obj)
        y = bbox[3] + line_gap
    return y


def preview_footer(draw, tokens: Dict[str, str], slide_number: int, total_slides: int, width: int, height: int) -> None:
    rel = load_relationship_os()
    bg = tokens["background"]
    border = tokens["border"]
    draw.rectangle([0, height - 64, width, height], fill=bg)
    draw.rectangle([67, height - 75, width - 67, height - 73], fill=border)
    footer_font = font(13, mono=True)
    footer = tokens.get("brand_footer_attribution", rel.BRAND_FOOTER_ATTRIBUTION)
    draw.text((67, height - 43), footer, fill=tokens["footer"], font=footer_font)
    page = f"{slide_number}/{total_slides}"
    bbox = draw.textbbox((0, 0), page, font=footer_font)
    draw.text((width - 67 - (bbox[2] - bbox[0]), height - 43), page, fill=tokens["footer"], font=footer_font)


def render_slide_previews(rel, sections: Sequence[Tuple[str, List[str]]], tokens: Dict[str, str], output_dir: Path, stem: str) -> List[Path]:
    Image, ImageDraw, _ImageFont = pil_tools()
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: List[Path] = []
    width, height = 1600, 900
    scheme = tokens["scheme"]
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        for index, (title, bullets) in enumerate(sections, start=1):
            if index == 1:
                bg_path = rel.build_ppt_cover_background(tokens, tmp_dir / f"{stem}-cover.png", width, height)
                canvas = Image.open(bg_path).convert("RGB")
                draw = ImageDraw.Draw(canvas, "RGBA")
                if scheme == "awm-dark":
                    draw.rectangle([62, 235, 854, 636], fill=(5, 5, 5, 210))
                paste_asset(canvas, rel.design_asset_path(tokens, "logo_cover"), (67, 50, 245, 108))
                label_fill = tokens.get("accent_text", tokens["accent"])
                draw.text((91, 247), "AWM RELATIONSHIP OS KIT", fill=label_fill, font=font(20, bold=True))
                draw_wrapped(draw, title, (91, 296), 770, tokens["primary"], font(56, serif=True), line_gap=8)
                draw.rectangle([91, 450, 275, 454], fill=tokens["accent"])
                y = 490
                for bullet in bullets[:2]:
                    y = draw_wrapped(draw, bullet, (91, y), 760, tokens.get("text_soft", tokens["text"]), font(24), line_gap=8)
            else:
                canvas = Image.new("RGB", (width, height), rel.hex_to_rgb(tokens["background"]))
                draw = ImageDraw.Draw(canvas, "RGBA")
                paste_asset(canvas, rel.design_asset_path(tokens, "body_background"), (1075, 80, 1545, 470), opacity=0.10 if scheme == "awm-dark" else 0.07)
                paste_asset(canvas, rel.design_asset_path(tokens, "logo_body"), (67, 41, 185, 86))
                draw.text((67, 122), title, fill=tokens["primary"], font=font(44, serif=True))
                draw.rectangle([67, 218, 318, 222], fill=tokens["accent"])
                surface = tokens["surface"]
                border = tokens["border"]
                draw.rectangle([86, 250, 1484, 780], fill=surface, outline=border, width=2)
                y = 293
                body_font = font(26)
                for bullet in bullets[:6]:
                    y = draw_wrapped(draw, f"- {bullet}", (125, y), 1300, tokens["text"], body_font, line_gap=12)
            preview_footer(draw, tokens, index, len(sections), width, height)
            out = output_dir / f"{stem}-slide-{index}.png"
            canvas.save(out)
            paths.append(out)
    return paths


def draw_pdf_text_preview(rel, canvas, title: str, chunk: Sequence[Tuple[str, str]], tokens: Dict[str, str], page_number: int, page_count: int) -> None:
    _Image, ImageDraw, _ImageFont = pil_tools()
    draw = ImageDraw.Draw(canvas, "RGBA")
    scale = canvas.width / 612

    def pt_x(value: float) -> int:
        return int(value * scale)

    def pt_y(value: float, size: int) -> int:
        return int(canvas.height - (value * scale) - size)

    scheme = tokens["scheme"]
    header_x = 176 if scheme == "awm-dark" else 132
    header_y = 752 if scheme == "awm-dark" else 742
    draw.text((pt_x(header_x), pt_y(header_y, 26)), title, fill=tokens["primary"], font=font(26, bold=True))
    y = 660
    for style, line in chunk:
        if style == "space":
            y -= 8
            continue
        if style == "heading":
            y -= 8
            draw.text((pt_x(58), pt_y(y, 24)), line, fill=tokens["primary"], font=font(24, bold=True))
            y -= 18
            continue
        draw.text((pt_x(58), pt_y(y, 21)), line, fill=tokens["text"], font=font(21))
        y -= 13
    footer = tokens.get("brand_footer_attribution", rel.BRAND_FOOTER_ATTRIBUTION)
    draw.text((pt_x(54), pt_y(34, 17)), footer, fill=tokens["footer"], font=font(17, mono=True))
    draw.text((pt_x(532), pt_y(34, 17)), f"{page_number}/{page_count}", fill=tokens["footer"], font=font(17, mono=True))


def render_pdf_previews(rel, title: str, markdown: str, tokens: Dict[str, str], output_dir: Path, stem: str, page_limit: int = 2) -> List[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    chunks = rel.chunk_pdf_items(rel.pdf_line_items(markdown))
    paths: List[Path] = []
    for index, chunk in enumerate(chunks[:page_limit], start=1):
        canvas = rel.build_pdf_background(tokens, index, len(chunks))
        draw_pdf_text_preview(rel, canvas, title, chunk, tokens, index, len(chunks))
        out = output_dir / f"{stem}-page-{index}.png"
        canvas.save(out)
        paths.append(out)
    return paths


def copy_first(paths: Iterable[str], suffix: str, destination: Path) -> None:
    for value in paths:
        path = Path(value)
        if path.suffix == suffix:
            shutil.copy2(path, destination)
            return
    raise RuntimeError(f"No {suffix} output found in {paths!r}")


def regenerate() -> Dict[str, List[Path]]:
    rel = load_relationship_os()
    SHOWCASE.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(PREVIEWS, ignore_errors=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)

    store_dir = SHOWCASE / ".showcase_store"
    shutil.rmtree(store_dir, ignore_errors=True)
    os.environ["RELATIONSHIP_OS_STORE"] = "local"
    os.environ["RELATIONSHIP_OS_LOCAL_DIR"] = str(store_dir)
    os.environ["RELATIONSHIP_OS_VAULT_DIR"] = str(SHOWCASE / "markdown_vault")
    os.environ["RELATIONSHIP_OS_DESIGN_PATH"] = str(DESIGN)
    os.environ.setdefault("RELATIONSHIP_OS_BRAND_ASSETS_DIR", str(ASSETS_DIR))

    rel.cmd_demo(argparse.Namespace(reset=True))
    store = rel.get_store()
    contact = rel.find_contact(store, "Demo Client")
    if not contact:
        raise RuntimeError("Demo Client was not generated.")
    touches = rel.sorted_contact_touchpoints(store, contact["id"])
    reminders = rel.pending_contact_reminders(store, contact["id"])

    markdown_vault = SHOWCASE / "markdown_vault"
    rel.cmd_export_markdown(argparse.Namespace(output_dir=str(markdown_vault), dry_run=False))
    contact_note = markdown_vault / "Contacts" / "demo-client.md"
    shutil.copy2(contact_note, SHOWCASE / "example-contact-demo-client.md")

    generated: Dict[str, List[Path]] = {"artifacts": [], "previews": []}
    generated["artifacts"].append(SHOWCASE / "example-contact-demo-client.md")

    for scheme in ("awm-light", "awm-dark"):
        os.environ["RELATIONSHIP_OS_DESIGN_SCHEME"] = scheme
        tokens = rel.load_design_tokens(DESIGN, scheme)
        label = "light" if scheme == "awm-light" else "dark"
        appointment_dir = SHOWCASE / f"appointment_{label}"
        result = rel.cmd_appointment_summary(
            argparse.Namespace(tokens=["Demo", "Client"], name=None, date=None, output_dir=str(appointment_dir), dry_run=False)
        )
        pdf_dest = SHOWCASE / f"appointment-summary-demo-client-{label}.pdf"
        copy_first(result["files"], ".pdf", pdf_dest)
        if label == "light":
            md_dest = SHOWCASE / "appointment-summary-demo-client.md"
            copy_first(result["files"], ".md", md_dest)
            generated["artifacts"].append(md_dest)
            markdown = md_dest.read_text(encoding="utf-8")
        else:
            markdown = next(Path(path).read_text(encoding="utf-8") for path in result["files"] if str(path).endswith(".md"))
        generated["artifacts"].append(pdf_dest)
        generated["previews"].extend(
            render_pdf_previews(rel, f"Appointment Summary: {contact.get('name')}", markdown, tokens, PREVIEWS, pdf_dest.stem)
        )

        deck_dest = SHOWCASE / f"demo-client-2-slide-awm-{label}.pptx"
        rel.write_slides(deck_dest, contact, "annual review", touches, reminders, tokens, max_slides=2)
        generated["artifacts"].append(deck_dest)
        sections = rel.slide_sections(contact, "annual review", touches, reminders)[:2]
        generated["previews"].extend(render_slide_previews(rel, sections, tokens, PREVIEWS, deck_dest.stem))

    zip_path = SHOWCASE / "relationship-os-showcase-examples.zip"
    package_paths = [
        SHOWCASE / "example-contact-demo-client.md",
        SHOWCASE / "appointment-summary-demo-client.md",
        SHOWCASE / "demo-client-2-slide-awm-light.pptx",
        SHOWCASE / "demo-client-2-slide-awm-dark.pptx",
        SHOWCASE / "appointment-summary-demo-client-light.pdf",
        SHOWCASE / "appointment-summary-demo-client-dark.pdf",
    ]
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for path in package_paths:
            package.write(path, path.relative_to(SHOWCASE))
        for preview in sorted(PREVIEWS.glob("*.png")):
            package.write(preview, preview.relative_to(SHOWCASE))
    generated["artifacts"].append(zip_path)
    shutil.rmtree(store_dir, ignore_errors=True)
    return generated


def main() -> int:
    generated = regenerate()
    print("Generated artifacts:")
    for path in generated["artifacts"]:
        print(f"- {path}")
    print("Generated previews:")
    for path in generated["previews"]:
        print(f"- {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
