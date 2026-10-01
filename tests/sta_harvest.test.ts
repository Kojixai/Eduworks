/**
 * Regression tests for the layouts of the real 2024-2026 STA publications (small synthetic samples that mimic
 * what PyMuPDF returns for them; the real files are fetched by `npm run ingest`, never committed).
 */
import { describe, expect, it } from "vitest";
import { computeQuestion } from "../ingest/sources/sta_papers_arith";
import { classifyAttachment } from "../ingest/sources/sta_papers_discovery";
import {
  applyDomainTable,
  isCrownOnly,
  itemsFromRows,
  parseCopyrightHtml,
  parseDomainTable,
  parseMarkScheme,
  rowsForPaper,
  thirdPartyFor,
  type LinesDoc,
  type PLine,
  type PWord,
} from "../ingest/sources/sta_papers_pdf";
import { copyrightFor } from "../ingest/sources/sta_papers";
import { mergeWordLists, type ExtractedWord } from "../ingest/sources/sta_phonics";

/** A line from [text, x0] pairs at a y position. */
function line(y: number, cells: Array<[string, number]>, o: { bold?: boolean; size?: number } = {}): PLine {
  const words: PWord[] = cells.map(([text, x0]) => ({ x0, y0: y, x1: x0 + text.length * 5, y1: y + 12, text, bold: !!o.bold, size: o.size ?? 11 }));
  return { x0: words[0].x0, y0: y, x1: words[words.length - 1].x1, y1: y + 12, text: cells.map((c) => c[0]).join(" "), bold: !!o.bold, size: o.size ?? 11, words };
}
const doc = (...pages: PLine[][]): LinesDoc => ({
  page_count: pages.length,
  pages: pages.map((lines, i) => ({ page: i + 1, width: 595, height: 842, lines })),
});

describe("attachment classification (2024+ titles)", () => {
  const kind = (t: string) => classifyAttachment(t).kind;
  it("never mistakes 'administering' guidance for a question paper", () => {
    expect(kind("2024 key stage 2 mathematics - administering Paper 1: arithmetic")).toBe("ignore");
    expect(kind("2025 key stage 2 English reading – administering the reading booklet and reading answer booklet")).toBe("ignore");
    expect(kind("2024 key stage 2 mathematics Paper 1: arithmetic")).toBe("maths_arithmetic");
  });
  it("keeps the administering document for the spelling paper as the spelling script", () => {
    expect(kind("2024 key stage 2 English grammar, punctuation and spelling - administering Paper 2: spelling")).toBe("spelling_script");
  });
});

describe("mark scheme tables as printed in 2024-2026", () => {
  const header = line(77, [["Qu.", 34], ["Requirement", 66], ["Mark", 306], ["Additional", 349], ["guidance", 405]], { bold: true });
  const d = doc([
    line(64, [["7.", 28], ["Mark", 51], ["schemes", 70], ["for", 100], ["Paper", 120], ["1:", 150], ["arithmetic", 165]], { bold: true, size: 22 }),
    header,
    line(102, [["1", 37], ["6,456", 66], ["1m", 311]]),
    // a 2-mark row whose requirement line contains the words "answer" and "marks" must not be taken for a table header
    line(130, [["2", 37], ["Award", 66], ["TWO", 100], ["marks", 129], ["for", 162], ["the", 178], ["correct", 197], ["answer", 234], ["Up", 305], ["to", 323]]),
    line(144, [["of", 66], ["19,648", 78], ["2m", 311]]),
    // worked example numbers inside the guidance column of row 14 are not question rows
    line(160, [["25248", 105]]),
    line(175, [["88358", 105], ["(error)", 140]]),
    line(200, [["3", 37], ["500", 66], ["1m", 311]]),
    line(230, [["4", 37], ["26.7", 66], ["1m", 311]]),
  ]);
  const rows = parseMarkScheme(d);
  it("reads sectioned rows with their marks and ignores stray numbers", () => {
    expect(rows.map((r) => `${r.sectionPaper}:${r.number}:${r.marks}`)).toEqual(["1:1:1", "1:2:2", "1:3:1", "1:4:1"]);
    expect(rows[1].requirement).toContain("19,648");
  });
  it("keeps the rows of each paper apart", () => {
    expect(rowsForPaper(rows, 1)).toHaveLength(4);
    expect(rowsForPaper(rows, 2)).toHaveLength(0);
  });
});

describe("content domain coverage table", () => {
  const d = doc([
    line(111, [["Table", 57], ["1:", 90], ["Content", 105], ["domain", 150], ["coverage", 190]], { bold: true }),
    line(188, [["Qu.", 74], ["Qu.", 232], ["Qu.", 400]]),
    line(211, [["1", 80], ["3C2", 117], ["1", 238], ["4G2c/5P2", 270], ["1", 404], ["3F2", 440]]),
    line(226, [["10a", 77], ["4C7", 117], ["2", 238], ["3M9a/3C1", 270], ["10b", 404], ["3M7", 440]]),
  ]);
  it("maps question numbers to references per paper", () => {
    const t = parseDomainTable(d);
    expect(t.get(1)?.get("1")).toBe("3C2");
    expect(t.get(2)?.get("1")).toBe("4G2c/5P2");
    expect(t.get(3)?.get("10b")).toBe("3M7");
  });
  it("fills domains on mark scheme rows, primary reference first", () => {
    const rows = [
      { sectionPaper: 2, number: "1", base: "1", domain: null },
      { sectionPaper: 1, number: "10a", base: "10", domain: null },
    ] as any[];
    applyDomainTable(rows, new Map([[2, new Map([["1", "4G2c/5P2"]])], [1, new Map([["10a", "4C7"]])]]));
    expect(rows.map((r) => r.domain)).toEqual(["4G2c", "4C7"]);
  });
});

describe("two stacked question numbers in one narrow cell (spelling tables)", () => {
  it("rebuilds '4/5' as questions 4 and 5, with their stacked marks", () => {
    const d = doc([
      line(65, [["6.", 28], ["Mark", 51], ["schemes", 80], ["for", 120], ["Paper", 140], ["1:", 170], ["spelling", 190]], { bold: true, size: 22 }),
      line(181, [["Qu.", 35], ["Spelling", 71], ["M.", 132], ["Primary", 193]], { bold: true }),
      line(208, [["live", 71], ["1", 124], ["S4", 160], ["–", 175], ["the", 183]]),
      line(218, [["1/2", 29], ["1/1", 124]], { bold: true }),
      line(227, [["tall", 71], ["1", 124], ["S1", 160], ["–", 175]]),
    ]);
    const rows = parseMarkScheme(d);
    expect(rows.map((r) => [r.number, r.requirement, r.marks, r.domain])).toEqual([
      ["1", "live", 1, "S4"],
      ["2", "tall", 1, "S1"],
    ]);
  });
});

describe("copyright reports: rows, Crown copyright and third parties", () => {
  const rows = [
    { heading: "Key stage 2 English reading test material", cells: ["Text title", "Page(s)", "Description", "Reference / Copyright owner"] },
    { heading: "Key stage 2 English reading test material", cells: ["Front cover", "1, 4", "Image of a chess player", "Credit: David Johnson / Keith Furr"] },
    { heading: "Key stage 2 English reading test material", cells: ["In the Cave", "6, 7", "Illustrations", "Crown Copyright Commissioned by STA"] },
    { heading: "Key stage 2 English reading test material", cells: ["Longbow Girl", "8, 9", "Text", "Source: Excerpt from Longbow Girl Credit: Copyright © Linda Davies, 2015"] },
    { heading: "Key stage 2 English reading test material", cells: ["Modified large print version", "", "", ""] },
    { heading: "Key stage 2 English reading test material", cells: ["A Life-Changing Game", "24pt version, page 5.", "Photo", "Credit: Getty Images"] },
  ];
  const items = itemsFromRows(rows);
  it("ignores the header, Crown-only rows and modified-version rows", () => {
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.subject === "reading")).toBe(true);
    expect(items[0].pages).toEqual([1, 4]);
  });
  it("applies a reading report to reading only: maths and GPS stay clean", () => {
    expect(thirdPartyFor(items, "maths", 1).whole).toBe(false);
    expect(thirdPartyFor(items, "gps", 1).notes).toEqual([]);
    expect(thirdPartyFor(items, "reading", null, true).whole).toBe(true);
  });
  it("tells Crown-only owners from mixed ones", () => {
    expect(isCrownOnly("Crown Copyright Commissioned by the Standards and Testing Agency (STA)")).toBe(true);
    expect(isCrownOnly("Crown copyright. Credit: Alamy Stock Photo")).toBe(false);
    expect(isCrownOnly("Credit: Getty Images")).toBe(false);
  });
  it("parses the GOV.UK HTML version (2024) with its 'no third-party material' section", () => {
    const html = `<h2 id="a">Key stage 2 English reading test material</h2>
      <table><thead><tr><th>Text title</th><th>Page(s)</th><th>Description</th><th>Reference / Copyright owner</th></tr></thead>
      <tbody><tr><td>The Leopard</td><td>10 and 11</td><td>Text</td><td>The Leopard - Ruskin Bond, Penguin Books, 2016</td></tr>
      <tr><td>The Leopard</td><td>10</td><td>Illustration</td><td>Crown Copyright Commissioned by STA</td></tr></tbody></table>
      <h2 id="b">Key stage 2 mathematics and English grammar, punctuation and spelling tests</h2>
      <p>There is no third-party material in the KS2 mathematics and English grammar, punctuation and spelling tests.</p>`;
    const r = parseCopyrightHtml(html);
    expect(r.tables).toBe(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ subject: "reading", pages: [10, 11] });
    expect(thirdPartyFor(r.items, "maths", 1).whole).toBe(false);
  });
  it("picks the report published with the paper's own subject", () => {
    const e = (subject: any, url: string) => ({ kind: "copyright_report", subject, url }) as any;
    expect(copyrightFor([e("reading", "r"), e("maths", "m")], "maths")?.url).toBe("m");
    expect(copyrightFor([e("reading", "r")], "gps")?.url).toBe("r");
  });
});

describe("arithmetic text layer quirks", () => {
  it("reads STA's { and } operator glyphs as multiplication and division", () => {
    expect(computeQuestion("72 } 3 =")?.value.toString()).toBe("24");
    expect(computeQuestion("23 { 6 =")?.value.toString()).toBe("138");
  });
  it("refuses to verify a question whose parts were not read in order", () => {
    expect(computeQuestion("3\n2 + 3 =")).toBeNull();
  });
  it("reads mixed numbers", () => {
    expect(computeQuestion("2 3/8 − 5/8 =")?.value.toString()).toBe("7/4");
  });
});

describe("phonics pseudo-words from the scoring guidance table", () => {
  const word = (w: string, n: number): ExtractedWord => ({ section: n <= 20 ? 1 : 2, position: n, word: w, pseudo: null, explicit: false });
  const pseudo = ["dup", "hib", "gox", "ags", "yech", "quog", "loip", "chuss", "clen", "stizz", "pult", "heeft", "jigh", "saunt", "virp", "phope", "sleft", "thresk", "spleg", "strume"];
  const real = ["quiz", "sell", "form", "shark", "snip", "clang", "bunk", "boils", "pie", "found", "boom", "shake", "spelt", "floats", "scrub", "scribe", "delay", "statue", "counter", "grateful"];
  const sheet = [...pseudo.slice(0, 12), ...real.slice(0, 8), ...pseudo.slice(12), ...real.slice(8)].map((w, i) => word(w, i + 1));
  it("flags exactly the listed pseudo-words and accepts them automatically", () => {
    const m = mergeWordLists(sheet, sheet, new Set(pseudo));
    expect(m.words.filter((w) => w.is_pseudo).map((w) => w.word).sort()).toEqual([...pseudo].sort());
    expect(m.words.every((w) => w.review_status === "auto_ok")).toBe(true);
    expect(m.issues).toEqual([]);
  });
  it("sends everything to review if the pseudo-word list is incomplete", () => {
    const m = mergeWordLists(sheet, sheet, new Set(pseudo.slice(0, 19)));
    expect(m.words.every((w) => w.review_status === "needs_review")).toBe(true);
  });
});
