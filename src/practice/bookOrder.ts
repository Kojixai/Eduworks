// The order books appear in everywhere: youngest first (Year 3, then Year 6, KS3, then GCSE).
// Books that are not listed here still appear, after these, in alphabetical order of their id.
// macbeth, aic and y3reading are listed already, so adding them is just copying their files into content/.
export const BOOK_ORDER = [
  "y3maths",       // Year 3
  "y3reading",     // Year 3
  "ks2reading10",  // Year 6 (KS2)
  "ks3english",    // Years 7 to 9 (KS3)
  "y8maths",       // Year 8 (KS3)
  "gcse_englang",  // GCSE (KS4)
  "macbeth",       // GCSE text
  "aic",           // GCSE text
];

export function bookRank(id: string): number {
  const i = BOOK_ORDER.indexOf(id);
  return i === -1 ? BOOK_ORDER.length : i;
}

export function compareBookIds(a: string, b: string): number {
  return bookRank(a) - bookRank(b) || a.localeCompare(b);
}
