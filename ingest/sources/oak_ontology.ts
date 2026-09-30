/**
 * Source: Oak Curriculum Ontology (GitHub, OGL v3.0).
 * Gives the National Curriculum 2014 statements for KS1-4 (strand > sub-strand > statement),
 * per-year progressions, subject aims and key-stage overviews, plus Oak programmes, units,
 * lessons, key learning points, keywords, misconceptions, pupil outcomes and prior knowledge.
 */
import fs from "node:fs";
import path from "node:path";
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext, chunk, sha256 } from "../core/context";
import { ensureRepo } from "../core/git";
import { TripleIndex, c, clean, cleanParagraphs, local, NS } from "../core/rdf";
import { OAK_ATTRIBUTION, SOURCES, subjectName } from "./registry";

const REPO = "https://github.com/oaknational/oak-curriculum-ontology";
const SRC = SOURCES.find((s) => s.id === "oak_ontology")!;

const KS_MAP: Record<string, string> = {
  "key-stage-1": "ks1",
  "key-stage-2": "ks2",
  "key-stage-3": "ks3",
  "key-stage-4": "ks4",
};

/** Ontology subject local name -> platform subject id (+ strand label for the sciences). */
function mapSubject(ontSubject: string, ks: string): { subject: string; scienceStrand?: string } {
  const s = ontSubject.replace(/^subject-/, "");
  if (s === "biology" || s === "chemistry" || s === "physics")
    return { subject: "science", scienceStrand: s[0].toUpperCase() + s.slice(1) };
  if (s === "food-and-nutrition") return { subject: "cooking-and-nutrition" };
  return { subject: s };
}

function yearIds(yg: string): string[] {
  const m = yg.replace("year-group-", "").split("-");
  return m.map((n) => `y${n}`);
}

/** KS4 statements are statutory only for the core NC subjects. */
const KS4_STATUTORY = new Set(["english", "mathematics", "science", "computing", "physical-education", "citizenship"]);

export async function ingestOakOntology(store: DataStore) {
  const ctx = new IngestContext(store, SRC.id, SRC.licence_id, SRC.attribution_text);
  await ctx.start();
  try {
    const pinned = process.env.EDU_REFRESH ? undefined : ctx.getCheckpoint("commit");
    const { dir, commit } = ensureRepo(REPO, "oak-curriculum-ontology", pinned);
    if (pinned && pinned !== commit) await ctx.log("warn", "commit_changed", `Pinned ${pinned} unavailable, using ${commit}`);
    if (!ctx.isDone(`ingested@${commit}`) || !ctx.getCheckpoint("retrieved_at")) await ctx.touchRetrieved();
    if (ctx.isDone(`ingested@${commit}`) && !process.env.EDU_FORCE) {
      await ctx.log("info", "skip", `Already ingested at ${commit}`);
      await ctx.finish("ok");
      return ctx.getStats();
    }

    // ---- load every TTL file, registering each as a raw file with its checksum ----
    const idx = new TripleIndex();
    const fileChecksum = new Map<string, string>();
    const files = walk(path.join(dir, "data")).filter((f) => f.endsWith(".ttl"));
    for (const f of files) {
      const body = fs.readFileSync(f);
      const rel = path.relative(dir, f);
      const url = `${REPO}/blob/${commit}/${rel}`;
      fileChecksum.set(f, await ctx.registerRaw(url, f, body, { commit }));
      idx.loadFile(f);
    }
    ctx.bump("triples", idx.size);
    const blob = (subjectIri: string) => {
      const f = idx.fileOf.get(subjectIri);
      return f ? `${REPO}/blob/${commit}/${path.relative(dir, f)}` : `${REPO}/tree/${commit}`;
    };
    const csum = (subjectIri: string) => fileChecksum.get(idx.fileOf.get(subjectIri) ?? "") ?? null;
    const provNC = (iri: string) => ctx.prov(blob(iri), csum(iri));

    // ---- National Curriculum statements ----
    const statements = new Map<string, Row>();
    const put = (r: Row) => statements.set(r.id as string, r);

    // Schemes -> subject + key stage (+ KS overview text and aims)
    const schemeInfo = new Map<string, { ks: string; subject: string; scienceStrand?: string; ontSubject: string }>();
    for (const sch of idx.ofType(c("Scheme"))) {
      const ks = KS_MAP[local(idx.one(sch, c("coversKeyStage")) ?? "")];
      const ontSubject = local(idx.one(sch, c("isSchemeOf")) ?? "");
      if (!ks || !ontSubject) continue;
      const m = mapSubject(ontSubject, ks);
      schemeInfo.set(sch, { ks, ontSubject, ...m });
      const desc = idx.one(sch, NS.dcterms + "description");
      if (desc && !/^No key stage description/i.test(desc)) {
        put({
          id: `nc:${m.subject}:${ks}:overview${m.scienceStrand ? "-" + m.scienceStrand.toLowerCase() : ""}`,
          subject_id: m.subject,
          key_stage_id: ks,
          level: "overview",
          strand: m.scienceStrand ?? null,
          text: cleanParagraphs(desc),
          ref: local(sch),
          statutory: 0,
          framework: "nc2014",
          sort: 0,
          ...provNC(sch),
        });
      }
    }
    // Subject aims
    for (const subj of idx.ofType(c("Subject"))) {
      const m = mapSubject(local(subj), "ks1");
      idx.all(subj, c("hasAim")).forEach((aim, i) =>
        put({
          id: `nc:${m.subject}:aim:${local(aim)}`,
          subject_id: m.subject,
          key_stage_id: null,
          level: "aim",
          text: clean(idx.label(aim)),
          ref: local(aim),
          statutory: 1,
          framework: "nc2014",
          sort: i,
          ...provNC(aim),
        }),
      );
    }

    // Progressions: (scheme, year group, sub-strand) -> content descriptors
    const descriptorPlacement = new Map<string, Array<{ ks: string; subject: string; scienceStrand?: string; years: string[]; substrand: string }>>();
    for (const pr of idx.ofType(c("Progression"))) {
      const sch = schemeInfo.get(idx.one(pr, c("isProgressionOf")) ?? "");
      if (!sch) continue;
      const years = idx.all(pr, c("coversYearGroup")).flatMap((y) => yearIds(local(y)));
      const substrand = idx.one(pr, c("coversSubStrand")) ?? idx.one(pr, c("coversStrand")) ?? "";
      for (const d of idx.all(pr, c("includesContentDescriptor"))) {
        const arr = descriptorPlacement.get(d) ?? [];
        arr.push({ ks: sch.ks, subject: sch.subject, scienceStrand: sch.scienceStrand, years, substrand });
        descriptorPlacement.set(d, arr);
      }
    }

    const broader = (iri: string) => idx.one(iri, NS.skos + "broader");
    const narrower = (iri: string) => idx.all(iri, NS.skos + "narrower");
    let sortCounter = 0;
    for (const [desc, placements] of descriptorPlacement) {
      // merge placements per key stage (a statement can be taught in several years of one KS)
      const byKs = new Map<string, { subject: string; scienceStrand?: string; strands: Set<string>; years: Set<string>; substrand: string }>();
      for (const p of placements) {
        const k = `${p.subject}|${p.ks}`;
        const e = byKs.get(k) ?? { subject: p.subject, scienceStrand: p.scienceStrand, strands: new Set<string>(), years: new Set<string>(), substrand: p.substrand };
        p.years.forEach((y) => e.years.add(y));
        if (p.scienceStrand) e.strands.add(p.scienceStrand);
        byKs.set(k, e);
      }
      // Statements shared by biology, chemistry and physics (e.g. working scientifically) carry no science prefix.
      for (const e of byKs.values()) if (e.strands.size > 1) e.scienceStrand = undefined;
      for (const [k, p] of byKs) {
        const ks = k.split("|")[1];
        const substrandIri = broader(desc) ?? p.substrand;
        const strandIri = substrandIri ? broader(substrandIri) : undefined;
        const strandLabel = strandIri ? idx.label(strandIri) : "General";
        const substrandLabel = substrandIri ? idx.label(substrandIri) : strandLabel;
        const strandName = p.scienceStrand && !/biology|chemistry|physics/i.test(strandLabel) ? `${p.scienceStrand}: ${strandLabel}` : strandLabel;
        const strandId = `nc:${p.subject}:${ks}:strand:${local(strandIri ?? "general")}${p.scienceStrand ? "-" + p.scienceStrand.toLowerCase() : ""}`;
        const subId = `nc:${p.subject}:${ks}:sub:${local(substrandIri ?? "general")}${p.scienceStrand ? "-" + p.scienceStrand.toLowerCase() : ""}`;
        const statutory = ks === "ks4" && !KS4_STATUTORY.has(p.subject) ? 0 : 1;
        if (!statements.has(strandId))
          put({ id: strandId, subject_id: p.subject, key_stage_id: ks, level: "strand", strand: strandName, text: strandName, ref: local(strandIri ?? "general"), parent_id: null, statutory, framework: "nc2014", sort: sortCounter++, ...provNC(strandIri ?? desc) });
        if (!statements.has(subId))
          put({ id: subId, subject_id: p.subject, key_stage_id: ks, level: "substrand", strand: strandName, sub_strand: substrandLabel, text: substrandLabel, ref: local(substrandIri ?? "general"), parent_id: strandId, statutory, framework: "nc2014", sort: sortCounter++, ...provNC(substrandIri ?? desc) });
        const years = [...p.years].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
        const descId = byKs.size > 1 ? `nc:${ks}:${local(desc)}` : `nc:${local(desc)}`;
        put({
          id: descId,
          subject_id: p.subject,
          key_stage_id: ks,
          year_group_id: years.length === 1 ? years[0] : null,
          year_groups_json: JSON.stringify(years),
          level: "statement",
          strand: strandName,
          sub_strand: substrandLabel,
          parent_id: subId,
          ref: local(desc),
          text: idx.label(desc),
          statutory,
          framework: "nc2014",
          sort: sortCounter++,
          notes: "Sourced via Oak Curriculum Ontology v0.1.x; to be cross-checked against gov.uk programmes of study when reachable.",
          ...provNC(desc),
        });
        // sub-descriptors that add detail beyond the parent statement
        narrower(desc).forEach((sd, i) => {
          const t = idx.label(sd);
          if (norm(t) === norm(idx.label(desc))) return;
          put({ id: `${descId}:${i + 1}`, subject_id: p.subject, key_stage_id: ks, year_group_id: years.length === 1 ? years[0] : null, year_groups_json: JSON.stringify(years), level: "sub_statement", strand: strandName, sub_strand: substrandLabel, parent_id: descId, ref: local(sd), text: t, statutory, framework: "nc2014", sort: sortCounter++, ...provNC(sd) });
        });
      }
    }
    // Fields other ingesters (Oak API) fill in on ontology lessons survive the wholesale replace below.
    const enriched = await store.select<{ id: string; has_quiz: number; pupil_outcome: string | null }>("lessons", {
      where: { source_id: SRC.id, has_quiz: 1 },
      columns: ["id", "has_quiz", "pupil_outcome"],
    });
    // Replace this source's rows wholesale so re-runs never leave stale records behind.
    for (const t of ["content_blocks", "lessons", "units", "curriculum_statements"]) await store.delete(t, { source_id: SRC.id });
    await store.delete("unit_lessons", { unit_id: { op: "like", value: "oak:unit:%" } });
    for (const part of chunk([...statements.values()], 500)) await store.upsert("curriculum_statements", part, ["id"]);
    ctx.bump("curriculum_statements", statements.size);
    ctx.bump("nc_statements_leaf", [...statements.values()].filter((s) => s.level === "statement").length);

    // ---- Oak programmes -> units -> lessons ----
    const unitYears = new Map<string, Set<string>>();
    const unitSort = new Map<string, number>();
    const unitBoards = new Map<string, Set<string>>();
    const unitTiers = new Map<string, Set<string>>();
    const variantOf = (uv: string) => idx.one(uv, c("isUnitVariantOf"));
    for (const prog of idx.ofType(c("Programme"))) {
      const years = idx.all(prog, c("coversYearGroup")).flatMap((y) => yearIds(local(y)));
      const boards = idx.all(prog, c("hasExamBoard")).map((b) => idx.label(b));
      const tiers = idx.all(prog, c("hasTier")).map((t) => idx.label(t));
      for (const inc of idx.all(prog, c("hasUnitVariantInclusion"))) {
        const pos = Number(idx.one(inc, c("sequencePosition")) ?? 0);
        const variants = [
          ...idx.all(inc, c("includesUnitVariant")),
          ...idx.all(inc, c("includesUnitVariantChoice")).flatMap((ch) => idx.all(ch, c("hasUnitVariantOption"))),
        ];
        for (const uv of variants) {
          const u = variantOf(uv);
          if (!u) continue;
          const ys = unitYears.get(u) ?? new Set();
          years.forEach((y) => ys.add(y));
          unitYears.set(u, ys);
          if (!unitSort.has(u) || pos < unitSort.get(u)!) unitSort.set(u, pos);
          boards.forEach((b) => (unitBoards.get(u) ?? unitBoards.set(u, new Set()).get(u)!).add(b));
          tiers.forEach((t) => (unitTiers.get(u) ?? unitTiers.set(u, new Set()).get(u)!).add(t));
        }
      }
    }
    // unit -> ordered lessons (union across variants; first variant's order wins)
    const unitLessons = new Map<string, Map<string, number>>();
    for (const uv of idx.ofType(c("UnitVariant"))) {
      const u = variantOf(uv);
      if (!u) continue;
      const m = unitLessons.get(u) ?? new Map<string, number>();
      for (const inc of idx.all(uv, c("hasLessonInclusion"))) {
        const l = idx.one(inc, c("includesLesson"));
        const pos = Number(idx.one(inc, c("sequencePosition")) ?? 0);
        if (l && !m.has(l)) m.set(l, pos);
      }
      unitLessons.set(u, m);
    }

    const unitRows: Row[] = [];
    const lessonRows = new Map<string, Row>();
    const ulRows: Row[] = [];
    const blocks: Row[] = [];
    for (const u of idx.ofType(c("Unit"))) {
      const sch = schemeInfo.get(idx.one(u, c("isUnitOf")) ?? "");
      if (!sch) {
        await ctx.log("warn", "unit_no_scheme", `Unit ${local(u)} has no scheme`, { unit: u });
        continue;
      }
      const slug = idx.one(u, c("slug")) ?? local(u);
      const unitId = `oak:unit:${slug}`;
      const years = [...(unitYears.get(u) ?? [])].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      const subjLabel = subjectName(sch.subject).toLowerCase();
      const oakAttr = OAK_ATTRIBUTION(subjLabel);
      const prov = ctx.prov(blob(u), csum(u), false, oakAttr);
      const prior = idx.all(u, c("hasPriorKnowledgeRequirement")).map((p) => idx.label(p));
      unitRows.push({
        id: unitId,
        subject_id: sch.subject,
        key_stage_id: sch.ks,
        year_group_id: years[0] ?? null,
        slug,
        title: idx.label(u),
        description: idx.one(u, NS.rdfs + "comment") ? clean(idx.one(u, NS.rdfs + "comment")!) : null,
        why_this_why_now: idx.one(u, c("whyThisWhyNow")) ? clean(idx.one(u, c("whyThisWhyNow"))!) : null,
        prior_knowledge_json: JSON.stringify(prior),
        threads_json: JSON.stringify(idx.all(u, c("includesThread")).map((t) => idx.label(t))),
        exam_board: unitBoards.get(u)?.size ? [...unitBoards.get(u)!].join(", ") : null,
        tier: unitTiers.get(u)?.size ? [...unitTiers.get(u)!].join(", ") : null,
        sort: unitSort.get(u) ?? 0,
        external_id: idx.one(u, c("id")) ?? null,
        external_url: null,
        ...prov,
      });
      prior.forEach((p, i) =>
        blocks.push({ id: `${unitId}:prior:${i + 1}`, unit_id: unitId, lesson_id: null, kind: "prior_knowledge", title: null, body: p, sort: i, ...prov }),
      );
      for (const [l, pos] of unitLessons.get(u) ?? []) {
        const lslug = idx.one(l, c("slug")) ?? local(l);
        const lessonId = `oak:lesson:${lslug}`;
        ulRows.push({ unit_id: unitId, lesson_id: lessonId, position: pos });
        if (lessonRows.has(lessonId)) continue;
        const lprov = ctx.prov(blob(l), csum(l), false, oakAttr);
        const outcome = idx.all(l, c("hasPupilLessonOutcome")).map((o) => idx.label(o))[0] ?? null;
        lessonRows.set(lessonId, {
          id: lessonId,
          unit_id: unitId,
          slug: lslug,
          title: idx.label(l),
          pupil_outcome: outcome,
          sort: pos,
          external_id: idx.one(l, c("id")) ?? null,
          external_url: `https://www.thenational.academy/teachers/lessons/${lslug}`,
          has_quiz: 0,
          ...lprov,
        });
        idx.all(l, c("hasKeyLearningPoint")).forEach((k, i) =>
          blocks.push({ id: `${lessonId}:klp:${i + 1}`, lesson_id: lessonId, unit_id: unitId, kind: "key_learning_point", body: idx.label(k), sort: i, ...lprov }),
        );
        idx.all(l, c("hasKeyword")).forEach((k, i) => {
          const def = idx.one(k, NS.schema + "description");
          blocks.push({ id: `${lessonId}:kw:${local(k)}`, lesson_id: lessonId, unit_id: unitId, kind: "keyword", title: idx.label(k), body: def ? clean(def) : "", sort: i, ...lprov });
        });
        idx.all(l, c("hasMisconception")).forEach((m, i) => {
          const st = idx.one(m, c("statement"));
          const corr = idx.one(m, c("correction"));
          if (!st) return;
          blocks.push({ id: `${lessonId}:mis:${i + 1}`, lesson_id: lessonId, unit_id: unitId, kind: "misconception", title: clean(st), body: corr ? clean(corr) : "", sort: i, ...lprov });
        });
      }
    }
    for (const part of chunk(unitRows, 500)) await store.upsert("units", part, ["id"]);
    for (const part of chunk([...lessonRows.values()], 500)) await store.upsert("lessons", part, ["id"]);
    for (const e of enriched)
      if (lessonRows.has(e.id)) await store.update("lessons", { id: e.id }, { has_quiz: 1, ...(e.pupil_outcome ? { pupil_outcome: e.pupil_outcome } : {}) });
    for (const part of chunk(ulRows, 1000)) await store.upsert("unit_lessons", part, ["unit_id", "lesson_id"]);
    for (const part of chunk(blocks, 1000)) await store.upsert("content_blocks", part, ["id"]);
    ctx.bump("units", unitRows.length);
    ctx.bump("lessons", lessonRows.size);
    ctx.bump("content_blocks", blocks.length);

    // sanity checks, logged not fixed
    const lessonsWithoutUnit = idx.ofType(c("Lesson")).filter((l) => !lessonRows.has(`oak:lesson:${idx.one(l, c("slug")) ?? local(l)}`));
    if (lessonsWithoutUnit.length)
      await ctx.log("warn", "orphan_lessons", `${lessonsWithoutUnit.length} lessons are not in any unit variant`, { sample: lessonsWithoutUnit.slice(0, 10).map(local) });
    const emptyUnits = unitRows.filter((u) => !(unitLessons.get(`${NS.oak}unit-${u.external_id}`)?.size));
    if (emptyUnits.length) await ctx.log("warn", "units_without_lessons", `${emptyUnits.length} units have no lessons`, { sample: emptyUnits.slice(0, 10).map((u) => u.slug) });

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

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
export { sha256 };
