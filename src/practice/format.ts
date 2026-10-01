export function formatPages(p: number[]): string {
  if (p.length === 0) return "";
  const sorted = [...p].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  return contiguous && sorted.length > 1 ? `${sorted[0]} to ${sorted[sorted.length - 1]}` : sorted.join(", ");
}
