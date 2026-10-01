#!/usr/bin/env python3
"""
Regenerates the brand artwork in public/site/ from the display font (no dependencies beyond Python 3):
  logo.svg, favicon.svg, how-icon.svg, book-icon.svg, covers/<book id>.svg, images/post-privacy.svg, og.svg
then run `node src/marketing/tools/render-icons.mjs` to make the PNG icons and og.png (uses sharp, already in node_modules).

Run from the repo root:  python3 src/marketing/tools/build_assets.py
Change BRAND_WORD / BRAND_SUB below if the brand name in src/marketing/brand.ts changes.
Artwork text uses Montserrat ExtraBold (SIL Open Font License, public/site/fonts/montserrat-800.woff2) as live <text>; run render-art.mjs to
rasterise the covers, icons and social card in Chromium. The wordmark in the header and footer is HTML text in the Adobe Fonts kit font, not an image.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'src', 'marketing', 'art')   # SVG sources; render-art.mjs writes the rasters into public/site
BRAND_WORD, BRAND_SUB = 'Learn', 'Works'

DARK, VIOLET, GREEN, GOLD, ORANGE, CORAL, PEACH, CREAM, BLUE, SALMON, WHITE = (
    '#14213d', '#ff8fab', '#c4e538', '#ffb627', '#19c3b1', '#4da3ff', '#fff0cf', '#fffaf0', '#a8d1ff', '#ffc2d1', '#ffffff')
class _Text:
    """Stands in for the old outline font: returns a <text> element and a width estimate (good enough to place shapes)."""
    def path(self, s, size, x, y, fill=None):
        return ('TEXT', s, size, x, y), len(s) * size * 0.68
font = _Text()
FONT = 'font-family="Montserrat" font-weight="800"'
def T(s, size, x, y, fill, extra=''):
    s = s.replace('&', '&amp;')
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" {FONT} {extra}>{s}</text>'

def dedupe(svg):
    """An element may carry two stroke-width attributes (the shared default and an override): keep the last."""
    import re
    def fix(m):
        tag = m.group(0); found = re.findall(r' stroke-width="[^"]*"', tag)
        for f in found[:-1]: tag = tag.replace(f, '', 1)
        return tag
    return re.sub(r'<[^>]+>', fix, svg)

def write(rel, text):
    text = dedupe(text)
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(text); print('wrote', rel, len(text), 'bytes')

# ---------- logo ----------
# The wordmark in the header and footer is HTML text (see src/marketing/Logo.tsx). Only the social card needs it as artwork.
def wordmark(x, y, size, dark=DARK):
    return (f'<text x="{x}" y="{y}" font-size="{size}" {FONT} fill="{dark}">{BRAND_WORD} {BRAND_SUB}</text>')

# ---------- favicon ----------
def favicon():
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
            f'<rect width="64" height="64" rx="14" fill="{DARK}"/>' + T('L', 48, 32, 47, PEACH, 'text-anchor="middle"') +
            f'<circle cx="48" cy="44" r="6.5" fill="none" stroke="{CORAL}" stroke-width="3.5"/></svg>\n')
write('favicon.svg', favicon())

write('how-icon.svg', f'<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">'
      f'<circle cx="18" cy="18" r="15.5" stroke="{DARK}" stroke-width="3"/>'
      f'<path d="M12 15.5L18 21.5L24 15.5" stroke="{DARK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>\n')
write('book-icon.svg', f'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
      f'<path d="M3 5.5C5.5 4.3 9 4.3 12 6c3-1.7 6.5-1.7 9-.5v13c-2.5-1.2-6-1.2-9 .5-3-1.7-6.5-1.7-9-.5v-13Z" stroke="{DARK}" stroke-width="1.8" stroke-linejoin="round"/>'
      f'<path d="M12 6v13" stroke="{DARK}" stroke-width="1.8"/></svg>\n')

# ---------- covers (420 x 540) ----------
S = f'stroke="{DARK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'
def cover(bg, body, extra_bg=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="420" height="540" viewBox="0 0 420 540" aria-hidden="true">'
            f'<rect width="420" height="540" fill="{bg}"/>{extra_bg}<g transform="translate(31.5 20) scale(.85)">{body}</g></svg>\n')
def circ(cx, cy, r, fill, stroke=True): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" {S if stroke else ""}/>'
def rect(x, y, w, h, fill, rx=0, rot=None, stroke=True):
    t = f' transform="rotate({rot[0]} {rot[1]} {rot[2]})"' if rot else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" {S if stroke else ""}{t}/>'
def star(cx, cy, r, fill, n=8, inner=0.38, stroke=True):
    import math
    pts = []
    for i in range(n * 2):
        a = math.pi * i / n - math.pi / 2; rr = r if i % 2 == 0 else r * inner
        pts.append(f'{cx + rr * math.cos(a):.1f},{cy + rr * math.sin(a):.1f}')
    return f'<polygon points="{" ".join(pts)}" fill="{fill}" {S if stroke else ""}/>'
def glyphs(s, size, x, y, fill, stroke=True):
    _, w = font.path(s, size, x, y)
    return T(s, size, x, y, fill, (S if stroke else '') ), w
def bars(x, y, widths, h=16, gap=12, fill=CREAM):
    return ''.join(rect(x, y + i * (h + gap), w, h, fill, rx=h / 2) for i, w in enumerate(widths))

covers = {}
# Year 3 Maths: giant 3, counting dots, plus
g3, _ = glyphs('3', 330, 28, 318, CORAL)
covers['y3maths'] = cover(GOLD, g3 + ''.join(circ(262 + c * 50, 96 + r * 50, 17, CREAM) for r in range(3) for c in range(3))
    + circ(330, 262, 40, VIOLET) + f'<path d="M330 244V280M312 262H348" {S} fill="none"/>'
    + rect(204, 236, 62, 14, CREAM, 7) + rect(204, 266, 62, 14, CREAM, 7))
# Year 8 Maths: graph with parabola, x squared
gx, wx = glyphs('x', 130, 22, 210, CREAM); g2, _ = glyphs('2', 70, 22 + wx + 4, 150, CREAM)
grid = ''.join(f'<path d="M{x} 40V330" stroke="{CREAM}" stroke-opacity=".45" stroke-width="2"/>' for x in range(30, 420, 45)) + \
       ''.join(f'<path d="M0 {y}H420" stroke="{CREAM}" stroke-opacity=".45" stroke-width="2"/>' for y in range(60, 330, 45))
covers['y8maths'] = cover(VIOLET, grid + f'<path d="M210 30V340M0 300H420" {S} fill="none"/>'
    + f'<path d="M140 60Q210 520 280 60" {S} stroke-width="5" fill="none"/>'
    + circ(168, 207, 11, CORAL) + circ(252, 207, 11, CORAL) + circ(210, 300, 11, GOLD) + gx + g2)
# KS2 Reading 10-minute tests: quote mark, clock with 10 minute wedge, text lines
gq, _ = glyphs('“', 300, 34, 270, DARK, stroke=False)
import math
cx, cy, r = 312, 128, 62
a0, a1 = -math.pi / 2, -math.pi / 2 + math.pi / 3
wedge = f'<path d="M{cx} {cy}L{cx + r * math.cos(a0):.1f} {cy + r * math.sin(a0):.1f}A{r} {r} 0 0 1 {cx + r * math.cos(a1):.1f} {cy + r * math.sin(a1):.1f}Z" fill="{CORAL}" {S}/>'
covers['ks2reading10'] = cover(GREEN, gq + circ(cx, cy, r, CREAM) + wedge
    + f'<path d="M{cx} {cy - r + 6}V{cy - r + 18}M{cx} {cy + r - 6}V{cy + r - 18}M{cx - r + 6} {cy}H{cx - r + 18}M{cx + r - 6} {cy}H{cx + r - 18}" {S} fill="none" stroke-width="2.5"/>'
    + circ(cx, cy, 5, DARK) + bars(40, 210, [290, 230, 300, 190], 16, 14, CREAM))
# KS3 English: speech bubbles with Aa
ga, _ = glyphs('Aa', 150, 74, 214, DARK, stroke=False)
covers['ks3english'] = cover(ORANGE,
    rect(96, 96, 270, 150, VIOLET, 34) + f'<path d="M300 244L316 292L350 246" fill="{VIOLET}" {S}/>'
    + rect(60, 74, 270, 150, CREAM, 34) + f'<path d="M110 222L96 268L156 224" fill="{CREAM}" {S}/>' + rect(62, 76, 266, 144, CREAM, 32, stroke=False)
    + ga + star(352, 70, 34, DARK, 8, .4, False) + circ(70, 300, 18, GOLD))
# GCSE English Language: annotated page and pencil
lines = ''.join(rect(86, 120 + i * 30, w, 14, DARK if i not in (1, 3) else DARK, 7, stroke=False) for i, w in enumerate([200, 168, 190, 140, 180, 120]))
hl = rect(80, 144, 176, 24, GOLD, 8, stroke=False) + rect(80, 204, 130, 24, GOLD, 8, stroke=False)
covers['gcse_englang'] = cover(CORAL, f'<g transform="rotate(-5 210 190)">' + rect(60, 56, 260, 270, CREAM, 14) + hl + lines
    + f'<ellipse cx="190" cy="159" rx="96" ry="26" fill="none" {S}/></g>'
    + f'<g transform="rotate(32 330 260)">' + rect(312, 140, 36, 150, GOLD, 4) + f'<path d="M312 290L330 336L348 290Z" fill="{PEACH}" {S}/><path d="M322 316L330 336L338 316Z" fill="{DARK}"/>' + rect(312, 120, 36, 28, VIOLET, 6) + '</g>')
# Year 3 Reading: open book with sun
pg = lambda pts, fill: f'<polygon points="{pts}" fill="{fill}" {S}/>'
covers['y3reading'] = cover(SALMON,
    ''.join(f'<path d="M{210 + 150 * math.cos(a):.1f} {120 + 96 * math.sin(a):.1f}L{210 + 190 * math.cos(a):.1f} {120 + 124 * math.sin(a):.1f}" {S} fill="none" stroke-width="4"/>' for a in [i * math.pi / 6 - math.pi for i in range(1, 6)])
    + circ(210, 120, 56, GOLD)
    + pg('40,170 206,200 206,330 40,300', CREAM) + pg('380,170 214,200 214,330 380,300', PEACH)
    + bars(66, 206, [96, 84, 96, 70], 10, 14, DARK).replace(f'stroke="{DARK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"', '')
    + circ(300, 252, 22, GREEN) + f'<path d="M206 200V330" {S} fill="none"/>')
# Macbeth: crown, dagger, moon
crown = f'<path d="M96 250L82 120L152 176L210 90L268 176L338 120L324 250Z" fill="{GOLD}" {S}/>' + rect(96, 250, 228, 34, GOLD, 8) \
    + circ(82, 116, 13, CORAL) + circ(210, 86, 13, CORAL) + circ(338, 116, 13, CORAL) + circ(160, 267, 7, DARK) + circ(210, 267, 7, DARK) + circ(260, 267, 7, DARK)
dagger = f'<g transform="translate(34 0) rotate(14 330 200)"><polygon points="322,70 338,70 342,230 318,230" fill="{CREAM}" {S}/><rect x="298" y="230" width="64" height="14" rx="7" fill="{CORAL}" {S}/><rect x="322" y="244" width="16" height="44" rx="6" fill="{VIOLET}" {S}/></g>'
covers['macbeth'] = cover(DARK, circ(88, 70, 34, VIOLET, False) + circ(104, 62, 30, DARK, False) + crown + dagger
    + ''.join(circ(x, y, 7, CORAL, False) for x, y in [(352, 306), (344, 330), (360, 340)])
    + ''.join(star(x, y, 9, CREAM, 4, .35, False) for x, y in [(40, 190), (390, 40), (60, 330)]), '')
# An Inspector Calls: lamp, light, clock
clock = circ(336, 92, 44, CREAM) + f'<path d="M336 92V62M336 92L356 104" {S} fill="none" stroke-width="4"/>' + circ(336, 92, 4, DARK) \
    + ''.join(f'<path d="M{336 + 36 * math.cos(a):.1f} {92 + 36 * math.sin(a):.1f}L{336 + 40 * math.cos(a):.1f} {92 + 40 * math.sin(a):.1f}" {S} fill="none" stroke-width="2"/>' for a in [i * math.pi / 6 for i in range(12)])
lamp = f'<polygon points="150,130 270,130 360,330 60,330" fill="{CREAM}" fill-opacity=".55"/>' \
    + f'<polygon points="170,70 250,70 280,130 140,130" fill="{GOLD}" {S}/><path d="M210 130V270" {S} fill="none" stroke-width="6"/>' \
    + rect(160, 270, 100, 18, DARK, 9, stroke=False) + f'<path d="M210 70V30" {S} fill="none"/>' + circ(210, 108, 10, CREAM)
covers['aic'] = cover(BLUE, rect(34, 40, 96, 138, PEACH, 6) + f'<path d="M82 40V178M34 109H130" {S} fill="none"/>' + clock + lamp + circ(60, 300, 14, VIOLET) + circ(380, 300, 10, GOLD))
for k, v in covers.items(): write(f'covers/{k}.svg', v)

# ---------- privacy card (620 x 400) ----------
lock = (f'<path d="M232 190V140a78 78 0 0 1 156 0V190" fill="none" {S} stroke-width="14"/>'
        + rect(196, 180, 228, 170, GOLD, 22) + circ(310, 246, 24, DARK, False) + f'<path d="M298 258H322L328 310H292Z" fill="{DARK}"/>')
write('images/post-privacy.svg', f'<svg xmlns="http://www.w3.org/2000/svg" width="620" height="400" viewBox="0 0 620 400" aria-hidden="true"><rect width="620" height="400" fill="{VIOLET}"/>'
      + circ(90, 90, 44, GREEN) + star(540, 80, 40, CORAL, 8, .4) + circ(520, 330, 26, CREAM) + rect(40, 300, 110, 22, CREAM, 11) + lock + '</svg>\n')

# ---------- "where to go next" cards (620 x 400) ----------
def card_art(name, bg, body):
    write(f'images/{name}.svg', f'<svg xmlns="http://www.w3.org/2000/svg" width="620" height="400" viewBox="0 0 620 400" aria-hidden="true"><rect width="620" height="400" fill="{bg}"/>{body}</svg>\n')
book = lambda x, y, w, h, fill, rot: f'<g transform="rotate({rot} {x + w/2} {y + h/2})">' + rect(x, y, w, h, fill, 10) + rect(x + 16, y + h/2 - 7, w - 32, 14, CREAM, 7, stroke=False) + '</g>'
card_art('post-books', AMBER if False else GOLD, circ(520, 84, 44, SALMON) + star(86, 330, 38, VIOLET, 8, .4)
         + book(150, 250, 320, 62, CORAL, -2) + book(176, 186, 270, 60, GREEN, 3) + book(160, 126, 300, 58, VIOLET, -3)
         + T('10', 120, 470, 330, DARK, 'text-anchor="middle"'))
card_art('post-curriculum', CORAL, ''.join(f'<path d="M0 {y}H620" stroke="{CREAM}" stroke-opacity=".5" stroke-width="2"/>' for y in (100, 200, 300))
         + ''.join(f'<path d="M{x} 0V400" stroke="{CREAM}" stroke-opacity=".5" stroke-width="2"/>' for x in (155, 310, 465))
         + circ(232, 150, 52, VIOLET) + rect(364, 98, 104, 104, GOLD, 12) + f'<polygon points="232,236 292,340 172,340" fill="{GREEN}" {S}/>'
         + circ(388, 288, 40, CREAM) + T('KS1-4', 56, 520, 372, DARK, 'text-anchor="middle"'))

# ---------- social card (1200 x 630) ----------
write('og.svg', f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="{PEACH}"/>'
      f'<circle cx="1090" cy="120" r="150" fill="{VIOLET}"/><circle cx="1030" cy="560" r="90" fill="{GREEN}"/><circle cx="930" cy="330" r="46" fill="{GOLD}"/>'
      + wordmark(80, 150, 84)
      + T('Free online practice', 84, 80, 330, DARK) + T('with your Learn Works book', 60, 80, 420, DARK)
      + f'<path d="M84 478C250 462 470 458 640 470" fill="none" stroke="{ORANGE}" stroke-width="9" stroke-linecap="round"/></svg>\n')
