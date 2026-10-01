#!/usr/bin/env python3
"""Checker for the gcse_englang website practice bank.

Checks, all of which must pass:
  1. Schema (CONTENT_SCHEMA.txt): book, sections, texts, units, question objects and type-specific fields.
  2. Distribution: 10 questions per unit, difficulty profile 1,1,2,2,3,3,3,4,4,5, at least 1 misconception item,
     at least 2 reasoning / spot-the-error items, at least 1 'which is stronger' comparison item, varied types.
  3. Texts: 15-40 lines; public-domain passages are verbatim from the Project Gutenberg files in the book's
     sources folder (whitespace and line breaks aside); originals are labelled "Written for Inkworks Press".
  4. Quotations: every “...” quotation in our questions, explanations, models and checklists is verbatim in the
     unit's text (case-insensitive, whitespace-normalised; an ellipsis … splits a quotation into ordered parts).
  5. Line references: every line number is inside the text; a quotation tied to a line reference, either
     “quote” (line N) or Line N: “quote”, is found within those lines; quotations in a prompt that names
     ‘lines A to B’ lie within A to B.
  6. House style in our own text (quotations from source texts removed first): no em dashes, no banned filler
     words, no spelled-out numbers from two upwards, no emojis, no American -ize/-yze/color spellings.
  7. Examiner-report citations: any explanation that cites an examiner report names a year.
  8. Mark-scheme wording: checklists, models, summaries and explanations share no run of 7 or more words with
     AQA's mark schemes in the sources folder (paraphrase, never copy).
Warnings (printed, not failures): possible 'rule of three' lists in our own text.
Run: python3 check_gcse_englang.py   (exit code 0 = 100% pass)
"""
import json, re, sys, os, glob, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(HERE, "gcse_englang.json")
BOOK = "/home/claude/books/gcse_englang"
PG_DIR = os.path.join(BOOK, "sources", "texts")
AQA_DIR = os.path.join(BOOK, "sources")

# Public-domain passages: text id -> list of (Gutenberg number, start phrase, end phrase)
PD = {
    "t-missbrill": [(1429, "Although it was so brilliantly fine", "something gentle seemed to move in her bosom.")],
    "t-gardenparty": [(1429, "And after all the weather was ideal.", "a dark wet curl stamped on each cheek.")],
    "t-firstball": [(1429, "Exactly when the ball began Leila", "those wisps as a keepsake, as a remembrance.")],
    "t-voyage": [(1429, "The Picton boat was due to leave", "fallen into the cream.")],
    "t-jacob": [(5670, "\"So of course,\" wrote Betty Flanders", "Mrs. Flanders had been a widow for these two years.")],
    "t-dalloway": [(71865, "Mrs. Dalloway said she would buy the flowers herself.", "waiting to cross, very upright.")],
    "t-streets": [(882, "The last drunken man, who shall find his way home", "nor the houses of habitation.")],
    "t-mayhew": [(55998, "The little watercress girl who gave me", "only on a Sunday.”")],
    "t-voyageout": [(144, "As the streets that lead from the Strand", "took a turn along the pavement.")],
    "t-prussian": [(22480, "They had marched more than thirty kilometres since dawn", "But he walked almost lightly.")],
    "t-fire": [(2429, "But he was safe.  Toes and nose and cheeks", "was a mantle of fresh and disordered\nsnow.")],
    "t-bliss": [(44385, "Although Bertha Young was thirty", "and the cold air fell on her arms.")],
    "t-sack": [(535, "It was already hard upon October before I was ready", "warm and dry for a bed.")],
    "t-cabins": [(675, "I SHALL never forget the one-fourth serious", "on a most inaccessible shelf.")],
    "t-bahia": [(944, "BAHIA, OR SAN SALVADOR.", "before it reached the ground.")],
    "t-help": [(935, "“HEAVEN helps those who help themselves”", "institutions rather than by their own conduct.")],
    "t-kew": [(29220, "From the oval-shaped flower-bed there rose", "for he wished to go on with his thoughts.")],
    "t-buchan": [(558, "I returned from the City about three o’clock", "the best bored man in the United Kingdom.")],
}
# Quotations that are deliberately wrong (the item asks the learner to spot the misquotation).
DELIBERATE_MISQUOTES = {"gcse_englang-u02-q08": ["in a single day"]}

TYPES = {"mcq", "multi", "numeric", "text", "order", "match", "truefalse", "cloze", "extended"}
KINDS = {"prose", "poem", "playscript", "nonfiction"}
CURRIC_OK = re.compile(r"^(AO[1-9]|DFE-(UNSEEN|R[1-4]|W[12]|AIMS|S[1-3])|OFQ-UNSEEN-3C)$")
PROFILE = [1, 1, 2, 2, 3, 3, 3, 4, 4, 5]
BANNED = ["it's important to note", "it is important to note", "delve", "crucial", "vibrant", "tapestry", "testament",
          "navigate", "journey", "unlock", "dive into", "in today's world"]
NUMBER_WORDS = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
                "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
                "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million"]
US_SPELL = re.compile(r"\b(\w+iz(e|es|ed|ing|ation)|analyz\w*|colou?r\b(?<!colour)|color\w*|center\b|favorite)\b", re.I)
QUOTE_RX = re.compile(r"“([^”]*)”")
STRONGER_RX = re.compile(r"\n(Answer|Sentence|Version|Opening|Plan|Student|Ending) A\b")
REASON_RX = re.compile(r"(what is wrong|what is the problem|what is the error|what has the student misunderstood|what have they missed|"
                       r"why is this|why does|why is there|why might|why are|why do|is this right|misquotes|what would an examiner|"
                       r"what is the main problem|what is the main risk|why is ‘|explain|which comment|which statement|which answer is stronger|"
                       r"which (version|opening|plan|sentence|line|ending|correction) is|which .* is (stronger|more accurate|more secure|better|preferred)|spelt wrongly|errors in|is spelt correctly)", re.I)

fails, warns = [], []


def fail(where, msg):
    fails.append(f"{where}: {msg}")


def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("_", "")
    s = unicodedata.normalize("NFC", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def join_lines(lines):
    out = ""
    for l in lines:
        l = l.strip()
        if not out:
            out = l
        elif out.endswith("-") and not out.endswith("--") and l[:1].isalpha():
            out += l
        else:
            out += " " + l
    return out


def source_text(pg):
    raw = open(os.path.join(PG_DIR, f"pg{pg}.txt"), encoding="utf-8").read().replace("\r", "")
    return raw


def cut(pg, start, end):
    raw = source_text(pg)
    rx = lambda t: r"\s+".join(re.escape(w) for w in t.split())
    m1 = re.search(rx(start), raw)
    if not m1:
        return None
    m2 = re.compile(rx(end)).search(raw, m1.start())
    if not m2:
        return None
    return join_lines(raw[m1.start():m2.end()].split("\n"))


def quotes_in(s):
    return QUOTE_RX.findall(s)


def strip_quotes(s):
    return QUOTE_RX.sub(" ", s)


def found_in(q, hay):
    parts = [p for p in re.split(r"\s*…\s*", q) if p.strip()]
    pos = 0
    for p in parts:
        i = hay.find(norm(p), pos)
        if i < 0:
            return False
        pos = i + len(norm(p))
    return True


def line_span(lines, a, b):
    return norm(join_lines(lines[a - 1:b]))


def all_strings(q):
    """(field, string) pairs for every piece of our text in a question."""
    out = [("prompt", q.get("prompt", "")), ("explanation", q.get("explanation", ""))]
    if q.get("misconception"):
        out.append(("misconception", q["misconception"]))
    for o in q.get("options", []) or []:
        out.append(("option", o))
    for st in q.get("statements", []) or []:
        out.append(("statement", st.get("s", "")))
    for p in q.get("pairs", []) or []:
        out += [("pair", p[0]), ("pair", p[1])]
    for it in q.get("items", []) or []:
        out.append(("item", it))
    if q.get("type") == "extended":
        out.append(("model", q.get("model", "")))
        for c in q.get("checklist", []):
            out.append(("checklist", c))
    if isinstance(q.get("answer"), str):
        out.append(("answer", q["answer"]))
    return out


TITLE_EXEMPT = ["The Thirty-Nine Steps"]


def style_check(where, s):
    t = strip_quotes(s)
    for ex in TITLE_EXEMPT:
        t = t.replace(ex, " ")
    if "—" in t or " – " in t:
        fail(where, "em dash (or spaced en dash) in our text")
    low = t.lower().replace("’", "'")
    low_nums = re.sub(r"‘[^’]*’", " ", t).lower()  # example language in single quotes is exempt from the numeral rule
    for b in BANNED:
        if re.search(r"\b" + re.escape(b) + r"\b", low):
            fail(where, f"banned word/phrase '{b}'")
    for w in NUMBER_WORDS:
        if re.search(r"\b" + w + r"\b", low_nums):
            fail(where, f"number written as a word: '{w}'")
    if any(ord(ch) > 0xFFFF for ch in t):
        fail(where, "emoji or non-BMP character")
    for m in US_SPELL.finditer(t):
        word = m.group(0).lower()
        if "siz" in word or word in {"prize", "prizes", "seize", "citizen", "citizens"} or word.endswith("ise"):
            continue
        fail(where, f"possible American spelling '{m.group(0)}'")
    # rule-of-three heuristic: 'A, B and C' with short items, not preceded by another comma item
    for m in re.finditer(r"(?:^|[.;:?!]\s+|\b(?:with|of|for|to|the|a|an|is|are|was|were|by|from)\s+)"
                         r"([A-Za-z’'-]+(?: [A-Za-z’'-]+)?), ([A-Za-z’'-]+(?: [A-Za-z’'-]+)?),? and ([A-Za-z’'-]+(?: [A-Za-z’'-]+)?)\b", t):
        warns.append(f"{where}: possible list of three: '{m.group(0).strip()}'")


def aqa_ngrams(n=7):
    grams = set()
    for f in glob.glob(os.path.join(AQA_DIR, "AQA-*MS*.txt")):
        words = re.findall(r"[a-z’']+", open(f, encoding="utf-8", errors="ignore").read().lower().replace("’", "'"))
        for i in range(len(words) - n + 1):
            grams.add(" ".join(words[i:i + n]))
    return grams


def main():
    data = json.load(open(JSON_PATH, encoding="utf-8"))
    for k in ("book", "texts", "units"):
        if k not in data:
            fail("root", f"missing '{k}'")
    book = data["book"]
    for k in ("id", "title", "keyStage", "year", "subject", "pages", "ageRange", "sections"):
        if k not in book:
            fail("book", f"missing '{k}'")
    if book.get("id") != "gcse_englang":
        fail("book", "id must be gcse_englang")
    if book.get("keyStage") not in {"KS1", "KS2", "KS3", "KS4"}:
        fail("book", "bad keyStage")
    secs = {s["id"] for s in book.get("sections", [])}
    for s in book.get("sections", []):
        if not re.match(r"^#[0-9A-Fa-f]{6}$", s.get("colour", "")):
            fail("book.sections", f"bad colour for {s.get('id')}")
    style_check("book.title", book.get("title", ""))

    # ---------------- texts
    texts = {}
    for t in data["texts"]:
        tid = t.get("id", "?")
        for k in ("id", "title", "author", "source", "kind", "lines", "glossary"):
            if k not in t:
                fail(tid, f"text missing '{k}'")
        if t.get("kind") not in KINDS:
            fail(tid, "bad kind")
        lines = t.get("lines", [])
        if not (15 <= len(lines) <= 40):
            fail(tid, f"text has {len(lines)} lines (need 15-40)")
        if any((not isinstance(l, str)) or not l.strip() for l in lines):
            fail(tid, "empty or non-string line")
        joined = norm(join_lines(lines))
        ours = joined
        if tid in PD:
            for pg, a, b in PD[tid]:
                block = cut(pg, a, b)
                if block is None:
                    fail(tid, f"PD start/end phrase not found in pg{pg}")
                    continue
                if norm(block) not in joined:
                    fail(tid, f"PD passage from pg{pg} is not verbatim in the text lines")
                if norm(block) not in norm(join_lines(source_text(pg).split("\n"))):
                    fail(tid, f"PD passage not found in pg{pg} (normalised)")
                ours = ours.replace(norm(block), " ")
                if f"Project Gutenberg #{pg}" not in t.get("source", ""):
                    fail(tid, f"source line does not cite Project Gutenberg #{pg}")
            if "Public domain in the UK" not in t.get("source", ""):
                fail(tid, "PD source line must say 'Public domain in the UK.'")
        if tid not in PD or "Inkworks" in t.get("author", ""):
            if "Written for Inkworks Press" not in t.get("source", ""):
                fail(tid, "original text must be labelled 'Written for Inkworks Press'")
        style_check(tid + ".ours", ours)
        style_check(tid + ".title", t.get("title", ""))
        style_check(tid + ".source", re.sub(r"“[^”]*”", " ", t.get("source", "")))
        for g in t.get("glossary", []):
            if not (isinstance(g, list) and len(g) == 2):
                fail(tid, f"bad glossary entry {g}")
                continue
            style_check(tid + ".glossary", g[1])
            terms = [x.strip(" “”") for x in g[0].split(",")]
            for term in terms:
                if norm(term) not in joined:
                    fail(tid, f"glossary term '{term}' not in text")
        texts[tid] = t

    # ---------------- units
    used = set()
    grams = aqa_ngrams()
    seen_ids = set()
    for ui, u in enumerate(data["units"], 1):
        uid = u.get("id", f"unit{ui}")
        if uid != f"gcse_englang-u{ui:02d}":
            fail(uid, "unit id out of sequence")
        for k in ("id", "section", "title", "bookPages", "curriculum", "summary", "textId", "questions"):
            if k not in u:
                fail(uid, f"missing '{k}'")
        if u.get("section") not in secs:
            fail(uid, "section not in book.sections")
        if not u.get("bookPages") or any((not isinstance(p, int)) or not (1 <= p <= book.get("pages", 0)) for p in u["bookPages"]):
            fail(uid, "bad bookPages")
        for c in u.get("curriculum", []):
            if not CURRIC_OK.match(c):
                fail(uid, f"unknown curriculum id {c}")
        if not u.get("curriculum"):
            fail(uid, "no curriculum ids")
        style_check(uid + ".title", u.get("title", ""))
        style_check(uid + ".summary", u.get("summary", ""))
        tid = u.get("textId")
        if tid not in texts:
            fail(uid, f"textId {tid} not found")
            continue
        used.add(tid)
        lines = texts[tid]["lines"]
        hay = norm(join_lines(lines))
        qs = u.get("questions", [])
        if len(qs) != 10:
            fail(uid, f"{len(qs)} questions (need 10)")
        diffs = [q.get("difficulty") for q in qs]
        if diffs != PROFILE:
            fail(uid, f"difficulty profile {diffs} != {PROFILE}")
        if sum(1 for q in qs if q.get("misconception")) < 1:
            fail(uid, "no misconception-targeted item")
        if sum(1 for q in qs if REASON_RX.search(q.get("prompt", ""))) < 2:
            fail(uid, "fewer than 2 reasoning / spot-the-error items")
        if not any(STRONGER_RX.search(q.get("prompt", "")) for q in qs):
            fail(uid, "no 'which is stronger' comparison item")
        if len({q.get("type") for q in qs}) < 4:
            fail(uid, "fewer than 4 question types")
        for qi, q in enumerate(qs, 1):
            qid = q.get("id", "?")
            w = qid
            if qid != f"{uid}-q{qi:02d}":
                fail(w, "question id out of sequence")
            if qid in seen_ids:
                fail(w, "duplicate id")
            seen_ids.add(qid)
            t = q.get("type")
            if t not in TYPES:
                fail(w, f"bad type {t}")
            for k in ("prompt", "difficulty", "marks", "explanation"):
                if k not in q:
                    fail(w, f"missing '{k}'")
            if not isinstance(q.get("difficulty"), int) or not 1 <= q["difficulty"] <= 5:
                fail(w, "difficulty must be 1-5")
            mk = q.get("marks")
            if t == "extended":
                if not isinstance(mk, int) or not 1 <= mk <= 8:
                    fail(w, "extended marks must be 1-8")
                if not q.get("model") or not isinstance(q.get("checklist"), list) or len(q["checklist"]) < 3:
                    fail(w, "extended needs model and a checklist of 3+ points")
            elif not isinstance(mk, int) or not 1 <= mk <= 3:
                fail(w, "marks must be 1-3")
            if t == "mcq":
                o = q.get("options", [])
                if not 3 <= len(o) <= 5:
                    fail(w, "mcq needs 3-5 options")
                if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(o):
                    fail(w, "mcq answer index invalid")
                if len(set(o)) != len(o):
                    fail(w, "duplicate options")
            elif t == "multi":
                o = q.get("options", [])
                a = q.get("answer", [])
                if len(o) < 3 or not isinstance(a, list) or not a or len(set(a)) != len(a) or any(not isinstance(i, int) or not 0 <= i < len(o) for i in a) or len(a) >= len(o):
                    fail(w, "multi options/answer invalid")
            elif t == "truefalse":
                st = q.get("statements", [])
                if not 3 <= len(st) <= 5 or any(not isinstance(x.get("a"), bool) or not x.get("s") for x in st):
                    fail(w, "truefalse needs 3-5 statements with boolean answers")
                if all(x.get("a") for x in st) or not any(x.get("a") for x in st):
                    fail(w, "truefalse should mix true and false")
            elif t == "match":
                p = q.get("pairs", [])
                if not 3 <= len(p) <= 5 or any(len(x) != 2 for x in p):
                    fail(w, "match needs 3-5 pairs")
                if len({x[1] for x in p}) != len(p) or len({x[0] for x in p}) != len(p):
                    fail(w, "match sides must be unique")
            elif t == "order":
                if len(q.get("items", [])) < 3:
                    fail(w, "order needs 3+ items")
            elif t == "cloze":
                n = q.get("prompt", "").count("___")
                a = q.get("answer", [])
                if not 1 <= n <= 3 or not isinstance(a, list) or len(a) != n:
                    fail(w, "cloze gaps and answers do not match")
                acc = q.get("accept", [])
                if acc and (not isinstance(acc, list) or len(acc) > n):
                    fail(w, "cloze accept malformed")
            elif t == "text":
                if not isinstance(q.get("answer"), str):
                    fail(w, "text answer must be a string")

            # ---- quotations, line references, style, AQA wording
            allowed = [norm(x) for x in DELIBERATE_MISQUOTES.get(qid, [])]
            for field, s in all_strings(q):
                where = f"{w}.{field}"
                for qt in quotes_in(s):
                    if norm(qt) in allowed:
                        continue
                    if not found_in(qt, hay):
                        fail(where, f"quotation not verbatim in {tid}: “{qt}”")
                # “quote” (line N) / (lines N to M)
                for m in re.finditer(r"“([^”]*)”[,.]?\s*\((?:line|lines) (\d+)(?: (?:to|and|-) (\d+))?\)", s):
                    a, b = int(m.group(2)), int(m.group(3) or m.group(2))
                    if not (1 <= a <= b <= len(lines)):
                        fail(where, f"line reference {a}-{b} outside text")
                    elif not found_in(m.group(1), line_span(lines, a, b)):
                        fail(where, f"“{m.group(1)}” is not in line(s) {a}-{b}")
                # Line N: “quote”  /  Lines N to M: “quote”
                for m in re.finditer(r"\b[Ll]ines? (\d+)(?: (?:to|and|-) (\d+))?:\s*“([^”]*)”", s):
                    a, b = int(m.group(1)), int(m.group(2) or m.group(1))
                    if not (1 <= a <= b <= len(lines)):
                        fail(where, f"line reference {a}-{b} outside text")
                    elif not found_in(m.group(3), line_span(lines, a, b)):
                        fail(where, f"“{m.group(3)}” is not in line(s) {a}-{b}")
                for m in re.finditer(r"\b[Ll]ines? (\d+)(?: (?:to|and|-) (\d+))?", s):
                    a, b = int(m.group(1)), int(m.group(2) or m.group(1))
                    if not (1 <= a <= b <= len(lines)):
                        fail(where, f"line reference {a}-{b} outside text ({len(lines)} lines)")
                style_check(where, s)
                if field in ("checklist", "model", "explanation", "misconception"):
                    words = re.findall(r"[a-z’']+", strip_quotes(s).lower().replace("’", "'"))
                    for i in range(len(words) - 6):
                        g = " ".join(words[i:i + 7])
                        if g in grams:
                            fail(where, f"7-word run matches AQA mark scheme wording: '{g}'")
                            break
            # prompt naming a line range: quotes in the prompt must lie inside it
            pm = re.search(r"\b[Ll]ines (\d+) to (\d+)\b", q.get("prompt", ""))
            if pm:
                a, b = int(pm.group(1)), int(pm.group(2))
                span = line_span(lines, a, b) if 1 <= a <= b <= len(lines) else ""
                for qt in quotes_in(q["prompt"]):
                    if norm(qt) in allowed:
                        continue
                    if not found_in(qt, span):
                        fail(w + ".prompt", f"“{qt}” is outside lines {a} to {b} named in the prompt")
            ex = q.get("explanation", "")
            if re.search(r"examiner report", ex, re.I) and not re.search(r"\b(19|20)\d\d\b", ex):
                fail(w, "explanation cites an examiner report without a year")
            if q.get("misconception") and re.search(r"report", ex, re.I) and not re.search(r"\b20(19|2[0-6])\b", ex):
                fail(w, "misconception item cites a report without a valid year (2019-2026)")
    for tid in texts:
        if tid not in used:
            fail(tid, "text not used by any unit")

    total_q = sum(len(u.get("questions", [])) for u in data["units"])
    print(f"Units: {len(data['units'])}  Questions: {total_q}  Texts: {len(texts)}")
    if warns:
        print(f"\nWarnings ({len(warns)}), review by hand:")
        for x in warns:
            print("  WARN", x)
    if fails:
        print(f"\nFAILURES ({len(fails)}):")
        for x in fails:
            print("  FAIL", x)
        print(f"\nResult: FAIL ({len(fails)} problems)")
        sys.exit(1)
    print("\nResult: 100% PASS")


if __name__ == "__main__":
    main()
