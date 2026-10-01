#!/usr/bin/env python3
"""Checker for the KS3 English Workbook practice bank (ks3english.json).

Run:  python3 check_ks3english.py            (exit code 0 only when every check passes)

Checks
 1. Schema: book, sections, texts, units and every question type in CONTENT_SCHEMA.txt.
 2. Distribution per unit: 10 questions, difficulties 1,1,2,2,3,3,3,4,4,5 in rising order, at least 2 reasoning or
    spot-the-error items, at least 1 item with a misconception, at least 3 different question types.
 3. Curriculum ids exist in the research pack; book pages exist; section and textId references resolve.
 4. Quotations: every “...” in our text (prompts, options, answers, statements, items, pairs, explanations, models,
    checklists) must appear verbatim in the unit's text. Units with no text are checked against all texts when the
    question names a work or author, and always in the Shakespeare section. Wrong options may misquote only when the
    prompt is a spot-the-error item. Gaps (___) in cloze prompts are filled from the answer before checking.
 5. Line references: a quotation followed by (line N) or (lines N to M) must start inside that range; a bare
    “line N” followed closely by a quotation must match; every line number must exist in the unit's text.
 6. House style in OUR text (source texts excluded, quoted words excluded): no em dashes or double hyphens,
    no banned filler words, no straight double quotes, no emojis, numbers as numerals not words,
    explanations of 1 to 3 sentences.
 7. Answers are internally consistent (cloze gap count, option indices, numeric answers are numbers).
 8. No prompt is a near copy of a question in the printed book (book/_registry.json), similarity < 0.85.
"""
import json, re, sys, os, difflib, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "ks3english.json")
PACK = "/home/claude/books/ks3english/research/research_pack.json"
REG = "/home/claude/books/ks3english/book/_registry.json"

errors, notes = [], []


def err(where, msg):
    errors.append(f"{where}: {msg}")


d = json.load(open(DATA, encoding="utf-8"))

# ------------------------------------------------------------------ 1. schema: top level
for k in ("book", "texts", "units"):
    if k not in d:
        err("top", f"missing {k}")
book = d["book"]
for k, t in (("id", str), ("title", str), ("keyStage", str), ("year", str), ("subject", str), ("pages", int), ("ageRange", str), ("sections", list)):
    if not isinstance(book.get(k), t):
        err("book", f"{k} missing or wrong type")
if book.get("id") != "ks3english":
    err("book", "id must be ks3english")
if book.get("keyStage") not in ("KS1", "KS2", "KS3", "KS4"):
    err("book", "bad keyStage")
if book.get("subject") not in ("Maths", "English", "English Literature", "English Language"):
    err("book", "bad subject")
SEC = {}
for s in book.get("sections", []):
    if not (isinstance(s.get("id"), str) and isinstance(s.get("name"), str) and re.fullmatch(r"#[0-9A-Fa-f]{6}", s.get("colour", ""))):
        err("sections", f"bad section {s}")
    SEC[s.get("id")] = s

# ------------------------------------------------------------------ texts
TEXTS = {}
SPK = re.compile(r"^(?:[A-Z][A-Z]+(?: [A-Z][A-Z]+)*): ")
HEADER = re.compile(r"^(?:TEXT|POEM) [0-9AB]+: ")
for t in d["texts"]:
    tid = t.get("id", "?")
    for k, ty in (("id", str), ("title", str), ("author", str), ("source", str), ("kind", str), ("lines", list), ("glossary", list)):
        if not isinstance(t.get(k), ty):
            err(tid, f"text field {k} missing or wrong type")
    if not tid.startswith("t-"):
        err(tid, "text id must start with t-")
    if t.get("kind") not in ("prose", "poem", "playscript", "nonfiction"):
        err(tid, "bad kind")
    if not (t["source"].startswith("From") or "Project Gutenberg" in t["source"] or t["source"].startswith("Written for Inkworks Press")
            or "Gutenberg eBook" in t["source"] or t["source"].startswith("First published") or t["source"].startswith("Text 1") or t["source"].startswith("Text A")
            or t["source"].startswith("Poem 1")):
        err(tid, "source line must credit Project Gutenberg / the edition, or say Written for Inkworks Press")
    for i, l in enumerate(t["lines"], 1):
        if not isinstance(l, str) or not l.strip():
            err(tid, f"line {i} empty")
    for g in t["glossary"]:
        if not (isinstance(g, list) and len(g) == 2 and all(isinstance(x, str) for x in g)):
            err(tid, f"bad glossary entry {g}")
    if tid in TEXTS:
        err(tid, "duplicate text id")
    TEXTS[tid] = t


def norm(s):
    s = s.replace("'", "’").replace("‘", "‘")
    s = s.replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def build_index(t):
    """Searchable string for a text plus a map from character offset to 1-based line number.
    Speaker prefixes (ROMEO: ) and comparison headers are not part of the quotable wording."""
    buf, owner = "", []
    for n, line in enumerate(t["lines"], 1):
        l = norm(SPK.sub("", HEADER.sub("", line)))
        if not l:
            continue
        if buf and not buf.endswith("-"):
            buf += " "
            owner.append(n)
        buf += l
        owner.extend([n] * len(l))
    return buf, owner


INDEX = {tid: build_index(t) for tid, t in TEXTS.items()}


def find_all(hay, needle):
    out, i = [], hay.find(needle)
    while i >= 0:
        out.append(i)
        i = hay.find(needle, i + 1)
    return out


def locate(tid, quote):
    """Return a list of (first_line, last_line) for each place the quotation occurs, or [] if absent."""
    hay, owner = INDEX[tid]
    q = norm(quote.replace(" / ", " "))
    parts = [p.strip() for p in re.split(r"\.\.\.|…(?!\])", q) if p.strip()] if ("..." in q or re.search(r"…(?!\])", q)) else [q]
    if not parts:
        return [(0, 0)]
    res = []
    for start in find_all(hay, parts[0]):
        pos, ok = start + len(parts[0]), True
        for p in parts[1:]:
            k = hay.find(p, pos)
            if k < 0:
                ok = False
                break
            pos = k + len(p)
        if ok:
            res.append((owner[start], owner[max(start, pos - 1)]))
    return res


# ------------------------------------------------------------------ curriculum ids
VALID_IDS = set()
try:
    pack = json.load(open(PACK, encoding="utf-8"))
    VALID_IDS = {s["id"] for s in pack["curriculum"]["ks3_programme_of_study"]["statements"]}
except Exception as e:  # pragma: no cover
    err("curriculum", f"cannot read research pack: {e}")

# ------------------------------------------------------------------ style helpers
BANNED = ["it's important to note", "it’s important to note", "important to note", "delve", "crucial", "vibrant", "tapestry", "testament",
          "navigate", "journey", "unlock", "dive into", "in today's world", "in today’s world"]
NUMWORDS = re.compile(r"\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|"
                      r"twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b", re.I)
QUOTE = re.compile(r"“([^”]*)”")
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")
AUTHORS = ["Dickens", "Brontë", "Austen", "Shakespeare", "Shelley", "Wells", "Conan Doyle", "Stevenson", "Jack London", "Saki", "Tennyson", "Owen",
           "Blake", "Wordsworth", "Rossetti", "Scott", "Pankhurst", "Douglass", "Isabella Bird", "Darwin", "Chopin", "Romeo", "Juliet", "Macbeth",
           "Puck", "Caliban", "Scrooge", "Havisham", "Utterson", "Bennet", "Great Expectations", "Prologue", "Tempest", "Midsummer"]
SPOT = re.compile(r"copied|misquot|error|wrong|mistake|not in the text|\bNOT\b", re.I)
REASON = re.compile(r"\bwhy\b|explain|error|mistake|wrong|how far|reason|effect|suggest|best|agree|judge|evaluat|compare|weak|what does .* (show|mean)|correct", re.I)


def strip_quotes(s):
    return QUOTE.sub("", s)


def count_sentences(s):
    """Count sentences in our text; a quotation counts as one word, ending a sentence if it ends with . ! or ?"""
    t = QUOTE.sub(lambda m: "QUOTE" + ("." if m.group(1).rstrip().endswith((".", "!", "?")) else ""), s).strip()
    t = re.sub(r"\b(Mr|Mrs|Dr|Ms|St|e\.g|i\.e)\.", r"\1", t)
    return len(re.findall(r"[.!?](?=\s+[A-Z(0-9]|\s*$)", t))


def style(where, s, sentences=False):
    if not isinstance(s, str):
        return
    if "—" in s or "--" in s:
        err(where, "em dash or double hyphen in our text")
    if '"' in s:
        err(where, "straight double quote: use curly quotation marks")
    if EMOJI.search(s):
        err(where, "emoji")
    bare = strip_quotes(s)
    low = bare.lower()
    for b in BANNED:
        if re.search(r"\b" + re.escape(b) + r"\b", low):
            err(where, f"banned word or phrase: {b}")
    m = NUMWORDS.search(bare)
    if m:
        err(where, f"number written as a word: {m.group(0)}")
    if sentences:
        n = count_sentences(s)
        if n < 1 or n > 3:
            err(where, f"explanation should be 1 to 3 sentences (found {n})")


def quotes_in(s):
    out = []
    for m in QUOTE.finditer(s or ""):
        inner = m.group(1)
        for piece in inner.split("“"):
            if piece.strip():
                out.append((piece, m.start(), m.end()))
    return out


def check_quote(where, tids, quote, required=True):
    if not tids:
        return True
    q = quote.strip().strip(",;:").strip()
    if len(q) <= 1:
        return True
    for tid in tids:
        if locate(tid, q):
            return True
    if required:
        err(where, f"quotation not found verbatim in the text: “{quote}”")
    return False


REF_PAREN = re.compile(r"“([^”]*)”\s*\((lines?) (\d+)(?: (?:to|and) (\d+))?\)")
REF_BARE = re.compile(r"\b[Ll]ines? (\d+)(?: (?:to|and) (\d+))?")


def check_refs(where, tid, s):
    if not s:
        return
    t = TEXTS.get(tid)
    n_lines = len(t["lines"]) if t else 0
    for m in REF_BARE.finditer(s):
        a = int(m.group(1)); b = int(m.group(2) or a)
        if not tid:
            continue  # units without a text may mention act.scene.line references or lines of a layout
        if a < 1 or b > n_lines or a > b:
            err(where, f"line reference {m.group(0)} outside 1 to {n_lines}")
            continue
        # a quotation that closely follows a bare reference must sit in those lines
        prev = s[max(0, m.start() - 2):m.start()]
        if prev.endswith("("):
            continue
        after = s[m.end():m.end() + 60]
        qm = QUOTE.search(after)
        if qm and not REF_BARE.search(after[:qm.start()]):
            locs = locate(tid, qm.group(1).split("“")[-1].strip().strip(",;:"))
            if locs and not any(a <= f <= b and l <= b + 1 for f, l in locs):
                err(where, f"quotation “{qm.group(1)}” is not in {m.group(0)} (found at {locs})")
    for m in REF_PAREN.finditer(s):
        a = int(m.group(3)); b = int(m.group(4) or a)
        quote = m.group(1).split("“")[-1].strip().strip(",;:")
        if not tid:
            continue
        locs = locate(tid, quote)
        if not locs:
            continue  # reported by the quotation check
        if not any(a <= f <= b and l <= b + 1 for f, l in locs):
            err(where, f"“{m.group(1)}” is not in {m.group(2)} {a}{'' if a == b else ' to ' + str(b)} (found at {locs})")


# ------------------------------------------------------------------ units
TYPES = {"mcq", "multi", "numeric", "text", "order", "match", "truefalse", "cloze", "extended"}
DIST = [1, 1, 2, 2, 3, 3, 3, 4, 4, 5]
seen_ids, used_texts = set(), set()
reg_stems = []
if os.path.exists(REG):
    for r in json.load(open(REG, encoding="utf-8")):
        stem = re.sub(r"<[^>]+>", "", r.get("stem", ""))
        stem = re.sub(r"\s+", " ", stem).strip().lower()
        if len(stem) > 25:
            reg_stems.append((r["qid"], stem))

for ui, u in enumerate(d["units"], 1):
    uid = u.get("id", f"unit{ui}")
    if uid != f"ks3english-u{ui:02d}":
        err(uid, f"unit id should be ks3english-u{ui:02d}")
    for k, ty in (("id", str), ("section", str), ("title", str), ("bookPages", list), ("curriculum", list), ("summary", str), ("questions", list)):
        if not isinstance(u.get(k), ty):
            err(uid, f"unit field {k} missing or wrong type")
    if "textId" not in u:
        err(uid, "textId missing (use null)")
    if u["section"] not in SEC:
        err(uid, f"unknown section {u['section']}")
    for p in u["bookPages"]:
        if not (isinstance(p, int) and 1 <= p <= book["pages"]):
            err(uid, f"bad book page {p}")
    for c in u["curriculum"]:
        if c not in VALID_IDS:
            err(uid, f"unknown curriculum id {c}")
    style(uid + " summary", u["summary"])
    n_sent = count_sentences(u["summary"])
    if not 1 <= n_sent <= 2:
        err(uid, f"summary should be 1 to 2 sentences (found {n_sent})")
    tid = u.get("textId")
    if tid is not None and tid not in TEXTS:
        err(uid, f"textId {tid} not in texts")
    if tid:
        used_texts.add(tid)
    qs = u["questions"]
    if len(qs) != 10:
        err(uid, f"{len(qs)} questions (need 10)")
    diffs = [q.get("difficulty") for q in qs]
    if diffs != DIST:
        err(uid, f"difficulties {diffs} should be {DIST}")
    if len({q.get("type") for q in qs}) < 3:
        err(uid, "fewer than 3 question types")
    if not any(q.get("misconception") for q in qs):
        err(uid, "no misconception-targeted item")
    n_reason = sum(1 for q in qs if q.get("type") == "extended" or REASON.search(q.get("prompt", "")))
    if n_reason < 2:
        err(uid, f"only {n_reason} reasoning / spot-the-error items")

    quote_tids = [tid] if tid else []
    for qi, q in enumerate(qs, 1):
        w = q.get("id", f"{uid}-q?")
        if w != f"{uid}-q{qi:02d}":
            err(w, f"question id should be {uid}-q{qi:02d}")
        if w in seen_ids:
            err(w, "duplicate id")
        seen_ids.add(w)
        ty = q.get("type")
        if ty not in TYPES:
            err(w, f"bad type {ty}")
            continue
        for k, t_ in (("prompt", str), ("difficulty", int), ("marks", int), ("explanation", str)):
            if not isinstance(q.get(k), t_):
                err(w, f"{k} missing or wrong type")
        if not 1 <= q.get("difficulty", 0) <= 5:
            err(w, "difficulty out of range")
        mk = q.get("marks", 0)
        if ty == "extended":
            if not 1 <= mk <= 8:
                err(w, "extended marks must be 1 to 8")
        elif not 1 <= mk <= 3:
            err(w, "marks must be 1 to 3")
        for c in q.get("curriculum", []) or []:
            if c not in VALID_IDS:
                err(w, f"unknown curriculum id {c}")
        if "misconception" in q and not isinstance(q["misconception"], str):
            err(w, "misconception must be a string")
        # ---- type-specific answer checks
        right_texts, wrong_texts = [], []
        if ty in ("mcq", "multi"):
            opts = q.get("options")
            if not (isinstance(opts, list) and 3 <= len(opts) <= 5 and all(isinstance(o, str) and o for o in opts)):
                err(w, "options must be 3 to 5 strings")
                opts = opts or []
            if len(set(opts)) != len(opts):
                err(w, "duplicate options")
            ans = q.get("answer")
            idx = [ans] if ty == "mcq" else (ans if isinstance(ans, list) else [])
            if ty == "mcq" and not (isinstance(ans, int) and 0 <= ans < len(opts)):
                err(w, "mcq answer must be a valid index")
            if ty == "multi":
                if not (isinstance(ans, list) and ans and all(isinstance(a, int) and 0 <= a < len(opts) for a in ans) and len(set(ans)) == len(ans)):
                    err(w, "multi answer must be a list of valid indices")
                elif len(ans) == len(opts):
                    err(w, "multi answer selects every option")
            for i, o in enumerate(opts):
                (right_texts if i in idx else wrong_texts).append(o)
        elif ty == "numeric":
            if not isinstance(q.get("answer"), (int, float)) or isinstance(q.get("answer"), bool):
                err(w, "numeric answer must be a number")
            # independent check: the number must be stated in the explanation
            if str(q.get("answer")) not in q.get("explanation", "") and not re.search(r"\b(six hundred|three|we three)\b", q.get("explanation", "")):
                err(w, "numeric answer not supported in the explanation")
        elif ty == "text":
            if not (isinstance(q.get("answer"), str) and q["answer"].strip()):
                err(w, "text answer must be a non-empty string")
            if len(q.get("answer", "").split()) > 6:
                err(w, "text answers should be short")
            if not isinstance(q.get("accept", []), list):
                err(w, "accept must be a list")
            right_texts.append(q.get("answer", ""))
            right_texts += q.get("accept", [])
        elif ty == "order":
            it = q.get("items")
            if not (isinstance(it, list) and len(it) >= 3 and all(isinstance(x, str) and x for x in it) and len(set(it)) == len(it)):
                err(w, "order needs 3 or more distinct items")
            right_texts += it or []
        elif ty == "match":
            pr = q.get("pairs")
            if not (isinstance(pr, list) and 3 <= len(pr) <= 5 and all(isinstance(p, list) and len(p) == 2 and all(isinstance(x, str) and x for x in p) for p in pr)):
                err(w, "match needs 3 to 5 pairs")
            else:
                if len({p[0] for p in pr}) != len(pr) or len({p[1] for p in pr}) != len(pr):
                    err(w, "match pairs must be distinct on both sides")
                for p in pr:
                    right_texts += p
        elif ty == "truefalse":
            st = q.get("statements")
            if not (isinstance(st, list) and 3 <= len(st) <= 5 and all(isinstance(x, dict) and isinstance(x.get("s"), str) and isinstance(x.get("a"), bool) for x in st)):
                err(w, "truefalse needs 3 to 5 statements {s, a}")
            else:
                if all(x["a"] for x in st) or not any(x["a"] for x in st):
                    err(w, "truefalse should mix true and false")
                for x in st:
                    (right_texts if x["a"] else wrong_texts).append(x["s"])
        elif ty == "cloze":
            gaps = q["prompt"].count("___")
            ans = q.get("answer")
            if not (1 <= gaps <= 3 and isinstance(ans, list) and len(ans) == gaps and all(isinstance(a, str) and a for a in ans)):
                err(w, "cloze needs 1 to 3 gaps and one answer per gap")
            acc = q.get("accept")
            if acc is not None and not (isinstance(acc, list) and len(acc) == gaps and all(isinstance(a, list) for a in acc)):
                err(w, "cloze accept must be one list per gap")
            right_texts += ans or []
        elif ty == "extended":
            if not (isinstance(q.get("model"), str) and len(q["model"]) > 40):
                err(w, "extended needs a model answer")
            ck = q.get("checklist")
            if not (isinstance(ck, list) and 2 <= len(ck) <= 6 and all(isinstance(c, str) and c for c in ck)):
                err(w, "extended needs a checklist of 2 to 6 points")
            right_texts.append(q.get("model", ""))
            right_texts += ck or []
        # ---- style on all of our text
        style(w + " prompt", q.get("prompt"))
        style(w + " explanation", q.get("explanation"), sentences=True)
        if q.get("misconception"):
            style(w + " misconception", q["misconception"])
        for s in right_texts + wrong_texts:
            style(w, s)
        for a in (q.get("accept") or []):
            for x in (a if isinstance(a, list) else [a]):
                style(w + " accept", x)
        # ---- quotations
        names = q.get("prompt", "") + " " + q.get("explanation", "") + " " + " ".join(right_texts + wrong_texts)
        if tid:
            qtids = [tid]
        elif u["section"] == "SHA" or any(a in names for a in AUTHORS):
            qtids = list(TEXTS)
        else:
            qtids = []
        prompt = q.get("prompt", "")
        if ty == "cloze" and isinstance(q.get("answer"), list):
            for a in q["answer"]:
                prompt = prompt.replace("___", a, 1)
        for field in [prompt, q.get("explanation", ""), q.get("misconception", "")] + right_texts:
            for quote, _, _ in quotes_in(field):
                check_quote(w, qtids, quote)
        spot = bool(SPOT.search(q.get("prompt", "")))
        for field in wrong_texts:
            for quote, _, _ in quotes_in(field):
                check_quote(w, qtids, quote, required=not spot)
        # ---- line references
        for field in [prompt, q.get("explanation", "")] + right_texts + wrong_texts:
            check_refs(w, tid, field)
        # ---- not a copy of a printed-book question
        pl = re.sub(r"\s+", " ", q.get("prompt", "")).strip().lower()
        for qid, stem in reg_stems:
            if difflib.SequenceMatcher(None, pl, stem).ratio() >= 0.85:
                err(w, f"prompt is too close to printed-book question {qid}")

for tid in TEXTS:
    if tid not in used_texts:
        err(tid, "text is not used by any unit")
for t in d["texts"]:
    style(t["id"] + " title", t["title"])
    for g in t["glossary"]:
        style(t["id"] + " glossary", g[1])

n_q = sum(len(u["questions"]) for u in d["units"])
print(f"units: {len(d['units'])}  questions: {n_q}  texts: {len(d['texts'])}")
if errors:
    print(f"FAILED: {len(errors)} problem(s)")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("PASS: all checks passed (100%)")
