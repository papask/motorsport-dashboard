const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch();
for (const [src, w, out] of [['onthelimit-logo-ko-dark.svg', 1400, 'logo_ko_dark.png'], ['onthelimit-logo-ko-tagline-dark.svg', 1200, 'logo_tag_dark.png']]) {
  const svg = fs.readFileSync(require('path').join(__dirname, '..', '..', '..', 'client', 'public', 'brand', src), 'utf8'); const [, vw, vh] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  const h = Math.round(w * vh / vw); const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent('<body style="margin:0;background:transparent">' + svg.replace(/width="[\d.]+" height="[\d.]+"/, 'width="' + w + '" height="' + h + '"') + '</body>');
  await p.screenshot({ path: __dirname + '/' + out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } }); await p.close(); console.log(out, w, h); }
await b.close(); })();
