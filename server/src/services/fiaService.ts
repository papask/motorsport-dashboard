import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getSeasonSchedule } from './jolpicaService';
import { gpHeading, packPosts, postToThreads } from './threadsService';

// Watches the FIA F1 document page and keeps a Korean/English summary of each
// new PDF (steward decisions, summons, race director notes, ...).

const FIA = 'https://www.fia.com';
const CHAMPIONSHIP = `${FIA}/documents/championships/fia-formula-one-world-championship-14`;
const DATA_FILE = path.join(
  process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data'),
  'fia-documents.json',
);
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
// Around a session the stewards publish often, so check every 5 min from an
// hour before it starts until 4 hours after (decisions can come late)
const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_WINDOW_BEFORE_MS = 60 * 60 * 1000;
const SESSION_WINDOW_AFTER_MS = 4 * 60 * 60 * 1000;

// Timing sheets and lists are tables; a summary adds nothing over the PDF
const SKIP_SUMMARY = /classification|entry list|starting grid|timetable|lap chart|history chart|pit stop summary|circuit map/i;

export interface FiaDocument {
  url: string;
  event: string;
  title: string;
  published: string; // UTC ISO, e.g. "2026-09-24T16:05:00Z"
  status: 'summarized' | 'skipped' | 'failed';
  summary?: {
    title_ko: string;
    category: string;
    summary_ko: string[];
    summary_en: string[];
  };
}

/**
 * The FIA prints Paris wall-clock time ("24.09.26 18:05", labelled CET even in
 * summer). Convert it to UTC so the client can show the viewer's local time.
 */
function parisToUtc(printed: string) {
  const m = printed.match(/^(\d\d)\.(\d\d)\.(\d\d) (\d\d):(\d\d)$/);
  if (!m) return printed; // already ISO, or unparseable
  const wall = Date.UTC(2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  // ponytail: offset taken at the wall time itself; off by an hour only inside the DST switch hour
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'longOffset' })
    .formatToParts(wall).find((p) => p.type === 'timeZoneName')!.value; // "GMT+02:00"
  const [, sign, h, min] = offset.match(/([+-])(\d\d):(\d\d)/) ?? ['', '+', '00', '00'];
  const offsetMs = (sign === '-' ? -1 : 1) * (+h * 60 + +min) * 60000;
  return new Date(wall - offsetMs).toISOString().replace('.000Z', 'Z');
}

// The site writes the federation as "FiA". Only text fields are touched; the
// URL is the document's key and must stay exactly as the FIA serves it.
const fiA = (s: string) => s.replaceAll('FIA', 'FiA');
function brand(d: FiaDocument): FiaDocument {
  return {
    ...d,
    event: fiA(d.event),
    title: fiA(d.title),
    summary: d.summary && JSON.parse(fiA(JSON.stringify(d.summary))),
  };
}

let documents: FiaDocument[] = [];
try {
  documents = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).map(brand);
  documents.forEach((d) => { d.published = parisToUtc(d.published); }); // files saved before UTC
} catch {
  // first run: nothing stored yet
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(documents, null, 2));
}

async function getHtml(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`FIA ${res.status} ${url}`);
  return res.text();
}

const clean = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** The season URL changes every year; read it from the season dropdown. */
async function currentSeasonUrl() {
  const html = await getHtml(CHAMPIONSHIP);
  const seasons = [...html.matchAll(/\/season\/season-(\d{4})-\d+/g)];
  if (!seasons.length) throw new Error('FIA season list not found');
  const latest = seasons.reduce((a, b) => (Number(b[1]) > Number(a[1]) ? b : a));
  return `${CHAMPIONSHIP}${latest[0]}`;
}

/** Documents of the event the season page shows (the latest one). */
async function listDocuments() {
  const html = await getHtml(await currentSeasonUrl());
  const event = clean(html.match(/event-title active">([^<]*)</)?.[1] ?? '');
  return html.split('<li class="document-row').slice(1).flatMap((row) => {
    const href = row.match(/href="([^"]+\.pdf)"/)?.[1];
    const title = row.match(/<div class="title">([\s\S]*?)<\/div>/)?.[1];
    if (!href || !title) return [];
    return [{
      url: FIA + href,
      event,
      title: clean(title),
      published: parisToUtc(clean(row.match(/date-display-single"[^>]*>([^<]*)</)?.[1] ?? '')),
    }];
  });
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    title_ko: { type: 'string', description: 'Document title in natural Korean' },
    category: {
      type: 'string',
      enum: ['penalty', 'no_action', 'summons', 'race_director', 'technical', 'other'],
    },
    summary_ko: { type: 'array', items: { type: 'string' }, description: '2-5 short Korean sentences' },
    summary_en: { type: 'array', items: { type: 'string' }, description: 'The same points in English' },
  },
  required: ['title_ko', 'category', 'summary_ko', 'summary_en'],
  additionalProperties: false,
};

let client: Anthropic | undefined;

async function summarize(url: string) {
  const pdf = Buffer.from(await (await fetch(url)).arrayBuffer()).toString('base64');
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
    system:
      'You summarize official FIA Formula 1 documents for Korean F1 fans. ' +
      'State who is involved (car number and driver), what happened, and the decision or instruction. ' +
      'Use standard Korean F1 terms (e.g. 스튜어드, 그리드 페널티, 견책). Do not add anything that is not in the document.',
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
        { type: 'text', text: 'Summarize this document.' },
      ],
    }],
  });
  if (response.stop_reason !== 'end_turn') throw new Error(`stop_reason ${response.stop_reason}`);
  const text = response.content.find((b) => b.type === 'text');
  return JSON.parse(text && text.type === 'text' ? text.text : '');
}

const POST_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** The event's round in its season's schedule; undefined when the names don't line up. */
async function roundOf(d: FiaDocument) {
  const { races } = await getSeasonSchedule(d.published.slice(0, 4));
  return races.find((r: any) => r.raceName.toLowerCase() === d.event.toLowerCase())?.round as number | undefined;
}

const docNumber = (d: { title: string }) => Number(d.title.match(/^Doc (\d+)/i)?.[1] ?? 0);

/**
 * "2026 15 라운드 아제르바이잔 그랑프리 FiA 문서 요약", the site link,
 * "Doc 52. <title>", the FIA PDF link, the summary bullets and an AI notice.
 * The site link comes first so Threads' link card shows the site. Each post is
 * filled up to 500 chars, cut between sentences, and ends in "<계속>" when a
 * reply carries on. Timing sheets (no summary) get the FIA title and a note
 * that tables aren't summarized.
 */
export function threadsPosts(d: FiaDocument, round?: number) {
  const num = docNumber(d);
  const title = d.summary?.title_ko ?? d.title.replace(/^Doc \d+\s*-\s*/i, '');
  const head = [
    `${gpHeading(d.published.slice(0, 4), round, d.event)} FiA 문서 요약`,
    process.env.SITE_URL && `🔗 ${process.env.SITE_URL}/docs`,
    `${num ? `Doc ${num}. ` : ''}${title}`,
    `📄 ${d.url}`,
  ].filter(Boolean).join('\n');
  // [text, separator before it when it shares a post with what precedes]
  const units: [string, string][] = [[head, '']];
  if (d.summary) {
    d.summary.summary_ko.forEach((bullet, i) =>
      bullet.split(/(?<=[.!?])\s+/).forEach((sentence, j) =>
        units.push(j ? [sentence, ' '] : [`• ${sentence}`, i ? '\n' : '\n\n'])));
  } else {
    units.push(['순위표·명단 같은 표 문서는 요약하지 않습니다.', '\n\n']);
  }
  if (d.summary) units.push(['AI 요약/번역이므로 실수가 있을 수 있습니다.', '\n\n']); // summaries come from Claude
  return packPosts(units);
}

let running = false;

export async function checkFiaDocuments() {
  if (running) return;
  running = true;
  try {
    const known = new Map(documents.map((d) => [d.url, d]));
    // Oldest first, so a batch lands on Threads in document order
    const listed = (await listDocuments()).sort((a, b) =>
      a.published.localeCompare(b.published) || docNumber(a) - docNumber(b));
    for (const doc of listed) {
      const prev = known.get(doc.url);
      if (prev && prev.status !== 'failed') continue;
      let entry: FiaDocument = { ...doc, status: 'skipped' };
      if (!SKIP_SUMMARY.test(doc.title)) {
        try {
          entry = { ...doc, status: 'summarized', summary: await summarize(doc.url) };
        } catch (err: any) {
          console.error(`[FIA] ${doc.title}:`, err.message);
          entry = { ...doc, status: 'failed' };
        }
      }
      const branded = brand(entry);
      documents = [branded, ...documents.filter((d) => d.url !== doc.url)];
      save(); // after each document, so a crash doesn't re-bill finished ones
      // The age limit keeps a fresh disk (or a late retry) from posting a whole weekend at once
      // Failed summaries wait for their retry, so each document is posted once
      if (branded.status !== 'failed' && Date.now() - Date.parse(doc.published) < POST_MAX_AGE_MS) {
        // ponytail: a failed post is only logged, never retried
        const round = await roundOf(branded).catch(() => undefined); // schedule down → post without the round
        await postToThreads(threadsPosts(branded, round)).catch((err) => console.error(`[Threads] ${doc.title}:`, err.message));
      }
    }
  } catch (err: any) {
    console.error('[FIA] check failed:', err.message);
  } finally {
    running = false;
  }
}

// Event names repeat every season, so the year keeps "2026 Italian Grand Prix" apart from 2027's
const eventKey = (d: FiaDocument) => `${d.published.slice(0, 4)} ${d.event}`;

/** Every event (oldest first) and the documents of one of them, the latest by default. */
export function getFiaDocuments(event?: string) {
  const sorted = [...documents].sort((a, b) => b.published.localeCompare(a.published));
  const events = [...new Set(sorted.map(eventKey))].reverse();
  const selected = event && events.includes(event) ? event : events.at(-1) ?? null;
  return {
    events,
    event: selected,
    documents: sorted.filter((d) => eventKey(d) === selected),
    nextCheck, // null while the watcher is off; in the past while a check runs
    checkEveryMin: checkEveryMs / 60000,
  };
}

/** True from an hour before any session (practice to race) until 4 hours after it. */
export async function nearSession(now = Date.now()) {
  const { races } = await getSeasonSchedule(new Date(now).getUTCFullYear());
  return races.some((r: any) =>
    [r.firstPractice, r.secondPractice, r.thirdPractice, r.sprintQualifying, r.sprint, r.qualifying, { date: r.date, time: r.time }]
      .some((s) => {
        if (!s?.date || !s.time) return false;
        const start = Date.parse(`${s.date}T${s.time}`);
        return now > start - SESSION_WINDOW_BEFORE_MS && now < start + SESSION_WINDOW_AFTER_MS;
      }),
  );
}

let nextCheck: string | null = null;
let checkEveryMs = CHECK_INTERVAL_MS;

async function watch() {
  await checkFiaDocuments();
  // Schedule unavailable → fall back to the normal interval
  checkEveryMs = (await nearSession().catch(() => false)) ? SESSION_CHECK_INTERVAL_MS : CHECK_INTERVAL_MS;
  nextCheck = new Date(Date.now() + checkEveryMs).toISOString();
  setTimeout(watch, checkEveryMs);
}

export function startFiaWatcher() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[FIA] ANTHROPIC_API_KEY not set; document summaries are off');
    return;
  }
  nextCheck = new Date().toISOString(); // first check starts now
  watch();
}
