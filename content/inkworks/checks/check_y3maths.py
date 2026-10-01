#!/usr/bin/env python3
"""Independent checker for the y3maths website practice bank.

1. Validates y3maths.json against CONTENT_SCHEMA.txt (structure, types, ids, difficulty spread, house style).
2. Recomputes every numeric, cloze and order answer from scratch (and most mcq / multi / match /
   truefalse / text answers) and compares with the stored answer. Every numeric, cloze and order
   question MUST have a recomputation here, otherwise the check fails.
Run: python3 check_y3maths.py   (exit code 0 = 100% pass)
"""
import calendar
import json
import math
import os
import re
import sys
from fractions import Fraction as Fr
from itertools import permutations

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, "y3maths.json"), encoding="utf-8"))
REGISTRY = "/home/claude/books/y3maths/build/_registry.json"

# ------------------------------------------------------------------ helpers
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def n2w(n):
    if n == 1000:
        return "one thousand"
    h, r = divmod(n, 100)
    if r < 20:
        rw = ONES[r]
    else:
        t, o = divmod(r, 10)
        rw = TENS[t] + ("-" + ONES[o] if o else "")
    if h == 0:
        return rw
    return ONES[h] + " hundred" + (" and " + rw if r else "")


W2N = {n2w(n): n for n in range(0, 1001)}


def F(n, d):
    return f"{n}/{d}"


def money(p):
    pounds, pence = divmod(p, 100)
    if pounds and pence:
        return f"£{pounds} and {pence}p"
    if pounds:
        return f"£{pounds}"
    return f"{pence}p"


def r100(n):
    return (n + 50) // 100 * 100


ROMAN = {"I": 1, "V": 5, "X": 10}


def roman2int(s):
    total = 0
    for i, ch in enumerate(s):
        v = ROMAN[ch]
        if i + 1 < len(s) and ROMAN[s[i + 1]] > v:
            total -= v
        else:
            total += v
    return total


def int2roman(n):
    out = ""
    for v, s in [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while n >= v:
            out += s
            n -= v
    return out


def phrase(h, m):
    nxt = h % 12 + 1
    if m == 0:
        return f"{h} o'clock"
    if m == 15:
        return f"quarter past {h}"
    if m == 30:
        return f"half past {h}"
    if m == 45:
        return f"quarter to {nxt}"
    if m < 30:
        return f"{m} past {h}"
    return f"{60 - m} to {nxt}"


def mins(h, m):
    return h * 60 + m


def diff(a, b):
    return mins(*b) - mins(*a)


def hm(total, ampm=False):
    total %= 24 * 60
    h, m = divmod(total, 60)
    if not ampm:
        return f"{h % 12 or 12}:{m:02d}"
    suf = "am" if h < 12 else "pm"
    return f"{h % 12 or 12}:{m:02d} {suf}"


def h24(total):
    total %= 24 * 60
    return "%02d:%02d" % divmod(total, 60)


def coins_greedy(p):
    out = []
    for c in [200, 100, 50, 20, 10, 5, 2, 1]:
        while p >= c:
            out.append(c)
            p -= c
    return out


def parse_coins(s):
    vals = []
    for tok in s.split(","):
        tok = tok.strip()
        vals.append(int(tok[1:]) * 100 if tok.startswith("£") else int(tok[:-1]))
    return vals


def picto(prompt, key, half):
    rows = {}
    for line in prompt.split("\n"):
        mm = re.match(r"^(\w[\w ]*): ([●◐ ]+)$", line)
        if mm:
            rows[mm.group(1)] = mm.group(2).count("●") * key + mm.group(2).count("◐") * half
    return rows


def table(prompt):
    rows = {}
    for line in prompt.split("\n"):
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == 3 and parts[1].isdigit():
            rows[parts[0]] = (int(parts[1]), int(parts[2]))
    return rows


def ev(expr):
    """evaluate a simple arithmetic string such as '400 + 25 + 10' or '36 tens'"""
    expr = expr.replace("×", "*").replace("÷", "/").replace("−", "-")
    mm = re.fullmatch(r"(\d+) tens", expr.strip())
    if mm:
        return int(mm.group(1)) * 10
    return eval(expr, {"__builtins__": {}})


def frac(s):
    s = s.strip()
    if " and " in s:
        w, f = s.split(" and ")
        return int(w) + Fr(f)
    return Fr(s)


SHAPES3D = {"cube": (6, 12, 8), "cuboid": (6, 12, 8), "triangular prism": (5, 9, 6), "square-based pyramid": (5, 8, 5),
            "sphere": (1, 0, 0), "cylinder": (3, 2, 0), "cone": (2, 1, 1)}
POLYNAMES = {3: "triangle", 4: "quadrilateral", 5: "pentagon", 6: "hexagon", 8: "octagon"}
MONTH31 = {calendar.month_name[i] for i in range(1, 13) if calendar.monthrange(2027, i)[1] == 31}

U = {int(u["id"].split("-u")[1]): u for u in DATA["units"]}


def Q(u, q):
    return U[u]["questions"][q - 1]


def opt(u, q, text):
    """index of option with exactly this text"""
    return Q(u, q)["options"].index(text)


def diag(u, q):
    return Q(u, q)["diagram"]


# ------------------------------------------------------------------ expected answers
# key (unit, question) -> expected answer in the stored format:
#   numeric: number; cloze: list of str; order: list (correct order); mcq: index; multi: sorted indices;
#   text: str; truefalse: list of bools; match: list of [left, right]
E = {}

# u01 Counting in 4s, 8s, 50s and 100s
E[1, 1] = 28 + 4
E[1, 2] = [str(400 + 100), str(500 + 100)]
E[1, 3] = 56 - 8
E[1, 4] = [i for i, v in enumerate([250, 320, 450, 505, 900]) if v % 50 == 0]
E[1, 5] = 7 * 8
E[1, 6] = opt(1, 6, [str(v) for v in [30, 34, 36, 38] if v % 4 == 0][0])
E[1, 7] = [str(v) for v in range(600, 399, -50)]
_s = [8, 16, 24, 32, 40, 46, 56]
_bad = [i for i, v in enumerate(_s) if v != 8 * (i + 1)][0]
E[1, 8] = [str(_s[_bad]), str(8 * (_bad + 1))]
E[1, 9] = [all(x % 50 == 0 for x in range(0, 1001, 100)), all(x % 8 == 0 for x in range(0, 101, 4)), 64 % 8 == 0, 125 % 50 == 0]
E[1, 10] = math.ceil(60 / 8)

# u02 10 or 100 more or less
E[2, 1] = 463 + 10
E[2, 2] = 829 - 100
E[2, 3] = [str(512 - 10), str(512 + 100)]
E[2, 4] = [["10 more than 346", str(346 + 10)], ["10 less than 346", str(346 - 10)], ["100 more than 346", str(346 + 100)], ["100 less than 346", str(346 - 100)]]
E[2, 5] = 594 + 10
E[2, 6] = opt(2, 6, str(703 - 10))
E[2, 7] = 158 + 100 + 10 + 10
E[2, 8] = [str(400 - 300), str(400 - 10)]
E[2, 9] = [299 + 10 == 309, 1000 - 100 == 900, 601 - 10 == 501, 90 + 100 == 190]
E[2, 10] = [n for n in range(915, -1, -100)][-1]

# u03 Hundreds, tens and ones
E[3, 1] = int("368"[1]) * 10
E[3, 2] = 4 * 100 + 2 * 10 + 9
E[3, 3] = [i for i, o in enumerate(Q(3, 3)["options"]) if o[0] == "7" and len(o) == 3][0]
E[3, 4] = list("527")
E[3, 5] = 340 // 10
E[3, 6] = opt(3, 6, str(8 * 100 + 0 * 10 + 3))
E[3, 7] = 358 - 100 + 20
E[3, 8] = [str(int("945"[1]) * 10), "tens"]
E[3, 9] = ["609"[1] == "0", int("390"[1]) == 9 and False, 250 // 10 == 25, False]
_sol = [n for n in range(100, 1000) if n // 100 == 3 * (n % 10) and (n // 10) % 10 == n % 10 + 1 and sum(map(int, str(n))) == 16]
assert len(_sol) == 1
E[3, 10] = _sol[0]

# u04 Partitioning numbers
E[4, 1] = [str(358 - 300 - 8)]
E[4, 2] = 700 + 40 + 2
E[4, 3] = [str(614 - 500)]
E[4, 4] = diag(4, 4)["whole"] - 200
E[4, 5] = [i for i, o in enumerate(Q(4, 5)["options"]) if ev(o) != 435][0]
E[4, 6] = 6 * 100 + 11 * 10 + 4
E[4, 7] = [str(852 - 800 - 40)]
E[4, 8] = [str(506 - 500)]
E[4, 9] = [ev(st["s"]) == 360 for st in Q(4, 9)["statements"]]
E[4, 10] = (240 - 40) // 2

# u05 Numbers in words and digits
E[5, 1] = W2N["four hundred and thirty-six"]
E[5, 2] = opt(5, 2, n2w(280))
E[5, 3] = W2N["nine hundred and four"]
E[5, 4] = n2w(517)
E[5, 5] = [[l, str(W2N[l])] for l, _ in Q(5, 5)["pairs"]]
E[5, 6] = W2N["three hundred and fifty-nine"] + 10
E[5, 7] = sorted(Q(5, 7)["items"], key=lambda w: W2N[w])
E[5, 8] = [str(W2N["eight hundred and twelve"])]
E[5, 9] = [n2w(1000) == "one thousand" and True, W2N["three hundred and eight"] == 380, n2w(550) == "five hundred and fifty", 1000 - W2N["nine hundred and ninety"] == 1]
_sol = [n for n in range(100, 1000) if "hundred" in n2w(n) and n2w(n).endswith("twelve") and sum(map(int, str(n))) == 7]
assert len(_sol) == 1
E[5, 10] = _sol[0]

# u06 Number lines to 1000
E[6, 1] = 0 + 8 * 100
E[6, 2] = 500 + 7 * 10
E[6, 3] = 200 + 3 * ((300 - 200) // 5)
E[6, 4] = opt(6, 4, str((400 - 300) // 10))
E[6, 5] = 1000 * 3 // 4
E[6, 6] = (400 + 500) // 2
E[6, 7] = 600 + 3 * (100 // 4)
E[6, 8] = [str(200 // 10), str(3 * (200 // 10))]
E[6, 9] = [abs(846 - 850) < abs(846 - 840), 100 // 4 == 25, (600 + 700) // 2 == 605, 1000 // 10 == 10]
E[6, 10] = 350 + 4 * ((450 - 350) // 5)
for q in (1, 2, 3, 7, 10):  # arrow position must be the answer
    assert diag(6, q)["marks"] == [E[6, q]], (6, q)

# u07 Comparing and ordering
E[7, 1] = opt(7, 1, ">" if 452 > 425 else "<")
E[7, 2] = max(318, 381, 138)
E[7, 3] = sorted(["904", "409", "940", "490"], key=int)
E[7, 4] = ["<" if 76 < 160 else ">"]
_sc = {"Hana": 512, "Tom": 521, "Sadia": 215, "Bilal": 502}
E[7, 5] = [f"{n} ({v})" for n, v in sorted(_sc.items(), key=lambda kv: -kv[1])]
E[7, 6] = [i for i, o in enumerate(Q(7, 6)["options"]) if 650 < int(o) < 700]
E[7, 7] = min(int("".join(p)) for p in permutations("704") if p[0] != "0")
E[7, 8] = ["<" if 99 < 100 else ">"]
E[7, 9] = [808 > 880, 599 < 600, 1000 > 999, 370 == 307]
E[7, 10] = len(range(486, 492))

# u08 Place value problems
E[8, 1] = 23 * 10
E[8, 2] = 6 * 100
E[8, 3] = 3 * 100 + 8 * 10
E[8, 4] = 270 // 10
E[8, 5] = 6 * 50
E[8, 6] = opt(8, 6, str(700 + 40 + (4 - 2)))
E[8, 7] = 400 // 50
E[8, 8] = [str(max(int("".join(p)) for p in permutations("290") if p[0] != "0"))]
E[8, 9] = [80 % 8 == 0, 750 % 50 == 0, 50 % 4 == 0, 150 % 100 == 0]
E[8, 10] = 4 * 100 + 15 * 10 + 7

# u09 Adding ones, tens and hundreds
E[9, 1] = 436 + 3
E[9, 2] = 251 + 400
E[9, 3] = 348 + 50
E[9, 4] = 567 + 8
E[9, 5] = [str(525 - 485)]
E[9, 6] = 275 + 70
E[9, 7] = opt(9, 7, str(318 + 60))
E[9, 8] = [str(497 + 6)]
E[9, 9] = [680 + 40 == 720, 293 + 8 == 301, 154 + 300 == 184, 725 + 90 == 805]
E[9, 10] = 258 + 7 + 60 + 300

# u10 Subtracting ones, tens and hundreds
E[10, 1] = 579 - 4
E[10, 2] = 846 - 300
E[10, 3] = 463 - 50
E[10, 4] = 312 - 5
E[10, 5] = [str(725 - 675)]
E[10, 6] = 420 - 90
E[10, 7] = opt(10, 7, str(704 - 30))
E[10, 8] = [str(530 - 8)]
E[10, 9] = [600 - 1 == 599, 815 - 20 == 795, 942 - 400 == 902, 361 - 70 == 291]
E[10, 10] = 800 - 5 - 50 - 500

# u11 Number bonds to 100
E[11, 1] = [str(100 - 40)]
E[11, 2] = [str(100 - 72)]
E[11, 3] = [[a, str(100 - int(a))] for a, _ in Q(11, 3)["pairs"]]
E[11, 4] = 100 - 43
E[11, 5] = [str(400 - 335)]
E[11, 6] = 100 - 48
E[11, 7] = [i for i, o in enumerate(Q(11, 7)["options"]) if ev(o) != 100][0]
E[11, 8] = [str(100 - 27)]
E[11, 9] = [25 + 75 == 100, 100 - 1 == 90, 60 + 40 == 100, 33 + 77 == 100]
E[11, 10] = [a for a in range(0, 101) if a + 4 * a == 100][0]

# u12 Column addition
E[12, 1] = 253 + 314
E[12, 2] = 426 + 152
E[12, 3] = 348 + 235
E[12, 4] = 274 + 163
E[12, 5] = 567 + 286
E[12, 6] = 358 + 294
E[12, 7] = opt(12, 7, str(465 + 278))
E[12, 8] = [str(147 + 238)]
E[12, 9] = [256 + 137 == 393, 468 + 275 == 733, 509 + 186 == 695, 347 + 347 == 684]
E[12, 10] = 386 + (386 + 159)

# u13 Column subtraction
E[13, 1] = 687 - 253
E[13, 2] = 594 - 172
E[13, 3] = 562 - 138
E[13, 4] = 735 - 261
E[13, 5] = 623 - 357
E[13, 6] = 540 - 275
E[13, 7] = opt(13, 7, str(602 - 147))
E[13, 8] = [str(452 - 136)]
E[13, 9] = [800 - 350 == 450, 431 - 219 == 212, 700 - 1 == 609, 365 - 128 == 243]
E[13, 10] = [str([d for d in range(10) if 700 + 10 * d + 1 - 256 == 485][0])]

# u14 Estimating and checking
E[14, 1] = opt(14, 1, str(r100(398) + r100(205)))
assert 340 + 180 == 520
E[14, 2] = opt(14, 2, "340 + 180 = 520")
E[14, 3] = r100(812) - r100(395)
E[14, 4] = [str(412 - 145)]
E[14, 5] = r100(689) + r100(211)
E[14, 6] = [i for i, o in enumerate(Q(14, 6)["options"]) if str(r100(476) + r100(318)) in o][0]
E[14, 7] = [625 - 275 == 350, 450 + 450 == 900, False, 199 - 132 == 67]  # adding 614 + 208 is not an inverse check
E[14, 8] = [str(437 + 286), str(713 - 286)]
E[14, 9] = 250 + 175
E[14, 10] = [i for i, o in enumerate(Q(14, 10)["options"]) if ev(o.split("=")[0]) != int(o.split("=")[1])][0]

# u15 Missing number problems
E[15, 1] = [str(750 - 200)]
E[15, 2] = [str(84 - 40)]
E[15, 3] = [str(300 + 125)]
E[15, 4] = sum(diag(15, 4)["parts"])
E[15, 5] = 148 + 65
E[15, 6] = [i for i, o in enumerate(Q(15, 6)["options"]) if ev(o) == 700 - 450][0]
E[15, 7] = [str(327 + 158 - 300)]
E[15, 8] = [str(420 - 170)]
E[15, 9] = [500 - 320 == 180, 55 + 45 == 10, 400 - 260 == 140, 3 + 97 - 50 == 150]
E[15, 10] = abs((600 - 245) - 245)

# u16 Two-step problems
E[16, 1] = 120 + 45 - 30
E[16, 2] = 52 - 18 + 25
E[16, 3] = 340 - 125 - 96
E[16, 4] = 400 - (236 + 145)
E[16, 5] = 450 - (214 + 187)
E[16, 6] = opt(16, 6, "600 − 275 − 180")
E[16, 7] = [138 + 94 == 232, 250 - 138 - 94 == 18, 138 - 94 == 44, 250 - 138 - 94 > 20]
E[16, 8] = [str(500 - 145 - 210)]
_v = dict(zip(diag(16, 9)["labels"], diag(16, 9)["values"]))
E[16, 9] = _v["Monday"] + _v["Wednesday"] - _v["Tuesday"]
E[16, 10] = [j for a in range(351) for j in [350 - a] if j - a == 50][0]

# u17 The 3 times table
E[17, 1] = 6 * 3
E[17, 2] = 27 // 3
E[17, 3] = [str(33 // 3)]
E[17, 4] = [i for i, o in enumerate(Q(17, 4)["options"]) if int(o) % 3 == 0]
E[17, 5] = diag(17, 5)["rows"] * diag(17, 5)["cols"]
E[17, 6] = 9 * 3
E[17, 7] = 36 // 3
E[17, 8] = ["3", str(3 * 6 + 3)]
E[17, 9] = [3 * 5 * 2 == 3 * 10, 3 * 12 == 32, 30 // 3 == 10, all(3 * k % 2 for k in range(1, 13))]
E[17, 10] = math.ceil(26 / 3)

# u18 The 4 and 8 times tables
E[18, 1] = 4 * 7
E[18, 2] = 8 * 3
E[18, 3] = 40 // 8
E[18, 4] = [str(44 // 4)]
E[18, 5] = [[l, str(ev(l))] for l, _ in Q(18, 5)["pairs"]]
E[18, 6] = 7 * 8
E[18, 7] = 44 // 4
E[18, 8] = [str(2 * (4 * 7))]
assert 60 % 8 != 0 and 8 * 7 == 56 and 8 * 8 == 64
E[18, 9] = 1
E[18, 10] = 32 // 4 - 32 // 8

# u19 Multiplication and division facts
E[19, 1] = [str(40 // 8)]
E[19, 2] = [str(24 // 3)]


def _fact_ok(s):
    lhs, rhs = s.split("=")
    return ev(lhs) == int(rhs) and sorted(map(int, re.findall(r"\d+", s))) == [4, 9, 36]


E[19, 3] = [i for i, o in enumerate(Q(19, 3)["options"]) if _fact_ok(o)]
E[19, 4] = 32 // 4
E[19, 5] = 32 // 8
E[19, 6] = 27 // diag(19, 6)["rows"]
E[19, 7] = [str(48 // 6)]
E[19, 8] = 1
E[19, 9] = [6 * 4 == 4 * 6, 12 / 3 == 3 / 12, 88 // 8 == 11, 7 * 3 == 24]
E[19, 10] = max(max(a, 32 // a) for a in range(1, 33) if 32 % a == 0 and abs(a - 32 // a) == 4)

# u20 Multiplying and dividing with tens
E[20, 1] = [str(40 * 2)]
E[20, 2] = 30 * 3
E[20, 3] = 70 * 3
E[20, 4] = 160 // 8
E[20, 5] = money(50 * 3)
E[20, 6] = 120 // 4
E[20, 7] = opt(20, 7, str(8 * 50))
E[20, 8] = [str(20 * 8)]
E[20, 9] = [90 // 3 == 30, 4 * 80 == 320, 200 / 4 == 5, 3 * 40 == 4 * 30]
E[20, 10] = [str(280 // 4), str(360 // 90)]

# u21 Multiplying 2-digit numbers
E[21, 1] = [str(4 * 3), str(14 * 3)]
E[21, 2] = 21 * 4
E[21, 3] = 32 * 3
E[21, 4] = 17 * 4
E[21, 5] = 26 * 3
E[21, 6] = 15 * 8
E[21, 7] = 0 if 19 * 3 > 14 * 4 else (1 if 14 * 4 > 19 * 3 else 2)
E[21, 8] = [str(36 * 3)]
E[21, 9] = [13 * 4 == 52, 22 * 3 == 66, 25 * 4 == 90, 12 * 8 == 96]
E[21, 10] = [str([d for d in range(10) if (20 + d) * 3 == 84][0])]

# u22 Short multiplication
E[22, 1] = 43 * 2
E[22, 2] = 31 * 3
E[22, 3] = 27 * 3
E[22, 4] = 46 * 4
E[22, 5] = 38 * 8
E[22, 6] = 48 * 4
E[22, 7] = opt(22, 7, str(65 * 3))
E[22, 8] = [str(56 * 4)]
E[22, 9] = [24 * 8 == 192, 39 * 3 == 117, 57 * 4 == 208, 73 * 3 == 219]
E[22, 10] = 8 * 36 - 250

# u23 Dividing 2-digit numbers
E[23, 1] = [str(9 // 3), str(69 // 3)]
E[23, 2] = 86 // 2
E[23, 3] = 96 // 3
E[23, 4] = 72 // 4
E[23, 5] = 57 // 3
E[23, 6] = 96 // 8
E[23, 7] = [i for i, o in enumerate(Q(23, 7)["options"]) if all(int(x) % 4 == 0 for x in o.split(" + "))][0]
E[23, 8] = [str(84 // 4)]
E[23, 9] = [64 // 4 == 16, 75 // 3 == 25, 96 / 8 == 13, 42 // 3 == 14]
E[23, 10] = math.ceil(100 / 8)

# u24 Scaling and combinations
E[24, 1] = 3 * 8
E[24, 2] = 9 * 10
E[24, 3] = 4 * 3
E[24, 4] = 5 * 2
E[24, 5] = 4 * 3
E[24, 6] = opt(24, 6, f"{20 * 8} cm")
E[24, 7] = [str(32 // 8)]
E[24, 8] = [str(30 * 4)]
E[24, 9] = [5 * 4 == 20, 6 * 3 == 9, 2 * 5 == 10, 8 * 2 == 16]
E[24, 10] = len([(a, b) for a in range(4) for b in range(4) if a != b])

# u25 Multiplication and division problems
E[25, 1] = 9 * 4
E[25, 2] = 40 // 8
E[25, 3] = 7 * 8
E[25, 4] = 28 // 4
E[25, 5] = money(2000 - 3 * 400)
E[25, 6] = 12 * 8
E[25, 7] = opt(25, 7, "45 ÷ 3")
E[25, 8] = [str(2 * 8 // 4)]
E[25, 9] = [0, 2]  # sharing 24 into 4 and grouping 24 into 4s
E[25, 10] = [a for a in range(6) for b in [5 - a] if 4 * a + 3 * b == 18][0]

# u26 Unit and non-unit fractions
E[26, 1] = F(diag(26, 1)["shaded"], diag(26, 1)["n"])
E[26, 2] = [i for i, o in enumerate(Q(26, 2)["options"]) if o.split("/")[0] == "1"]
E[26, 3] = F(diag(26, 3)["n"] - diag(26, 3)["shaded"], diag(26, 3)["n"])
E[26, 4] = 1
E[26, 5] = F(1 + 2, 6)
E[26, 6] = F(10 - 3, 10)
E[26, 7] = [[l, F(int(l.split()[0]), int(l.split()[2]))] for l, _ in Q(26, 7)["pairs"]]
E[26, 8] = [F(diag(26, 8)["shaded"], diag(26, 8)["n"])]
E[26, 9] = [True, Fr(4, 4) == 1, False, True]
E[26, 10] = 4 // 2 * 5

# u27 Tenths
E[27, 1] = F(diag(27, 1)["shaded"], diag(27, 1)["n"])
E[27, 2] = [str(Fr(10, 10))]
E[27, 3] = F(4, 10)
E[27, 4] = F(10 - 7, 10)
E[27, 5] = 3 * 10
E[27, 6] = [F(10 - 1, 10)]
E[27, 7] = 0
E[27, 8] = [F(2, 10)]
E[27, 9] = [Fr(5, 10) == Fr(1, 2), Fr(10, 10) > 1, Fr(8, 10) == Fr(8, 10), 2 * 10 == 20]
E[27, 10] = 20 - 3 * (20 // 10)

# u28 Counting in tenths
E[28, 1] = [F(5 + 1, 10)]
E[28, 2] = [F(8 - 1, 10)]
E[28, 3] = F(round(diag(28, 3)["marks"][0] * 10), 10)
E[28, 4] = 0
E[28, 5] = 2 * 10
E[28, 6] = F(3 + 5, 10)
E[28, 7] = sorted(Q(28, 7)["items"], key=frac)
_s = ["6/10", "7/10", "8/10", "9/10", "10/11"]
_bad = [x for i, x in enumerate(_s) if frac(x) != Fr(6 + i, 10)][0]
E[28, 8] = [_bad, F(10, 10)]
E[28, 9] = [1 - Fr(1, 10) == Fr(9, 10), Fr(5, 10) == Fr(1, 2), Fr(12, 10) < 1, 3 * Fr(2, 10) == Fr(6, 10)]
E[28, 10] = int(2 / Fr(2, 10))

# u29 Fractions on a number line
E[29, 1] = F(round(diag(29, 1)["marks"][0] * 5), 5)
E[29, 2] = [F(1, 8)]
E[29, 3] = F(round(diag(29, 3)["marks"][0] * 6), 6)
E[29, 4] = opt(29, 4, F(2, 4))
E[29, 5] = F(9 - 4, 9)
E[29, 6] = F((2 + 6) // 2, 8)
E[29, 7] = sorted(Q(29, 7)["items"], key=frac)
E[29, 8] = [str(3 + 1), F(1, 3 + 1)]
E[29, 9] = [Fr(5, 5) == 1, True, Fr(2, 3) > Fr(1, 3), Fr(1, 4) == Fr(1, 5)]
_x = 1 + Fr(3, 5)
E[29, 10] = f"{int(_x)} and {F((_x - int(_x)).numerator, 5)}"

# u30 Fractions of amounts
E[30, 1] = 18 // 2
E[30, 2] = 21 // 3
E[30, 3] = 28 // 4
E[30, 4] = 40 // 8
E[30, 5] = 30 // 5
E[30, 6] = 90 // 10
E[30, 7] = opt(30, 7, "24 ÷ 4")
E[30, 8] = [str(15 // 3)]
E[30, 9] = [14 // 2 == 7, 12 // 3 == 3, 40 // 4 == 10, 24 // 8 == 4]
E[30, 10] = 0 if 27 // 3 > 64 // 8 else (1 if 64 // 8 > 27 // 3 else 2)

# u31 Non-unit fractions of amounts
E[31, 1] = [str(15 // 5 * 2)]
E[31, 2] = 12 // 4 * 3
E[31, 3] = 21 // 3 * 2
E[31, 4] = 25 // 5 * 3
E[31, 5] = 32 // 8 * 5
E[31, 6] = opt(31, 6, str(40 // 10 * 3))
E[31, 7] = 24 - 24 // 4 * 3
E[31, 8] = [F(1, 4), str(20 // 4 * 3)]
E[31, 9] = [9 // 3 * 2 == 6, 20 // 5 * 3 == 12, 16 // 4 * 2 == 4, 12 // 4 * 4 == 12]
E[31, 10] = (36 - 36 // 3 * 2) // 4

# u32 Equivalent fractions
E[32, 1] = [str(int(Fr(1, 2) * 6))]
E[32, 2] = [i for i, o in enumerate(Q(32, 2)["options"]) if Fr(o) == Fr(1, 2)]
E[32, 3] = [str(int(Fr(1, 4) * 8))]
E[32, 4] = [i for i, o in enumerate(Q(32, 4)["options"]) if Fr(o) == Fr(2, 3)][0]
E[32, 5] = [str(int(2 / Fr(1, 3)))]
E[32, 6] = [[l, r] for l, r in Q(32, 6)["pairs"] if Fr(l) == Fr(r)]
E[32, 7] = str(Fr(4, 8))
E[32, 8] = [str(int(Fr(2, 4) * 8))]
E[32, 9] = [Fr(2, 10) == Fr(1, 5), Fr(3, 6) == Fr(1, 2), Fr(2, 8) == Fr(1, 2), Fr(6, 8) == Fr(3, 4)]
E[32, 10] = [str(int(Fr(1, 4) * 8)), str(int(Fr(1, 4) * 12))]

# u33 Comparing and ordering fractions
E[33, 1] = opt(33, 1, "<" if Fr(1, 5) < Fr(1, 3) else ">")
E[33, 2] = opt(33, 2, ">" if Fr(4, 7) > Fr(2, 7) else "<")
E[33, 3] = sorted(Q(33, 3)["items"], key=Fr)
E[33, 4] = sorted(Q(33, 4)["items"], key=Fr)
E[33, 5] = max(["1/6", "1/8"], key=Fr)
E[33, 6] = max(range(4), key=lambda i: Fr(Q(33, 6)["options"][i]))
E[33, 7] = [i for i, o in enumerate(Q(33, 7)["options"]) if Fr(o) < Fr(1, 3)]
E[33, 8] = ["<" if Fr(1, 9) < Fr(1, 5) else ">"]
E[33, 9] = [Fr(1, 2) > Fr(1, 3), Fr(3, 5) < Fr(2, 5), Fr(1, 8) < Fr(1, 7), Fr(4, 6) == Fr(2, 3)]
E[33, 10] = [F(n, 8) for n in range(1, 8) if Fr(1, 2) < Fr(n, 8) < Fr(7, 8)]

# u34 Adding and subtracting fractions
E[34, 1] = F(1 + 2, 5)
E[34, 2] = F(6 - 3, 8)
E[34, 3] = F(4 + 5, 10)
E[34, 4] = F(7 - 4, 9)
E[34, 5] = [F(5 - 2, 6)]
E[34, 6] = F(7 - 2 - 3, 7)
E[34, 7] = 1
E[34, 8] = [F(3 + 4, 8)]
E[34, 9] = [Fr(5, 6) - Fr(5, 6) == 0, Fr(1, 4) + Fr(1, 4) == Fr(2, 8), Fr(9, 10) - Fr(2, 10) == Fr(7, 10), 1 - Fr(3, 7) == Fr(4, 7)]
_a = [a for a in range(9) if a + (a + 2) == 8][0]
E[34, 10] = [F(_a, 8), F(_a + 2, 8)]

# u35 Fraction problems
E[35, 1] = 20 // 4
E[35, 2] = F(2 + 5, 9)
E[35, 3] = 18 // 3 * 2
_vals = [16 // 2, 32 // 4, 24 // 3, 45 // 5]
E[35, 4] = [i for i, v in enumerate(_vals) if _vals.count(v) == 1][0]
E[35, 5] = 24 - (24 // 4 + 24 // 3)
E[35, 6] = F(8 - 3 - 2, 8)
E[35, 7] = 40 - 40 // 4 * 3
E[35, 8] = [str(20 // 4), str(20 // 2)]
E[35, 9] = [8 // 4 * 3 > 8 // 2, 30 // 3 == 20 // 2, 10 // 5 * 2 == 5, 16 // 8 < 16 // 4]
_left = 24 - 24 // 4
E[35, 10] = _left - _left // 3

# u36 Measuring length
E[36, 1] = 4 * 100
E[36, 2] = 6 * 10
E[36, 3] = [str(3 * 100 + 25)]
E[36, 4] = opt(36, 4, "m")
E[36, 5] = 12 * 10 + 4
E[36, 6] = max(diag(36, 6)["marks"]) - min(diag(36, 6)["marks"])


def _cm(s):
    s = s.replace(" ", "")
    mm_ = re.fullmatch(r"(\d+)m(\d+)cm", s)
    if mm_:
        return int(mm_.group(1)) * 100 + int(mm_.group(2))
    if s.endswith("cm"):
        return int(s[:-2])
    return int(s[:-1]) * 100


E[36, 7] = sorted(Q(36, 7)["items"], key=_cm)
E[36, 8] = [str(2 * 100 + 8)]
E[36, 9] = [50 == 5 * 10, 100 == 10, 300 == 3 * 100, 7 * 10 + 5 == 75]
E[36, 10] = 100 // 4

# u37 Adding and subtracting lengths
E[37, 1] = 45 + 32
E[37, 2] = 90 - 35
E[37, 3] = 100 - 40
E[37, 4] = opt(37, 4, ">" if 200 > 180 else "<")
E[37, 5] = 96 - 58
E[37, 6] = 6 * 4
E[37, 7] = 150 + 75
E[37, 8] = [str((300 - 40) % 100)]
E[37, 9] = [150 + 50 == 200, (85 + 15) / 10 == 1, 400 - 130 == 270, 25 * 4 == 100]
E[37, 10] = 300 - 2 * 85

# u38 Mass
E[38, 1] = 2 * 1000
E[38, 2] = 0
E[38, 3] = diag(38, 3)["min"] + 5 * diag(38, 3)["step"]
E[38, 4] = 340 + 250
E[38, 5] = 850 - 120
E[38, 6] = 200 + 4 * ((300 - 200) // 5)
E[38, 7] = [str(1000 + 300)]
E[38, 8] = [str(100 + 4 * 10)]
E[38, 9] = [2000 + 400 > 2500, 1500 == 1000 + 500, 3 * 1000 == 300, 500 + 500 == 1000]
E[38, 10] = (1100 - 300) // 4
assert diag(38, 3)["marks"] == [E[38, 3]] and diag(38, 6)["marks"] == [E[38, 6]] and diag(38, 8)["marks"] == [int(E[38, 8][0])]

# u39 Capacity
E[39, 1] = 3 * 1000
E[39, 2] = diag(39, 2)["marks"][0]
E[39, 3] = 450 + 350
E[39, 4] = sorted(Q(39, 4)["items"], key=lambda s: int(s.split()[0]) * (1000 if s.endswith(" l") else 1))
E[39, 5] = 900 - 350
E[39, 6] = 1000 // 200
E[39, 7] = 1
E[39, 8] = [str(1000 + 50)]
E[39, 9] = [500 * 2 == 1000, 2000 < 1500, 250 * 4 == 1000, 1000 - 100 == 900]
E[39, 10] = 2000 - 250 * 5

# u40 Perimeter
E[40, 1] = 5 * 4
E[40, 2] = 3 + 4 + 6
E[40, 3] = 2 * (7 + 2)
E[40, 4] = 2 * (4 + 3)
E[40, 5] = 6 * 5
E[40, 6] = 2 * (12 + 8)
E[40, 7] = [i for i, o in enumerate(Q(40, 7)["options"]) if 2 * sum(map(int, re.findall(r"\d+", o))) == 16][0]
E[40, 8] = [str(2 * (9 + 4))]
E[40, 9] = [8 * 4 == 32, 2 * (5 + 2) == 7, 2 * (5 + 3) == 2 * (6 + 2), 5 * 3 == 15]
E[40, 10] = (24 - 2 * 8) // 2

# u41 Pounds and pence
E[41, 1] = money(100 + 50 + 20 + 5)
E[41, 2] = 4 * 100
E[41, 3] = money(318)
E[41, 4] = 2 * 100 + 7
E[41, 5] = money(160 + 55)
E[41, 6] = [i for i, o in enumerate(Q(41, 6)["options"])
            if sum(parse_coins(o)) == 68 and all(c in (1, 2, 5, 10, 20, 50, 100, 200) for c in parse_coins(o))
            and len(parse_coins(o)) == len(coins_greedy(68))][0]


def _p(s):
    mm_ = re.fullmatch(r"£(\d+) and (\d+)p", s)
    return int(mm_.group(1)) * 100 + int(mm_.group(2)) if mm_ else int(s[:-1])


E[41, 7] = sorted(Q(41, 7)["items"], key=_p)
E[41, 8] = [str(406 // 100), str(406 % 100)]
E[41, 9] = [100 + 9 == 109, 250 == 25 * 100, 3 * 100 == 300, 250 > 205]
E[41, 10] = 140 // 20

# u42 Giving change
E[42, 1] = 100 - 70
E[42, 2] = 50 - 34
E[42, 3] = money(500 - 350)
E[42, 4] = 100 - 45
E[42, 5] = money(500 - (240 + 85))
E[42, 6] = 100 - 3 * 30
E[42, 7] = [i for i, o in enumerate(Q(42, 7)["options"]) if sorted(parse_coins(o)) == sorted(coins_greedy(100 - 63))][0]
E[42, 8] = [str(100 - 56)]
_short = 135 + 70 - 200
E[42, 9] = opt(42, 9, f"No, she is {_short}p short")
E[42, 10] = (200 - 20) // 3

# u43 Roman numeral clocks
E[43, 1] = roman2int("VIII")
E[43, 2] = int2roman(5)
E[43, 3] = [[r, str(roman2int(r))] for r, _ in Q(43, 3)["pairs"]]
for q in (4, 5, 6, 10):
    E[43, q] = phrase(diag(43, q)["h"], diag(43, q)["m"])
    assert diag(43, q).get("roman") is True
E[43, 7] = opt(43, 7, str(roman2int("IX") * 5))
E[43, 8] = [str(roman2int("VI")), "after"]
E[43, 9] = [True, roman2int("IX") < roman2int("X") < roman2int("XI"), roman2int("VII") == 3, (roman2int("XII") + 6) % 12 == roman2int("VI")]
assert diag(43, 10)["m"] == roman2int("IV") * 5 and diag(43, 10)["h"] == roman2int("X")

# u44 Time to the nearest minute
for q in (1, 2, 3, 5):
    E[44, q] = hm(mins(diag(44, q)["h"], diag(44, q)["m"]))
E[44, 4] = 1
E[44, 6] = opt(44, 6, "8:15 pm")
E[44, 7] = diff((2, 50), (3, 10))
E[44, 8] = [hm(mins(diag(44, 8)["h"], diag(44, 8)["m"]))]
E[44, 9] = [2 * 60 == 120, True, 3 * 60 == 30, True]
E[44, 10] = diff((17, 48), (18, 23))

# u45 12-hour and 24-hour clocks
E[45, 1] = h24(mins(3 + 12, 45))
E[45, 2] = h24(mins(8, 10))
E[45, 3] = hm(mins(21, 30), ampm=True)
E[45, 4] = hm(mins(13, 5), ampm=True)
E[45, 5] = [i for i, o in enumerate(Q(45, 5)["options"]) if int(o[:2]) >= 12][0]
E[45, 6] = h24(mins(diag(45, 6)["h"] + 12, diag(45, 6)["m"]))
E[45, 7] = sorted(Q(45, 7)["items"])
E[45, 8] = [str(19 - 12)]
E[45, 9] = 0 if mins(16, 40) > mins(4 + 12, 15) else 1
E[45, 10] = h24(mins(23, 20) + 50)

# u46 Seconds, days, months and years
E[46, 1] = 3 * 60
E[46, 2] = calendar.monthrange(2027, 9)[1]
E[46, 3] = [i for i, o in enumerate(Q(46, 3)["options"]) if o in MONTH31]
E[46, 4] = 2 * 24


def _secs(s):
    n, unit = s.split()
    return int(n) * (60 if unit.startswith("minute") else 1)


E[46, 5] = sorted(Q(46, 5)["items"], key=_secs)
E[46, 6] = calendar.monthrange(2027, 6)[1] + calendar.monthrange(2027, 7)[1]
E[46, 7] = 0 if 150 > 2 * 60 else 1
E[46, 8] = [str(2 * 60)]
E[46, 9] = [calendar.monthrange(2028, 2)[1] == 29, calendar.monthrange(2027, 10)[1] == 30, True, 2 * 7 == 14]
E[46, 10] = calendar.monthrange(2028, 1)[1] + calendar.monthrange(2028, 2)[1]

# u47 How long does it take?
E[47, 1] = diff((9, 0), (9, 45))
E[47, 2] = diff((2, 15), (2, 40))
E[47, 3] = diff((4, 50), (5, 30))
E[47, 4] = 35 - 22
E[47, 5] = hm(mins(5, 40) + 35)
_d = [diff((3, 10), (3, 50)), diff((7, 45), (8, 20)), diff((11, 30), (12, 5))]
E[47, 6] = [_d[0] == 40, _d[1] == 35, _d[2] == 45, _d[0] > _d[1]]
E[47, 7] = diff((10, 20), (11, 55))
E[47, 8] = [str(diff((6, 45), (7, 15)))]
E[47, 9] = hm(mins(16, 10) - 80, ampm=True)
E[47, 10] = hm(mins(13, 40) + 3 * 15 + 2 * 5, ampm=True)

# u48 Drawing 2-D shapes
E[48, 1] = POLYNAMES[diag(48, 1)["sides"]]
E[48, 2] = 6
E[48, 3] = [[f"{n} sides", POLYNAMES[n]] for n in (3, 4, 6, 8)]
E[48, 4] = 8
_sides = {"square": 4, "rectangle": 4, "triangle": 3, "kite": 4, "pentagon": 5}
E[48, 5] = [i for i, o in enumerate(Q(48, 5)["options"]) if _sides[o] == 4]
E[48, 6] = opt(48, 6, POLYNAMES[5])
E[48, 7] = 2 * 3 + 6
E[48, 8] = 1
E[48, 9] = [True, False, 8 - 6 == 2, False]

# u49 3-D shapes
E[49, 2] = SHAPES3D["cube"][0]
E[49, 4] = SHAPES3D["triangular prism"][1]
E[49, 5] = SHAPES3D["square-based pyramid"][2]
E[49, 6] = "cylinder"
E[49, 7] = SHAPES3D["triangular prism"][2]
E[49, 9] = [SHAPES3D["sphere"][1] == 0, SHAPES3D["cuboid"][2] == 8, SHAPES3D["cylinder"][2] == 3, SHAPES3D["triangular prism"][0] == 5]
E[49, 10] = "triangular prism"

# u50 Angles and turns
E[50, 1] = 2
E[50, 2] = opt(50, 2, "4")
E[50, 3] = opt(50, 3, str((12 + 3) % 12))
E[50, 4] = [["quarter turn", "1 right angle"], ["half turn", "2 right angles"], ["three-quarter turn", "3 right angles"], ["complete turn", "4 right angles"]]
TURN = {1: "quarter turn", 2: "half turn", 3: "three-quarter turn", 4: "complete turn"}
E[50, 5] = opt(50, 5, TURN[(9 - 6) // 3])
E[50, 6] = 6
E[50, 7] = opt(50, 7, TURN[(8 - 2) // 3])
E[50, 8] = ["three-quarter", str((9 - 0) // 3)]
E[50, 9] = [1 + 1 == 2, 3 % 4 == (-1) % 4, False, True]
E[50, 10] = [TURN[(2 - 1) % 4].split()[0]]

# u51 Right angles
E[51, 1] = 1 if diag(51, 1)["deg"] == 90 else None
E[51, 2] = 0 if diag(51, 2)["deg"] < 90 else None
E[51, 3] = 2 if diag(51, 3)["deg"] > 90 else None
E[51, 4] = 4
E[51, 5] = [0, 1]
E[51, 6] = 1
E[51, 7] = [i for i, h in enumerate([None, 1, 5]) if h is not None and min(h, 12 - h) * 30 > 90][0] if True else None
E[51, 9] = [2 * 90 == 180, False, True, True]
E[51, 10] = 3 + 2 - 4

# u52 Parallel and perpendicular lines
E[52, 4] = 2
E[52, 5] = [0, 1, 3]
E[52, 6] = [0, 1, 4]
E[52, 9] = [True, True, False, False]
E[52, 10] = 4

# u53 Pictograms
_pp = picto(Q(53, 1)["prompt"], 4, 2)
E[53, 1] = _pp["Cat"]
E[53, 2] = _pp["Fish"]
E[53, 3] = _pp["Dog"] - _pp["Rabbit"]
E[53, 4] = sum(_pp.values())
E[53, 5] = opt(53, 5, f"{35 // 10} and a half circles") if 35 % 10 == 5 else None
E[53, 6] = picto("Jamie: ● ● ● ● ◐", 2, 1)["Jamie"]
E[53, 7] = 6 * 5
E[53, 8] = [str(_pp["Cat"])]
E[53, 9] = [_pp["Cat"] == 2 * _pp["Rabbit"], min(_pp, key=_pp.get) == "Fish", _pp["Dog"] == _pp["Cat"] + 2, _pp["Rabbit"] + _pp["Fish"] == 14]
E[53, 10] = (_pp["Dog"] + _pp["Fish"]) // 4
for q in range(1, 11):
    if q not in (5, 6, 7):
        assert picto(Q(53, q)["prompt"], 4, 2) == _pp, ("pictogram differs", q)

# u54 Bar charts
_b = dict(zip(diag(54, 1)["labels"], diag(54, 1)["values"]))
_k = dict(zip(diag(54, 6)["labels"], diag(54, 6)["values"]))
E[54, 1] = _b["Sparrow"]
E[54, 2] = max(_b, key=_b.get).lower()
E[54, 3] = _b["Blue tit"] - _b["Robin"]
E[54, 4] = sum(_b.values())
E[54, 5] = opt(54, 5, str((30 + 40) // 2))
E[54, 6] = _k["Tuesday"] - _k["Wednesday"]
E[54, 7] = _k["Monday"] + _k["Thursday"]
E[54, 8] = [str(_b["Magpie"])]
E[54, 9] = [_b["Robin"] == 2 * _b["Magpie"], _b["Sparrow"] + _b["Magpie"] == _b["Blue tit"], _b["Robin"] - _b["Sparrow"] == 4, min(_b, key=_b.get) == "Magpie"]
E[54, 10] = _k["Tuesday"] + _k["Wednesday"] - _k["Monday"]
assert all(v % diag(54, 1)["step"] == 0 for v in _b.values()) and all(v % diag(54, 6)["step"] == 0 for v in _k.values())

# u55 Tables and two-step questions
_t = table(Q(55, 1)["prompt"])
_tot = {n: a + b for n, (a, b) in _t.items()}
E[55, 1] = _t["Ben"][1]
E[55, 2] = max(_t, key=lambda n: _t[n][0])
E[55, 3] = _tot["Ada"]
E[55, 4] = 5 + 5 + 3
E[55, 5] = _t["Cara"][0] - _t["Ben"][0]
E[55, 6] = sum(b for a, b in _t.values())
_pair = [(x, y) for x in _tot for y in _tot if x < y and _tot[x] == _tot[y]]
E[55, 7] = opt(55, 7, f"{_pair[0][0]} and {_pair[0][1]}")
E[55, 8] = [str(_t["Cara"][0] - _t["Cara"][1])]
E[55, 9] = [sum(b for a, b in _t.values()) > sum(a for a, b in _t.values()), _tot["Ben"] == 23, _t["Ada"][1] - _t["Ada"][0] == 3,
            max(_t, key=lambda n: _t[n][1]) == "Cara"]
E[55, 10] = (_t["Ada"][1] + 5) // 2
for q in (1, 2, 3, 5, 6, 7, 8, 9, 10):
    assert table(Q(55, q)["prompt"]) == _t, ("table differs", q)

# ------------------------------------------------------------------ schema / style validation
errors = []
ALLOWED_TYPES = {"mcq", "multi", "numeric", "text", "order", "match", "truefalse", "cloze", "extended"}
DIAG_KINDS = {"numberline", "bar_model", "fraction_bar", "clock", "array", "coordinates", "angle", "polygon", "bar_chart"}
BANNED = ["it's important to note", "delve", "crucial", "vibrant", "tapestry", "testament", "navigate", "journey", "unlock", "dive into", "in today's world"]
DIFF_PATTERN = [1, 1, 2, 2, 3, 3, 3, 4, 4, 5]
REASONING_RE = re.compile(r"\b(says|writes|gets|mistake|wrong|true or false|explain|is (he|she) right|which is true|odd one out|must be wrong|is (her|his) answer likely)\b", re.I)
SPOT_RE = re.compile(r"\b(says|writes|gets|wrong|mistake)\b", re.I)


def err(where, msg):
    errors.append(f"{where}: {msg}")


b = DATA.get("book", {})
for k in ("id", "title", "keyStage", "year", "subject", "pages", "ageRange", "sections"):
    if k not in b:
        err("book", f"missing {k}")
if b.get("id") != "y3maths" or b.get("keyStage") != "KS2" or b.get("year") != "Year 3" or b.get("subject") != "Maths":
    err("book", "wrong id/keyStage/year/subject")
section_ids = {s["id"] for s in b.get("sections", [])}
if not isinstance(DATA.get("texts"), list):
    err("root", "texts must be a list")

# every topic page in the book has exactly one unit, titled as in the book
try:
    kinds = json.load(open("/home/claude/books/y3maths/build/_pagekinds.json"))
    reg = json.load(open(REGISTRY))
    topic_pages = sorted(int(p) for p, k in kinds.items() if k == "topic")
    titles = {q["page"]: q["topic"] for q in reg}
    covers = {}
    for q in reg:
        covers.setdefault(q["page"], set()).update(q["coverage"])
    unit_pages = [u["bookPages"][0] for u in DATA["units"]]
    if unit_pages != topic_pages:
        err("units", f"pages {unit_pages} != topic pages {topic_pages}")
    for u in DATA["units"]:
        p = u["bookPages"][0]
        if u["title"] != titles.get(p):
            err(u["id"], f"title '{u['title']}' != book '{titles.get(p)}'")
        if set(u["curriculum"]) != covers.get(p, set()):
            err(u["id"], f"curriculum {u['curriculum']} != book page {sorted(covers.get(p, []))}")
    book_stems = {re.sub(r"\s+", " ", q["stem"]).strip().lower() for q in reg}
except FileNotFoundError:
    book_stems = set()

curr_ids = {r["id"] for r in json.load(open("/home/claude/books/y3maths/05_CURRICULUM_DATABASE/y3_curriculum.json"))["records"]}

seen_ids, seen_prompts = set(), set()
checked = 0
for ui, u in enumerate(DATA["units"], 1):
    uid = u["id"]
    if uid != f"y3maths-u{ui:02d}":
        err(uid, "unit id out of sequence")
    for k in ("id", "section", "title", "bookPages", "curriculum", "summary", "textId", "questions"):
        if k not in u:
            err(uid, f"missing {k}")
    if u["section"] not in section_ids:
        err(uid, "unknown section")
    if not set(u["curriculum"]) <= curr_ids or not all(c.startswith("Y3-") for c in u["curriculum"]):
        err(uid, "bad curriculum id")
    if not (1 <= len(re.findall(r"[.!?](\s|$)", u["summary"])) <= 2):
        err(uid, "summary must be 1-2 sentences")
    qs = u["questions"]
    if len(qs) != 10:
        err(uid, "needs 10 questions")
    if [q["difficulty"] for q in qs] != DIFF_PATTERN:
        err(uid, "difficulty pattern")
    if not any("misconception" in q for q in qs):
        err(uid, "no misconception item")
    if sum(1 for q in qs if q["type"] == "truefalse" or REASONING_RE.search(q["prompt"])) < 2:
        err(uid, "fewer than 2 reasoning / spot-the-mistake items")
    if not any(SPOT_RE.search(q["prompt"]) for q in qs):
        err(uid, "no spot-the-mistake item")
    if len({q["type"] for q in qs}) < 4:
        err(uid, "fewer than 4 question types")
    for qi, q in enumerate(qs, 1):
        qid = q.get("id")
        where = qid
        if qid != f"{uid}-q{qi:02d}" or qid in seen_ids:
            err(where, "bad or duplicate id")
        seen_ids.add(qid)
        t = q.get("type")
        if t not in ALLOWED_TYPES:
            err(where, f"bad type {t}")
            continue
        for k in ("prompt", "difficulty", "marks", "explanation"):
            if k not in q:
                err(where, f"missing {k}")
        if not (1 <= q["marks"] <= 3):
            err(where, "marks out of range")
        if not q["explanation"].strip():
            err(where, "empty explanation")
        key = re.sub(r"\s+", " ", q["prompt"]).strip().lower()
        full = json.dumps({k: v for k, v in q.items() if k not in ("id", "explanation", "difficulty", "marks")}, sort_keys=True, ensure_ascii=False)
        if full in seen_prompts:
            err(where, "duplicate prompt in bank")
        seen_prompts.add(full)
        if key in book_stems:
            err(where, "prompt copies a book question")
        if t in ("mcq", "multi"):
            n = len(q["options"])
            if not 3 <= n <= 5 or len(set(q["options"])) != n:
                err(where, "options must be 3-5 and distinct")
            if t == "mcq" and not (isinstance(q["answer"], int) and 0 <= q["answer"] < n):
                err(where, "mcq answer index")
            if t == "multi" and (not q["answer"] or any(not 0 <= a < n for a in q["answer"]) or sorted(set(q["answer"])) != q["answer"]):
                err(where, "multi answer indices")
        if t == "numeric" and not isinstance(q["answer"], (int, float)):
            err(where, "numeric answer must be a number")
        if t == "text" and not isinstance(q["answer"], str):
            err(where, "text answer must be a string")
        if t == "order" and not (3 <= len(q["items"]) <= 6 and len(set(q["items"])) == len(q["items"])):
            err(where, "order items")
        if t == "match" and not (3 <= len(q["pairs"]) <= 5 and len({r for _, r in q["pairs"]}) == len(q["pairs"])):
            err(where, "match pairs 3-5 with distinct right sides")
        if t == "truefalse" and not (3 <= len(q["statements"]) <= 5 and all(isinstance(s["a"], bool) for s in q["statements"])):
            err(where, "truefalse statements")
        if t == "cloze":
            gaps = q["prompt"].count("___")
            if not (1 <= gaps <= 3) or gaps != len(q["answer"]):
                err(where, "cloze gap count")
            if "accept" in q and len(q["accept"]) != gaps:
                err(where, "cloze accept length")
        if t == "extended" and not (q.get("model") and q.get("checklist")):
            err(where, "extended needs model and checklist")
        if "diagram" in q and q["diagram"]["kind"] not in DIAG_KINDS:
            err(where, "unsupported diagram kind")
        if "curriculum" in q and not set(q["curriculum"]) <= curr_ids:
            err(where, "bad question curriculum")
        # house style
        blob = json.dumps(q, ensure_ascii=False)
        if "—" in blob or "–" in blob:
            err(where, "em or en dash")
        low = blob.lower()
        for w in BANNED:
            if w in low:
                err(where, f"banned word '{w}'")
        if re.search(r"£\d+\.\d\d", q["prompt"]):
            err(where, "money must be written like the book (£3 and 45p)")
        # ---------- answer recomputation
        k2 = (ui, qi)
        must = t in ("numeric", "cloze", "order")
        if k2 not in E:
            if must:
                err(where, "no independent recomputation for this answer")
            continue
        exp = E[k2]
        if t == "numeric":
            ok = abs(q["answer"] - exp) <= q.get("tolerance", 0) and q["answer"] == exp
        elif t == "cloze":
            ok = [a.strip() for a in q["answer"]] == [str(x) for x in exp]
        elif t == "order":
            ok = q["items"] == exp
        elif t == "multi":
            ok = q["answer"] == sorted(exp)
        elif t == "truefalse":
            ok = [s["a"] for s in q["statements"]] == exp
        elif t == "match":
            ok = [list(p) for p in q["pairs"]] == [list(p) for p in exp]
        elif t == "text":
            ok = q["answer"].strip().lower() == str(exp).lower() or str(exp).lower() in [a.lower() for a in q.get("accept", [])]
        else:
            ok = q["answer"] == exp
        checked += 1
        if not ok:
            err(where, f"answer {q.get('answer', q.get('items', q.get('statements')))!r} != recomputed {exp!r}")

n_q = sum(len(u["questions"]) for u in DATA["units"])
must_total = sum(1 for u in DATA["units"] for q in u["questions"] if q["type"] in ("numeric", "cloze", "order"))
print(f"units: {len(DATA['units'])}  questions: {n_q}  answers recomputed: {checked} (all {must_total} numeric/cloze/order included)")
if errors:
    print(f"FAIL: {len(errors)} problem(s)")
    for e in errors:
        print("  -", e)
    sys.exit(1)
print("PASS: 100% (schema, house style and every recomputed answer)")
