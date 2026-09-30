#!/usr/bin/env python3
"""
Synthetic PDFs for tests/govuk_*.test.ts, laid out like the gov.uk originals (fonts, bullets,
numbered paragraphs, alien images beside pseudo-words). *.pdf is gitignored, so the tests run this
script into a temp directory:  python3 make_pdfs.py <outdir>
All words and statements are invented or paraphrased test data, not the official materials.
"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
try:
    import pymupdf as fitz  # type: ignore
except Exception:  # pragma: no cover
    import fitz  # type: ignore

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(OUT, exist_ok=True)


class Writer:
    def __init__(self):
        self.doc = fitz.open()
        self.page = None
        self.y = 0
        self.new_page()

    def new_page(self):
        self.page = self.doc.new_page(width=595, height=842)
        self.y = 70
        self.page.insert_text((500, 820), str(len(self.doc)), fontsize=9, fontname="helv")

    def line(self, text, size=11, bold=False, x=72, gap=None):
        if self.y > 760:
            self.new_page()
        self.page.insert_text((x, self.y), text, fontsize=size, fontname="hebo" if bold else "helv")
        self.y += gap if gap is not None else size * 1.45

    def space(self, n=8):
        self.y += n

    def bullet(self, text, depth=0):
        x = 80 + depth * 22
        self.page.insert_text((x, self.y), "•", fontsize=11, fontname="helv")
        self.line(text, x=x + 14)

    def save(self, name):
        self.doc.save(os.path.join(OUT, name))


def alien_png():
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 24, 24), False)
    pix.set_rect(pix.irect, (40, 200, 60))
    return pix.tobytes("png")


# ---------------------------------------------------------------- NC maths key stage 4 (PDF only)
def nc_maths_ks4():
    w = Writer()
    w.line("Mathematics programmes of study: key stage 4", size=20, bold=True)
    w.line("National curriculum in England", size=14)
    w.space()
    w.line("Purpose of study", size=14, bold=True)
    w.line("Mathematics is a creative and highly inter-connected discipline.")
    w.space()
    w.line("Key stage 4", size=14, bold=True)
    w.space()
    w.line("Number", size=12, bold=True)
    w.line("Pupils should be taught to:")
    w.bullet("apply systematic listing strategies, including use of the product rule for counting")
    w.bullet("estimate powers and roots of any given positive number")
    w.bullet("calculate with roots, and with integer and fractional indices")
    w.space()
    w.line("Algebra", size=12, bold=True)
    w.line("Pupils should be taught to:")
    w.bullet("simplify and manipulate algebraic expressions, including by:")
    w.bullet("factorising quadratic expressions of the form x2 + bx + c", depth=1)
    w.bullet("simplifying expressions involving sums, products and powers", depth=1)
    w.bullet("know the difference between an equation and an identity")
    w.save("nc_maths_ks4.pdf")


# ---------------------------------------------------------------- DfE GCSE maths subject content
def gcse_maths():
    w = Writer()
    w.line("Mathematics", size=22, bold=True)
    w.line("GCSE subject content and assessment objectives", size=16)
    w.space(20)
    w.line("Introduction", size=15, bold=True)
    w.line("1. The GCSE subject content sets out the knowledge, understanding and skills")
    w.line("common to all GCSE specifications in mathematics.")
    w.space()
    w.line("Subject aims and learning outcomes", size=15, bold=True)
    w.line("2. GCSE specifications in mathematics should enable students to:")
    w.bullet("develop fluent knowledge, skills and understanding of mathematical methods")
    w.bullet("acquire, select and apply mathematical techniques to solve problems")
    w.space()
    w.line("Subject content", size=15, bold=True)
    w.line("Number", size=13, bold=True)
    w.line("Structure and calculation", size=11, bold=True)
    w.line("N1 order positive and negative integers, decimals and fractions")
    w.line("N2 apply the four operations, including formal written methods")
    w.space()
    w.line("Algebra", size=13, bold=True)
    w.line("3.1 Students should be taught to use and interpret algebraic notation, including:")
    w.bullet("ab in place of a × b")
    w.bullet("3y in place of y + y + y and 3 × y")
    w.save("gcse_maths.pdf")


def alevel_sciences():
    w = Writer()
    w.line("Biology, chemistry, physics and psychology", size=22, bold=True)
    w.line("GCE AS and A level subject content", size=16)
    w.space(20)
    w.line("Introduction", size=15, bold=True)
    w.line("1. This document sets out the content for AS and A level specifications.")
    w.space()
    w.line("Biology", size=15, bold=True)
    w.line("Knowledge and understanding", size=13, bold=True)
    w.line("2. Biological molecules: the structure of carbohydrates, lipids and proteins.")
    w.line("3. Cells: the structure of eukaryotic and prokaryotic cells.")
    w.space()
    w.line("Chemistry", size=15, bold=True)
    w.line("Knowledge and understanding", size=13, bold=True)
    w.line("4. Atomic structure: the electronic configuration of atoms and ions.")
    w.space()
    w.line("Psychology", size=15, bold=True)
    w.line("5. Approaches in psychology: learning theories.")
    w.save("alevel_sciences.pdf")


# ---------------------------------------------------------------- phonics
S1_PSEUDO = ["vop", "jub", "zint", "thap", "quem", "yeb", "shug", "chon", "fape", "wix"]
S1_REAL = ["ship", "rain", "moon", "farm", "coin", "hurt", "sheep", "then", "fork", "boot"]
S2_PSEUDO = ["blorn", "strom", "clape", "vunt", "sproy", "twerb", "glaim", "frosk", "drube", "snurk"]
S2_REAL = ["frost", "crisp", "stamp", "train", "spring", "slide", "phone", "cloud", "shirt", "plant"]


def phonics_pupils(name, year):
    doc = fitz.open()
    png = alien_png()
    cover = doc.new_page(width=842, height=595)
    cover.insert_text((60, 100), f"{year} phonics screening check", fontsize=24, fontname="hebo")
    cover.insert_text((60, 140), "Pupils' materials", fontsize=16, fontname="helv")
    cover.insert_image(fitz.Rect(700, 40, 780, 90), stream=png)  # logo on the cover
    pr = doc.new_page(width=842, height=595)
    pr.insert_text((60, 60), "Practice", fontsize=16, fontname="helv")
    for i, wd in enumerate(["at", "in"]):
        pr.insert_text((120, 180 + i * 120), wd, fontsize=60, fontname="helv")
    for sec, (ps, rl) in enumerate([(S1_PSEUDO, S1_REAL), (S2_PSEUDO, S2_REAL)], start=1):
        words = [(w, True) for w in ps] + [(w, False) for w in rl]
        for pi in range(0, 20, 4):
            p = doc.new_page(width=842, height=595)
            if pi == 0:
                p.insert_text((60, 40), f"Section {sec}", fontsize=14, fontname="helv")
            for j, (wd, pseudo) in enumerate(words[pi:pi + 4]):
                y = 130 + j * 125
                p.insert_text((150, y), wd, fontsize=60, fontname="helv")
                if pseudo:
                    p.insert_image(fitz.Rect(60, y - 50, 120, y + 5), stream=png)
    doc.save(os.path.join(OUT, name))


def phonics_scoring(name, year, layout="list"):
    w = Writer()
    w.line(f"{year} phonics screening check: scoring guidance", size=18, bold=True)
    w.line("The check comprises 40 words divided into two sections of 20 words.")
    w.line("Each section contains 10 pseudo-words, which are presented alongside a picture of an alien.")
    w.space()
    w.line("Practice words")
    w.line("at")
    w.line("in")
    pos = 1
    for sec, (ps, rl) in enumerate([(S1_PSEUDO, S1_REAL), (S2_PSEUDO, S2_REAL)], start=1):
        w.line(f"Section {sec}", size=14, bold=True)
        if layout == "list":
            w.line("Pseudo-words")
            for wd in ps:
                w.line(f"{pos} {wd}")
                pos += 1
            w.line("Real words")
            for wd in rl:
                w.line(f"{pos} {wd}")
                pos += 1
        else:  # table: number, word, type on separate lines
            for wd, kind in [(x, "pseudo-word") for x in ps] + [(x, "real word") for x in rl]:
                w.line(str(pos))
                w.line(wd)
                w.line(kind)
                pos += 1
    w.save(name)


def phonics_practice(name):
    doc = fitz.open()
    png = alien_png()
    p = doc.new_page(width=842, height=595)
    p.insert_text((60, 40), "Practice sheet", fontsize=14, fontname="helv")
    for j, (wd, pseudo) in enumerate([("at", False), ("zop", True), ("in", False), ("gan", True)]):
        y = 130 + j * 125
        p.insert_text((150, y), wd, fontsize=60, fontname="helv")
        if pseudo:
            p.insert_image(fitz.Rect(60, y - 50, 120, y + 5), stream=png)
    doc.save(os.path.join(OUT, name))


# ---------------------------------------------------------------- MTC
def mtc_framework():
    w = Writer()
    w.line("Multiplication tables check assessment framework", size=18, bold=True)
    w.space()
    w.line("Purpose", size=14, bold=True)
    w.line("The purpose of the check is to determine whether pupils in year 4 can fluently recall")
    w.line("their multiplication tables.")
    w.space()
    w.line("Check design", size=14, bold=True)
    w.line("The check will consist of 25 questions.")
    w.line("Pupils will have 6 seconds to answer each question.")
    w.line("There will be a 3-second pause between questions.")
    w.line("Pupils will answer 3 practice questions before the check begins.")
    w.line("Questions will be selected from the 2 to 12 multiplication tables.")
    w.line("The 1 times table will not be included in the check.")
    w.line("The 6, 7, 8, 9 and 12 multiplication tables will be weighted more heavily.")
    w.line("A question and its reverse (for example 3 × 4 and 4 × 3) will not both appear in the same check.")
    w.line("Each correct answer is awarded 1 mark.")
    w.save("mtc_framework.pdf")


if __name__ == "__main__":
    nc_maths_ks4()
    gcse_maths()
    alevel_sciences()
    phonics_pupils("phonics_2019_pupils.pdf", 2019)
    phonics_scoring("phonics_2019_scoring.pdf", 2019, "list")
    phonics_practice("phonics_2019_practice.pdf")
    phonics_scoring("phonics_2022_scoring.pdf", 2022, "table")
    phonics_pupils("phonics_2018_pupils.pdf", 2018)
    mtc_framework()
    print(OUT)
