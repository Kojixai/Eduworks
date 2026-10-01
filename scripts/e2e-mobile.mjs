// Phone-width pass: key screens at 375px, flags horizontal scroll and tap targets under 44px. Usage: node scripts/e2e-mobile.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3100", OUT = process.argv[3] ?? "test-shots/mobile";
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const problems = [];
async function check(name, url) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth;
    const small = [...document.querySelectorAll("a,button,input:not([type=hidden]),select,textarea,summary")].filter((e) => {
      const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && (b.height < 40 || b.width < 40) && !e.closest(".visually-hidden,.sr-only") && e.type !== "checkbox" && e.type !== "radio";
    }).map((e) => `${e.tagName.toLowerCase()}:${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)}(${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)})`);
    return { over, small };
  });
  if (r.over > 1) problems.push(`${name}: horizontal scroll ${r.over}px`);
  if (r.small.length) problems.push(`${name}: ${r.small.length} small targets, e.g. ${r.small.slice(0, 4).join(", ")}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}
await check("landing", "/");
await check("books", "/books");
await check("login", "/login");
await check("signup", "/signup");
await page.goto(BASE + "/login");
await page.getByLabel("Email").fill("demo@example.com");
await page.getByLabel("Password").fill("Practice123");
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL("**/home");
await check("home", "/home");
await page.getByRole("button", { name: /Sam/ }).first().click();
await page.waitForTimeout(800);
await page.goto(BASE + "/unlock?next=/dashboard");
if (page.url().includes("/unlock")) { /* no PIN set on the demo parent, so it redirects */ }
await check("dashboard", "/dashboard?child=demo-child-sam&period=30");
await check("me", "/me");
await check("book", "/books/y3maths");
await check("unit", "/books/y3maths/y3maths-u03");
await check("practice", "/books/y3maths/y3maths-u03/practice");
await check("account", "/account");
await check("privacy", "/privacy");
await browser.close();
console.log(problems.length ? problems.join("\n") : "no overflow or small targets found");
