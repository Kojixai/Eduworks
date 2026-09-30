#!/usr/bin/env python3
"""
Builds SYNTHETIC PDFs that mimic STA KS2 test layouts (question numbers in the left margin, "1 mark"
in the right margin, header/footer bands with page numbers and serial codes, stacked fractions,
column long multiplication, mark scheme tables with Qu./Requirement/Mark/Additional guidance/
Content domain columns, a copyright report). Invented content, not real STA material.

usage: build_fixtures.py <out_dir>
writes: arith.pdf, reasoning.pdf, ms.pdf, ms_wrong.pdf (Q5 answer deliberately wrong), copyright.pdf
"""
import os
import sys

import pymupdf as fitz

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
HAVE_TTF = os.path.exists(DEJAVU) and os.path.exists(DEJAVU_B)
W, H = 595, 842

# (expression parts, answer (mark scheme requirement), marks, guidance, content domain)
# expression parts: plain strings, ("frac", n, d), ("col", top, op, bottom) for column layout
ARITH = [
    (["345 + 211 ="], "556", 1, "", "3C2"),
    (["900 − 38 ="], "862", 1, "", "3C2"),
    (["7 × 8 ="], "56", 1, "", "4C6a"),
    (["72 ÷ 9 ="], "8", 1, "", "4C6a"),
    (["1,506 + 3,219 ="], "4,725", 1, "", "4C2"),
    (["10 × 36 ="], "360", 1, "", "5C6b"),
    (["0.6 × 7 ="], "4.2", 1, "", "6F9b"),
    (["25% of 80 ="], "20", 1, "", "6R2"),
    ([("frac", 3, 4), "of 12 ="], "9", 1, "", "5F10"),
    (["□ + 5 = 12"], "7", 1, "", "3C2"),
    ([("frac", 1, 4), "+", ("frac", 2, 4), "="], ("frac", 3, 4), 1,
     "Accept equivalent fractions or the exact decimal equivalent, e.g. 0.75", "4F8"),
    ([("frac", 2, 3), "+", ("frac", 1, 6), "="], ("frac", 5, 6), 1, "Accept equivalent fractions", "6F4"),
    (["4.5 − 1.75 ="], "2.75", 1, "", "5F10"),
    (["6² ="], "36", 1, "", "5C5d"),
    (["5,000 − 1,234 ="], "3,766", 1, "", "4C2"),
    (["1 ÷ 4 ="], "0.25 OR 1/4", 1, "", "6C9"),
    (["0.5 × 12 ="], "6", 1, "", "5F10"),
    (["342 ÷ 6 ="], "57", 1, "", "5C6a"),
    (["15 × 3 ="], "45", 1, "", "4C6a"),
    (["12 × □ = 132"], "11", 1, "", "4C6a"),
    (["1", ("frac", 3, 4), "+", ("frac", 1, 2), "="], "2 1/4", 1,
     "Accept equivalent fractions or the exact decimal equivalent, e.g. 2.25, 9/4", "5F4"),
    (["7.2 ÷ 100 ="], "0.072", 1, "", "5C6b"),
    (["64 ÷ 8 ="], "8", 1, "", "3C6"),
    (["1,000 − 999 ="], "1", 1, "", "4C2"),
    (["20% of 350 ="], "70", 1, "", "6R2"),
    (["3 ×", ("frac", 2, 5), "="], "6/5", 1,
     "Accept equivalent fractions or the exact decimal equivalent, e.g. 1 1/5, 1.2", "6F5a"),
    (["4,000 ÷ 10 ="], "400", 1, "", "5C6b"),
    (["99 + 101 ="], "200", 1, "", "3C2"),
    (["8 × 125 ="], "1,000", 1, "", "5C6a"),
    (["2.4 + 3.61 ="], "6.01", 1, "", "5F10"),
    (["180 − 45 − 45 ="], "90", 1, "", "4C2"),
    (["6 × 7 × 2 ="], "84", 1, "", "6C8"),
    ([("col", "2 7 4 3", "×", "2 6")], "71,318", 2,
     "Award TWO marks for the correct answer of 71,318. If the answer is incorrect, award ONE mark for a formal method of long multiplication with no more than ONE arithmetic error.", "6C7a"),
    (["4,321 × 15 ="], "64,815", 2,
     "Award TWO marks for the correct answer. If the answer is incorrect, award ONE mark for a formal method of long multiplication with no more than ONE arithmetic error.", "6C7a"),
    (["5,824 ÷ 32 ="], "182", 2,
     "Award TWO marks for the correct answer. If the answer is incorrect, award ONE mark for a formal method of long division with no more than ONE arithmetic error.", "6C7b"),
    (["8,976 ÷ 24 ="], "374", 2,
     "Award TWO marks for the correct answer. If the answer is incorrect, award ONE mark for a formal method of long division with no more than ONE arithmetic error.", "6C7b"),
]

# reasoning: (number, prompt lines, marks per part list, ms requirement per part, domain, draw image?)
REASONING = []
for i in range(1, 21):
    parts = [1, 1] if i == 7 else ([2] if i <= 15 else [1])
    REASONING.append((i, [f"Here is a diagram of shape {i}.", "Explain how you know." if i % 3 == 0 else "Tick one."],
                      parts, "4G4" if i % 2 else "5M9a", i == 7))


class Doc:
    def __init__(self):
        self.doc = fitz.open()

    def page(self, serial="STA198214e", footer=True):
        p = self.doc.new_page(width=W, height=H)
        if HAVE_TTF:
            p.insert_font(fontname="dv", fontfile=DEJAVU)
            p.insert_font(fontname="dvb", fontfile=DEJAVU_B)
        if footer:
            n = len(self.doc)
            self.text(p, 40, 820, serial, 7)
            self.text(p, 270, 820, f"Page {n} of 24", 8)
        return p

    def text(self, p, x, y, s, size=11, bold=False):
        if HAVE_TTF:
            p.insert_text((x, y), s, fontsize=size, fontname="dvb" if bold else "dv")
        else:  # base-14 fallback (WinAnsi only)
            s = s.replace("−", "-").replace("□", "[ ]")
            p.insert_text((x, y), s, fontsize=size, fontname="hebo" if bold else "helv")
        return fitz.get_text_length(s, fontname="helv", fontsize=size) * 1.08

    def frac(self, p, x, baseline, n, d, size=16):
        fs = size * 0.75
        yb = baseline - 0.32 * size
        wn = max(len(str(n)), len(str(d))) * fs * 0.64
        self.text(p, x + (wn - len(str(n)) * fs * 0.64) / 2, yb - 0.3 * fs - 1, str(n), fs)
        self.text(p, x + (wn - len(str(d)) * fs * 0.64) / 2, yb + 0.95 * fs + 1, str(d), fs)
        p.draw_line((x - 1, yb), (x + wn + 1, yb), width=0.8)
        return wn + 6

    def inline(self, p, x, y, parts, size=16):
        for part in parts:
            if isinstance(part, tuple) and part[0] == "frac":
                x += self.frac(p, x, y, part[1], part[2], size)
            elif isinstance(part, tuple) and part[0] == "col":
                _, top, op, bottom = part
                self.text(p, 200, y, top, size)
                self.text(p, 170, y + 26, op, size)
                self.text(p, 200 + (len(top) - len(bottom)) * size * 0.62, y + 26, bottom, size)
                p.draw_line((165, y + 34), (290, y + 34), width=1)
                x = 300
            else:
                x += self.text(p, x, y, part, size) + 5
        return x

    def save(self, path):
        self.doc.subset_fonts()
        self.doc.save(path, garbage=3, deflate=True)


def cover(d, title_lines):
    p = d.page(footer=False)
    y = 120
    for s, size in title_lines:
        d.text(p, 60, y, s, size, bold=True)
        y += size * 1.8
    for label in ["First name", "Middle name", "Last name", "Date of birth", "School name", "DfE number"]:
        d.text(p, 60, y + 20, label, 10)
        p.draw_rect(fitz.Rect(160, y + 8, 520, y + 26), width=0.6)
        y += 32


def build_arith(path):
    d = Doc()
    cover(d, [("Key stage 2", 20), ("2019", 20), ("Mathematics", 26), ("Paper 1: arithmetic", 18)])
    p = d.page()
    d.text(p, 60, 100, "Instructions", 16, bold=True)
    d.text(p, 60, 130, "You have 30 minutes to complete this test.", 11)
    d.text(p, 60, 150, "The number under each box at the side of the page tells you the maximum number of", 11)
    d.text(p, 60, 166, "marks for each question.", 11)
    i = 0
    while i < len(ARITH):
        p = d.page()
        slots = [110] if ARITH[i][2] == 2 else [110, 350, 590]
        for y in slots:
            if i >= len(ARITH) or (ARITH[i][2] == 2 and y != 110):
                break
            parts, _ans, marks, _g, _dom = ARITH[i]
            d.text(p, 40, y, str(i + 1), 14, bold=True)
            d.inline(p, 120, y + 30, parts)
            bh = 200 if marks == 2 else 60
            p.draw_rect(fitz.Rect(380, y + 5, 500, y + 5 + (40 if marks == 1 else 40)), width=0.8)
            if marks == 2:
                p.draw_rect(fitz.Rect(110, y + 80, 360, y + 80 + bh), width=0.4)  # working grid
            d.text(p, 520, y + (60 if marks == 1 else 300), f"{marks} mark" + ("s" if marks > 1 else ""), 8, bold=True)
            i += 1
    d.save(path)


def build_reasoning(path):
    d = Doc()
    cover(d, [("Key stage 2", 20), ("2019", 20), ("Mathematics", 26), ("Paper 2: reasoning", 18)])
    p = d.page()
    d.text(p, 60, 100, "Instructions", 16, bold=True)
    d.text(p, 60, 130, "You have 40 minutes to complete this test.", 11)
    idx = 0
    while idx < len(REASONING):
        p = d.page()
        for y in (110, 440):
            if idx >= len(REASONING):
                break
            n, lines, parts, _dom, photo = REASONING[idx]
            d.text(p, 40, y, str(n), 14, bold=True)
            yy = y
            for s in lines:
                d.text(p, 100, yy, s, 11)
                yy += 18
            if photo:
                p.draw_rect(fitz.Rect(100, yy, 260, yy + 90), color=(0.3, 0.3, 0.3), fill=(0.7, 0.7, 0.7))
            else:
                p.draw_rect(fitz.Rect(100, yy, 220, yy + 70), color=(0, 0, 0.6), width=1.5)
            for k, m in enumerate(parts):
                if len(parts) > 1:
                    d.text(p, 90, yy + 110 + k * 60, f"{chr(97 + k)})", 11, bold=True)
                d.text(p, 520, yy + 140 + k * 60, f"{m} mark" + ("s" if m > 1 else ""), 8, bold=True)
            idx += 1
    d.save(path)


def wrap(s, n=34):
    out, cur = [], ""
    for w in s.split():
        if len(cur) + len(w) + 1 > n:
            out.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        out.append(cur)
    return out


def ms_header(d, p, y):
    for x, s in [(40, "Qu."), (80, "Requirement"), (240, "Mark"), (290, "Additional guidance"), (505, "Content domain")]:
        d.text(p, x, y, s, 9, bold=True)
    p.draw_line((36, y + 6), (560, y + 6), width=0.6)
    return y + 24


def build_ms(path, wrong_q=None):
    d = Doc()
    p = d.page(footer=False)
    d.text(p, 60, 150, "2019 key stage 2 mathematics: mark schemes", 20, bold=True)
    for section, rows in [("Paper 1: arithmetic", "arith"), ("Paper 2: reasoning", "reasoning")]:
        p = d.page()
        d.text(p, 40, 80, section, 16, bold=True)
        y = ms_header(d, p, 110)
        entries = []
        if rows == "arith":
            for i, (_parts, ans, marks, guid, dom) in enumerate(ARITH):
                if wrong_q == i + 1:
                    ans = "4,752"
                entries.append((str(i + 1), ans, f"{marks}m", guid, dom))
        else:
            for n, _lines, parts, dom, _photo in REASONING:
                for k, m in enumerate(parts):
                    num = f"{n}{chr(97 + k)}" if len(parts) > 1 else str(n)
                    req = "Award 1 mark for a correct explanation, e.g. the shape has four equal sides." if n % 3 == 0 else "Award 1 mark for the correct box ticked."
                    entries.append((num, req, f"{m}m", "Do not accept vague answers." if m == 2 else "", dom))
        for num, ans, mark, guid, dom in entries:
            glines = wrap(guid) if guid else []
            rlines = wrap(ans, 26) if isinstance(ans, str) else [ans]
            h = max(len(glines), len(rlines), 1) * 13 + 14
            if y + h > 790:
                p = d.page()
                y = ms_header(d, p, 60)
            d.text(p, 44, y, num, 10, bold=True)
            yy = y
            for r in rlines:
                if isinstance(r, tuple):
                    d.frac(p, 80, yy + 4, r[1], r[2], 13)
                else:
                    d.text(p, 80, yy, r, 10)
                yy += 13
            d.text(p, 245, y, mark, 10)
            for k, g in enumerate(glines):
                d.text(p, 290, y + k * 13, g, 9)
            d.text(p, 510, y, dom, 9)
            y += h
            p.draw_line((36, y - 10), (560, y - 10), width=0.3)
    d.save(path)


def build_copyright(path):
    d = Doc()
    p = d.page(footer=False)
    lines = [
        ("2019 national curriculum tests: key stage 2 copyright report", 14, True),
        ("The Standards and Testing Agency has made every effort to trace copyright holders.", 9, False),
        ("Mathematics Paper 2: reasoning", 12, True),
        ("Question 7: photograph of a bicycle © Shutterstock.com", 10, False),
        ("English reading: reading booklet", 12, True),
        ("‘The Lost Key’ by A. Writer © A. Writer 2018. Reproduced by permission.", 10, False),
    ]
    y = 80
    for s, size, bold in lines:
        d.text(p, 40, y, s, size, bold)
        y += size * 2
    d.save(path)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    build_arith(os.path.join(out, "arith.pdf"))
    build_reasoning(os.path.join(out, "reasoning.pdf"))
    build_ms(os.path.join(out, "ms.pdf"))
    build_ms(os.path.join(out, "ms_wrong.pdf"), wrong_q=5)
    build_copyright(os.path.join(out, "copyright.pdf"))
    print(out)
