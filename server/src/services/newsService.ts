import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getSeasonSchedule } from './jolpicaService';
import { guideRace, type ScheduleRace } from './guideRules';
import { nextRaceEnabled } from './nextRaceSettings';
import { readGuide } from './guideBuilder';
import { gpNameKo } from './threadsService';

// Drafts a Threads post from a news article: Claude reads the page with its
// web fetch tool (the article fetch runs on Anthropic's side, not from this
// server) and writes a Korean summary in its own
// words. The admin page shows the draft for review; nothing is posted here.
//
// While switched on it also watches the RSS feeds the admin page lists and
// drafts each new article ahead, so the page opens on drafts ready to review.

// A new environment starts with these; the admin page adds and removes from there.
// List order matters: when outlets report the same story, the earliest feed's article leads it.
const DEFAULT_FEEDS = [
  'https://www.formula1.com/en/latest/all.xml',
  'https://www.the-race.com/rss/',
  'https://www.racefans.net/feed/',
  // not motorsport.com: its pages refuse the web fetch, so every draft fails
  'https://www.autosport.com/rss/f1/news/',
  'https://feeds.bbci.co.uk/sport/formula1/rss.xml',
  'https://www.skysports.com/rss/12433',
  'https://www.theguardian.com/sport/formulaone/rss',
  'https://www.espn.com/espn/rss/f1/news',
  'https://www.motorsportweek.com/feed/',
  'https://www.grandprix.com/rss.xml',
  'https://www.speedcafe.com/category/f1/feed/',
  'https://www.planetf1.com/rss',
  'https://www.crash.net/rss/f1',
  'https://www.gpfans.com/en/rss.xml',
  'https://www.racecar-engineering.com/feed/',
];
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
// The admin list shows articles collected within this; older ones drop off (and are still remembered as seen)
const LIST_MS = 2 * 24 * 60 * 60 * 1000;
// "Draft all" works through this many articles at a time
const BULK_PARALLEL = 3;
// The first time a feed is read, only its newest few articles count as new;
// the rest are marked seen, so a new feed (or a new deploy) doesn't flood the list
const NEW_FEED_BACKLOG = 3;
// Some feeds keep year-old articles; anything published before this is never new
const MAX_ARTICLE_AGE_MS = 2 * 24 * 60 * 60 * 1000;
// Betting guides and odds pieces aren't news for this site (and their pages are often region-locked).
// Not a bare "odds": "against the odds" is an ordinary headline.
const NOT_NEWS = /betting|bookmaker|gambling/i;
// Remembered articles are forgotten after this, long after they leave the
// age window (and undated feeds like formula1.com list only their latest 10)
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (onthelimit news watcher)';

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');

// How many sentences a summary may have grows with the article: a short news
// item summed up in five would stand in for it, a long feature would not.
// [up to this many article words, sentences]; past the last row, SENTENCE_STEPS' top.
const SENTENCE_STEPS: [maxWords: number, sentences: number][] = [[400, 3], [1000, 4]];
const MAX_SUMMARY_SENTENCES = 5;
const MAX_SENTENCE_CHARS = 80; // so the sentence cap can't be dodged by packing points into one

/** The sentence cap for an article of `words` words. */
export const sentenceCap = (words: number) =>
  SENTENCE_STEPS.find(([maxWords]) => words <= maxWords)?.[1] ?? MAX_SUMMARY_SENTENCES;

/** The cap for a draft: by the model's count of the article body, never above the text it actually read. */
export const summaryCap = (articleWords: number, source: string) =>
  sentenceCap(Math.min(articleWords || Infinity, source.split(/\s+/).filter(Boolean).length));

const SCHEMA = {
  type: 'object',
  properties: {
    title_ko: { type: 'string', description: 'A short Korean headline in your own words' },
    article_words: {
      type: 'integer',
      description: 'Roughly how many words the article body itself has, leaving out menus, ads, captions and related-story links',
    },
    summary_ko: {
      type: 'array',
      items: { type: 'string' },
      description: `Short Korean sentences, as many as the article's length allows (at most ${MAX_SUMMARY_SENTENCES})`,
    },
    is_rumor: {
      type: 'boolean',
      description:
        'True when the article\'s main news is not confirmed: paddock rumours, speculation, transfer or seat ' +
        'links ("linked with", "set to", "in talks"), or reports resting on unnamed sources. False when it is ' +
        'officially announced, on the record from the people involved, or already happened.',
    },
  },
  required: ['title_ko', 'article_words', 'summary_ko', 'is_rumor'],
  additionalProperties: false,
};

// The copyright rules below keep a summary a pointer to the article, not a
// stand-in for it: short, reordered, the outlet named, its own angles and
// interviews credited or left for the reader to find there.
const SYSTEM =
  'You summarize Formula 1 news articles for Korean F1 fans. Fetch the URL you are given (unless ' +
  'its text is attached) and summarize the article in natural Korean. Write every sentence in your own words: never copy ' +
  'or translate the article\'s sentences one-to-one, and use no direct quotes - report what people ' +
  'said in indirect speech. Keep facts, names, numbers and dates exact, add nothing that is not in ' +
  'the article, and use standard Korean F1 terms.\n\n' +
  'The summary points readers to the article; it must not replace it. So:\n' +
  '- Size the summary to the article body: ' +
  SENTENCE_STEPS.map(([words, n]) => `up to ${words} words, ${n} sentences at most; `).join('') +
  `longer, ${MAX_SUMMARY_SENTENCES} at most. Carry no more than about a quarter of the article's points - ` +
  'the core news first. Leave the rest of the detail for readers to find in the article; if the summary ' +
  'would spare them reading it, it is too long.\n' +
  `- Keep every sentence short, about ${MAX_SENTENCE_CHARS} Korean characters or fewer, with one point each. ` +
  'Joining several points into one long sentence breaks the limit above.\n' +
  '- Do not follow the article\'s order or paragraph structure. Lead with the core news and arrange the ' +
  'rest your own way.\n' +
  '- Name the outlet in the first sentence (e.g. "GPFans 보도에 따르면", "BBC에 따르면").\n' +
  '- The writer\'s own angles, judgements, framings and jokes are not facts: leave them out, or credit ' +
  'them to the outlet ("GPFans는 ~라고 짚었다").\n' +
  '- For an interview or a long quote, keep only its gist in one short clause with the speaker ' +
  '("맥라렌은 금요일 연습이 특히 중요하다고 봤다"), never the whole of what was said.\n\n' +
  'For a rumour, word the summary as unconfirmed ' +
  '(e.g. ~로 알려졌다, ~라는 보도가 나왔다), never as fact; the [루머] tag is added for you, so leave it ' +
  'out of title_ko. If the page cannot be fetched or is not a news article, say so in title_ko and ' +
  'leave summary_ko empty.';

/** The headline, tagged [루머] when the article is a rumour (once, whatever the model wrote). */
export const newsHeadline = (title: string, rumor: boolean) => {
  const bare = title.replace(/^\s*\[루머\]\s*/, '');
  return rumor ? `[루머] ${bare}` : bare;
};

// Any run this long shared with the article counts as copied. Whitespace is
// dropped first, so the check works for Korean and English sources alike.
const COPY_RUN = 20;
const squash = (s: string) => s.replace(/\s+/g, '');

/** Summary sentences sharing a COPY_RUN-char run with the source. */
export function copiedSentences(sentences: string[], source: string) {
  const src = squash(source);
  return sentences.filter((s) => {
    const t = squash(s);
    for (let i = 0; i + COPY_RUN <= t.length; i++) if (src.includes(t.slice(i, i + COPY_RUN))) return true;
    return false;
  });
}

/** Title, bullets, source link and the AI notice, one line each, blank lines between blocks. */
// The AI notice rides on the source line: one line fewer than a sentence of its own
export const newsPostText = (url: string, title: string, summary: string[], guide?: string) =>
  [title, summary.map((s) => `• ${s}`).join('\n'), `🔗 원문(AI 요약) ${url}${guide ? `\n\n${guide}` : ''}`]
    .join('\n\n');

/**
 * "바레인 그랑프리 (말레이시아) 가이드 페이지" and its address, for the line
 * under the source link: only while the guide is switched on and the coming
 * race's guide has been built (its page is open). Checked when drafting.
 */
export async function guideLink(now = Date.now()) {
  try {
    if (!nextRaceEnabled()) return undefined;
    const year = new Date(now).getUTCFullYear();
    const race = guideRace((await getSeasonSchedule(year)).races as ScheduleRace[], now);
    if (!race || !readGuide(year, race.round)) return undefined;
    // Posts are public, so the link is the live site's even from a local server
    const site = process.env.SITE_URL || 'https://www.onthelimit.app';
    return `${gpNameKo(race.raceName)} 가이드 페이지\n${site}/next/${race.round}`;
  } catch (err: any) {
    console.error('[News] guide link skipped:', err.message); // a draft never fails over it
    return undefined;
  }
}

let client: Anthropic | undefined;

/**
 * One summarizing request. Without `pageText` Claude reads the page with its
 * web fetch tool; with it, the text this server fetched goes in as a document.
 * `source` is the article text the summary stood on ('' when the fetch failed).
 */
async function summarize(url: string, pageText?: string) {
  client ??= new Anthropic();
  const host = new URL(url).host; // tells the model which outlet to name
  const messages: Anthropic.Beta.BetaMessageParam[] = [pageText
    ? {
      role: 'user',
      content: [
        { type: 'document', source: { type: 'text', media_type: 'text/plain', data: pageText }, title: url },
        { type: 'text', text: `Summarize this article from ${host} (${url}). Its text is attached; do not fetch it.` },
      ],
    }
    : { role: 'user', content: `Summarize this article from ${host}: ${url}` }];
  let source = pageText ?? '';
  // A server tool can pause a long turn; sending the turn back resumes it
  for (let turn = 0; turn < 3; turn++) {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      ...(pageText ? {} : { tools: [{ type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: 2 }] }),
      system: SYSTEM,
      messages,
    });
    for (const block of response.content) {
      if (block.type === 'web_fetch_tool_result' && block.content.type === 'web_fetch_result') {
        const doc = block.content.content.source;
        if (doc.type === 'text') source += doc.data;
      }
    }
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    if (response.stop_reason !== 'end_turn') throw new Error(`stop_reason ${response.stop_reason}`);
    const text = response.content.filter((b) => b.type === 'text').at(-1);
    const { title_ko, article_words, summary_ko, is_rumor } = JSON.parse(text?.type === 'text' ? text.text : '');
    return {
      title_ko: title_ko as string,
      articleWords: Number(article_words) || 0,
      summary_ko: summary_ko as string[],
      is_rumor: is_rumor === true,
      source,
    };
  }
  throw new Error('web fetch did not finish');
}

/**
 * A draft from the article. When Claude can't read the page (a site's bot
 * wall, a region lock), a `direct` draft - one the admin asked for - has this
 * server fetch the page and hands its text over, unless the site's robots.txt
 * refuses Anthropic's agents: that is the publisher saying no to AI use, and
 * it isn't worked around. The watcher's drafts don't take the second route.
 */
export async function draftNewsPost(url: string, { direct = false, pastedText = '' } = {}) {
  let result;
  if (pastedText) {
    // The admin copied the article from their own browser; the publisher's AI opt-out still stands
    await assertAiAllowed(url);
    result = await summarize(url, pastedText.slice(0, MAX_ARTICLE_CHARS));
  } else {
    result = await summarize(url);
    // Without the page text the copy check has nothing to compare, and the summary nothing to stand on
    if (!result.summary_ko.length || !result.source) {
      if (!direct) throw new Error(result.summary_ko.length ? 'could not read the article text' : result.title_ko);
      result = await summarize(url, (await fetchArticleText(url)).slice(0, MAX_ARTICLE_CHARS));
    }
  }
  if (!result.summary_ko.length) throw new Error(result.title_ko);
  // The length rule holds even if the model runs over. Its word count leaves page
  // clutter out; the text it read bounds that, so a high guess can't lift the cap.
  const summary = result.summary_ko.slice(0, summaryCap(result.articleWords, result.source));
  return {
    text: newsPostText(url, newsHeadline(result.title_ko, result.is_rumor), summary, await guideLink()),
    // The admin page flags these for a rewrite before posting
    copied: copiedSentences([result.title_ko, ...summary], result.source),
  };
}

// ── Reading a page ourselves, when the publisher allows AI use ──

const ANTHROPIC_AGENTS = ['claude-user', 'claudebot', 'anthropic-ai'];

/** Whether robots.txt lets Anthropic's agents (or, with no group of their own, all bots) read `path`. */
export function robotsAllows(robots: string, path: string) {
  const groups: { agents: string[]; rules: [allow: boolean, pattern: string][] }[] = [];
  let inAgentLines = false;
  for (const raw of robots.split(/\r?\n/)) {
    const m = raw.replace(/#.*/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'user-agent') {
      if (!inAgentLines) groups.push({ agents: [], rules: [] });
      groups.at(-1)!.agents.push(m[2].toLowerCase());
      inAgentLines = true;
    } else {
      inAgentLines = false;
      if ((key === 'allow' || key === 'disallow') && groups.length) groups.at(-1)!.rules.push([key === 'allow', m[2]]);
    }
  }
  const ours = groups.filter((g) => g.agents.some((a) => ANTHROPIC_AGENTS.includes(a)));
  // Any one of Anthropic's agents turned away counts as a no
  return (ours.length ? ours : groups.filter((g) => g.agents.includes('*'))).every((g) => {
    // The longest matching pattern decides; Allow wins a tie; an empty Disallow allows everything
    let longest = -1;
    let allowed = true;
    for (const [allow, pattern] of g.rules) {
      if (!pattern) continue;
      const re = new RegExp(`^${pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`);
      if (re.test(path) && (pattern.length > longest || (pattern.length === longest && allow))) {
        longest = pattern.length;
        allowed = allow;
      }
    }
    return allowed;
  });
}

/**
 * An article page's text: the articleBody its JSON-LD metadata carries (many
 * news sites include it), else the paragraphs of its <article> or page.
 */
export function articleText(html: string) {
  for (const [, json] of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(json);
      const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data['@graph'] ?? [])];
      const body = nodes.map((n) => (typeof n?.articleBody === 'string' ? n.articleBody : '')).find((b) => b.length > 300);
      if (body) return body.trim();
    } catch {
      // a broken block: try the next, then the paragraphs
    }
  }
  const body = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? html;
  return [...body.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, p]) => decode(p.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' '))
    .filter((p) => p.length > 40) // bylines, captions, buttons
    .join('\n\n');
}

/** Refuses a site whose robots.txt turns Anthropic's agents away from the page: the publisher's no to AI use. */
async function assertAiAllowed(url: string) {
  const { origin, pathname, search, host: site } = new URL(url);
  const robots = await fetchText(`${origin}/robots.txt`).then((r) => r.text, () => '');
  if (!robotsAllows(robots, pathname + search)) {
    throw new Error(`${site}는 robots.txt로 AI 이용을 거부하고 있어 요약하지 않아요. 이 사이트는 빼는 걸 권해요`);
  }
}

/** Marks the failures a pasted article text gets past (the admin page then asks for it). */
const needsText = (message: string) => Object.assign(new Error(message), { needsText: true });

/**
 * The page text, fetched by this server under its own name: a site that
 * serves browsers only is not worked around, it gets a paste-in instead.
 */
async function fetchArticleText(url: string) {
  await assertAiAllowed(url);
  const page = await fetchText(url).catch((err) => { throw needsText(`페이지를 받지 못했어요 (${err.message})`); });
  const text = articleText(page.text);
  if (text.length < 300) throw needsText('페이지에서 기사 본문을 찾지 못했어요 (봇 차단, 유료 기사, 스크립트로 그리는 페이지일 수 있어요)');
  return text;
}

const MAX_ARTICLE_CHARS = 60000; // a long feature is still well inside the model's context

// ── Feed watcher ──

export interface NewsItem {
  url: string;
  title: string;
  found: string; // ISO time the feed first listed it
  published?: string; // ISO time the outlet published it, when its feed says
  status: 'new' | 'ready' | 'failed' | 'posted' | 'dismissed';
  draftedAt?: string;
  draft?: { text: string; copied: string[] };
  error?: string;
  also?: { url: string; title: string }[]; // other outlets' articles on the same story, merged in
}

// Off until switched on, so a new deploy never starts paying for drafts by itself
let enabled = false;
let feeds = DEFAULT_FEEDS;
let seeded: string[] = []; // feeds read at least once
let muted: string[] = []; // feeds kept on the list but not read
let items: NewsItem[] = [];
try {
  ({ enabled = false, feeds = DEFAULT_FEEDS, seeded = [], muted = [], items = [] } = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')));
} catch {
  // first run
}

function save() {
  items = items.filter((i) => Date.now() - Date.parse(i.found) < KEEP_MS);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(NEWS_FILE, JSON.stringify({ enabled, feeds, seeded, muted, items }, null, 2));
}

/** What the admin page lists: newest first, dismissed ones left out. */
export const newsStatus = () => ({
  enabled,
  feeds,
  muted,
  bulk, // {total, done} while "draft all" runs
  items: shownItems().map((i) => (drafting.has(i.url) ? { ...i, drafting: true } : i)),
});

/** The articles the admin page lists: collected within LIST_MS, not dismissed, newest first. */
const shownItems = () => items.filter((i) => i.status !== 'dismissed' && Date.now() - Date.parse(i.found) < LIST_MS);

/** Stops or resumes reading a feed while keeping it listed. */
export function setFeedMuted(feed: string, value: boolean) {
  if (!feeds.includes(feed)) return false;
  muted = value ? [...new Set([...muted, feed])] : muted.filter((f) => f !== feed);
  // Resumed, it reads like a new feed: its newest few only, not everything missed meanwhile
  if (!value) seeded = seeded.filter((f) => f !== feed);
  save();
  if (!value) checkNews();
  return true;
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { text: await res.text(), url: res.url || url };
}

/** The RSS feed a page advertises in <link rel="alternate" type="application/rss+xml">, if any. */
export function feedLink(html: string, base: string) {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (/\brel=["']?alternate/i.test(tag) && /application\/rss\+xml/i.test(tag) && href) {
      return new URL(decode(href), base).href;
    }
  }
}

/**
 * Adds a feed from its RSS address or the site's own address (its advertised
 * feed is found). Admin-typed, so this server fetches it: only http(s), and
 * it must answer with RSS items.
 */
export async function addFeed(input: string) {
  if (!/^https?:\/\//i.test(input)) throw new Error('http(s) 주소만 추가할 수 있어요');
  let page = await fetchText(input);
  let listed = parseFeed(page.text);
  if (!listed.length) {
    const found = feedLink(page.text, page.url);
    if (!found) throw new Error('RSS 피드를 찾지 못했어요. 사이트의 RSS 주소를 직접 넣어 보세요');
    page = await fetchText(found);
    listed = parseFeed(page.text);
    if (!listed.length) throw new Error(`${found}에 기사가 없어요`);
  }
  const feed = page.url;
  if (feeds.includes(feed)) throw new Error('이미 추가된 사이트예요');
  feeds = [...feeds, feed];
  save();
  console.log(`[News] feed added: ${feed}`);
  checkNews(); // reads it right away when the watcher is on
}

export function removeFeed(feed: string) {
  feeds = feeds.filter((f) => f !== feed);
  seeded = seeded.filter((f) => f !== feed); // added back later, it starts fresh
  muted = muted.filter((f) => f !== feed);
  save();
}

export function setNewsEnabled(value: boolean) {
  enabled = value;
  save();
  console.log(`[News] ${enabled ? 'on' : 'off'}`);
  if (enabled) checkNews();
}

/** Marks an article posted or dismissed; unknown URLs (typed by hand) are ignored. */
export function setNewsStatus(url: string, status: 'posted' | 'dismissed') {
  const item = items.find((i) => i.url === url);
  if (!item) return false;
  item.status = status;
  save();
  return true;
}

const decode = (s: string) => s
  .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
  .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, n) => String.fromCodePoint(parseInt(n, hex ? 16 : 10)))
  .replace(/&(lt|gt|quot|apos|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e as string]!)
  .trim();

// Zone names feeds write that Date.parse doesn't know (it has GMT, UTC and the US ones):
// Sky writes "BST", Speedcafe is Australian
const ZONES: Record<string, string> = {
  BST: '+0100', IST: '+0100', CET: '+0100', CEST: '+0200', EET: '+0200', EEST: '+0300',
  AEST: '+1000', AEDT: '+1100', ACST: '+0930', ACDT: '+1030', AWST: '+0800',
};

/** A feed's date as epoch ms (NaN when unreadable). */
export const feedTime = (s: string) =>
  Date.parse(s.replace(/\b([A-Z]{3,4})\s*$/, (zone) => ZONES[zone] ?? zone));

/** An RSS feed's items as {title, url}, feed order (newest first). */
export function parseFeed(xml: string) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)].flatMap(([item]) => {
    const tag = (name: string) => decode(item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '');
    const url = tag('link');
    const time = feedTime(tag('pubDate') || tag('dc:date'));
    if (!/^https?:\/\//.test(url)) return [];
    return [{ title: tag('title'), url, ...(time ? { published: new Date(time).toISOString() } : {}) }];
  });
}

// ── Same story from several outlets ──

const STORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // stories older than this don't come round again
// Headline matching is light work that runs on every check, so it gets the cheaper Sonnet; drafts keep Opus
const STORY_MODEL = 'claude-sonnet-5-5';
const STORY_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, same_as: { type: 'string' } },
        required: ['id', 'same_as'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
};

const host = (url: string) => new URL(url).host.replace(/^www\./, '');

/**
 * Asks Claude which fresh headlines (ids n0, n1, ...) report a story already
 * listed (r ids) or listed just above them. Headlines only, so it costs well
 * under a cent. Returns {n id: same_as id or ""}.
 */
export async function sameStories(fresh: NewsItem[], recent: NewsItem[], model = STORY_MODEL) {
  const lines = [
    ...recent.map((r, i) => `r${i}: ${r.title} (${host(r.url)})`),
    ...fresh.map((f, i) => `n${i}: ${f.title} (${host(f.url)})`),
  ];
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STORY_SCHEMA } },
    system:
      'You group Formula 1 news headlines from different outlets by story. Two headlines are the same story ' +
      'when they report the same event, announcement, decision or result (e.g. the same contract signing or ' +
      'the same penalty), however differently they are worded. Other stories about the same driver or team, ' +
      'and later developments that add new facts, are different stories.',
    messages: [{
      role: 'user',
      content: `${lines.join('\n')}\n\nFor every n id, give same_as: the id of an earlier line (any r id, or an n id ` +
        'above it) that reports the same story, or "" if there is none.',
    }],
  });
  if (response.stop_reason !== 'end_turn') throw new Error(`stop_reason ${response.stop_reason}`);
  const text = response.content.filter((b) => b.type === 'text').at(-1);
  const { matches } = JSON.parse(text?.type === 'text' ? text.text : '') as { matches: { id: string; same_as: string }[] };
  return Object.fromEntries(matches.map((m) => [m.id, m.same_as]));
}

/**
 * Folds each fresh article that `sameAs` pairs with a recent item, or with a
 * fresh one above it, into that story's `also`; returns the fresh articles left.
 */
export function mergeStories(fresh: NewsItem[], recent: NewsItem[], sameAs: Record<string, string>) {
  const mergedInto: (NewsItem | undefined)[] = [];
  fresh.forEach((item, i) => {
    const [, kind, n] = sameAs[`n${i}`]?.match(/^([nr])(\d+)$/) ?? [];
    const target = kind === 'r' ? recent[+n] : kind === 'n' && +n < i ? (mergedInto[+n] ?? fresh[+n]) : undefined;
    if (!target) return;
    mergedInto[i] = target;
    (target.also ??= []).push({ url: item.url, title: item.title });
  });
  return fresh.filter((_, i) => !mergedInto[i]);
}

const seen = (url: string) => items.some((i) => i.url === url || i.also?.some((a) => a.url === url));

/**
 * Lists articles not seen before, merging repeats of one story (a failed
 * check just lists them all). 'dismissed' ones - a first read's backlog - are
 * only remembered as seen, without asking about them.
 */
async function addArticles(listed: NewsItem[]) {
  const fresh = listed.filter((f, i) => !seen(f.url) && listed.findIndex((g) => g.url === f.url) === i);
  const active = fresh.filter((f) => f.status !== 'dismissed');
  const recent = items.filter((i) => Date.now() - Date.parse(i.found) < STORY_WINDOW_MS).slice(0, 100);
  let sameAs: Record<string, string> = {};
  try {
    if (active.length && recent.length + active.length > 1) sameAs = await sameStories(active, recent);
  } catch (err: any) {
    console.error('[News] same-story check failed:', err.message);
  }
  const kept = mergeStories(active, recent, sameAs);
  items.unshift(...kept, ...fresh.filter((f) => f.status === 'dismissed'));
  if (active.length) console.log(`[News] ${active.length} new, ${active.length - kept.length} merged into stories already listed`);
}

/** A feed's articles as list entries: none past the age limit, and on a first read only the newest few are new. */
export function feedArticles(listed: ReturnType<typeof parseFeed>, firstRead: boolean, now = Date.now()) {
  const found = new Date(now).toISOString();
  return listed
    .filter((a) => !a.published || now - Date.parse(a.published) < MAX_ARTICLE_AGE_MS)
    .filter((a) => !NOT_NEWS.test(`${a.title} ${a.url}`))
    .filter((a) => !seen(a.url))
    .map(({ title, url, published }, i): NewsItem => ({
      title, url, found, ...(published && { published }), status: firstRead && i >= NEW_FEED_BACKLOG ? 'dismissed' : 'new',
    }));
}

let checking = false;

export async function checkNews() {
  if (!enabled || checking) return;
  checking = true;
  try {
    // Feeds in list order, so on a tie the earlier feed's article leads the story
    const listed: NewsItem[] = [];
    for (const feed of feeds.filter((f) => !muted.includes(f))) {
      try {
        listed.push(...feedArticles(parseFeed((await fetchText(feed)).text), !seeded.includes(feed)));
        if (!seeded.includes(feed)) seeded = [...seeded, feed];
      } catch (err: any) {
        console.error(`[News] ${feed}:`, err.message);
      }
    }
    // Collecting stops here: drafts are paid, so they're made only when the admin asks
    await addArticles(listed);
    save();
  } finally {
    checking = false;
  }
}

// ── Drafts, made on request ──

const drafting = new Set<string>(); // articles with a draft under way
let bulk: { total: number; done: number } | null = null;

/**
 * Drafts one listed article, keeping the result on it. A draft takes ~30s; an
 * article hidden or posted meanwhile keeps that status.
 */
async function draftItem(item: NewsItem, pastedText = '') {
  drafting.add(item.url);
  try {
    item.draft = await draftNewsPost(item.url, { direct: true, pastedText });
    if (item.status === 'new' || item.status === 'failed') item.status = 'ready';
    delete item.error;
    return item.draft;
  } catch (err: any) {
    if (item.status === 'new') item.status = 'failed';
    item.error = err.message;
    throw err;
  } finally {
    drafting.delete(item.url);
    item.draftedAt = new Date().toISOString();
    save();
  }
}

/**
 * "Draft all": every listed article still waiting for its first draft, a few
 * at a time, in the background. Failed ones are left for a click (they may need
 * a paste). Returns how many it started on.
 */
export function draftAllListed() {
  if (bulk) throw new Error('이미 전체 초안을 만드는 중이에요');
  const queue = shownItems().filter((i) => i.status === 'new' && !drafting.has(i.url));
  if (!queue.length) return 0;
  const progress = { total: queue.length, done: 0 };
  bulk = progress;
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      await draftItem(item).catch(() => { /* kept on the article as its error */ });
      progress.done++;
    }
  };
  Promise.all(Array.from({ length: BULK_PARALLEL }, worker)).finally(() => { bulk = null; });
  console.log(`[News] drafting all: ${progress.total} articles`);
  return progress.total;
}

export function startNewsWatcher() {
  checkNews();
  setInterval(checkNews, CHECK_INTERVAL_MS);
}

/**
 * A draft asked for from the admin page, optionally from article text pasted
 * there; kept on the article when the watcher listed it.
 */
export async function draftOnRequest(url: string, pastedText = '') {
  const item = items.find((i) => i.url === url);
  return item ? draftItem(item, pastedText) : draftNewsPost(url, { direct: true, pastedText });
}
