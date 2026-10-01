// Rasterises the artwork SVGs (src/marketing/art) in Chromium so text uses the real font, then writes public/site.
//   python3 src/marketing/tools/build_assets.py && node src/marketing/tools/render-art.mjs
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const art = join(root, "src", "marketing", "art");
const site = join(root, "public", "site");
const font = pathToFileURL(resolve(site, "fonts", "montserrat-800.woff2")).href;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });

async function raster(svgText, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>@font-face{font-family:Montserrat;font-weight:800;src:url("${font}") format("woff2")}html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${svgText}`);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
const read = (f) => readFileSync(join(art, f), "utf8");

if (existsSync(join(site, "covers"))) rmSync(join(site, "covers"), { recursive: true });
mkdirSync(join(site, "covers"), { recursive: true });
for (const f of readdirSync(join(art, "covers")).filter((x) => x.endsWith(".svg"))) {
  const buf = await raster(readFileSync(join(art, "covers", f), "utf8"), 420, 540);
  await sharp(buf).webp({ quality: 88 }).toFile(join(site, "covers", f.replace(".svg", ".webp")));
}
const fav = await raster(read("favicon.svg"), 64, 64);
for (const n of [32, 192, 512]) await sharp(fav).resize(n, n).png().toFile(join(site, `icon-${n}.png`));
const apple = await raster(read("favicon.svg").replace('rx="14"', 'rx="0"'), 64, 64);
await sharp(apple).resize(180, 180).png().toFile(join(site, "apple-touch-icon.png"));
await sharp(await raster(read("og.svg"), 1200, 630)).png().toFile(join(site, "og.png"));
for (const n of ["post-privacy", "post-books", "post-curriculum"]) await sharp(await raster(read(`images/${n}.svg`), 620, 400)).webp({ quality: 90 }).toFile(join(site, "images", `${n}.webp`));
await browser.close();
console.log("artwork rendered to public/site");
