import fs from 'fs';
import path from 'path';

// Posts to Threads with a long-lived token (valid 60 days). THREADS_ACCESS_TOKEN
// seeds it; each refresh is saved to the data disk, since a running server
// can't rewrite its own env. Setting a new env token replaces the saved one.

const API = 'https://graph.threads.net';
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'threads-token.json');
// On/off switch, flipped at runtime through /api/admin/threads. It lives on the
// data disk, so each environment (local, Render) has its own and a restart keeps it.
const SETTINGS_FILE = path.join(DATA_DIR, 'threads-settings.json');
const REFRESH_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

const seed = process.env.THREADS_ACCESS_TOKEN;
let token = seed;
try {
  const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  if (saved.seed === seed) token = saved.token;
} catch {
  // never refreshed yet
}

// Off until switched on, so a new environment never starts posting by itself
let enabled = false;
try {
  enabled = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')).enabled === true;
} catch {
  // never switched
}

export const threadsStatus = () => ({ enabled, hasToken: Boolean(token) });

export function setThreadsEnabled(value: boolean) {
  enabled = value;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ enabled }));
  console.log(`[Threads] posting ${enabled ? 'on' : 'off'}`);
}

// Meta's "action is blocked" (anti-spam). Seen on topic-tagged posts after a burst of them, while untagged posts still went through.
const ACTION_BLOCKED = 2207051;

async function send(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const body: any = await res.json();
  if (!res.ok) {
    const e = body.error ?? {};
    throw Object.assign(new Error([e.message ?? `HTTP ${res.status}`, e.error_user_title].filter(Boolean).join(' / ')), {
      subcode: e.error_subcode as number | undefined,
      transient: e.is_transient as boolean | undefined,
    });
  }
  return body;
}

async function refresh() {
  try {
    // Meta refuses tokens younger than 24h, so the refresh right after a new token fails once; harmless
    const body = await send(`${API}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token!)}`);
    token = body.access_token;
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ seed, token }));
  } catch (err: any) {
    console.error('[Threads] token refresh failed:', err.message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Threads answers bursts with transient errors, so each call gets three tries,
 * 10s apart, unless Meta marks the error as not transient. A retried publish
 * can't double-post: a container publishes once, and a second attempt just errors.
 */
async function post(endpoint: string, params: Record<string, string>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send(`${API}/v1.0/me/${endpoint}`, {
        method: 'POST',
        body: new URLSearchParams({ ...params, access_token: token! }),
      });
    } catch (err: any) {
      if (attempt === 3 || err.transient === false) {
        throw Object.assign(err, { message: `${endpoint}: ${err.message}` });
      }
      await sleep(10000);
    }
  }
}

/**
 * A container is processed before it can be published (links take a few
 * seconds); publishing earlier fails with "The requested resource does not
 * exist". Right after creation the status lookup can fail the same way, so
 * lookup errors count as "not ready yet".
 */
async function waitUntilReady(id: string) {
  let lastError = '';
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    try {
      const { status, error_message } = await send(
        `${API}/v1.0/${id}?fields=status,error_message&access_token=${encodeURIComponent(token!)}`);
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`container ${status}: ${error_message ?? ''}`);
    } catch (err: any) {
      if (err.message.startsWith('container ')) throw err;
      lastError = err.message;
    }
  }
  throw new Error(`container not ready after 30s ${lastError}`.trim());
}

// ── Post text helpers shared by the FiA and session-result posters ──

// "Azerbaijan Grand Prix" → "아제르바이잔"; unknown names stay in English
const GP_NAMES_KO: Record<string, string> = {
  Australian: '호주', Chinese: '중국', Japanese: '일본', Bahrain: '바레인', 'Saudi Arabian': '사우디아라비아',
  Miami: '마이애미', 'Emilia Romagna': '에밀리아 로마냐', Canadian: '캐나다', Monaco: '모나코', Barcelona: '바르셀로나',
  'Barcelona-Catalunya': '바르셀로나-카탈루냐', Spanish: '스페인', Austrian: '오스트리아', British: '영국',
  Belgian: '벨기에', Hungarian: '헝가리', Dutch: '네덜란드', Italian: '이탈리아', Azerbaijan: '아제르바이잔',
  Singapore: '싱가포르', 'United States': '미국', 'Mexico City': '멕시코시티', Brazilian: '브라질',
  'São Paulo': '상파울루', 'Las Vegas': '라스베이거스', Qatar: '카타르', 'Abu Dhabi': '아부다비',
};

/** "2026 15 라운드 아제르바이잔 그랑프리"; the round is left out when unknown. */
export function gpHeading(year: string | number, round: number | undefined, raceName: string) {
  const gp = raceName.replace(/ Grand Prix.*$/i, '');
  return `${year}${round ? ` ${round} 라운드` : ''} ${GP_NAMES_KO[gp] ?? gp} 그랑프리`;
}

const POST_MAX_CHARS = 500; // Threads' limit per post
const CONTINUED = ' <계속>';

/**
 * Packs [text, separator] units into posts of at most 500 chars; a unit's
 * separator is dropped when it opens a post. Posts that a reply continues end
 * in "<계속>". A final reply holding a lone unit takes the unit before it along.
 */
export function packPosts(units: [string, string][]) {
  const render = (post: [string, string][]) => post.map(([text, sep], k) => (k ? sep : '') + text).join('');
  if (render(units).length <= POST_MAX_CHARS) return [render(units)];
  const limit = POST_MAX_CHARS - CONTINUED.length;
  const posts: [string, string][][] = [];
  for (const [i, [text, sep]] of units.entries()) {
    const post = posts.at(-1);
    // the post taking the final unit is the last one and needs no "<계속>" room
    const room = i === units.length - 1 ? POST_MAX_CHARS : limit;
    if (post && render([...post, [text, sep]]).length <= room) post.push([text, sep]);
    // ponytail: a single unit longer than a post is cut mid-text; units are sentences or result lines
    else for (let j = 0; j < text.length; j += limit) posts.push([[text.slice(j, j + limit), sep]]);
  }
  const [prev, tail] = posts.slice(-2);
  if (tail?.length === 1 && prev.length > 1 && render([prev.at(-1)!, ...tail]).length <= POST_MAX_CHARS) {
    tail.unshift(prev.pop()!);
  }
  return posts.map((post, i) => render(post) + (i < posts.length - 1 ? CONTINUED : ''));
}

// Threads allows one topic per post; this one files posts under the F1 community
const TOPIC_TAG = 'F1 Threads';

/**
 * Posts the first text (under TOPIC_TAG) and chains the rest as replies, each
 * to the one before (needs threads_manage_replies). Text only, 500 chars each.
 * No-op without a token or while switched off.
 */
export async function postToThreads(texts: string[]) {
  if (!token || !enabled) return;
  let replyTo: string | undefined;
  for (const text of texts) {
    const params: Record<string, string> = { media_type: 'TEXT', text, ...(replyTo ? { reply_to_id: replyTo } : { topic_tag: TOPIC_TAG }) };
    const { id } = await post('threads', params).catch((err) => {
      if (err.subcode !== ACTION_BLOCKED || !params.topic_tag) throw err;
      // A blocked topic tag shouldn't cost the post itself
      console.warn('[Threads] topic tag blocked; posting without it');
      delete params.topic_tag;
      return post('threads', params);
    });
    await waitUntilReady(id);
    ({ id: replyTo } = await post('threads_publish', { creation_id: id }));
  }
}

export function startThreadsTokenRefresh() {
  if (!token) return;
  refresh();
  setInterval(refresh, REFRESH_EVERY_MS);
}
