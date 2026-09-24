"""Promo video v5 — v4 with a telemetry-only opening.

The opener drops the timing tower and every piece of driver information;
it shows only the car's telemetry on one full-throttle straight: shift
lights, speed, gear, RPM, throttle/brake, DRS and the lap's speed trace,
ending on the rev limiter ("ON THE LIMIT"). Everything else is v4.
"""
import os, sys
from PIL import Image, ImageDraw

S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, S)
import make_video4 as V4  # noqa: E402
from make_video4 import W, H, RED, ease_out, with_alpha, font, txt, GREEN, PURPLE, BLUE  # noqa: E402

GREY = (170, 170, 180)
TRACK = (38, 38, 46)


class Telemetry(V4.LiveTiming):
    def frame(self, t):
        img = self.bg.copy()
        d = ImageDraw.Draw(img, 'RGBA')
        p, fidx = self._sample(t)
        limiter = t > self.t_run1
        k = ease_out(t / 0.35)
        a = int(255 * k)

        # top bar: live tag and lap only
        d.rounded_rectangle([60, 40, 178, 88], 8, fill=RED + (a,))
        d.ellipse([74, 56, 90, 72], fill=(255, 255, 255, 255 if int(t * 4) % 2 == 0 else 150))
        txt(d, (100, 64), 'LIVE', 'Barlow', 34, (255, 255, 255, a), 'lm')
        txt(d, (200, 64), 'TELEMETRY', 'Barlow', 34, (230, 230, 236, a), 'lm')
        txt(d, (W - 60, 64), 'LAP 57', 'Barlow', 44, (255, 255, 255, a), 'rm')

        # shift lights, centred
        n, gap = 15, 84
        lit = max(0.0, min(1.0, (p['rpm'] - 9800) / (self.max_rpm - 9800 - 150))) * n
        flash_on = int(t * 16) % 2 == 0
        cx0, cy = W / 2 - gap * (n - 1) / 2, 185
        for i in range(n):
            x = cx0 + i * gap
            base = GREEN if i < 5 else (RED if i < 10 else PURPLE)
            if limiter:
                col = BLUE + (255,) if flash_on else (30, 30, 40, 255)
            elif i < lit:
                col = base + (255,)
            else:
                col = TRACK + (255,)
            r = 28
            d.ellipse([x - r, cy - r, x + r, cy + r], fill=col)
            if (i < lit and not limiter) or (limiter and flash_on):
                d.ellipse([x - r - 9, cy - r - 9, x + r + 9, cy + r + 9], outline=col[:3] + (90,), width=5)

        # speed
        off = int(50 * (1 - k))
        sp = int(round(p['speed']))
        f_sp = font('Barlow', 300)
        txt(d, (120 - off, 560), f'{sp}', 'Barlow', 300, (255, 255, 255), 'ls')
        txt(d, (130 - off + f_sp.getlength(f'{sp}'), 560), 'KM/H', 'Barlow', 56, GREY, 'ls')

        # gear
        gx = 820
        d.rounded_rectangle([gx, 300, gx + 220, 570], 18, outline=(255, 255, 255, 60), width=3)
        txt(d, (gx + 110, 336), 'GEAR', 'Barlow', 30, GREY, 'mm')
        txt(d, (gx + 110, 460), str(p['gear']), 'Barlow', 200, RED + (255,) if limiter else (255, 255, 255), 'mm')

        # rpm, throttle, brake, drs
        rx, ry, rw = 1120, 330, 680
        txt(d, (rx, ry - 8), 'RPM', 'Barlow', 30, GREY, 'ls')
        txt(d, (rx + rw, ry - 8), f'{int(p["rpm"]):,}', 'Barlow', 46, (255, 255, 255), 'rs')
        d.rectangle([rx, ry + 8, rx + rw, ry + 46], fill=TRACK)
        fr = p['rpm'] / (self.max_rpm + 200)
        d.rectangle([rx, ry + 8, rx + int(rw * fr), ry + 46], fill=(RED if fr > 0.9 else (255, 255, 255)) + (255,))
        d.rectangle([rx + int(rw * 0.9), ry + 8, rx + rw, ry + 46], outline=RED + (160,), width=2)
        for j, (lab, val, col) in enumerate([('THROTTLE', p['throttle'] / 100, GREEN), ('BRAKE', 1.0 if p['brake'] else 0.0, RED)]):
            yy = ry + 110 + j * 80
            txt(d, (rx, yy), lab, 'Barlow', 30, GREY, 'ls')
            txt(d, (rx + rw, yy), f'{int(val * 100)}%', 'Barlow', 40, (255, 255, 255), 'rs')
            d.rectangle([rx, yy + 12, rx + rw, yy + 40], fill=TRACK)
            d.rectangle([rx, yy + 12, rx + int(rw * val), yy + 40], fill=col + (255,))
        drs = p['drs'] and p['drs'] >= 10
        d.rounded_rectangle([rx, ry + 280, rx + 150, ry + 332], 8, fill=(GREEN + (255,)) if drs else TRACK + (255,))
        txt(d, (rx + 75, ry + 306), 'DRS', 'Barlow', 36, (10, 10, 12) if drs else (120, 120, 130), 'mm')

        # speed trace across the full width
        tx0, ty0, tx1, ty1 = 60, 690, W - 60, 1020
        d.rectangle([tx0, ty0, tx1, ty1], fill=(255, 255, 255, 8))
        txt(d, (tx0 + 18, ty0 + 30), 'SPEED TRACE', 'Barlow', 28, GREY, 'lm')
        pts = [(tx0 + 24 + (q['distance'] / self.dmax) * (tx1 - tx0 - 48),
                ty1 - 22 - (q['speed'] / (self.vmax + 20)) * (ty1 - ty0 - 76)) for q in self.tel]
        d.line(pts, fill=(255, 255, 255, 60), width=3)
        cur = int(fidx)
        seg = pts[self.i0:cur + 1]
        if len(seg) > 1:
            d.line(seg, fill=RED + (255,), width=7)
        cxp = pts[min(cur, len(pts) - 1)]
        d.line([(cxp[0], ty0 + 52), (cxp[0], ty1 - 10)], fill=(255, 255, 255, 120), width=2)
        d.ellipse([cxp[0] - 10, cxp[1] - 10, cxp[0] + 10, cxp[1] + 10], fill=(255, 255, 255))

        # ON THE LIMIT on the rev limiter
        if limiter:
            kl = ease_out((t - self.t_run1) / 0.2)
            img = img.convert('RGBA')
            img.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, int(120 * kl))))
            f = font('Barlow', 240)
            label = 'ON THE LIMIT'
            wl = f.getlength(label)
            lay = Image.new('RGBA', (W, 330), (0, 0, 0, 0))
            ImageDraw.Draw(lay).text((W / 2 - wl / 2, 30), label, font=f, fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=RED + (255,))
            sc = 1.25 - 0.25 * kl
            lay = lay.resize((int(W * sc), int(330 * sc)), Image.LANCZOS)
            img.alpha_composite(with_alpha(lay, kl), (int(W / 2 - lay.width / 2), int(H / 2 - lay.height / 2)))
            img = img.convert('RGB')
            ImageDraw.Draw(img, 'RGBA').rectangle([W / 2 - 400 * kl, H / 2 + 128, W / 2 + 400 * kl, H / 2 + 138], fill=RED + (255,))
        return img


# swap the opener into v4's intro and render with v4's storyboard
_intro = V4.SEGS[0]
_intro.hud = Telemetry(V4.P)

if __name__ == '__main__':
    V4.OUT_NAME = 'v5'
    V4.main()
