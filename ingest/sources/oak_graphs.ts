/**
 * Source: Oak curriculum graphs generated from Oak's bulk download and published in the
 * oak-mcp-ecosystem repo (OGL v3.0 content, MIT code).
 *  - nc-coverage-graph: Oak's own unit -> National Curriculum statement mapping
 *  - graph-corpus: units (with year), lessons, misconceptions, keywords, prerequisite edges
 * Adds units/lessons missing from the ontology (e.g. RE, RSHE), refines unit subjects
 * (biology/chemistry/physics, french/german/spanish) and writes oak_mapping links.
 */
import fs from "node:fs";
import path from "node:path";
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext, chunk, sha256 } from "../core/context";
import { ensureRepo } from "../core/git";
import { OAK_ATTRIBUTION, OAK_SUBJECT_MAP, SOURCES, subjectName } from "./registry";

const REPO = "https://github.com/oaknational/oak-mcp-ecosystem";
const SRC = SOURCES.find((s) => s.id === "oak_graphs")!;
const VOCAB = "packages/sdks/oak-sdk-codegen/src/generated/vocab";

interface CoverageNode { statement: string; unitSlug: string; unitTitle: string; subject: string; keyStage: string }
interface GUnit { kind: "unit"; unitSlug: string; unitTitle: string; subject: string; keyStage: string; year?: number; priorKnowledge?: string[]; threadSlugs?: string[] }
interface GLesson { kind: "lesson"; lessonSlug: string; lessonTitle: string; subject: string; keyStage: string }
interface GMis { kind: "misconception"; id: string; misconception: string; response?: string }
interface GKw { kind: "keyword"; id: string; term: string; description?: string }
interface GThread { kind: "thread"; threadSlug: string; title: string }
type GNode = GUnit | GLesson | GMis | GKw | GThread | { kind: string; id: string };

/** Normalise NC statement wording so Oak's "Pupils should be taught to ..." phrasing matches the ontology text. */
export function normStatement(s: string): string {
  return s
    .toLowerCase()
    .replace(/^pupils should (be taught|develop|learn|understand)( to| about|:)?\s*/, "")
    .replace(/[‘’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const tokens = (s: string) => new Set(normStatement(s).split(" ").filter((w) => w.length > 2));
export function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

const statementSubject = (oakSubject: string) =>
  ["french", "german", "spanish"].includes(oakSubject) ? "languages" : OAK_SUBJECT_MAP[oakSubject] ?? oakSubject;

export async function ingestOakGraphs(store: DataStore) {
  const ctx = new IngestContext(store, SRC.id, SRC.licence_id, SRC.attribution_text);
  await ctx.start();
  try {
    const pinned = process.env.EDU_REFRESH ? undefined : ctx.getCheckpoint("commit");
    const { dir, commit } = ensureRepo(REPO, "oak-mcp-ecosystem", pinned);
    if (ctx.isDone(`ingested@${commit}`) && !process.env.EDU_FORCE) {
      await ctx.finish("ok");
      return { skipped: `already ingested at ${commit}` };
    }
    const read = async (name: string) => {
      const f = path.join(dir, VOCAB, name, "data.json");
      const body = fs.readFileSync(f);
      const url = `${REPO}/blob/${commit}/${VOCAB}/${name}/data.json`;
      const checksum = await ctx.registerRaw(url, f, body, { commit });
      return { data: JSON.parse(body.toString("utf8")), url, checksum };
    };
    const coverage = await read("nc-coverage-graph");
    const corpus = await read("graph-corpus");
    await ctx.log("info", "versions", "graph versions", { coverage: coverage.data.sourceVersion, corpus: corpus.data.sourceVersion });

    // Sweep this source's previous rows (links are rebuilt below).
    for (const t of ["content_blocks", "lessons", "units", "curriculum_statements"]) await store.delete(t, { source_id: SRC.id });
    await store.delete("unit_statement_links", { method: "oak_mapping" });

    // ---------- units & lessons from the corpus ----------
    const nodes = corpus.data.nodes as GNode[];
    const units = nodes.filter((n): n is GUnit => n.kind === "unit");
    const lessons = new Map(nodes.filter((n): n is GLesson => n.kind === "lesson").map((l) => [`lesson:${l.lessonSlug}`, l]));
    const misById = new Map(nodes.filter((n): n is GMis => n.kind === "misconception").map((m) => [m.id, m]));
    const kwById = new Map(nodes.filter((n): n is GKw => n.kind === "keyword").map((k) => [k.id, k]));
    const threads = new Map(nodes.filter((n): n is GThread => n.kind === "thread").map((t) => [t.threadSlug, t.title]));
    const edges = corpus.data.edges as Array<{ source: string; type: string; target: string }>;
    const byLesson = (type: string) => {
      const m = new Map<string, string[]>();
      for (const e of edges) if (e.type === type) (m.get(e.source) ?? m.set(e.source, []).get(e.source)!).push(e.target);
      return m;
    };
    const lessonMis = byLesson("addressesMisconception");
    const lessonKw = byLesson("containsKeyword");
    const runs = new Map<string, string[]>((corpus.data.unitLessonRuns as Array<{ unitId: string; lessonIds: string[] }>).map((r) => [r.unitId, r.lessonIds]));

    const existingUnits = new Map((await store.select<{ id: string; subject_id: string }>("units", { columns: ["id", "subject_id"] })).map((u) => [u.id, u]));
    const existingLessons = new Set((await store.select<{ id: string }>("lessons", { columns: ["id"] })).map((l) => l.id));

    const newUnits: Row[] = [];
    const newLessons = new Map<string, Row>();
    const ul: Row[] = [];
    const blocks: Row[] = [];
    let refined = 0;
    for (const u of units) {
      const unitId = `oak:unit:${u.unitSlug}`;
      const subject = OAK_SUBJECT_MAP[u.subject] ?? u.subject;
      const ex = existingUnits.get(unitId);
      if (ex) {
        // refine subject: ontology files KS4 sciences under 'science' and languages under 'languages'
        if (ex.subject_id !== subject && (ex.subject_id === "science" || ex.subject_id === "languages")) {
          await store.update("units", { id: unitId }, { subject_id: subject });
          refined++;
        }
        continue;
      }
      const attr = OAK_ATTRIBUTION(subjectName(subject).toLowerCase());
      const prov = ctx.prov(corpus.url, corpus.checksum, false, attr);
      const ks = u.keyStage?.toLowerCase();
      newUnits.push({
        id: unitId,
        subject_id: subject,
        key_stage_id: ["ks1", "ks2", "ks3", "ks4"].includes(ks) ? ks : null,
        year_group_id: u.year ? `y${u.year}` : null,
        slug: u.unitSlug,
        title: u.unitTitle,
        prior_knowledge_json: JSON.stringify(u.priorKnowledge ?? []),
        threads_json: JSON.stringify((u.threadSlugs ?? []).map((t) => threads.get(t) ?? t)),
        sort: 0,
        ...prov,
      });
      (u.priorKnowledge ?? []).forEach((p, i) =>
        blocks.push({ id: `${unitId}:prior:${i + 1}`, unit_id: unitId, kind: "prior_knowledge", body: p, sort: i, ...prov }),
      );
      (runs.get(`unit:${u.unitSlug}`) ?? []).forEach((lid, pos) => {
        const l = lessons.get(lid);
        if (!l) return;
        const lessonId = `oak:lesson:${l.lessonSlug}`;
        ul.push({ unit_id: unitId, lesson_id: lessonId, position: pos + 1 });
        if (existingLessons.has(lessonId) || newLessons.has(lessonId)) return;
        newLessons.set(lessonId, {
          id: lessonId,
          unit_id: unitId,
          slug: l.lessonSlug,
          title: l.lessonTitle,
          sort: pos + 1,
          external_url: `https://www.thenational.academy/teachers/lessons/${l.lessonSlug}`,
          has_quiz: 0,
          ...prov,
        });
        (lessonMis.get(lid) ?? []).forEach((mid, i) => {
          const m = misById.get(mid);
          if (m) blocks.push({ id: `${lessonId}:mis:g${i + 1}`, lesson_id: lessonId, unit_id: unitId, kind: "misconception", title: m.misconception, body: m.response ?? "", sort: i, ...prov });
        });
        (lessonKw.get(lid) ?? []).forEach((kid, i) => {
          const k = kwById.get(kid);
          if (k) blocks.push({ id: `${lessonId}:kw:g-${sha256(kid).slice(0, 10)}`, lesson_id: lessonId, unit_id: unitId, kind: "keyword", title: k.term, body: k.description ?? "", sort: i, ...prov });
        });
      });
    }
    for (const p of chunk(newUnits, 500)) await store.upsert("units", p, ["id"]);
    for (const p of chunk([...newLessons.values()], 500)) await store.upsert("lessons", p, ["id"]);
    for (const p of chunk(ul, 1000)) await store.upsert("unit_lessons", p, ["unit_id", "lesson_id"]);
    for (const p of chunk(blocks, 1000)) await store.upsert("content_blocks", p, ["id"]);
    ctx.bump("units_added", newUnits.length);
    ctx.bump("units_subject_refined", refined);
    ctx.bump("lessons_added", newLessons.size);
    ctx.bump("content_blocks_added", blocks.length);

    // prerequisite edges: unit A is prior learning for unit B
    const allUnitIds = new Set([...existingUnits.keys(), ...newUnits.map((u) => u.id as string)]);
    const unitTitle = new Map(units.map((u) => [`oak:unit:${u.unitSlug}`, u.unitTitle]));
    const prereq: Row[] = [];
    for (const e of edges.filter((e) => e.type === "prerequisiteFor")) {
      const a = `oak:unit:${e.source.replace(/^unit:/, "")}`;
      const b = `oak:unit:${e.target.replace(/^unit:/, "")}`;
      if (a === b || !allUnitIds.has(a) || !allUnitIds.has(b)) continue;
      prereq.push({ id: `${b}:prereq:${sha256(a).slice(0, 12)}`, unit_id: b, kind: "prerequisite_unit", title: unitTitle.get(a) ?? a, body: `Builds on the unit "${unitTitle.get(a) ?? a}".`, extra_json: JSON.stringify({ unit_id: a }), sort: 0, ...ctx.prov(corpus.url, corpus.checksum, false, SRC.attribution_text) });
    }
    for (const p of chunk(prereq, 1000)) await store.upsert("content_blocks", p, ["id"]);
    ctx.bump("prerequisite_edges", prereq.length);

    // ---------- Oak's unit -> National Curriculum mapping ----------
    const stmts = await store.select<{ id: string; subject_id: string; key_stage_id: string; text: string }>("curriculum_statements", {
      where: { level: ["statement", "sub_statement"], framework: "nc2014" },
      columns: ["id", "subject_id", "key_stage_id", "text"],
    });
    const pool = new Map<string, Array<{ id: string; norm: string; tok: Set<string> }>>();
    for (const s of stmts) {
      const k = `${s.subject_id}|${s.key_stage_id}`;
      (pool.get(k) ?? pool.set(k, []).get(k)!).push({ id: s.id, norm: normStatement(s.text), tok: tokens(s.text) });
    }
    const matchCache = new Map<string, { id: string; score: number } | null>();
    const mappedStatements: Row[] = [];
    const links = new Map<string, Row>();
    let exact = 0, fuzzy = 0, created = 0;
    for (const n of coverage.data.nodes as CoverageNode[]) {
      const subj = statementSubject(n.subject);
      const ks = n.keyStage.toLowerCase();
      const unitId = `oak:unit:${n.unitSlug}`;
      if (!allUnitIds.has(unitId)) {
        ctx.bump("mapping_unit_missing");
        continue;
      }
      const key = `${subj}|${ks}|${n.statement}`;
      let m = matchCache.get(key);
      if (m === undefined) {
        const cands = [...(pool.get(`${subj}|${ks}`) ?? []), ...(subj === "science" ? [] : [])];
        const ns = normStatement(n.statement);
        const t = tokens(n.statement);
        let best: { id: string; score: number } | null = null;
        for (const cnd of cands) {
          const score = cnd.norm === ns ? 1 : ns.includes(cnd.norm) || cnd.norm.includes(ns) ? 0.95 : jaccard(t, cnd.tok);
          if (!best || score > best.score) best = { id: cnd.id, score };
        }
        m = best && best.score >= 0.6 ? best : null;
        if (!m) {
          // Statement Oak maps to that the ontology lacks (e.g. RSHE guidance, KS4 non-core). Keep it, flagged.
          const id = `oakmap:${subj}:${ks}:${sha256(n.statement).slice(0, 12)}`;
          const strand = subj === "rshe-pshe" ? "RSHE statutory guidance" : "Statements referenced by Oak";
          mappedStatements.push({
            id, subject_id: subj, key_stage_id: ["ks1", "ks2", "ks3", "ks4"].includes(ks) ? ks : null, level: "statement", strand, sub_strand: strand,
            parent_id: null, ref: null, text: n.statement, statutory: subj === "rshe-pshe" ? 1 : 0, framework: subj === "rshe-pshe" ? "rshe_guidance" : "oak_nc_mapping",
            sort: 9000, notes: "Statement text as given in Oak's curriculum mapping; not found in the NC 2014 ontology. Verify against gov.uk.",
            ...ctx.prov(coverage.url, coverage.checksum),
          });
          m = { id, score: 1 };
          created++;
        } else if (m.score === 1) exact++;
        else fuzzy++;
        matchCache.set(key, m);
      }
      if (!m) continue;
      const lk = `${unitId}|${m.id}`;
      if (!links.has(lk))
        links.set(lk, { unit_id: unitId, statement_id: m.id, method: "oak_mapping", confidence: Number(m.score.toFixed(3)), review_status: m.score >= 0.8 ? "auto_ok" : "needs_review" });
    }
    const uniqMapped = [...new Map(mappedStatements.map((s) => [s.id, s])).values()];
    for (const p of chunk(uniqMapped, 500)) await store.upsert("curriculum_statements", p, ["id"]);
    for (const p of chunk([...links.values()], 1000)) await store.upsert("unit_statement_links", p, ["unit_id", "statement_id"]);
    ctx.bump("mapping_statements_exact", exact);
    ctx.bump("mapping_statements_fuzzy", fuzzy);
    ctx.bump("mapping_statements_created", uniqMapped.length);
    ctx.bump("unit_statement_links", links.size);
    if (created) await ctx.log("warn", "mapping_unmatched", `${uniqMapped.length} Oak-mapped statements had no NC 2014 match and were added with framework oak_nc_mapping/rshe_guidance`);

    await ctx.markDone("commit", commit);
    await ctx.markDone(`ingested@${commit}`, new Date().toISOString());
    await ctx.finish("ok");
    return ctx.getStats();
  } catch (e) {
    await ctx.log("error", "exception", String((e as Error).stack ?? e));
    await ctx.finish("failed", String(e));
    throw e;
  }
}
