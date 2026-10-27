import { getFiaDocuments } from './services/fiaService';
import { nextRaceEnabled } from './services/nextRaceSettings';
import { getConstructorStandings, getDriverStandings, getSeasonSchedule } from './services/jolpicaService';
import { readGuide } from './services/guideBuilder';
import { gpHeading, gpNameKo } from './services/threadsService';
import { guideRace, type ScheduleRace } from './services/guideRules';

// Link-preview crawlers (KakaoTalk, Threads, X) don't run JavaScript, so each
// page's title, description and og:* are written into index.html here. Most
// pages also get their content as plain HTML inside #root, so crawlers (and
// the AdSense review) see the text; React replaces it on mount.

const SITE = '온더리밋';
const DEFAULT_DESCRIPTION = 'F1 드라이버·컨스트럭터 스탠딩, 레이스 결과, 텔레메트리 분석과 FiA 스튜어드 문서 한국어 요약.';

const PAGES: Record<string, [title: string, description: string]> = {
  '/': ['F1 레이스 데이터', DEFAULT_DESCRIPTION],
  '/drivers': ['F1 드라이버 스탠딩', '시즌 드라이버 챔피언십 순위와 라운드별 포인트 변화.'],
  '/constructors': ['F1 컨스트럭터 스탠딩', '시즌 컨스트럭터 챔피언십 순위와 라운드별 포인트 변화.'],
  '/schedule': ['F1 레이스 스케줄', '시즌 그랑프리 일정과 연습·예선·스프린트·레이스 세션 시간을 내 시간대로.'],
  '/results': ['F1 레이스 결과', '그랑프리별 레이스·예선·스프린트 결과 상세.'],
  '/timeline': ['F1 레이스 타임라인', '랩별 순위 변동 차트와 레이스 리플레이.'],
  '/telemetry': ['F1 텔레메트리', 'FastF1 데이터로 보는 드라이버별 차량 텔레메트리 분석.'],
  '/incidents': ['F1 레이스 인시던트', '레이스 컨트롤 메시지와 인시던트 기록.'],
  '/news': ['F1 뉴스 한국어 요약', '해외 F1 매체 기사를 한국어로 짧게 요약하고 원문으로 연결.'],
  '/docs': ['FiA 문서 한국어 요약', 'FiA 스튜어드 결정, 레이스 디렉터 노트 등 F1 공식 문서를 한국어로 요약.'],
  '/about': ['온더리밋 소개', `${SITE}은 한국 F1 팬을 위한 레이스 데이터·분석 사이트입니다. 운영 방식과 데이터 출처, 문의처.`],
  '/privacy': ['개인정보처리방침', `${SITE} 개인정보처리방침.`],
};

/** The pages the sitemap lists (the hidden /news page left out). */
export const SITEMAP_PATHS = Object.keys(PAGES).filter((p) => p !== '/news');

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const setAttr = (html: string, tag: RegExp, value: string) =>
  html.replace(tag, (m) => m.replace(/(content|href)="[^"]*"/, (_, attr) => `${attr}="${esc(value)}"`));

// "2026-10-19T13:00:00Z" → "10월 19일 (일) 22:00" in Korean time, the readers' zone
const kst = (date: string, time?: string) => new Date(`${date}T${time ?? '00:00:00Z'}`).toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', ...(time && { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
});

// canonical: the page's own URL when it differs from the pathname (a past event's /docs?event=)
interface Body { title?: string; description?: string; body: string; canonical?: string }

const eventPath = (event: string) => `/docs?event=${encodeURIComponent(event)}`;

/** One event's summaries (the latest by default), marked up with the page's own classes, and links to every other event. */
function docsBody(requested?: string): Body | null {
  const { events, event, documents } = getFiaDocuments(requested);
  const summarized = documents.filter((d) => d.summary);
  if (!event || !summarized.length) return null;
  const items = summarized.map((d) => `
    <article class="card"><h3>${esc(d.summary!.title_ko)}</h3>
    <ul>${d.summary!.summary_ko.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <a href="${esc(d.url)}">원문 PDF</a></article>`).join('');
  const others = events.filter((e) => e !== event).reverse()
    .map((e) => `<li><a href="${esc(eventPath(e))}">${esc(e)} FiA 문서</a></li>`).join('');
  return {
    title: `${event} FiA 문서 한국어 요약`,
    description: `${event} 스튜어드 결정, 페널티, 레이스 디렉터 노트 등 FiA 문서 ${summarized.length}건을 한국어로 요약.`,
    body: `<h1>${esc(event)} FiA 문서</h1>${items}${others ? `<h2>다른 대회 FiA 문서</h2><ul>${others}</ul>` : ''}`,
    canonical: requested === event ? eventPath(event) : undefined,
  };
}

const homeBody = (): Body => ({
  body: `<h1>${SITE} · F1 레이스 데이터</h1>
    <p>${SITE}은 한국 F1 팬을 위한 레이스 데이터·분석 사이트입니다. 시즌 일정을 한국 시간으로 정리하고,
    드라이버·컨스트럭터 챔피언십 순위와 라운드별 포인트 변화, 그랑프리별 레이스·예선·스프린트 결과를 보여 줍니다.</p>
    <p>FastF1 텔레메트리로 드라이버별 속도·스로틀·브레이크를 비교하고, 랩별 순위 변동과 레이스 컨트롤 메시지로
    레이스 흐름을 되짚을 수 있습니다. FiA가 발표하는 스튜어드 결정과 레이스 디렉터 노트는 한국어로 요약해 원문과 함께 올립니다.</p>
    <p>그랑프리 주간에는 다음 경기 가이드가 열립니다. 서킷의 역대 우승자와 폴 투 윈 기록, 지난 대회 결과,
    폴 랩으로 본 서킷 특성, 현재 챔피언십 상황을 한 페이지에 모았습니다.</p>`,
});

async function scheduleBody(year: number): Promise<Body | null> {
  const { races } = await getSeasonSchedule(year);
  if (!races.length) return null;
  const rows = races.map((r: any) => `<tr><td>${r.round}</td><td>${esc(gpNameKo(r.raceName))}</td>
    <td>${esc(r.circuit.name)} (${esc(r.circuit.locality)}, ${esc(r.circuit.country)})</td>
    <td>${esc(kst(r.date, r.time))}${r.sprint ? ' · 스프린트' : ''}</td></tr>`).join('');
  const sprints = races.filter((r: any) => r.sprint).length;
  return {
    title: `${year} F1 레이스 스케줄 (한국 시간)`,
    body: `<h1>${year} F1 시즌 일정</h1>
      <p>${year} 시즌은 ${races.length}개 그랑프리로 열리며, 그중 ${sprints}개 대회가 스프린트 주말입니다.
      개막전은 ${esc(gpNameKo(races[0].raceName))}, 최종전은 ${esc(gpNameKo(races.at(-1).raceName))}입니다. 레이스 시작 시각은 한국 시간 기준입니다.</p>
      <table><thead><tr><th>라운드</th><th>그랑프리</th><th>서킷</th><th>레이스 (한국 시간)</th></tr></thead><tbody>${rows}</tbody></table>`,
  };
}

async function driversBody(year: number): Promise<Body | null> {
  const { round, standings } = await getDriverStandings(year);
  if (!standings.length) return null;
  const name = (s: any) => `${s.driver.firstName} ${s.driver.lastName}`;
  const [first, second] = standings;
  const rows = standings.map((s: any) => `<tr><td>${s.position}</td><td>${esc(name(s))}</td>
    <td>${esc(s.constructor.name ?? '')}</td><td>${s.points}</td><td>${s.wins}</td></tr>`).join('');
  return {
    title: `${year} F1 드라이버 스탠딩 (${round} 라운드 후)`,
    body: `<h1>${year} F1 드라이버 챔피언십 순위</h1>
      <p>${round} 라운드까지 ${esc(name(first))}(${esc(first.constructor.name ?? '')})가 ${first.points}점, ${first.wins}승으로 선두입니다.
      ${second ? `2위 ${esc(name(second))}와는 ${first.points - second.points}점 차이입니다.` : ''}</p>
      <table><thead><tr><th>순위</th><th>드라이버</th><th>팀</th><th>포인트</th><th>우승</th></tr></thead><tbody>${rows}</tbody></table>`,
  };
}

async function constructorsBody(year: number): Promise<Body | null> {
  const { round, standings } = await getConstructorStandings(year);
  if (!standings.length) return null;
  const [first, second] = standings;
  const rows = standings.map((s: any) => `<tr><td>${s.position}</td><td>${esc(s.constructor.name)}</td>
    <td>${s.points}</td><td>${s.wins}</td></tr>`).join('');
  return {
    title: `${year} F1 컨스트럭터 스탠딩 (${round} 라운드 후)`,
    body: `<h1>${year} F1 컨스트럭터 챔피언십 순위</h1>
      <p>${round} 라운드까지 ${esc(first.constructor.name)}가 ${first.points}점, ${first.wins}승으로 선두입니다.
      ${second ? `2위 ${esc(second.constructor.name)}와는 ${first.points - second.points}점 차이입니다.` : ''}</p>
      <table><thead><tr><th>순위</th><th>팀</th><th>포인트</th><th>우승</th></tr></thead><tbody>${rows}</tbody></table>`,
  };
}

/** A next-race guide written out as sentences from its built file. */
/** Rounds whose guide page is open: built, and not past the coming race (as /api/next-race/:year/:round). */
async function openGuides(year: number) {
  const races = (await getSeasonSchedule(year)).races as (ScheduleRace & { round: number })[];
  const current = guideRace(races, Date.now())?.round ?? 0;
  return races.filter((r) => r.round <= current && readGuide(year, r.round));
}

async function guideBody(year: number, round: number): Promise<Body | null> {
  const race: any = (await openGuides(year)).find((r) => r.round === round);
  const g = readGuide(year, round);
  if (!race || !g) return null;
  const heading = gpHeading(year, round, race.raceName);
  const h = g.history;
  const p: string[] = [
    `${heading}는 ${race.circuit.name}(${race.circuit.locality}, ${race.circuit.country})에서 열립니다. 레이스는 한국 시간 ${kst(race.date, race.time)}에 시작합니다.`,
  ];
  if (h.races) {
    p.push(`이 서킷에서는 지금까지 F1 레이스가 ${h.races}번 열렸고${h.lastHeld ? `, 마지막 대회는 ${h.lastHeld}년이었습니다` : ''}. ` +
      `폴 포지션에서 출발한 드라이버가 그중 ${h.poleWins}번(${Math.round((h.poleWins / h.races) * 100)}%) 우승했습니다.`);
  } else {
    p.push('이 서킷에서 처음 열리는 F1 레이스입니다.');
  }
  if (h.mostWinsDrivers.length) p.push(`최다 우승 드라이버는 ${h.mostWinsDrivers.map((d) => d.name).join(', ')}(${h.mostWinsDrivers[0].wins}승)입니다.`);
  if (h.mostWinsTeams.length) p.push(`최다 우승 팀은 ${h.mostWinsTeams.map((t) => t.team).join(', ')}(${h.mostWinsTeams[0].wins}승)입니다.`);
  const winners = h.recentWinners.map((w) => `<li>${w.season}년 ${esc(w.name)} (${esc(w.team)}, ${w.grid}번 그리드 출발)</li>`).join('');
  const lr = g.lastRace;
  if (lr) {
    const podium = lr.podium.map((d) => `${d.position}위 ${d.name}(${d.team})`).join(', ');
    p.push(`${lr.season}년 대회 포디움은 ${podium}였습니다. ${lr.starters}대가 출발해 ${lr.retired}대가 완주하지 못했고` +
      `${lr.safetyCars != null ? `, 세이프티카는 ${lr.safetyCars}번, 버추얼 세이프티카는 ${lr.virtualSafetyCars}번 나왔습니다` : ''}.`);
  }
  const tr = g.track;
  if (tr) {
    p.push(`${tr.year}년 ${tr.driver.name}의 폴 랩 기준으로 한 바퀴 ${(tr.length / 1000).toFixed(3)}km에 코너 ${tr.corners.length}개, ` +
      `최고 속도는 ${Math.round(tr.topSpeed)}km/h${tr.fullThrottle != null ? `, 풀 스로틀 구간은 랩의 ${Math.round(tr.fullThrottle * 100)}%` : ''}` +
      `, 강한 브레이킹 구간은 ${tr.heavyBraking}곳입니다.`);
  }
  return {
    title: `${heading} 가이드`,
    description: `${heading} 한국 시간 일정, 서킷 역대 우승자와 기록, 지난 대회 결과.`,
    body: `<h1>${esc(heading)} 가이드</h1>${p.map((s) => `<p>${esc(s)}</p>`).join('')}
      ${winners ? `<h2>최근 우승자</h2><ul>${winners}</ul>` : ''}`,
  };
}

// Plain links under every body, so a crawler that reads no JavaScript still finds the other pages
const LINKS = `<nav><ul>${[
  ['/', '홈'], ['/schedule', '일정'], ['/drivers', '드라이버 순위'], ['/constructors', '컨스트럭터 순위'],
  ['/results', '레이스 결과'], ['/docs', 'FiA 문서'], ['/about', '소개'], ['/privacy', '개인정보처리방침'],
].map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('')}</ul></nav>`;

async function bodyFor(pathname: string, event?: string): Promise<Body | null> {
  const year = new Date().getUTCFullYear();
  const guide = pathname.match(/^\/next\/(\d{1,2})$/);
  if (guide) return guideBody(year, Number(guide[1]));
  switch (pathname) {
    case '/': return homeBody();
    case '/docs': return docsBody(event);
    case '/schedule': return scheduleBody(year);
    case '/drivers': return driversBody(year);
    case '/constructors': return constructorsBody(year);
    default: return null;
  }
}

const NEXT_RACE: [string, string] = ['다음 경기 가이드', '다음 그랑프리의 한국 시간 일정, 챔피언십 현황, 확정된 페널티와 서킷 역대 기록.'];
// The guide's pages exist only while it is switched on
const pageFor = (pathname: string) =>
  PAGES[pathname] ?? (nextRaceEnabled() && /^\/next(\/\d{1,2})?$/.test(pathname) ? NEXT_RACE : undefined);

/** event: the ?event= of /docs, which opens a past event's documents */
export async function renderPage(template: string, pathname: string, site: string, event?: string) {
  const page = pageFor(pathname);
  if (!page) return template;
  let [title, description] = page;
  let html = template;
  // A data source being down costs only the crawler's text, never the page
  const content = await bodyFor(pathname, event).catch((err) => {
    console.error(`[pageMeta] ${pathname}:`, err.message);
    return null;
  });
  if (content) {
    title = content.title ?? title;
    description = content.description ?? description;
    html = html.replace('<div id="root"></div>', () => `<div id="root"><div class="page-container">${content.body}${LINKS}</div></div>`);
  }
  const fullTitle = `${title} · ${SITE}`;
  const url = `${site}${content?.canonical ?? pathname}`;
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(fullTitle)}</title>`);
  html = setAttr(html, /<meta name="description"[^>]*>/, description);
  html = setAttr(html, /<meta property="og:title"[^>]*>/, fullTitle);
  html = setAttr(html, /<meta property="og:description"[^>]*>/, description);
  html = setAttr(html, /<meta property="og:url"[^>]*>/, url);
  html = setAttr(html, /<meta property="og:image"[^>]*>/, `${site}/brand/onthelimit-profile-ko-1080.png`);
  html = setAttr(html, /<link rel="canonical"[^>]*>/, url);
  return html;
}

/** sitemap.xml: the fixed pages, each past event's FiA documents, and each guide that has been built while the guide is on. */
export async function sitemap(site: string) {
  const year = new Date().getUTCFullYear();
  const guides = nextRaceEnabled()
    ? (await openGuides(year).catch(() => [])).map((r) => `/next/${r.round}`)
    : [];
  const pastEvents = getFiaDocuments().events.slice(0, -1).map(eventPath); // the latest is /docs itself
  const urls = [...SITEMAP_PATHS, ...pastEvents, ...guides].map((p) => `<url><loc>${esc(site + p)}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}
