#!/usr/bin/env python3
"""
PDF helpers for the gov.uk ingesters (ingest/sources/nc_govuk.ts, dfe_subject_content.ts,
sta_phonics.ts, sta_mtc_guidance.ts). Output is JSON on stdout.

  python3 govuk_pdf.py blocks  <file.pdf>   structured blocks: headings / paragraphs / bullets
  python3 govuk_pdf.py text    <file.pdf>   plain text per page
  python3 govuk_pdf.py phonics <file.pdf>   large-print words per page with alien-image flags

Uses PyMuPDF (imported as `fitz` for compatibility with older installs).
"""
import json
import re
import sys
import warnings
from collections import Counter

warnings.filterwarnings("ignore")
try:
    import pymupdf as fitz  # type: ignore
except Exception:  # pragma: no cover
    import fitz  # type: ignore

BULLET_RE = re.compile(r"^\s*([•▪●◦‣⁃∙·■□➢–\-o\*])\s+(.*)$")
PAGE_NO_RE = re.compile(r"^(page\s*)?\d{1,3}(\s*of\s*\d{1,3})?$", re.I)


def is_bold(span):
    return bool(span.get("flags", 0) & 16) or "bold" in span.get("font", "").lower() or "black" in span.get("font", "").lower()


def page_lines(page):
    """Lines as dicts: text, size (max span size), bold (all spans bold), x0, y0, y1."""
    out = []
    d = page.get_text("dict")
    for b in d.get("blocks", []):
        if b.get("type") != 0:
            continue
        for ln in b.get("lines", []):
            spans = [s for s in ln.get("spans", []) if s.get("text", "").strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in ln["spans"]).strip()
            text = re.sub(r"\s+", " ", text)
            size = round(max(s["size"] for s in spans), 1)
            bold = all(is_bold(s) for s in spans)
            x0, y0, x1, y1 = ln["bbox"]
            out.append({"text": text, "size": size, "bold": bold, "x0": round(x0, 1), "y0": round(y0, 1), "y1": round(y1, 1)})
    out.sort(key=lambda l: (round(l["y0"] / 2), l["x0"]))
    # join fragments that sit on the same baseline (e.g. a bullet glyph and its text)
    merged = []
    for l in out:
        if merged and abs(merged[-1]["y0"] - l["y0"]) < 2 and l["x0"] > merged[-1]["x0"]:
            m = merged[-1]
            m["text"] = (m["text"] + " " + l["text"]).strip()
            m["size"] = max(m["size"], l["size"])
            m["bold"] = m["bold"] and l["bold"]
            m["y1"] = max(m["y1"], l["y1"])
        else:
            merged.append(dict(l))
    return merged


def running_text(doc):
    """Lines repeated at the same position on most pages (headers/footers) are dropped."""
    counts = Counter()
    for p in doc:
        seen = set()
        for l in page_lines(p):
            key = (re.sub(r"\d+", "#", l["text"]), round(l["y0"] / 5))
            if key not in seen:
                counts[key] += 1
                seen.add(key)
    n = len(doc)
    return {k for k, c in counts.items() if n >= 3 and c >= max(3, n * 0.6)}


def cmd_blocks(path):
    doc = fitz.open(path)
    running = running_text(doc)
    lines = []
    for pi, p in enumerate(doc):
        h = p.rect.height
        for l in page_lines(p):
            if (re.sub(r"\d+", "#", l["text"]), round(l["y0"] / 5)) in running:
                continue
            if PAGE_NO_RE.match(l["text"]) and (l["y0"] > h * 0.9 or l["y1"] < h * 0.1):
                continue
            l["page"] = pi + 1
            lines.append(l)
    sizes = Counter()
    for l in lines:
        sizes[l["size"]] += len(l["text"])
    body = sizes.most_common(1)[0][0] if sizes else 11
    blocks = []
    for l in lines:
        t = l["text"]
        m = BULLET_RE.match(t)
        # "o" and "-" only count as bullets when followed by text, and "-" never inside prose
        if m and m.group(1) in ("o", "-", "*", "–") and not m.group(2)[:1].isalpha():
            m = None
        if l["size"] >= body + 1.0 or (l["bold"] and len(t) < 140 and not m and not re.search(r"[.;:,]$", t)):
            kind = "h"
        elif m:
            kind = "li"
            t = m.group(2)
        else:
            kind = "p"
        prev = blocks[-1] if blocks else None
        new_item = kind == "li" or re.match(r"^(\d{1,3}(\.\d{1,3})*\.?|\([a-z]{1,4}\)|[A-Z]\d{1,2}(\.\d{1,2})?)\s", t)
        if (
            prev
            and prev["page"] == l["page"]
            and not new_item
            and (
                (kind == "p" and prev["type"] in ("p", "li") and l["y0"] - prev["y1"] < l["size"] * 0.9 and abs(l["size"] - prev["size"]) < 0.6)
                or (kind == "h" and prev["type"] == "h" and l["size"] == prev["size"] and l["y0"] - prev["y1"] < l["size"] * 0.6)
            )
        ):
            prev["text"] = (prev["text"] + " " + t).strip()
            prev["y1"] = l["y1"]
            continue
        blocks.append({"type": kind, "text": t, "size": l["size"], "bold": l["bold"], "x0": l["x0"], "page": l["page"], "y1": l["y1"]})
    for b in blocks:
        b.pop("y1", None)
    print(json.dumps({"pages": len(doc), "body_size": body, "blocks": blocks}))


def cmd_text(path):
    doc = fitz.open(path)
    print(json.dumps({"pages": [p.get_text("text") for p in doc]}))


def cmd_phonics(path):
    """Words printed large (pupils' materials) with a flag for an image (the alien) beside them."""
    doc = fitz.open(path)
    pages = []
    for pi, p in enumerate(doc):
        lines = page_lines(p)
        imgs = []
        try:
            for info in p.get_image_info():
                x0, y0, x1, y1 = info["bbox"]
                if (x1 - x0) > 5 and (y1 - y0) > 5:
                    imgs.append((x0, y0, x1, y1))
        except Exception:
            pass
        sizes = [l["size"] for l in lines]
        big = max(sizes) if sizes else 0
        words = []
        for l in lines:
            if l["size"] < 28 or l["size"] < big * 0.6:
                continue
            for w in l["text"].split():
                if not re.fullmatch(r"[a-zA-Z]{1,12}", w):
                    continue
                # the alien sits on the same row as its word: require real vertical overlap
                h = l["y1"] - l["y0"]
                band = (l["y0"] + h * 0.15, l["y1"] - h * 0.15)
                near = any(min(iy1, band[1]) - max(iy0, band[0]) > h * 0.2 for (ix0, iy0, ix1, iy1) in imgs)
                words.append({"word": w, "size": l["size"], "alien": near, "y0": l["y0"], "x0": l["x0"]})
        pages.append({
            "page": pi + 1,
            "text": "\n".join(l["text"] for l in lines),
            "images": len(imgs),
            "words": words,
        })
    print(json.dumps({"pages": pages}))


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("blocks", "text", "phonics"):
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    {"blocks": cmd_blocks, "text": cmd_text, "phonics": cmd_phonics}[sys.argv[1]](sys.argv[2])


if __name__ == "__main__":
    main()
