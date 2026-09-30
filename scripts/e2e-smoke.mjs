// End-to-end smoke test + screenshots (phone and desktop). Usage: node scripts/e2e-smoke.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = process.argv[3] ?? "screenshots";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function run(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`[${name}] console ${m.text()}`));
  const shot = async (label) => {
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (w[0] > w[1] + 1) errors.push(`[${name}] horizontal scroll on ${label}: ${w[0]} > ${w[1]}`);
    await page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true });
  };
  await page.goto(BASE + "/");
  await shot("01-landing");
  await page.goto(BASE + "/signup");
  await shot("02-signup");
  await page.goto(BASE + "/login");
  await page.fill("#email", "demo@example.com");
  await page.fill("#password", "Practice123");
  await Promise.all([page.waitForURL("**/home**"), page.click("button[type=submit]")]);
  await shot("03-home");
  await Promise.all([page.waitForURL("**/learn**"), page.getByRole("button", { name: /^S Sam/ }).click()]);
  await shot("04-learn");
  await page.goto(BASE + "/learn/ks2/mathematics?year=y5");
  await shot("05-units");
  await page.goto(BASE + "/learn/ks2/mathematics?view=curriculum&year=y5");
  await shot("06-curriculum");
  const unitHref = await page.evaluate(async () => {
    const r = await fetch("/learn/ks2/mathematics?year=y5");
    const t = await r.text();
    return t.match(/href="(\/unit\/[^"]+)"/)?.[1];
  });
  await page.goto(BASE + unitHref.replace(/&amp;/g, "&"));
  await shot("07-unit");
  const lessonHref = await page.locator('a[href^="/lesson/"]').first().getAttribute("href");
  await page.goto(BASE + lessonHref);
  await shot("08-lesson");
  // quiz: answer first question
  const quizLink = page.locator('a[href^="/quiz/"]').first();
  if (await quizLink.count()) {
    await quizLink.click();
    await page.waitForURL("**/quiz/**");
    await page.locator('[role="radio"]').first().click().catch(() => {});
    const sel = page.locator("select").first();
    if (await sel.count()) {
      for (const s of await page.locator("select").all()) await s.selectOption({ index: 1 });
    }
    await page.getByRole("button", { name: /Check answer/ }).click();
    await page.getByRole("status").waitFor({ timeout: 10000 });
    await shot("09-quiz-feedback");
  } else errors.push(`[${name}] no quiz link on lesson`);
  // paper
  await page.goto(BASE + "/papers?ks=ks2");
  await shot("10-papers");
  await page.locator('a[href^="/papers/"]').first().click();
  await page.getByRole("button", { name: "Start" }).click();
  await page.fill('input[aria-label="Your answer"]', "123");
  await shot("11-paper-question");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: /Finish and mark/ }).click();
  await page.getByText("Your score").waitFor({ timeout: 20000 });
  await shot("12-paper-results");
  // phonics
  await page.goto(BASE + "/phonics");
  await page.locator('a[href^="/phonics?set="]').first().click();
  await page.waitForURL("**/phonics?set=**");
  await shot("13-phonics");
  for (let i = 0; i < 40; i++) await page.getByRole("button", { name: i % 5 === 0 ? /Not yet/ : /Right/ }).click();
  await page.getByText("Score").first().waitFor();
  await shot("14-phonics-result");
  // mtc
  await page.goto(BASE + "/times-tables");
  await page.getByRole("button", { name: /Start,/ }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.getByText("×").first().waitFor();
  await shot("15-mtc");
  await page.goto(BASE + "/progress");
  await shot("16-progress");
  await page.goto(BASE + "/credits");
  await shot("17-credits");
  await page.goto(BASE + "/privacy");
  await shot("18-privacy");
  await ctx.close();
}

await run("phone", { width: 390, height: 844 });
await run("desktop", { width: 1280, height: 900 });
await browser.close();
if (errors.length) {
  console.log("ISSUES:\n" + errors.join("\n"));
  process.exitCode = 1;
} else log("smoke test passed");
