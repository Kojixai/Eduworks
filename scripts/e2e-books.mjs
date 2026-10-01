// Journey test for the merged site: sign up with a demo code, add a learner, then complete one unit in each of the 8 books
// (every question type), with a couple of wrong answers to exercise the retry and mistakes screens.
// Usage: node scripts/e2e-books.mjs [baseUrl] [outDir]   (server must run with demo codes allowed, i.e. not production)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = process.argv[3] ?? "test-shots/books";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const load = (id) => JSON.parse(fs.readFileSync(path.join("content", "inkworks", `${id}.json`), "utf8"));
const VISITS = [
  ["y3maths", "y3maths-u54"], ["y8maths", "y8maths-u37"], ["ks2reading10", "ks2reading10-u23"], ["ks3english", "ks3english-u06"],
  ["gcse_englang", "gcse_englang-u10"], ["y3reading", "y3reading-u03"], ["macbeth", "macbeth-u12"], ["aic", "aic-u20"],
];
const demoCode = (id) => "DEMO-" + id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
const errors = [];
let n = 0;

async function answer(page, q, plan) {
  switch (q.type) {
    case "mcq": await page.getByTestId(`opt-${plan === "right" ? q.answer : (q.answer + 1) % q.options.length}`).click(); break;
    case "multi":
      for (const i of plan === "right" ? q.answer : [q.answer[0]]) await page.getByTestId(`opt-${i}`).click();
      if (plan === "wrong" && q.answer.length === 1) await page.getByTestId(`opt-${(q.answer[0] + 1) % q.options.length}`).click();
      break;
    case "numeric": await page.getByTestId("answer-input").fill(plan === "right" ? String(q.answer) : String(q.answer + 1)); break;
    case "text": await page.getByTestId("answer-input").fill(plan === "right" ? q.answer.toUpperCase() + "." : "wrong"); break;
    case "order": {
      const target = plan === "right" ? q.items : [...q.items].reverse();
      for (let i = 0; i < target.length; i++) for (;;) {
        const texts = await page.locator(".order-item .txt").allInnerTexts();
        const cur = texts.findIndex((t) => t.trim() === target[i].trim());
        if (cur <= i) break;
        await page.getByTestId(`order-item-${cur}`).locator("[data-up]").click();
      }
      break;
    }
    case "match":
      for (let i = 0; i < q.pairs.length; i++) await page.getByTestId(`match-${i}`).selectOption({ label: q.pairs[plan === "right" ? i : (i + 1) % q.pairs.length][1] });
      break;
    case "truefalse":
      for (let i = 0; i < q.statements.length; i++) await page.getByTestId(`tf-${i}-${(plan === "right" ? q.statements[i].a : true) ? "t" : "f"}`).click();
      if (plan === "wrong" && q.statements.every((s) => s.a)) await page.getByTestId("tf-0-f").click();
      break;
    case "cloze": for (let i = 0; i < q.answer.length; i++) await page.getByTestId(`gap-${i}`).fill(plan === "right" ? q.answer[i] : "xyz"); break;
    case "extended":
      await page.getByTestId("extended-input").fill("The writer builds tension by slowing the pace, then uses a short sentence to shock.");
      await page.getByTestId("check").click();
      for (let i = 0; i < q.checklist.length - (plan === "right" ? 0 : 1); i++) await page.getByTestId(`self-${i}`).check();
      await page.getByTestId("check").click(); // "Save my mark"
      break;
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`console ${m.text()}`));
const shot = async (name) => page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`), fullPage: true });
const email = `e2e${Date.now()}@example.com`;

// sign up with the first book, order number left blank
await page.goto(`${BASE}/signup`);
await page.getByLabel("Book code").fill(demoCode("y3maths"));
await page.getByLabel("Your name").fill("Jo Bell");
await page.getByLabel("Email", { exact: true }).fill(email);
await page.getByLabel("Password").fill("a long family password");
await page.getByLabel(/I am 18 or over/).check();
await page.getByLabel(/I agree to the/).check();
await shot("signup");
await page.getByRole("button", { name: "Unlock my book" }).click();
await page.waitForURL("**/home?welcome=1");

// add the other books on the same account
for (const [b] of VISITS.slice(1)) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Book code").fill(demoCode(b));
  await page.getByLabel("Your name").fill("Jo Bell");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill("a long family password");
  await page.getByLabel(/I am 18 or over/).check();
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Unlock my book" }).click();
  await page.waitForURL("**/home?added=1");
}
await page.goto(`${BASE}/home`);
await page.getByLabel(/First name/i).fill("Sam");
await page.locator("select").first().selectOption({ index: 6 });
await page.getByRole("button", { name: /Add/i }).first().click();
await page.waitForTimeout(800);
await shot("home-after-add-child");

let sessions = 0;
for (const [book, unitId] of VISITS) {
  const bank = load(book);
  const unit = bank.units.find((u) => u.id === unitId);
  await page.goto(`${BASE}/books/${book}/${unitId}`);
  await page.getByRole("heading", { name: unit.title, level: 1 }).waitFor();
  if (unit.textId) { await page.locator(".text-panel .ln").first().waitFor(); }
  await shot(`${book}-unit`);
  await page.getByTestId("start-practice").click();
  await page.waitForURL("**/practice");
  for (let i = 0; i < unit.questions.length; i++) {
    const q = unit.questions[i];
    const plan = i === 3 || i === 7 ? "wrong" : "right";
    if (i === 0) await shot(`${book}-q1-${q.type}`);
    await answer(page, q, plan);
    if (q.type !== "extended") await page.getByTestId("check").click();
    try { await page.getByTestId("next").waitFor({ timeout: 8000 }); } catch {
      const msg = await page.locator(".msg").allInnerTexts();
      await shot(`FAIL-${book}-q${i + 1}-${q.type}`);
      throw new Error(`${book} q${i + 1} (${q.type}, plan ${plan}) did not reach feedback: ${msg.join("|")} :: ${JSON.stringify(q).slice(0, 300)}`);
    }
    await page.getByTestId("next").click();
  }
  // first-round done: either the retry screen (some wrong) or the results page
  const retry = page.getByTestId("start-retry");
  await Promise.race([retry.waitFor(), page.waitForURL("**/results**")]);
  if (await retry.isVisible().catch(() => false)) {
    await shot(`${book}-retry-intro`);
    await page.getByRole("link", { name: "See my results" }).click();
    await page.waitForURL("**/results**");
  }
  await page.getByRole("heading", { level: 1 }).waitFor();
  await shot(`${book}-results`);
  sessions++;
  const mk = page.getByTestId("mistakes-link");
  if (await mk.isVisible().catch(() => false)) { await mk.click(); await page.waitForURL("**/mistakes**"); await shot(`${book}-mistakes`); }
}
await page.goto(`${BASE}/books/y3maths`);
await shot("y3maths-progress");
// dashboard shows the practice that was just saved
await page.goto(`${BASE}/dashboard`);
await page.getByRole("heading", { name: /dashboard/i, level: 1 }).waitFor();
const tiles = await page.locator("section[aria-label=Summary]").innerText();
if (!/questions answered\s*80/i.test(tiles)) errors.push(`dashboard tiles unexpected: ${tiles.replace(/\n/g, " | ")}`);
await shot("dashboard");

// parent PIN: set it, hand over to the child, the parent area is locked until the PIN is entered
await page.goto(`${BASE}/account`);
await page.locator("#pin").fill("2580");
await page.locator("#again").fill("2580");
await page.getByRole("button", { name: "Save PIN" }).click();
await page.getByText("PIN saved.").waitFor();
await page.goto(`${BASE}/home`);
await page.getByRole("button", { name: /Sam/ }).first().click();
await page.waitForURL(/\/me/);
await page.goto(`${BASE}/dashboard`);
if (!page.url().includes("/unlock")) errors.push(`dashboard was not locked: ${page.url()}`);
await page.locator("#pin").fill("0000");
await page.getByRole("button", { name: "Open parent area" }).click();
await page.getByText("not the right PIN").waitFor();
await shot("unlock-wrong-pin");
await page.locator("#pin").fill("2580");
await page.getByRole("button", { name: "Open parent area" }).click();
await page.waitForURL("**/dashboard");

// export, then delete the account
const exp = await page.request.get(`${BASE}/account/export`);
const data = await exp.json();
if (!data.practiceSessions?.length || JSON.stringify(data).includes("password_hash") || JSON.stringify(data).includes("order_hash")) errors.push("export missing sessions or leaks a hash");
await page.goto(`${BASE}/account`);
await page.getByLabel("Your password").fill("a long family password");
await page.getByLabel("Type DELETE to confirm").fill("DELETE");
await page.getByRole("button", { name: "Delete my account" }).click();
await page.waitForURL("**/?deleted=1");
await page.goto(`${BASE}/login`);
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill("a long family password");
await page.getByRole("button", { name: "Log in" }).click();
await page.getByText(/don't match an account/).waitFor();

await browser.close();
console.log(JSON.stringify({ email, sessions, errors }, null, 1));
process.exit(errors.length ? 1 : 0);
