/**
 * Source: STA national curriculum past test materials (KS2 2016+, KS1 2016-2023).
 *
 *  1. discovery   gov.uk Content API collection -> per-year publications -> classified PDF attachments,
 *                 kept in data/sta/manifest-<ks>.json (committed; reused when gov.uk is unreachable)
 *  2. download    ctx.fetchRaw (bytes in .work/raw, never committed; url+sha256 in raw_files/raw-manifest)
 *  3. extraction  ingest/pdf/sta_extract.py: question starts (left-margin numbers), regions, margin marks,
 *                 cropped PNG per question -> public/question-images/sta/<ks>/<year>/<slug>/q<n>.png
 *  4. mark scheme per-question rows (requirement, marks, guidance, content domain). Answers come ONLY from
 *                 the mark scheme; nothing is invented or corrected. Unparseable -> raw text + needs_review.
 *  5. typing      arithmetic single-value answers -> numeric; everything else -> self_mark (needs_review);
 *                 unambiguous GPS tick-one items -> mcq.
 *  6. validation  per paper: question count vs mark scheme, marks total vs paper total, margin marks vs
 *                 scheme, arithmetic recomputed and compared with the mark scheme answer (disagreement is
 *                 flagged, never "fixed"). Stored in papers.validation_json / validation_status.
 *  7. copyright   copyright report -> third_party_flag on papers/questions (reading: whole paper, always).
 *  8. links       content domain refs -> NC statements (see sta_papers_links.ts).
 * Resumable per paper through checkpoints (paper:<paper_code>); every paper is re-ingested idempotently.
 */
import fs from "node:fs";
import path from "node:path";
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext, ROOT, WORK_DIR, sha256, shortHash, type Provenance } from "../core/context";
import { BlockedHostError } from "../core/http";
import { answerAgrees, computeQuestion, parseRequirement, type ExprResult, type ParsedAnswer } from "./sta_papers_arith";
import {
  discover,
  isPaperKind,
  paperCode,
  paperSpec,
  readManifest,
  subjectForKind,
  writeManifest,
  type ContentGetter,
  type KeyStage,
  type Manifest,
  type ManifestEntry,
  type PaperKind,
  type Subject,
} from "./sta_papers_discovery";
import { DomainLinker } from "./sta_papers_links";
import {
  coverFacts,
  extractLines,
  extractQuestions,
  applyDomainTable,
  parseDomainTable,
  parseCopyright,
  parseCopyrightHtml,
  parseCopyrightTables,
  extractTables,
  parseMarkScheme,
  rowsForPaper,
  thirdPartyFor,
  type CopyrightItem,
  type ExtractedQuestion,
  type MsRow,
} from "./sta_papers_pdf";
import { OGL_ATTRIBUTION, SOURCES } from "./registry";

export interface FetchedPdf {
  path: string;
  checksum: string;
}
export interface StaDeps {
  /** gov.uk Content API getter (default: core/govuk getContent) */
  getContent?: ContentGetter;
  /** PDF fetcher (default: ctx.fetchRaw). Must throw BlockedHostError for unreachable hosts. */
  fetchPdf?: (ctx: IngestContext, url: string, fileName: string) => Promise<FetchedPdf>;
}
export interface StaOptions {
  keyStage: KeyStage;
  /** only these years */
  years?: number[];
  /** ignore checkpoints and re-ingest every paper */
  force?: boolean;
  /** rediscover even when a committed manifest exists (also EDU_REFRESH=1) */
  refreshManifest?: boolean;
  /** default data/sta */
  manifestDir?: string;
  /** web root that receives question-images/ (default <repo>/public) */
  publicDir?: string;
  /** scratch space for crops before they are published (default .work/raw/<source>/crops) */
  workDir?: string;
  deps?: StaDeps;
}

export interface StaResult {
  status: "ok" | "partial" | "blocked" | "failed";
  blockedHost?: string;
  papers: number;
  skipped: number;
  failed: string[];
  stats: Record<string, number>;
}

const SUBJECT_LABEL: Record<Subject, string> = {
  maths: "mathematics",
  gps: "English grammar, punctuation and spelling",
  reading: "English reading",
};
const THIRD_PARTY_LICENCE = "CROWN-THIRD-PARTY";

export const staAttribution = (ks: KeyStage, year: number, subject: Subject) =>
  `${OGL_ATTRIBUTION} ${year} key stage ${ks.slice(2)} ${SUBJECT_LABEL[subject]} test materials, Standards and Testing Agency.`;

const defaultFetch = async (ctx: IngestContext, url: string, fileName: string): Promise<FetchedPdf> => {
  const r = await ctx.fetchRaw(url, fileName);
  return { path: r.path, checksum: r.checksum };
};

export async function ingestStaPapers(store: DataStore, opts: StaOptions): Promise<StaResult> {
  const ks = opts.keyStage;
  const src = SOURCES.find((s) => s.id === `sta_${ks}`);
  if (!src) throw new Error(`unknown source sta_${ks}`);
  const ctx = new IngestContext(store, src.id, src.licence_id, src.attribution_text);
  await ctx.start();
  const result: StaResult = { status: "ok", papers: 0, skipped: 0, failed: [], stats: {} };
  try {
    const manifest = await loadManifest(ctx, ks, opts);
    await ingestFromManifest(ctx, store, manifest, opts, result);
    result.status = result.failed.length ? "partial" : "ok";
    await ctx.finish(result.status);
  } catch (e) {
    if (e instanceof BlockedHostError) {
      await ctx.log("error", "host_blocked", `Host ${e.host} is blocked from this environment; STA ${ks} ingest stopped.`, { host: e.host });
      await ctx.finish("blocked", e.message);
      result.status = "blocked";
      result.blockedHost = e.host;
    } else {
      await ctx.log("error", "failed", String((e as Error).stack ?? e));
      await ctx.finish("failed", String((e as Error).message ?? e));
      result.status = "failed";
      result.stats = ctx.getStats();
      throw e;
    }
  }
  result.stats = ctx.getStats();
  return result;
}

async function loadManifest(ctx: IngestContext, ks: KeyStage, opts: StaOptions): Promise<Manifest> {
  const existing = readManifest(ks, opts.manifestDir);
  if (existing && !opts.refreshManifest && !process.env.EDU_REFRESH) {
    await ctx.log("info", "manifest", `using committed manifest (${existing.entries.length} entries, ${existing.generated_at})`);
    return existing;
  }
  try {
    const m = await discover(ks, opts.deps?.getContent, ctx.sourceId);
    if (!m.entries.length) {
      await ctx.log("warn", "discovery_empty", "gov.uk discovery found no test material attachments", { collection: m.collection_url });
      if (existing) return existing;
    } else writeManifest(m, opts.manifestDir);
    ctx.bump("manifest_entries", m.entries.length);
    return m;
  } catch (e) {
    if (e instanceof BlockedHostError && existing) {
      await ctx.log("warn", "host_blocked", `Host ${e.host} blocked during discovery; using committed manifest`, { host: e.host });
      return existing;
    }
    throw e;
  }
}

interface YearDocs {
  year: number;
  papers: ManifestEntry[];
  markSchemes: ManifestEntry[];
  copyrights: ManifestEntry[];
  readingBooklets: ManifestEntry[];
}

function paperNumberOf(e: ManifestEntry, ks: KeyStage): number | null {
  if (e.paper_number !== null) return e.paper_number;
  const spec = paperSpec(ks, e.kind as PaperKind, null, e.combined);
  const m = spec.slug.match(/-p(\d)-?/);
  return m ? Number(m[1]) : null;
}

/** Mark scheme for a paper: same subject; prefer one whose title names this paper. */
export function pickMarkScheme(schemes: ManifestEntry[], paper: ManifestEntry, ks: KeyStage): ManifestEntry | undefined {
  const subject = subjectForKind(paper.kind as PaperKind);
  const same = schemes.filter((s) => s.subject === subject);
  const n = paperNumberOf(paper, ks);
  const named = same.find((s) => s.paper_number !== null && s.paper_number === n);
  return named ?? same.find((s) => s.paper_number === null) ?? same[0];
}

/** The copyright report published with this subject's test materials (reports are per publication). */
export function copyrightFor(entries: ManifestEntry[], subject: Subject): ManifestEntry | undefined {
  return entries.find((e) => e.subject === subject) ?? entries.find((e) => e.subject === null) ?? entries[0];
}

/** HTML (GOV.UK page) or PDF copyright report -> items. Structured tables first, free text as fallback. */
async function loadCopyright(file: string): Promise<CopyrightItem[]> {
  const head = fs.readFileSync(file).subarray(0, 400).toString("utf8").trimStart();
  if (/^<(!doctype|html|\?xml)/i.test(head)) {
    const r = parseCopyrightHtml(fs.readFileSync(file, "utf8"));
    if (r.tables) return r.items;
  } else {
    const r = parseCopyrightTables(await extractTables(file));
    if (r.tables) return r.items;
  }
  return parseCopyright(await extractLines(file));
}

async function ingestFromManifest(ctx: IngestContext, store: DataStore, m: Manifest, opts: StaOptions, result: StaResult) {
  const ks = m.key_stage;
  const years = new Map<number, YearDocs>();
  for (const e of m.entries) {
    if (opts.years && !opts.years.includes(e.year)) continue;
    const y = years.get(e.year) ?? { year: e.year, papers: [], markSchemes: [], copyrights: [], readingBooklets: [] };
    if (isPaperKind(e.kind)) y.papers.push(e);
    else if (e.kind === "mark_scheme") y.markSchemes.push(e);
    else if (e.kind === "copyright_report") y.copyrights.push(e);
    else if (e.kind === "reading_booklet") y.readingBooklets.push(e);
    years.set(e.year, y);
  }
  const fetchPdf = opts.deps?.fetchPdf ?? defaultFetch;
  const pdfCache = new Map<string, Promise<FetchedPdf>>();
  const fetchOnce = (url: string, name: string) => {
    let p = pdfCache.get(url);
    if (!p) {
      p = fetchPdf(ctx, url, name);
      pdfCache.set(url, p);
      p.catch(() => pdfCache.delete(url));
    }
    return p;
  };
  const msCache = new Map<string, Promise<MsRow[]>>();
  const crCache = new Map<string, Promise<CopyrightItem[]>>();
  const linker = new DomainLinker(store);

  for (const y of [...years.values()].sort((a, b) => a.year - b.year)) {
    const seenCodes = new Set<string>();
    for (const p of y.papers) {
      const kind = p.kind as PaperKind;
      const spec = paperSpec(ks, kind, p.paper_number, p.combined);
      const code = paperCode(ks, y.year, spec.slug);
      if (seenCodes.has(code)) continue;
      seenCodes.add(code);
      if (!opts.force && ctx.isDone(`paper:${code}`)) {
        result.skipped++;
        ctx.bump("papers_skipped");
        continue;
      }
      try {
        const ms = pickMarkScheme(y.markSchemes, p, ks);
        const paperPdf = await fetchOnce(p.url, `${code}-${shortHash(p.url).slice(0, 6)}.pdf`);
        let msRows: MsRow[] | null = null;
        let msPdf: FetchedPdf | null = null;
        if (ms) {
          msPdf = await fetchOnce(ms.url, `${ks}-${y.year}-${ms.subject}-ms-${shortHash(ms.url).slice(0, 6)}.pdf`);
          let rowsP = msCache.get(ms.url);
          if (!rowsP) {
            rowsP = extractLines(msPdf.path).then((doc) => {
              const rows = parseMarkScheme(doc);
              applyDomainTable(rows, parseDomainTable(doc));
              return rows;
            });
            msCache.set(ms.url, rowsP);
          }
          msRows = await rowsP;
        } else await ctx.log("warn", "mark_scheme_missing", `No mark scheme found for ${code}`, { year: y.year, kind });
        let crItems: CopyrightItem[] = [];
        let crPdf: FetchedPdf | null = null;
        const crEntry = copyrightFor(y.copyrights, subjectForKind(kind));
        if (crEntry) {
          crPdf = await fetchOnce(crEntry.url, `${ks}-${y.year}-copyright-${shortHash(crEntry.url).slice(0, 6)}.pdf`);
          let cp = crCache.get(crEntry.url);
          if (!cp) {
            cp = loadCopyright(crPdf.path);
            crCache.set(crEntry.url, cp);
          }
          crItems = await cp;
        } else await ctx.log("warn", "copyright_report_missing", `No copyright report listed for ${ks} ${y.year}`, { code });

        await ingestPaper(ctx, store, linker, {
          ks,
          year: y.year,
          entry: p,
          kind,
          code,
          paperPdf,
          msEntry: ms ?? null,
          msPdf,
          msRows,
          crEntry: crEntry ?? null,
          crItems,
          readingBooklets: kind === "reading_answer" ? y.readingBooklets.filter((b) => b.paper_number === null || b.paper_number === paperNumberOf(p, ks)) : [],
          opts,
        });
        await ctx.markDone(`paper:${code}`, `${paperPdf.checksum.slice(0, 12)}:${msPdf?.checksum.slice(0, 12) ?? "-"}`);
        result.papers++;
      } catch (e) {
        if (e instanceof BlockedHostError) throw e;
        result.failed.push(code);
        await ctx.log("error", "paper_failed", `${code}: ${(e as Error).message}`, { url: p.url, stack: (e as Error).stack });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
interface PaperJob {
  ks: KeyStage;
  year: number;
  entry: ManifestEntry;
  kind: PaperKind;
  code: string;
  paperPdf: FetchedPdf;
  msEntry: ManifestEntry | null;
  msPdf: FetchedPdf | null;
  msRows: MsRow[] | null;
  crEntry: ManifestEntry | null;
  crItems: CopyrightItem[];
  readingBooklets: ManifestEntry[];
  opts: StaOptions;
}

interface Check {
  id: string;
  ok: boolean;
  [k: string]: unknown;
}

interface Draft {
  q: ExtractedQuestion;
  n: string;
  rows: MsRow[];
  marks: number;
  domain: string | null;
  qtype: "numeric" | "mcq" | "self_mark";
  answers: Array<{ answer: string; kind: "numeric" | "fraction" | "exact" }>;
  options: Array<{ label: string; text: string; is_correct: number }>;
  notes: string[];
  confidence: number;
  verified: boolean;
  disagreement: boolean;
  computed: ExprResult | null;
  thirdParty: boolean;
}

/** accepted_answers kind for one mark scheme value, following the mark scheme's equivalence wording. */
export function answerKind(a: ParsedAnswer, equivalentFractions: boolean, exactDecimal: boolean): "numeric" | "fraction" | "exact" {
  if (a.remainder) return "exact";
  if (a.form === "fraction" || a.form === "mixed") {
    if (equivalentFractions && exactDecimal) return "fraction"; // any equal value, fraction or decimal
    if (equivalentFractions) return "numeric"; // marking.ts: a fraction answer accepts only equal fractions
    return "exact"; // no equivalents stated: only the printed form
  }
  return "numeric";
}

/** Tick-one GPS item: options from the question text; the correct one must be unambiguous in the mark scheme. */
export function detectMcq(questionText: string, requirement: string): { options: string[]; correct: number } | null {
  const lines = questionText.split("\n").map((l) => l.trim()).filter(Boolean);
  const i = lines.findIndex((l) => /\btick one\b/i.test(l));
  if (i < 0) return null;
  const options = lines.slice(i + 1).filter((l) => !/^\d+\s*marks?$/i.test(l) && !/^\d+$/.test(l)).slice(0, 6);
  if (options.length < 2 || options.length > 6) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[‘’“”"'.,!?]/g, "").replace(/\s+/g, " ").trim();
  const opts = options.map(norm);
  if (new Set(opts).size !== opts.length) return null;
  const req = norm(requirement);
  const quoted = [...requirement.matchAll(/[“"‘']([^”"’']{1,80})[”"’']/g)].map((m) => norm(m[1]));
  let hits = opts.map((o, k) => (quoted.includes(o) ? k : -1)).filter((k) => k >= 0);
  if (hits.length !== 1) {
    // substring match only when no option is contained in another (avoids "the" vs "then" ambiguity)
    const contained = opts.some((a, x) => opts.some((b, y) => x !== y && b.includes(a)));
    if (contained) return null;
    hits = opts.map((o, k) => (new RegExp(`(^|\\W)${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\W)`).test(req) ? k : -1)).filter((k) => k >= 0);
  }
  return hits.length === 1 ? { options, correct: hits[0] } : null;
}

async function ingestPaper(ctx: IngestContext, store: DataStore, linker: DomainLinker, job: PaperJob) {
  const { ks, year, kind, code, opts } = job;
  const subject = subjectForKind(kind);
  const spec = paperSpec(ks, kind, job.entry.paper_number, job.entry.combined);
  const paperNumber = job.entry.paper_number ?? (spec.slug.match(/-p(\d)/) ? Number(spec.slug.match(/-p(\d)/)![1]) : null);
  const paperId = `sta:${code}`;
  const attribution = staAttribution(ks, year, subject);
  const tpAttribution = `${attribution} Contains third-party copyright material listed in the ${year} copyright report, which is not covered by the Open Government Licence.`;

  // ---- extraction
  const workDir = path.join(opts.workDir ?? path.join(WORK_DIR, ctx.sourceId, "crops"), code);
  fs.rmSync(workDir, { recursive: true, force: true });
  const ext = await extractQuestions(job.paperPdf.path, workDir);
  const questions = ext.questions;
  if (!questions.length) await ctx.log("error", "no_questions", `${code}: no question numbers detected in the left margin`, { url: job.entry.url });
  const msRows = job.msRows ? rowsForPaper(job.msRows, paperNumber) : [];
  if (job.msRows && !msRows.length) await ctx.log("warn", "ms_rows_missing", `${code}: mark scheme has no rows for paper ${paperNumber}`, { url: job.msEntry?.url });

  const tp = thirdPartyFor(job.crItems, subject, paperNumber, kind === "reading_answer");
  const tpQuestions = new Set(tp.questions);
  for (const q of questions) if (tp.pages.has(q.page)) tpQuestions.add(q.number);
  const paperThirdParty = tp.whole || tpQuestions.size > 0;

  // ---- drafts
  const drafts: Draft[] = [];
  for (const q of questions) {
    const rows = msRows.filter((r) => r.base === q.number);
    const msMarks = rows.length && rows.every((r) => r.marks !== null) ? rows.reduce((s, r) => s + (r.marks ?? 0), 0) : null;
    const d: Draft = {
      q,
      n: q.number,
      rows,
      marks: msMarks ?? q.margin_marks ?? 1,
      domain: rows.map((r) => r.domain).find((x): x is string => !!x) ?? null,
      qtype: "self_mark",
      answers: [],
      options: [],
      notes: [],
      confidence: 0.6,
      verified: false,
      disagreement: false,
      computed: null,
      thirdParty: tp.whole || tpQuestions.has(q.number),
    };
    if (!rows.length) {
      d.notes.push("no mark scheme row found for this question");
      if (job.msRows) await ctx.log("warn", "ms_row_missing", `${code} Q${q.number}: no mark scheme row`, { page: q.page });
    } else if (msMarks === null) d.notes.push("marks not readable from the mark scheme");
    if (msMarks === null && q.margin_marks !== null) d.notes.push(`marks taken from the paper margin (${q.margin_marks})`);
    if (msMarks !== null && q.margin_marks !== null && msMarks !== q.margin_marks)
      d.notes.push(`paper margin shows ${q.margin_marks} mark(s) but mark scheme gives ${msMarks}`);

    if (kind === "maths_arithmetic" && rows.length === 1) {
      const row = rows[0];
      const rp = parseRequirement(row.requirement, row.guidance);
      if (rp.primary) {
        d.qtype = "numeric";
        let alternatives = rp.alternatives;
        if (/recurring/i.test(`${row.requirement} ${row.guidance}`)) {
          // A recurring decimal (e.g. 1.083 with a dot over the 3) loses its dot in the PDF text layer, so the
          // printed decimal is a truncation and would wrongly accept an inexact answer: keep only exact decimals.
          const kept = alternatives.filter((a) => a.form !== "decimal" || a.value.eq(rp.primary!.value));
          if (kept.length !== alternatives.length)
            d.notes.push(`recurring-decimal equivalent(s) ${alternatives.filter((a) => !kept.includes(a)).map((a) => a.text).join(", ")} not auto-accepted (recurring dot not readable from the PDF); only exact forms are accepted`);
          alternatives = kept;
        }
        const all = [rp.primary, ...alternatives];
        for (const a of all) d.answers.push({ answer: a.text.replace(/\s+/g, " "), kind: answerKind(a, rp.equivalentFractions, rp.exactDecimal) });
        if (rp.leftover) d.notes.push(`mark scheme requirement has extra wording: "${rp.leftover}"`);
        if (d.marks >= 2) d.notes.push("2-mark question: method marks (partial credit) cannot be auto-awarded; see mark_scheme_entries guidance");
        const comp = computeQuestion(q.text);
        d.computed = comp;
        if (!comp) {
          d.notes.push("question expression could not be parsed; answer not machine-verified");
          d.confidence = 0.8;
        } else {
          const bad = all.filter((a) => !answerAgrees(a, comp));
          if (bad.length) {
            d.disagreement = true;
            d.confidence = 0.5;
            d.notes.push(`ARITHMETIC CHECK: "${comp.expression}" computes to ${comp.value} but the mark scheme lists ${bad.map((b) => b.text).join(", ")} (answer kept as published)`);
            await ctx.log("error", "arithmetic_mismatch", `${code} Q${q.number}: computed ${comp.value} for "${comp.expression}", mark scheme says ${bad.map((b) => b.text).join(", ")}`, {
              paper: code,
              question: q.number,
              expression: comp.expression,
              computed: comp.value.toString(),
              mark_scheme: bad.map((b) => b.text),
            });
          } else {
            d.verified = true;
            d.confidence = 0.95;
          }
        }
      } else {
        d.notes.push("mark scheme requirement not parseable as a single value; raw text kept in mark_scheme_entries");
        await ctx.log("warn", "ms_unparsed", `${code} Q${q.number}: requirement not parseable`, { requirement: row.requirement });
      }
    } else if (kind === "maths_arithmetic" && rows.length > 1) {
      d.notes.push("multi-part arithmetic question; self-marked");
    } else if (kind === "gps_questions" && rows.length === 1) {
      const mcq = detectMcq(q.text, rows[0].requirement);
      if (mcq) {
        d.qtype = "mcq";
        d.options = mcq.options.map((t, k) => ({ label: String.fromCharCode(65 + k), text: t, is_correct: k === mcq.correct ? 1 : 0 }));
        d.confidence = 0.85;
        d.notes.push("tick-one item: options transcribed from the paper, correct option from the mark scheme");
      }
    }
    if (d.qtype === "self_mark") {
      d.notes.push(kind === "gps_spelling" ? "spelling item: needs the spelling task script read aloud; self-marked" : "visual / open response: self-marked against the mark scheme");
      if (d.confidence > 0.6) d.confidence = 0.6;
    }
    if (d.thirdParty) d.notes.push("contains third-party material listed in the copyright report: not covered by OGL");
    drafts.push(d);
  }

  // ---- validation
  const cover = coverFacts(ext.front_text, ext.back_text);
  const total = cover.totalMarks ?? spec.totalMarks;
  const totalSource = cover.totalMarks !== null ? "cover" : "known_total";
  const checks: Check[] = [];
  const msBases = [...new Set(msRows.map((r) => r.base))];
  checks.push({ id: "mark_scheme_present", ok: !!job.msRows && msRows.length > 0 });
  checks.push({
    id: "question_count",
    ok: questions.length > 0 && questions.length === msBases.length,
    detected: questions.length,
    mark_scheme_questions: msBases.length,
    mark_scheme_rows: msRows.length,
    missing_in_scheme: questions.filter((q) => !msBases.includes(q.number)).map((q) => q.number),
    missing_in_paper: msBases.filter((b) => !questions.some((q) => q.number === b)),
  });
  const msSum = msRows.reduce((s, r) => s + (r.marks ?? 0), 0);
  const marginAll = questions.length > 0 && questions.every((q) => q.margin_marks !== null);
  const marginSum = marginAll ? questions.reduce((s, q) => s + (q.margin_marks ?? 0), 0) : null;
  checks.push({
    id: "marks_total",
    ok: msRows.length > 0 && msSum === total && (marginSum === null || marginSum === total),
    expected_total: total,
    total_source: totalSource,
    known_total: spec.totalMarks,
    mark_scheme_sum: msSum,
    margin_sum: marginSum,
    unreadable_mark_rows: msRows.filter((r) => r.marks === null).map((r) => r.number),
  });
  const marginMismatch = drafts.filter((d) => d.q.margin_marks !== null && d.rows.length && d.rows.every((r) => r.marks !== null) && d.marks !== d.q.margin_marks);
  checks.push({ id: "margin_marks_vs_scheme", ok: marginMismatch.length === 0, mismatches: marginMismatch.map((d) => ({ q: d.n, margin: d.q.margin_marks, scheme: d.marks })) });
  if (kind === "maths_arithmetic") {
    checks.push({
      id: "arithmetic_answers_numeric",
      ok: drafts.every((d) => d.qtype === "numeric"),
      non_numeric: drafts.filter((d) => d.qtype !== "numeric").map((d) => d.n),
    });
    checks.push({
      id: "arithmetic_recomputed",
      ok: drafts.every((d) => !d.disagreement),
      verified: drafts.filter((d) => d.verified).length,
      unverified: drafts.filter((d) => d.qtype === "numeric" && !d.verified && !d.disagreement).map((d) => d.n),
      disagreements: drafts
        .filter((d) => d.disagreement)
        .map((d) => ({ q: d.n, expression: d.computed?.expression, computed: d.computed?.value.toString(), mark_scheme: d.answers.map((a) => a.answer) })),
    });
  }
  const passed = checks.every((c) => c.ok);
  for (const c of checks) {
    if (c.ok) continue;
    const level = c.id === "margin_marks_vs_scheme" || c.id === "mark_scheme_present" ? "warn" : "error";
    await ctx.log(level, `validation_${c.id}`, `${code}: validation check ${c.id} failed`, c);
  }
  const validation = {
    status: passed ? "passed" : "failed",
    checked_at: new Date().toISOString(),
    checks,
    time_source: cover.timeMinutes !== null ? "cover" : spec.timeApproximate ? "known_guidance_approximate" : "known_total",
    third_party: { whole_paper: tp.whole, questions: [...tpQuestions], notes: tp.notes },
  };

  // ---- provenance
  const paperProv = (third: boolean): Provenance => ({
    ...ctx.prov(job.entry.url, job.paperPdf.checksum, third, third ? tpAttribution : attribution),
    licence_id: third ? THIRD_PARTY_LICENCE : "OGL-3.0",
  });
  const msProv = (third: boolean): Provenance => ({
    ...ctx.prov(job.msEntry?.url ?? job.entry.url, job.msPdf?.checksum ?? job.paperPdf.checksum, third, attribution),
    licence_id: "OGL-3.0",
  });

  // ---- publish crops (third-party crops stay in the work dir: never committed)
  const publicDir = opts.publicDir ?? path.join(ROOT, "public");
  const webDir = `/question-images/sta/${ks}/${year}/${spec.slug}`;
  const yearGroup = ks === "ks2" ? "y6" : "y2";
  const time = cover.timeMinutes ?? spec.timeMinutes;

  const paperRow: Row = {
    id: paperId,
    key_stage_id: ks,
    subject_id: spec.subjectId,
    year,
    name: `${year} key stage ${ks.slice(2)} ${spec.name}`,
    paper_code: code,
    kind: "official",
    total_marks: total,
    time_allowed_minutes: time,
    question_count: questions.length,
    paper_url: job.entry.url,
    mark_scheme_url: job.msEntry?.url ?? null,
    copyright_report_url: job.crEntry?.url ?? null,
    validation_status: passed ? "passed" : "failed",
    validation_json: JSON.stringify(validation),
    review_status: passed ? "auto_ok" : "needs_review",
    ...paperProv(tp.whole),
    third_party_flag: paperThirdParty ? 1 : 0,
  };

  const qRows: Row[] = [];
  const aRows: Row[] = [];
  const oRows: Row[] = [];
  const msEntries: Row[] = [];
  const assetRows: Row[] = [];
  const linkRows: Row[] = [];
  for (const d of drafts) {
    const qid = `${paperId}:q${d.n}`;
    const crop = { page: d.q.page, x: d.q.bbox[0], y: d.q.bbox[1], w: +(d.q.bbox[2] - d.q.bbox[0]).toFixed(1), h: +(d.q.bbox[3] - d.q.bbox[1]).toFixed(1) };
    const fileName = `q${d.n}.png`;
    let webPath: string | null = null;
    let localPath: string;
    if (!d.thirdParty) {
      const dest = path.join(publicDir, webDir, fileName);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(d.q.crop.path, dest);
      webPath = `${webDir}/${fileName}`;
      localPath = `public${webPath}`;
    } else {
      localPath = path.relative(ROOT, d.q.crop.path);
    }
    ctx.bump("crops");
    const alt = `Question ${d.n} of the ${year} key stage ${ks.slice(2)} ${spec.name} paper`;
    const autoOk = passed && d.qtype !== "self_mark" && !d.thirdParty && (d.qtype !== "numeric" || d.verified) && !d.notes.some((n) => /extra wording|margin shows|not readable/.test(n));
    const reviewStatus = autoOk ? "auto_ok" : "needs_review";
    if (!passed && d.qtype !== "self_mark") d.notes.push(`paper validation failed (${checks.filter((c) => !c.ok).map((c) => c.id).join(", ")})`);
    const qProv = d.thirdParty ? paperProv(true) : paperProv(false);
    const promptText = d.q.text.trim() || `Question ${d.n} (see image)`;
    qRows.push({
      id: qid,
      paper_id: paperId,
      lesson_id: null,
      quiz_kind: "paper",
      qtype: d.qtype,
      number: d.n,
      sort: Number(d.n),
      marks: d.marks,
      time_hint_seconds: total > 0 ? Math.round((time * 60 * d.marks) / total) : null,
      prompt_text: promptText,
      prompt_images_json: webPath ? JSON.stringify([{ path: webPath, alt, crop }]) : null,
      prompt_extra_json: JSON.stringify({
        transcribed_lines: d.q.lines,
        page: d.q.page,
        crop,
        ...(d.computed ? { expression: d.computed.expression, computed_value: d.computed.value.toString() } : {}),
        ...(d.thirdParty ? { third_party_image: localPath } : {}),
      }),
      explanation: null,
      subject_id: spec.subjectId,
      key_stage_id: ks,
      year_group_id: yearGroup,
      difficulty_id: null,
      content_domain_ref: d.domain,
      extraction_confidence: d.confidence,
      review_status: reviewStatus,
      review_notes: d.notes.length ? d.notes.join(" | ") : null,
      reviewed_at: null,
      ...qProv,
    });
    d.answers.forEach((a, k) =>
      aRows.push({ id: `${qid}:a${k}`, question_id: qid, part: "main", answer: a.answer, kind: a.kind, tolerance: null, case_sensitive: 0, marks: null }),
    );
    d.options.forEach((o, k) => oRows.push({ id: `${qid}:o${k}`, question_id: qid, label: o.label, text: o.text, image_path: null, is_correct: o.is_correct, sort: k }));
    d.rows.forEach((r, k) =>
      msEntries.push({
        id: `${qid}:ms${k}`,
        question_id: qid,
        paper_id: paperId,
        number: r.number,
        marks: r.marks,
        answer_text: r.requirement || r.raw || "(blank)",
        guidance: [r.guidance, d.marks >= 2 && kind === "maths_arithmetic" ? "Method marks: award per the guidance above (not auto-awarded)." : ""].filter(Boolean).join("\n") || null,
        content_domain_ref: r.domain,
        sort: Number(d.n) * 10 + k,
        ...msProv(d.thirdParty),
      }),
    );
    assetRows.push({
      id: `${qid}:crop`,
      lesson_id: null,
      question_id: qid,
      paper_id: paperId,
      kind: "page_crop",
      title: `Question ${d.n}`,
      url: webPath,
      local_path: localPath,
      mime: "image/png",
      ...qProv,
    });
    // curriculum links
    if (d.domain) {
      const links =
        subject === "maths" ? await linker.maths(d.domain, d.q.text) : await linker.english(d.domain, ks, subject, d.q.text);
      if (!links.length) await ctx.log("warn", "domain_unmapped", `${code} Q${d.n}: content domain ${d.domain} matched no NC statements`, { domain: d.domain });
      for (const l of links)
        linkRows.push({ question_id: qid, statement_id: l.statement_id, method: "sta_content_domain", confidence: l.confidence, review_status: "needs_review" });
    }
  }
  // unmatched mark scheme rows are kept (paper-level) so nothing from the mark scheme is lost
  const matched = new Set(drafts.flatMap((d) => d.rows));
  msRows.filter((r) => !matched.has(r)).forEach((r, k) =>
    msEntries.push({
      id: `${paperId}:ms-unmatched-${k}`,
      question_id: null,
      paper_id: paperId,
      number: r.number,
      marks: r.marks,
      answer_text: r.requirement || r.raw || "(blank)",
      guidance: r.guidance || null,
      content_domain_ref: r.domain,
      sort: 100000 + k,
      ...msProv(tp.whole),
    }),
  );
  for (const b of job.readingBooklets)
    assetRows.push({
      id: `${paperId}:booklet:${shortHash(b.url).slice(0, 8)}`,
      lesson_id: null,
      question_id: null,
      paper_id: paperId,
      kind: "pdf",
      title: b.title,
      url: b.url,
      local_path: null,
      mime: "application/pdf",
      ...ctx.prov(b.url, null, true, tpAttribution),
      licence_id: THIRD_PARTY_LICENCE,
    });

  // ---- write (sweep previous rows of this paper first: idempotent)
  await store.transaction(async () => {
    const old = (await store.select<{ id: string }>("questions", { where: { paper_id: paperId }, columns: ["id"] })).map((r) => r.id);
    if (old.length) {
      for (const t of ["question_statement_links", "accepted_answers", "question_options", "question_tags"]) await store.delete(t, { question_id: old });
    }
    await store.delete("mark_scheme_entries", { paper_id: paperId });
    await store.delete("assets", { paper_id: paperId });
    await store.delete("questions", { paper_id: paperId });
    await store.upsert("papers", paperRow, ["id"]);
    await store.insert("questions", qRows);
    await store.insert("accepted_answers", aRows);
    await store.insert("question_options", oRows);
    await store.insert("mark_scheme_entries", msEntries);
    await store.insert("assets", assetRows);
    await store.upsert("question_statement_links", linkRows, ["question_id", "statement_id"]);
  });
  ctx.bump("papers");
  ctx.bump("questions", qRows.length);
  ctx.bump("accepted_answers", aRows.length);
  ctx.bump("statement_links", linkRows.length);
  ctx.bump(passed ? "papers_passed" : "papers_failed_validation");
  if (paperThirdParty) ctx.bump("papers_third_party");
  await ctx.log("info", "paper", `${code}: ${qRows.length} questions, validation ${passed ? "passed" : "failed"}`, {
    checksum: sha256(`${job.paperPdf.checksum}${job.msPdf?.checksum ?? ""}`).slice(0, 16),
  });
}
