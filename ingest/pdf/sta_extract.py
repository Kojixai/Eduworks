#!/usr/bin/env python3
"""
STA test-paper PDF extraction helpers. Called from ingest/sources/sta_papers_pdf.ts via child_process;
every command prints ONE JSON document on stdout (diagnostics go to stderr).

Commands
  lines <pdf>                          positioned text lines per page (mark schemes, copyright reports)
  questions <pdf> --out <dir> [--max-width 1000] [--prefix q]
                                       question detection + cropped PNG per question

Layout assumptions (STA KS1/KS2 papers 2016+):
  * question numbers are printed bold in the LEFT margin (x < ~14% of the page width);
  * marks are printed in the RIGHT margin as "1 mark" / "2 marks";
  * header/footer bands hold page numbers and STA serial codes and are ignored;
  * stacked fractions are two numbers either side of a short horizontal rule; they are rebuilt
    as "n/d" tokens so the arithmetic checker can read them.
"""
import io
import json
import os
import re
import sys

import pymupdf as fitz  # PyMuPDF

try:
    from PIL import Image
except Exception:  # pragma: no cover - PIL optional
    Image = None

HEADER_BAND = 0.055
FOOTER_BAND = 0.93
LEFT_MARGIN = 0.14
RIGHT_MARGIN = 0.72
NUM_RE = re.compile(r"^\d{1,2}$")
MARK_WORD_RE = re.compile(r"^marks?$", re.I)


def span_index(page):
    """Font info for every text span, used to tag words as bold / sized."""
    spans = []
    d = page.get_text("dict")
    for b in d.get("blocks", []):
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                bold = bool(s.get("flags", 0) & 16) or "bold" in s.get("font", "").lower()
                spans.append((fitz.Rect(s["bbox"]), bold, round(s.get("size", 0), 1)))
    return spans


def page_words(page):
    spans = span_index(page)
    out = []
    for x0, y0, x1, y1, text, *_ in page.get_text("words"):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        bold, size = False, 0.0
        for r, b, s in spans:
            if r.x0 - 0.5 <= cx <= r.x1 + 0.5 and r.y0 - 0.5 <= cy <= r.y1 + 0.5:
                bold, size = b, s
                break
        out.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "text": text, "bold": bold, "size": size})
    return out


def short_rules(page):
    """Short horizontal rules (fraction bars): line items or very thin filled rects."""
    rules = []
    for d in page.get_drawings():
        for it in d.get("items", []):
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.y - p2.y) < 0.8 and 3 < abs(p1.x - p2.x) < 45:
                    rules.append((min(p1.x, p2.x), max(p1.x, p2.x), (p1.y + p2.y) / 2))
            elif it[0] == "re":
                r = it[1]
                if r.height < 1.6 and 3 < r.width < 45:
                    rules.append((r.x0, r.x1, (r.y0 + r.y1) / 2))
    return rules


def rebuild_fractions(words, rules):
    """Replace numerator/denominator word pairs around a fraction bar by one 'n/d' word."""
    used = set()
    extra = []
    for rx0, rx1, ry in rules:
        num = den = None
        for i, w in enumerate(words):
            if i in used or not re.fullmatch(r"\d{1,4}", w["text"]):
                continue
            cx = (w["x0"] + w["x1"]) / 2
            if not (rx0 - 2 <= cx <= rx1 + 2):
                continue
            # small negative tolerance: font ascent/descent metrics differ between PyMuPDF versions
            if -2.5 <= ry - w["y1"] <= 6 and num is None:
                num = i
            elif -2.5 <= w["y0"] - ry <= 6 and den is None:
                den = i
        if num is not None and den is not None:
            used.update([num, den])
            n, d = words[num], words[den]
            h = max(n["y1"] - n["y0"], 8)
            extra.append({
                "x0": rx0, "x1": rx1, "y0": ry - h / 2, "y1": ry + h / 2,
                "text": f"{n['text']}/{d['text']}", "bold": n["bold"], "size": n["size"], "fraction": True,
            })
    return [w for i, w in enumerate(words) if i not in used] + extra


def group_lines(words, tol=4.5):
    """Cluster words into visual lines by vertical centre, then sort each line left to right."""
    ws = sorted(words, key=lambda w: ((w["y0"] + w["y1"]) / 2, w["x0"]))
    lines = []
    for w in ws:
        cy = (w["y0"] + w["y1"]) / 2
        if lines and abs(lines[-1]["cy"] - cy) <= tol:
            lines[-1]["words"].append(w)
            n = len(lines[-1]["words"])
            lines[-1]["cy"] = (lines[-1]["cy"] * (n - 1) + cy) / n
        else:
            lines.append({"cy": cy, "words": [w]})
    out = []
    for l in lines:
        wsl = sorted(l["words"], key=lambda w: w["x0"])
        out.append({
            "x0": min(w["x0"] for w in wsl), "y0": min(w["y0"] for w in wsl),
            "x1": max(w["x1"] for w in wsl), "y1": max(w["y1"] for w in wsl),
            "text": " ".join(w["text"] for w in wsl),
            "size": max(w["size"] for w in wsl),
            "bold": all(w["bold"] for w in wsl),
            "words": [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in w.items()} for w in wsl],
        })
    return out


def cmd_lines(pdf):
    doc = fitz.open(pdf)
    pages = []
    for pno, page in enumerate(doc):
        words = rebuild_fractions(page_words(page), short_rules(page))
        lines = group_lines(words)
        for l in lines:
            for k in ("x0", "y0", "x1", "y1"):
                l[k] = round(l[k], 2)
        pages.append({"page": pno + 1, "width": page.rect.width, "height": page.rect.height, "lines": lines})
    return {"pages": pages, "page_count": len(doc)}


def save_png(pix, path, max_colors=64):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if Image is None:
        pix.save(path)
        return
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    img = img.quantize(colors=max_colors, method=Image.Quantize.FASTOCTREE)
    img.save(path, format="PNG", optimize=True)


def cmd_questions(pdf, out_dir, max_width=1000, prefix="q"):
    doc = fitz.open(pdf)
    starts = []  # (page_index, word)
    expected = 1
    page_data = []
    for pno, page in enumerate(doc):
        W, H = page.rect.width, page.rect.height
        words = page_words(page)
        body = [w for w in words if w["y0"] > H * HEADER_BAND and w["y1"] < H * FOOTER_BAND]
        page_data.append({"W": W, "H": H, "words": body, "rules": short_rules(page), "drawings": [
            fitz.Rect(d["rect"]) for d in page.get_drawings()
            if d.get("rect") is not None and d["rect"].y0 > H * HEADER_BAND and d["rect"].y1 < H * FOOTER_BAND
        ]})
        cands = sorted(
            [w for w in body if NUM_RE.match(w["text"]) and w["x0"] < W * LEFT_MARGIN and (w["bold"] or w["size"] >= 11)],
            key=lambda w: w["y0"],
        )
        for w in cands:
            if int(w["text"]) == expected:
                starts.append((pno, w))
                expected += 1

    questions = []
    for i, (pno, w) in enumerate(starts):
        pd = page_data[pno]
        W, H = pd["W"], pd["H"]
        top = max(w["y0"] - 8, H * HEADER_BAND)
        nxt = starts[i + 1] if i + 1 < len(starts) else None
        limit = nxt[1]["y0"] - 4 if nxt and nxt[0] == pno else H * FOOTER_BAND
        in_region = [x for x in pd["words"] if x["y0"] >= top - 1 and x["y1"] <= limit + 1]
        draws = [r for r in pd["drawings"] if r.y0 >= top - 1 and r.y1 <= limit + 1]
        bottom = max([x["y1"] for x in in_region] + [r.y1 for r in draws] + [w["y1"]]) + 8
        bottom = min(bottom, limit + 2)
        # marks in the right margin: "<n> mark(s)"
        marks = None
        mark_words = []
        for j, x in enumerate(in_region):
            if MARK_WORD_RE.match(x["text"]) and x["x0"] > W * RIGHT_MARGIN:
                prev = [p for p in in_region if NUM_RE.match(p["text"]) and abs((p["y0"] + p["y1"]) / 2 - (x["y0"] + x["y1"]) / 2) < 4 and 0 <= x["x0"] - p["x1"] < 12]
                if prev:
                    marks = (marks or 0) + int(prev[0]["text"])
                    mark_words += [x, prev[0]]
        text_words = [x for x in in_region if x is not w and not any(x is m for m in mark_words)]
        text_words = rebuild_fractions(text_words, [r for r in pd["rules"] if top <= r[2] <= limit])
        lines = [l["text"] for l in group_lines(text_words)]
        clip = fitz.Rect(max(w["x0"] - 10, 0), top, W - max(w["x0"] - 10, 0), bottom)
        zoom = min((max_width - 2) / clip.width, 2.0)  # pixel size rounds up
        pix = doc[pno].get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
        path = os.path.join(out_dir, f"{prefix}{w['text']}.png")
        save_png(pix, path)
        questions.append({
            "number": w["text"],
            "page": pno + 1,
            "bbox": [round(clip.x0, 1), round(clip.y0, 1), round(clip.x1, 1), round(clip.y1, 1)],
            "text": "\n".join(lines),
            "lines": lines,
            "margin_marks": marks,
            "crop": {"path": path, "width": pix.width, "height": pix.height, "bytes": os.path.getsize(path)},
        })

    first_q_page = starts[0][0] if starts else len(doc)
    front = "\n".join(doc[p].get_text() for p in range(0, min(first_q_page, len(doc))))
    back = doc[len(doc) - 1].get_text() if len(doc) else ""
    return {"page_count": len(doc), "front_text": front, "back_text": back, "questions": questions}


def main(argv):
    if len(argv) < 3:
        print("usage: sta_extract.py lines|questions <pdf> [--out dir]", file=sys.stderr)
        return 2
    cmd, pdf = argv[1], argv[2]
    opts = {}
    rest = argv[3:]
    for i in range(0, len(rest) - 1, 2):
        opts[rest[i].lstrip("-")] = rest[i + 1]
    if cmd == "lines":
        res = cmd_lines(pdf)
    elif cmd == "questions":
        res = cmd_questions(pdf, opts.get("out", "."), int(opts.get("max-width", 1000)), opts.get("prefix", "q"))
    else:
        print(f"unknown command {cmd}", file=sys.stderr)
        return 2
    sys.stdout.write(json.dumps(res))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
