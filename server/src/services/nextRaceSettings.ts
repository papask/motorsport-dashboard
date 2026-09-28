import fs from 'fs';
import path from 'path';

// On/off switch for the next-race guide, flipped at runtime through
// /api/admin/next-race. Off, the guide makes no outside calls at all: no
// Jolpica builds, no steward-decision PDFs, and its API answers 404. Like the
// Threads switch it lives on the data disk, so each environment keeps its own
// and a restart keeps it.

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'next-race-settings.json');

// Off until switched on, so a new deploy never starts collecting by itself
let enabled = false;
try {
  enabled = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')).enabled === true;
} catch {
  // never switched
}

type Listener = (enabled: boolean) => void;
const listeners: Listener[] = [];

export const nextRaceEnabled = () => enabled;

/** Called with the new value on every flip; services start or stop their work here. */
export function onNextRaceToggle(listener: Listener) {
  listeners.push(listener);
}

export function setNextRaceEnabled(value: boolean) {
  if (value === enabled) return;
  enabled = value;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ enabled }));
  console.log(`[NextRace] ${enabled ? 'on' : 'off'}`);
  for (const listener of listeners) listener(enabled);
}

/** Thrown by a job that noticed the switch went off between two steps. */
export class NextRaceDisabledError extends Error {
  constructor() {
    super('next-race guide is switched off');
  }
}

/** Call between the steps of a long job so switching off stops it at the next step. */
export function assertNextRaceEnabled() {
  if (!enabled) throw new NextRaceDisabledError();
}
