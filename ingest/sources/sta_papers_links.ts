/**
 * STA content domain references -> National Curriculum statements.
 *
 * Maths references look like "5F10", "6C9", "3N2b": leading digit = NC year, letter = strand
 * (N number & place value, C calculation, F fractions/decimals/percentages, R ratio & proportion,
 * A algebra, M measurement, G geometry – properties of shape, P geometry – position & direction,
 * S statistics), then the element number within the STA test framework.
 *
 * LIMITATION: the element number (the "10" in 5F10) identifies one row of the STA KS1/KS2 test
 * frameworks ("Key stage 2 mathematics test framework", also published on gov.uk but not yet
 * harvested). Without that table we can only resolve year + sub-strand, so every NC statement of
 * that year and sub-strand is linked with confidence 0.7 and review_status 'needs_review'.
 * Harvesting the framework documents would make these links exact.
 *
 * English: GPS references G1..G7 (grammar and punctuation domains) and S<n> (spelling) and reading
 * references 2a-2h (KS2) / 1a-1e (KS1) are matched to NC English statements by text similarity to a
 * short description of the domain; confidence <= 0.6, always needs_review.
 */
import type { DataStore } from "../../src/lib/db/store";
import type { KeyStage, Subject } from "./sta_papers_discovery";

export const MATHS_STRAND_SUBSTRANDS: Record<string, string[]> = {
  N: ["Number and place value"],
  C: ["Addition and subtraction", "Multiplication and division", "Addition, subtraction, multiplication and division"],
  F: ["Fractions", "Fractions (including decimals)", "Fractions (including decimals and percentages)"],
  R: ["Ratio and proportion"],
  A: ["Algebra"],
  M: ["Measurement"],
  G: ["Properties of shape"],
  P: ["Position and direction"],
  S: ["Statistics"],
};

export interface MathsDomain {
  ref: string;
  year: number;
  strand: string;
  element: number;
  sub: string | null;
}

export function parseMathsDomain(ref: string): MathsDomain | null {
  const m = ref.trim().match(/^([1-6])([NCFRAMGPS])(\d{1,2})([a-z]?)$/);
  if (!m) return null;
  return { ref, year: Number(m[1]), strand: m[2], element: Number(m[3]), sub: m[4] || null };
}

/** Narrow calculation (C) references by the operation in the question where possible. */
export function substrandsFor(d: MathsDomain, questionText = ""): string[] {
  const all = MATHS_STRAND_SUBSTRANDS[d.strand] ?? [];
  if (d.strand !== "C") return all;
  const add = /[+\-−]/.test(questionText);
  const mul = /[×÷]/.test(questionText);
  if (add && !mul) return [all[0], all[2]];
  if (mul && !add) return [all[1], all[2]];
  return all;
}

export const GPS_DOMAINS: Record<string, string> = {
  G1: "grammatical terms word classes noun verb adjective adverb preposition determiner pronoun conjunction",
  G2: "functions of sentences statement question command exclamation",
  G3: "combining words phrases clauses expanded noun phrases subordinate relative clauses conjunctions",
  G4: "verb forms tenses consistency past present perfect progressive modal verbs passive",
  G5: "punctuation capital letters full stops question marks commas inverted commas speech apostrophes possession colon semicolons dashes hyphens brackets parenthesis bullet points",
  G6: "vocabulary synonyms antonyms prefixes suffixes word families",
  G7: "standard english formality formal speech writing subjunctive",
  S: "spell spelling words prefixes suffixes homophones",
};
export const READING_DOMAINS: Record<string, string> = {
  "1a": "draw on knowledge of vocabulary to understand texts",
  "1b": "identify explain key aspects of fiction and non-fiction texts characters events titles information",
  "1c": "identify explain sequences of events in texts",
  "1d": "make inferences from the text",
  "1e": "predict what might happen on the basis of what has been read so far",
  "2a": "give explain the meaning of words in context vocabulary",
  "2b": "retrieve record information identify key details from fiction non-fiction",
  "2c": "summarise main ideas from more than one paragraph",
  "2d": "make inferences from the text explain justify inferences with evidence",
  "2e": "predict what might happen from details stated and implied",
  "2f": "identify explain how information narrative content is related and contributes to meaning as a whole",
  "2g": "identify explain how meaning is enhanced through choice of words and phrases",
  "2h": "make comparisons within the text",
};

const STOP = new Set("the and for with from that this their them they are was were has have how what which who use using into can will its our your not all any".split(" "));
export function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[‘’']/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .map((w) => (w.length > 4 ? w.replace(/(ing|es|s)$/, "") : w))
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}
export function similarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return a.size && b.size ? inter / Math.sqrt(a.size * b.size) : 0;
}

interface StatementRow {
  id: string;
  text: string;
  sub_strand: string | null;
  year_groups_json: string | null;
}

export interface LinkResult {
  statement_id: string;
  confidence: number;
}

export class DomainLinker {
  private cache = new Map<string, StatementRow[]>();
  constructor(private store: DataStore) {}

  private async statements(subject: string, ks: string, subs: string[]): Promise<StatementRow[]> {
    const key = `${subject}|${ks}|${subs.join(";")}`;
    let rows = this.cache.get(key);
    if (!rows) {
      rows = await this.store.select<StatementRow>("curriculum_statements", {
        where: { subject_id: subject, key_stage_id: ks, level: "statement", framework: "nc2014", sub_strand: subs },
        columns: ["id", "text", "sub_strand", "year_groups_json"],
        orderBy: [["sort", "asc"], ["id", "asc"]],
      });
      this.cache.set(key, rows);
    }
    return rows;
  }

  /** Maths: all statements of the reference's year and sub-strand (0.7, needs_review). */
  async maths(ref: string, questionText = ""): Promise<LinkResult[]> {
    const d = parseMathsDomain(ref);
    if (!d) return [];
    const ks = d.year <= 2 ? "ks1" : "ks2";
    const yg = `y${d.year}`;
    const rows = await this.statements("mathematics", ks, substrandsFor(d, questionText));
    return rows
      .filter((r) => {
        try {
          return (JSON.parse(r.year_groups_json ?? "[]") as string[]).includes(yg);
        } catch {
          return false;
        }
      })
      .map((r) => ({ statement_id: r.id, confidence: 0.7 }));
  }

  /** English GPS / reading: best text-similarity matches (<= 0.6, needs_review). */
  async english(ref: string, ks: KeyStage, subject: Subject, questionText = "", maxLinks = 2): Promise<LinkResult[]> {
    let desc: string | undefined;
    let subs: string[];
    if (subject === "reading") {
      desc = READING_DOMAINS[ref];
      subs = ["Comprehension"];
    } else {
      const g = ref.match(/^G(\d)/);
      if (g) {
        desc = GPS_DOMAINS[`G${g[1]}`];
        subs = ["Vocabulary Grammar Punctuation"];
      } else if (/^S\d+/.test(ref)) {
        desc = GPS_DOMAINS.S;
        subs = ["Transcription"];
      } else return [];
    }
    if (!desc) return [];
    const q = tokens(`${desc} ${desc} ${questionText}`);
    const rows = await this.statements("english", ks, subs);
    return rows
      .map((r) => ({ r, s: similarity(q, tokens(r.text)) }))
      .filter((x) => x.s >= 0.12)
      .sort((a, b) => b.s - a.s)
      .slice(0, maxLinks)
      .map((x) => ({ statement_id: x.r.id, confidence: Math.round(Math.min(0.6, 0.3 + x.s) * 100) / 100 }));
  }
}
