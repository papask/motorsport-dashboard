import { getFiaDocuments } from './services/fiaService';

// Link-preview crawlers (KakaoTalk, Threads, X) don't run JavaScript, so each
// page's title, description and og:* are written into index.html here. /docs
// also gets its summaries as plain HTML inside #root, so crawlers see the text;
// React replaces it on mount.

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
  '/docs': ['FiA 문서 한국어 요약', 'FiA 스튜어드 결정, 레이스 디렉터 노트 등 F1 공식 문서를 한국어로 요약.'],
  '/privacy': ['개인정보처리방침', `${SITE} 개인정보처리방침.`],
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const setAttr = (html: string, tag: RegExp, value: string) =>
  html.replace(tag, (m) => m.replace(/(content|href)="[^"]*"/, (_, attr) => `${attr}="${esc(value)}"`));

/** The latest event's summaries, marked up with the page's own classes. */
function docsBody() {
  const { event, documents } = getFiaDocuments();
  const summarized = documents.filter((d) => d.summary);
  if (!event || !summarized.length) return null;
  const items = summarized.map((d) => `
    <article class="card"><h3>${esc(d.summary!.title_ko)}</h3>
    <ul>${d.summary!.summary_ko.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <a href="${esc(d.url)}">원문 PDF</a></article>`).join('');
  return {
    title: `${event} FiA 문서 한국어 요약`,
    description: `${event} 스튜어드 결정, 페널티, 레이스 디렉터 노트 등 FiA 문서 ${summarized.length}건을 한국어로 요약.`,
    body: `<div class="page-container"><h1>${esc(event)} FiA 문서</h1>${items}</div>`,
  };
}

export function renderPage(template: string, pathname: string, site: string) {
  const page = PAGES[pathname];
  if (!page) return template;
  let [title, description] = page;
  let html = template;
  if (pathname === '/docs') {
    const docs = docsBody();
    if (docs) {
      ({ title, description } = docs);
      html = html.replace('<div id="root"></div>', () => `<div id="root">${docs.body}</div>`);
    }
  }
  const fullTitle = `${title} · ${SITE}`;
  const url = `${site}${pathname}`;
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(fullTitle)}</title>`);
  html = setAttr(html, /<meta name="description"[^>]*>/, description);
  html = setAttr(html, /<meta property="og:title"[^>]*>/, fullTitle);
  html = setAttr(html, /<meta property="og:description"[^>]*>/, description);
  html = setAttr(html, /<meta property="og:url"[^>]*>/, url);
  html = setAttr(html, /<meta property="og:image"[^>]*>/, `${site}/brand/onthelimit-profile-ko-1080.png`);
  html = setAttr(html, /<link rel="canonical"[^>]*>/, url);
  return html;
}
