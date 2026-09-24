"""Promo video v4 — follows promo/RULES.md.

- 90.00 s, one uncut track (Mixkit "Infected Mushroom Vibes"), mobile first,
  light-theme recordings of the latest main.
- Opening: a live-timing HUD built from the app's real race data (Spanish GP
  classification + Antonelli's fastest-lap telemetry): the car runs a full
  straight up to the rev limiter, shift lights flashing -- "on the limit".
- Brand: 온더리밋 badge logo on title/outro, no "F1", address bar 온더리밋.
- Type: Jalnan 2 titles, Barlow Condensed ExtraBold Italic accents,
  Pretendard body. Outro: no tech stack, credits only where the licence
  requires attribution (CC BY photos).
"""
import os, sys, json, math, subprocess, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFont

S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, S)
import make_video as B  # noqa: E402
import make_video2 as V2  # noqa: E402
import make_video3 as V3  # noqa: E402

# ---------------------------------------------------------------- fonts
_pretendard = B.font
FONT_FILES = {'Jalnan': '/root/.fonts/Jalnan2.otf', 'Barlow': '/root/.fonts/BarlowCondensed-ExtraBoldItalic.ttf'}


@functools.lru_cache(maxsize=256)
def font(w, s):
    if w in FONT_FILES:
        return ImageFont.truetype(FONT_FILES[w], s)
    return _pretendard(w, s)


for mod in (B, V2, V3):
    mod.font = font

from make_video import W, H, FPS, RED, ease_out, ease_io, with_alpha, anim_paste, text_layer, wrap, Browser, Phone, wipe, BGIMG, STREAKS  # noqa: E402

V2.CLIPS = f'{S}/clips4'
FF = V2.FF
SERVICE = '온더리밋'
V2.SERVICE = V3.SERVICE = SERVICE
PREVIEW = '--preview' in sys.argv

TOTAL = 90.0
MUSIC = '136.mp3'
P = 3.0            # music starts on the limiter cut; the track's natural ending then lands at ~89.7 s
BEAT = 0.412
V2.BEAT0, V2.BEAT = P, 2 * BEAT
DATA = f'{S}/v4'

GREEN, PURPLE, BLUE = (40, 214, 90), (170, 70, 255), (60, 120, 255)


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def txt(d, xy, s, w, size, fill, anchor='la'):
    d.text(xy, s, font=font(w, size), fill=fill, anchor=anchor)


# ---------------------------------------------------------------- live timing HUD
class LiveTiming:
    """Broadcast-style timing tower + telemetry for one full-throttle straight."""

    def __init__(self, dur):
        self.dur = dur
        res = json.load(open(f'{DATA}/results.json'))
        tel = json.load(open(f'{DATA}/tel_ant.json'))
        drv = {d['code']: d for d in json.load(open(f'{DATA}/drivers.json'))['drivers']}
        self.race = res['raceName'].upper()
        lead_laps = res['results'][0]['laps']
        fl = [x['driver']['code'] for x in res['results'] if x.get('fastestLap') and x['fastestLap']['rank'] == 1]
        self.fl = fl[0] if fl else None
        self.rows = []
        for x in res['results'][:10]:
            c = x['driver']['code']
            if x['position'] == '1':
                gap = 'LEADER'
            elif x['laps'] < lead_laps:
                gap = f'+{lead_laps - x["laps"]} LAP'
            else:
                gap = x['time'] or ''
            self.rows.append((int(x['position']), c, gap, hexrgb(drv.get(c, {}).get('teamColor', '888888'))))
        self.tel = tel['telemetry']
        # the longest full-throttle run of the lap
        best, s = (0, 0, 0), None
        for i, p in enumerate(self.tel):
            if p['throttle'] >= 98:
                s = i if s is None else s
                if i - s > best[0]:
                    best = (i - s, s, i)
            else:
                s = None
        self.i0, self.i1 = max(0, best[1] - 4), best[2]
        self.max_rpm = max(p['rpm'] for p in self.tel)
        self.top_speed = max(p['speed'] for p in self.tel[self.i0:self.i1 + 1])
        self.dmax = self.tel[-1]['distance']
        self.vmax = max(p['speed'] for p in self.tel)
        self.team = hexrgb(drv['ANT']['teamColor'])
        self.t_run0, self.t_run1 = 0.35, dur - 0.65   # straight plays here, then the limiter
        self.upshifts = []
        for i in range(self.i0 + 1, self.i1 + 1):
            if self.tel[i]['gear'] > self.tel[i - 1]['gear']:
                self.upshifts.append(self._t_of(i))
        self.bg = self._background()

    def _t_of(self, idx):
        k = (idx - self.i0) / max(1, self.i1 - self.i0)
        return self.t_run0 + k * (self.t_run1 - self.t_run0)

    def _sample(self, t):
        k = min(1.0, max(0.0, (t - self.t_run0) / (self.t_run1 - self.t_run0)))
        f = self.i0 + k * (self.i1 - self.i0)
        i = int(f)
        j = min(i + 1, len(self.tel) - 1)
        u = f - i
        a, b = self.tel[i], self.tel[j]
        lerp = lambda key: a[key] + (b[key] - a[key]) * u  # noqa: E731
        p = dict(distance=lerp('distance'), speed=lerp('speed'), rpm=lerp('rpm'), throttle=lerp('throttle'),
                 gear=a['gear'] if u < 0.5 else b['gear'], brake=a['brake'], drs=a['drs'] or b['drs'])
        if t > self.t_run1:  # on the limiter: hold top speed, rpm bouncing off the cut
            p['rpm'] = self.max_rpm - 180 + 180 * math.sin(t * 90)
            p['speed'] = self.top_speed
            p['gear'] = self.tel[self.i1]['gear']
        return p, f

    def _background(self):
        img = Image.new('RGB', (W, H), (7, 7, 10))
        a = np.asarray(img).astype(np.float32)
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        glow = np.exp(-(((x - 300) / 700) ** 2 + ((y - 540) / 600) ** 2))
        a += glow[..., None] * np.array([70, 6, 8])
        img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        d = ImageDraw.Draw(img, 'RGBA')
        for gx in range(0, W, 48):
            d.line([(gx, 0), (gx, H)], fill=(255, 255, 255, 7))
        for gy in range(0, H, 48):
            d.line([(0, gy), (W, gy)], fill=(255, 255, 255, 7))
        return img

    def frame(self, t):
        # draw on an opaque RGB canvas so translucent fills blend instead of
        # overwriting the alpha channel
        img = self.bg.copy()
        d = ImageDraw.Draw(img, 'RGBA')
        p, fidx = self._sample(t)
        # top bar
        k = ease_out(t / 0.3)
        d.rounded_rectangle([60, 40, 178, 88], 8, fill=RED + (int(255 * k),))
        blink = 255 if int(t * 4) % 2 == 0 else 150
        d.ellipse([74, 56, 90, 72], fill=(255, 255, 255, blink))
        txt(d, (100, 64), 'LIVE', 'Barlow', 34, (255, 255, 255, int(255 * k)), 'lm')
        txt(d, (200, 64), f'{self.race}  ·  ROUND 14  ·  MADRING', 'Barlow', 34, (230, 230, 236, int(255 * k)), 'lm')
        txt(d, (W - 60, 64), 'LAP 57 / 57', 'Barlow', 44, (255, 255, 255, int(255 * k)), 'rm')
        # timing tower
        x0, y0, rh = 60, 130, 76
        d.rectangle([x0, y0, x0 + 470, y0 + 44], fill=(255, 255, 255, 18))
        txt(d, (x0 + 16, y0 + 22), 'POS  DRIVER', 'Barlow', 26, (170, 170, 180), 'lm')
        txt(d, (x0 + 454, y0 + 22), 'GAP', 'Barlow', 26, (170, 170, 180), 'rm')
        for i, (pos, code, gap, col) in enumerate(self.rows):
            kk = ease_out((t - 0.05 - i * 0.06) / 0.35)
            if kk <= 0:
                continue
            ox = int(-500 * (1 - kk))
            y = y0 + 52 + i * rh
            hl = code == 'ANT'
            d.rectangle([x0 + ox, y, x0 + 470 + ox, y + rh - 8], fill=(255, 255, 255, 34 if hl else 14))
            txt(d, (x0 + 18 + ox, y + rh // 2 - 4), str(pos), 'Barlow', 40, (255, 255, 255), 'lm')
            d.rectangle([x0 + 76 + ox, y + 12, x0 + 84 + ox, y + rh - 20], fill=col + (255,))
            txt(d, (x0 + 100 + ox, y + rh // 2 - 4), code, 'Barlow', 42, (255, 255, 255), 'lm')
            if code == self.fl:
                d.rounded_rectangle([x0 + 190 + ox, y + 20, x0 + 234 + ox, y + rh - 28], 5, fill=PURPLE + (255,))
                txt(d, (x0 + 212 + ox, y + rh // 2 - 4), 'FL', 'Barlow', 24, (255, 255, 255), 'mm')
            g = gap
            if gap.startswith('+') and 'LAP' not in gap and t < self.t_run1:
                # gaps tick while the timing screen is "live"
                try:
                    base = float(gap.replace('+', '').split(':')[-1])
                    g = gap.rsplit('.', 1)[0] + '.' + f'{(int(base * 1000) + int(t * 37 * (i + 1))) % 1000:03d}'
                except ValueError:
                    pass
            txt(d, (x0 + 454 + ox, y + rh // 2 - 4), g, 'Barlow', 34, (225, 225, 232) if gap != 'LEADER' else RED + (255,), 'rm')
        # telemetry panel
        px0, py0 = 600, 130
        kp = ease_out((t - 0.1) / 0.4)
        off = int(60 * (1 - kp))
        d.rectangle([px0 + off, py0, W - 60 + off, py0 + 44], fill=(255, 255, 255, 18))
        d.rectangle([px0 + off, py0, px0 + 8 + off, py0 + 44], fill=self.team + (255,))
        txt(d, (px0 + 24 + off, py0 + 22), '12  ANT  ·  ANDREA KIMI ANTONELLI  ·  MERCEDES', 'Barlow', 28, (240, 240, 245), 'lm')
        txt(d, (W - 76 + off, py0 + 22), 'FASTEST LAP · TELEMETRY', 'Barlow', 26, (170, 170, 180), 'rm')
        # shift lights
        n = 15
        lit = max(0.0, min(1.0, (p['rpm'] - 9800) / (self.max_rpm - 9800 - 150))) * n
        limiter = t > self.t_run1
        flash_on = int(t * 16) % 2 == 0
        cx0, cy = px0 + 150 + off, 250
        for i in range(n):
            x = cx0 + i * 64
            base = GREEN if i < 5 else (RED if i < 10 else PURPLE)
            if limiter:
                col = BLUE + (255,) if flash_on else (30, 30, 40, 255)
            elif i < lit:
                col = base + (255,)
            else:
                col = (38, 38, 46, 255)
            d.ellipse([x - 22, cy - 22, x + 22, cy + 22], fill=col)
            if (i < lit and not limiter) or (limiter and flash_on):
                d.ellipse([x - 30, cy - 30, x + 30, cy + 30], outline=col[:3] + (90,), width=4)
        # big readouts
        sp = int(round(p['speed']))
        txt(d, (px0 + 20 + off, 520), f'{sp}', 'Barlow', 260, (255, 255, 255), 'ls')
        txt(d, (px0 + 30 + off + font('Barlow', 260).getlength(f'{sp}'), 520), 'KM/H', 'Barlow', 48, (180, 180, 190), 'ls')
        gx = px0 + 640 + off
        d.rounded_rectangle([gx, 300, gx + 190, 530], 16, outline=(255, 255, 255, 60), width=3)
        txt(d, (gx + 95, 330), 'GEAR', 'Barlow', 28, (170, 170, 180), 'mm')
        txt(d, (gx + 95, 440), str(p['gear']), 'Barlow', 170, RED + (255,) if limiter else (255, 255, 255), 'mm')
        # rpm bar
        rx, ry, rw = gx + 230, 320, 420
        txt(d, (rx, ry - 6), 'RPM', 'Barlow', 28, (170, 170, 180), 'ls')
        txt(d, (rx + rw, ry - 6), f'{int(p["rpm"]):,}', 'Barlow', 40, (255, 255, 255), 'rs')
        d.rectangle([rx, ry + 8, rx + rw, ry + 40], fill=(38, 38, 46))
        fr = p['rpm'] / (self.max_rpm + 200)
        d.rectangle([rx, ry + 8, rx + int(rw * fr), ry + 40], fill=(RED if fr > 0.9 else (255, 255, 255)) + (255,))
        d.rectangle([rx + int(rw * 0.9), ry + 8, rx + rw, ry + 40], outline=RED + (160,), width=2)
        # throttle / brake / DRS
        for j, (lab, val, col) in enumerate([('THROTTLE', p['throttle'] / 100, GREEN), ('BRAKE', 1.0 if p['brake'] else 0.0, RED)]):
            yy = ry + 90 + j * 70
            txt(d, (rx, yy), lab, 'Barlow', 26, (170, 170, 180), 'ls')
            txt(d, (rx + rw, yy), f'{int(val * 100)}%', 'Barlow', 34, (255, 255, 255), 'rs')
            d.rectangle([rx, yy + 10, rx + rw, yy + 34], fill=(38, 38, 46))
            d.rectangle([rx, yy + 10, rx + int(rw * val), yy + 34], fill=col + (255,))
        drs = p['drs'] and p['drs'] >= 10
        d.rounded_rectangle([rx, ry + 236, rx + 130, ry + 282], 8, fill=(GREEN + (255,)) if drs else (38, 38, 46, 255))
        txt(d, (rx + 65, ry + 259), 'DRS', 'Barlow', 32, (10, 10, 12) if drs else (120, 120, 130), 'mm')
        # speed trace over the lap
        tx0, ty0, tx1, ty1 = px0 + off, 640, W - 60 + off, 1010
        d.rectangle([tx0, ty0, tx1, ty1], fill=(255, 255, 255, 8))
        txt(d, (tx0 + 16, ty0 + 30), 'SPEED TRACE  ·  LAP 57', 'Barlow', 26, (170, 170, 180), 'lm')
        pts = []
        for q in self.tel:
            x = tx0 + 20 + (q['distance'] / self.dmax) * (tx1 - tx0 - 40)
            y = ty1 - 20 - (q['speed'] / (self.vmax + 20)) * (ty1 - ty0 - 70)
            pts.append((x, y))
        d.line(pts, fill=(255, 255, 255, 60), width=3)
        cur = int(fidx)
        seg = pts[self.i0:cur + 1]
        if len(seg) > 1:
            d.line(seg, fill=RED + (255,), width=6)
        cxp = pts[min(cur, len(pts) - 1)]
        d.line([(cxp[0], ty0 + 50), (cxp[0], ty1 - 10)], fill=(255, 255, 255, 120), width=2)
        d.ellipse([cxp[0] - 9, cxp[1] - 9, cxp[0] + 9, cxp[1] + 9], fill=(255, 255, 255))
        # "ON THE LIMIT" on the limiter
        if limiter:
            kl = ease_out((t - self.t_run1) / 0.2)
            img = img.convert('RGBA')
            img.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, int(120 * kl))))
            f = font('Barlow', 230)
            label = 'ON THE LIMIT'
            wlab = f.getlength(label)
            lay = Image.new('RGBA', (W, 320), (0, 0, 0, 0))
            ld = ImageDraw.Draw(lay)
            ld.text((W / 2 - wlab / 2, 30), label, font=f, fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=RED + (255,))
            sc = 1.25 - 0.25 * kl
            lay = lay.resize((int(W * sc), int(320 * sc)), Image.LANCZOS)
            img.alpha_composite(with_alpha(lay, kl), (int(W / 2 - lay.width / 2), int(H / 2 - lay.height / 2)))
            img = img.convert('RGB')
            ImageDraw.Draw(img, 'RGBA').rectangle([W / 2 - 380 * kl, H / 2 + 120, W / 2 + 380 * kl, H / 2 + 130], fill=RED + (255,))
        return img


# ---------------------------------------------------------------- intro
class Intro(V3.Intro):
    def __init__(self):
        super().__init__()   # photos, montage timing (P + 6 cuts of two beats)
        self.hud = LiveTiming(P)
        self.words = [V2.outline_text(w, 200, 5, fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), weight='Barlow') for w in self.WORDS]
        self.logo = Image.open(f'{DATA}/logo_ko_dark.png').convert('RGBA')
        tag = '레이스의 모든 순간을, 데이터로'
        self.tag = text_layer([(tag, 'Jalnan', 56, (245, 245, 248), 0)], 1400)
        self.tag_w = font('Jalnan', 56).getbbox(tag)[2]

    def start(self):
        pass

    def stop(self):
        pass

    def frame(self, t):
        if t < P:
            return self.hud.frame(t)
        if t < self.t_title:
            i = int((t - P) / V2.BEAT)
            lt = (t - P) - i * V2.BEAT
            img = self.photos[i].frame(1.18 - 0.14 * ease_out(lt / V2.BEAT), 0.35 + 0.3 * (i % 2), 0.5).convert('RGBA')
            img.alpha_composite(V2.VIG)
            STREAKS.draw(img, t * 1.6, 2.2, 0.9)
            w = self.words[i]
            wx = int(W / 2 - w.width / 2 + (1 - ease_out(lt / 0.35)) * (-240 if i % 2 else 240))
            img.alpha_composite(with_alpha(w, min(1, lt / 0.1)), (wx, H // 2 - w.height // 2))
            if lt < 0.07:
                img.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(200 * (1 - lt / 0.07)))))
            return img.convert('RGB')
        lt = t - self.t_title
        img = V2.grade(self.bg.frame(1.12 - 0.06 * min(1, lt / 3), 0.5, 0.45), dark=0.55).convert('RGBA')
        img.alpha_composite(V2.VIG)
        STREAKS.draw(img, t, 1.0, 0.6)
        sx, sy = V2.shake(t, self.t_title, 22)
        k = ease_out(lt / 0.28)
        sc = (1.55 - 0.55 * k) * 0.9
        lg = self.logo.resize((int(self.logo.width * sc), int(self.logo.height * sc)), Image.LANCZOS)
        img.alpha_composite(with_alpha(lg, min(1, k * 1.5)), (W // 2 - lg.width // 2 + sx, 400 - lg.height // 2 + sy))
        if lt < 0.1:
            img.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(230 * (1 - lt / 0.1)))))
        anim_paste(img, self.tag, (W - self.tag_w) // 2, 650, lt, 0.45, dx=0)
        return img.convert('RGB')


# ---------------------------------------------------------------- captions with the v4 type system
def jalnan_title(title, size):
    return text_layer([(title, 'Jalnan', size, 'white', 0)], 1100), font('Jalnan', size).getbbox(title)[2]


class Desktop(V3.DesktopWide):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.t, self.tw = jalnan_title(a[4], 46)


class Mobile(V2.Mobile):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.title, _ = jalnan_title(a[4], 80)


class MobileHero(V3.MobileHero):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.l1 = text_layer([('손 안의', 'Jalnan', 104, 'white', 0)], 1000)
        self.l2 = text_layer([('온더리밋', 'Jalnan', 124, RED, 0)], 1000)
        self.sub = text_layer([('스마트폰 하나로 시즌의 모든 데이터를', 'SemiBold', 40, (225, 225, 232), 0)], 1000)

    def frame(self, t):
        # same as v3, with the title block shifted for the larger wordmark
        img = BGIMG.copy().convert('RGBA')
        STREAKS.draw(img, t + 5, 0.6, 0.6)
        k = ease_out(t / 0.8)
        self.ph.draw(img, self.r.next(), 1200, int((H - self.ph.size[1]) // 2 + 220 * (1 - k)))
        anim_paste(img, self.l1, 200, 230, t, 0.05, dx=-80)
        anim_paste(img, self.l2, 200, 350, t, 0.18, dx=-80)
        anim_paste(img, self.sub, 204, 540, t, 0.35)
        for i, b in enumerate(self.bul):
            anim_paste(img, b, 204, 630 + i * 60, t, 0.6 + i * 0.15)
        return img.convert('RGB')


class WideStinger(V3.WideStinger):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.l1 = text_layer([('데스크탑에서는', 'Jalnan', 92, 'white', 0)], 1400)
        self.l2 = text_layer([('더 넓게, 한눈에.', 'Jalnan', 92, RED, 0)], 1400)


class Compare(V3.Compare):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.t, self.tw = jalnan_title(a[2], 46)


PHOTO_CREDIT = '사진: franpe · polarjez · Michael Elleray · nan palmero · Nick J Webb · Ben Sutherland (Flickr, CC BY 2.0)'


class Outro(V2.Seg):
    def __init__(self, dur):
        self.dur = dur
        self.ph = V2.Photo('ov115', 1.15)
        self.logo = Image.open(f'{DATA}/logo_tag_dark.png').convert('RGBA')
        self.logo = self.logo.resize((int(self.logo.width * 0.78), int(self.logo.height * 0.78)), Image.LANCZOS)
        self.tag = text_layer([('레이스의 모든 순간을, 데이터로', 'Jalnan', 50, (245, 245, 248), 0)], 1200)
        feats = ['스케줄', '스탠딩', '레이스 결과', '타임라인 · 리플레이', '텔레메트리', '인시던트', '라이트 / 다크', '한 / EN']
        self.chips = [B.chip(x, 25, (34, 34, 42)) for x in feats]
        self.cred = text_layer([(PHOTO_CREDIT, 'Medium', 18, (140, 140, 152), 0)], 1800)

    def frame(self, t):
        z = 1.04 + 0.05 * (t / self.dur)
        img = V2.grade(self.ph.frame(z, 0.62, 0.45), dark=0.3).convert('RGBA')
        img.alpha_composite(V2.LGRAD)
        img.alpha_composite(V2.LGRAD)
        img.alpha_composite(V2.VIG)
        STREAKS.draw(img, t + 20, 0.5, 0.5)
        sx, sy = V2.shake(t, 0.0, 14)
        k = ease_out(t / 0.5)
        img.alpha_composite(with_alpha(self.logo, k), (int(140 - 80 * (1 - k)) + sx, 200 + sy))
        anim_paste(img, self.tag, 156, 560, t, 0.45)
        x, y = 156, 660
        for i, c in enumerate(self.chips):
            if x + c.width > 1600:
                x, y = 156, y + c.height + 12
            anim_paste(img, c, x, y, t, 0.8 + i * 0.07, dx=0)
            x += c.width + 12
        anim_paste(img, self.cred, 156, H - 70, t, 1.6, dx=0)
        fo = ease_io((t - (self.dur - 1.2)) / 1.2)
        if fo > 0:
            img.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, int(255 * fo))))
        return img.convert('RGB')


SEGS = [
    Intro(),
    MobileHero('m01_dashboard', 0.2, 6.4, 1.24),
    Mobile('m02_schedule', 0.2, 6.9, 1.22, '스케줄', '시즌 전체 그랑프리 일정을 한국 시간(KST)으로', ['레이스만 / 전 세션 보기', '다음 레이스로 바로 이동']),
    Mobile('m03_standings', 0.2, 6.1, 1.07, '스탠딩', '드로어 메뉴에서 바로 드라이버 · 컨스트럭터 순위로', ['라운드별 순위 변동 차트', '이번 라운드 획득 포인트'], side='left'),
    Mobile('m04_results', 0.2, 8.4, 1.5, '레이스 결과', '포디움부터 전체 순위, 퀄리파잉 Q1–Q3 기록까지', ['그리드 · 기록 · 패스티스트 랩']),
    Mobile('m05_timeline', 0.3, 15.7, 2.05, '타임라인 · 리플레이', '랩마다 바뀌는 순위를 차트와 리플레이로', ['30x ~ 480x 재생', '타이어 · 플래그 · 세이프티카'], side='left'),
    Mobile('m06_telemetry', 0.3, 10.0, 1.62, '텔레메트리', '두 드라이버의 속도 · RPM · 기어를 거리 기준으로 비교', ['최속랩 자동 선택', '스피드 트랩 기록']),
    Mobile('m07_incidents', 0.2, 6.8, 1.37, '인시던트', '레이스 컨트롤 메시지를 카테고리와 랩별 밀도로', ['Flag · SafetyCar 필터'], side='left'),
    WideStinger(3.0),
    Desktop('w01_drivers', 4.6, 10.8, 1.13, '드라이버 스탠딩', '전체 순위표와 라운드별 순위 변동 차트를 나란히'),
    Desktop('w02_timeline', 0.2, 20.6, 2.8, '레이스 타임라인', '57랩 · 22명의 순위 흐름을 한 장의 차트로, 이어서 리플레이까지'),
    Desktop('w03_telemetry', 0.2, 12.1, 2.15, '텔레메트리', '랩 리스트 옆에서 두 드라이버의 속도와 페달 입력을 넓게 비교'),
    Desktop('w04_schedule', 0.2, 7.1, 1.53, '스케줄', '시즌 전체 일정을 4열 그리드로 한눈에'),
    Compare(('m03_standings', 2.6, 6.1, 0.64), ('w01_drivers', 5.0, 10.5, 1.0), '같은 데이터, 더 넓은 시야', '모바일과 데스크탑에서 같은 스탠딩'),
]


def main():
    used = sum(s.dur for s in SEGS)
    outro = Outro(round(TOTAL - used, 4))
    segs = SEGS + [outro]
    starts, t = [], 0.0
    for s in segs:
        starts.append(t); t += s.dur
    total = t
    print(f'total {total:.2f}s  outro {outro.dur:.2f}s')
    for s, st in zip(segs, starts):
        print(f'  {st:6.2f}  {s.dur:5.2f}  {type(s).__name__} {getattr(s, "name", "")}')
    if outro.dur < 6:
        raise SystemExit('outro too short; trim scenes')

    intro = segs[0]
    hud = intro.hud
    ev = [(0.0, '2724', 0.9, (0.0, P + 0.1)),              # engine building up the straight
          (P - 0.3, '1490', 0.6, None),                     # whoosh into the cut
          (intro.t_title, '2902', 0.9, None)]               # logo slam
    for tu in hud.upshifts:
        ev.append((tu, '2730', 0.55, (0.0, 0.45)))          # gear change on every real upshift
    for i in range(1, len(segs)):
        st, s = starts[i], segs[i]
        if isinstance(s, (WideStinger, MobileHero)):
            ev.append((st - 0.45, '1538', 0.9, None))
        elif isinstance(s, Outro):
            ev.append((st - 0.2, '2918', 0.8, None))
        else:
            ev.append((st - 0.28, '1492' if i % 2 else '1490', 0.45, None))
    wav = f'{S}/out/audio_v4.wav'
    os.makedirs(f'{S}/out', exist_ok=True)
    V2.build_audio(total, ev, [(MUSIC, 0.0, P, total, 0.0, 0.6, 0.8)], wav)
    print('audio done')

    out = f'{S}/out/promo_v4.mp4' if not PREVIEW else f'{S}/out/preview_v4.mp4'
    enc = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast' if PREVIEW else 'medium',
                            '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
                            '-c:a', 'aac', '-b:a', '192k', '-t', f'{TOTAL:.3f}', out], stdin=subprocess.PIPE)

    def is_app(s):
        return isinstance(s, (V2.Desktop, V2.Mobile, V3.Compare))

    WT = 0.26
    nframes = int(round(TOTAL * FPS))
    seg_i, cur = -1, None
    for fi in range(nframes):
        gt = fi / FPS
        while seg_i + 1 < len(segs) and gt >= starts[seg_i + 1] - 1e-6:
            if cur is not None:
                cur.stop()
            seg_i += 1
            cur = segs[seg_i]
            cur.start()
        lt = gt - starts[seg_i]
        img = cur.frame(lt)
        nxt = seg_i + 1
        if nxt < len(segs) and is_app(cur) and is_app(segs[nxt]) and starts[nxt] - gt <= WT:
            wipe(img, 1 - (starts[nxt] - gt) / WT, cover=True)
        if seg_i > 0 and is_app(cur) and is_app(segs[seg_i - 1]) and lt < WT:
            wipe(img, lt / WT, cover=False)
        if seg_i > 0 and (not is_app(cur) or not is_app(segs[seg_i - 1])) and lt < 0.08 and not isinstance(cur, Outro):
            img = Image.blend(img, Image.new('RGB', (W, H), (255, 255, 255)), 0.6 * (1 - lt / 0.08))
        enc.stdin.write(img.tobytes())
        if fi % 300 == 0:
            print(f'frame {fi}/{nframes}', flush=True)
    cur.stop()
    enc.stdin.close()
    enc.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
