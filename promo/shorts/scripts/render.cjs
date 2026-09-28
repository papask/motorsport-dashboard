// 녹화: index.html?render 를 1080×1920으로 열고 프레임마다 __seek(t) → 스크린샷 → ffmpeg(H.264)
//   node render.cjs [출력.mp4] [--stills 0.5,2,...]   (FFMPEG 환경변수로 ffmpeg 경로 지정 가능)
//   음악: music/music.mp3 가 있으면 곡의 MUSIC_START초 지점부터 입힌다(없으면 무음 트랙).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const FPS = 30;
// Mixkit "Sports Highlights"(125BPM). 72.333초 = 188번째 박(마디 첫 박)이 영상 18.0초(마무리 와이프)에 오고,
// 곡의 마지막 화음(92.25초)이 19.92초 주소 등장에 맞는다. 곡은 원래 엔딩으로 끝난다.
const MUSIC = path.resolve(__dirname, '..', 'music', 'music.mp3');
const MUSIC_START = 72.333;
(async () => {
  const args = process.argv.slice(2);
  const si = args.indexOf('--stills');
  const stills = si >= 0 ? args[si + 1].split(',').map(Number) : null;
  const out = path.resolve(args.find((a, i) => !a.startsWith('--') && i !== si + 1) || 'onthelimit-shorts-v1.mp4');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?render');
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  const fonts = await p.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight));
  console.log('fonts:', [...new Set(fonts)].join(', '));
  if (stills) {
    for (const t of stills) { await p.evaluate((t) => window.__seek(t), t); await p.screenshot({ path: out.replace(/\.mp4$/, '') + `-${t.toFixed(2)}.jpg`, type: 'jpeg', quality: 88 }); }
    await b.close(); return;
  }
  const dur = await p.evaluate(() => window.__DUR);
  const ff = spawn(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...(fs.existsSync(MUSIC)
      ? ['-ss', String(MUSIC_START), '-i', MUSIC, '-af', `volume=0.8,afade=t=in:d=0.12,afade=t=out:st=${dur - 0.8}:d=0.8,aresample=48000`, '-t', String(dur)]
      : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest']),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  console.log('music:', fs.existsSync(MUSIC) ? MUSIC : '(없음, 무음)');
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.__seek(t), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`\r${i}/${n}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('\n→', out);
  await b.close();
})();
