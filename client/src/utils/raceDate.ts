import { getSessionNameKR } from '../constants/koreanTerms';
import { getLang } from '../i18n';

// Intl locale that follows the current UI language.
function getLocale(): string {
  return getLang() === 'en' ? 'en-US' : 'ko-KR';
}

export interface SessionLike {
  date: string;
  time?: string;
}

// The Ergast/Jolpica API reports `time` in UTC (e.g. "13:00:00Z"). Combining it
// with `date` yields the correct absolute instant; formatting it *without* a
// timeZone option then renders in the viewer's local timezone.
export function getRaceDateTime(session: SessionLike): Date {
  return new Date(session.time ? `${session.date}T${session.time}` : session.date);
}

// The first race whose start instant is still in the future.
export function getNextRace<T extends SessionLike>(races: T[]): T | undefined {
  const now = new Date();
  return races.find((r) => getRaceDateTime(r) > now);
}

// For a date-only value (no clock time) we only know the calendar date, so
// parse it as *local* midnight to avoid a timezone shift moving it to the
// previous/next day in the display.
function toDisplayDate(session: SessionLike): Date {
  return session.time ? getRaceDateTime(session) : new Date(`${session.date}T00:00:00`);
}

// e.g. "2025년 11월 23일 (일)" in the viewer's local timezone.
export function formatLocalDate(session: SessionLike): string {
  return toDisplayDate(session).toLocaleDateString(getLocale(), {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
}

// e.g. "오후 3:00 KST". Empty string when the session has no clock time.
export function formatLocalTime(session: SessionLike): string {
  if (!session.time) return '';
  const t = getRaceDateTime(session).toLocaleTimeString(getLocale(), {
    hour: '2-digit', minute: '2-digit',
  });
  return `${t} ${getLocalTZLabel()}`;
}

// Full local date + time, falling back to date-only when no time is present.
export function formatLocalDateTime(session: SessionLike): string {
  const t = formatLocalTime(session);
  return t ? `${formatLocalDate(session)} ${t}` : formatLocalDate(session);
}

// Compact "11월 23일 (일) 오후 3:00" for dense timetables (no timezone suffix).
export function formatLocalShort(session: SessionLike): string {
  const d = toDisplayDate(session);
  const day = d.toLocaleDateString(getLocale(), { month: 'long', day: 'numeric', weekday: 'short' });
  const t = session.time
    ? d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })
    : '';
  return t ? `${day} ${t}` : day;
}

// DST-free zones that CLDR only renders as "GMT+n"; map them to the familiar
// abbreviation. Zones *with* DST (Europe/Australia) are intentionally omitted so
// we never show a wrong seasonal abbreviation — they fall back to the offset.
const TZ_ABBR: Record<string, string> = {
  'Asia/Seoul': 'KST',
  'Asia/Tokyo': 'JST',
  'Asia/Shanghai': 'CST',
  'Asia/Hong_Kong': 'HKT',
  'Asia/Taipei': 'CST',
  'Asia/Singapore': 'SGT',
  'Asia/Kolkata': 'IST',
  'Asia/Bangkok': 'ICT',
  'Asia/Jakarta': 'WIB',
  'Asia/Dubai': 'GST',
  'Asia/Riyadh': 'AST',
};

function tzShort(locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { timeZoneName: 'short' }).formatToParts(new Date());
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

// The viewer's local timezone label, preferring a friendly abbreviation
// (KST, PST, EDT…) over a raw "GMT+9" offset when one is reliably available.
export function getLocalTZLabel(): string {
  // The Americas resolve to real abbreviations (incl. DST) via the en short form.
  const enShort = tzShort('en-US');
  if (enShort && !/^(GMT|UTC)/i.test(enShort)) return enShort;
  // No-DST zones that only render as an offset: use our mapped abbreviation.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && TZ_ABBR[tz]) return TZ_ABBR[tz];
  // Fallback: the localized offset form ("GMT+9").
  return enShort || tzShort(getLocale());
}

export interface SessionEntry extends SessionLike {
  key: string;
  label: string;
}

// Maps the API field to its canonical (English) session name; the display label
// is resolved per-language at call time via getSessionNameKR.
const SESSION_FIELDS: { key: string; name: string }[] = [
  { key: 'firstPractice', name: 'Practice 1' },
  { key: 'secondPractice', name: 'Practice 2' },
  { key: 'thirdPractice', name: 'Practice 3' },
  { key: 'sprintQualifying', name: 'Sprint Qualifying' },
  { key: 'qualifying', name: 'Qualifying' },
  { key: 'sprint', name: 'Sprint' },
];

// Ordered weekend timetable (practice → qualifying → sprint → race), including
// only the sessions the API actually provides, sorted by start time so sprint
// and conventional weekends both read chronologically.
export function getRaceSessions(race: any): SessionEntry[] {
  const entries: SessionEntry[] = [];
  for (const f of SESSION_FIELDS) {
    const s = race?.[f.key];
    if (s && s.date) entries.push({ key: f.key, label: getSessionNameKR(f.name), date: s.date, time: s.time });
  }
  if (race?.date) entries.push({ key: 'race', label: getSessionNameKR('Race'), date: race.date, time: race.time });
  entries.sort((a, b) => getRaceDateTime(a).getTime() - getRaceDateTime(b).getTime());
  return entries;
}
