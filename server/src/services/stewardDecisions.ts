import fs from 'fs';
import path from 'path';
import { parseDecision, type StewardDecision } from './decisionParser';
import { getPdf, pdfText, type ListedDocument } from './fiaSite';
import { onFiaDocument, storedFiaDocuments } from './fiaService';
import { assertNextRaceEnabled, nextRaceEnabled, NextRaceDisabledError, onNextRaceToggle } from './nextRaceSettings';

// Keeps what each stewards' decision decided (grid drops, pit lane starts,
// ...), read from the PDF text by decisionParser. New decisions arrive through
// the FIA watcher, which hands over the PDF it already downloaded; switching
// the guide on reads the stored ones it missed. Everything here stops while
// the guide is switched off.

const DATA_FILE = path.join(
  process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data'),
  'steward-decisions.json',
);
// Between FIA requests while catching up, to go easy on their site
const CATCH_UP_DELAY_MS = 3000;

export interface DecisionEntry extends ListedDocument {
  status: 'parsed' | 'unreadable' | 'not_decision';
  decision?: StewardDecision;
}

interface Store {
  entries: DecisionEntry[];
}

let store: Store = { entries: [] };
try {
  store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch {
  // first run: nothing stored yet
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE); // a crash mid-write leaves the old file whole
}

// Decisions are filed as "...infringement..." or "...decision..."; summonses are hearings, not outcomes
const isCandidate = (url: string) =>
  /infringement|decision|offence/i.test(url.split('/').pop() ?? '') && !/summons/i.test(url);

const known = (url: string) => store.entries.some((e) => e.url === url);


// URLs being read right now: the watcher and a catch-up can meet on the same document
const reading = new Set<string>();

/** Reads one listed document, downloading its PDF unless one is given. */
async function record(doc: ListedDocument, pdf?: Buffer) {
  if (!nextRaceEnabled() || !isCandidate(doc.url) || known(doc.url) || reading.has(doc.url)) return;
  reading.add(doc.url);
  try {
    const result = parseDecision(await pdfText(pdf ?? await getPdf(doc.url)));
    const entry: DecisionEntry = { url: doc.url, event: doc.event, title: doc.title, published: doc.published, status: result.status };
    if (result.status === 'parsed') entry.decision = result.decision;
    if (result.status === 'unreadable') console.warn(`[Decisions] unreadable: ${doc.title}`);
    store.entries.push(entry);
    save();
  } finally {
    reading.delete(doc.url);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let catchingUp = false;

/**
 * Reads what was missed: stored FIA documents the watcher saw while the guide
 * was off. Those hold the previous race's decisions, which is all the grid
 * penalties need; a failed read is tried again on the next catch-up.
 */
export async function catchUpDecisions() {
  if (catchingUp || !nextRaceEnabled()) return;
  catchingUp = true;
  try {
    for (const doc of storedFiaDocuments()) {
      if (!isCandidate(doc.url) || known(doc.url)) continue;
      assertNextRaceEnabled();
      await record(doc).catch((err) => console.error(`[Decisions] ${doc.title}:`, err.message));
      await sleep(CATCH_UP_DELAY_MS);
    }
  } catch (err: any) {
    if (err instanceof NextRaceDisabledError) console.log('[Decisions] catch-up stopped: switched off');
    else console.error('[Decisions] catch-up failed:', err.message);
  } finally {
    catchingUp = false;
  }
}

export const decisionEntries = (): readonly DecisionEntry[] => store.entries;

const RETRY_EVERY_MS = 60 * 60 * 1000;
let retryTimer: NodeJS.Timeout | undefined;

// Catches up now, then hourly while the switch is on, so a failed read isn't left behind
function schedule() {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  if (!nextRaceEnabled()) return;
  catchUpDecisions();
  retryTimer = setTimeout(schedule, RETRY_EVERY_MS);
}

export function startStewardDecisions() {
  onFiaDocument((doc, pdf) => record(doc, pdf));
  onNextRaceToggle(schedule);
  schedule();
}
