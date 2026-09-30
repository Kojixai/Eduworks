/**
 * Source: National curriculum in England programmes of study (gov.uk, OGL v3.0), KS1-4, all subjects.
 *
 * Discovery: the collection /government/collections/national-curriculum links one publication per
 * subject ("National curriculum in England: <subject> programmes of study"). Each publication carries
 * an HTML attachment (govspeak body via the Content API) covering KS1-3, and PDF attachments per key
 * stage ("<Subject> programmes of study: key stage 4"). HTML is parsed first; a PDF is parsed only for
 * key stages the HTML did not cover. Known publication paths are used when the collection does not
 * list a subject.
 *
 * Output: curriculum_statements rows with framework 'nc2014_govuk' (authoritative), then a cross-check
 * that annotates the Oak-ontology rows (framework 'nc2014') with "verified against gov.uk ..." or
 * "NOT FOUND on gov.uk — review". Nothing is deleted from nc2014.
 *
 * Reference scheme (column `ref`; row id is "ncg:" + ref):
 *   <SUBJ>.<CTX>.<STRAND>.<n>[.<m>...]
 *     SUBJ   two-letter subject code: AD CI CO DT EN GE HI LA MA MU PE SC
 *     CTX    Y3 (one year), Y3-4 (year band), KS2 (whole key stage)
 *     STRAND initials of each heading in the strand path, joined by "-". For "X – y" headings only the
 *            part after the dash is used ("Number – number and place value" -> NPV). Initials skip
 *            and/of/the/in/to/for/a/an/with/including/on/by/from. A clash inside the same SUBJ.CTX gets
 *            a numeric suffix in document order (PD, PD2). Omitted when a list sits directly under
 *            the key-stage heading (e.g. HI.KS2.3).
 *     n      1-based position of the statutory bullet within that strand section; sub-bullets add .m
 *   Strand rows:     <SUBJ>.<CTX>.<STRAND>
 *   Guidance rows:   <SUBJ>.<CTX>.<STRAND>.G<n>   (level 'guidance', statutory 0)
 *   Aims:            <SUBJ>.AIM.<n>              (level 'aim', key stage NULL)
 *   A heading spanning two key stages ("Spoken language – years 1 to 6") is emitted once per key
 *   stage (EN.Y1-2.SL.1 and EN.Y3-6.SL.1).
 */
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext, chunk } from "../core/context";
import type { GovukAttachment } from "../core/govuk";
import { SOURCES } from "./registry";
import {
  type Block,
  type Fetcher,
  type GovukIngestOptions,
  absAttachments,
  basePathOf,
  collectionDocs,
  defaultFetcher,
  ensurePath,
  failRun,
  handleBlocked,
  htmlToBlocks,
  isHtmlAttachment,
  isPdf,
  normText,
  pageUrl,
  pdfToBlocks,
  similarity,
  tryContent,
} from "./govuk_common";

const SRC = SOURCES.find((s) => s.id === "nc_govuk")!;
export const NC_FRAMEWORK = "nc2014_govuk";
export const NC_COLLECTION = "/government/collections/national-curriculum";
const PUB = (slug: string) => `/government/publications/national-curriculum-in-england-${slug}`;

export interface NcSubject {
  id: string;
  code: string;
  title: RegExp;
  fallbackPath: string;
}

export const NC_SUBJECTS: NcSubject[] = [
  { id: "art-and-design", code: "AD", title: /\bart and design\b/i, fallbackPath: PUB("art-and-design-programmes-of-study") },
  { id: "citizenship", code: "CI", title: /\bcitizenship\b/i, fallbackPath: PUB("citizenship-programmes-of-study") },
  { id: "computing", code: "CO", title: /\bcomputing\b/i, fallbackPath: PUB("computing-programmes-of-study") },
  { id: "design-and-technology", code: "DT", title: /\bdesign and technology\b/i, fallbackPath: PUB("design-and-technology-programmes-of-study") },
  { id: "english", code: "EN", title: /\benglish\b/i, fallbackPath: PUB("english-programmes-of-study") },
  { id: "geography", code: "GE", title: /\bgeography\b/i, fallbackPath: PUB("geography-programmes-of-study") },
  { id: "history", code: "HI", title: /\bhistory\b/i, fallbackPath: PUB("history-programmes-of-study") },
  // gov.uk's own slug for languages is misspelt ("progammes"); the collection link is preferred.
  { id: "languages", code: "LA", title: /\b(foreign )?languages?\b/i, fallbackPath: PUB("languages-progammes-of-study") },
  { id: "mathematics", code: "MA", title: /\bmathematics\b/i, fallbackPath: PUB("mathematics-programmes-of-study") },
  { id: "music", code: "MU", title: /\bmusic\b/i, fallbackPath: PUB("music-programmes-of-study") },
  { id: "physical-education", code: "PE", title: /\bphysical education\b/i, fallbackPath: PUB("physical-education-programmes-of-study") },
  { id: "science", code: "SC", title: /\bscience\b/i, fallbackPath: PUB("science-programmes-of-study") },
];

// ---------------------------------------------------------------- parsing

export interface NcContext {
  ks: string;
  years: string[];
  code: string;
}

const KS_YEARS: Record<string, number[]> = { ks1: [1, 2], ks2: [3, 4, 5, 6], ks3: [7, 8, 9], ks4: [10, 11] };
const ksOfYear = (n: number) => (n <= 2 ? "ks1" : n <= 6 ? "ks2" : n <= 9 ? "ks3" : "ks4");
const dashes = (s: string) => s.replace(/\s*[–—-]\s+|\s+[–—-]\s*/g, " – ");

/** Split a list of year numbers into one context per key stage. */
function contextsFor(years: number[], wholeKs: boolean): NcContext[] {
  const byKs = new Map<string, number[]>();
  for (const y of years) byKs.set(ksOfYear(y), [...(byKs.get(ksOfYear(y)) ?? []), y]);
  return [...byKs].map(([ks, ys]) => {
    ys.sort((a, b) => a - b);
    const full = KS_YEARS[ks].every((y) => ys.includes(y));
    const code = wholeKs && full ? ks.toUpperCase() : ys.length === 1 ? `Y${ys[0]}` : `Y${ys[0]}-${ys[ys.length - 1]}`;
    return { ks, years: ys.map((y) => `y${y}`), code };
  });
}

/** Recognise key-stage / year headings. Returns null for ordinary headings. */
export function parseContextHeading(text: string): { ctx: NcContext[]; lead?: string } | null {
  const t = dashes(text).trim();
  const isCtx =
    /^(lower |upper )?key stages? \d/i.test(t) ||
    /programmes? of study/i.test(t) ||
    /^years? \d/i.test(t) ||
    /– (lower |upper )?(years? \d|key stages? \d)/i.test(t);
  if (!isCtx) return null;
  let years: number[] = [];
  const ym = t.match(/\byears?\s+(\d{1,2})(?:\s*(?:,|and|to|–|-|&)\s*(\d{1,2}))?/i);
  if (ym) {
    const a = Number(ym[1]);
    const b = ym[2] ? Number(ym[2]) : a;
    for (let y = Math.min(a, b); y <= Math.max(a, b); y++) years.push(y);
  }
  let wholeKs = false;
  if (!years.length) {
    if (/lower key stage 2/i.test(t)) years = [3, 4];
    else if (/upper key stage 2/i.test(t)) years = [5, 6];
    else {
      const km = t.match(/key stages?\s+(\d)(?:\s*(?:and|to|–|-|&)\s*(\d))?/i);
      if (!km) return null;
      const a = Number(km[1]);
      const b = km[2] ? Number(km[2]) : a;
      for (let k = a; k <= b; k++) years.push(...(KS_YEARS[`ks${k}`] ?? []));
      wholeKs = true;
    }
  } else if (/^key stages? \d/i.test(t) && !/programme of study/i.test(t)) wholeKs = true;
  else if (/^key stage \d programme of study/i.test(t)) wholeKs = true;
  years = years.filter((y) => y >= 1 && y <= 11);
  if (!years.length) return null;
  const leadPart = t.split(" – ")[0];
  const lead = t.includes(" – ") && !/key stage|year|programme/i.test(leadPart) ? leadPart.trim() : undefined;
  return { ctx: contextsFor(years, wholeKs), lead };
}

const STOP = new Set(["and", "of", "the", "in", "to", "for", "a", "an", "with", "including", "on", "by", "from", "their", "its"]);
export function strandInitials(heading: string): string {
  const t = dashes(heading);
  const part = t.includes(" – ") ? t.split(" – ").slice(1).join(" ") : t;
  const words = normText(part).split(" ").filter((w) => w && !STOP.has(w));
  const code = words.map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase())).join("");
  return (code || "X").slice(0, 8);
}

type Frame =
  | { level: number; type: "ctx"; ctx: NcContext[]; lead?: string }
  | { level: number; type: "strand"; text: string }
  | { level: number; type: "mode"; mode: "statutory" | "guidance" }
  | { level: number; type: "aims" }
  | { level: number; type: "skip" }
  | { level: number; type: "transparent" };

export interface ParsedNcRow {
  id: string;
  subject_id: string;
  key_stage_id: string | null;
  year_group_id: string | null;
  year_groups_json: string | null;
  level: "strand" | "statement" | "sub_statement" | "guidance" | "aim";
  strand: string | null;
  sub_strand: string | null;
  parent_id: string | null;
  ref: string;
  text: string;
  statutory: 0 | 1;
  framework: string;
  sort: number;
  notes: string | null;
}

const SKIP_HEADINGS = /^(purpose of study|attainment targets?|contents|introduction|information and communication technology|school curriculum|language and literacy|numeracy and mathematics|glossary|further information)\b/i;

/**
 * Parse one programme-of-study document (HTML or PDF blocks) into rows.
 * `defaultCtx` is used for documents without any key-stage heading (single-KS PDFs).
 */
export function parseProgrammeOfStudy(
  blocks: Block[],
  subject: Pick<NcSubject, "id" | "code">,
  opts: { defaultCtx?: NcContext[]; sortStart?: number; notes?: string } = {},
): ParsedNcRow[] {
  const rows: ParsedNcRow[] = [];
  const ids = new Set<string>();
  const frames: Frame[] = opts.defaultCtx ? [{ level: 0, type: "ctx", ctx: opts.defaultCtx }] : [];
  let sort = opts.sortStart ?? 0;
  let transientGuidance = false;
  const strandCodes = new Map<string, Map<string, string>>(); // SUBJ.CTX -> path -> code
  const counters = new Map<string, number>();
  const next = (k: string) => {
    const n = (counters.get(k) ?? 0) + 1;
    counters.set(k, n);
    return n;
  };
  let aimN = 0;

  const ctxFrame = () => [...frames].reverse().find((f) => f.type === "ctx") as Extract<Frame, { type: "ctx" }> | undefined;
  const nearest = () => [...frames].reverse().find((f) => f.type !== "mode" && f.type !== "transparent");
  const mode = () => {
    const m = [...frames].reverse().find((f) => f.type === "mode") as Extract<Frame, { type: "mode" }> | undefined;
    return transientGuidance ? "guidance" : (m?.mode ?? "statutory");
  };
  const strandPath = (): string[] => {
    const cf = ctxFrame();
    const idx = cf ? frames.indexOf(cf) : -1;
    const path = cf?.lead ? [cf.lead] : [];
    frames.slice(idx + 1).forEach((f) => f.type === "strand" && path.push(f.text));
    return path;
  };
  const subjectFor = (path: string[]) =>
    subject.id === "design-and-technology" && path.some((p) => /cooking and nutrition/i.test(p)) ? "cooking-and-nutrition" : subject.id;

  const push = (r: Omit<ParsedNcRow, "framework" | "sort" | "notes">) => {
    let id = r.id;
    for (let i = 2; ids.has(id); i++) id = `${r.id}~${i}`;
    ids.add(id);
    rows.push({ ...r, id, framework: NC_FRAMEWORK, sort: sort++, notes: opts.notes ?? null });
    return id;
  };

  /** Ensure strand rows for the path under a context; returns { ref prefix, parent id }. */
  const ensureStrand = (c: NcContext, path: string[]) => {
    const base = `${subject.code}.${c.code}`;
    if (!path.length) return { ref: base, parent: null as string | null };
    const codes = strandCodes.get(base) ?? new Map<string, string>();
    strandCodes.set(base, codes);
    let parent: string | null = null;
    let ref = base;
    for (let i = 0; i < path.length; i++) {
      const key = path.slice(0, i + 1).join(" > ");
      let code = codes.get(key);
      if (!code) {
        const stem = [...(i ? [codes.get(path.slice(0, i).join(" > "))!] : []), strandInitials(path[i])].join("-");
        code = stem;
        const used = new Set(codes.values());
        for (let n = 2; used.has(code); n++) code = `${stem}${n}`;
        codes.set(key, code);
      }
      ref = `${base}.${code}`;
      const id = `ncg:${ref}`;
      if (!ids.has(id)) {
        push({
          id,
          subject_id: subjectFor(path),
          key_stage_id: c.ks,
          year_group_id: c.years.length === 1 ? c.years[0] : null,
          year_groups_json: JSON.stringify(c.years),
          level: "strand",
          strand: dashes(path[0]),
          sub_strand: i ? path.slice(1, i + 1).map(dashes).join(" > ") : null,
          parent_id: parent,
          ref,
          text: dashes(path[i]),
          statutory: 1,
        });
      }
      parent = id;
    }
    return { ref, parent };
  };

  const rowBase = (c: NcContext, path: string[]) => ({
    subject_id: subjectFor(path),
    key_stage_id: c.ks,
    year_group_id: c.years.length === 1 ? c.years[0] : null,
    year_groups_json: JSON.stringify(c.years),
    strand: path.length ? dashes(path[0]) : null,
    sub_strand: path.length > 1 ? path.slice(1).map(dashes).join(" > ") : null,
  });

  const emitStatement = (li: Extract<Block, { kind: "li" }>) => {
    const cf = ctxFrame()!;
    const path = strandPath();
    for (const c of cf.ctx) {
      const s = ensureStrand(c, path);
      const n = next(`${s.ref}#st`);
      const walk = (item: Extract<Block, { kind: "li" }>, ref: string, parent: string | null, level: "statement" | "sub_statement") => {
        const id = push({ id: `ncg:${ref}`, ...rowBase(c, path), level, parent_id: parent, ref, text: item.text, statutory: 1 });
        let m = 0;
        for (const ch of item.children) {
          if (ch.kind === "li") walk(ch, `${ref}.${++m}`, id, "sub_statement");
          else if (ch.kind === "p" && ch.text) walk({ kind: "li", text: ch.text, children: [] }, `${ref}.${++m}`, id, "sub_statement");
        }
      };
      walk(li, `${s.ref}.${n}`, s.parent, "statement");
    }
  };

  const emitGuidance = (text: string) => {
    const cf = ctxFrame()!;
    const path = strandPath();
    for (const c of cf.ctx) {
      const s = ensureStrand(c, path);
      const ref = `${s.ref}.G${next(`${s.ref}#g`)}`;
      push({ id: `ncg:${ref}`, ...rowBase(c, path), level: "guidance", parent_id: s.parent, ref, text, statutory: 0 });
    }
  };

  const flattenLi = (li: Extract<Block, { kind: "li" }>): string[] => [
    li.text,
    ...li.children.flatMap((c) => (c.kind === "li" ? flattenLi(c) : c.kind === "p" ? [c.text] : [])),
  ];

  for (const b of blocks) {
    if (b.kind === "h") {
      while (frames.length && frames[frames.length - 1].level >= b.level) frames.pop();
      transientGuidance = false;
      const t = b.text.trim();
      if (/non-?statutory|notes and guidance/i.test(t)) frames.push({ level: b.level, type: "mode", mode: "guidance" });
      else if (/^statutory requirements?\b/i.test(t)) frames.push({ level: b.level, type: "mode", mode: "statutory" });
      else if (/^(subject )?aims?$/i.test(t)) frames.push({ level: b.level, type: "aims" });
      else if (/^subject content$/i.test(t)) frames.push({ level: b.level, type: "transparent" });
      else {
        const pc = parseContextHeading(t);
        if (pc) frames.push({ level: b.level, type: "ctx", ctx: pc.ctx, lead: pc.lead });
        else if (!ctxFrame() || SKIP_HEADINGS.test(t)) frames.push({ level: b.level, type: "skip" });
        else frames.push({ level: b.level, type: "strand", text: t });
      }
      continue;
    }
    const near = nearest();
    if (b.kind === "p") {
      if (/pupils should (be taught|develop|learn)/i.test(b.text)) {
        transientGuidance = false;
        continue;
      }
      if (b.text.length < 90 && /non-?statutory/i.test(b.text)) {
        transientGuidance = true;
        continue;
      }
      if (near && near.type !== "skip" && near.type !== "aims" && ctxFrame() && mode() === "guidance") emitGuidance(b.text);
      continue;
    }
    // list item
    if (near?.type === "aims") {
      for (const t of flattenLi(b)) {
        const ref = `${subject.code}.AIM.${++aimN}`;
        push({ id: `ncg:${ref}`, subject_id: subject.id, key_stage_id: null, year_group_id: null, year_groups_json: null, level: "aim", strand: null, sub_strand: null, parent_id: null, ref, text: t, statutory: 1 });
      }
      continue;
    }
    if (!near || near.type === "skip" || !ctxFrame()) continue;
    if (mode() === "guidance") flattenLi(b).forEach(emitGuidance);
    else emitStatement(b);
  }
  return rows;
}

/** Key stages named in an attachment title ("... key stages 1 and 2", "... key stage 4"). */
export function keyStagesInTitle(title: string): string[] {
  const m = title.match(/key stages?\s+(\d)(?:\s*(?:,|and|to|-|–)\s*(\d))?(?:\s*(?:,|and)\s*(\d))?/i);
  if (!m) return [];
  const nums = [m[1], m[2], m[3]].filter(Boolean).map(Number);
  if (m[2] && /to/.test(m[0])) for (let k = nums[0] + 1; k < nums[1]; k++) nums.push(k);
  return [...new Set(nums)].sort().map((n) => `ks${n}`);
}

// ---------------------------------------------------------------- ingest

export async function ingestNcGovuk(store: DataStore, opts: GovukIngestOptions = {}) {
  const ctx = new IngestContext(store, SRC.id, SRC.licence_id, SRC.attribution_text);
  await ctx.start();
  const fetcher: Fetcher = opts.fetcher ?? defaultFetcher(ctx);
  const force = opts.force || !!process.env.EDU_FORCE;
  try {
    const coll = await tryContent(ctx, fetcher, NC_COLLECTION);
    const docs = coll ? collectionDocs(coll.content) : [];
    let partial = false;
    for (const subj of NC_SUBJECTS) {
      const key = `subject:${subj.id}`;
      if (ctx.isDone(key) && !force) {
        await ctx.log("info", "skip", `${subj.id} already ingested (${ctx.getCheckpoint(key)})`);
        continue;
      }
      const link = docs.find((d) => /programm?e?s? of study|progammes of study/i.test(d.title) && subj.title.test(d.title.replace(/national curriculum in england:?/i, "")));
      const pubPath = link?.base_path ?? subj.fallbackPath;
      if (!link) await ctx.log("warn", "collection_link_missing", `No collection link for ${subj.id}; using ${pubPath}`);
      const pub = await tryContent(ctx, fetcher, pubPath);
      if (!pub) {
        partial = true;
        continue;
      }
      const rows: ParsedNcRow[] = [];
      const provByRow = new Map<string, { url: string; checksum: string }>();
      const checksums: string[] = [];
      const add = (parsed: ParsedNcRow[], url: string, checksum: string) => {
        for (const r of parsed) {
          if (provByRow.has(r.id)) continue; // HTML wins over PDF, first document wins
          provByRow.set(r.id, { url, checksum });
          rows.push(r);
        }
      };

      // HTML: the publication's own body (html_publication) and its HTML attachments / children
      const htmlPaths = new Set<string>();
      if (pub.content.details.body && /<h[2-6]/i.test(pub.content.details.body)) {
        add(parseProgrammeOfStudy(htmlToBlocks(pub.content.details.body), subj, { sortStart: rows.length }), pub.url, pub.checksum);
        checksums.push(pub.checksum);
        htmlPaths.add(pub.content.base_path);
      }
      const atts = absAttachments(pub.content);
      const htmlTargets = [
        ...atts.filter(isHtmlAttachment).map((a) => basePathOf(a.url)),
        ...(pub.content.links.children ?? []).filter((l) => l.document_type === "html_publication").map((l) => l.base_path),
      ];
      for (const p of htmlTargets) {
        if (htmlPaths.has(p)) continue;
        htmlPaths.add(p);
        const h = await tryContent(ctx, fetcher, p);
        if (!h?.content.details.body) continue;
        add(parseProgrammeOfStudy(htmlToBlocks(h.content.details.body), subj, { sortStart: rows.length }), h.url, h.checksum);
        checksums.push(h.checksum);
      }
      const covered = new Set(rows.filter((r) => r.level !== "aim").map((r) => r.key_stage_id));

      // PDFs for key stages the HTML did not cover (e.g. KS4 maths/English/science)
      for (const a of atts.filter(isPdf)) {
        const kss = keyStagesInTitle(a.title);
        if (!kss.length || kss.every((k) => covered.has(k))) continue;
        const r = await fetchPdf(ctx, fetcher, a);
        if (!r) {
          partial = true;
          continue;
        }
        const blocks = pdfToBlocks(r.path);
        const hasCtx = blocks.some((b) => b.kind === "h" && parseContextHeading(b.text));
        const defaultCtx = !hasCtx && kss.length === 1 ? contextsFor(KS_YEARS[kss[0]], true) : undefined;
        const parsed = parseProgrammeOfStudy(blocks, subj, { defaultCtx, sortStart: rows.length, notes: `Extracted from PDF "${a.title}"; check layout-dependent hierarchy.` });
        add(parsed.filter((p) => p.level === "aim" || !covered.has(p.key_stage_id)), a.url, r.checksum);
        checksums.push(r.checksum);
        await ctx.log("info", "pdf_parsed", `${subj.id}: ${parsed.length} rows from ${a.title}`);
      }

      if (!rows.some((r) => r.level === "statement")) {
        await ctx.log("warn", "no_statements", `No statutory statements parsed for ${subj.id}`, { pubPath });
        partial = true;
        continue;
      }
      const dbRows: Row[] = rows.map((r) => {
        const p = provByRow.get(r.id)!;
        return { ...r, ...ctx.prov(p.url, p.checksum) };
      });
      await store.transaction(async () => {
        await store.delete("curriculum_statements", { framework: NC_FRAMEWORK, ref: { op: "like", value: `${subj.code}.%` } });
        for (const part of chunk(dbRows, 500)) await store.upsert("curriculum_statements", part, ["id"]);
      });
      ctx.bump("curriculum_statements", dbRows.length);
      ctx.bump(`statements_${subj.id}`, rows.filter((r) => r.level === "statement" || r.level === "sub_statement").length);
      await ctx.markDone(key, checksums.join(",").slice(0, 400));
    }

    const cc = await crossCheckOntology(store, ctx);
    ctx.bump("crosscheck_verified", cc.verified);
    ctx.bump("crosscheck_not_found", cc.notFound);
    await ctx.finish(partial ? "partial" : "ok");
    return ctx.getStats();
  } catch (e) {
    if (await handleBlocked(ctx, e)) return ctx.getStats();
    await failRun(ctx, e);
    throw e;
  }
}

async function fetchPdf(ctx: IngestContext, fetcher: Fetcher, a: GovukAttachment) {
  try {
    const f = await fetcher(a.url);
    return { path: ensurePath(f, a.url), checksum: f.checksum };
  } catch (e) {
    if ((e as Error).name === "BlockedHostError") throw e;
    await ctx.log("warn", "fetch_failed", `Could not fetch ${a.url}: ${(e as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------- cross-check

const CC_PATTERNS = [/^verified against gov\.uk/i, /^NOT FOUND on gov\.uk/i, /^found only in non-statutory/i];
export const CC_THRESHOLD = 0.8;

function mergeNotes(existing: string | null, result: string): string {
  const kept = (existing ?? "")
    .replace(/;?\s*to be cross-checked against gov\.uk[^|]*/i, "")
    .split(" | ")
    .map((s) => s.trim())
    .filter((s) => s && !CC_PATTERNS.some((re) => re.test(s)));
  return [...kept, result].join(" | ");
}

interface GovRow {
  id: string;
  subject_id: string;
  key_stage_id: string | null;
  level: string;
  ref: string;
  text: string;
  parent_id: string | null;
  source_url: string | null;
}

/**
 * For each Oak-ontology statement / sub-statement / aim (framework nc2014), find the gov.uk statement
 * with the most similar normalised text (same subject + key stage) and record the outcome in notes.
 * Only subject/key-stage pairs that have gov.uk rows are checked.
 */
export async function crossCheckOntology(store: DataStore, ctx?: IngestContext) {
  const date = new Date().toISOString().slice(0, 10);
  const gov = await store.select<GovRow>("curriculum_statements", {
    where: { framework: NC_FRAMEWORK, level: ["statement", "sub_statement", "aim", "guidance"] },
    columns: ["id", "subject_id", "key_stage_id", "level", "ref", "text", "parent_id", "source_url"],
  });
  const groupKey = (s: string, ks: string | null) => `${s}|${ks ?? "-"}`;
  const groups = new Map<string, Array<GovRow & { combined?: string }>>();
  const childrenText = new Map<string, string[]>();
  for (const g of gov) if (g.parent_id) childrenText.set(g.parent_id, [...(childrenText.get(g.parent_id) ?? []), g.text]);
  for (const g of gov) {
    const k = groupKey(g.subject_id, g.level === "aim" ? null : g.key_stage_id);
    const kids = childrenText.get(g.id);
    groups.set(k, [...(groups.get(k) ?? []), { ...g, combined: kids ? `${g.text} ${kids.join(" ")}` : undefined }]);
  }
  const onto = await store.select<{ id: string; subject_id: string; key_stage_id: string | null; level: string; text: string; notes: string | null }>(
    "curriculum_statements",
    { where: { framework: "nc2014", level: ["statement", "sub_statement", "aim"] }, columns: ["id", "subject_id", "key_stage_id", "level", "text", "notes"] },
  );
  let verified = 0;
  let notFound = 0;
  let skipped = 0;
  const updates: Array<{ id: string; notes: string }> = [];
  for (const o of onto) {
    const cands = groups.get(groupKey(o.subject_id, o.level === "aim" ? null : o.key_stage_id));
    if (!cands?.length) {
      skipped++;
      continue;
    }
    const nTok = normText(o.text).split(" ").length;
    const score = (text: string) => {
      const s = similarity(o.text, text);
      return Math.max(s.dice, nTok >= 4 && s.containA >= 0.9 ? s.containA * 0.95 : 0, normText(o.text) === normText(text) ? 1 : 0);
    };
    let best: { row: GovRow; score: number } | null = null;
    let bestGuid: { row: GovRow; score: number } | null = null;
    for (const c of cands) {
      const sc = Math.max(score(c.text), c.combined ? score(c.combined) * 0.98 : 0);
      if (c.level === "guidance") {
        if (!bestGuid || sc > bestGuid.score) bestGuid = { row: c, score: sc };
      } else if (!best || sc > best.score) best = { row: c, score: sc };
    }
    let result: string;
    if (best && best.score >= CC_THRESHOLD) {
      result = `verified against gov.uk ${best.row.source_url} on ${date} (${best.row.ref}, similarity ${best.score.toFixed(2)})`;
      verified++;
    } else if (bestGuid && bestGuid.score >= CC_THRESHOLD) {
      result = `found only in non-statutory guidance on gov.uk ${bestGuid.row.source_url} on ${date} (${bestGuid.row.ref}) — review`;
      notFound++;
    } else {
      result = `NOT FOUND on gov.uk — review (checked ${date}${best ? `; closest ${best.row.ref} similarity ${best.score.toFixed(2)}` : ""})`;
      notFound++;
    }
    const notes = mergeNotes(o.notes, result);
    if (notes !== o.notes) updates.push({ id: o.id, notes });
  }
  await store.transaction(async () => {
    for (const u of updates) await store.update("curriculum_statements", { id: u.id }, { notes: u.notes });
  });
  if (ctx)
    await ctx.log(notFound ? "warn" : "info", "crosscheck", `Oak ontology cross-check: ${verified} verified, ${notFound} not found, ${skipped} without gov.uk rows`, {
      verified,
      notFound,
      skipped,
    });
  return { verified, notFound, skipped };
}

export { pageUrl };
