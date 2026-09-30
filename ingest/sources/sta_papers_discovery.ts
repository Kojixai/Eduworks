/**
 * STA past papers: attachment classification, paper specs (known totals and timings) and discovery
 * via the gov.uk Content API.
 *
 * gov.uk structure (2016 onwards):
 *   /government/collections/national-curriculum-assessments-past-test-materials   (collection)
 *     -> links.documents: per-year, per-subject publications, e.g.
 *        "Key stage 2 tests: 2019 mathematics test materials"
 *        (/government/publications/key-stage-2-tests-2019-mathematics-test-materials)
 *        "Key stage 2 tests: 2019 English reading test materials", "... grammar, punctuation and spelling ..."
 *        "Key stage 1 tests: 2019 mathematics test materials", ...
 *     -> each publication's details.attachments: the PDFs (papers, mark schemes, reading booklets,
 *        spelling task scripts, modified versions, copyright reports).
 * Discovery results are kept in a committed manifest: data/sta/manifest-<ks>.json.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, now } from "../core/context";
import { attachments, collectionDocuments, getContent, pageUrl, type GovukContent } from "../core/govuk";

export type KeyStage = "ks1" | "ks2";
export type Subject = "maths" | "gps" | "reading";

/** Question-bearing papers. */
export type PaperKind =
  | "maths_arithmetic"
  | "maths_reasoning"
  | "gps_questions"
  | "gps_spelling"
  | "reading_answer"; // reading answer booklet (KS1 paper 1 is a combined reading + answer booklet)

/** Everything a publication attachment can be. */
export type DocKind = PaperKind | "reading_booklet" | "spelling_script" | "mark_scheme" | "copyright_report" | "ignore";

export interface Classified {
  kind: DocKind;
  subject: Subject | null;
  paperNumber: number | null;
  /** KS1 reading paper 1 contains the texts and questions together */
  combined?: boolean;
}

export const COLLECTION_PATH = "/government/collections/national-curriculum-assessments-past-test-materials";

export function subjectOf(text: string): Subject | null {
  const t = text.toLowerCase();
  if (/\bmath(s|ematics)\b|arithmetic|reasoning/.test(t)) return "maths";
  if (/grammar|punctuation|\bgps\b|\bspag\b|spelling/.test(t)) return "gps";
  if (/\breading\b/.test(t)) return "reading";
  return null;
}

/**
 * Classify an attachment title (optionally with the publication title for subject context).
 * Order matters: modified/enlarged/braille versions and guidance are ignored before anything else,
 * except the spelling task script which is needed for the spelling paper.
 */
export function classifyAttachment(title: string, publicationTitle = ""): Classified {
  const t = title.toLowerCase().replace(/\s+/g, " ");
  const subject = subjectOf(t) ?? subjectOf(publicationTitle);
  const pn = t.match(/paper\s*(\d)/);
  const paperNumber = pn ? Number(pn[1]) : null;
  const res = (kind: DocKind, extra: Partial<Classified> = {}): Classified => ({ kind, subject, paperNumber, ...extra });

  if (/modified|large print|enlarged|braille|\bmlp\b|\bel\b|welsh|cymraeg/.test(t)) return res("ignore");
  if (/copyright/.test(t)) return res("copyright_report", { subject: null });
  if (/mark scheme|marking scheme|answers? and mark/.test(t)) return res("mark_scheme");
  if (subject === "gps" && /spelling/.test(t) && /script|administration instructions|task (answers|instructions)|answers/.test(t))
    return res("spelling_script");
  if (/sources|administration|guidance|instructions|framework|scaled score|conversion|sample|notes|leaflet|access arrangements|headteacher/.test(t))
    return res("ignore");
  if (subject === "maths") {
    if (/arithmetic/.test(t)) return res("maths_arithmetic", { paperNumber: paperNumber ?? 1 });
    if (/reasoning/.test(t)) return res("maths_reasoning");
    return res("ignore");
  }
  if (subject === "gps") {
    if (/spelling/.test(t) && !/questions/.test(t)) return res("gps_spelling");
    if (/questions/.test(t)) return res("gps_questions");
    return res("ignore");
  }
  if (subject === "reading") {
    if (/reading and answer booklet|combined/.test(t)) return res("reading_answer", { combined: true });
    if (/answer booklet|answer paper/.test(t)) return res("reading_answer");
    if (/reading booklet|texts?\b/.test(t)) return res("reading_booklet");
    return res("ignore");
  }
  return res("ignore");
}

// ---------------------------------------------------------------- known paper specs
export interface PaperSpec {
  slug: string;
  name: string;
  subjectId: "mathematics" | "english";
  totalMarks: number;
  timeMinutes: number;
  /** KS1 tests are not strictly timed: the minutes are STA's guidance for administration */
  timeApproximate: boolean;
}

/** STA totals/timings (2016 framework). Used when the paper cover does not state them. */
export function paperSpec(ks: KeyStage, kind: PaperKind, paperNumber: number | null, combined = false): PaperSpec {
  const n = paperNumber;
  if (ks === "ks2") {
    switch (kind) {
      case "maths_arithmetic":
        return { slug: "maths-p1-arithmetic", name: "Mathematics Paper 1: arithmetic", subjectId: "mathematics", totalMarks: 40, timeMinutes: 30, timeApproximate: false };
      case "maths_reasoning":
        return { slug: `maths-p${n ?? 2}-reasoning`, name: `Mathematics Paper ${n ?? 2}: reasoning`, subjectId: "mathematics", totalMarks: 35, timeMinutes: 40, timeApproximate: false };
      case "gps_questions":
        return { slug: "gps-p1-questions", name: "English grammar, punctuation and spelling Paper 1: questions", subjectId: "english", totalMarks: 50, timeMinutes: 45, timeApproximate: false };
      case "gps_spelling":
        return { slug: "gps-p2-spelling", name: "English grammar, punctuation and spelling Paper 2: spelling", subjectId: "english", totalMarks: 20, timeMinutes: 15, timeApproximate: true };
      case "reading_answer":
        return { slug: "reading", name: "English reading", subjectId: "english", totalMarks: 50, timeMinutes: 60, timeApproximate: false };
    }
  }
  switch (kind) {
    case "maths_arithmetic":
      return { slug: "maths-p1-arithmetic", name: "Mathematics Paper 1: arithmetic", subjectId: "mathematics", totalMarks: 25, timeMinutes: 20, timeApproximate: true };
    case "maths_reasoning":
      return { slug: `maths-p${n ?? 2}-reasoning`, name: `Mathematics Paper ${n ?? 2}: reasoning`, subjectId: "mathematics", totalMarks: 35, timeMinutes: 35, timeApproximate: true };
    case "gps_spelling":
      return { slug: `gps-p${n ?? 1}-spelling`, name: `English grammar, punctuation and spelling Paper ${n ?? 1}: spelling`, subjectId: "english", totalMarks: 20, timeMinutes: 15, timeApproximate: true };
    case "gps_questions":
      return { slug: `gps-p${n ?? 2}-questions`, name: `English grammar, punctuation and spelling Paper ${n ?? 2}: questions`, subjectId: "english", totalMarks: 20, timeMinutes: 20, timeApproximate: true };
    case "reading_answer": {
      const p = n ?? (combined ? 1 : 2);
      return { slug: `reading-p${p}`, name: `English reading Paper ${p}`, subjectId: "english", totalMarks: 20, timeMinutes: p === 1 ? 30 : 40, timeApproximate: true };
    }
  }
}

export const paperCode = (ks: KeyStage, year: number, slug: string) => `${ks}-${year}-${slug}`;

// ---------------------------------------------------------------- manifest
export interface ManifestEntry {
  year: number;
  kind: DocKind;
  subject: Subject | null;
  paper_number: number | null;
  combined?: boolean;
  title: string;
  url: string;
  publication: string;
  publication_title: string;
}

export interface Manifest {
  source_id: string;
  key_stage: KeyStage;
  collection_url: string;
  generated_at: string;
  entries: ManifestEntry[];
}

export const MANIFEST_DIR = path.join(ROOT, "data", "sta");
export const manifestPath = (ks: KeyStage, dir = MANIFEST_DIR) => path.join(dir, `manifest-${ks}.json`);

export function readManifest(ks: KeyStage, dir = MANIFEST_DIR): Manifest | null {
  const f = manifestPath(ks, dir);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as Manifest) : null;
}

export function writeManifest(m: Manifest, dir = MANIFEST_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const sorted = { ...m, entries: [...m.entries].sort((a, b) => a.year - b.year || a.url.localeCompare(b.url)) };
  fs.writeFileSync(manifestPath(m.key_stage, dir), JSON.stringify(sorted, null, 1) + "\n");
}

/** Year and key stage of a per-year test-materials publication, or null if it is something else. */
export function publicationInfo(title: string, basePath: string): { ks: KeyStage; year: number } | null {
  const s = `${title} ${basePath}`.toLowerCase().replace(/-/g, " ");
  const ks = s.match(/key stage ([12])\b/);
  const y = s.match(/\b(20[1-3]\d)\b/);
  if (!ks || !y) return null;
  if (!/test materials|tests?:|past papers?/.test(s)) return null;
  return { ks: `ks${ks[1]}` as KeyStage, year: Number(y[1]) };
}

export type ContentGetter = (basePath: string) => Promise<GovukContent>;

/**
 * Walk the collection and every per-year publication for the key stage. KS2: 2016 onwards (no tests
 * in 2020/2021). KS1: 2016-2023 (optional from 2024; whatever is published is ingested).
 */
export async function discover(ks: KeyStage, get: ContentGetter = getContent, sourceId = `sta_${ks}`): Promise<Manifest> {
  const col = await get(COLLECTION_PATH);
  const docs = collectionDocuments(col);
  const entries: ManifestEntry[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    const info = publicationInfo(d.title, d.base_path);
    if (!info || info.ks !== ks || info.year < 2016) continue;
    if (info.year === 2020 || info.year === 2021) continue; // tests cancelled (COVID-19)
    const pub = await get(d.base_path);
    for (const a of attachments(pub)) {
      if (a.content_type && !/pdf/i.test(a.content_type) && !/\.pdf($|\?)/i.test(a.url)) continue;
      if (seen.has(a.url)) continue;
      seen.add(a.url);
      const c = classifyAttachment(a.title, pub.title);
      if (c.kind === "ignore") continue;
      entries.push({
        year: info.year,
        kind: c.kind,
        subject: c.subject,
        paper_number: c.paperNumber,
        ...(c.combined ? { combined: true } : {}),
        title: a.title,
        url: a.url,
        publication: pageUrl(d.base_path),
        publication_title: pub.title,
      });
    }
  }
  return { source_id: sourceId, key_stage: ks, collection_url: pageUrl(COLLECTION_PATH), generated_at: now(), entries };
}

export const PAPER_KINDS: PaperKind[] = ["maths_arithmetic", "maths_reasoning", "gps_questions", "gps_spelling", "reading_answer"];
export const isPaperKind = (k: DocKind): k is PaperKind => (PAPER_KINDS as string[]).includes(k);
export const subjectForKind = (k: PaperKind): Subject => (k.startsWith("maths") ? "maths" : k.startsWith("gps") ? "gps" : "reading");
