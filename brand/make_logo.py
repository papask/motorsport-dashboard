"""OnTheLimit logo generator: outlined SVGs (no font dependency) + PNG exports.

Concept: a rev gauge whose needle sits in the red zone -- "on the limit" --
set on a slanted racing-red plate with the wordmark knocked out in white.
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
# Badge lockup: round gauge emblem riding on a slanted red plate with the
# wordmark knocked out in white, trailed by three speed stripes.
def emblem(cx, cy, R, ring=PAPER, ring_w=None, disk=TILE):
    """Round gauge emblem: dark disk, outer ring, white→red arc, red needle."""
    ring_w = ring_w if ring_w is not None else R * 0.075
    p = [f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{R - ring_w / 2:.1f}" fill="{disk}" stroke="{ring}" stroke-width="{ring_w:.1f}"/>']
    gx, gy, gr = cx, cy + R * 0.10, R * 0.58
    sw = R * 0.15
    start, end = 215, -35
    red_from = -35 + 250 * 0.32
    p.append(f'<path d="{arc_d(gx, gy, gr, start, red_from + 4)}" fill="none" stroke="{PAPER}" stroke-width="{sw:.1f}" stroke-linecap="round"/>')
    p.append(f'<path d="{arc_d(gx, gy, gr, red_from - 4, end)}" fill="none" stroke="{RED}" stroke-width="{sw:.1f}" stroke-linecap="round"/>')
    nd = -35 + 250 * 0.12
    nx, ny = polar(gx, gy, gr - sw * 0.35, nd)
    bx, by = polar(gx, gy, R * 0.12, nd + 180)
    p.append(f'<line x1="{bx:.1f}" y1="{by:.1f}" x2="{nx:.1f}" y2="{ny:.1f}" stroke="{RED}" stroke-width="{R * 0.11:.1f}" stroke-linecap="round"/>')
    p.append(f'<circle cx="{gx:.1f}" cy="{gy:.1f}" r="{R * 0.14:.1f}" fill="{PAPER}"/>')
    p.append(f'<circle cx="{gx:.1f}" cy="{gy:.1f}" r="{R * 0.06:.1f}" fill="{RED}"/>')
    return '\n  '.join(p)


def para(x0, y0, x1, h, fill, extra=''):
    """Right-leaning parallelogram: bottom-left (x0, y0+h) .. top-right (x1+s, y0)."""
    s = h * SKEW
    return f'<path d="M{x0 + s:.1f} {y0:.1f} L{x1 + s:.1f} {y0:.1f} L{x1:.1f} {y0 + h:.1f} L{x0:.1f} {y0 + h:.1f} Z" fill="{fill}"{extra}/>'


def badge(text, theme, size=58, weight='Black', tracking=-1.5, tagline=None):
    """Emblem + red plate with the wordmark knocked out + trailing speed stripes.

    The plate reads on both backgrounds; only the stripes (ink on light, white
    on dark) and the tagline colour change with the theme.
    """
    H = 120
    R = 58
    cx, cy = 60, 60
    plate_y, plate_h = 27, 66
    tx = cx + R + 14
    if isinstance(text, str):
        # measure the text to size the plate and centre it vertically
        _, tw, bb = text_path(text, weight, size, 0, 0, tracking)
        th = bb[3] - bb[1]
        base = plate_y + plate_h / 2 + th / 2 - bb[3] - 0.5
        d, tw, _ = text_path(text, weight, size, tx, base, tracking)
    else:
        # stacked lines [(text, size), ...], block centred in the plate; each
        # line is shifted left by the slant so the stack keeps the italic edge
        gap = 7
        heights = [size_ * 0.72 for _, size_ in text]
        y = plate_y + (plate_h - (sum(heights) + gap * (len(text) - 1))) / 2
        d, tw = '', 0.0
        for (line, size_), h in zip(text, heights):
            y += h
            dl, wl, _ = text_path(line, weight, size_, tx + (plate_y + plate_h - y) * SKEW - 6, y, tracking)
            d += dl
            tw = max(tw, wl)
            y += gap
    plate_x1 = tx + tw + 22
    dark = theme == 'dark'
    parts = [para(cx, plate_y, plate_x1, plate_h, RED)]
    x = plate_x1 + 8
    for w in (12, 8, 5):
        parts.append(para(x, plate_y, x + w, plate_h, PAPER if dark else INK))
        x += w + 7
    W = x + 6
    parts.append(emblem(cx, cy, R, ring_w=R * 0.08))
    parts.append(f'<path d="{d}" fill="{PAPER}"/>')
    if tagline:
        dt, wt, _ = text_path(tagline, 'Bold', 17, tx + 4, H + 16, tracking=3.4, italic=False)
        parts.append(f'<path d="{dt}" fill="{MUTED_D if dark else MUTED_L}"/>')
        H += 30
        W = max(W, tx + wt + 10)
    return W, H, '\n  '.join(parts)


def main():
    write('onthelimit-mark.svg', svg(512, 512, mark_group(512), 'OnTheLimit'))
    write('favicon.svg', svg(64, 64, mark_group(64, simple=True), 'OnTheLimit'))
    # SNS profile photo: platforms crop it to a circle, so the tile goes full-bleed
    # (no rounded corners) and the gauge is enlarged to fill the circle
    write('onthelimit-profile.svg', svg(512, 512, f'<rect width="512" height="512" fill="{TILE}"/>\n  '
          f'<g transform="translate(256 256) scale(1.1) translate(-256 -256)">\n  {mark_group(512, tile=False)}\n  </g>', 'OnTheLimit'))
    for theme in ('light', 'dark'):
        W, H, body = badge('온더리밋', theme, size=58)
        write(f'onthelimit-logo-ko-{theme}.svg', svg(W, H, body, '온더리밋'))
        if theme == 'light':
            # badge profile photo: white square, badge 90% wide so a circle crop keeps it whole
            w = 512 * 0.9
            write('onthelimit-profile-ko.svg', svg(512, 512, f'<rect width="512" height="512" fill="{PAPER}"/>\n  '
                  f'<svg x="{(512 - w) / 2:.1f}" y="{(512 - w * H / W) / 2:.1f}" width="{w:.1f}" height="{w * H / W:.1f}" '
                  f'viewBox="0 0 {W:.0f} {H:.0f}" overflow="visible">\n  {body}\n  </svg>', '온더리밋'))
        W, H, body = badge('온더리밋', theme, size=58, tagline='ONTHELIMIT  ·  RACE DATA')
        write(f'onthelimit-logo-ko-tagline-{theme}.svg', svg(W, H, body, '온더리밋'))
        W, H, body = badge('ONTHELIMIT', theme, size=56)
        write(f'onthelimit-logo-en-{theme}.svg', svg(W, H, body, 'OnTheLimit'))
        # narrow stacked version for phone headers
        W, H, body = badge([('ON THE', 25), ('LIMIT', 36)], theme, tracking=-1)
        write(f'onthelimit-logo-en-stacked-{theme}.svg', svg(W, H, body, 'OnTheLimit'))
    print('\n'.join(sorted(os.listdir(OUT))))


if __name__ == '__main__':
    main()
