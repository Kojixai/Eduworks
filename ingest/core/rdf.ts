import fs from "node:fs";
import { Parser } from "n3";

export const NS = {
  curric: "https://w3id.org/uk/oak/curriculum/ontology/",
  nat: "https://w3id.org/uk/oak/curriculum/nationalcurriculum/",
  oak: "https://w3id.org/uk/oak/curriculum/oakcurriculum/",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  schema: "http://schema.org/",
  dcterms: "http://purl.org/dc/terms/",
};

export const TYPE = NS.rdf + "type";
export const LABEL = NS.rdfs + "label";
export const PREF = NS.skos + "prefLabel";
export const c = (local: string) => NS.curric + local;

/** Minimal in-memory triple index: subject -> predicate -> objects (IRIs or literal strings). */
export class TripleIndex {
  private spo = new Map<string, Map<string, string[]>>();
  private byType = new Map<string, string[]>();
  readonly fileOf = new Map<string, string>();
  size = 0;

  loadFile(file: string) {
    const text = fs.readFileSync(file, "utf8");
    const quads = new Parser({ format: "text/turtle" }).parse(text);
    for (const q of quads) {
      const s = q.subject.value;
      const p = q.predicate.value;
      const o = q.object.value;
      let pm = this.spo.get(s);
      if (!pm) {
        pm = new Map();
        this.spo.set(s, pm);
        this.fileOf.set(s, file);
      }
      const arr = pm.get(p);
      if (arr) arr.push(o);
      else pm.set(p, [o]);
      if (p === TYPE) {
        const t = this.byType.get(o);
        if (t) t.push(s);
        else this.byType.set(o, [s]);
      }
      this.size++;
    }
  }

  ofType(t: string): string[] {
    return [...new Set(this.byType.get(t) ?? [])];
  }
  all(s: string, p: string): string[] {
    return this.spo.get(s)?.get(p) ?? [];
  }
  one(s: string, p: string): string | undefined {
    return this.all(s, p)[0];
  }
  label(s: string): string {
    return clean(this.one(s, LABEL) ?? this.one(s, PREF) ?? this.one(s, NS.schema + "name") ?? local(s));
  }
  has(s: string) {
    return this.spo.has(s);
  }
}

export const local = (iri: string) => iri.slice(Math.max(iri.lastIndexOf("/"), iri.lastIndexOf("#")) + 1);

/** Collapse the hard line-wraps used inside Turtle long literals. */
export function clean(s: string): string {
  return s
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Keeps paragraph breaks (blank lines) but unwraps single line breaks. */
export function cleanParagraphs(s: string): string {
  return s
    .split(/\n\s*\n/)
    .map((p) => clean(p))
    .filter(Boolean)
    .join("\n\n");
}
