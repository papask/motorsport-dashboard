"""Original procedurally-synthesized soundtrack (no samples, no third-party audio).

make_music(total, drops, breaks, whooshes, path)
  drops    : times (s) where full beat kicks in with an impact
  breaks   : [(start, end)] windows with no drums (intro / breakdown)
  whooshes : times (s) of transition swooshes
"""
import numpy as np
from scipy.signal import butter, lfilter, sosfilt
import wave

SR = 48000
BPM = 124
BEAT = 60 / BPM
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, fc, order=2):
    sos = butter(order, fc, 'low', fs=SR, output='sos')
    return sosfilt(sos, x)


def hp(x, fc, order=2):
    sos = butter(order, fc, 'high', fs=SR, output='sos')
    return sosfilt(sos, x)


def bp(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], 'band', fs=SR, output='sos')
    return sosfilt(sos, x)


def saw(f, t, phase=0.0):
    return 2 * ((f * t + phase) % 1.0) - 1


def add(buf, sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= buf.shape[1] or i + len(sig) <= 0:
        return
    j = min(buf.shape[1], i + len(sig))
    s = sig[: j - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:j] += s * l * 1.414
    buf[1, i:j] += s * r * 1.414


def kick():
    t = np.arange(int(0.42 * SR)) / SR
    f = 45 + 110 * np.exp(-t * 38)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 400) * 0.25
    return np.tanh((body + click) * 1.6) * 0.9


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    x = hp(rng.standard_normal(n), 7500, 4)
    return x * np.exp(-t * (18 if open_ else 90)) * 0.35


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    x = bp(rng.standard_normal(n), 900, 5000)
    env = np.exp(-t * 22) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 30) * (t > 0.012)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    return (x * env * 0.5 + tone) * 0.7


def pluck(note, dur, bright=4000):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(note)
    x = 0.6 * saw(f, t) + 0.4 * np.sign(np.sin(2 * np.pi * f * 1.004 * t))
    x = lp(x, bright) * np.exp(-t * 9)
    return x * 0.22


def bass_note(note, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(note)
    x = saw(f, t) + 0.5 * np.sin(2 * np.pi * f / 2 * t)
    x = lp(x, 520, 2)
    env = np.minimum(1, t / 0.005) * np.exp(-t * 2.5)
    return np.tanh(x * env * 1.4) * 0.42


def pad_chord(notes, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for nt in notes:
        f = midi(nt)
        for d in (-0.12, 0.0, 0.11):
            x += saw(f * 2 ** (d / 12), t, rng.random())
    x = lp(x / (len(notes) * 3), 1800, 2)
    env = np.minimum(1, t / 0.25) * np.minimum(1, (dur - t) / 0.3)
    return x * env * 0.5


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 2048
    for i in range(0, n, seg):
        k = i / n
        fc = 300 + 7000 * k ** 2
        out[i:i + seg] = bp(noise[i:i + seg], fc * 0.7, min(fc * 1.3, 20000), 1)
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / dur) ** 2) / SR) * 0.15
    return (out * 0.5 + sweep) * (t / dur) ** 1.6 * 0.6


def impact():
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 8)) / SR) * np.exp(-t * 2.2)
    crash = hp(rng.standard_normal(n), 5000) * np.exp(-t * 2.8) * 0.25
    return np.tanh(boom * 1.4) * 0.7 + crash


def whoosh(dur=0.55):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    seg = 1024
    for i in range(0, n, seg):
        k = i / n
        fc = 500 + 5000 * np.sin(np.pi * k)
        out[i:i + seg] = bp(noise[i:i + seg], fc * 0.6, min(fc * 1.6, 20000), 1)
    env = np.sin(np.pi * t / dur) ** 2
    return out * env * 0.55


# A minor: Am - F - C - G  (one chord per bar)
PROG = [(57, [57, 60, 64, 69]), (53, [53, 57, 60, 65]), (48, [55, 60, 64, 67]), (55, [55, 59, 62, 67])]


def make_music(total, drops, breaks, whooshes, path):
    n = int((total + 0.5) * SR)
    drums = np.zeros((2, n))
    music = np.zeros((2, n))
    fx = np.zeros((2, n))
    bar = BEAT * 4

    def in_break(t):
        return any(a <= t < b for a, b in breaks)

    K, C, H, HO = kick(), clap(), hat(), hat(True)
    nbeats = int(total / BEAT) + 1
    for b in range(nbeats):
        t = b * BEAT
        if t >= total - 0.3:
            break
        if not in_break(t):
            add(drums, K, t, 1.0)
            if b % 4 in (1, 3):
                add(drums, C, t, 0.55, 0.05)
            add(drums, HO, t + BEAT / 2, 0.5, 0.25)
            for s in (0.25, 0.75):
                add(drums, H, t + BEAT * s, 0.45, -0.3)

    nbars = int(total / bar) + 1
    for i in range(nbars):
        t = i * bar
        root, chord = PROG[i % 4]
        add(music, pad_chord(chord, bar + 0.05), t, 0.55 if not in_break(t) else 0.8, 0)
        if not in_break(t + 0.01):
            for e in range(8):
                add(music, bass_note(root - 12, BEAT / 2 * 0.95), t + e * BEAT / 2 + BEAT / 2 * (e % 2 == 0) * 0, 1.0 if e % 2 else 0.7)
            # arp
            arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[3] + 12, chord[2] + 12, chord[1] + 12, chord[3] + 12, chord[2] + 24]
            for s in range(16):
                add(music, pluck(arp[s % 8], BEAT / 4 * 1.8, 2500 + 2500 * (s % 4 == 0)), t + s * BEAT / 4, 0.55, 0.35 if s % 2 else -0.35)

    # sidechain pump on music from kick grid
    tt = np.arange(n) / SR
    ph = (tt % BEAT) / BEAT
    pump = 1 - 0.55 * np.exp(-ph * 9)
    brk = np.zeros(n, bool)
    for a, b in breaks:
        brk[int(a * SR):int(b * SR)] = True
    pump[brk] = 1.0
    music *= pump
    # low-pass music during breaks for a filtered feel
    for a, b in breaks:
        i, j = int(a * SR), min(n, int(b * SR))
        for c in range(2):
            music[c, i:j] = lp(music[c, i:j], 900, 2)

    for d in drops:
        R = riser(min(2.2, d))
        add(fx, R, d - len(R) / SR, 0.7)
        add(fx, impact(), d, 0.8)
    for w in whooshes:
        add(fx, whoosh(), w - 0.27, 0.5, rng.uniform(-0.5, 0.5))

    mix = drums * 0.9 + music * 0.8 + fx * 0.9
    # master: gentle fade in/out, soft clip
    fade = np.ones(n)
    fi = int(0.4 * SR)
    fade[:fi] = np.linspace(0, 1, fi)
    fo0, fo1 = int((total - 3.0) * SR), int(total * SR)
    fade[fo0:fo1] = np.linspace(1, 0, fo1 - fo0)
    fade[fo1:] = 0
    mix *= fade
    mix = np.tanh(mix * 0.9) / np.tanh(0.9)
    mix /= np.max(np.abs(mix)) + 1e-9
    mix *= 0.89
    pcm = (mix.T * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
