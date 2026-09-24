"""Promo video v3: mobile-first, light theme, exactly 90 s on one uncut track.

Builds on make_video2.py (photo montage, stingers, frames, audio mixer).
"""
import os, sys, subprocess
import numpy as np
from PIL import Image, ImageDraw

S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, S)
import make_video2 as V  # noqa: E402
from make_video import W, H, FPS, RED, font, ease_out, ease_io, with_alpha, anim_paste, text_layer, wrap, Browser, Phone, wipe, BGIMG, STREAKS  # noqa: E402

V.CLIPS = f'{S}/clips3'
FF = V.FF
MEDIA = V.MEDIA
SERVICE = V.SERVICE
PREVIEW = '--preview' in sys.argv

TOTAL = 90.0
MUSIC = '136.mp3'          # Mixkit "Infected Mushroom Vibes" (90.5 s, natural ending ~86.7 s)
P = 2.4                    # music starts on "lights out"
B = 0.412                  # beat period of the track
V.BEAT0, V.BEAT = P, 2 * B  # montage cuts every two beats


class Intro(V.Intro):
    """Same build-up as v2, without the DESKTOP / MOBILE / SEASON chips."""
    SHOTS = ['ov44', 'ov40', 'ov89', 'ov96', 'ov85', 'ov106']
    WORDS = ['SCHEDULE', 'STANDINGS', 'RESULTS', 'REPLAY', 'TELEMETRY', 'INCIDENTS']

    def __init__(self):
        super().__init__()
        self.chips = []
        self.dur = self.t_title + 8 * B


class MobileHero(V.Seg):
    def __init__(self, name, t_in, t_out, speed):
        self.name, self.t_in, self.t_out, self.speed = name, t_in, t_out, speed
        self.dur = V.clen(t_in, t_out, speed)
        self.sw = 390
        self.shc = int(self.sw * 1688 / 780)
        self.ph = Phone(self.sw, self.shc)
        self.l1 = text_layer([('손 안의', 'Black', 104, 'white', 0)], 1000)
        self.l2 = text_layer([('F1 온더리밋', 'Black', 104, RED, 0)], 1000)
        sub = '스마트폰 하나로 시즌의 모든 데이터를'
        self.sub = text_layer([(sub, 'SemiBold', 40, (225, 225, 232), 0)], 1000)
        self.bul = []
        for b in ['스케줄 · 스탠딩 · 결과', '타임라인 · 리플레이', '텔레메트리 · 인시던트']:
            im = Image.new('RGBA', (900, 50), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.rounded_rectangle([0, 14, 8, 36], 3, fill=RED)
            d.text((26, 25), b, font=font('SemiBold', 30), fill=(232, 232, 240), anchor='lm')
            self.bul.append(im)

    def start(self):
        self.r = V.Reader(V.clip(self.name), self.t_in, self.t_out, self.speed, self.sw, self.shc)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        STREAKS.draw(img, t + 5, 0.6, 0.6)
        k = ease_out(t / 0.8)
        # phone rises with a slight overshoot-free ease
        self.ph.draw(img, self.r.next(), 1200, int((H - self.ph.size[1]) // 2 + 220 * (1 - k)))
        anim_paste(img, self.l1, 200, 250, t, 0.05, dx=-80)
        anim_paste(img, self.l2, 200, 370, t, 0.18, dx=-80)
        anim_paste(img, self.sub, 204, 530, t, 0.35)
        for i, b in enumerate(self.bul):
            anim_paste(img, b, 204, 620 + i * 60, t, 0.6 + i * 0.15)
        return img.convert('RGB')

    def stop(self):
        self.r.close()


class WideStinger(V.Seg):
    """Phone outline stretches into a widescreen frame over a panning race shot."""
    def __init__(self, dur=3.0):
        self.dur = dur
        self.ph = V.Photo('ov96', 1.2)
        self.l1 = text_layer([('데스크탑에서는', 'Black', 88, 'white', 0)], 1400)
        self.l2 = text_layer([('더 넓게, 한눈에.', 'Black', 88, RED, 0)], 1400)
        self.sub = text_layer([('차트와 표를 나란히 · 더 많은 정보를 한 화면에', 'SemiBold', 34, (235, 235, 240), 0)], 1400)

    def frame(self, t):
        k = t / self.dur
        img = V.grade(self.ph.frame(1.02 + 0.08 * k, 0.2 + 0.6 * k, 0.5), dark=0.35).convert('RGBA')
        img.alpha_composite(V.LGRAD)
        img.alpha_composite(V.LGRAD)
        img.alpha_composite(V.VIG)
        STREAKS.draw(img, t * 2 + 11, 2.5, 0.8)
        # morphing frame: phone (270x560) -> wide (1500x840)
        m = ease_io((t - 0.35) / 1.1)
        w = int(230 + (1040 - 230) * m)
        h = int(470 + (600 - 470) * m)
        cx, cy = 1340, H // 2
        d = ImageDraw.Draw(img, 'RGBA')
        r = int(40 - 26 * m)
        d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2], r, outline=(255, 255, 255, 230), width=5)
        if m > 0.02:
            d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy - h // 2 + int(34 * m)], r, fill=(255, 255, 255, int(60 * m)))
        anim_paste(img, self.l1, 120, 330, t, 0.9, dx=-80, dur=0.45)
        anim_paste(img, self.l2, 120, 450, t, 1.05, dx=-80, dur=0.45)
        anim_paste(img, self.sub, 124, 610, t, 1.3, dx=-40, dur=0.45)
        return img.convert('RGB')


class DesktopWide(V.Desktop):
    SCALE = 0.84


class Compare(V.Seg):
    """Same page on phone and desktop side by side."""
    def __init__(self, m, d, title, desc):
        self.m, self.d = m, d
        self.dur = min(V.clen(*m[1:]), V.clen(*d[1:]))
        self.sw = 300
        self.shc = int(self.sw * 1688 / 780)
        self.ph = Phone(self.sw, self.shc)
        self.cw, self.ch = 1300, int(1300 * 1080 / 1920)
        self.br = Browser(self.cw, self.ch, SERVICE)
        self.t, self.tw, self.s = V.caption(title, desc)
        self.bar = V.accent_bar()
        self.lab_m = V.chip('모바일', 22, (40, 40, 48))
        self.lab_d = V.chip('데스크탑', 22, RED)

    def start(self):
        self.rm = V.Reader(V.clip(self.m[0]), self.m[1], self.m[2], self.m[3], self.sw, self.shc)
        self.rd = V.Reader(V.clip(self.d[0]), self.d[1], self.d[2], self.d[3], self.cw, self.ch)

    def frame(self, t):
        img = BGIMG.copy().convert('RGBA')
        k1, k2 = ease_out(t / 0.7), ease_out((t - 0.2) / 0.8)
        py = H - self.ph.size[1] - 40
        self.ph.draw(img, self.rm.next(), int(90 - 80 * (1 - k1)), py)
        bx, by = 500, 250
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        self.br.draw(layer, self.rd.next(), int(bx + 120 * (1 - k2)), by)
        img.alpha_composite(with_alpha(layer, max(0.0, min(1.0, k2 * 1.2))))
        anim_paste(img, self.lab_m, 90 + self.ph.size[0] // 2 - self.lab_m.width // 2, py - 56, t, 0.2, dx=0)
        anim_paste(img, self.lab_d, bx + self.cw // 2 - self.lab_d.width // 2, by - 56, t, 0.4, dx=0)
        anim_paste(img, self.bar, 90, 46, t, 0.0, dx=0, dur=0.3)
        anim_paste(img, self.t, 116, 42, t, 0.05)
        anim_paste(img, self.s, 116 + self.tw + 28, 58, t, 0.18)
        return img.convert('RGB')

    def stop(self):
        self.rm.close(); self.rd.close()


class Outro(V.Outro):
    pass


M = V.Mobile
SEGS = [
    Intro(),
    MobileHero('m01_dashboard', 0.2, 6.4, 1.24),
    M('m02_schedule', 0.2, 7.2, 1.27, '스케줄', '시즌 전체 그랑프리 일정을 한국 시간(KST)으로', ['레이스만 / 전 세션 보기', '다음 레이스 강조']),
    M('m03_standings', 0.2, 6.0, 1.05, '스탠딩', '드로어 메뉴에서 바로 드라이버 · 컨스트럭터 순위로', ['라운드별 순위 변동 차트', '이번 라운드 획득 포인트'], side='left'),
    M('m04_results', 0.2, 8.4, 1.5, '레이스 결과', '포디움부터 전체 순위, 퀄리파잉 Q1–Q3 기록까지', ['그리드 · 기록 · 패스티스트 랩']),
    M('m05_timeline', 0.3, 15.6, 2.04, '타임라인 · 리플레이', '랩마다 바뀌는 순위를 차트와 리플레이로', ['30x ~ 480x 재생', '타이어 · 플래그 · 세이프티카'], side='left'),
    M('m06_telemetry', 0.3, 10.0, 1.62, '텔레메트리', '두 드라이버의 속도 · RPM · 기어를 거리 기준으로 비교', ['최속랩 자동 선택', '스피드 트랩 기록']),
    M('m07_incidents', 0.2, 6.7, 1.35, '인시던트', '레이스 컨트롤 메시지를 카테고리와 랩별 밀도로', ['Flag · SafetyCar 필터'], side='left'),
    WideStinger(3.0),
    DesktopWide('w01_drivers', 0.2, 10.1, 1.8, '드라이버 스탠딩', '전체 순위표와 라운드별 순위 변동 차트를 나란히'),
    DesktopWide('w02_timeline', 0.2, 19.2, 2.6, '레이스 타임라인', '57랩 · 22명의 순위 흐름을 한 장의 차트로, 이어서 리플레이까지'),
    DesktopWide('w03_telemetry', 0.2, 10.4, 1.85, '텔레메트리', '랩 리스트 옆에서 두 드라이버의 속도와 페달 입력을 넓게 비교'),
    DesktopWide('w04_schedule', 0.2, 6.7, 1.45, '스케줄', '시즌 전체 일정을 4열 그리드로 한눈에'),
    Compare(('m03_standings', 2.6, 6.0, 0.62), ('w01_drivers', 4.6, 10.1, 1.0), '같은 데이터, 더 넓은 시야', '모바일과 데스크탑에서 같은 스탠딩'),
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

    intro = segs[0]
    ev = [(0.0, '2724', 0.85, (0.0, 2.6)),
          (P - 0.3, '1490', 0.6, None),
          (intro.t_title, '2902', 0.9, None)]
    alt = 0
    for i in range(1, len(segs)):
        st = starts[i]
        s = segs[i]
        if isinstance(s, (WideStinger, MobileHero)):
            ev.append((st - 0.45, '1538', 0.9, None))
        elif isinstance(s, Outro):
            ev.append((st - 0.2, '2918', 0.8, None))
        else:
            ev.append((st - 0.28, '1492' if alt % 2 else '1490', 0.45, None))
            alt += 1
    wav = f'{S}/out/audio_v3.wav'
    os.makedirs(f'{S}/out', exist_ok=True)
    V.build_audio(total, ev, [(MUSIC, 0.0, P, total, 0.0, 0.6, 0.8)], wav)
    print('audio done')

    out = f'{S}/out/promo_v3.mp4' if not PREVIEW else f'{S}/out/preview_v3.mp4'
    enc = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast' if PREVIEW else 'medium',
                            '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
                            '-c:a', 'aac', '-b:a', '192k', '-t', f'{TOTAL:.3f}', out], stdin=subprocess.PIPE)

    def is_app(s):
        return isinstance(s, (V.Desktop, V.Mobile, Compare))

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
