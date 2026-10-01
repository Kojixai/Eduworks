import "server-only";
import fs from "node:fs";
import path from "node:path";
import { allBooks } from "@/lib/practice";

export interface CardBook {
  id: string;
  title: string;
  pill: string;
  topics: number;
  questions: number;
  /** Public path of the picture: a licensed photo if public/site/books/<id>.jpg exists, otherwise the designed SVG cover. */
  image: string;
  isPhoto: boolean;
}
export interface BookSection { books: CardBook[]; topics: number; questions: number }

const siteDir = path.join(process.cwd(), "public", "site");

function imageFor(id: string): { image: string; isPhoto: boolean } {
  if (/^[a-z0-9_-]+$/i.test(id) && fs.existsSync(path.join(siteDir, "books", `${id}.jpg`))) return { image: `/site/books/${id}.jpg`, isPhoto: true };
  return { image: `/site/covers/${id}.webp`, isPhoto: false };
}

/** Real titles and counts from the database. Returns an empty list (and the page degrades gracefully) if it cannot be read. */
export async function loadBooks(): Promise<BookSection> {
  try {
    const all = await allBooks(true);
    const books = all.map<CardBook>((b) => ({
      id: b.meta.id,
      title: b.meta.title,
      pill: `${b.meta.keyStage} · ${b.meta.year}`,
      topics: b.units.length,
      questions: b.units.reduce((n, u) => n + u.questionCount, 0),
      ...imageFor(b.meta.id),
    }));
    return { books, topics: books.reduce((n, b) => n + b.topics, 0), questions: books.reduce((n, b) => n + b.questions, 0) };
  } catch {
    return { books: [], topics: 0, questions: 0 };
  }
}

/** Cache-busting stamp for the static files, taken from their modified time. */
export function assetStamp(rel: string): string {
  try { return String(Math.floor(fs.statSync(path.join(siteDir, rel)).mtimeMs / 1000)); } catch { return "0"; }
}
