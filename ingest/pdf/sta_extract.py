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


def digit_chars(page):
    """Digit characters with their baseline origin, to split a mixed number such as '2' + raised '3' that the
    text layer glues into one word '23'."""
    chars = []
    for b in page.get_text("rawdict").get("blocks", []):
        for l in b.get("lines", []):
            for sp in l.get("spans", []):
                for c in sp.get("chars", []):
                    if c["c"].isdigit():
                        chars.append((c["c"], fitz.Rect(c["bbox"]), c["origin"][1]))
    return chars


def split_stacked_digits(words, chars):
    """Split all-digit words whose characters sit on different baselines (whole number + fraction numerator)."""
    out = []
    for w in words:
        t = w[4]
        if len(t) >= 2 and t.isdigit():
            r = fitz.Rect(w[:4])
            mine = [(c, bb, oy) for c, bb, oy in chars if r.contains(fitz.Point((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2))]
            mine.sort(key=lambda m: m[1].x0)
            if len(mine) == len(t) and max(m[2] for m in mine) - min(m[2] for m in mine) > 2.0:
                groups = [[mine[0]]]
                for m in mine[1:]:
                    if abs(m[2] - groups[-1][-1][2]) > 2.0:
                        groups.append([m])
                    else:
                        groups[-1].append(m)
                for g in groups:
                    x0 = min(m[1].x0 for m in g); x1 = max(m[1].x1 for m in g)
                    y0 = min(m[1].y0 for m in g); y1 = max(m[1].y1 for m in g)
                    out.append((x0, y0, x1, y1, "".join(m[0] for m in g)))
                continue
        out.append(w)
    return out


def page_words(page):
    spans = span_index(page)
    out = []
    raw = page.get_text("words")
    if any(len(w[4]) >= 2 and w[4].isdigit() for w in raw):
        raw = split_stacked_digits(raw, digit_chars(page))
    for x0, y0, x1, y1, text, *_ in raw:
        text = text.replace("\u2009", " ").replace("\u00a0", " ").replace("\u202f", " ")  # thin / no-break spaces
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        bold, size = False, 0.0
        for r, b, s in spans:
            if r.x0 - 0.5 <= cx <= r.x1 + 0.5 and r.y0 - 0.5 <= cy <= r.y1 + 0.5:
                bold, size = b, s
                break
        # some PDFs print the same word twice in the same place (overprint): keep one
        if any(o["text"] == text and abs(o["x0"] - x0) < 0.5 and abs(o["y0"] - y0) < 0.5 for o in out[-6:]):
            continue
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
        best_n = best_d = 99.0
        for i, w in enumerate(words):
            # numerator may carry the whole part of a mixed number ("1 7" over "15" = 1 7/15)
            if i in used or not re.fullmatch(r"\d{1,4}(?: \d{1,4})?", w["text"]):
                continue
            cx = (w["x0"] + w["x1"]) / 2
            if " " in w["text"]:
                cx = w["x1"] - 3.5  # whole part + numerator: the numerator is the last token
            cy = (w["y0"] + w["y1"]) / 2
            if not (rx0 - 2 <= cx <= rx1 + 2):
                continue
            # judged by the word centre: ascent/descent metrics differ between fonts and PyMuPDF versions
            if 0 < ry - cy <= 12 and ry - cy < best_n:
                num, best_n = i, ry - cy
            elif 0 < cy - ry <= 12 and " " not in w["text"] and cy - ry < best_d:
                den, best_d = i, cy - ry
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


def cmd_tables(pdf):
    """Copyright reports: per page, the running text outside tables (section headings) and every
    table row, ordered top to bottom so the caller can track which heading a row sits under."""
    doc = fitz.open(pdf)
    pages = []
    for pno, page in enumerate(doc):
        tabs = list(page.find_tables())
        boxes = [fitz.Rect(t.bbox) for t in tabs]
        items = []
        for l in group_lines(page_words(page)):
            r = fitz.Rect(l["x0"], l["y0"], l["x1"], l["y1"])
            if any(r.intersects(b) for b in boxes):
                continue
            items.append({"y": round(l["y0"], 1), "kind": "text", "text": l["text"]})
        for t in tabs:
            rows = [[(c or "").replace("\n", " ").strip() for c in row] for row in t.extract()]
            items.append({"y": round(t.bbox[1], 1), "kind": "table", "rows": rows})
        items.sort(key=lambda i: i["y"])
        pages.append({"page": pno + 1, "items": items})
    return {"page_count": len(doc), "pages": pages}


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

    if not starts:
        # numbered sentences ("1. There was a ... in the story."), e.g. the spelling paper: "N." as the
        # first word of a line near the left edge
        for pno, pd in enumerate(page_data):
            lines = group_lines(pd["words"])
            for l in lines:
                w = l["words"][0]
                m = re.fullmatch(r"(\d{1,2})\.", w["text"])
                if m and w["x0"] < pd["W"] * 0.2 and int(m.group(1)) == expected:
                    w = dict(w, text=m.group(1))
                    starts.append((pno, w))
                    expected += 1

    questions = []
    for i, (pno, w) in enumerate(starts):
        pd = page_data[pno]
        W, H = pd["W"], pd["H"]
        top = max(w["y0"] - 15, H * HEADER_BAND)  # stacked fractions put the numerator above the question number
        nxt = starts[i + 1] if i + 1 < len(starts) else None
        limit = nxt[1]["y0"] - 16 if nxt and nxt[0] == pno else H * FOOTER_BAND
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
        text_words = [x for x in in_region if not (x["x0"] == w["x0"] and x["y0"] == w["y0"]) and not any(x is m for m in mark_words)]
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
    elif cmd == "tables":
        res = cmd_tables(pdf)
    elif cmd == "questions":
        res = cmd_questions(pdf, opts.get("out", "."), int(opts.get("max-width", 1000)), opts.get("prefix", "q"))
    else:
        print(f"unknown command {cmd}", file=sys.stderr)
        return 2
    sys.stdout.write(json.dumps(res))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
