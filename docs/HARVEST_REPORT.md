# Harvest report: GOV.UK curriculum and STA assessment materials

Run date: 2026-10-01, from a machine with normal internet access (no proxy). Branch `worktree-agent-a5f7c8dd04ec3d4d4`.
Every figure below was read from `data/db/eduworks.sqlite` after the run and is also in the committed export `data/jsonl/`.

## Summary

| Source | Fetched | Result |
|---|---|---|
| `nc_govuk` | 25 pages/PDFs | 2,107 national curriculum statements, 11 subjects; 1,238 cross-checked against the Oak ontology, 26 not found |
| `dfe_subject_content` | 63 documents | 2,597 GCSE and 2,623 A-level content rows; 2 documents gave nothing (see Blocked) |
| `sta_ks2` | 18 papers + 3 mark schemes + 3 copyright reports per subject | 18 papers, 575 questions (2024, 2025, 2026) |
| `sta_ks1` | 18 papers + mark schemes + copyright reports | 18 papers, 402 questions (2024, 2025, 2026) |
| `sta_phonics` | 12 PDFs + HTML pages | 3 checks x 40 words (120) + 24 practice-sheet words; 3 thresholds; 3 verified general rules |
| `sta_mtc` | 5 documents | 12 rules (10 verified, 2 unverified) |
| `oak_api` | nothing | Blocked: no `OAK_API_KEY` available (not invented) |
| `linking` | n/a | 667 reasoned unit links, 68,522 lesson-statement links, 14,480 inherited question links |

No source returned 403 on this machine. The earlier 403s came from the sandbox egress proxy, not from GOV.UK. Every GOV.UK page and every
`assets.publishing.service.gov.uk` file was fetched with the plain descriptive client identity below. No browser impersonation, no logins, no paywalls.

## What was actually wrong (and fixed)

The pipeline's network code was fine. The parsers had only ever been tested against synthetic fixtures; the real 2024-2026 PDFs exposed these problems:

1. **Discovery** (`sta_papers_discovery.ts`): "administering Paper 1: arithmetic" teacher guidance was classified as the question paper; modified large print publications were pulled in; copyright reports had no subject. Fixed. Administering guidance is ignored, except the GPS spelling one, which is now a `spelling_script`.
2. **Mark schemes** (`sta_papers_pdf.ts`): section headings "7. Mark schemes for Paper 1" were not recognised (all three papers' rows were merged); a row such as "14 Award TWO marks for the correct answer" was mistaken for a table header and swallowed everything after it; worked-example numbers became rows; the spelling and KS1 tables (headings centred, "M." instead of "Mark", question numbers stacked as "4/5") were unreadable. Fixed, including a monotonic question-number rule.
3. **Content domains**: the maths mark scheme tables carry no domain column. The references are now read from "Table 1: Content domain coverage". Reading domains come from "Content domain: 2d" text.
4. **Copyright reports**: only the first report of a year was used, any line containing "copyright" counted as third party, and the 2024 reports are HTML pages. Now parsed as tables (PDF via PyMuPDF `find_tables`, HTML via `<table>`), one report per subject, "Crown Copyright Commissioned by STA" rows are not third party. The reports state "There is no third-party material in the key stage 2 mathematics and English grammar, punctuation and spelling tests", so only reading is third party.
5. **PDF text layer** (`sta_extract.py`): stacked fractions (bar tolerance by word centre), mixed numbers (whole part glued to the numerator, thin-space words), overprinted duplicate words (a "2 marks" read twice gave 4), numerator above the question number being cut off, `{` and `}` standing for the multiplication and division signs, spelling sentences numbered "1." instead of in the margin.
6. **Answers**: recurring decimals (1.083 with a dot over the 3 loses the dot) are no longer auto-accepted as alternatives; a question whose text has stray numeric lines is left unverified instead of producing a false "mark scheme disagrees" result. Disagreements are still never "fixed": a real one marks the paper failed.
7. **Phonics**: the 2024+ scoring guidance tabulates only the 20 pseudo-words. They are now used as an explicit list (auto_ok only if exactly 20 and all present in the 40 words); general rules are verified against the administration guidance HTML.
8. **HTTP client** (`core/http.ts`): descriptive User-Agent (`EDU_USER_AGENT` to add a contact address), 250 ms minimum gap per host, retry with backoff and `Retry-After` on 429/5xx, a 403 is retried twice and then reported as a 403 (never bypassed). `robots.txt` on www.gov.uk disallows only `/*/print$` and `/search/all*`; nothing we fetch is affected. The `sta_ks1` network probe pointed at the bare assets host (404); it now probes a published asset.
9. Test fixture PDFs rely on a DejaVu font; where it is missing the fixture prints `[ ]` for answer boxes, which the arithmetic parser now also accepts.

The 11 originally failing tests needed PyMuPDF only; with it installed 2 more failures appeared (font metric differences in fraction detection), also fixed. 185 tests pass, `npx tsc --noEmit` is clean.

## Per source

### nc_govuk
National curriculum programmes of study, 25 raw files. 2,107 statements: English 337, mathematics 422, science 455, design and technology 43, geography 31, physical education 20, computing 25, languages 24, music 16, citizenship 15, art and design 12, history 6.
Warnings: no collection link for physical education (fallback URL used); Oak ontology cross-check 1,238 verified, 26 not found, 10 without gov.uk rows.

### dfe_subject_content
63 raw files; 2,597 GCSE rows, 2,623 A-level rows, 39 documents not mapped to a subject.
Flagged: `GCSE_English_language.pdf` yielded no statements ("Nothing parsed"); `gce-as-and-a-level-music` has no subject content attachment.

### sta_ks2 and sta_ks1 (official past papers)
Only 2024, 2025 and 2026 exist on GOV.UK (see Blocked). Counts as stored (`papers`, `questions`, `mark_scheme_entries`, `accepted_answers`):

| Key stage | Subject | Papers | Questions |
|---|---|---|---|
| KS2 | Mathematics (arithmetic 36 q, reasoning P2 and P3) | 9 | 248 |
| KS2 | English GPS (P1 50 q, P2 spelling 20 q) | 6 | 210 |
| KS2 | English reading | 3 | 117 |
| KS1 | Mathematics | 6 | 173 |
| KS1 | English GPS (spelling and questions) | 6 | 117 |
| KS1 | English reading (P1 and P2) | 6 | 112 |
| | **Total** | **36** | **977** (575 KS2 + 402 KS1) |

- Mark scheme entries: 1,062 official rows (238 of them belong to third-party reading papers). Accepted answers: 343. Question to curriculum statement links: 2,654 links on 647 questions.
- All 36 papers pass the validation checks (question count against mark scheme, marks total 40/35/35/50/20, margin marks against scheme, arithmetic recomputed). The 3 KS2 reasoning papers per year are 27/24 (2024), 23/22 (2025), 23/21 (2026) questions, which matches the published mark schemes' totals.
- Question review status (all official STA questions): **154 `auto_ok`** (75 KS2 maths + 41 KS1 maths numeric answers whose arithmetic was recomputed and agrees with the mark scheme, and 38 KS2 GPS tick-one items), **823 `needs_review`**.
  Why `needs_review`: 756 are `self_mark` (diagrams, explanations, spelling items that need the audio script, anything not a single checkable value); 67 are numeric but not machine-verified (long multiplication and division layouts, superscripts such as 3^3, expressions not read in order).
- Third party: **all 229 reading questions** (KS1 112, KS2 117) carry `third_party_flag = 1` and licence `CROWN-THIRD-PARTY`. Their crops are not copied to `public/`. KS2 reading mark scheme entries are flagged the same way. Maths and GPS papers are `OGL-3.0`, `third_party_flag = 0`, as the copyright reports state there is no third-party material in them.
- Only `auto_ok` + `third_party_flag = 0` questions can reach students (`src/lib/repo.ts` untouched). 154 official questions qualify.
- Images: 748 question crops (8.3 MB) in `public/question-images/sta/...` (OGL material only), referenced from `assets`.
- Known remaining gaps: content-domain codes for GPS (`G6.2`, `G2.1` ...) and many KS1 codes do not map to national curriculum statements (logged as `domain_unmapped`, links left empty); the spelling papers have the sentence with a gap but the target word is only in the audio script, so they stay `needs_review`.

### sta_phonics
Checks for 2024, 2025, 2026 (pupils' materials, practice sheet, scoring guidance, answer sheet). 120 words, all `auto_ok`: 60 real and 60 pseudo-words (20 pseudo per year, taken from the scoring guidance's "Pseudo-word" tables and confirmed against the answer sheet order). Practice sheets: 24 words, all `needs_review` (the alien images beside pseudo-words are not detectable, so their pseudo flag is unknown). Thresholds verified: 2024 = 32, 2025 = 32, 2026 = 31. Verified rules: words_per_check 40, sections 2, year2_recheck. Still unverified seed values: `threshold_default`, `pseudo_word_alien`.

### sta_mtc
Multiplication tables check guidance: 12 rules, 10 verified (questionCount 25, secondsPerQuestion 6, pauseSeconds 3, practiceCount 3, minTable 2, maxTable 12, emphasisTables, excludedTables, yearGroup, maxFactor). Not stated in the documents read, so left unverified: `minEmphasisQuestions` and `allowCommutativePairs`.

### linking
Run last as required. Unit links 667 (83 units without any link), 68,522 lesson-statement links, 14,480 question links inherited.

## Blocked or not done, and why

- **Older STA papers (2016-2023) and phonics checks 2012-2023**: not available on GOV.UK any more. The publication URLs (for example `/government/publications/key-stage-2-tests-2019-mathematics-test-materials`) now return a redirect to the collection, and the phonics 2012-2023 pages are empty; `national-curriculum-assessments-practice-materials` lists no documents. The only copy is on the National Archives web archive, which I did not scrape because the brief limits this to GOV.UK and official STA publications. If you want it, say so and it can be added as a separate, explicitly approved source.
- **`oak_api`**: needs a free `OAK_API_KEY` (HTTP 401 without it, including the bulk download). None is set in the environment, `.env` or `.env.local`; I did not invent one. Add `OAK_API_KEY=...` to `.env.local` and run `npm run ingest -- oak_api`.
- **Phonics thresholds before 2024**, and general rule `pseudo_word_alien` (the sentence is no longer on the current pages): unverified.
- **Reading papers**: ingested, but wholly third-party, so never shown to students. Their mark scheme parsing is only partly checked.
- **`GCSE_English_language.pdf`** and **A-level music**: see dfe_subject_content.
- No PDFs are committed (`*.pdf` is gitignored); `.work/raw/` holds the downloads, and url + sha256 + retrieval date are in `data/raw-manifest/*.jsonl`.

## Setup used and re-run commands

PyMuPDF was installed for the user's Python 3.9 (no venv needed): `python3 -m pip install --user pymupdf` (1.26.5; Pillow optional, for smaller PNGs). `ingest/pdf/requirements.txt` lists it. If you prefer a venv: `python3 -m venv .venv && .venv/bin/pip install -r ingest/pdf/requirements.txt` and run everything with `EDU_PYTHON=$PWD/.venv/bin/python` (read by `ingest/sources/govuk_common.ts` and `sta_papers_pdf.ts`).

```
npm ci
npm run db:build                       # starting DB from data/jsonl (+ content/inkworks)
npm run ingest                         # network check, then every step (finished steps are skipped via data/checkpoints/)
npm run ingest -- nc_govuk dfe_subject_content
npm run ingest -- sta_ks2              # EDU_REFRESH=1 re-discovers the manifest; delete data/checkpoints/sta_ks2.json to redo papers
npm run ingest -- sta_ks1
npm run ingest -- sta_phonics          # EDU_FORCE=1 to re-parse
npm run ingest -- sta_mtc
npm run ingest -- oak_api              # needs OAK_API_KEY
npm run ingest -- linking              # always last
npm run db:export                      # rewrite data/jsonl (every part is under 20 MB)
npx vitest run && npx tsc --noEmit
```

Optional: `EDU_USER_AGENT="eduworks-ingest/1.0 (+mailto:you@example.org)"`, `EDU_HTTP_MIN_GAP_MS=500`.
`npm run db:build -- --force` rebuilds the database from the committed JSONL; this was checked after the export (36 official papers, 977 official questions, 144 phonics words, 154 `auto_ok` questions come back unchanged).
