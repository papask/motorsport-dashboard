import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import PageMasthead from '../components/PageMasthead';
import {
  draftNewsPost, getAdminStatus, loginAdmin, logoutAdmin, postThreadsNews, previewThreadsPosts, setAdminSwitch, type NewsItem,
} from '../services/api';

// Operator-only page, not in the nav. Korean only, so no messages.ts entries.
// ADMIN_TOKEN is typed once to sign in; the server answers with an HttpOnly
// session cookie (30 days), so the page never keeps the token and a return
// visit skips the login form.

type Status = Awaited<ReturnType<typeof getAdminStatus>>;
type SwitchPath = 'threads' | 'next-race' | 'news';
const SWITCHES: { label: string; hint: string; path: SwitchPath; key: string; get: (s: Status) => boolean }[] = [
  { label: 'Threads 자동 게시', hint: 'FiA 문서 요약과 세션 결과를 Threads에 올려요', path: 'threads', key: 'enabled', get: (s) => s.threads.enabled },
  { label: '다음 경기 가이드', hint: '가이드 페이지를 열고 데이터를 모아요', path: 'next-race', key: 'enabled', get: (s) => s.nextRace.enabled },
  { label: '캘린더 구독', hint: '시즌 일정 구독 링크를 보여줘요', path: 'next-race', key: 'calendar', get: (s) => s.nextRace.calendar },
  { label: '가이드 Threads 게시', hint: '가이드가 준비되면 Threads에 올려요', path: 'next-race', key: 'threads', get: (s) => s.nextRace.threads },
  { label: '뉴스 자동 수집', hint: '등록한 사이트를 30분마다 확인해 목록에 올려요. 초안은 버튼을 눌렀을 때만 만들어요', path: 'news', key: 'enabled', get: (s) => s.news.enabled },
];

// Suggested in the add box. Sites that advertise their feed can also be added by their own address.
const KNOWN_FEEDS: [url: string, label: string][] = [
  ['https://www.formula1.com/en/latest/all.xml', 'Formula1.com (공식)'],
  ['https://www.the-race.com/rss/', 'The Race'],
  ['https://www.racefans.net/feed/', 'RaceFans'],
  ['https://www.autosport.com/rss/f1/news/', 'Autosport'],
  ['https://feeds.bbci.co.uk/sport/formula1/rss.xml', 'BBC Sport'],
  ['https://www.skysports.com/rss/12433', 'Sky Sports F1'],
  ['https://www.espn.com/espn/rss/f1/news', 'ESPN F1'],
  ['https://www.planetf1.com/rss', 'PlanetF1'],
  ['https://www.crash.net/rss/f1', 'Crash.net'],
  ['https://www.gpfans.com/en/rss.xml', 'GPFans'],
  ['https://www.theguardian.com/sport/formulaone/rss', 'The Guardian'],
  ['https://www.motorsportweek.com/feed/', 'Motorsport Week'],
  ['https://www.grandprix.com/rss.xml', 'GrandPrix.com'],
  ['https://www.speedcafe.com/category/f1/feed/', 'Speedcafe'],
  ['https://www.racecar-engineering.com/feed/', 'Racecar Engineering (기술)'],
];
const host = (u: string) => { try { return new URL(u).host.replace(/^(www|feeds)\./, ''); } catch { return u; } };

const NEWS_ROWS_SHOWN = 10;

// "9/29(화) 14:05" in the browser's own time zone
const timeParts = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const localTime = (iso: string) => {
  const p = Object.fromEntries(timeParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day}(${p.weekday}) ${p.hour}:${p.minute}`;
};
/** When the outlet published it; feeds without dates (formula1.com) show when it was collected instead. */
const newsTime = (i: NewsItem) => (i.published ? localTime(i.published) : `${localTime(i.found)} 수집`);

const NEWS_STATUS: Record<NewsItem['status'], string> = {
  new: '초안 대기', ready: '초안 준비됨', failed: '초안 실패', posted: '게시함',
};

/** On sign-in: leaves this browser out of the site stats unless the owner switched that off. Returns whether it is out. */
function ownerNoTrack() {
  try {
    if (!localStorage.getItem('no-track-off')) localStorage.setItem('no-track', '1');
    return !!localStorage.getItem('no-track');
  } catch {
    return false; // storage blocked: nothing to set, and index.html tracks as usual
  }
}

const errorText = (err: unknown) =>
  (isAxiosError(err) && err.response?.data?.error) || (err instanceof Error ? err.message : String(err));

export default function Admin() {
  const [token, setToken] = useState(''); // the login field only; cleared once signed in
  // undefined: still asking whether the session cookie is valid; null: signed out
  const [status, setStatus] = useState<Status | null | undefined>(undefined);
  useEffect(() => {
    try { sessionStorage.removeItem('adminToken'); } catch { /* where the old version kept the token */ }
    getAdminStatus().then((s) => { setNoTrack(ownerNoTrack()); setStatus(s); }, () => setStatus(null));
  }, []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState<string[]>([]);
  // The article the server couldn't read, waiting for its text to be pasted in
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [feedInput, setFeedInput] = useState('');
  // The same browser-only flag as ?notrack=1, read by index.html on each page
  // load. Only the owner can sign in here, so a signed-in browser is left out
  // of GA and Clarity by default; switching it off is remembered (no-track-off)
  // so the next sign-in doesn't switch it back on.
  const [noTrack, setNoTrack] = useState(() => { try { return !!localStorage.getItem('no-track'); } catch { return false; } });
  const flipNoTrack = (value: boolean) => {
    try {
      if (value) {
        localStorage.setItem('no-track', '1');
        localStorage.removeItem('no-track-off');
      } else {
        localStorage.removeItem('no-track');
        localStorage.setItem('no-track-off', '1');
      }
      setNoTrack(value);
    } catch {
      setMessage('이 브라우저는 저장소가 막혀 있어 설정할 수 없어요.');
    }
  };
  // A flagged sentence stops blocking once it has been rewritten in the box
  const stillCopied = copied.filter((s) => text.includes(s));
  // The server splits the text the way posting will, a moment after typing stops
  const [posts, setPosts] = useState<string[]>([]);
  const loggedIn = Boolean(status);
  useEffect(() => {
    if (!loggedIn || !text.trim()) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      previewThreadsPosts(text, ctrl.signal).then(setPosts).catch(() => { /* aborted or offline: keep the last preview */ });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [text, loggedIn]);
  const shownPosts = text.trim() ? posts : [];

  // The news list scrolls inside itself, cut where its 11th row starts. Rows
  // differ in height (Korean title, merged sources), so it's measured, and
  // measured again when the width rewraps them.
  const newsList = useRef<HTMLUListElement>(null);
  const newsItems = status?.news.items;
  useEffect(() => {
    const ul = newsList.current;
    if (!ul) return;
    const fit = () => {
      const cut = ul.children[NEWS_ROWS_SHOWN] as HTMLElement | undefined;
      ul.style.maxHeight = cut
        ? `${cut.getBoundingClientRect().top - ul.getBoundingClientRect().top + ul.scrollTop}px`
        : '';
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(ul);
    return () => observer.disconnect();
  }, [newsItems]);

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try { await job(); } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) setStatus(null);
      setMessage(errorText(err));
    } finally { setBusy(false); }
  };

  const login = () => run(async () => {
    await loginAdmin(token);
    setToken('');
    setNoTrack(ownerNoTrack());
    setStatus(await getAdminStatus());
  });

  const logout = () => run(async () => {
    await logoutAdmin();
    setStatus(null);
  });

  const flip = (path: SwitchPath, key: string, value: boolean) => run(async () => {
    await setAdminSwitch(path, { [key]: value });
    setStatus(await getAdminStatus());
  });

  const load = (articleUrl: string, d: { text: string; copied: string[] }) => {
    setUrl(articleUrl);
    setText(d.text);
    setCopied(d.copied);
  };

  const draft = (articleUrl = url, articleText?: string) => run(async () => {
    try {
      load(articleUrl, await draftNewsPost(articleUrl, articleText));
    } catch (err) {
      // Unreadable page: ask for the article pasted from the admin's own browser
      if (isAxiosError(err) && err.response?.data?.needsText) {
        setUrl(articleUrl);
        setPasteFor(articleUrl);
        setPasted('');
      }
      throw err;
    }
    setPasteFor(null);
    setPasted('');
    setStatus(await getAdminStatus());
    setMessage('초안을 만들었어요. 확인하고 고친 뒤 게시하세요.');
  });

  const dismiss = (articleUrl: string) => run(async () => {
    await setAdminSwitch('news', { url: articleUrl, status: 'dismissed' });
    setStatus(await getAdminStatus());
  });

  // Articles still waiting for their first draft: what "draft all" would take on
  const undrafted = status?.news.items.filter((i) => i.status === 'new' && !i.drafting).length ?? 0;
  const draftAll = () => {
    const cost = (n: number) => (n * 0.1).toFixed(1);
    if (!confirm(`초안이 없는 기사 ${undrafted}개의 초안을 만들까요?\n예상 비용 약 $${(undrafted * 0.05).toFixed(1)}~${cost(undrafted)}, 몇 분 걸려요.`)) return;
    run(async () => {
      await setAdminSwitch('news', { draftAll: true });
      setStatus(await getAdminStatus());
    });
  };

  // While drafts are being made in the background, follow them every few seconds
  const drafting = !!status?.news.bulk || !!status?.news.items.some((i) => i.drafting);
  useEffect(() => {
    if (!drafting) return;
    const timer = setInterval(() => { getAdminStatus().then(setStatus, () => { /* next tick tries again */ }); }, 4000);
    return () => clearInterval(timer);
  }, [drafting]);

  const editFeeds = (body: { addFeed: string } | { removeFeed: string } | { muteFeed: string; muted: boolean }) => run(async () => {
    await setAdminSwitch('news', body);
    setStatus(await getAdminStatus());
    if ('addFeed' in body) {
      setFeedInput('');
      setMessage('추가했어요. 지금 올라와 있는 기사 중 최근 3개만 새 뉴스로 가져와요.');
    }
  });

  const post = () => {
    if (!confirm('Threads에 게시할까요? 게시 후에는 Threads 앱에서만 지울 수 있어요.')) return;
    run(async () => {
      const { posts } = await postThreadsNews(text, url || undefined);
      setText('');
      setUrl('');
      setCopied([]);
      setMessage(`게시했어요 (${posts}개 글)`);
      setStatus(await getAdminStatus());
    });
  };

  return (
    <div className="page-container admin-page">
      <meta name="robots" content="noindex" />
      <PageMasthead title="관리자" subtitle="기능 스위치와 Threads 게시" />

      {status === undefined ? null : !status ? (
        <form className="card admin-card" onSubmit={(e) => { e.preventDefault(); login(); }} style={{ display: 'flex', gap: 8 }}>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN" aria-label="관리자 토큰" autoComplete="current-password" className="admin-input" style={{ flex: 1 }} />
          <button className="btn-primary" disabled={busy || !token}>로그인</button>
        </form>
      ) : (
        <>
          <div className="admin-session">
            <span>로그인됨 · 30일 동안 유지돼요</span>
            <button className="btn-secondary" disabled={busy} onClick={logout}>로그아웃</button>
          </div>
          <section className="card admin-card">
            <h2 className="card-title">기능 스위치</h2>
            {SWITCHES.map((s) => (
              <label key={s.label} className="admin-switch-row">
                <span>
                  <span className="admin-switch-label">{s.label}</span>
                  <span className="admin-switch-hint">{s.hint}</span>
                </span>
                {/* the site's shared switch: a visually hidden checkbox drives the track */}
                <input type="checkbox" role="switch" className="switch-input" checked={s.get(status)} disabled={busy}
                  onChange={(e) => flip(s.path, s.key, e.target.checked)} />
                <span className="switch" aria-hidden="true" />
              </label>
            ))}
            <label className="admin-switch-row">
              <span>
                <span className="admin-switch-label">이 브라우저 방문 통계 제외</span>
                <span className="admin-switch-hint">
                  로그인한 브라우저는 기본으로 GA·Clarity에서 빠져요. 끄면 기억해서 다시 켜지 않아요. 이 브라우저에만 적용되고 다음 페이지를 열 때부터 반영돼요
                </span>
              </span>
              <input type="checkbox" role="switch" className="switch-input" checked={noTrack}
                onChange={(e) => flipNoTrack(e.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>
          </section>

          <section className="card admin-card">
            <h2 className="card-title">뉴스 → Threads 게시</h2>
            {/* Closed by default: the site list is set once and rarely touched */}
            <details className="admin-feeds">
              <summary>
                뉴스 사이트 {status.news.feeds.length}곳
                {status.news.muted.length > 0 && ` · 무시 중 ${status.news.muted.length}곳`}
              </summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
                {status.news.feeds.map((feed) => {
                  const isMuted = status.news.muted.includes(feed);
                  return (
                  <li key={feed} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                    <span style={{ flex: 1, overflowWrap: 'anywhere', color: isMuted ? 'var(--text-muted)' : undefined }}>
                      <strong>{KNOWN_FEEDS.find(([u]) => u === feed)?.[1] ?? host(feed)}</strong>
                      {isMuted && ' (무시 중)'} <small>{feed}</small>
                    </span>
                    {/* Muted: stays listed, isn't read; unmuting reads it like a new site (newest few only) */}
                    <button className="btn-secondary" disabled={busy} aria-pressed={isMuted}
                      onClick={() => editFeeds({ muteFeed: feed, muted: !isMuted })}>{isMuted ? '무시 해제' : '무시하기'}</button>
                    <button className="btn-secondary" disabled={busy}
                      onClick={() => confirm(`${host(feed)}를 목록에서 뺄까요?`) && editFeeds({ removeFeed: feed })}>빼기</button>
                  </li>
                  );
                })}
              </ul>
              <form onSubmit={(e) => { e.preventDefault(); editFeeds({ addFeed: feedInput.trim() }); }} style={{ display: 'flex', gap: 8 }}>
                <input type="url" list="known-feeds" value={feedInput} onChange={(e) => setFeedInput(e.target.value)}
                  placeholder="사이트 주소나 RSS 주소" aria-label="추가할 뉴스 사이트" className="admin-input" style={{ flex: 1 }} />
                <datalist id="known-feeds">
                  {KNOWN_FEEDS.filter(([u]) => !status.news.feeds.includes(u)).map(([u, label]) => <option key={u} value={u}>{label}</option>)}
                </datalist>
                <button className="btn-secondary" disabled={busy || !feedInput.trim()}>추가</button>
              </form>
            </details>
            {/* News on the left, the post being written on the right; stacked on a phone */}
            <div className="admin-news-grid">
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <h3 className="admin-panel-title">새 뉴스 <small>최근 2일</small></h3>
                  <button className="btn-secondary" disabled={busy || !!status.news.bulk || !undrafted} onClick={draftAll}>
                    {status.news.bulk
                      ? `초안 만드는 중 ${status.news.bulk.done}/${status.news.bulk.total}`
                      : `전체 초안 만들기${undrafted ? ` (${undrafted})` : ''}`}
                  </button>
                </div>
                {!status.news.items.length && <p>{status.news.enabled ? '아직 수집한 뉴스가 없어요.' : '뉴스 자동 수집이 꺼져 있어요.'}</p>}
                <ul className="admin-news-list" ref={newsList}>
                  {status.news.items.map((item) => (
                    <li key={item.url} className="admin-news-row">
                      {/* English feed title, then the Korean one: a draft's first line is its headline */}
                      <a href={item.url} target="_blank" rel="noreferrer" className="admin-news-title">
                        {item.title}
                        {item.draft && <strong>{item.draft.text.split('\n')[0]}</strong>}
                      </a>
                      {/* Source, status and buttons stay together; on a phone they drop under the title as one line */}
                      <div className="admin-news-actions">
                        <span className="admin-news-meta" title={item.error}>
                          {host(item.url)} · <time dateTime={item.published ?? item.found}>{newsTime(item)}</time>
                          {' · '}{item.drafting ? '초안 만드는 중…' : NEWS_STATUS[item.status]}
                        </span>
                        {item.draft && item.status !== 'posted' && !item.drafting && (
                          <button className="btn-secondary" disabled={busy} onClick={() => load(item.url, item.draft!)}>불러오기</button>
                        )}
                        {!item.draft && item.status !== 'posted' && !item.drafting && (
                          <button className="btn-secondary" disabled={busy} onClick={() => draft(item.url)}>초안 만들기</button>
                        )}
                        <button className="btn-secondary" disabled={busy} onClick={() => dismiss(item.url)}>숨기기</button>
                      </div>
                      {/* Merged repeats of this story from other outlets; the draft comes from the first */}
                      {item.also && (
                        <small className="admin-news-also">
                          같은 소식 {item.also.length}곳 더:{' '}
                          {item.also.map((a, i) => (
                            <span key={a.url}>{i > 0 && ' · '}<a href={a.url} target="_blank" rel="noreferrer" title={a.title}>{host(a.url)}</a></span>
                          ))}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="admin-panel admin-compose">
                <h3 className="admin-panel-title">게시할 글</h3>
                {!status.threads.hasToken && <p>THREADS_ACCESS_TOKEN이 설정되지 않아 게시할 수 없어요.</p>}
                <p>뉴스 링크를 넣으면 AI가 기사를 읽고 원문 표현 없이 요약한 초안을 채워요. 500자가 넘으면 문장 사이에서 나뉘어 답글로 이어지고, 나뉘는 모습은 아래에 미리 보여요. 자동 게시 스위치와 상관없이 올라가요.</p>
                <form onSubmit={(e) => { e.preventDefault(); draft(); }} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://뉴스 기사 주소"
                    aria-label="뉴스 기사 주소" className="admin-input" style={{ flex: 1 }} />
                  <button className="btn-secondary" disabled={busy || !url.trim()}>{busy ? '처리 중…' : '요약 초안'}</button>
                </form>
                {pasteFor && (
                  <form className="admin-paste" onSubmit={(e) => { e.preventDefault(); draft(pasteFor, pasted); }}>
                    <p>
                      이 기사는 자동으로 읽지 못했어요. <a href={pasteFor} target="_blank" rel="noreferrer">기사를 브라우저에서 열어</a>{' '}
                      본문을 복사해 붙여 넣으면 그 내용으로 초안을 만들어요.
                    </p>
                    <textarea className="admin-textarea" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6}
                      maxLength={60000} aria-label="기사 본문 붙여넣기" placeholder="기사 본문을 여기에 붙여 넣으세요" />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPasteFor(null)}>닫기</button>
                      <button className="btn-secondary" disabled={busy || pasted.trim().length < 200}>
                        {busy ? '처리 중…' : '붙여 넣은 본문으로 초안 만들기'}
                      </button>
                    </div>
                  </form>
                )}
                {stillCopied.length > 0 && (
                  <div role="alert">
                    <p>원문과 겹치는 표현이 있어요. 아래 문장을 고쳐야 게시할 수 있어요.</p>
                    <ul>{stillCopied.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                )}
                <textarea className="admin-textarea" value={text} onChange={(e) => setText(e.target.value)} rows={12}
                  maxLength={5000} aria-label="게시할 내용" placeholder="요약 초안이 여기에 채워져요" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  {/* One Threads post holds 500 chars; past that the rest goes out as replies */}
                  <span className={`admin-count ${shownPosts.length > 1 ? 'over' : ''}`}>
                    {text.trim().length}자{shownPosts.length > 1 && ` · 글 ${shownPosts.length}개 (본문 + 답글 ${shownPosts.length - 1}개)`}
                  </span>
                  <button className="btn-primary" onClick={post}
                    disabled={busy || !text.trim() || !status.threads.hasToken || stillCopied.length > 0}>
                    {busy ? '처리 중…' : '게시'}
                  </button>
                </div>
                {shownPosts.length > 1 && (
                  <ol className="admin-posts" aria-label="Threads에 올라갈 글">
                    {shownPosts.map((p, i) => (
                      <li key={i}>
                        <div className="admin-post-label">{i ? `답글 ${i}` : '본문'} · {p.length}자</div>
                        {p}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </section>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
