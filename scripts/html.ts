/** Tiny helpers for self-contained, light-only HTML reports (no external URLs, no scripts that store data). */
export const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#f2f3f5;color:#1d2330;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:1000px;margin:0 auto;padding:16px}
h1{font-size:1.6rem;margin:8px 0 4px}h2{font-size:1.15rem;margin:0 0 8px}h3{font-size:1rem;margin:12px 0 6px}
.sub{color:#5b6474;margin:0 0 16px}
.card{background:#fff;border:1px solid #e3e6eb;border-radius:16px;padding:16px;margin:0 0 14px;box-shadow:0 1px 2px rgba(20,30,50,.05)}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.stat{background:#f8f9fb;border:1px solid #e3e6eb;border-radius:12px;padding:10px}
.stat b{display:block;font-size:1.35rem}
.stat span{color:#5b6474;font-size:.8rem}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:.86rem}
th,td{border-bottom:1px solid #e3e6eb;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f8f9fb;font-weight:600;position:sticky;top:0}
td.n,th.n{text-align:right;white-space:nowrap}
.pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:.75rem;background:#eef0f4;color:#3b4454;white-space:nowrap}
.ok{background:#e5f5ec;color:#1f7a45}.warn{background:#fdf3dc;color:#8a5a00}.bad{background:#fbe9e7;color:#b0362c}.info{background:#e8eefc;color:#2a50b8}
.h0{background:#fbe9e7}.h1{background:#fdf3dc}.h2{background:#eef7e9}.h3{background:#dff2e6}
nav.links{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
nav.links a{background:#fff;border:1px solid #e3e6eb;border-radius:999px;padding:6px 12px;color:#2f5bd3;text-decoration:none;font-size:.85rem}
a{color:#2f5bd3}
ul{padding-left:20px}li{margin:3px 0}
.muted{color:#5b6474}.small{font-size:.8rem}
code{background:#f3f4f7;border-radius:6px;padding:1px 5px;font-size:.85em;word-break:break-all}
details{margin:6px 0}summary{cursor:pointer;font-weight:600}
`;

export function page(title: string, body: string, nav?: Array<[string, string]>) {
  const links = nav ? `<nav class="links">${nav.map(([h, t]) => `<a href="${esc(h)}">${esc(t)}</a>`).join("")}</nav>` : "";
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${links}${body}</main></body></html>`;
}

export const card = (title: string, inner: string, id?: string) => `<section class="card"${id ? ` id="${esc(id)}"` : ""}>${title ? `<h2>${esc(title)}</h2>` : ""}${inner}</section>`;

export function table(headers: string[], rows: unknown[][], numericCols: number[] = []) {
  return `<div class="scroll"><table><thead><tr>${headers.map((h, i) => `<th${numericCols.includes(i) ? ' class="n"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${numericCols.includes(i) ? ' class="n"' : ""}>${typeof c === "object" && c && "html" in (c as object) ? (c as { html: string }).html : esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}
export const raw = (html: string) => ({ html });
export const pill = (text: string, tone: "ok" | "warn" | "bad" | "info" | "" = "") => raw(`<span class="pill ${tone}">${esc(text)}</span>`);
export const stats = (items: Array<[string, unknown]>) => `<div class="grid">${items.map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>`;
export const heat = (pct: number) => (pct >= 90 ? "h3" : pct >= 60 ? "h2" : pct >= 30 ? "h1" : "h0");
export const fmtN = (n: number) => n.toLocaleString("en-GB");
