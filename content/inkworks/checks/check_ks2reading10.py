"""Checker for the ks2reading10 website practice bank.
Checks: schema; texts identical to the printed book (re-extracted from the book's laid-out page data, with the book's own
line-number markers verified); every quotation in our wording exists verbatim in the unit text; line references point at
the right lines; find-and-copy answers are in the text; banned words, em dashes and number words in our wording;
distribution rules; no near-copies of the printed book's questions. Exit code 0 only on 100% pass."""
import json, re, sys, os, difflib
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'ks2reading10.json')
BK = '/home/claude/books/ks2reading10/book/'
fails = []
def fail(where, msg): fails.append(f'{where}: {msg}')

d = json.load(open(DATA, encoding='utf-8'))

# ------------------------------------------------------------------ schema
for k in ('book', 'texts', 'units'):
    if k not in d: fail('root', f'missing {k}')
b = d['book']
for k, typ in (('id', str), ('title', str), ('keyStage', str), ('year', str), ('subject', str), ('pages', int), ('ageRange', str), ('sections', list)):
    if not isinstance(b.get(k), typ): fail('book', f'bad {k}')
if b.get('id') != 'ks2reading10': fail('book', 'id must be ks2reading10')
if b.get('keyStage') not in ('KS1', 'KS2', 'KS3', 'KS4'): fail('book', 'keyStage')
secs = {s['id'] for s in b['sections']}
for s in b['sections']:
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', s.get('colour', '')): fail('book', f'colour {s}')

TEXTS = {}
for t in d['texts']:
    for k, typ in (('id', str), ('title', str), ('author', str), ('source', str), ('kind', str), ('lines', list), ('glossary', list)):
        if not isinstance(t.get(k), typ): fail(t.get('id'), f'bad {k}')
    if t['kind'] not in ('prose', 'poem', 'playscript', 'nonfiction'): fail(t['id'], 'kind')
    if not all(isinstance(l, str) and l.strip() for l in t['lines']): fail(t['id'], 'empty line')
    for g in t['glossary']:
        if not (isinstance(g, list) and len(g) == 2): fail(t['id'], f'glossary {g}')
    TEXTS[t['id']] = t
if len(d['texts']) != 24: fail('texts', f'expected 24 texts, got {len(d["texts"])}')

# ------------------------------------------------------------------ texts identical to the printed book
plan = json.load(open(BK + 'plan.json'))
tp = [p for p in plan if p['kind'] == 'test' and 'Questions' not in p['kicker']]
groups = []
for p in tp:
    base = re.sub(r'\s*\(part \d\)$', '', p['title'])
    if groups and groups[-1][0] == base: groups[-1][1].append(p['page'])
    else: groups.append((base, [p['page']]))
def TT(l): return ''.join(r['t'] for r in l['runs'])
book_lines = {}
for title, pages in groups:
    lines, marks = [], []
    for pg in pages:
        pd = json.load(open(BK + 'indd_data/page_%02d.json' % pg))
        tys = sorted(l['base'] for bl in pd['blocks'] if bl['cls'] == 'ps-title' for l in bl['lines'])
        band = lambda y: sum(1 for ty in tys if y > ty)
        col = lambda x: 0 if x < 100 else 1
        body = []
        for bl in pd['blocks']:
            for l in bl['lines']:
                if bl['cls'] == 'ln': marks.append((pg, col(l['left']), l['base'], int(TT(l))))
                elif bl['cls'] in ('first', 'noind', 'vt') or (bl['tag'] == 'P' and bl['cls'] == ''):
                    body.append((l['left'], l['base'], TT(l), bl['cls']))
        body.sort(key=lambda it: (band(it[1]), col(it[0]), it[1]))
        mins = {}
        for it in body:
            if it[3] == 'vt':
                k = (band(it[1]), col(it[0])); mins[k] = min(mins.get(k, 999), it[0])
        for it in body:
            if it[3] == 'vt' and it[0] >= mins[(band(it[1]), col(it[0]))] + 4:
                lines[-1][0] += ' ' + it[2].strip()   # verse line that wrapped: one numbered line
            else:
                lines.append([it[2], pg, col(it[0]), it[1]])
    for pg, c, base, n in marks:
        L = lines[n - 1]
        if not (L[1] == pg and L[2] == c and abs(L[3] - base) < 1): fail(title, f'book line marker {n} does not line up')
    book_lines[title] = ([l[0].strip() for l in lines], pages)

# ------------------------------------------------------------------ helpers
QUOTE = re.compile(r'“([^”]+)”')
REF = re.compile(r'^[\s,.;:?!]*\((lines?) (\d+)(?: to (\d+))?\)')
BANNED = ["it's important to note", "it’s important to note", 'delve', 'crucial', 'vibrant', 'tapestry', 'testament',
          'navigate', 'journey', 'unlock', 'dive into', "in today's world", 'in today’s world']
NUMWORDS = r'\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred|thousand)\b'

def line_spans(lines):
    joined, spans, pos = '', [], 0
    for i, l in enumerate(lines):
        if i: joined += ' '
        start = len(joined); joined += l; spans.append((start, len(joined)))
    return joined, spans
def lines_of(spans, a, b):
    s = next(i for i, (x, y) in enumerate(spans) if a < y + 1) + 1
    e = next(i for i, (x, y) in enumerate(spans) if b <= y + 1) + 1
    return s, e

def strings(q):
    """(field, text, is_our_wording) for every string in a question."""
    out = []
    for k in ('prompt', 'explanation', 'misconception', 'model'):
        if k in q: out.append((k, q[k], True))
    for k in ('options', 'checklist', 'items'):
        for s in q.get(k, []): out.append((k, s, True))
    for s in q.get('statements', []): out.append(('statements', s['s'], True))
    for p in q.get('pairs', []):
        for s in p: out.append(('pairs', s, True))
    if q['type'] == 'text':
        out.append(('answer', q['answer'], False))
        for s in q.get('accept', []): out.append(('accept', s, False))
    return out

def check_wording(where, s):
    bare = QUOTE.sub('', s)
    if '—' in s: fail(where, 'em dash')
    low = bare.lower()
    for w in BANNED:
        if re.search(r'\b' + re.escape(w) + r'\b', low): fail(where, f'banned word "{w}"')
    m = re.search(NUMWORDS, low)
    if m: fail(where, f'number word "{m.group(0)}" (use numerals)')
    if "'" in s or '"' in s: fail(where, 'straight quote mark')
    if re.search(r'[\U0001F300-\U0001FAFF]', s): fail(where, 'emoji')

# ------------------------------------------------------------------ units and questions
reg = json.load(open(BK + '_registry.json'))
if len(d['units']) != 24: fail('units', f'expected 24 units, got {len(d["units"])}')
all_codes = Counter()
seen_q = set()
for u in d['units']:
    uid = u['id']
    for k, typ in (('id', str), ('section', str), ('title', str), ('bookPages', list), ('curriculum', list), ('summary', str), ('textId', str), ('questions', list)):
        if not isinstance(u.get(k), typ): fail(uid, f'bad {k}')
    if u['section'] not in secs: fail(uid, 'section')
    t = TEXTS.get(u['textId'])
    if not t: fail(uid, 'textId not found'); continue
    # text matches book
    bl = book_lines.get(t['title'])
    if not bl: fail(uid, 'text title not in book plan')
    else:
        if bl[0] != t['lines']: fail(uid, 'text lines differ from the printed book')
        want_pages = [p for pg in bl[1] for p in (pg, pg + 1)]
        if u['bookPages'] != want_pages: fail(uid, f'bookPages {u["bookPages"]} != {want_pages}')
    check_wording(uid + ' summary', u['summary'])
    joined, spans = line_spans(t['lines'])
    low_joined = joined.lower()
    qs = u['questions']
    if len(qs) != 10: fail(uid, f'{len(qs)} questions')
    types = Counter(q['type'] for q in qs)
    if len(types) < 4: fail(uid, f'only {len(types)} question types')
    if not any(q.get('misconception') for q in qs): fail(uid, 'no misconception-targeted item')
    if sum(1 for q in qs if q['type'] == 'extended') < 2: fail(uid, 'fewer than 2 reasoning items')
    diffs = [q['difficulty'] for q in qs]
    if diffs[0] > 2 or diffs[-1] < 4 or any(b_ < a_ - 1 for a_, b_ in zip(diffs, diffs[1:])) or sorted(diffs) != diffs:
        fail(uid, f'difficulty not rising: {diffs}')
    codes = Counter(c for q in qs for c in q['curriculum'])
    all_codes.update(codes)
    if codes['2b'] + codes['2d'] < 5: fail(uid, 'fewer than 5 of 10 questions on 2b/2d')
    if sorted(codes) != sorted(u['curriculum']): fail(uid, 'unit curriculum does not match question codes')
    book_stems = [r['stem'] for r in reg if r['page'] - 1 in (bl[1] if bl else [])]
    for n, q in enumerate(qs, 1):
        w = q.get('id', uid)
        if q.get('id') != f'{uid}-q{n:02d}': fail(w, 'id pattern')
        if q['id'] in seen_q: fail(w, 'duplicate id')
        seen_q.add(q['id'])
        for k in ('type', 'prompt', 'difficulty', 'marks', 'explanation', 'curriculum'):
            if k not in q: fail(w, f'missing {k}')
        if not (1 <= q['difficulty'] <= 5): fail(w, 'difficulty')
        if not all(re.fullmatch(r'2[a-h]', c) for c in q['curriculum']): fail(w, f'curriculum {q["curriculum"]}')
        ty = q['type']
        if ty == 'mcq':
            if not (3 <= len(q['options']) <= 5) or not isinstance(q['answer'], int) or not 0 <= q['answer'] < len(q['options']): fail(w, 'mcq shape')
            if len(set(q['options'])) != len(q['options']): fail(w, 'duplicate options')
            if q['marks'] != 1: fail(w, 'marks')
        elif ty == 'truefalse':
            st = q['statements']
            if not (3 <= len(st) <= 5) or not all(isinstance(s['a'], bool) for s in st): fail(w, 'truefalse shape')
            if all(s['a'] for s in st) or not any(s['a'] for s in st): fail(w, 'truefalse all same answer')
        elif ty == 'match':
            if not (3 <= len(q['pairs']) <= 5): fail(w, 'match shape')
            if len({p[1] for p in q['pairs']}) != len(q['pairs']) or len({p[0] for p in q['pairs']}) != len(q['pairs']): fail(w, 'match duplicates')
        elif ty == 'order':
            if not (3 <= len(q['items']) <= 6): fail(w, 'order shape')
        elif ty == 'text':
            if not isinstance(q['answer'], str) or not isinstance(q.get('accept', []), list): fail(w, 'text shape')
            if len(q['answer'].split()) > 12: fail(w, 'text answer too long for a closed answer')
            rng = re.search(r'[Ll]ines (\d+) to (\d+)', q['prompt']) or re.search(r'[Ll]ine (\d+)()', q['prompt'])
            for a in [q['answer']] + q.get('accept', []):
                a2 = a.strip().rstrip('.').lower()
                if a2 not in low_joined: fail(w, f'find-and-copy answer not in text: {a}')
                elif rng:
                    lo = int(rng.group(1)); hi = int(rng.group(2) or lo)
                    part = ' '.join(t['lines'][lo - 1:hi]).lower()
                    if a2 not in part: fail(w, f'answer {a} not inside lines {lo} to {hi}')
        elif ty == 'extended':
            if not q.get('model') or not q.get('checklist') or q['marks'] not in (2, 3): fail(w, 'extended shape')
        else:
            fail(w, f'type {ty} not used in this bank')
        # quotations and line references
        for field, s, ours in strings(q):
            if ours: check_wording(f'{w} {field}', s)
            for m in QUOTE.finditer(s):
                qt = m.group(1)
                occ = [i.start() for i in re.finditer(re.escape(qt), joined)]
                if not occ:
                    fail(w, f'quotation not verbatim in text ({field}): “{qt}”'); continue
                r = REF.match(s[m.end():])
                if r:
                    lo = int(r.group(2)); hi = int(r.group(3) or lo)
                    if r.group(1) == 'lines' and not r.group(3): fail(w, 'bad line ref')
                    if not any(lo <= lines_of(spans, o, o + len(qt))[0] and lines_of(spans, o, o + len(qt))[1] <= hi for o in occ):
                        where_ = [lines_of(spans, o, o + len(qt)) for o in occ]
                        fail(w, f'line ref ({lo}-{hi}) wrong for “{qt}”, actually {where_}')
            for m in re.finditer(r'\b[Ll]ines? (\d+)(?: to (\d+))?', s):
                for g in m.groups():
                    if g and not 1 <= int(g) <= len(t['lines']): fail(w, f'line {g} out of range')
            if re.search(r'\b(paragraph|stanza|verse)s?\b', s, re.I) and field in ('prompt',):
                fail(w, 'prompt refers to paragraphs/verses, which the website text does not show; use line numbers')
        # not a copy of the printed book
        for bs in book_stems:
            r_ = difflib.SequenceMatcher(None, q['prompt'].lower(), bs.lower()).ratio()
            keys = lambda x: set(re.findall(r'(?<=[a-z,] )[A-Z][a-z]+', x)) | set(QUOTE.findall(x)) | set(re.findall(r'\d+', x))
            if r_ > 0.9 or (r_ > 0.75 and keys(q['prompt']) == keys(bs)):
                fail(w, f'too close to book question: {bs[:80]}')

tot = sum(all_codes.values())
if tot and (all_codes['2b'] + all_codes['2d']) / tot < 0.55: fail('book', f'2b+2d share too low: {dict(all_codes)}')
for c in ('2a', '2b', '2c', '2d', '2e', '2f', '2g', '2h'):
    if all_codes[c] == 0: fail('book', f'content domain {c} never practised')

nq = sum(len(u['questions']) for u in d['units'])
print(f'units {len(d["units"])}, texts {len(d["texts"])}, questions {nq}')
print('content domains:', dict(sorted(all_codes.items())))
if fails:
    print(f'FAIL: {len(fails)} problem(s)')
    for f in fails: print(' -', f)
    sys.exit(1)
print('PASS: 100% of checks passed')
