/**
 * Source: DfE GCSE subject content (KS4) and GCE AS and A level subject content (KS5), gov.uk, OGL v3.0.
 *
 * Discovery: the two collections list one publication per subject ("GCSE mathematics",
 * "GCE AS and A level biology, chemistry, physics and psychology", ...). Each publication has a
 * PDF (sometimes also HTML) attachment with the subject content. Subjects are matched on the
 * publication title; documents covering several subjects are split on subject headings.
 *
 * Output: curriculum_statements taxonomy rows only (no questions):
 *   framework 'gcse_content' (key_stage ks4, years 10-11) or 'alevel_content' (ks5, years 12-13)
 *   level 'content_area' for headings, 'statement' for paragraphs and bullets
 *   ref = the document's own numbering ("3", "3.1", "(a)", "AO1", "A2") where present, else NULL
 *   id  = <framework>:<subject>:<publication slug>:<n>, n = position in the document (stable per version)
 * KS5 rows carry the KS5 content policy in notes.
 */
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext, chunk } from "../core/context";
import type { GovukAttachment, GovukLink } from "../core/govuk";
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
  pdfToBlocks,
  tryContent,
} from "./govuk_common";

const SRC = SOURCES.find((s) => s.id === "dfe_subject_content")!;
export const KS5_NOTE = "KS5 is structure only: all KS5 questions and explanations must be original.";

export const DFE_COLLECTIONS = [
  { framework: "gcse_content", ks: "ks4", years: ["y10", "y11"], path: "/government/collections/gcse-subject-content" },
  { framework: "alevel_content", ks: "ks5", years: ["y12", "y13"], path: "/government/collections/gce-as-and-a-level-subject-content" },
] as const;

/** Title keyword -> platform subject id. Order matters (specific before general). */
export const DFE_SUBJECT_MAP: Array<[RegExp, string, string]> = [
  [/combined science/i, "science", "combined science"],
  [/\bbiology\b/i, "biology", "biology"],
  [/\bchemistry\b/i, "chemistry", "chemistry"],
  [/\bphysics\b/i, "physics", "physics"],
  [/further mathematics/i, "mathematics", "further mathematics"],
  [/\bmathematics\b|\bmaths\b/i, "mathematics", "mathematics"],
  [/english language/i, "english", "english language"],
  [/english literature/i, "english", "english literature"],
  [/computer science|\bcomputing\b/i, "computing", "computer science"],
  [/\bgeography\b/i, "geography", "geography"],
  [/(?<!ancient |art )\bhistory\b/i, "history", "history"],
  [/\bfrench\b/i, "french", "french"],
  [/\bgerman\b/i, "german", "german"],
  [/\bspanish\b/i, "spanish", "spanish"],
  [/modern (foreign )?languages/i, "languages", "modern foreign languages"],
  [/art and design/i, "art-and-design", "art and design"],
  [/design and technology/i, "design-and-technology", "design and technology"],
  [/food preparation and nutrition/i, "cooking-and-nutrition", "food preparation and nutrition"],
  [/\bmusic\b/i, "music", "music"],
  [/physical education/i, "physical-education", "physical education"],
  [/citizenship/i, "citizenship", "citizenship"],
  [/religious studies/i, "religious-education", "religious studies"],
];

export function subjectsInTitle(title: string): Array<{ id: string; name: string }> {
  const t = title.replace(/^(gcse|gce as and a level|as and a level|a level)\s*:?\s*/i, "");
  const out: Array<{ id: string; name: string }> = [];
  let rest = t;
  for (const [re, id, name] of DFE_SUBJECT_MAP) {
    if (re.test(rest)) {
      out.push({ id, name });
      rest = rest.replace(re, " ");
    }
  }
  return out;
}

const NUM_RE = /^(\d{1,2}(?:\.\d{1,2}){0,3}\.?|\([a-z]{1,4}\)|[a-z]\)|[A-Z]{1,2}\d{1,2}(?:\.\d{1,2})?)\s+(.+)$/;

export function splitNumbering(text: string): { ref: string | null; text: string } {
  const m = text.match(NUM_RE);
  if (!m) return { ref: null, text };
  return { ref: m[1].replace(/\.$/, "").replace(/^([a-z])\)$/, "($1)"), text: m[2].trim() };
}

export interface ContentRow {
  id: string;
  subject_id: string;
  key_stage_id: string;
  year_group_id: null;
  year_groups_json: string;
  level: "content_area" | "statement";
  strand: string | null;
  sub_strand: string | null;
  parent_id: string | null;
  ref: string | null;
  text: string;
  statutory: 1;
  framework: string;
  sort: number;
  notes: string | null;
}

/**
 * Blocks of one subject-content document -> taxonomy rows. `subjects` has one entry for a single-subject
 * document; several entries switch on headings naming a subject (preface rows before the first switch
 * are dropped for multi-subject documents).
 */
export function parseSubjectContent(
  blocks: Block[],
  opts: { framework: string; ks: string; years: readonly string[]; subjects: Array<{ id: string; name: string }>; docSlug: string },
): ContentRow[] {
  const rows: ContentRow[] = [];
  const multi = opts.subjects.length > 1;
  let current: { id: string; name: string } | null = multi ? null : opts.subjects[0];
  let subjectLevel: number | null = null;
  const seq = new Map<string, number>();
  const notes = opts.ks === "ks5" ? KS5_NOTE : null;
  let heads: Array<{ level: number; id: string; text: string }> = [];
  let lastPara: { id: string; endsColon: boolean; headId: string | null } | null = null;
  let sort = 0;

  const make = (level: ContentRow["level"], text: string, ref: string | null, parent: string | null): string => {
    const subj = current!;
    const n = (seq.get(subj.id) ?? 0) + 1;
    seq.set(subj.id, n);
    const id = `${opts.framework}:${subj.id}:${opts.docSlug}:${n}`;
    const path = heads.map((h) => h.text);
    rows.push({
      id,
      subject_id: subj.id,
      key_stage_id: opts.ks,
      year_group_id: null,
      year_groups_json: JSON.stringify(opts.years),
      level,
      strand: level === "content_area" ? (path[0] ?? text) : (path[0] ?? null),
      sub_strand: path.length > 1 ? path.slice(1).join(" > ") : null,
      parent_id: parent,
      ref,
      text,
      statutory: 1,
      framework: opts.framework,
      sort: sort++,
      notes,
    });
    return id;
  };

  const emitLi = (li: Extract<Block, { kind: "li" }>, parent: string | null) => {
    const s = splitNumbering(li.text);
    const id = make("statement", s.text, s.ref, parent);
    for (const c of li.children) {
      if (c.kind === "li") emitLi(c, id);
      else if (c.kind === "p") {
        const cs = splitNumbering(c.text);
        make("statement", cs.text, cs.ref, id);
      }
    }
  };

  for (const b of blocks) {
    if (b.kind === "h") {
      if (multi) {
        const hit = opts.subjects.find((s) => normText(b.text).startsWith(normText(s.name)));
        if (hit && hit.id !== current?.id) {
          current = hit;
          subjectLevel = b.level;
          heads = [];
          lastPara = null;
        } else if (!hit && subjectLevel !== null && b.level <= subjectLevel) {
          // a sibling section for a subject the platform does not carry (e.g. psychology) or a shared annex
          current = null;
          continue;
        }
      }
      if (!current) continue;
      heads = heads.filter((h) => h.level < b.level);
      const s = splitNumbering(b.text);
      const id = make("content_area", s.text, s.ref, heads[heads.length - 1]?.id ?? null);
      heads.push({ level: b.level, id, text: s.text });
      lastPara = null;
      continue;
    }
    if (!current) continue;
    const head = heads[heads.length - 1]?.id ?? null;
    if (b.kind === "p") {
      const s = splitNumbering(b.text);
      const id = make("statement", s.text, s.ref, head);
      lastPara = { id, endsColon: /[:：]\s*$/.test(s.text), headId: head };
    } else {
      const parent = lastPara && lastPara.endsColon && lastPara.headId === head ? lastPara.id : head;
      emitLi(b, parent);
    }
  }
  return rows;
}

const SKIP_ATTACHMENT = /equality|impact assessment|consultation|response|cover letter|glossary of|explanatory|regulatory|guidance for|conditions|summary of changes/i;

export async function ingestDfeSubjectContent(store: DataStore, opts: GovukIngestOptions = {}) {
  const ctx = new IngestContext(store, SRC.id, SRC.licence_id, SRC.attribution_text);
  await ctx.start();
  const fetcher: Fetcher = opts.fetcher ?? defaultFetcher(ctx);
  const force = opts.force || !!process.env.EDU_FORCE;
  let partial = false;
  try {
    for (const col of DFE_COLLECTIONS) {
      const c = await tryContent(ctx, fetcher, col.path);
      if (!c) {
        partial = true;
        continue;
      }
      const docs = collectionDocs(c.content).filter((d) => /\b(gcse|a level|as and a level|gce)\b/i.test(d.title) || subjectsInTitle(d.title).length);
      for (const d of docs) {
        const key = `doc:${col.framework}:${d.base_path}`;
        if (ctx.isDone(key) && !force) continue;
        const subjects = subjectsInTitle(d.title);
        if (!subjects.length) {
          await ctx.log("info", "subject_unmapped", `No platform subject for "${d.title}"`, { base_path: d.base_path });
          ctx.bump("docs_unmapped");
          continue;
        }
        const ok = await ingestDoc(store, ctx, fetcher, col, d, subjects);
        if (ok) await ctx.markDone(key, ok);
        else partial = true;
      }
    }
    await ctx.finish(partial ? "partial" : "ok");
    return ctx.getStats();
  } catch (e) {
    if (await handleBlocked(ctx, e)) return ctx.getStats();
    await failRun(ctx, e);
    throw e;
  }
}

async function ingestDoc(
  store: DataStore,
  ctx: IngestContext,
  fetcher: Fetcher,
  col: (typeof DFE_COLLECTIONS)[number],
  d: GovukLink,
  subjects: Array<{ id: string; name: string }>,
): Promise<string | null> {
  const pub = await tryContent(ctx, fetcher, d.base_path);
  if (!pub) return null;
  const docSlug = d.base_path.split("/").filter(Boolean).pop()!;
  const atts = absAttachments(pub.content).filter((a) => !SKIP_ATTACHMENT.test(a.title));
  const preferred = atts.filter((a) => /subject content|content and assessment|subject criteria/i.test(a.title));
  const pick: GovukAttachment[] = (preferred.length ? preferred : atts).filter((a) => isPdf(a) || isHtmlAttachment(a));
  // one source document is enough: HTML first (cleaner structure), else the first PDF
  const source = pick.find(isHtmlAttachment) ?? pick.find(isPdf);
  if (!source) {
    await ctx.log("warn", "no_attachment", `No subject content attachment on ${d.base_path}`, { titles: atts.map((a) => a.title) });
    return null;
  }
  let blocks: Block[];
  let checksum: string;
  if (isHtmlAttachment(source)) {
    const h = await tryContent(ctx, fetcher, basePathOf(source.url));
    if (!h?.content.details.body) return null;
    blocks = htmlToBlocks(h.content.details.body);
    checksum = h.checksum;
  } else {
    let f;
    try {
      f = await fetcher(source.url);
    } catch (e) {
      if ((e as Error).name === "BlockedHostError") throw e;
      await ctx.log("warn", "fetch_failed", `Could not fetch ${source.url}: ${(e as Error).message}`);
      return null;
    }
    blocks = pdfToBlocks(ensurePath(f, source.url));
    checksum = f.checksum;
  }
  const rows = parseSubjectContent(blocks, { framework: col.framework, ks: col.ks, years: col.years, subjects, docSlug });
  if (!rows.some((r) => r.level === "statement")) {
    await ctx.log("warn", "no_statements", `Nothing parsed from ${source.url}`, { title: d.title });
    return null;
  }
  const dbRows: Row[] = rows.map((r) => ({ ...r, ...ctx.prov(source.url, checksum) }));
  await store.transaction(async () => {
    for (const s of subjects)
      await store.delete("curriculum_statements", { framework: col.framework, id: { op: "like", value: `${col.framework}:${s.id}:${docSlug}:%` } });
    for (const part of chunk(dbRows, 500)) await store.upsert("curriculum_statements", part, ["id"]);
  });
  ctx.bump(`rows_${col.framework}`, dbRows.length);
  for (const s of subjects) if (!rows.some((r) => r.subject_id === s.id)) await ctx.log("warn", "subject_section_missing", `No section for ${s.name} in ${d.title}`);
  return checksum;
}
