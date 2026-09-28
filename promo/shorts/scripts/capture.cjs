// 앱 화면 캡처: 실서비스(onthelimit.app)를 모바일 390×844(DPR 2), 라이트 테마, 한국어로 연다.
//   node capture.cjs → shots/*.png (img/ 로 옮기는 자르기는 README 참고)
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'https://www.onthelimit.app';
(async () => {
  fs.mkdirSync('shots', { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'ko-KR', colorScheme: 'light', ignoreHTTPSErrors: true });
  await ctx.addInitScript(() => { localStorage.setItem('theme-pref', 'light'); localStorage.setItem('app.lang', 'ko'); });
  const p = await ctx.newPage();
  // 스타일시트가 늦게 붙는 경우가 있어서, 스타일이 적용될 때까지 다시 연다
  const open = async (r) => {
    for (let k = 0; k < 5; k++) {
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(BASE + r, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
      if (await p.waitForFunction(() => getComputedStyle(document.body).margin === '0px', null, { timeout: 30000 }).then(() => true, () => false)) break;
    }
    await p.waitForTimeout(5000);
  };
  const tall = async (name) => { await p.setViewportSize({ width: 390, height: 2400 }); await p.waitForTimeout(2500); await p.screenshot({ path: `shots/${name}.png` }); };

  await open('/next'); await p.screenshot({ path: 'shots/next.png' }); await tall('next_tall');
  await open('/drivers'); await p.screenshot({ path: 'shots/drivers.png' });

  // 타임라인: 레이스 선택 → 순위 변동 차트 펼치기(긴 캡처) → 리플레이 480x 재생 중 캡처
  await open('/timeline');
  await p.locator('button', { hasText: /^레이스$/ }).first().click();
  await p.waitForFunction(() => document.querySelectorAll('button[aria-label]').length > 4, null, { timeout: 180000 });
  await p.locator('button', { hasText: /^480x$/ }).first().click();
  await p.locator('button[aria-label="재생"]').first().click();
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(6000); await p.screenshot({ path: `shots/tl_p${i}.png` }); }
  await p.locator('.collapse-toggle', { hasText: '펼치기' }).first().click();
  await p.waitForTimeout(4000);
  await tall('chart_tall');
  await b.close();
})();
