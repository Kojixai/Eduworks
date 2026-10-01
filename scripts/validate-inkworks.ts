/** Validates every Inkworks bank in content/inkworks against the schema. `npm run validate:inkworks` */
import fs from "node:fs";
import path from "node:path";
import { validateBook } from "../src/practice/validate";

const dir = path.join(process.cwd(), "content", "inkworks");
let bad = 0, units = 0, questions = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const book = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const r = validateBook(book, f);
  const u = book.units.length, q = book.units.reduce((n: number, x: { questions: unknown[] }) => n + x.questions.length, 0);
  units += u; questions += q;
  console.log(`${r.errors.length ? "FAIL" : "ok  "} ${f.padEnd(22)} ${String(u).padStart(3)} units ${String(q).padStart(4)} questions  ${r.errors.length} errors ${r.warnings.length} warnings`);
  r.errors.slice(0, 5).forEach((e: string) => console.log("   ", e));
  if (r.errors.length) bad++;
}
console.log(`\n${units} units, ${questions} questions, ${bad} failing books`);
process.exit(bad ? 1 : 0);
