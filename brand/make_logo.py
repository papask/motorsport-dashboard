"""OnTheLimit logo generator: outlined SVGs (no font dependency) + PNG exports.

Concept: a rev gauge whose needle sits in the red zone -- "on the limit" --
paired with a heavy italic wordmark in ink + racing red.
"""
import math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'public', 'brand')
os.makedirs(OUT, exist_ok=True)
FONTS = {w: TTFont(f'/root/.fonts/Pretendard-{w}.otf') for w in ('Black', 'ExtraBold', 'Bold', 'SemiBold')}

RED = '#D9101A'      # racing red (deliberately not F1's brand red)
INK = '#111114'      # near-black
PAPER = '#FFFFFF'
TILE = '#0E0E11'
MUTED_L = '#6B6B73'
MUTED_D = '#A3A3AD'
SKEW = math.tan(math.radians(12))  # italic slant


# ---------------------------------------------------------------- text → paths
def text_path(text, weight, size, x0=0.0, baseline=0.0, tracking=0.0, italic=True):
    """Return (svg_path_d, advance_width, (xmin, ymin, xmax, ymax)) in px."""
    f = FONTS[weight]
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f['head'].unitsPerEm
    s = size / upm
    pen = SVGPathPen(gs)
    bpen = BoundsPen(gs)
    x = x0
    for ch in text:
        if ch == ' ':
            x += f['hmtx'][cmap[32]][0] * s + tracking
            continue
        g = cmap[ord(ch)]
        # font units (y up) -> px (y down), italic shear around the baseline
        # TransformPen matrix (xx, xy, yx, yy, dx, dy): x' = xx*x + yx*y + dx
        mat = (s, 0, s * SKEW if italic else 0, -s, x, baseline)
        gs[g].draw(TransformPen(pen, mat))
        gs[g].draw(TransformPen(bpen, mat))
        x += gs[g].width * s + tracking
    return pen.getCommands(), x - x0 - tracking, bpen.bounds


# ---------------------------------------------------------------- the mark
def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy - r * math.sin(a)


def arc_d(cx, cy, r, a0, a1):
    """Clockwise arc from angle a0 to a1 (degrees, math convention, a0 > a1)."""
    x0, y0 = polar(cx, cy, r, a0)
    x1, y1 = polar(cx, cy, r, a1)
    large = 1 if (a0 - a1) > 180 else 0
    return f'M{x0:.2f} {y0:.2f} A{r} {r} 0 {large} 1 {x1:.2f} {y1:.2f}'


def mark_group(size=512, tile=True, simple=False, ink_on_tile=PAPER, border=False):
    """Gauge mark in a size×size box. simple=True drops ticks for favicons."""
    k = size / 512
    cx, cy, r = 256 * k, 292 * k, 168 * k
    sw = (52 if simple else 36) * k
    start, end = 215, -35          # 250° sweep
    red_from = -35 + 250 * 0.30     # last 30% of the sweep is the red zone
    parts = []
    if tile:
        if border:
            bw = max(1.5, 6 * k)
            parts.append(f'<rect x="{bw / 2:.2f}" y="{bw / 2:.2f}" width="{size - bw:.2f}" height="{size - bw:.2f}" rx="{112 * k - bw / 2:.1f}" fill="{TILE}" stroke="#34343B" stroke-width="{bw:.2f}"/>')
        else:
            parts.append(f'<rect width="{size}" height="{size}" rx="{112 * k:.1f}" fill="{TILE}"/>')
    parts.append(f'<path d="{arc_d(cx, cy, r, start, red_from + 3)}" fill="none" stroke="{ink_on_tile}" stroke-width="{sw:.1f}" stroke-linecap="round"/>')
    parts.append(f'<path d="{arc_d(cx, cy, r, red_from - 3, end)}" fill="none" stroke="{RED}" stroke-width="{sw:.1f}" stroke-linecap="round"/>')
    if not simple:
        for i in range(1, 8):
            a = start - 250 * i / 8
            if a < red_from:
                continue
            x0, y0 = polar(cx, cy, r - sw * 0.95, a)
            x1, y1 = polar(cx, cy, r - sw * 1.55, a)
            parts.append(f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke="{ink_on_tile}" stroke-opacity="0.55" stroke-width="{8 * k:.1f}" stroke-linecap="round"/>')
    needle = -35 + 250 * 0.12       # needle deep in the red zone
    nx, ny = polar(cx, cy, r - sw * (0.2 if simple else 0.45), needle)
    bx, by = polar(cx, cy, 30 * k, needle + 180)
    parts.append(f'<line x1="{bx:.1f}" y1="{by:.1f}" x2="{nx:.1f}" y2="{ny:.1f}" stroke="{RED}" stroke-width="{(30 if simple else 22) * k:.1f}" stroke-linecap="round"/>')
    parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{(40 if simple else 34) * k:.1f}" fill="{ink_on_tile}"/>')
    parts.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{(16 if simple else 13) * k:.1f}" fill="{RED}"/>')
    return '\n  '.join(parts)


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">\n'
            f'  <title>{title}</title>\n  {body}\n</svg>\n')


def write(name, content):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(content)


# ---------------------------------------------------------------- lockups
def lockup_en(theme):
    """Mark + ONTHELIMIT wordmark + tagline (desktop header / hero)."""
    ink = INK if theme == 'light' else PAPER
    muted = MUTED_L if theme == 'light' else MUTED_D
    H = 120
    ms = 120
    x = ms + 26
    size = 76
    base = 78
    d1, w1, _ = text_path('ONTHE', 'Black', size, x, base, tracking=-1.5)
    d2, w2, _ = text_path('LIMIT', 'Black', size, x + w1 + 4, base, tracking=-1.5)
    wm_w = w1 + 4 + w2
    # speed bar under the wordmark, parallelogram matching the slant
    by = base + 12
    bar = (f'<path d="M{x - 2:.1f} {by + 9:.1f} L{x + wm_w * 0.62:.1f} {by + 9:.1f} L{x + wm_w * 0.62 + 9 * SKEW:.1f} {by:.1f} '
           f'L{x + 7:.1f} {by:.1f} Z" fill="{ink}"/>'
           f'<path d="M{x + wm_w * 0.64:.1f} {by + 9:.1f} L{x + wm_w + 4:.1f} {by + 9:.1f} L{x + wm_w + 4 + 9 * SKEW:.1f} {by:.1f} '
           f'L{x + wm_w * 0.64 + 9 * SKEW:.1f} {by:.1f} Z" fill="{RED}"/>')
    W = x + wm_w + 16
    body = (f'<g>{mark_group(ms, tile=True, border=theme == "dark")}</g>\n  '
            f'<path d="{d1}" fill="{ink}"/>\n  <path d="{d2}" fill="{RED}"/>\n  {bar}')
    return W, H, body


def lockup_ko(theme, tagline=True):
    """Mark + F1 온더리밋 (+ F1 RACE DATA tagline). Desktop and mobile headers."""
    ink = INK if theme == 'light' else PAPER
    muted = MUTED_L if theme == 'light' else MUTED_D
    H = 120
    ms = 120
    x = ms + 24
    size = 70
    base = 72 if tagline else 84
    # red "F1" tag (rounded parallelogram) + wordmark
    tag_h = 56
    tag_top = base - 52
    df, wf, bf = text_path('F1', 'Black', 50, x + 14, base - 6, tracking=-1)
    tag_w = wf + 30
    sk = tag_h * SKEW
    tag = (f'<path d="M{x + sk:.1f} {tag_top:.1f} L{x + tag_w + sk:.1f} {tag_top:.1f} L{x + tag_w:.1f} {tag_top + tag_h:.1f} '
           f'L{x:.1f} {tag_top + tag_h:.1f} Z" fill="{RED}"/>')
    dk, wk, _ = text_path('온더리밋', 'Black', size, x + tag_w + 18, base, tracking=-2)
    W = x + tag_w + 18 + wk + 14
    body = f'<g>{mark_group(ms, tile=True, border=theme == "dark")}</g>\n  {tag}\n  <path d="{df}" fill="{PAPER}"/>\n  <path d="{dk}" fill="{ink}"/>'
    if tagline:
        dt, wt, _ = text_path('ONTHELIMIT  ·  F1 RACE DATA', 'Bold', 19, x + 2, base + 34, tracking=3.2, italic=False)
        body += f'\n  <path d="{dt}" fill="{muted}"/>'
        W = max(W, x + wt + 14)
    return W, H, body


def main():
    write('onthelimit-mark.svg', svg(512, 512, mark_group(512), 'OnTheLimit'))
    write('favicon.svg', svg(64, 64, mark_group(64, simple=True), 'OnTheLimit'))
    for theme in ('light', 'dark'):
        W, H, body = lockup_en(theme)
        write(f'onthelimit-logo-en-{theme}.svg', svg(W, H, body, 'OnTheLimit'))
        W, H, body = lockup_ko(theme, tagline=True)
        write(f'onthelimit-logo-ko-{theme}.svg', svg(W, H, body, 'F1 온더리밋'))
        W, H, body = lockup_ko(theme, tagline=False)
        write(f'onthelimit-logo-compact-{theme}.svg', svg(W, H, body, 'F1 온더리밋'))
    print('\n'.join(sorted(os.listdir(OUT))))


if __name__ == '__main__':
    main()
