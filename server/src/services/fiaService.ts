import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

// Watches the FIA F1 document page and keeps a Korean/English summary of each
// new PDF (steward decisions, summons, race director notes, ...).

const FIA = 'https://www.fia.com';
const CHAMPIONSHIP = `${FIA}/documents/championships/fia-formula-one-world-championship-14`;
const DATA_FILE = path.join(
  process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data'),
  'fia-documents.json',
);
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // ponytail: fixed 30 min; poll faster on race weekends if needed

// Timing sheets and lists are tables; a summary adds nothing over the PDF
const SKIP_SUMMARY = /classification|entry list|starting grid|timetable|lap chart|history chart|pit stop summary|circuit map/i;

export interface FiaDocument {
  url: string;
  event: string;
  title: string;
  published: string; // as printed by the FIA, "24.09.26 18:05" (CET)
  status: 'summarized' | 'skipped' | 'failed';
  summary?: {
    title_ko: string;
    category: string;
    summary_ko: string[];
    summary_en: string[];
  };
}

let documents: FiaDocument[] = [];
try {
  documents = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
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
      published: clean(row.match(/date-display-single"[^>]*>([^<]*)</)?.[1] ?? ''),
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

let running = false;

export async function checkFiaDocuments() {
  if (running) return;
  running = true;
  try {
    const known = new Map(documents.map((d) => [d.url, d]));
    for (const doc of await listDocuments()) {
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
      documents = [entry, ...documents.filter((d) => d.url !== doc.url)];
      save(); // after each document, so a crash doesn't re-bill finished ones
    }
  } catch (err: any) {
    console.error('[FIA] check failed:', err.message);
  } finally {
    running = false;
  }
}

// "24.09.26 18:05" (dd.mm.yy) → "260924 18:05", which sorts chronologically
const sortKey = (d: FiaDocument) => d.published.replace(/^(\d\d)\.(\d\d)\.(\d\d)/, '$3$2$1');

export function getFiaDocuments() {
  return [...documents].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

export function startFiaWatcher() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[FIA] ANTHROPIC_API_KEY not set; document summaries are off');
    return;
  }
  checkFiaDocuments();
  setInterval(checkFiaDocuments, CHECK_INTERVAL_MS);
}
