import fs from 'fs';
import path from 'path';

// On/off switch for the next-race guide, flipped at runtime through
// /api/admin/next-race. Off, the guide makes no outside calls at all: no
// Jolpica builds, no steward-decision PDFs, and its API answers 404. Like the
// Threads switch it lives on the data disk, so each environment keeps its own
// and a restart keeps it.
//
// The calendar feed has its own switch: once people subscribe, their
// calendars keep polling it, so it can stay up while the guide is off. Left
// unset, it follows the guide.

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'next-race-settings.json');

// Off until switched on, so a new deploy never starts collecting by itself
let enabled = false;
let calendar: boolean | undefined;
// Posting each guide to Threads once it's ready: off until switched on, and it
// also needs the guide and the Threads switch on
let threads = false;
try {
  const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  enabled = saved.enabled === true;
  if (typeof saved.calendar === 'boolean') calendar = saved.calendar;
  threads = saved.threads === true;
} catch {
  // never switched
}

type Listener = (enabled: boolean) => void;
const listeners: Listener[] = [];

export const nextRaceEnabled = () => enabled;
export const calendarEnabled = () => calendar ?? enabled;
export const guideThreadsEnabled = () => threads;

/** Called with the new value on every flip; services start or stop their work here. */
export function onNextRaceToggle(listener: Listener) {
  listeners.push(listener);
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ enabled, ...(calendar !== undefined && { calendar }), ...(threads && { threads }) }));
}

export function setGuideThreadsEnabled(value: boolean) {
  threads = value;
  save();
  console.log(`[NextRace] Threads posting ${value ? 'on' : 'off'}`);
}

export function setNextRaceEnabled(value: boolean) {
  if (value === enabled) return;
  enabled = value;
  save();
  console.log(`[NextRace] ${enabled ? 'on' : 'off'}`);
  for (const listener of listeners) listener(enabled);
}

/** true or false pins the calendar; null lets it follow the guide again. */
export function setCalendarEnabled(value: boolean | null) {
  calendar = value ?? undefined;
  save();
  console.log(`[NextRace] calendar ${value === null ? 'follows the guide' : value ? 'on' : 'off'}`);
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
