const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, '..', 'client', 'public', 'brand');
const jobs = [['onthelimit-mark.svg', 512, 'onthelimit-mark-512.png'], ['onthelimit-mark.svg', 192, 'onthelimit-mark-192.png'], ['onthelimit-mark.svg', 180, 'apple-touch-icon.png'],
  ['favicon.svg', 32, 'favicon-32.png'], ['favicon.svg', 16, 'favicon-16.png']];
for (const f of fs.readdirSync(OUT)) if (f.startsWith('onthelimit-logo-') && f.endsWith('.svg')) jobs.push([f, null, f.replace('.svg', '@2x.png')]);
(async () => {
  const b = await chromium.launch();
  for (const [src, px, dst] of jobs) {
    const svg = fs.readFileSync(path.join(OUT, src), 'utf8');
    const [, vw, vh] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
    const w = px || vw, h = px ? Math.round(px * vh / vw) : vh, dpr = px ? 1 : 2;
    const p = await b.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) }, deviceScaleFactor: dpr });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${w}" height="${h}"`)}</body></html>`);
    await p.screenshot({ path: path.join(OUT, dst), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    await p.close();
  }
  await b.close();
})();
