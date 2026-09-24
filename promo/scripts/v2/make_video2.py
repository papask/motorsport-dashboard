"""Promo video v2: real-data recordings + stock photos/video/music/SFX.

Reuses the drawing helpers from make_video.py (browser/phone frames, captions,
wipe) and adds photo montage, stingers and a sampled soundtrack.
"""
import os, sys, json, math, random, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps

S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, S)
import make_video as B  # noqa: E402
from make_video import (W, H, FPS, RED, font, ease_out, ease_io, with_alpha, anim_paste, text_layer, wrap,
                        Browser, Phone, chip, wipe, BGIMG, STREAKS)

FF = B.FF
MEDIA = f'{S}/media/dl'
CLIPS = f'{S}/clips2'
SERVICE = 'F1 온더리밋'
PREVIEW = '--preview' in sys.argv

BEAT = 0.598
BEAT0 = 2.82  # first kick of the music


# ---------------------------------------------------------------- readers
class Reader:
    def __init__(self, path, t_in, t_out, speed, w, h, crop=None, loop=False):
        self.w, self.h = w, h
        vf = f'setpts=(PTS-STARTPTS)/{speed},fps={FPS}'
        if crop:
            vf += f',crop={crop}'
        vf += f',scale={w}:{h}:flags=lanczos:force_original_aspect_ratio=increase,crop={w}:{h}'
        args = [FF, '-loglevel', 'error']
        if loop:
            args += ['-stream_loop', '-1']
        args += ['-ss', str(t_in), '-t', str((t_out - t_in)), '-i', path, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
        self.p = subprocess.Popen(args, stdout=subprocess.PIPE)
        self.last = Image.new('RGB', (w, h))

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


def clip(name):
    return f'{CLIPS}/{name}.mp4'


def clen(t_in, t_out, speed):
    return (t_out - t_in) / speed


# ---------------------------------------------------------------- photos
PHOTO_CROP = {'ov110': (14, 14, 1010, 560)}  # strip white border + watermark


def load_photo(key):
    im = Image.open(f'{MEDIA}/img/{key}.jpg').convert('RGB')
    if key in PHOTO_CROP:
        im = im.crop(PHOTO_CROP[key])
    im = ImageEnhance.Contrast(im).enhance(1.12)
    im = ImageEnhance.Color(im).enhance(1.1)
    return im


def cover(im, w, h, zoom=1.0, fx=0.5, fy=0.5):
    sc = max(w / im.width, h / im.height) * zoom
    nw, nh = int(im.width * sc + 0.5), int(im.height * sc + 0.5)
    r = im.resize((nw, nh), Image.BICUBIC)
    x = int((nw - w) * fx)
    y = int((nh - h) * fy)
    return r.crop((x, y, x + w, y + h))


class Photo:
    """Pre-scaled photo for fast Ken-Burns crops."""
    def __init__(self, key, max_zoom=1.25):
        im = load_photo(key)
        sc = max(W / im.width, H / im.height) * max_zoom
        self.big = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 60, 2))
        self.base = max(W / im.width, H / im.height)
        self.sc = sc

    def frame(self, zoom, fx=0.5, fy=0.5):
        # zoom relative to cover (1.0 = cover)
        cw, ch = int(W * self.sc / self.base / zoom), int(H * self.sc / self.base / zoom)
        cw, ch = min(cw, self.big.width), min(ch, self.big.height)
        x = int((self.big.width - cw) * fx)
        y = int((self.big.height - ch) * fy)
        return self.big.crop((x, y, x + cw, y + ch)).resize((W, H), Image.BILINEAR)


def grade(img, dark=0.0, red=0.0):
    a = np.asarray(img).astype(np.float32)
    if red:
        lum = a.mean(axis=2, keepdims=True)
        tint = np.concatenate([lum * 1.25, lum * 0.35, lum * 0.3], axis=2)
        a = a * (1 - red) + tint * red
    if dark:
        a = a * (1 - dark)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def vignette_layer():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    a = np.clip((d - 0.55) / 0.8, 0, 1) ** 1.5 * 220
    L = np.zeros((H, W, 4), np.uint8)
    L[..., 3] = a.astype(np.uint8)
    return Image.fromarray(L, 'RGBA')


VIG = vignette_layer()


def left_gradient(alpha=235, width=1100):
    g = np.zeros((H, W, 4), np.uint8)
    xs = np.arange(W, dtype=np.float32)
    a = np.clip(1 - (xs - width * 0.55) / (width * 0.6), 0, 1) * alpha
    g[..., 3] = a[None, :].astype(np.uint8)
    g[..., :3] = (8, 8, 10)
    return Image.fromarray(g, 'RGBA')


LGRAD = left_gradient()


def outline_text(text, size, stroke=3, fill=(0, 0, 0, 0), outline=(255, 255, 255, 255), weight='Black'):
    f = font(weight, size)
    bb = f.getbbox(text, stroke_width=stroke)
    im = Image.new('RGBA', (bb[2] + 20, bb[3] + 20), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((10, 10), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=outline)
    return im


def shake(t, t0, amp=18, dur=0.35):
    k = (t - t0) / dur
    if k < 0 or k > 1:
        return 0, 0
    a = amp * (1 - k) ** 2
    return int(a * math.sin(t * 90)), int(a * math.cos(t * 70))


# ---------------------------------------------------------------- segments
class Seg:
    cont = False
    def start(self): pass
    def stop(self): pass


class Intro(Seg):
    """Tachometer build-up -> beat-synced photo montage -> title slam."""
    WORDS = ['SCHEDULE', 'STANDINGS', 'RESULTS', 'REPLAY', 'TELEMETRY', 'INCIDENTS', 'LIVE DATA']
    SHOTS = ['ov44', 'ov40', 'ov89', 'ov96', 'ov85', 'ov106', 'ov99']

    def __init__(self):
        self.t_title = BEAT0 + BEAT * len(self.SHOTS)          # 7.006
        self.dur = BEAT0 + BEAT * 12                            # ~10.0
        self.photos = [Photo(k) for k in self.SHOTS]
        self.words = [outline_text(w, 170, 6, fill=(255, 255, 255, 255), outline=(0, 0, 0, 255)) for w in self.WORDS]
        self.bg = Photo('ov14', 1.15)
        tf = font('Black', 190)
        self.title = Image.new('RGBA', (1500, 250), (0, 0, 0, 0))
        d = ImageDraw.Draw(self.title)
        w1 = tf.getbbox('F1 ')[2]
        tot = w1 + tf.getbbox('온더리밋')[2]
        x0 = (1500 - tot) // 2
        d.text((x0, 10), 'F1', font=tf, fill=RED)
        d.text((x0 + w1, 10), '온더리밋', font=tf, fill='white')
        tag = '레이스의 모든 순간을, 데이터로'
        self.tag = text_layer([(tag, 'Bold', 54, (240, 240, 245), 0)], 1400)
        self.tag_w = font('Bold', 54).getbbox(tag)[2]
        self.chips = [chip('DESKTOP', 26, (30, 30, 36)), chip('MOBILE', 26, (30, 30, 36)), chip('2026 SEASON', 26, RED)]
        self.tach_word = text_layer([('LIGHTS OUT', 'Black', 40, (255, 255, 255), 0)], 600)

    def start(self):
        self.tach = Reader(f'{MEDIA}/video/64.mp4', 4.0, 4.0 + BEAT0 + 0.2, 1.0, W, H)

    def frame(self, t):
        if t < BEAT0:
            fr = grade(self.tach.next(), dark=0.25, red=0.35)
            img = fr.convert('RGBA')
            img.alpha_composite(VIG)
            # five start lights filling one per ~0.45s, then out
            d = ImageDraw.Draw(img, 'RGBA')
            n_on = min(5, int(t / 0.45))
            for i in range(5):
                cx = W // 2 - 240 + i * 120
                on = i < n_on and t < BEAT0 - 0.12
                d.ellipse([cx - 38, 900 - 38, cx + 38, 900 + 38], fill=(225, 6, 0, 255) if on else (40, 10, 10, 220), outline=(0, 0, 0, 255), width=4)
            k = ease_out((t - 0.3) / 0.8)
            if k > 0:
                img.alpha_composite(with_alpha(self.tach_word, k * 0.9), (W // 2 - 125, 790))
            return img.convert('RGB')
        if t < self.t_title:
            i = int((t - BEAT0) / BEAT)
            lt = (t - BEAT0) - i * BEAT
            ph = self.photos[i]
            z = 1.18 - 0.14 * ease_out(lt / BEAT)
            fx = 0.35 + 0.3 * (i % 2)
            img = ph.frame(z, fx, 0.5).convert('RGBA')
            img.alpha_composite(VIG)
            STREAKS.draw(img, t * 1.6, 2.2, 0.9)
            w = self.words[i]
            wx = int(W / 2 - w.width / 2 + (1 - ease_out(lt / 0.35)) * (-240 if i % 2 else 240))
            img.alpha_composite(with_alpha(w, min(1, lt / 0.1)), (wx, H // 2 - w.height // 2))
            if lt < 0.07:
                img.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(200 * (1 - lt / 0.07)))))
            return img.convert('RGB')
        # title slam over the Red Bull front shot
        lt = t - self.t_title
        img = grade(self.bg.frame(1.12 - 0.06 * min(1, lt / 3), 0.5, 0.45), dark=0.45).convert('RGBA')
        img.alpha_composite(VIG)
        STREAKS.draw(img, t, 1.0, 0.6)
        sx, sy = shake(t, self.t_title, 22)
        k = ease_out(lt / 0.28)
        sc = 1.6 - 0.6 * k
        tl = self.title.resize((int(1500 * sc), int(250 * sc)), Image.LANCZOS)
        img.alpha_composite(with_alpha(tl, min(1, k * 1.5)), (W // 2 - tl.width // 2 + sx, 330 - (tl.height - 250) // 2 + sy))
        if lt < 0.1:
            img.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(230 * (1 - lt / 0.1)))))
        d = ImageDraw.Draw(img, 'RGBA')
        kb = ease_out((lt - 0.25) / 0.5)
        if kb > 0:
            bw = int(760 * kb)
            d.rectangle([(W - bw) // 2, 600, (W + bw) // 2, 607], fill=RED + (255,))
        anim_paste(img, self.tag, (W - self.tag_w) // 2, 640, lt, 0.45, dx=0)
        gap = 18
        tot = sum(c.width for c in self.chips) + gap * 2
        x = (W - tot) // 2
        for i, c in enumerate(self.chips):
            anim_paste(img, c, x, 760, lt, 0.8 + i * 0.12, dx=0)
            x += c.width + gap
        return img.convert('RGB')

    def stop(self):
        self.tach.close()


class Stinger(Seg):
    """1.4s photo interstitial announcing a navigation group."""
    def __init__(self, photo, en, ko, dur=1.5, fy=0.5):
        self.dur = dur
        self.ph = Photo(photo, 1.2)
        self.fy = fy
        self.en = outline_text(en, 150, 3, fill=(255, 255, 255, 50))
        self.ko = text_layer([(ko, 'Black', 64, 'white', 0)], 900)

    def frame(self, t):
        k = t / self.dur
        img = grade(self.ph.frame(1.02 + 0.12 * k, 0.3 + 0.4 * k, self.fy), dark=0.2).convert('RGBA')
        img.alpha_composite(LGRAD)
        STREAKS.draw(img, t * 2 + 3, 2.5, 0.8)
        d = ImageDraw.Draw(img, 'RGBA')
        kb = ease_out(t / 0.35)
        d.polygon([(0, 560), (int(900 * kb), 560), (int(900 * kb) - 40, 600), (0, 600)], fill=RED + (255,))
        img.alpha_composite(with_alpha(self.en, min(1, t / 0.15)), (int(110 - 160 * (1 - ease_out(t / 0.45))), 380))
        anim_paste(img, self.ko, 130, 630, t, 0.15, dx=-60, dur=0.4)
        return img.convert('RGB')


class MobileStinger(Seg):
    def __init__(self, dur=2.6):
        self.dur = dur
        self.l1 = text_layer([('모바일에서도', 'Black', 120, 'white', 0)], 1600)
        self.l2 = text_layer([('그대로.', 'Black', 120, RED, 0)], 1600)
        self.sub = text_layer([('반응형 레이아웃 · 드로어 메뉴 · 터치 최적화', 'SemiBold', 40, (225, 225, 232), 0)], 1600)
        self.ph = Phone(200, int(200 * 1688 / 780))

    def start(self):
        self.r = Reader(f'{MEDIA}/video/34559.mp4', 1.0, 1.0 + self.dur * 1.6 + 0.5, 1.6, W, H)
        self.shot = Reader(clip('m01_dashboard'), 0.2, 0.2 + self.dur + 0.5, 1.0, 200, int(200 * 1688 / 780))

    def frame(self, t):
        img = grade(self.r.next(), dark=0.35).convert('RGBA')
        img.alpha_composite(LGRAD)
        img.alpha_composite(VIG)
        anim_paste(img, self.l1, 170, 300, t, 0.05, dx=-80)
        anim_paste(img, self.l2, 170, 440, t, 0.2, dx=-80)
        anim_paste(img, self.sub, 176, 620, t, 0.4, dx=-40)
        k = ease_out((t - 0.15) / 0.6)
        fr = self.shot.next()
        if k > 0:
            layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            self.ph.draw(layer, fr, 1420, int(270 + 120 * (1 - k)))
            img.alpha_composite(with_alpha(layer, k))
        return img.convert('RGB')

    def stop(self):
        self.r.close(); self.shot.close()


def caption(title, desc, maxw=1700):
    t = text_layer([(title, 'ExtraBold', 46, 'white', 0)], 1000)
    tw = font('ExtraBold', 46).getbbox(title)[2]
    s = text_layer([(desc, 'Medium', 27, (190, 190, 202), 0)], maxw)
    return t, tw, s


def accent_bar(h=52):
    im = Image.new('RGBA', (8, h), RED + (255,))
    return im


class Desktop(Seg):
    SCALE = 0.8

    def __init__(self, name, t_in, t_out, speed, title, desc, cont=False):
        self.name, self.t_in, self.t_out, self.speed = name, t_in, t_out, speed
        self.dur = clen(t_in, t_out, speed)
        self.cont = cont
        self.cw, self.ch = int(W * self.SCALE), int(H * self.SCALE)
        self.br = Browser(self.cw, self.ch, SERVICE)
        self.bx = (W - self.cw) // 2
        self.by = H - self.ch - Browser.BAR - 34
        self.t, self.tw, self.s = caption(title, desc)
        self.bar = accent_bar()

    def start(self):
        self.r = Reader(clip(self.name), self.t_in, self.t_out, self.speed, self.cw, self.ch)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        self.br.draw(img, self.r.next(), self.bx, self.by)
        anim_paste(img, self.bar, self.bx, 36, t, 0.0, dx=0, dur=0.3)
        anim_paste(img, self.t, self.bx + 26, 32, t, 0.05)
        anim_paste(img, self.s, self.bx + 26 + self.tw + 28, 48, t, 0.18)
        return img.convert('RGB')

    def stop(self):
        self.r.close()


PH_SW = 416
PH_SH = int(PH_SW * 1688 / 780)


class Mobile(Seg):
    def __init__(self, name, t_in, t_out, speed, title, desc, bullets=(), side='right'):
        self.name, self.t_in, self.t_out, self.speed = name, t_in, t_out, speed
        self.dur = clen(t_in, t_out, speed)
        self.sw = 400
        self.shc = int(self.sw * 1688 / 780)
        self.ph = Phone(self.sw, self.shc)
        self.px = 1200 if side == 'right' else 320
        self.tx = 200 if side == 'right' else 900
        self.py = (H - self.ph.size[1]) // 2
        self.title = text_layer([(title, 'Black', 78, 'white', 0)], 900)
        f = font('Medium', 34)
        lines = wrap(desc, f, 760)
        self.nsub = len(lines)
        self.sub = text_layer([(l, 'Medium', 34, (205, 205, 215), 12) for l in lines], 900)
        self.bul = []
        for b in bullets:
            im = Image.new('RGBA', (900, 50), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.rounded_rectangle([0, 14, 8, 36], 3, fill=RED)
            d.text((26, 25), b, font=font('SemiBold', 30), fill=(232, 232, 240), anchor='lm')
            self.bul.append(im)
        self.bar = accent_bar(70)

    def start(self):
        self.r = Reader(clip(self.name), self.t_in, self.t_out, self.speed, self.sw, self.shc)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        k = ease_out(t / 0.7)
        self.ph.draw(img, self.r.next(), self.px, int(self.py + 60 * (1 - k)))
        y = 360
        anim_paste(img, self.bar, self.tx - 30, y + 14, t, 0.0, dx=0, dur=0.3)
        anim_paste(img, self.title, self.tx, y, t, 0.05)
        anim_paste(img, self.sub, self.tx, y + 118, t, 0.2)
        yb = y + 130 + self.nsub * 46 + 36
        for i, b in enumerate(self.bul):
            anim_paste(img, b, self.tx, yb + i * 58, t, 0.45 + i * 0.15)
        return img.convert('RGB')

    def stop(self):
        self.r.close()


class DualPhone(Seg):
    def __init__(self, a, b, title, desc):
        self.a, self.b = a, b
        self.dur = min(clen(*a[1:]), clen(*b[1:]))
        self.sw = 350
        self.shc = int(self.sw * 1688 / 780)
        self.ph = Phone(self.sw, self.shc)
        self.py = (H - self.ph.size[1]) // 2
        self.title = text_layer([(title, 'Black', 72, 'white', 0)], 720)
        f = font('Medium', 32)
        self.sub = text_layer([(l, 'Medium', 32, (205, 205, 215), 12) for l in wrap(desc, f, 640)], 720)
        self.bar = accent_bar(64)

    def start(self):
        self.ra = Reader(clip(self.a[0]), self.a[1], self.a[2], self.a[3], self.sw, self.shc)
        self.rb = Reader(clip(self.b[0]), self.b[1], self.b[2], self.b[3], self.sw, self.shc)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        k1, k2 = ease_out(t / 0.7), ease_out((t - 0.15) / 0.7)
        self.ph.draw(img, self.ra.next(), 950, int(self.py + 60 * (1 - k1)))
        self.ph.draw(img, self.rb.next(), 1400, int(self.py + 20 + 60 * (1 - k2)))
        anim_paste(img, self.bar, 150, 404, t, 0.0, dx=0, dur=0.3)
        anim_paste(img, self.title, 180, 390, t, 0.05)
        anim_paste(img, self.sub, 180, 500, t, 0.2)
        return img.convert('RGB')

    def stop(self):
        self.ra.close(); self.rb.close()


class Both(Seg):
    def __init__(self, d, m, title, desc):
        self.d, self.m = d, m
        self.dur = min(clen(*d[1:]), clen(*m[1:]))
        self.cw, self.ch = int(W * 0.66), int(H * 0.66)
        self.br = Browser(self.cw, self.ch, SERVICE)
        self.sw = 340
        self.shc = int(self.sw * 1688 / 780)
        self.ph = Phone(self.sw, self.shc)
        self.t, self.tw, self.s = caption(title, desc)
        self.bar = accent_bar()

    def start(self):
        self.rd = Reader(clip(self.d[0]), self.d[1], self.d[2], self.d[3], self.cw, self.ch)
        self.rm = Reader(clip(self.m[0]), self.m[1], self.m[2], self.m[3], self.sw, self.shc)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        k = ease_out(t / 0.8)
        self.br.draw(img, self.rd.next(), int(130 - 60 * (1 - k)), 190)
        self.ph.draw(img, self.rm.next(), int(1400 + 80 * (1 - k)), H - self.ph.size[1] - 30)
        anim_paste(img, self.bar, 130, 46, t, 0.0, dx=0, dur=0.3)
        anim_paste(img, self.t, 156, 42, t, 0.05)
        anim_paste(img, self.s, 156 + self.tw + 28, 58, t, 0.18)
        return img.convert('RGB')

    def stop(self):
        self.rd.close(); self.rm.close()


PHOTO_CREDITS = None


class Outro(Seg):
    def __init__(self, dur):
        self.dur = dur
        self.ph = Photo('ov115', 1.15)
        tf = font('Black', 150)
        self.title = Image.new('RGBA', (1200, 200), (0, 0, 0, 0))
        d = ImageDraw.Draw(self.title)
        w1 = tf.getbbox('F1 ')[2]
        d.text((0, 5), 'F1', font=tf, fill=RED)
        d.text((w1, 5), '온더리밋', font=tf, fill='white')
        self.tag = text_layer([('레이스의 모든 순간을, 데이터로', 'Bold', 48, (240, 240, 245), 0)], 1200)
        feats = ['스케줄', '스탠딩', '레이스 결과', '타임라인 · 리플레이', '텔레메트리', '인시던트', '라이트/다크', '한/EN']
        self.chips = [chip(x, 25, (34, 34, 42)) for x in feats]
        tech = 'React 19 · TypeScript · Vite · Express · Recharts · 데이터: Jolpica-F1 API · FastF1'
        self.tech = text_layer([(tech, 'Medium', 24, (170, 170, 182), 0)], 1500)
        credit1 = '사진: Michael Elleray · franpe · polarjez · nan palmero · Nick J Webb · worldinframes · rarye · Ben Sutherland · Warren D (Flickr, CC BY 2.0)'
        credit2 = '영상 · 음악 · 효과음: Mixkit (Mixkit Free License)  ·  글꼴: Pretendard (SIL OFL 1.1)'
        self.cred = text_layer([(credit1, 'Medium', 17, (135, 135, 148), 8), (credit2, 'Medium', 17, (135, 135, 148), 0)], 1800)

    def frame(self, t):
        z = 1.04 + 0.05 * (t / self.dur)
        img = grade(self.ph.frame(z, 0.62, 0.45), dark=0.3).convert('RGBA')
        img.alpha_composite(LGRAD)
        img.alpha_composite(LGRAD)
        img.alpha_composite(VIG)
        STREAKS.draw(img, t + 20, 0.5, 0.5)
        sx, sy = shake(t, 0.0, 14)
        k = ease_out(t / 0.5)
        img.alpha_composite(with_alpha(self.title, k), (int(150 - 80 * (1 - k)) + sx, 250 + sy))
        d = ImageDraw.Draw(img, 'RGBA')
        kb = ease_out((t - 0.3) / 0.5)
        if kb > 0:
            d.rectangle([156, 470, 156 + int(640 * kb), 477], fill=RED + (255,))
        anim_paste(img, self.tag, 156, 505, t, 0.45)
        x, y = 156, 610
        for i, c in enumerate(self.chips):
            if x + c.width > 1600:
                x, y = 156, y + c.height + 12
            anim_paste(img, c, x, y, t, 0.8 + i * 0.07, dx=0)
            x += c.width + 12
        anim_paste(img, self.tech, 156, 770, t, 1.5)
        anim_paste(img, self.cred, 156, H - 92, t, 1.9, dx=0)
        fo = ease_io((t - (self.dur - 1.2)) / 1.2)
        if fo > 0:
            img.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, int(255 * fo))))
        return img.convert('RGB')


# ---------------------------------------------------------------- storyboard
SEGS = [
    Intro(),
    Desktop('d01_dashboard', 0.2, 8.4, 1.3, '대시보드', '다음 레이스 카운트다운 · 시즌 리더와 격차 · 드라이버 TOP 5 · 최근 포디움'),
    Desktop('d02_schedule', 0.3, 11.1, 1.7, '스케줄', '시즌 전체 그랑프리 일정을 한국 시간(KST)으로, 레이스만 또는 전 세션 보기'),
    Stinger('ov29', 'STANDINGS', '스탠딩', fy=0.55),
    Desktop('d03_drivers', 1.6, 16.1, 2.0, '드라이버 스탠딩', '라운드별 순위 변동 차트와 이번 라운드 획득 포인트'),
    Desktop('d04_constructors', 1.5, 12.4, 1.9, '컨스트럭터 스탠딩', '팀 포인트 막대와 라운드별 팀 순위 흐름'),
    Stinger('ov46', 'REVIEW', '리뷰', fy=0.6),
    Desktop('d05_results', 0.2, 12.8, 1.9, '레이스 결과', '포디움과 전체 순위 · 그리드 · 기록 · 패스티스트 랩, 퀄리파잉 Q1–Q3까지'),
    Desktop('d06_timeline', 4.6, 16.2, 1.8, '레이스 타임라인', '57랩 동안의 전체 드라이버 순위 변동을 한 장의 차트로'),
    Desktop('d06_timeline', 16.2, 32.0, 2.2, '레이스 리플레이', '피트 스톱 · 타이어 컴파운드 · 세이프티카까지 랩 단위로 재생', cont=True),
    Stinger('ov110', 'ANALYSIS', '분석', fy=0.5),
    Desktop('d07_telemetry', 0.3, 18.7, 2.4, '텔레메트리', '두 드라이버의 속도 · RPM · 페달 입력 · 랩 타임을 거리 기준으로 비교'),
    Desktop('d08_incidents', 0.2, 11.4, 1.7, '레이스 인시던트', '랩별 인시던트 밀도와 레이스 컨트롤 메시지 · 플래그 · 페널티 필터'),
    Desktop('d09_theme', 0.3, 11.9, 1.9, '라이트 / 다크 · 한 / EN', '테마와 언어를 버튼 한 번으로 전환'),
    MobileStinger(2.6),
    Mobile('m01_dashboard', 0.2, 6.3, 1.05, '모바일 대시보드', '작은 화면에 맞게 다시 배치되는 카드 레이아웃', ['다음 레이스 카운트다운', '시즌 리더 · TOP 5 · 포디움']),
    Mobile('m02_menu', 0.2, 7.4, 1.1, '드로어 메뉴', '햄버거 메뉴 하나로 모든 페이지와 시즌 · 언어 · 테마 설정까지', ['스케줄 · 스탠딩 · 리뷰 · 분석'], side='left'),
    Mobile('m03_timeline', 0.3, 22.8, 2.6, '손 안의 리플레이', '모바일에서도 순위 변동 차트와 레이스 리플레이를 그대로', ['30x ~ 480x 재생 속도', '플래그 · 세이프티카 표시']),
    DualPhone(('m04_results', 0.2, 9.2, 1.3), ('m05_telemetry', 0.2, 6.2, 0.87), '결과와 텔레메트리', '세로 화면에 맞춘 결과표와 텔레메트리 차트'),
    Mobile('m06_incidents', 0.2, 7.4, 1.2, '모바일 인시던트', '카테고리 필터와 랩별 인시던트 밀도를 터치로', side='left'),
    Both(('d06_timeline', 20.0, 27.0, 1.25), ('m03_timeline', 11.0, 18.0, 1.25), '하나의 서비스, 모든 화면', '같은 레이스를 데스크탑과 모바일에서 동시에'),
]
OUTRO_DUR = 7.0


# ---------------------------------------------------------------- audio
SR = 48000


def load_audio(path):
    raw = subprocess.run([FF, '-loglevel', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32).reshape(-1, 2).T / 32768


def build_audio(total, events, music_parts, path):
    """music_parts: [(file, src_offset, dst_start, dst_end, fade_in, fade_out, gain)]"""
    n = int((total + 0.2) * SR)
    mix = np.zeros((2, n), np.float32)
    duck = np.ones(n, np.float32)
    for t, _, g, _ in events:
        i = int(t * SR)
        L = int(0.6 * SR)
        seg = 1 - 0.35 * min(1, g) * np.exp(-np.linspace(0, 4, L))
        j = min(n, i + L)
        if 0 <= i < n:
            duck[i:j] = np.minimum(duck[i:j], seg[: j - i])
    for fn, off, a, b, fi, fo, g in music_parts:
        mus = load_audio(f'{MEDIA}/music/{fn}')
        i0, i1 = int(a * SR), min(n, int(b * SR))
        seg = mus[:, int(off * SR): int(off * SR) + (i1 - i0)]
        L = seg.shape[1]
        env = np.ones(L, np.float32)
        if fi > 0:
            k = min(L, int(fi * SR)); env[:k] = np.linspace(0, 1, k)
        if fo > 0:
            k = min(L, int(fo * SR)); env[L - k:] *= np.linspace(1, 0, k) ** 1.3
        mix[:, i0:i0 + L] += seg * env * g * duck[i0:i0 + L]
    cache = {}
    for t, sid, g, trim in events:
        if sid not in cache:
            cache[sid] = load_audio(f'{MEDIA}/sfx/{sid}.mp3')
        s = cache[sid]
        if trim:
            a, b = trim
            s = s[:, int(a * SR): int(b * SR)]
            f = int(0.08 * SR)
            if s.shape[1] > 2 * f:
                s = s.copy(); s[:, -f:] *= np.linspace(1, 0, f)
        i = int(t * SR)
        if i >= n:
            continue
        j = min(n, i + s.shape[1])
        mix[:, i:j] += s[:, : j - i] * g
    # final fade
    fo = int(2.0 * SR)
    mix[:, n - fo:] *= np.linspace(1, 0, fo)
    peak = np.max(np.abs(mix)) + 1e-9
    mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4) * 0.9
    pcm = (mix.T * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    segs = SEGS + [Outro(OUTRO_DUR)]
    starts, t = [], 0.0
    for s in segs:
        starts.append(t); t += s.dur
    total = t
    print(f'total {total:.1f}s')
    for s, st in zip(segs, starts):
        print(f'  {st:6.2f}  {s.dur:5.2f}  {type(s).__name__} {getattr(s, "name", "")}')

    intro = segs[0]
    ev = [
        (0.0, '2724', 0.9, None),                  # engine revving under the tachometer
        (BEAT0 - 0.35, '1490', 0.7, None),          # whoosh into montage
        (intro.t_title, '2902', 1.0, None),         # title impact
    ]
    for i in range(1, len(Intro.SHOTS)):
        ev.append((BEAT0 + i * BEAT - 0.05, '1492', 0.45, None))
    alt = 0
    for i in range(1, len(segs)):
        if segs[i].cont:
            continue
        st = starts[i]
        if isinstance(segs[i], (Stinger, MobileStinger)):
            ev.append((st - 0.45, '1538', 0.95, None))
        elif isinstance(segs[i], Outro):
            ev.append((st - 0.25, '2918', 0.9, None))
        else:
            ev.append((st - 0.28, '1492' if alt % 2 else '1490', 0.55, None))
            alt += 1
    # pit-stop wheel gun when the replay starts rolling
    rp = next(i for i, s in enumerate(segs) if getattr(s, 'cont', False))
    ev.append((starts[rp] + 2.0, '817', 0.35, None))
    os.makedirs(f'{S}/out', exist_ok=True)
    wav = f'{S}/out/audio_v2.wav'
    mi = next(i for i, s in enumerate(segs) if isinstance(s, MobileStinger))
    t_sw = starts[mi]
    ev.append((t_sw, '2902', 0.9, None))
    parts = [('706.mp3', 0.0, 0.0, t_sw + 0.5, 0.0, 0.9, 0.8),
             ('126.mp3', 11.5, t_sw, total, 0.05, 2.5, 0.8)]
    build_audio(total, ev, parts, wav)
    print('audio done')

    out = f'{S}/out/promo_v2.mp4' if not PREVIEW else f'{S}/out/preview_v2.mp4'
    enc = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast' if PREVIEW else 'medium',
                            '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
                            '-c:a', 'aac', '-b:a', '192k', '-shortest', out], stdin=subprocess.PIPE)
    WT = 0.26
    nframes = int(round(total * FPS))
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
        # wipes only between app segments; photo stingers and outro cut hard with a flash
        def is_app(s):
            return isinstance(s, (Desktop, Mobile, DualPhone, Both))
        if nxt < len(segs) and not segs[nxt].cont and is_app(cur) and is_app(segs[nxt]) and starts[nxt] - gt <= WT:
            wipe(img, 1 - (starts[nxt] - gt) / WT, cover=True)
        if seg_i > 0 and not cur.cont and is_app(cur) and is_app(segs[seg_i - 1]) and lt < WT:
            wipe(img, lt / WT, cover=False)
        if seg_i > 0 and (not is_app(cur) or not is_app(segs[seg_i - 1])) and lt < 0.08 and not isinstance(cur, Outro):
            ov = Image.new('RGB', (W, H), (255, 255, 255))
            img = Image.blend(img, ov, 0.6 * (1 - lt / 0.08))
        enc.stdin.write(img.tobytes())
        if fi % 300 == 0:
            print(f'frame {fi}/{nframes}', flush=True)
    cur.stop()
    enc.stdin.close()
    enc.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
