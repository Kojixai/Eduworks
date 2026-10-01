"""Checker for the y3reading website practice bank (Year 3 Reading Comprehension).
Checks: schema; every text identical to the printed book (re-read from the book's laid-out page data: every website line is in
the printed page and every printed body line is in the website text; book line numbers line up; source lines and glossaries
match); every quotation in our wording exists verbatim in the unit text; line references point at the right lines; find-and-copy
and cloze answers are in the text (inside any lines the prompt names); numeric answers recomputed from the text; banned words,
em dashes, number words, straight quotes and emojis in our wording; match pairs unique on both sides; distribution rules; no
near-copies of the printed book's questions. Exit code 0 only on 100% pass."""
import json, re, sys, os, difflib
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'y3reading.json')
BK = '/home/claude/books/y3reading/book/'
fails = []
def fail(where, msg): fails.append(f'{where}: {msg}')

d = json.load(open(DATA, encoding='utf-8'))

# ------------------------------------------------------------------ schema: book and texts
for k in ('book', 'texts', 'units'):
    if k not in d: fail('root', f'missing {k}')
b = d['book']
for k, typ in (('id', str), ('title', str), ('keyStage', str), ('year', str), ('subject', str), ('pages', int), ('ageRange', str), ('sections', list)):
    if not isinstance(b.get(k), typ): fail('book', f'bad {k}')
if b.get('id') != 'y3reading': fail('book', 'id must be y3reading')
if b.get('keyStage') != 'KS2' or b.get('year') != 'Year 3' or b.get('subject') != 'English' or b.get('ageRange') != '7-8': fail('book', 'meta')
secs = {s['id']: s for s in b['sections']}
cfg = open(BK + 'config.py', encoding='utf-8').read()
for sid, s in secs.items():
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', s.get('colour', '')): fail('book', f'colour {s}')
    m = re.search(r'"%s": dict\(name="([^"]+)", colour="(#[0-9A-Fa-f]{6})"' % sid, cfg)
    if not m or m.group(1) != s['name'] or m.group(2) != s['colour']: fail('book', f'section {sid} name/colour differs from book config.py')

TEXTS = {}
for t in d['texts']:
    for k, typ in (('id', str), ('title', str), ('author', str), ('source', str), ('kind', str), ('lines', list), ('glossary', list)):
        if not isinstance(t.get(k), typ): fail(t.get('id'), f'bad {k}')
    if t['kind'] not in ('prose', 'poem', 'playscript', 'nonfiction'): fail(t['id'], 'kind')
    if not all(isinstance(l, str) and l.strip() == l and l for l in t['lines']): fail(t['id'], 'empty or untrimmed line')
    for g in t['glossary']:
        if not (isinstance(g, list) and len(g) == 2 and all(isinstance(x, str) and x for x in g)): fail(t['id'], f'glossary {g}')
    if t['id'] in TEXTS: fail(t['id'], 'duplicate text id')
    TEXTS[t['id']] = t
if len(d['texts']) != 16: fail('texts', f'expected 16 texts, got {len(d["texts"])}')

# ------------------------------------------------------------------ texts identical to the printed book
plan = [p for p in json.load(open(BK + 'plan.json')) if 'text' in p]
def TT(l): return ''.join(r['t'] for r in l['runs'])
def norm(s): return re.sub(r'-\s+', '-', re.sub(r'\s+', ' ', s)).strip()
NOT_BODY = {'dom', 'byr', 'pn', 'fd', 'rd-w', 'rd-t', 'ln', 'cap', 'ps-src', 'ps-src nf-src', 'gi', 'lab', 'sn', 'td', 'te'}
def check_text_against_book(t, p):
    pg = p['pages'][0]; nf = p['section'] == 'NF'
    blocks = json.load(open(BK + 'indd_data/page_%02d.json' % pg))['blocks']
    if t['title'] != p['title']: fail(t['id'], 'title differs from the book plan')
    # all printed text on the page, block by block (each block joined as one string)
    page_strings = [norm(' '.join(TT(l) for l in bl['lines'])) for bl in blocks]
    page_all = ' | '.join(page_strings)
    labels = {norm(TT(bl['lines'][0])).lower() for bl in blocks if bl['cls'] == 'lab'}
    # 1. every website line is printed on the page
    for i, line in enumerate(t['lines'], 1):
        L = norm(line)
        L = re.sub(r'^(NARRATOR|NORTH WIND|SUN|TRAVELLER): ', r'\1 ', L)
        if re.match(r'^\d\. ', L) and nf: L = L[3:]
        m = re.match(r'^(\d{4}): (.*)$', L)
        if m:
            ok = m.group(1) in page_all and m.group(2) in page_all
        elif L.startswith('Characters: '):
            ok = all(nm in page_all for nm in L[12:].split(', '))
        else:
            ok = L in page_all or L.lower() in labels
        if not ok: fail(t['id'], f'line {i} is not printed on page {pg}: {line[:70]}')
    # 2. every printed body line appears in the website text
    web = norm(' '.join(re.sub(r'^(NARRATOR|NORTH WIND|SUN|TRAVELLER): ', r'\1 ', l) for l in t['lines']))
    for bl in blocks:
        c = bl['cls']
        if c in NOT_BODY or bl['tag'] == 'H1': continue
        if c == 'fbox tint' and not nf: continue          # read-aloud activity boxes on story and poem pages
        if bl['tag'] == 'DIV' and c == '': continue        # Talk about it / side notes
        if p['text'] == 11 and bl['lines'][0]['left'] > 140: continue
        for l in bl['lines']:
            s = norm(TT(l))
            if s and s not in web: fail(t['id'], f'printed line missing from website text: {s[:70]}')
    # 3. book line numbers line up with website line numbers
    if not nf:
        marks = [(bl['lines'][0]['left'], bl['lines'][0]['base'], int(TT(bl['lines'][0]))) for bl in blocks if bl['cls'] == 'ln']
        for left, base, n in marks:
            if p['text'] == 14: continue      # playscript: the book numbers speeches only; the website numbers every line
            if p['text'] == 1: idx = n + 1 if left < 95 else n + 10   # 2 poems, each with its title line
            else: idx = n
            target = [TT(l) for bl in blocks if bl['cls'] not in NOT_BODY for l in bl['lines'] if abs(l['base'] - base) < 1.5 and abs(l['left'] - left) < 95 and l['left'] > left]
            if not target or idx > len(t['lines']) or norm(target[0]) not in norm(t['lines'][idx - 1]):
                fail(t['id'], f'book line {n} does not match website line {idx}')
    # 4. source line and glossary
    src = ''
    for bl in blocks:
        if bl['cls'] in ('ps-src', 'ps-src nf-src'):
            for l in bl['lines']:
                s = TT(l).strip(); src = src + s if src.endswith('-') else (src + ' ' + s).strip()
    if t['source'] != src: fail(t['id'], 'source line differs from the printed credit')
    gl_print = [norm(' '.join(TT(l) for l in bl['lines'])) for bl in blocks if bl['cls'] == 'gi']
    if len(gl_print) != len(t['glossary']): fail(t['id'], 'glossary length differs from the book')
    for (term, mean), g in zip(t['glossary'], gl_print):
        if norm(term + ' ' + mean) != g: fail(t['id'], f'glossary entry differs: {term}')

# ------------------------------------------------------------------ helpers
QUOTE = re.compile(r'“([^”]+)”')
REF = re.compile(r'^[\s,.;:?!]*\((lines?) (\d+)(?: to (\d+))?\)')
BANNED = ["it's important to note", "it’s important to note", 'delve', 'crucial', 'vibrant', 'tapestry', 'testament',
          'navigate', 'journey', 'unlock', 'dive into', "in today's world", 'in today’s world']
NUMWORDS = r'\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred|thousand)\b'
def line_spans(lines):
    joined, spans = '', []
    for i, l in enumerate(lines):
        if i: joined += ' '
        start = len(joined); joined += l; spans.append((start, len(joined)))
    return joined, spans
def lines_of(spans, a, b):
    s = next(i for i, (x, y) in enumerate(spans) if a < y + 1) + 1
    e = next(i for i, (x, y) in enumerate(spans) if b <= y + 1) + 1
    return s, e
def strings(q):
    out = []
    for k in ('prompt', 'explanation', 'misconception', 'model'):
        if k in q: out.append((k, q[k], True))
    for k in ('options', 'checklist', 'items'):
        for s in q.get(k, []): out.append((k, s, True))
    for s in q.get('statements', []): out.append(('statements', s['s'], True))
    for p in q.get('pairs', []):
        for s in p: out.append(('pairs', s, True))
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
    if re.search(r'[\U0001F300-\U0001FAFF☀-➿]', s): fail(where, 'emoji')
def ap(s): return s.replace("'", '’').lower().strip().rstrip('.')

# ------------------------------------------------------------------ numeric answers recomputed from the texts
def num_expect(qid, text):
    j = ' '.join(text['lines'])
    if qid == 'y3reading-u08-q08':
        a = int(re.search(r'In December (\d{4}), she became the first person to find a complete skeleton of a Plesiosaurus', j).group(1))
        b_ = int(re.search(r'In December (\d{4}), she dug up a jumble of bones', j).group(1))
        return b_ - a
    if qid == 'y3reading-u10-q07':
        return int(re.search(r'Marlborough Downs, (\d+) miles away', j).group(1))
    if qid == 'y3reading-u16-q03':
        return int(re.search(r'measured it as (\d+) Roman miles', j).group(1))
    if qid == 'y3reading-u16-q08':
        return int(re.search(r'runs for (\d+) miles', j).group(1)) - int(re.search(r'western (\d+) miles were built of turf', j).group(1))
    return None

# ------------------------------------------------------------------ units and questions
reg = json.load(open(BK + '_registry.json'))
if len(d['units']) != 16: fail('units', f'expected 16 units, got {len(d["units"])}')
all_codes = Counter(); seen_q = set(); used_texts = set(); right_sides = Counter()
NC_OK = {'EN34-RC-1a', 'EN34-RC-1b', 'EN34-RC-1c', 'EN34-RC-1d', 'EN34-RC-1e', 'EN34-RC-1f', 'EN34-RC-1g', 'EN34-RC-1h',
         'EN34-RC-2a', 'EN34-RC-2b', 'EN34-RC-2c', 'EN34-RC-2d', 'EN34-RC-2e', 'EN34-RC-2f', 'EN34-RC-3'}
pack_ids = {s['id'] for s in json.load(open('/home/claude/books/y3reading/research/research_pack.json'))['curriculum']['statements'] if s['status'] == 'statutory'}
if not NC_OK <= pack_ids: fail('curriculum', f'ids not statutory in research pack: {NC_OK - pack_ids}')
CODE_NC = {'2a': {'EN34-RC-2a'}, '2b': {'EN34-RC-2a', 'EN34-RC-3'}, '2c': {'EN34-RC-2e'}, '2d': {'EN34-RC-2c'}, '2e': {'EN34-RC-2d'},
           '2f': {'EN34-RC-2f'}, '2g': {'EN34-RC-1g'}, '2h': {'EN34-RC-2c'}}
for ui, u in enumerate(d['units'], 1):
    uid = u['id']
    for k, typ in (('id', str), ('section', str), ('title', str), ('bookPages', list), ('curriculum', list), ('summary', str), ('textId', str), ('questions', list)):
        if not isinstance(u.get(k), typ): fail(uid, f'bad {k}')
    if uid != f'y3reading-u{ui:02d}': fail(uid, 'unit id pattern')
    p = plan[ui - 1]
    if u['section'] != p['section'] or u['section'] not in secs: fail(uid, 'section')
    if u['bookPages'] != [p['pages'][0], p['pages'][0] + 1]: fail(uid, f'bookPages {u["bookPages"]}')
    t = TEXTS.get(u['textId'])
    if not t: fail(uid, 'textId not found'); continue
    if u['textId'] in used_texts: fail(uid, 'text used twice')
    used_texts.add(u['textId'])
    if u['title'] != t['title']: fail(uid, 'unit title differs from text title')
    if (t['kind'] == 'nonfiction') != (u['section'] == 'NF'): fail(uid, 'kind/section mismatch')
    check_text_against_book(t, p)
    check_wording(uid + ' summary', u['summary'])
    joined, spans = line_spans(t['lines'])
    low_joined = ap(joined)
    qs = u['questions']
    if len(qs) != 10: fail(uid, f'{len(qs)} questions')
    types = Counter(q['type'] for q in qs)
    if len(types) < 6: fail(uid, f'only {len(types)} question types')
    for need in ('mcq', 'text', 'order', 'truefalse', 'match', 'extended'):
        if not types[need]: fail(uid, f'no {need} question')
    if not 1 <= types['extended'] <= 2: fail(uid, 'needs 1 or 2 extended items')
    if not any(q.get('misconception') for q in qs): fail(uid, 'no misconception-targeted item')
    diffs = [q['difficulty'] for q in qs]
    if diffs[0] > 1 or diffs[-1] != 5 or sorted(diffs) != diffs or any(b_ > a_ + 1 for a_, b_ in zip(diffs, diffs[1:])):
        fail(uid, f'difficulty not rising: {diffs}')
    codes = Counter(c for q in qs for c in q['curriculum'] if re.fullmatch(r'2[a-h]', c))
    all_codes.update(codes)
    for need in ('2a', '2b', '2d'):
        if not codes[need]: fail(uid, f'no {need} question')
    if sum(codes[c] for c in ('2d', '2e', '2f', '2g', '2h')) < 2: fail(uid, 'fewer than 2 reasoning items')
    if sorted(set(c for q in qs for c in q['curriculum'])) != sorted(u['curriculum']): fail(uid, 'unit curriculum does not match question tags')
    book_stems = [r['stem'] for r in reg if r.get('kind') == 'q' and r['page'] == p['pages'][0] + 1]
    if len(book_stems) < 7: fail(uid, 'could not load the book questions to compare against')
    for n, q in enumerate(qs, 1):
        w = q.get('id', uid)
        if q.get('id') != f'{uid}-q{n:02d}': fail(w, 'id pattern')
        if q['id'] in seen_q: fail(w, 'duplicate id')
        seen_q.add(q['id'])
        for k in ('type', 'prompt', 'difficulty', 'marks', 'explanation', 'curriculum'):
            if k not in q: fail(w, f'missing {k}')
        if not (1 <= q['difficulty'] <= 5): fail(w, 'difficulty')
        cc = [c for c in q['curriculum'] if re.fullmatch(r'2[a-h]', c)]
        nc = [c for c in q['curriculum'] if c.startswith('EN34-')]
        if len(cc) != 1 or not nc or len(nc) + len(cc) != len(q['curriculum']): fail(w, f'curriculum tags {q["curriculum"]}')
        elif not set(nc) <= NC_OK or not CODE_NC[cc[0]] & set(nc): fail(w, f'curriculum ids do not fit code {cc[0]}: {nc}')
        ty = q['type']
        if ty == 'mcq':
            if not (3 <= len(q['options']) <= 5) or not isinstance(q['answer'], int) or not 0 <= q['answer'] < len(q['options']): fail(w, 'mcq shape')
            if len(set(q['options'])) != len(q['options']): fail(w, 'duplicate options')
            if q['marks'] != 1: fail(w, 'marks')
        elif ty == 'multi':
            a = q['answer']
            if not (3 <= len(q['options']) <= 5) or not isinstance(a, list) or not a or len(a) >= len(q['options']) or len(set(a)) != len(a) \
               or not all(isinstance(i, int) and 0 <= i < len(q['options']) for i in a): fail(w, 'multi shape')
            if len(set(q['options'])) != len(q['options']): fail(w, 'duplicate options')
        elif ty == 'truefalse':
            st = q['statements']
            if not (3 <= len(st) <= 5) or not all(isinstance(s['a'], bool) for s in st): fail(w, 'truefalse shape')
            if all(s['a'] for s in st) or not any(s['a'] for s in st): fail(w, 'truefalse all same answer')
        elif ty == 'match':
            pr = q['pairs']
            if not (3 <= len(pr) <= 5) or not all(len(x) == 2 for x in pr): fail(w, 'match shape')
            if len({x[1] for x in pr}) != len(pr): fail(w, 'match right side not unique')
            if len({x[0] for x in pr}) != len(pr): fail(w, 'match left side not unique')
            for x in pr: right_sides[x[1]] += 1
        elif ty == 'order':
            if not (3 <= len(q['items']) <= 6) or len(set(q['items'])) != len(q['items']): fail(w, 'order shape')
        elif ty in ('text', 'cloze'):
            ans = [q['answer']] + q.get('accept', []) if ty == 'text' else q['answer'] + [a for g in q.get('accept', []) for a in g]
            if ty == 'text' and (not isinstance(q['answer'], str) or len(q['answer'].split()) > 6): fail(w, 'text answer must be a short closed answer')
            if ty == 'cloze':
                if q['prompt'].count('___') != len(q['answer']) or not 1 <= len(q['answer']) <= 3: fail(w, 'cloze gaps')
                if len(q.get('accept', [])) not in (0, len(q['answer'])): fail(w, 'cloze accept shape')
            rng = re.search(r'[Ll]ines (\d+) to (\d+)', q['prompt']) or re.search(r'[Ll]ine (\d+)()', q['prompt'])
            for a in ans:
                a2 = ap(a)
                if a2 not in low_joined: fail(w, f'answer not in text: {a}')
                elif rng:
                    lo = int(rng.group(1)); hi = int(rng.group(2) or lo)
                    if a2 not in ap(' '.join(t['lines'][lo - 1:hi])): fail(w, f'answer {a} not inside lines {lo} to {hi}')
        elif ty == 'numeric':
            if not isinstance(q['answer'], (int, float)): fail(w, 'numeric shape')
            exp = num_expect(q['id'], t)
            if exp is None: fail(w, 'no independent recomputation for this numeric item')
            elif exp != q['answer']: fail(w, f'numeric answer {q["answer"]} but text gives {exp}')
        elif ty == 'extended':
            if not q.get('model') or not q.get('checklist') or q['marks'] not in (2, 3): fail(w, 'extended shape')
        else:
            fail(w, f'type {ty} not allowed')
        # quotations and line references
        for field, s, ours in strings(q):
            check_wording(f'{w} {field}', s)
            for m in QUOTE.finditer(s):
                qt = m.group(1)
                occ = [i.start() for i in re.finditer(re.escape(qt), joined)]
                if not occ:
                    fail(w, f'quotation not verbatim in text ({field}): “{qt}”'); continue
                r = REF.match(s[m.end():])
                if r:
                    lo = int(r.group(2)); hi = int(r.group(3) or lo)
                    if (r.group(1) == 'lines') != bool(r.group(3)): fail(w, 'bad line ref wording')
                    if not any(lo <= lines_of(spans, o, o + len(qt))[0] and lines_of(spans, o, o + len(qt))[1] <= hi for o in occ):
                        fail(w, f'line ref ({lo}-{hi}) wrong for “{qt}”, actually {[lines_of(spans, o, o + len(qt)) for o in occ]}')
            for m in re.finditer(r'\b[Ll]ines? (\d+)(?: (?:to|and) (\d+))?', s):
                for g in m.groups():
                    if g and not 1 <= int(g) <= len(t['lines']): fail(w, f'line {g} out of range')
            if field == 'prompt' and re.search(r'\b(paragraph|stanza|verse)s?\b', s, re.I):
                fail(w, 'prompt refers to paragraphs/verses, which the website does not show; use line numbers')
        # not a copy of the printed book
        for bs in book_stems:
            r_ = difflib.SequenceMatcher(None, q['prompt'].lower(), bs.lower()).ratio()
            if r_ > 0.72: fail(w, f'too close to book question ({r_:.2f}): {bs[:80]}')

pos = Counter(q['answer'] for u in d['units'] for q in u['questions'] if q['type'] == 'mcq')
if pos and max(pos.values()) > 0.4 * sum(pos.values()): fail('book', f'mcq correct answers bunched in one position: {dict(pos)}')
dups = [s for s, c in right_sides.items() if c > 1]
if dups: fail('book', f'match right sides repeated across the bank: {dups}')
for c in ('2a', '2b', '2c', '2d', '2e', '2f', '2g', '2h'):
    if all_codes[c] == 0: fail('book', f'content domain {c} never practised')
tot = sum(all_codes.values())
if tot and (all_codes['2b'] + all_codes['2d']) / tot < 0.5: fail('book', f'2b+2d share too low: {dict(all_codes)}')

nq = sum(len(u['questions']) for u in d['units'])
print(f'units {len(d["units"])}, texts {len(d["texts"])}, questions {nq}')
print('content domains:', dict(sorted(all_codes.items())))
print('types:', dict(Counter(q['type'] for u in d['units'] for q in u['questions'])))
if fails:
    print(f'FAIL: {len(fails)} problem(s)')
    for f in fails: print(' -', f)
    sys.exit(1)
print('PASS: 100% of checks passed')
