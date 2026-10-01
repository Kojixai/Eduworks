#!/usr/bin/env python3
"""Checker for the Macbeth website practice bank (macbeth.json).

Run:  python3 check_macbeth.py      (exit code 0 only when every check passes)

Checks, all of which must pass:
  1. Schema (CONTENT_SCHEMA.txt): book, sections, units and every question object, with the fields each
     question type needs. Match items: left and right values unique (the site rejects repeated right values).
  2. Coverage: one unit per content page of the printed guide (pages 6-23, 25-33, 35-43, 45-50, 52-68),
     titles exactly as the book's page headings, bookPages correct, section colours from book/config.py.
  3. Distribution per unit: 10 questions; difficulty profile 1,1,2,2,3,3,3,4,4,5; at least 1 misconception item;
     at least 2 reasoning / spot-the-error items; at least 4 question types. Plot, character and theme units also
     contain: a 'who says' item with a line reference, an order item, a true/false item, a quotation cloze,
     a 'which quotation best supports' item, a context item and 1 or 2 extended items with a model and checklist.
     Exam-skills units together cover all 4 boards.
  4. Quotations: every “...” quotation anywhere in our text is either
       (a) Shakespeare, matched character for character against Project Gutenberg #1533 (sources/gutenberg_1533.txt);
           a ' / ' in a quotation must fall where Gutenberg breaks the verse line, and nowhere else; cloze gaps are
           filled with the answer before checking; or
       (b) an exam-board, examiner-report or historical quotation found in the downloaded source files
           (sources/*.txt, sources/web/*.txt), whitespace and case aside.
     No em dashes anywhere, including inside quotations.
  5. Line references: every act.scene.line reference exists in the Folger line table (sources/macbeth_lines_folger.tsv).
     A reference that follows a quotation must cover that quotation exactly: at least 85% of the quotation's words
     appear in order in the Folger text of the cited lines, and the first and last cited lines each contain part of
     the quotation (no padding). When the quotation comes from content/quote_bank_verified.json, the cited range
     must sit inside the bank's folger_ref.
  6. 'Who says' items: the correct option begins with the Folger speaker of the cited lines.
  7. House style in our own text (quotations removed): no banned filler words, no spelled-out numbers from 2 up,
     no American spellings, no emojis.
  8. Lady Macbeth's death: any mention of her suicide is presented as reported ('as ’tis thought', reported, rumoured).
  9. Facts: no unofficial Edexcel timing presented as fact; Eduqas never credited with assessing AO3 on Shakespeare.
 10. Mark-scheme wording: models, checklists and explanations share no run of 8+ words with board mark schemes.
 11. Numeric items: the answer appears in the research pack's published marks for the board named in the prompt.
 12. Originality: no prompt is too close (word-set overlap above 0.6) to a question printed in the book (_registry.json);
     curriculum ids exist in the research pack.
Warnings (printed, not failures): possible 'rule of three' lists in our own text, for human review.
"""
import json, re, sys, os, glob, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(HERE, "macbeth.json")
BOOK = "/home/claude/books/macbeth"
SRC = os.path.join(BOOK, "sources")
GUT = open(os.path.join(SRC, "gutenberg_1533.txt"), encoding="utf-8").read()
BANK = json.load(open(os.path.join(BOOK, "content", "quote_bank_verified.json"), encoding="utf-8"))

fails, warns = [], []
def fail(where, msg): fails.append(f"{where}: {msg}")

# ---------------------------------------------------------------- Folger line table
FOLGER = {}          # (act, scene, line) -> (speaker, text)
for row in open(os.path.join(SRC, "macbeth_lines_folger.tsv"), encoding="utf-8").read().splitlines()[1:]:
    ref, spk, txt = row.split("\t")
    a, s, l = ref.split(".")
    FOLGER[(int(a), int(s), int(l))] = (spk, txt)

def _key(w):
    w = re.sub(r"(.)\1+", r"\1", w)
    return w[0] + re.sub(r"[aeiouy]", "", w[1:])

def toks(s):
    """Word keys that ignore spelling variants between Gutenberg and Folger (kill’d/killed, tow’ring/towering, th’/the)."""
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = s.lower().replace("’", "").replace("'", "").replace("-", "")
    return [_key(w) for w in re.findall(r"[a-z]+", s)]

def parse_ref(a, s, l1, l2):
    a, s, l1 = int(a), int(s), int(l1)
    l2 = int(l2) if l2 else l1
    return a, s, l1, l2

def bank_range(ref):
    a, s, ls = ref.split(".")
    l1, _, l2 = ls.partition("-")
    return int(a), int(s), int(l1), int(l2 or l1)

def norm_space(s):
    return re.sub(r"\s+", " ", s.replace("\n", " / ")).strip()

BANK_SPANS = [(norm_space(q["gutenberg_exact_span"].replace("\n", " / ")), bank_range(q["folger_ref"])) for q in BANK]

# ---------------------------------------------------------------- source files for non-Shakespeare quotations
def flat(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("ﬁ", "fi").replace("ﬂ", "fl")
    s = re.sub(r"-\s*\n\s*", "", s)
    return re.sub(r"\s+", " ", s).lower().strip()
EXTERNAL = ""
for f in sorted(glob.glob(os.path.join(SRC, "*.txt")) + glob.glob(os.path.join(SRC, "web", "*.txt"))):
    if os.path.basename(f) == "gutenberg_1533.txt":
        continue
    EXTERNAL += flat(open(f, encoding="utf-8", errors="ignore").read()) + " || "

def in_gutenberg(q):
    """Strict match: ' / ' must be a Gutenberg line break; a plain space may be a space or a prose line wrap."""
    parts = q.split(" / ")
    rx = r"[ \t]*\n[ \t]*".join(r"\s+".join(re.escape(w) for w in p.split()) for p in parts)
    return re.search(rx, GUT) is not None

def in_external(q):
    return flat(q) in EXTERNAL

# ---------------------------------------------------------------- house style
BANNED = ["it's important to note", "it is important to note", "delve", "crucial", "vibrant", "tapestry", "testament",
          "navigate", "journey", "unlock", "dive into", "in today's world", "in today’s world"]
NUMBER_WORDS = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
                "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
                "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand"]
US_SPELL = re.compile(r"\b((real|recogn|organ|emphas|critic|summar|character|apolog|memor|priorit|symbol|sympath|final|minim|maxim)iz(e|es|ed|ing|ation)|analyz\w*|color\w*|center\b|favorite|behavior\w*|honor\b|labor\b|theater)\b", re.I)
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
QUOTE_RX = re.compile(r"“([^“”]*)”")
REF_RX = re.compile(r"\b([1-5])\.([1-8])\.(\d{1,3})(?:-(\d{1,3}))?\b")
QREF_RX = re.compile(r"“([^“”]*)”[,.;:!?]?\s*\(([1-5])\.([1-8])\.(\d{1,3})(?:-(\d{1,3}))?\)")
REASON_RX = re.compile(r"(what is wrong|spot the|what has the student|which comment|which statement is (most )?accurate|"
                       r"why does|why is|why might|why do|why would|explain|which sentence|which paragraph|which answer|"
                       r"which plan|which thesis|which opening|which reading|best supports|most precise|stronger|best advice|what does this change|which change|what would|gone wrong|improve|"
                       r"what would an examiner|misread|mistake|error|which is the better|evaluate|how far)", re.I)
CONTEXT_RX = re.compile(r"(context|Holinshed|King James|James I|James VI|Daemonologie|North Berwick|Gunpowder|Folio|"
                        r"divine right|Great Chain|Forman|Middleton|1606|1605|1623|Lumphanan|Garnet|equivocat|audience in|real (Macbeth|Duncan)|histor)", re.I)
BOARDS = ["AQA", "Edexcel", "OCR", "Eduqas"]
DEATH_RX = re.compile(r"(suicide|killed herself|kills herself|took her own life|takes her own life|took off her life|by self and violent hands)", re.I)
DEATH_OK = re.compile(r"(student writes|as ’tis thought|reported|rumou?r|is said|says that|offstage|not shown|claims|according to)", re.I)

# ---------------------------------------------------------------- expected units (from the printed book)
def book_pages():
    h = open(os.path.join(BOOK, "book", "book.html"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r'<section class="page[^"]*" id="p(\d+)"[^>]*>(.*?)(?=<section class="page|\Z)', h, re.S):
        t = re.search(r"<h1[^>]*>(.*?)</h1>", m.group(2), re.S)
        if t:
            out[int(m.group(1))] = re.sub(r"\s+", " ", re.sub("<[^>]+>", "", t.group(1))).replace("&amp;", "&").strip()
    return out
CONTENT_PAGES = list(range(6, 24)) + list(range(25, 34)) + list(range(35, 44)) + list(range(45, 51)) + list(range(52, 69))
def section_of(p):
    return ("CTX" if p <= 10 else "PLOT" if p <= 23 else "CHAR" if p <= 33 else "THEME" if p <= 43 else
            "METH" if p <= 50 else "QUOTE" if p <= 56 else "EXAM")
sys.path.insert(0, os.path.join(BOOK, "book"))
import config as CFG  # noqa: E402

# ---------------------------------------------------------------- mark schemes (for wording overlap)
MS_WORDS = []
for f in glob.glob(os.path.join(SRC, "*_ms_*.txt")) + glob.glob(os.path.join(SRC, "*_MS_*.txt")) + glob.glob(os.path.join(SRC, "*_rms_*.txt")):
    MS_WORDS.append(toks(open(f, encoding="utf-8", errors="ignore").read()))
MS_GRAMS = set()
for w in MS_WORDS:
    for i in range(len(w) - 7):
        MS_GRAMS.add(" ".join(w[i:i + 8]))


def strip_quotes(s):
    return QUOTE_RX.sub(" Q ", s)


def check_quote(where, q):
    if "—" in q:
        fail(where, f"em dash inside quotation “{q}”")
    parts = [p.strip(" ,") for p in re.split(r"\.\.\.|…", q) if p.strip(" ,")]
    if not parts:
        return None
    gut = all(in_gutenberg(p) for p in parts)
    if gut:
        return "play"
    if all(in_external(p) for p in parts):
        return "external"
    fail(where, f"quotation not found in Gutenberg #1533 or the source files: “{q}”")
    return None


def check_ref_for_quote(where, q, a, s, l1, l2):
    for l in range(l1, l2 + 1):
        if (a, s, l) not in FOLGER:
            fail(where, f"reference {a}.{s}.{l} not in Folger table")
            return
    qt = [t for p in re.split(r"\.\.\.|…", q) for t in toks(p)]
    if not qt:
        return
    lines = [toks(FOLGER[(a, s, l)][1]) for l in range(l1, l2 + 1)]
    stream, owner = [], []
    for i, lt in enumerate(lines):
        stream += lt
        owner += [i] * len(lt)
    # greedy in-order match
    j, matched, used = 0, 0, set()
    for t in qt:
        k = j
        while k < len(stream) and stream[k] != t:
            k += 1
        if k < len(stream):
            matched += 1
            used.add(owner[k])
            j = k + 1
    ratio = matched / len(qt)
    if ratio < 0.85:
        fail(where, f"“{q}” does not match Folger {a}.{s}.{l1}-{l2} (ratio {ratio:.2f})")
        return
    if 0 not in used or (len(lines) - 1) not in used:
        fail(where, f"reference {a}.{s}.{l1}-{l2} is wider than “{q}”")
    nq = norm_space(q)
    for span, (ba, bs, b1, b2) in BANK_SPANS:
        if nq in span and len(nq) > 12:
            if not (ba == a and bs == s and b1 <= l1 and l2 <= b2):
                fail(where, f"“{q}” cited {a}.{s}.{l1}-{l2} but quote bank gives {ba}.{bs}.{b1}-{b2}")
            break


def text_fields(qn):
    """Yield (label, text) for every learner-facing string in a question (cloze gaps filled)."""
    p = qn.get("prompt", "")
    if qn.get("type") == "cloze":
        ans = qn.get("answer", [])
        for a in ans:
            p = p.replace("___", a, 1)
    yield "prompt", p
    for i, o in enumerate(qn.get("options", []) or []):
        yield f"option{i}", o
    for i, it in enumerate(qn.get("items", []) or []):
        yield f"item{i}", it
    for i, pr in enumerate(qn.get("pairs", []) or []):
        yield f"pairL{i}", pr[0]
        yield f"pairR{i}", pr[1]
    for i, st in enumerate(qn.get("statements", []) or []):
        yield f"stmt{i}", st["s"]
    if isinstance(qn.get("answer"), str):
        yield "answer", qn["answer"]
    for k in ("explanation", "misconception", "model"):
        if qn.get(k):
            yield k, qn[k]
    for i, c in enumerate(qn.get("checklist", []) or []):
        yield f"check{i}", c


def style_check(where, text, label=""):
    if "—" in text:
        fail(where, "em dash")
    own = strip_quotes(text)
    low = own.lower().replace("’", "'")
    for b in BANNED:
        if re.search(r"\b" + re.escape(b.replace("’", "'")) + r"\b", low):
            fail(where, f"banned word '{b}'")
    for n in NUMBER_WORDS:
        if re.search(r"\b" + n + r"\b", low):
            fail(where, f"spelled-out number '{n}'")
    m = US_SPELL.search(own)
    if m:
        fail(where, f"American spelling '{m.group(0)}'")
    if EMOJI.search(text):
        fail(where, "emoji")
    if "55 minutes" in text:
        fail(where, "unofficial Edexcel timing presented as fact")
    if re.search(r"Eduqas[^.]*\b(assesses|rewards|credits)\b[^.]*AO3", own) and not re.search(r"\bnot\b|\bno\b|n’t", own):
        fail(where, "Eduqas does not assess AO3 on Shakespeare")
    if label != "misconception" and DEATH_RX.search(text) and not DEATH_OK.search(text) and "Roman" not in text:
        fail(where, "Lady Macbeth's death must be presented as reported")


def check_question(uid, qn, idx, sec):
    where = f"{uid}-q{idx:02d}"
    if qn.get("id") != where:
        fail(where, f"id should be {where}")
    t = qn.get("type")
    if t not in {"mcq", "multi", "numeric", "text", "order", "match", "truefalse", "cloze", "extended"}:
        fail(where, f"bad type {t}")
        return
    for k in ("prompt", "difficulty", "marks", "explanation"):
        if k not in qn:
            fail(where, f"missing {k}")
    if not isinstance(qn.get("difficulty"), int) or not 1 <= qn["difficulty"] <= 5:
        fail(where, "difficulty 1-5")
    mk = qn.get("marks")
    if t == "extended":
        if not isinstance(mk, int) or not 1 <= mk <= 8:
            fail(where, "extended marks 1-8")
        if not qn.get("model") or not isinstance(qn.get("checklist"), list) or len(qn["checklist"]) < 3:
            fail(where, "extended needs model and checklist (3+)")
    elif not isinstance(mk, int) or not 1 <= mk <= 3:
        fail(where, "marks 1-3")
    if t in ("mcq", "multi"):
        o = qn.get("options", [])
        if not 3 <= len(o) <= 5 or len(set(o)) != len(o):
            fail(where, "options 3-5, unique")
        a = qn.get("answer")
        if t == "mcq" and not (isinstance(a, int) and 0 <= a < len(o)):
            fail(where, "mcq answer index")
        if t == "multi" and not (isinstance(a, list) and a and all(isinstance(x, int) and 0 <= x < len(o) for x in a) and len(set(a)) == len(a)):
            fail(where, "multi answer indices")
    if t == "numeric" and not isinstance(qn.get("answer"), (int, float)):
        fail(where, "numeric answer must be a number")
    if t == "text":
        if not isinstance(qn.get("answer"), str) or len(qn["answer"].split()) > 6:
            fail(where, "text answer must be short string")
    if t == "order":
        it = qn.get("items", [])
        if len(it) < 3 or len(set(it)) != len(it):
            fail(where, "order needs 3+ unique items")
    if t == "match":
        pr = qn.get("pairs", [])
        if not 3 <= len(pr) <= 5:
            fail(where, "match 3-5 pairs")
        if len({p[1] for p in pr}) != len(pr):
            fail(where, "match right-hand values must be unique")
        if len({p[0] for p in pr}) != len(pr):
            fail(where, "match left-hand values must be unique")
    if t == "truefalse":
        st = qn.get("statements", [])
        if not 3 <= len(st) <= 5 or not all(isinstance(x.get("a"), bool) for x in st):
            fail(where, "truefalse 3-5 statements with boolean a")
        if st and all(x["a"] for x in st) or st and not any(x["a"] for x in st):
            warns.append(f"{where}: all statements have the same answer")
    if t == "cloze":
        g = qn.get("prompt", "").count("___")
        a = qn.get("answer")
        if not 1 <= g <= 3 or not isinstance(a, list) or len(a) != g:
            fail(where, "cloze gaps 1-3 matching answers")
        if "accept" in qn and (not isinstance(qn["accept"], list) or len(qn["accept"]) != g):
            fail(where, "cloze accept must be list per gap")
    # text checks
    for label, txt in text_fields(qn):
        w = f"{where}.{label}"
        style_check(w, txt, label)
        for m in QUOTE_RX.finditer(txt):
            check_quote(w, m.group(1))
        for m in QREF_RX.finditer(txt):
            a, s, l1, l2 = parse_ref(*m.group(2, 3, 4, 5))
            check_ref_for_quote(w, m.group(1), a, s, l1, l2)
        for m in REF_RX.finditer(txt):
            a, s, l1, l2 = parse_ref(*m.groups())
            for l in (l1, l2):
                if (a, s, l) not in FOLGER:
                    fail(w, f"reference {a}.{s}.{l} not in Folger table")
            if l2 < l1:
                fail(w, f"reversed reference {m.group(0)}")
        if label in ("model", "explanation") or label.startswith("check"):
            tk = toks(strip_quotes(txt))
            for i in range(len(tk) - 7):
                if " ".join(tk[i:i + 8]) in MS_GRAMS:
                    fail(w, "8-word run shared with a board mark scheme: " + " ".join(tk[i:i + 8]))
                    break
    # who-says items: speaker check
    if t == "mcq" and re.search(r"\bWho says\b", qn.get("prompt", "")):
        m = QREF_RX.search(qn["prompt"])
        if not m:
            fail(where, "'who says' item needs a quotation with a line reference")
        else:
            a, s, l1, l2 = parse_ref(*m.group(2, 3, 4, 5))
            spk = FOLGER.get((a, s, l1), ("", ""))[0].lower()
            opt = re.sub(r"^the ", "", qn["options"][qn["answer"]].lower())
            if not opt.startswith(spk):
                fail(where, f"'who says' answer '{qn['options'][qn['answer']]}' but Folger speaker is {spk}")


PACK = json.load(open(os.path.join(BOOK, "research", "research_pack.json"), encoding="utf-8"))
BOARD_MARKS = {b["board"].split()[0].replace("Pearson", "Edexcel").replace("WJEC", "Eduqas"): b["marks"] for b in PACK["assessment"]["boards"]}
BOARD_MARKS = {("Edexcel" if "Edexcel" in b["board"] else "Eduqas" if "Eduqas" in b["board"] else b["board"].split()[0]): b["marks"]
               for b in PACK["assessment"]["boards"]}
CURRIC_IDS = {st["id"] for st in PACK["curriculum"]["statements"]}
REGISTRY = json.load(open(os.path.join(BOOK, "book", "_registry.json"), encoding="utf-8"))
BOOK_STEMS = [set(toks(re.sub("<[^>]+>", "", r.get("stem", "")))) for r in REGISTRY if r.get("stem")]
TRIPLE_RX = re.compile(r"\b[\w’'-]+(?: [\w’'-]+){0,3}, [\w’'-]+(?: [\w’'-]+){0,3},? (?:and|or) [\w’'-]+")


def check_numeric_fact(where, qn):
    bd = [b for b in BOARD_MARKS if b in qn.get("prompt", "")]
    if not bd:
        fail(where, "numeric item must name the board whose published marks it uses")
        return
    if not re.search(r"\b%s\b" % re.escape(str(qn["answer"])), BOARD_MARKS[bd[0]]):
        fail(where, f"numeric answer {qn['answer']} not found in the research pack's marks for {bd[0]}")


def overlap_check(where, qn):
    p = set(toks(qn.get("prompt", "")))
    if len(p) < 5:
        return
    for st in BOOK_STEMS:
        if len(st) >= 5 and len(p & st) / len(p | st) > 0.6:
            fail(where, "prompt too close to a printed-book question")
            return


def main():
    try:
        data = json.load(open(JSON_PATH, encoding="utf-8"))
    except Exception as e:
        print("FAIL: cannot load JSON:", e)
        sys.exit(1)
    b = data.get("book", {})
    for k, v in [("id", "macbeth"), ("keyStage", "KS4"), ("year", "GCSE"), ("subject", "English Literature")]:
        if b.get(k) != v:
            fail("book", f"{k} should be {v}")
    for k in ("title", "pages", "ageRange", "sections"):
        if k not in b:
            fail("book", f"missing {k}")
    secs = {s["id"]: s for s in b.get("sections", [])}
    for sid, s in secs.items():
        if sid not in CFG.SECTIONS or CFG.SECTIONS[sid]["colour"] != s.get("colour") or CFG.SECTIONS[sid]["name"] != s.get("name"):
            fail("book.sections", f"{sid} name/colour must match config.py")
    if data.get("texts") != []:
        fail("texts", "texts should be an empty list (questions quote the play directly)")
    units = data.get("units", [])
    titles = book_pages()
    expected = [(p, titles[p]) for p in CONTENT_PAGES]
    if len(units) != len(expected):
        fail("units", f"{len(units)} units, expected {len(expected)}")
    exam_boards = {bd: 0 for bd in BOARDS}
    ids = set()
    for n, (u, (page, title)) in enumerate(zip(units, expected), 1):
        uid = f"macbeth-u{n:02d}"
        if u.get("id") != uid:
            fail(uid, f"id {u.get('id')} should be {uid}")
        if u.get("title") != title:
            fail(uid, f"title '{u.get('title')}' should be '{title}'")
        if u.get("bookPages") != [page]:
            fail(uid, f"bookPages should be [{page}]")
        sec = section_of(page)
        if u.get("section") != sec or sec not in secs:
            fail(uid, f"section should be {sec}")
        if u.get("textId", "x") is not None:
            fail(uid, "textId should be null")
        if not u.get("curriculum") or not u.get("summary"):
            fail(uid, "curriculum and summary required")
        for cid in u.get("curriculum", []):
            if cid not in CURRIC_IDS:
                fail(uid, f"curriculum id {cid} not in research pack")
        style_check(uid + ".summary", u.get("summary", ""))
        for m in QUOTE_RX.finditer(u.get("summary", "")):
            check_quote(uid + ".summary", m.group(1))
        for m in QREF_RX.finditer(u.get("summary", "")):
            check_ref_for_quote(uid + ".summary", m.group(1), *parse_ref(*m.group(2, 3, 4, 5)))
        qs = u.get("questions", [])
        if len(qs) != 10:
            fail(uid, f"{len(qs)} questions, need 10")
        for i, qn in enumerate(qs, 1):
            check_question(uid, qn, i, sec)
            overlap_check(f"{uid}-q{i:02d}", qn)
            if qn.get("type") == "numeric":
                check_numeric_fact(f"{uid}-q{i:02d}", qn)
            for k in ("prompt", "explanation", "model"):
                own = strip_quotes(qn.get(k, "") or "")
                for m in TRIPLE_RX.finditer(own):
                    warns.append(f"{uid}-q{i:02d}.{k}: possible rule-of-three list: {m.group(0)}")
            if qn.get("id") in ids:
                fail(uid, f"duplicate id {qn.get('id')}")
            ids.add(qn.get("id"))
        if [q.get("difficulty") for q in qs] != [1, 1, 2, 2, 3, 3, 3, 4, 4, 5]:
            fail(uid, "difficulty profile must be 1,1,2,2,3,3,3,4,4,5")
        if not any(q.get("misconception") for q in qs):
            fail(uid, "needs a misconception item")
        nreason = sum(1 for q in qs if REASON_RX.search(q.get("prompt", "")) or q.get("type") == "extended")
        if nreason < 2:
            fail(uid, "needs 2+ reasoning items")
        if len({q.get("type") for q in qs}) < 4:
            fail(uid, "needs 4+ question types")
        if sec in ("PLOT", "CHAR", "THEME"):
            types = [q.get("type") for q in qs]
            if not any(q.get("type") == "mcq" and "Who says" in q.get("prompt", "") for q in qs):
                fail(uid, "needs a 'who says' item")
            for t in ("order", "truefalse", "cloze"):
                if t not in types:
                    fail(uid, f"needs a {t} item")
            if not any("best supports" in q.get("prompt", "") for q in qs):
                fail(uid, "needs a 'which quotation best supports' item")
            if not any(CONTEXT_RX.search(q.get("prompt", "")) for q in qs):
                fail(uid, "needs a context item")
            ne = types.count("extended")
            if not 1 <= ne <= 2:
                fail(uid, "needs 1 or 2 extended items")
            for q in qs:
                if q.get("type") == "cloze" and not QUOTE_RX.search(q["prompt"]):
                    fail(uid, "cloze must complete a quotation")
        if sec == "EXAM":
            blob = json.dumps(qs, ensure_ascii=False)
            for bd in BOARDS:
                exam_boards[bd] += blob.count(bd)
    for bd, c in exam_boards.items():
        if c < 5:
            fail("EXAM", f"board {bd} barely covered ({c})")
    nq = sum(len(u.get("questions", [])) for u in units)
    for w in warns:
        print("WARN", w)
    if fails:
        for f in fails:
            print("FAIL", f)
        print(f"\n{len(fails)} failures across {len(units)} units / {nq} questions")
        sys.exit(1)
    print(f"PASS: {len(units)} units, {nq} questions, all checks passed (100%).")


if __name__ == "__main__":
    main()
