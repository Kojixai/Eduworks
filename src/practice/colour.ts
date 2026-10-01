// Section colour helpers. Section colours come from the content file; text drawn in a section colour is darkened
// until it passes WCAG AA (4.5:1) against both white and the section's pale tint.

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}
function luminance(hex: string): number {
  const c = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
export function mix(hex: string, withHex: string, amount: number): string {
  const a = hexToRgb(hex), b = hexToRgb(withHex);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount));
}
export function tint(hex: string): string {
  return mix(hex, "#ffffff", 0.9);
}
export function textSafe(hex: string, min = 4.6): string {
  let c = hex;
  const t = tint(hex);
  for (let i = 0; i < 30 && (contrast(c, "#ffffff") < min || contrast(c, t) < min); i++) c = mix(c, "#000000", 0.08);
  return c;
}
/** CSS custom properties for a section: --c (brand), --ct (text-safe), --cb (tint background). */
export function sectionVars(hex: string): Record<string, string> {
  const base = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#2360A8";
  return { "--c": base, "--ct": textSafe(base), "--cb": tint(base), "--cbd": mix(base, "#ffffff", 0.7) };
}
