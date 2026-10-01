// Preview mode (PREVIEW_MODE=1): an anonymous visitor can browse every screen, but never reaches the real back office.
// Usage: node scripts/e2e-preview.mjs [baseUrl]
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://localhost:3104";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const text = async () => (await p.locator("body").innerText());

await p.goto(`${BASE}/dashboard`); ok(/Alex's dashboard/.test(await text()), "dashboard shows the preview learner");
ok(/Preview mode/.test(await text()), "preview banner shown");
ok(/Questions answered/i.test(await text()), "dashboard has real numbers");
await p.getByRole("button", { name: "Child" }).click(); await p.waitForURL("**/me"); await p.getByRole("heading", { name: /Hi Alex/ }).waitFor(); ok(true, "child home");
await p.getByRole("button", { name: "Admin" }).click(); await p.waitForURL("**/overview"); await p.getByRole("heading", { name: "Back office overview" }).waitFor(); ok(/Back office overview/.test(await text()) && !/@/.test((await text()).replace(/support@mylearn\.works/g, "")), "overview shows totals only, no emails");
for (const path of ["/admin", "/admin/redemptions", "/admin/review", "/api/admin/export?table=parents"]) {
  const r = await p.goto(`${BASE}${path}`); const t = await text();
  ok(!/Redemptions|Review queue|Dataset totals|mailing/i.test(t) || /Log in/.test(t) && !/Dataset totals/.test(t), `${path} must not expose the back office (got: ${t.slice(0, 80).replace(/\n/g, " ")})`);
  ok(r.status() !== 200 || !/Dataset totals|Signed in as/.test(t), `${path} leaked admin content`);
}
await p.goto(`${BASE}/books/y8maths/y8maths-u01`); ok(/Start practice|Choose a learner/.test(await text()), "every book is open in preview");
await p.goto(`${BASE}/`); ok(/Log in/.test(await text()) && !/Open dashboard/.test(await text()), "homepage header shows Log in, not Open dashboard");
await b.close();
console.log(fails.length ? "FAILED:\n - " + fails.join("\n - ") : "preview mode ok");
process.exit(fails.length ? 1 : 0);
