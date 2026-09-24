const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'rec4');
const BASE = 'http://127.0.0.1:5173';
const only = process.argv[2];

const OVERLAY = (mobile) => `
(() => {
  const mobile = ${mobile};
  const init = () => {
    if (window.__ovl || !document.body) return; window.__ovl = 1;
    const st = document.createElement('style');
    st.textContent = \`
      #__cur{position:fixed;left:-100px;top:-100px;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:transform .12s}
      .__rip{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:3px solid rgba(255,255,255,.9);background:rgba(225,6,0,.35);
        width:16px;height:16px;margin:-8px 0 0 -8px;animation:__r .55s ease-out forwards}
      @keyframes __r{to{transform:scale(4.2);opacity:0}}
      html{scrollbar-width:none} ::-webkit-scrollbar{display:none}\`;
    document.head.appendChild(st);
    if (!mobile) {
      const c = document.createElement('div'); c.id = '__cur';
      c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 2 L2 18 L6.5 13.8 L9.6 20.5 L12.4 19.2 L9.4 12.7 L15.5 12.7 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      document.body.appendChild(c);
      window.addEventListener('mousemove', (e) => { c.style.left = e.clientX - 2 + 'px'; c.style.top = e.clientY - 2 + 'px'; }, true);
    }
    const rip = (x, y) => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); };
    window.__rip = rip;
    window.addEventListener('pointerdown', (e) => rip(e.clientX, e.clientY), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();`;

async function startCast(page, dir) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = []; let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const file = `f${String(n++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  return async () => {
    const t1 = Date.now() / 1000;
    await cdp.send('Page.stopScreencast');
    await new Promise((r) => setTimeout(r, 300));
    fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ t0, t1, frames }));
    console.log(path.basename(dir), frames.length, 'frames', (t1 - t0).toFixed(1) + 's');
  };
}

const wait = (p, ms) => p.waitForTimeout(ms);
async function smoothScroll(page, to, ms = 1500, sel = '.main-content') {
  await page.evaluate(([to, ms, sel]) => new Promise((res) => {
    const el = sel ? document.querySelector(sel) : null;
    const get = () => (el ? el.scrollTop : window.scrollY);
    const set = (v) => (el ? (el.scrollTop = v) : window.scrollTo(0, v));
    const from = get(); const target = typeof to === 'number' ? to : from + Number(to.slice(1));
    const s = performance.now();
    const step = (now) => { const k = Math.min(1, (now - s) / ms); const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; set(from + (target - from) * e); k < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  }), [to, ms, sel]);
}
async function scrollToEl(page, locator, offset = 90, ms = 1400) {
  const y = await locator.evaluate((el, off) => { const m = document.querySelector('.main-content'); return el.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - off; }, offset);
  await smoothScroll(page, Math.max(0, y), ms);
}
let mouse = { x: 960, y: 540 };
async function moveTo(page, x, y, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  const sx = mouse.x, sy = mouse.y;
  for (let i = 1; i <= steps; i++) { const k = i / steps; const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e); await page.waitForTimeout(ms / steps); }
  mouse = { x, y };
}
async function moveToEl(page, loc, ms = 700, dx = 0.5, dy = 0.5) {
  const b = await loc.boundingBox();
  await moveTo(page, b.x + b.width * dx, b.y + b.height * dy, ms);
}
async function clickEl(page, loc, ms = 700) { await moveToEl(page, loc, ms); await wait(page, 150); await page.mouse.down(); await wait(page, 80); await page.mouse.up(); }
async function selectVia(page, loc, value, ms = 700) { await moveToEl(page, loc, ms); await wait(page, 150); await page.evaluate(([x, y]) => window.__rip && window.__rip(x, y), [mouse.x, mouse.y]); await wait(page, 250); await loc.selectOption(value); }
async function tap(page, loc) { const b = await loc.boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.evaluate(([x, y]) => window.__rip && window.__rip(x, y), [b.x + b.width / 2, b.y + b.height / 2]); }
async function tapSelect(page, loc, value) { const b = await loc.boundingBox(); await page.evaluate(([x, y]) => window.__rip && window.__rip(x, y), [b.x + b.width / 2, b.y + b.height / 2]); await wait(page, 300); await loc.selectOption(value); }
async function swipe(page, dy, ms = 1100) { await smoothScroll(page, '+' + dy, ms); }


const nav = async (p, group, item) => {
  await moveToEl(p, p.locator('.nav-group-trigger', { hasText: group }), 700); await wait(p, 500);
  await clickEl(p, p.locator('.dropdown-item', { hasText: item }).first(), 450);
};
const seg = (p, text) => p.locator('.seg-opt', { hasText: text }).first();

const desktopScenes = {
  async w01_drivers(p) {
    await p.goto(BASE + '/drivers'); await p.waitForSelector('text=전체 드라이버 스탠딩'); await wait(p, 3000);
    const stop = await startCast(p, OUT + '/w01_drivers');
    await moveTo(p, 400, 400, 1); await wait(p, 500);
    await moveTo(p, 500, 560, 700); await wait(p, 300);
    for (const [x, y] of [[1150, 330], [1350, 440], [1550, 380], [1720, 520]]) { await moveTo(p, x, y, 600); await wait(p, 450); }
    await stop();
  },
  async w02_timeline(p) {
    await p.goto(BASE + '/timeline'); await p.waitForSelector('.seg-opt'); await wait(p, 2000);
    await p.locator('.seg-opt', { hasText: '레이스' }).first().click();
    await p.waitForSelector('.recharts-surface', { timeout: 60000 }); await wait(p, 5000);
    const stop = await startCast(p, OUT + '/w02_timeline');
    await moveTo(p, 500, 520, 1); await wait(p, 300);
    for (const x of [700, 1000, 1300, 1600]) { await moveTo(p, x, 520, 600); await wait(p, 400); }
    const replayHdr = p.locator('.accordion-title', { hasText: '레이스 리플레이' });
    await scrollToEl(p, replayHdr, 80, 1300); await wait(p, 300);
    await clickEl(p, p.locator('button', { hasText: '480x' }), 600); await wait(p, 200);
    await clickEl(p, p.locator('button', { hasText: '▶' }), 500);
    await moveTo(p, 1500, 900, 500);
    await wait(p, 6000);
    await stop();
  },
  async w03_telemetry(p) {
    await p.goto(BASE + '/telemetry'); await p.waitForSelector('text=속도 · 랩', { timeout: 60000 }); await wait(p, 1500);
    await p.locator('select.selector').nth(1).selectOption('3'); await wait(p, 5000);
    const stop = await startCast(p, OUT + '/w03_telemetry');
    await moveTo(p, 500, 800, 1); await wait(p, 300);
    await moveTo(p, 1400, 820, 1800); await wait(p, 400);
    await clickEl(p, p.locator('.tab', { hasText: '드라이버 입력' }), 700); await wait(p, 1800);
    await moveTo(p, 900, 800, 900); await wait(p, 500);
    await stop();
  },
  async w04_schedule(p) {
    await p.goto(BASE + '/schedule'); await p.waitForSelector('text=Australian Grand Prix'); await wait(p, 2000);
    const stop = await startCast(p, OUT + '/w04_schedule');
    await moveTo(p, 1200, 500, 1); await wait(p, 400);
    await clickEl(p, seg(p, '전 세션'), 800); await wait(p, 900);
    await moveTo(p, 1400, 760, 500);
    await smoothScroll(p, 700, 2600); await wait(p, 500);
    await stop();
  },
  async w05_dashboard(p) {
    await p.goto(BASE + '/'); await p.waitForSelector('text=드라이버 스탠딩 TOP 5'); await wait(p, 2500);
    const stop = await startCast(p, OUT + '/w05_dashboard');
    await moveTo(p, 300, 300, 1); await wait(p, 300);
    await moveTo(p, 1300, 300, 1200); await wait(p, 300);
    await moveTo(p, 1500, 480, 700); await wait(p, 1200);
    await stop();
  },
};

const mobileScenes = {
  async m01_dashboard(p) {
    await p.goto(BASE + '/'); await p.waitForSelector('text=드라이버 스탠딩 TOP 5'); await wait(p, 2500);
    const stop = await startCast(p, OUT + '/m01_dashboard');
    await wait(p, 1500);
    await swipe(p, 320, 1400); await wait(p, 1000);
    await swipe(p, 400, 1400); await wait(p, 1200);
    await stop();
  },
  async m02_schedule(p) {
    await p.goto(BASE + '/schedule'); await p.waitForSelector('text=Australian Grand Prix'); await wait(p, 2000);
    const stop = await startCast(p, OUT + '/m02_schedule');
    await wait(p, 700);
    await tap(p, seg(p, '전 세션')); await wait(p, 1100);
    await swipe(p, 700, 1600); await wait(p, 500);
    await swipe(p, -700, 900); await wait(p, 300);
    const pin = p.locator('.next-race-pin');
    if (await pin.count() && await pin.isVisible()) { await tap(p, pin); await wait(p, 1800); }
    else { await swipe(p, 900, 1800); await wait(p, 900); }
    await stop();
  },
  async m03_standings(p) {
    await p.goto(BASE + '/'); await p.waitForTimeout(2500);
    const stop = await startCast(p, OUT + '/m03_standings');
    await wait(p, 600);
    await tap(p, p.locator('.nav-hamburger')); await wait(p, 1400);
    await tap(p, p.locator('.top-nav-drawer .dropdown-item', { hasText: '드라이버' }).first());
    await p.waitForSelector('text=전체 드라이버 스탠딩'); await wait(p, 1000);
    const tg = p.locator('.collapse-toggle').first();
    if (await tg.count()) { await tap(p, tg); await wait(p, 2200); }
    await swipe(p, 520, 1500); await wait(p, 900);
    await stop();
  },
  async m04_results(p) {
    await p.goto(BASE + '/results'); await p.waitForSelector('.seg-opt'); await wait(p, 3000);
    const stop = await startCast(p, OUT + '/m04_results');
    await wait(p, 900);
    await swipe(p, 520, 1500); await wait(p, 900);
    await swipe(p, -520, 900); await wait(p, 300);
    await tap(p, seg(p, '퀄리파잉')); await wait(p, 2000);
    await swipe(p, 400, 1200); await wait(p, 700);
    await stop();
  },
  async m05_timeline(p) {
    await p.goto(BASE + '/timeline'); await p.waitForTimeout(3000);
    const stop = await startCast(p, OUT + '/m05_timeline');
    await wait(p, 400);
    await tap(p, seg(p, '레이스'));
    await p.waitForSelector('.accordion-title', { timeout: 60000 }); await wait(p, 1200);
    await tap(p, p.locator('.collapse-toggle').first()); await wait(p, 2500);
    const replayHdr = p.locator('.accordion-title', { hasText: '레이스 리플레이' });
    await scrollToEl(p, replayHdr, 70, 1300); await wait(p, 300);
    await tap(p, p.locator('button', { hasText: '480x' })); await wait(p, 300);
    await tap(p, p.locator('button', { hasText: '▶' })); await wait(p, 1500);
    await swipe(p, 260, 900);
    await wait(p, 6000);
    await stop();
  },
  async m06_telemetry(p) {
    await p.goto(BASE + '/telemetry'); await p.waitForSelector('text=속도 · 랩', { timeout: 60000 }); await wait(p, 2000);
    const stop = await startCast(p, OUT + '/m06_telemetry');
    await wait(p, 600);
    await tapSelect(p, p.locator('select.selector').nth(1), '3'); await wait(p, 3500);
    await swipe(p, 560, 1500); await wait(p, 1300);
    await swipe(p, 500, 1400); await wait(p, 1200);
    await stop();
  },
  async m07_incidents(p) {
    await p.goto(BASE + '/incidents'); await p.waitForSelector('.density-rail', { timeout: 60000 }); await wait(p, 2000);
    const stop = await startCast(p, OUT + '/m07_incidents');
    await wait(p, 700);
    await tap(p, seg(p, 'Flag')); await wait(p, 1400);
    await tap(p, seg(p, 'SafetyCar')); await wait(p, 1400);
    await tap(p, seg(p, '전체')); await wait(p, 1000);
    await swipe(p, 400, 1200); await wait(p, 800);
    await stop();
  },
};

(async () => {
  const b = await chromium.launch();
  const common = { locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: 'light' };
  for (const [name, fn] of Object.entries(desktopScenes)) {
    if (only && !name.startsWith(only)) continue;
    const ctx = await b.newContext({ ...common, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(OVERLAY(false));
    const p = await ctx.newPage(); mouse = { x: 960, y: 540 };
    try { await fn(p); } catch (e) { console.error(name, e.message); await p.screenshot({ path: `${OUT}/${name}_err.png` }); }
    await ctx.close();
  }
  for (const [name, fn] of Object.entries(mobileScenes)) {
    if (only && !name.startsWith(only)) continue;
    const ctx = await b.newContext({ ...common, ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(OVERLAY(true));
    const p = await ctx.newPage();
    try { await fn(p); } catch (e) { console.error(name, e.message); await p.screenshot({ path: `${OUT}/${name}_err.png` }); }
    await ctx.close();
  }
  await b.close();
})();
