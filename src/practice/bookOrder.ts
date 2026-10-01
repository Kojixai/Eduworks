// The order books appear in on the home page, the parent area and the learner home.
// Books that are not listed here still appear, after these, in alphabetical order of their id.
// macbeth, aic and y3reading are listed already, so adding them is just copying their files into content/.
export const BOOK_ORDER = [
  "y3maths",
  "y8maths",
  "ks2reading10",
  "ks3english",
  "gcse_englang",
  "y3reading",
  "macbeth",
  "aic",
];

export function bookRank(id: string): number {
  const i = BOOK_ORDER.indexOf(id);
  return i === -1 ? BOOK_ORDER.length : i;
}

export function compareBookIds(a: string, b: string): number {
  return bookRank(a) - bookRank(b) || a.localeCompare(b);
}
