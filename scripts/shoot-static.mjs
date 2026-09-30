import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const files = process.argv.slice(2);
for (const [n, vp] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 900 }]]) {
  const p = await b.newPage({ viewport: vp });
  const ext = [];
  p.on("request", (r) => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) ext.push(r.url()); });
  for (const f of files) {
    await p.goto("file://" + f);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    const name = f.split("/").pop().replace(".html", "");
    await p.screenshot({ path: `/tmp/claude-0/static-${n}-${name}.png`, fullPage: true });
    console.log(n, name, w[0] > w[1] ? "OVERFLOW " + w : "ok");
  }
  if (ext.length) console.log("EXTERNAL REQUESTS", ext);
}
await b.close();
