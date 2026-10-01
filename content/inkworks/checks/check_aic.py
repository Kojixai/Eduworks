#!/usr/bin/env python3
"""Checker for the An Inspector Calls practice bank (aic.json).

Run:  python3 check_aic.py        (exit code 0 only when every check passes)

Checks
 1. Schema: book, sections, empty texts list (the play is in copyright, so no play text), units with textId null, and every
    question type in CONTENT_SCHEMA.txt (option counts, valid answer indices, 3 to 5 match pairs, truefalse mix, cloze gaps).
 2. Match questions: both sides of every pair list are unique (right side unique is required).
 3. Distribution per unit: 10 questions, difficulties 1,1,2,2,3,3,3,4,4,5, at least 2 reasoning or spot-the-error items,
    at least 1 misconception item, at least 3 question types, 1 or 2 extended items each with a model, checklist and marks.
 4. Units match the book: one unit per content page (context, plot, characters, themes, methods, exam pages), titles exactly as
    printed on that page (read from the book's page modules), curriculum ids from the book's config.
 5. COPYRIGHT AND QUOTATIONS. Every “...” span in the bank must be a verified quotation from qa/quotes_to_check.json (or a
    word-bounded part of one), with the guide's corrected speakers. Each span must be followed by an attribution
    “(Speaker, Act N)” or “(Act N)”. The act must match. A named speaker must match. Where only the act is given, the speaker
    must be resolved and correct: the answer to a ‘Who...?’ question, the right side of a match pair, or the first speaker
    named earlier in the same sentence. Stage directions must always be labelled ‘stage direction’. No span over 10 words.
    Total quoted words across the bank must stay under 600. Verified quotations of 5 or more words may not appear unquoted,
    and single-quoted spans of 3 or more words may not be play quotations.
 6. Spot checks on corrected speakers: “It’s too late” is the Inspector’s, “hysterical child” is Mrs Birling’s.
 7. Context safety: no disputed claims stated as fact (date of Priestley’s wounding, month of the Moscow premiere,
    Postscripts audience figures, Churchill ending the talks, named time theorists, the sum Eric stole, a 1-week writing time
    unless hedged).
 8. House style in our text (quoted words excluded): no em or en dashes, no straight double quotes, no banned filler words,
    no emojis, numbers as numerals; explanations 1 to 3 sentences; summaries 1 to 2 sentences.
 9. No prompt is a near copy of a printed-book question (book/_registry.json and the Quick check boxes), similarity < 0.85.
"""
import json, re, sys, os, difflib, glob

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "aic.json")
BOOK = "/home/claude/books/aic"
VERIFIED = f"{BOOK}/qa/quotes_to_check.json"
AUDIT = f"{BOOK}/qa/independent_audit.json"
REG = f"{BOOK}/book/_registry.json"
CONFIG = f"{BOOK}/book/config.py"
MAX_WORDS_TOTAL = 600
MAX_WORDS_SPAN = 10

errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


d = json.load(open(DATA, encoding="utf-8"))

# ------------------------------------------------------------------ 1. top level
for k in ("book", "texts", "units"):
    if k not in d:
        err("top", f"missing {k}")
book = d["book"]
for k, t in (("id", str), ("title", str), ("keyStage", str), ("year", str), ("subject", str), ("pages", int), ("ageRange", str), ("sections", list)):
    if not isinstance(book.get(k), t):
        err("book", f"{k} missing or wrong type")
if book.get("id") != "aic":
    err("book", "id must be aic")
if book.get("keyStage") != "KS4" or book.get("year") != "GCSE" or book.get("subject") != "English Literature":
    err("book", "keyStage/year/subject should be KS4 / GCSE / English Literature")
if d.get("texts") != []:
    err("texts", "texts must be an empty list: no play text may be included")
cfg_src = open(CONFIG, encoding="utf-8").read()
CFG_COLOURS = dict(re.findall(r'"(\w+)": dict\(name="[^"]*", colour="(#[0-9A-Fa-f]{6})"', cfg_src))
SEC = {}
for s in book.get("sections", []):
    if not (isinstance(s.get("id"), str) and isinstance(s.get("name"), str) and re.fullmatch(r"#[0-9A-Fa-f]{6}", s.get("colour", ""))):
        err("sections", f"bad section {s}")
    if CFG_COLOURS.get(s.get("id")) and CFG_COLOURS[s["id"]].upper() != s["colour"].upper():
        err("sections", f"{s['id']} colour should be {CFG_COLOURS[s['id']]} (book config.py)")
    SEC[s.get("id")] = s
VALID_IDS = set(re.findall(r'dict\(id="([A-Z0-9-]+)", statement=', cfg_src))
if not VALID_IDS:
    err("curriculum", "could not read curriculum ids from config.py")

# ------------------------------------------------------------------ book pages and titles
PAGE_TITLES, PAGE_KIND = {}, {}
for f in glob.glob(f"{BOOK}/book/p_*.py"):
    src = open(f, encoding="utf-8").read()
    for m in re.finditer(r'P\((\d+),\s*"(\w*)",\s*"([^"]*)"(.*?)\)\n', src, re.S):
        pg = int(m.group(1))
        PAGE_TITLES[pg] = m.group(3)
        PAGE_KIND[pg] = "questions" if 'kind="questions"' in m.group(4)[:400] else "content"
EXPECTED = sorted(p for p, t in PAGE_TITLES.items() if t and PAGE_KIND[p] == "content" and (p == 3 or 4 <= p <= 44 or 50 <= p <= 60))

# ------------------------------------------------------------------ verified quotations
def canon_speaker(raw):
    r = (raw or "").strip()
    if r.startswith("Sybil Birling /"):
        return None
    if r.startswith("Inspector") or r.lower() in ("the inspector",):
        return "Inspector"
    if r in ("Birling", "Mr Birling", "Arthur Birling") or r.startswith("Arthur Birling"):
        return "Birling"
    if r in ("Mrs Birling", "Sybil Birling") or r.startswith("Sybil Birling"):
        return "Mrs Birling"
    if r.lower().startswith("stage direction"):
        return "stage direction"
    for n in ("Sheila", "Eric", "Gerald"):
        if r.startswith(n):
            return n
    return None


def nq(s):
    s = s.replace("'", "’").replace("–", "-").replace("—", "-")
    s = re.sub(r"\s*-\s*", " - ", s)
    return re.sub(r"\s+", " ", s).strip()


V = {}
for e in json.load(open(VERIFIED, encoding="utf-8"))["quotations"]:
    sp = canon_speaker(e["speaker"])
    if sp:
        subj = re.search(r"\(([^)]*)\)", e["speaker"])
        V[nq(e["quotation"])] = (sp, int(e["act"]), subj.group(1) if subj else None)


def lookup(span):
    key = nq(span).strip(" ,;:")
    if key in V:
        return {V[key]}
    return {v for k, v in V.items() if re.search(r"(?<!\w)" + re.escape(key) + r"(?!\w)", k)}


# the audit's speaker corrections must be present in the verified file
for phrase, who in (("It’s too late", "Inspector"), ("hysterical child", "Mrs Birling")):
    hits = lookup(phrase)
    if not hits or {h[0] for h in hits} != {who}:
        err("verified list", f"“{phrase}” should be attributed to {who} (independent_audit.json correction)")

QUOTE = re.compile(r"“([^”]*)”")
ATTR = re.compile(r"^\s*\((?:([^,()]+), )?Act (\d)\)")
NAMES = [("Mrs Birling", "Mrs Birling"), ("Sybil", "Mrs Birling"), ("Mr Birling", "Birling"), ("Arthur Birling", "Birling"),
         ("Birling(?!s\\b)", "Birling"), ("Inspector", "Inspector"), ("Sheila", "Sheila"), ("Eric", "Eric"), ("Gerald", "Gerald"),
         ("stage direction", "stage direction")]
NAME_RE = re.compile(r"\b(" + "|".join(n for n, _ in NAMES) + r")")


def name_to_canon(tok):
    for pat, c in NAMES:
        if re.fullmatch(pat, tok):
            return c
    return None


def first_speaker_before(s, pos):
    start = max(s.rfind(". ", 0, pos), s.rfind("? ", 0, pos), s.rfind("! ", 0, pos), s.rfind("\n", 0, pos), -1)
    seg = QUOTE.sub("", s[start + 1:pos])
    m = NAME_RE.search(seg)
    return name_to_canon(m.group(1)) if m else None


total_words = 0


def check_quotes(where, s, resolver=None):
    """Check every quotation in string s. resolver() returns the canonical speaker the question's answer gives, or None."""
    global total_words
    if not isinstance(s, str):
        return
    for m in QUOTE.finditer(s):
        span = m.group(1)
        words = len(span.split())
        total_words += words
        if words > MAX_WORDS_SPAN:
            err(where, f"quotation too long ({words} words): “{span}”")
        hits = lookup(span)
        if not hits:
            err(where, f"quotation not in the verified list: “{span}”")
            continue
        if len({(h[0], h[1]) for h in hits}) != 1:
            err(where, f"quotation is ambiguous between speakers or acts: “{span}”")
            continue
        sp, act, subj = hits.pop()
        a = ATTR.match(s[m.end():])
        if not a:
            err(where, f"quotation lacks an (Speaker, Act N) attribution: “{span}”")
            continue
        if int(a.group(2)) != act:
            err(where, f"“{span}” is from Act {act}, not Act {a.group(2)}")
        if a.group(1):
            c = canon_speaker(a.group(1))
            if c != sp:
                err(where, f"“{span}” is {sp}’s, not {a.group(1)}’s")
        else:
            if sp == "stage direction":
                err(where, f"stage direction “{span}” must be labelled stage direction")
                continue
            got = resolver() if resolver else None
            if got is None:
                got = first_speaker_before(s, m.start())
            if got != sp:
                err(where, f"speaker of “{span}” not shown or wrong (expected {sp}, found {got})")
        if sp == "stage direction" and subj and resolver:
            got = resolver(subject=True)
            if got is not None and subj.split()[0] not in got:
                err(where, f"stage direction “{span}” describes {subj}, not {got}")


def unquoted_play_text(where, s):
    if not isinstance(s, str):
        return
    bare = nq(QUOTE.sub(" ", s)).lower()
    for k in V:
        if len(k.split()) >= 5 and k.lower().strip(" .?") in bare:
            err(where, f"verified quotation appears without quotation marks: {k}")
    for m in re.finditer(r"‘([^’]*(?:’[a-z][^’]*)*)’", s):
        inner = m.group(1)
        if len(inner.split()) >= 3 and lookup(inner):
            err(where, f"play quotation in single quotes, unattributed: ‘{inner}’")


# ------------------------------------------------------------------ style
BANNED = ["it's important to note", "it’s important to note", "important to note", "delve", "crucial", "crucially", "vibrant", "tapestry",
          "testament", "navigate", "journey", "unlock", "dive into", "in today's world", "in today’s world"]
NUMWORDS = re.compile(r"\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|"
                      r"twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b", re.I)
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")
REASON = re.compile(r"\bwhy\b|explain|error|mistake|wrong|problem|how far|stronger|best|better|weak|improve|what does .* (show|suggest|do|mean)|"
                    r"effect|suggest|rewrite|spot|advice|safest|missing|ironic|purpose|argu", re.I)
DISPUTED = [(r"\b191[67]\b", "date of Priestley’s wounding is disputed"), (r"\b(May|summer) 1945\b", "month of the first performance is disputed"),
            (r"\b1[46] million\b", "Postscripts audience figures are disputed"), (r"Dunne|Ouspensky", "named time theorists are not verified"),
            (r"£\s?\d", "the sum Eric stole is not verified"), (r"\b(in|about|within) (a|1) week\b", "1-week writing time must be hedged")]


def count_sentences(s):
    t = QUOTE.sub(lambda m: "Q" + ("." if m.group(1).rstrip().endswith((".", "!", "?")) else ""), s).strip()
    t = re.sub(r"\((?:[^()]*)\)", "", t)
    t = re.sub(r"\b(Mr|Mrs|Dr|Ms|St|e\.g|i\.e|J\.B|B)\.", r"\1", t)
    return len(re.findall(r"[.!?](?=\s+[A-Z(0-9‘]|\s*$)", t))


def style(where, s, sentences=None):
    if not isinstance(s, str):
        return
    if "—" in s or "–" in s or "--" in s:
        err(where, "em dash, en dash or double hyphen in our text")
    if '"' in s:
        err(where, "straight double quote: use curly quotation marks")
    if EMOJI.search(s):
        err(where, "emoji")
    bare = QUOTE.sub("", s)
    low = bare.lower()
    for b in BANNED:
        if re.search(r"\b" + re.escape(b) + r"\b", low):
            err(where, f"banned word or phrase: {b}")
    m = NUMWORDS.search(bare)
    if m:
        err(where, f"number written as a word: {m.group(0)}")
    for pat, why in DISPUTED:
        if re.search(pat, bare) and not re.search(r"reportedly|disagree|disputed|sources", bare, re.I):
            err(where, f"disputed context stated as fact ({why})")
    if "Churchill" in bare and not re.search(r"disagree|disputed|not be stated|problem|leave it out", bare, re.I):
        err(where, "Churchill and the radio talks must be presented as disputed")
    if sentences:
        n = count_sentences(s)
        if not sentences[0] <= n <= sentences[1]:
            err(where, f"should be {sentences[0]} to {sentences[1]} sentences (found {n})")


# ------------------------------------------------------------------ printed-book questions (no near copies)
book_stems = []
for r in json.load(open(REG, encoding="utf-8")):
    st = re.sub(r"<[^>]+>", "", r.get("stem", ""))
    book_stems.append(re.sub(r"\s+", " ", st).strip().lower())
for f in glob.glob(f"{BOOK}/book/p_*.py"):
    src = open(f, encoding="utf-8").read()
    # Quick check questions, thesis questions ("Try it in the exam") and practice prompts
    for m in re.finditer(r'(?:\(|thesis\(|p\.q\(|p\.explain\(|p\.extended\()\s*"([^"]{12,}?[?.])"', src):
        st = re.sub(r"<[^>]+>", "", m.group(1))
        book_stems.append(re.sub(r"\s+", " ", st).strip().lower())
book_stems = [s for s in book_stems if len(s) > 20]


def plain(s):
    return re.sub(r"\s+", " ", QUOTE.sub(lambda m: m.group(1), s or "")).strip().lower()


# ------------------------------------------------------------------ units
TYPES = {"mcq", "multi", "numeric", "text", "order", "match", "truefalse", "cloze", "extended"}
DIST = [1, 1, 2, 2, 3, 3, 3, 4, 4, 5]
seen = set()
pages_seen = []
for ui, u in enumerate(d["units"], 1):
    uid = u.get("id", f"unit{ui}")
    if uid != f"aic-u{ui:02d}":
        err(uid, f"unit id should be aic-u{ui:02d}")
    for k, ty in (("id", str), ("section", str), ("title", str), ("bookPages", list), ("curriculum", list), ("summary", str), ("questions", list)):
        if not isinstance(u.get(k), ty):
            err(uid, f"unit field {k} missing or wrong type")
    if "textId" not in u or u["textId"] is not None:
        err(uid, "textId must be null")
    if u.get("section") not in SEC:
        err(uid, f"unknown section {u.get('section')}")
    for p in u.get("bookPages", []):
        if not (isinstance(p, int) and 1 <= p <= book["pages"]):
            err(uid, f"bad book page {p}")
        pages_seen.append(p)
        if PAGE_TITLES.get(p) and PAGE_TITLES[p] != u["title"]:
            err(uid, f"title should be ‘{PAGE_TITLES[p]}’ as printed on page {p}")
    for c in u.get("curriculum", []):
        if c not in VALID_IDS:
            err(uid, f"unknown curriculum id {c}")
    style(uid + " summary", u["summary"], (1, 2))
    check_quotes(uid + " summary", u["summary"])
    qs = u["questions"]
    if len(qs) != 10:
        err(uid, f"{len(qs)} questions (need 10)")
    if [q.get("difficulty") for q in qs] != DIST:
        err(uid, f"difficulties should be {DIST}")
    if len({q.get("type") for q in qs}) < 3:
        err(uid, "fewer than 3 question types")
    if not any(q.get("misconception") for q in qs):
        err(uid, "no misconception-targeted item")
    n_ext = sum(1 for q in qs if q.get("type") == "extended")
    if not 1 <= n_ext <= 2:
        err(uid, f"{n_ext} extended items (need 1 or 2)")
    n_reason = sum(1 for q in qs if q.get("type") == "extended" or REASON.search(q.get("prompt", "")))
    if n_reason < 2:
        err(uid, f"only {n_reason} reasoning / spot-the-error items")

    for qi, q in enumerate(qs, 1):
        w = q.get("id", f"{uid}-q?")
        if w != f"{uid}-q{qi:02d}":
            err(w, f"question id should be {uid}-q{qi:02d}")
        if w in seen:
            err(w, "duplicate id")
        seen.add(w)
        ty = q.get("type")
        if ty not in TYPES:
            err(w, f"bad type {ty}")
            continue
        for k, t_ in (("prompt", str), ("difficulty", int), ("marks", int), ("explanation", str)):
            if not isinstance(q.get(k), t_):
                err(w, f"{k} missing or wrong type")
        mk = q.get("marks", 0)
        if ty == "extended":
            if not 1 <= mk <= 8:
                err(w, "extended marks must be 1 to 8")
            if not (isinstance(q.get("model"), str) and len(q["model"]) > 150):
                err(w, "extended needs a model paragraph")
            cl = q.get("checklist")
            if not (isinstance(cl, list) and 3 <= len(cl) <= 6 and all(isinstance(x, str) and x for x in cl)):
                err(w, "extended needs a checklist of 3 to 6 points")
        elif not 1 <= mk <= 3:
            err(w, "marks must be 1 to 3")
        if "misconception" in q and not (isinstance(q["misconception"], str) and q["misconception"]):
            err(w, "misconception must be a non-empty string")

        # answer resolver for ‘Who...?’ items
        def resolver(subject=False, q=q):
            p = q.get("prompt", "")
            if q["type"] in ("mcq", "text") and re.match(r"(Who|Which character)\b", p):
                a = q["options"][q["answer"]] if q["type"] == "mcq" else q["answer"]
                return a if subject else canon_speaker(re.sub(r"^The ", "", a))
            return None

        strings = [("prompt", q.get("prompt"), resolver)]
        if ty in ("mcq", "multi"):
            opts = q.get("options")
            if not (isinstance(opts, list) and 3 <= len(opts) <= 5 and all(isinstance(o, str) and o for o in opts)):
                err(w, "options must be 3 to 5 strings")
                opts = opts if isinstance(opts, list) else []
            if len(set(opts)) != len(opts):
                err(w, "duplicate options")
            ans = q.get("answer")
            if ty == "mcq" and not (isinstance(ans, int) and not isinstance(ans, bool) and 0 <= ans < len(opts)):
                err(w, "mcq answer must be a valid index")
            if ty == "multi":
                if not (isinstance(ans, list) and ans and all(isinstance(a, int) and 0 <= a < len(opts) for a in ans) and len(set(ans)) == len(ans)):
                    err(w, "multi answer must be a list of valid indices")
                elif len(ans) == len(opts):
                    err(w, "multi answer selects every option")
            strings += [(f"option {i}", o, None) for i, o in enumerate(opts)]
        elif ty == "text":
            if not (isinstance(q.get("answer"), str) and q["answer"].strip() and len(q["answer"].split()) <= 5):
                err(w, "text answer must be a short non-empty string")
            if not isinstance(q.get("accept", []), list):
                err(w, "accept must be a list")
        elif ty == "numeric":
            if not isinstance(q.get("answer"), (int, float)) or isinstance(q.get("answer"), bool):
                err(w, "numeric answer must be a number")
        elif ty == "order":
            it = q.get("items")
            if not (isinstance(it, list) and len(it) >= 3 and all(isinstance(x, str) and x for x in it) and len(set(it)) == len(it)):
                err(w, "order needs 3 or more distinct items")
            strings += [(f"item {i}", x, None) for i, x in enumerate(it or [])]
        elif ty == "match":
            pr = q.get("pairs")
            if not (isinstance(pr, list) and 3 <= len(pr) <= 5 and all(isinstance(p, list) and len(p) == 2 and all(isinstance(x, str) and x for x in p) for p in pr)):
                err(w, "match needs 3 to 5 pairs")
            else:
                if len({p[1] for p in pr}) != len(pr):
                    err(w, "match right sides must be unique")
                if len({p[0] for p in pr}) != len(pr):
                    err(w, "match left sides must be unique")
                for i, p in enumerate(pr):
                    strings.append((f"pair {i} left", p[0], (lambda subject=False, r=p[1]: r if subject else canon_speaker(re.sub(r"^The ", "", r)))))
                    strings.append((f"pair {i} right", p[1], None))
        elif ty == "truefalse":
            st = q.get("statements")
            if not (isinstance(st, list) and 3 <= len(st) <= 5 and all(isinstance(x, dict) and isinstance(x.get("s"), str) and isinstance(x.get("a"), bool) for x in st)):
                err(w, "truefalse needs 3 to 5 statements {s, a}")
            else:
                if all(x["a"] for x in st) or not any(x["a"] for x in st):
                    err(w, "truefalse should mix true and false")
                strings += [(f"statement {i}", x["s"], None) for i, x in enumerate(st)]
        elif ty == "cloze":
            gaps = q["prompt"].count("___")
            ans = q.get("answer")
            if not (1 <= gaps <= 3 and isinstance(ans, list) and len(ans) == gaps and all(isinstance(a, str) and a for a in ans)):
                err(w, "cloze needs 1 to 3 gaps and a matching answer list")
            acc = q.get("accept")
            if acc is not None and not (isinstance(acc, list) and len(acc) == gaps):
                err(w, "cloze accept must have 1 list per gap")
            strings += [(f"gap {i}", a, None) for i, a in enumerate(ans or [])]
        if ty == "extended":
            strings.append(("model", q.get("model"), None))
            strings += [(f"checklist {i}", c, None) for i, c in enumerate(q.get("checklist") or [])]
        strings.append(("explanation", q.get("explanation"), None))
        if q.get("misconception"):
            strings.append(("misconception", q["misconception"], None))

        for label, s, res in strings:
            style(f"{w} {label}", s, (1, 3) if label == "explanation" else None)
            check_quotes(f"{w} {label}", s, res)
            unquoted_play_text(f"{w} {label}", s)

        pp = plain(q.get("prompt", ""))
        for bs in book_stems:
            if difflib.SequenceMatcher(None, pp, bs).ratio() >= 0.85:
                err(w, f"prompt is a near copy of a printed-book question: {bs}")

# ------------------------------------------------------------------ coverage of the book
if sorted(pages_seen) != EXPECTED:
    missing = sorted(set(EXPECTED) - set(pages_seen))
    extra = sorted(set(pages_seen) - set(EXPECTED))
    err("coverage", f"units should cover content pages {EXPECTED}; missing {missing}, extra {extra}")
if len(pages_seen) != len(set(pages_seen)):
    err("coverage", "a book page has more than 1 unit")

if total_words >= MAX_WORDS_TOTAL:
    err("copyright", f"{total_words} quoted words across the bank (must stay under {MAX_WORDS_TOTAL})")

n_q = sum(len(u["questions"]) for u in d["units"])
if errors:
    print(f"FAIL: {len(errors)} problem(s)")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print(f"PASS: {len(d['units'])} units, {n_q} questions; {total_words} quoted words (limit {MAX_WORDS_TOTAL}); all checks passed.")
