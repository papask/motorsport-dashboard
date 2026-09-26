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

async function send(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const body: any = await res.json();
  if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
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

const post = (endpoint: string, params: Record<string, string>) =>
  send(`${API}/v1.0/me/${endpoint}`, {
    method: 'POST',
    body: new URLSearchParams({ ...params, access_token: token! }),
  });

/**
 * A container is processed before it can be published (links take a few
 * seconds); publishing earlier fails with "The requested resource does not exist".
 */
async function waitUntilReady(id: string) {
  for (let i = 0; i < 12; i++) {
    const { status, error_message } = await send(
      `${API}/v1.0/${id}?fields=status,error_message&access_token=${encodeURIComponent(token!)}`);
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`container ${status}: ${error_message ?? ''}`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error('container not ready after 30s');
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
    const { id } = await post('threads', {
      media_type: 'TEXT',
      text,
      ...(replyTo ? { reply_to_id: replyTo } : { topic_tag: TOPIC_TAG }),
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
