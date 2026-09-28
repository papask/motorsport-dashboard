import { extractText, getDocumentProxy } from 'unpdf';

// Reads the FIA F1 document page (the latest event's PDFs) and those PDFs.
// Shared by the summary watcher (fiaService), the steward decisions store and
// the guide builder (entry lists).

export const FIA = 'https://www.fia.com';
const CHAMPIONSHIP = `${FIA}/documents/championships/fia-formula-one-world-championship-14`;

export interface ListedDocument {
  url: string;
  event: string;
  title: string;
  published: string; // UTC ISO, e.g. "2026-09-24T16:05:00Z"
}

/**
 * The FIA prints Paris wall-clock time ("24.09.26 18:05", labelled CET even in
 * summer). Convert it to UTC so the client can show the viewer's local time.
 */
export function parisToUtc(printed: string) {
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

async function getHtml(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`FIA ${res.status} ${url}`);
  return res.text();
}

export async function getPdf(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`FIA ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** A PDF's text, pages joined, as the fixed-pattern readers expect it. */
export async function pdfText(pdf: Buffer) {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
  return text;
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

/** The documents an event page lists; `event` names the page's event. */
function documentsOf(html: string): ListedDocument[] {
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

/** Documents of the event the season page shows (the latest one). */
export async function listDocuments() {
  return documentsOf(await getHtml(await currentSeasonUrl()));
}
