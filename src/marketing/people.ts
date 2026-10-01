import fs from "node:fs";
import path from "node:path";

export interface Person { file: string; width: number; height: number; alt: string }

let cache: Record<string, Person> | null = null;

/** Transparent cut-out photos (public/site/people), described in manifest.json. A missing slot just returns null. */
export function person(slot: string): Person | null {
  if (!cache) {
    try { cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "site", "people", "manifest.json"), "utf8")); }
    catch { cache = {}; }
  }
  const p = cache![slot];
  return p ? { ...p, file: `/site/people/${slot}.png` } : null;
}
