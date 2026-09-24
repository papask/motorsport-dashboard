import os, sys, math, subprocess, random
import numpy as np
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = os.path.dirname(os.path.abspath(__file__))
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1920, 1080, 30
FONT = '/root/.fonts/Pretendard-%s.otf'
RED = (225, 6, 0)
BG = (11, 11, 16)
PREVIEW = '--preview' in sys.argv


def font(w, s):
    return ImageFont.truetype(FONT % w, s)


def ease_out(k):
    k = max(0.0, min(1.0, k))
    return 1 - (1 - k) ** 3


def ease_io(k):
    k = max(0.0, min(1.0, k))
    return 3 * k * k - 2 * k * k * k


# ---------------------------------------------------------------- clip reader
class Reader:
    def __init__(self, name, t_in, t_out, speed, w, h):
        self.w, self.h = w, h
        path = f'{S}/clips/{name}.mp4'
        vf = f'setpts=(PTS-STARTPTS)/{speed},fps={FPS},scale={w}:{h}:flags=lanczos'
        self.p = subprocess.Popen([FF, '-loglevel', 'error', '-ss', str(t_in), '-t', str(t_out - t_in), '-i', path,
                                   '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
        self.last = None

    def next(self):
        n = self.w * self.h * 3
        buf = self.p.stdout.read(n)
        if len(buf) == n:
            self.last = Image.frombuffer('RGB', (self.w, self.h), buf, 'raw', 'RGB', 0, 1)
        return self.last

    def close(self):
        try:
            self.p.stdout.close(); self.p.kill()
        except Exception:
            pass


def clip_len(t_in, t_out, speed):
    return (t_out - t_in) / speed


# ---------------------------------------------------------------- static art
def make_bg():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    base = np.zeros((H, W, 3), np.float32) + np.array(BG, np.float32)
    g1 = np.exp(-(((x - 1650) / 700) ** 2 + ((y + 150) / 520) ** 2))
    g2 = np.exp(-(((x - 150) / 650) ** 2 + ((y - 1200) / 500) ** 2))
    base += g1[..., None] * np.array([120, 8, 6]) * 0.55
    base += g2[..., None] * np.array([40, 30, 90]) * 0.35
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img, 'RGBA')
    for gx in range(0, W, 64):
        d.line([(gx, 0), (gx, H)], fill=(255, 255, 255, 6))
    for gy in range(0, H, 64):
        d.line([(0, gy), (W, gy)], fill=(255, 255, 255, 6))
    for i in range(6):
        x0 = 1350 + i * 46
        d.polygon([(x0, H), (x0 + 22, H), (x0 + 22 + 380, H - 380), (x0 + 380, H - 380)], fill=(225, 6, 0, 18 - i * 2))
    return img


BGIMG = make_bg()


def rounded_mask(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], r, fill=255)
    return m


def shadow(size, r, blur=28, alpha=170, spread=0):
    pad = blur * 3
    im = Image.new('RGBA', (size[0] + pad * 2, size[1] + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([pad - spread, pad - spread, pad + size[0] + spread, pad + size[1] + spread], r, fill=(0, 0, 0, alpha))
    return im.filter(ImageFilter.GaussianBlur(blur)), pad


class Browser:
    BAR = 40

    def __init__(self, cw, ch, url):
        self.cw, self.ch = cw, ch
        self.size = (cw, ch + self.BAR)
        self.sh, self.pad = shadow(self.size, 14)
        chrome = Image.new('RGBA', self.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(chrome)
        d.rounded_rectangle([0, 0, cw - 1, ch + self.BAR - 1], 14, fill=(30, 30, 38, 255), outline=(62, 62, 74, 255))
        for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
            d.ellipse([18 + i * 22, 14, 30 + i * 22, 26], fill=c)
        uw = min(620, cw - 260)
        ux = (cw - uw) // 2
        d.rounded_rectangle([ux, 8, ux + uw, 32], 12, fill=(18, 18, 24, 255))
        f = font('Medium', 15)
        d.text((ux + 36, 20), url, font=f, fill=(190, 190, 205), anchor='lm')
        d.text((ux + 16, 20), '🔒' if False else '●', font=font('Bold', 10), fill=(90, 200, 120), anchor='mm')
        self.chrome = chrome
        self.mask = Image.new('L', (cw, ch), 255)
        md = ImageDraw.Draw(self.mask)
        # round only the bottom corners
        rm = rounded_mask((cw, ch + 30), 14).crop((0, 30, cw, ch + 30))
        self.mask = rm

    def draw(self, canvas, frame, x, y):
        canvas.paste(self.sh, (x - self.pad, y - self.pad + 10), self.sh)
        canvas.paste(self.chrome, (x, y), self.chrome)
        canvas.paste(frame, (x, y + self.BAR), self.mask)


class Phone:
    def __init__(self, sw, sh_content):
        self.sw, self.content_h = sw, sh_content
        self.status = int(sw * 0.115)
        self.scr_h = sh_content + self.status
        self.bez = int(sw * 0.032)
        self.size = (sw + self.bez * 2, self.scr_h + self.bez * 2)
        R = int(sw * 0.14)
        self.shd, self.pad = shadow(self.size, R, blur=30, alpha=190)
        body = Image.new('RGBA', self.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(body)
        d.rounded_rectangle([0, 0, self.size[0] - 1, self.size[1] - 1], R, fill=(22, 22, 28, 255), outline=(90, 90, 104, 255), width=3)
        d.rounded_rectangle([4, 4, self.size[0] - 5, self.size[1] - 5], R - 4, outline=(40, 40, 48, 255), width=2)
        # side buttons
        bx = self.size[0]
        d.rounded_rectangle([bx - 3, int(self.size[1] * 0.22), bx + 2, int(self.size[1] * 0.32)], 2, fill=(70, 70, 80, 255))
        d.rounded_rectangle([-2, int(self.size[1] * 0.18), 3, int(self.size[1] * 0.23)], 2, fill=(70, 70, 80, 255))
        d.rounded_rectangle([-2, int(self.size[1] * 0.26), 3, int(self.size[1] * 0.34)], 2, fill=(70, 70, 80, 255))
        self.body = body
        scr = Image.new('RGB', (sw, self.scr_h), (12, 12, 18))
        sd = ImageDraw.Draw(scr)
        fs = max(12, int(self.status * 0.36))
        sd.text((int(sw * 0.14), self.status // 2 + 2), '9:41', font=font('SemiBold', fs), fill='white', anchor='mm')
        iw, ih = int(sw * 0.3), int(self.status * 0.62)
        sd.rounded_rectangle([(sw - iw) // 2, (self.status - ih) // 2 + 2, (sw + iw) // 2, (self.status + ih) // 2 + 2], ih // 2, fill=(0, 0, 0))
        bxr = int(sw * 0.82)
        for i in range(4):
            hh = 4 + i * 3
            sd.rectangle([bxr + i * 6, self.status // 2 + 7 - hh, bxr + i * 6 + 3, self.status // 2 + 7], fill='white')
        sd.rounded_rectangle([bxr + 30, self.status // 2 - 5, bxr + 52, self.status // 2 + 7], 3, outline='white', width=2)
        sd.rectangle([bxr + 33, self.status // 2 - 2, bxr + 46, self.status // 2 + 4], fill='white')
        self.scr_base = scr
        self.scr_mask = rounded_mask((sw, self.scr_h), R - self.bez)

    def draw(self, canvas, frame, x, y):
        canvas.paste(self.shd, (x - self.pad, y - self.pad + 14), self.shd)
        canvas.paste(self.body, (x, y), self.body)
        scr = self.scr_base.copy()
        scr.paste(frame, (0, self.status))
        canvas.paste(scr, (x + self.bez, y + self.bez), self.scr_mask)


# ---------------------------------------------------------------- captions
def chip(text, fsz=22, fill=RED, fg='white'):
    f = font('Bold', fsz)
    tw = f.getbbox(text)[2]
    im = Image.new('RGBA', (tw + 30, fsz + 18), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], 8, fill=fill)
    d.text((15, im.height // 2), text, font=f, fill=fg, anchor='lm')
    return im


def text_layer(lines, width=1800):
    """lines: list of (text, weight, size, color, gap_after)"""
    hts = []
    for t, w, s, c, g in lines:
        hts.append(s + g)
    im = Image.new('RGBA', (width, sum(hts) + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    y = 0
    for (t, w, s, c, g) in lines:
        d.text((0, y), t, font=font(w, s), fill=c)
        y += s + g
    return im


def wrap(text, f, maxw):
    out, cur = [], ''
    for word in text.split(' '):
        test = (cur + ' ' + word).strip()
        if f.getbbox(test)[2] > maxw and cur:
            out.append(cur); cur = word
        else:
            cur = test
    if cur:
        out.append(cur)
    return out


def with_alpha(layer, a):
    if a >= 0.999:
        return layer
    l = layer.copy()
    al = l.getchannel('A').point(lambda v: int(v * a))
    l.putalpha(al)
    return l


def anim_paste(canvas, layer, x, y, t, delay=0.0, dx=-40, dur=0.6):
    k = ease_out((t - delay) / dur)
    if k <= 0:
        return
    canvas.alpha_composite(with_alpha(layer, k), (int(x + dx * (1 - k)), int(y))) if canvas.mode == 'RGBA' else \
        canvas.paste(with_alpha(layer, k), (int(x + dx * (1 - k)), int(y)), with_alpha(layer, k))


# ---------------------------------------------------------------- effects
class Streaks:
    def __init__(self, n=46, seed=3):
        r = random.Random(seed)
        self.items = []
        for _ in range(n):
            self.items.append(dict(y=r.uniform(0, H), x=r.uniform(0, W * 1.5), L=r.uniform(120, 520), sp=r.uniform(900, 2600),
                                   w=r.choice([1, 2, 2, 3]), c=r.choice([(225, 6, 0), (255, 255, 255), (255, 60, 40), (120, 120, 140)]),
                                   a=r.uniform(40, 150)))

    def draw(self, img, t, speed=1.0, alpha=1.0):
        d = ImageDraw.Draw(img, 'RGBA')
        for s in self.items:
            x = (s['x'] - s['sp'] * t * speed) % (W + 700) - 350
            d.line([(x, s['y']), (x + s['L'], s['y'])], fill=s['c'] + (int(s['a'] * alpha),), width=s['w'])


STREAKS = Streaks()


def bump_lines(seed=5, n=7, steps=24):
    r = random.Random(seed)
    cols = [(255, 128, 0), (39, 244, 210), (54, 113, 198), (232, 0, 45), (100, 196, 255), (34, 153, 113), (255, 215, 0)]
    ranks = list(range(n))
    hist = [ranks[:]]
    for _ in range(steps):
        i = r.randrange(n - 1)
        ranks = ranks[:]
        a, b = ranks.index(i), ranks.index(i + 1)
        ranks[a], ranks[b] = ranks[b], ranks[a]
        hist.append(ranks[:])
    lines = []
    for d_ in range(n):
        pts = [(160 + k * (W - 320) / steps, 560 + 52 * h.index(d_) if False else 750 + 32 * hi[d_]) for k, hi in enumerate(hist)]
        lines.append((cols[d_], pts))
    return lines


BUMP = bump_lines()


def draw_bump(img, prog, alpha=0.35):
    d = ImageDraw.Draw(img, 'RGBA')
    for c, pts in BUMP:
        m = prog * (len(pts) - 1)
        k = int(m)
        seg = pts[:k + 1]
        if k + 1 < len(pts):
            f = m - k
            (x0, y0), (x1, y1) = pts[k], pts[k + 1]
            seg = seg + [(x0 + (x1 - x0) * f, y0 + (y1 - y0) * ease_io(f))]
        if len(seg) > 1:
            # smooth steps: draw as eased segments
            path = []
            for i in range(len(seg) - 1):
                (x0, y0), (x1, y1) = seg[i], seg[i + 1]
                for s in range(8):
                    u = s / 8
                    path.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * ease_io(u)))
            path.append(seg[-1])
            d.line(path, fill=c + (int(255 * alpha),), width=4, joint='curve')
            ex, ey = seg[-1]
            d.ellipse([ex - 6, ey - 6, ex + 6, ey + 6], fill=c + (int(255 * min(1, alpha * 2)),))


def wipe(img, p, cover=True):
    """p in [0,1]; cover: red sweeps in from left; uncover: sweeps out to right."""
    d = ImageDraw.Draw(img, 'RGBA')
    sk = 360
    span = W + sk + 200
    if cover:
        lead = -sk + ease_io(p) * span
        trail = -span
    else:
        lead = W + sk + 400
        trail = -sk + ease_io(p) * span
    d.polygon([(trail, 0), (lead + sk, 0), (lead, H), (trail - sk, H)], fill=(150, 0, 0, 255))
    lead2, trail2 = (lead - 90, trail) if cover else (lead, trail + 90)
    d.polygon([(trail2, 0), (lead2 + sk, 0), (lead2, H), (trail2 - sk, H)], fill=RED + (255,))
    if cover:
        d.polygon([(lead + sk, 0), (lead + sk + 14, 0), (lead + 14, H), (lead, H)], fill=(255, 255, 255, 230))
    else:
        d.polygon([(trail2 - 14 + 0, 0), (trail2, 0), (trail2 - sk, H), (trail2 - sk - 14, H)], fill=(255, 255, 255, 230))


# ---------------------------------------------------------------- segments
DISCLAIMER = '※ 화면 속 경기 기록은 앱 시연을 위해 생성한 샘플 데이터입니다.'


class Seg:
    cont = False  # continues the previous clip (no wipe)
    def start(self): pass
    def frame(self, t): raise NotImplementedError
    def stop(self): pass


class Intro(Seg):
    def __init__(self, dur=4.6):
        self.dur = dur
        f1 = font('Black', 168)
        self.title = Image.new('RGBA', (1100, 220), (0, 0, 0, 0))
        d = ImageDraw.Draw(self.title)
        w1 = f1.getbbox('F1 ')[2]
        tot = w1 + f1.getbbox('대시보드')[2]
        x0 = (1100 - tot) // 2
        d.text((x0, 10), 'F1', font=f1, fill=RED)
        d.text((x0 + w1, 10), '대시보드', font=f1, fill='white')
        self.sub = text_layer([('포뮬러 1 시즌 데이터를 한눈에', 'SemiBold', 50, (230, 230, 238), 0)], 900)
        self.sub_w = font('SemiBold', 50).getbbox('포뮬러 1 시즌 데이터를 한눈에')[2]
        self.chips = [chip('🖥  DESKTOP'.replace('🖥  ', ''), 26, (40, 40, 52)), chip('MOBILE', 26, (40, 40, 52))]
        self.disc = text_layer([(DISCLAIMER, 'Medium', 20, (140, 140, 155), 0)], 1000)
        self.disc_w = font('Medium', 20).getbbox(DISCLAIMER)[2]

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        STREAKS.draw(img, t, 1.0, min(1, t / 0.4))
        draw_bump(img, min(1, t / 3.8), 0.22)
        # checkered strip
        d = ImageDraw.Draw(img, 'RGBA')
        off = int(t * 120) % 48
        for i in range(-1, W // 24 + 2):
            for j in range(2):
                if (i + j) % 2 == 0:
                    x = i * 24 - off
                    d.rectangle([x, 60 + j * 24, x + 23, 60 + j * 24 + 23], fill=(255, 255, 255, 26))
                    d.rectangle([x, H - 108 + j * 24, x + 23, H - 108 + j * 24 + 23], fill=(255, 255, 255, 26))
        k = ease_out((t - 0.25) / 0.8)
        if k > 0:
            sc = 1.25 - 0.25 * k
            tl = self.title.resize((int(1100 * sc), int(220 * sc)), Image.LANCZOS)
            img.alpha_composite(with_alpha(tl, k), ((W - tl.width) // 2, int(300 - (tl.height - 220) / 2)))
        kb = ease_out((t - 0.9) / 0.6)
        if kb > 0:
            bw = int(560 * kb)
            d.rectangle([(W - bw) // 2, 548, (W + bw) // 2, 554], fill=RED + (255,))
        anim_paste(img, self.sub, (W - self.sub_w) // 2, 590, t, 1.1, dx=0)
        cx = W // 2
        c1, c2 = self.chips
        gap = 20
        tot = c1.width + c2.width + gap
        anim_paste(img, c1, cx - tot // 2, 690, t, 1.6, dx=-30)
        anim_paste(img, c2, cx - tot // 2 + c1.width + gap, 690, t, 1.8, dx=30)
        anim_paste(img, self.disc, (W - self.disc_w) // 2, H - 60, t, 2.0, dx=0)
        return img.convert('RGB')


class Card(Seg):
    def __init__(self, dur, big1, big2, sub):
        self.dur = dur
        self.l1 = text_layer([(big1, 'Black', 110, 'white', 0)], 1600)
        self.l2 = text_layer([(big2, 'Black', 110, RED, 0)], 1600)
        self.sub = text_layer([(sub, 'SemiBold', 40, (200, 200, 212), 0)], 1600)
        self.ph = Phone(170, 350)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        STREAKS.draw(img, t + 7, 0.7, 0.8)
        anim_paste(img, self.l1, 200, 330, t, 0.05, dx=-60)
        anim_paste(img, self.l2, 200, 460, t, 0.2, dx=-60)
        anim_paste(img, self.sub, 204, 620, t, 0.4, dx=-40)
        k = ease_out((t - 0.1) / 0.7)
        if k > 0:
            blank = Image.new('RGB', (170, 350), (22, 22, 30))
            bd = ImageDraw.Draw(blank)
            bd.text((85, 175), 'F1', font=font('Black', 60), fill=RED, anchor='mm')
            layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            self.ph.draw(layer, blank, 1350, int(330 + 80 * (1 - k)))
            img.alpha_composite(with_alpha(layer, k))
        return img.convert('RGB')


class Outro(Seg):
    def __init__(self, dur=6.0):
        self.dur = dur
        f1 = font('Black', 140)
        self.title = Image.new('RGBA', (1000, 190), (0, 0, 0, 0))
        d = ImageDraw.Draw(self.title)
        w1 = f1.getbbox('F1 ')[2]
        tot = w1 + f1.getbbox('대시보드')[2]
        x0 = (1000 - tot) // 2
        d.text((x0, 5), 'F1', font=f1, fill=RED)
        d.text((x0 + w1, 5), '대시보드', font=f1, fill='white')
        feats = ['스케줄', '스탠딩', '레이스 결과', '타임라인', '리플레이', '텔레메트리', '인시던트', '한/EN']
        self.chips = [chip(x, 26, (36, 36, 48)) for x in feats]
        self.tag = text_layer([('데스크탑과 모바일, 어디서나 포뮬러 1', 'SemiBold', 46, (235, 235, 242), 0)], 1400)
        self.tag_w = font('SemiBold', 46).getbbox('데스크탑과 모바일, 어디서나 포뮬러 1')[2]
        tech = 'React 19 · TypeScript · Vite · Express · Recharts · Jolpica(Ergast) API · FastF1'
        self.tech = text_layer([(tech, 'Medium', 24, (150, 150, 165), 0)], 1400)
        self.tech_w = font('Medium', 24).getbbox(tech)[2]
        self.disc = text_layer([(DISCLAIMER, 'Medium', 20, (120, 120, 135), 0)], 1000)
        self.disc_w = font('Medium', 20).getbbox(DISCLAIMER)[2]

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        STREAKS.draw(img, t + 20, 0.35, 0.7)
        draw_bump(img, 1.0, 0.12)
        k = ease_out(t / 0.9)
        tl = with_alpha(self.title, k)
        img.alpha_composite(tl, ((W - 1000) // 2, int(250 + 30 * (1 - k))))
        anim_paste(img, self.tag, (W - self.tag_w) // 2, 470, t, 0.4, dx=0)
        gap = 14
        tot = sum(c.width for c in self.chips) + gap * (len(self.chips) - 1)
        x = (W - tot) // 2
        for i, c in enumerate(self.chips):
            anim_paste(img, c, x, 580, t, 0.8 + i * 0.08, dx=0)
            x += c.width + gap
        anim_paste(img, self.tech, (W - self.tech_w) // 2, 690, t, 1.5, dx=0)
        anim_paste(img, self.disc, (W - self.disc_w) // 2, H - 60, t, 1.8, dx=0)
        # final fade to black
        fo = ease_io((t - (self.dur - 1.0)) / 1.0)
        if fo > 0:
            img.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, int(255 * fo))))
        return img.convert('RGB')


def caption_layers(kind, idx, title, sub, maxw):
    c = chip(f'{kind}  {idx:02d}', 20)
    t = text_layer([(title, 'ExtraBold', 46, 'white', 0)], maxw)
    f = font('Medium', 26)
    s = text_layer([(l, 'Medium', 26, (185, 185, 198), 8) for l in wrap(sub, f, maxw)], maxw)
    return c, t, s


class Desktop(Seg):
    SCALE = 0.8

    def __init__(self, clip, t_in, t_out, speed, idx, title, sub, url, cont=False):
        self.clip, self.t_in, self.t_out, self.speed = clip, t_in, t_out, speed
        self.dur = clip_len(t_in, t_out, speed)
        self.cont = cont
        self.cw, self.ch = int(W * self.SCALE), int(H * self.SCALE)
        self.br = Browser(self.cw, self.ch, url)
        self.bx = (W - self.cw) // 2
        self.by = H - self.ch - Browser.BAR - 34
        self.cap = caption_layers('DESKTOP', idx, title, sub, 1400)
        self.tw = font('ExtraBold', 46).getbbox(title)[2]

    def start(self):
        self.r = Reader(self.clip, self.t_in, self.t_out, self.speed, self.cw, self.ch)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        fr = self.r.next()
        self.br.draw(img, fr, self.bx, self.by)
        c, ti, su = self.cap
        anim_paste(img, c, self.bx, 44, t, 0.0)
        anim_paste(img, ti, self.bx + c.width + 18, 30, t, 0.08)
        anim_paste(img, su, self.bx + c.width + 18 + self.tw + 26, 45, t, 0.2)
        return img.convert('RGB')

    def stop(self):
        self.r.close()


class Mobile(Seg):
    def __init__(self, clip, t_in, t_out, speed, idx, title, sub, bullets=(), side='right'):
        self.clip, self.t_in, self.t_out, self.speed = clip, t_in, t_out, speed
        self.dur = clip_len(t_in, t_out, speed)
        self.sw = 416
        self.shc = int(self.sw * 1688 / 780)
        self.ph = Phone(self.sw, self.shc)
        self.px = 1180 if side == 'right' else 300
        self.tx = 200 if side == 'right' else 900
        self.py = (H - self.ph.size[1]) // 2
        self.chip = chip(f'MOBILE  {idx:02d}', 22)
        self.title = text_layer([(title, 'Black', 76, 'white', 0)], 900)
        f = font('Medium', 34)
        self.sub = text_layer([(l, 'Medium', 34, (200, 200, 212), 12) for l in wrap(sub, f, 780)], 900)
        self.nsub = len(wrap(sub, f, 780))
        self.bul = []
        for b in bullets:
            im = Image.new('RGBA', (900, 50), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.rounded_rectangle([0, 14, 8, 36], 3, fill=RED)
            d.text((26, 25), b, font=font('SemiBold', 30), fill=(230, 230, 238), anchor='lm')
            self.bul.append(im)

    def start(self):
        self.r = Reader(self.clip, self.t_in, self.t_out, self.speed, self.sw, self.shc)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        k = ease_out(t / 0.7)
        fr = self.r.next()
        self.ph.draw(img, fr, self.px, int(self.py + 60 * (1 - k)))
        y = 330
        anim_paste(img, self.chip, self.tx, y, t, 0.0)
        anim_paste(img, self.title, self.tx, y + 60, t, 0.1)
        anim_paste(img, self.sub, self.tx, y + 170, t, 0.25)
        yb = y + 180 + self.nsub * 46 + 40
        for i, b in enumerate(self.bul):
            anim_paste(img, b, self.tx, yb + i * 58, t, 0.5 + i * 0.15)
        return img.convert('RGB')

    def stop(self):
        self.r.close()


class DualPhone(Seg):
    def __init__(self, a, b, idx, title, sub):
        # a/b: (clip, in, out, speed)
        self.a, self.b = a, b
        self.dur = min(clip_len(*a[1:]), clip_len(*b[1:]))
        self.sw = 360
        self.shc = int(self.sw * 1688 / 780)
        self.ph = Phone(self.sw, self.shc)
        self.py = (H - self.ph.size[1]) // 2
        self.chip = chip(f'MOBILE  {idx:02d}', 22)
        self.title = text_layer([(title, 'Black', 72, 'white', 0)], 700)
        f = font('Medium', 32)
        self.sub = text_layer([(l, 'Medium', 32, (200, 200, 212), 12) for l in wrap(sub, f, 640)], 700)

    def start(self):
        self.ra = Reader(self.a[0], self.a[1], self.a[2], self.a[3], self.sw, self.shc)
        self.rb = Reader(self.b[0], self.b[1], self.b[2], self.b[3], self.sw, self.shc)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        k1, k2 = ease_out(t / 0.7), ease_out((t - 0.15) / 0.7)
        self.ph.draw(img, self.ra.next(), 930, int(self.py + 60 * (1 - k1)))
        self.ph.draw(img, self.rb.next(), 1370, int(self.py + 20 + 60 * (1 - k2)))
        anim_paste(img, self.chip, 180, 360, t, 0.0)
        anim_paste(img, self.title, 180, 420, t, 0.1)
        anim_paste(img, self.sub, 180, 520, t, 0.25)
        return img.convert('RGB')

    def stop(self):
        self.ra.close(); self.rb.close()


class Both(Seg):
    def __init__(self, dclip, mclip, title, sub):
        self.d, self.m = dclip, mclip
        self.dur = min(clip_len(*dclip[1:]), clip_len(*mclip[1:]))
        self.cw, self.ch = int(W * 0.66), int(H * 0.66)
        self.br = Browser(self.cw, self.ch, 'localhost:5173/timeline')
        self.sw = 330
        self.shc = int(self.sw * 1688 / 780)
        self.ph = Phone(self.sw, self.shc)
        self.chip = chip('DESKTOP + MOBILE', 20)
        self.title = text_layer([(title, 'ExtraBold', 46, 'white', 0)], 1400)
        self.tw = font('ExtraBold', 46).getbbox(title)[2]
        self.sub = text_layer([(sub, 'Medium', 26, (185, 185, 198), 0)], 1000)

    def start(self):
        self.rd = Reader(self.d[0], self.d[1], self.d[2], self.d[3], self.cw, self.ch)
        self.rm = Reader(self.m[0], self.m[1], self.m[2], self.m[3], self.sw, self.shc)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        k = ease_out(t / 0.8)
        self.br.draw(img, self.rd.next(), int(130 - 60 * (1 - k)), 180)
        self.ph.draw(img, self.rm.next(), int(1410 + 80 * (1 - k)), H - self.ph.size[1] - 40)
        anim_paste(img, self.chip, 130, 58, t, 0.0)
        anim_paste(img, self.title, 130 + self.chip.width + 18, 44, t, 0.1)
        anim_paste(img, self.sub, 130 + self.chip.width + 18 + self.tw + 26, 59, t, 0.2)
        return img.convert('RGB')

    def stop(self):
        self.rd.close(); self.rm.close()


# ---------------------------------------------------------------- storyboard
SEGS = [
    Intro(4.6),
    Desktop('d1_dashboard', 0.2, 6.9, 1.0, 1, '대시보드', '다음 레이스 카운트다운 · 드라이버 TOP 5 · 최근 레이스 포디움', 'localhost:5173/'),
    Desktop('d2_schedule', 0.3, 12.3, 1.8, 2, '레이스 스케줄', '24개 그랑프리의 모든 세션 일정을 한국 시간(KST)으로', 'localhost:5173/schedule'),
    Desktop('d3_drivers', 0.4, 17.2, 1.8, 3, '드라이버 스탠딩', '라운드별 순위 변동 차트와 이번 라운드 획득 포인트', 'localhost:5173/drivers'),
    Desktop('d4_results', 0.3, 15.0, 1.9, 4, '레이스 결과', '레이스 · 퀄리파잉 · 스프린트 결과를 세션별로', 'localhost:5173/results'),
    Desktop('d5_timeline', 1.6, 12.3, 1.5, 5, '순위 변동 차트', '랩마다 바뀌는 전체 드라이버의 순위 흐름', 'localhost:5173/timeline'),
    Desktop('d5_timeline', 12.3, 27.4, 1.6, 6, '레이스 리플레이', '피트 스톱 · 타이어 · 세이프티카까지 랩 단위로 재생', 'localhost:5173/timeline', cont=True),
    Desktop('d6_telemetry', 1.4, 21.9, 2.3, 7, '텔레메트리', '두 드라이버의 속도 · RPM · 페달 입력을 거리 기준으로 비교', 'localhost:5173/telemetry'),
    Desktop('d7_incidents', 0.2, 6.3, 1.15, 8, '레이스 인시던트', '레이스 컨트롤 메시지 · 플래그 · 페널티 기록', 'localhost:5173/incidents'),
    Desktop('d8_english', 0.4, 9.1, 1.3, 9, '한국어 / English', '버튼 한 번으로 언어 전환', 'localhost:5173/drivers'),
    Card(2.6, '모바일에서도', '그대로.', '반응형 레이아웃으로 스마트폰에 최적화'),
    Mobile('m1_dashboard', 0.2, 6.9, 1.05, 1, '모바일 대시보드', '작은 화면에 맞춰 재배치되는 카드 레이아웃', ['다음 레이스 카운트다운', '드라이버 TOP 5 · 최근 포디움']),
    Mobile('m2_menu', 0.2, 8.3, 1.05, 2, '드로어 메뉴', '햄버거 메뉴로 어느 페이지든 빠르게 이동', ['시즌 선택까지 한 곳에', '차트는 접고 펼치기'], side='left'),
    Mobile('m3_timeline', 0.2, 14.3, 1.4, 3, '손 안의 리플레이', '모바일에서도 랩 단위 레이스 리플레이', ['30x ~ 480x 재생 속도', '타이어 컴파운드 · 순위 변동 표시']),
    DualPhone(('m4_results', 0.2, 5.7, 0.95), ('m5_telemetry', 0.2, 6.3, 1.05), 4, '표와 차트도 그대로', '결과표는 가로 스크롤, 텔레메트리 차트는 화면 폭에 맞춰 표시'),
    Both(('d5_timeline', 18.0, 25.5, 1.25), ('m3_timeline', 7.0, 14.3, 1.2), '하나의 웹앱, 모든 화면', '같은 데이터를 데스크탑과 모바일에서'),
    Outro(6.0),
]


def main():
    starts, t = [], 0.0
    for s in SEGS:
        starts.append(t); t += s.dur
    total = t
    print(f'total {total:.1f}s')
    for s, st in zip(SEGS, starts):
        print(f'  {st:6.2f}  {s.dur:5.2f}  {type(s).__name__} {getattr(s, "clip", "")}')

    # audio
    sys.path.insert(0, S)
    from music import make_music
    card_i = next(i for i, s in enumerate(SEGS) if isinstance(s, Card))
    out_i = len(SEGS) - 1
    wipes = [starts[i] for i in range(1, len(SEGS)) if not SEGS[i].cont]
    drops = [starts[1], starts[card_i + 1], starts[out_i]]
    breaks = [(0, starts[1]), (starts[card_i], starts[card_i + 1]), (starts[out_i], total + 1)]
    wav = f'{S}/out/music.wav'
    os.makedirs(f'{S}/out', exist_ok=True)
    make_music(total, drops, breaks, [w for w in wipes if w not in drops], wav)
    print('music done')

    out = f'{S}/out/intro_video.mp4' if not PREVIEW else f'{S}/out/preview.mp4'
    enc = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium' if not PREVIEW else 'ultrafast',
                            '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
                            '-c:a', 'aac', '-b:a', '192k', '-shortest', out], stdin=subprocess.PIPE)
    WT = 0.28
    nframes = int(round(total * FPS))
    seg_i = -1
    cur = None
    for fi in range(nframes):
        gt = fi / FPS
        while seg_i + 1 < len(SEGS) and gt >= starts[seg_i + 1] - 1e-6:
            if cur is not None:
                cur.stop()
            seg_i += 1
            cur = SEGS[seg_i]
            cur.start()
        lt = gt - starts[seg_i]
        img = cur.frame(lt)
        # wipe transitions
        nxt = seg_i + 1
        if nxt < len(SEGS) and not SEGS[nxt].cont and starts[nxt] - gt <= WT:
            p = 1 - (starts[nxt] - gt) / WT
            wipe(img, p, cover=True)
        if seg_i > 0 and not cur.cont and lt < WT:
            wipe(img, lt / WT, cover=False)
        enc.stdin.write(img.tobytes())
        if fi % 150 == 0:
            print(f'frame {fi}/{nframes}', flush=True)
    cur.stop()
    enc.stdin.close()
    enc.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
