import { affectsGrid, type StewardDecision } from './decisionParser';

// The next-race guide's rules, as plain functions of the schedule, the
// standings and the stored decisions: which race the guide shows, what phase
// its weekend is in, the championship arithmetic, the notices and which
// penalties apply. Nothing here fetches or guesses; every output follows from
// its inputs.

export interface ScheduleSession { date: string; time?: string }

export interface ScheduleRace extends ScheduleSession {
  round: number;
  raceName: string;
  circuit: { id: string; name: string; locality: string; country: string };
  firstPractice?: ScheduleSession;
  secondPractice?: ScheduleSession;
  thirdPractice?: ScheduleSession;
  sprintQualifying?: ScheduleSession;
  sprint?: ScheduleSession;
  qualifying?: ScheduleSession;
}

/** The guide moves on this long after lights out, once the post-race decisions are usually out. */
export const SWITCH_AFTER_MS = 4 * 60 * 60 * 1000;

// Jolpica gives UTC times ("07:00:00Z"); a date alone means the time isn't known yet
export const startOf = (s: ScheduleSession) => Date.parse(s.time ? `${s.date}T${s.time}` : `${s.date}T00:00:00Z`);

const SESSION_KEYS = ['firstPractice', 'secondPractice', 'thirdPractice', 'sprintQualifying', 'sprint', 'qualifying'] as const;
export type SessionKey = typeof SESSION_KEYS[number] | 'race';

/** The weekend's sessions in start order, the race last. */
export function sessionsOf(race: ScheduleRace) {
  const sessions: { key: SessionKey; start: number; timeKnown: boolean }[] = SESSION_KEYS
    .filter((key) => race[key])
    .map((key) => ({ key, start: startOf(race[key]!), timeKnown: Boolean(race[key]!.time) }));
  sessions.push({ key: 'race', start: startOf(race), timeKnown: Boolean(race.time) });
  return sessions.sort((a, b) => a.start - b.start);
}

/** The race the guide shows at `now`: the first one not yet past its switch time. */
export function guideRace<T extends ScheduleRace>(races: T[], now: number): T | undefined {
  return races.find((r) => startOf(r) + SWITCH_AFTER_MS > now);
}

export type GuidePhase = 'upcoming' | 'weekend' | 'race' | 'finished';

export function guidePhase(race: ScheduleRace, now: number): GuidePhase {
  const start = startOf(race);
  if (now >= start + SWITCH_AFTER_MS) return 'finished';
  if (now >= start) return 'race';
  return now >= sessionsOf(race)[0].start ? 'weekend' : 'upcoming';
}

// ---------------------------------------------------------------------------
// Championship arithmetic

const RACE_WIN = 25;
const RACE_ONE_TWO = 25 + 18;
const SPRINT_WIN = 8;
const SPRINT_ONE_TWO = 8 + 7;
// The fastest-lap point ran from 2019 to 2024
const fastestLapPoint = (year: number) => (year >= 2019 && year <= 2024 ? 1 : 0);

/** What one driver, or one team, can still score from `fromRound` (inclusive) to the end. */
export function remainingMax(races: ScheduleRace[], fromRound: number, year: number) {
  const left = races.filter((r) => r.round >= fromRound);
  const sprints = left.filter((r) => r.sprint).length;
  const fl = fastestLapPoint(year);
  return {
    races: left.length,
    sprints,
    driver: left.length * (RACE_WIN + fl) + sprints * SPRINT_WIN,
    constructor: left.length * (RACE_ONE_TWO + fl) + sprints * SPRINT_ONE_TWO,
  };
}

/**
 * Whether the leader could have the title settled by the end of `round`: even
 * outscoring second place by the most one weekend allows, the lead must then
 * exceed everything still to score. Countback ties are left out.
 */
export function canClinchAt(gap: number, races: ScheduleRace[], round: number, year: number, kind: 'driver' | 'constructor') {
  const thisWeekend = remainingMax(races.filter((r) => r.round === round), round, year)[kind];
  const after = remainingMax(races, round + 1, year)[kind];
  return gap + thisWeekend > after;
}

// ---------------------------------------------------------------------------
// Notices

/** Big rule changes: data from another era is not like-for-like with the current cars. */
export const REGULATION_ERAS = [
  { from: 2014, ko: '하이브리드 파워유닛', en: 'hybrid power units' },
  { from: 2017, ko: '차체 폭과 공력 규정', en: 'car width and aerodynamic rules' },
  { from: 2022, ko: '그라운드 이펙트 공력 규정', en: 'ground-effect aerodynamic rules' },
  { from: 2026, ko: '파워유닛과 공력 규정', en: 'power unit and aerodynamic rules' },
];

const eraOf = (year: number) => REGULATION_ERAS.filter((e) => e.from <= year).at(-1);

/** The rule change separating `dataYear` from `year`, or null when both share an era. */
export function regulationChange(dataYear: number, year: number) {
  const era = eraOf(year);
  return era && eraOf(dataYear) !== era ? era : null;
}

/** FastF1 has timing and telemetry from 2018 on. */
export const TELEMETRY_FROM = 2018;

export function circuitNotices(pastSeasons: number[], year: number) {
  const lastHeld = pastSeasons.length ? Math.max(...pastSeasons) : null;
  return {
    firstTime: lastHeld === null,
    lastHeld,
    // Counted only when at least one season was skipped
    yearsSince: lastHeld !== null && year - lastHeld >= 2 ? year - lastHeld : null,
    noTelemetry: lastHeld === null || lastHeld < TELEMETRY_FROM,
    notHeldLastYear: lastHeld !== year - 1,
  };
}

// ---------------------------------------------------------------------------
// Penalties

export interface DatedDecision {
  url: string;
  event: string;
  published: string;
  decision: StewardDecision;
}

/**
 * The first race to start after a decision was published: a grid drop the
 * stewards hand out during a weekend applies to that weekend's race, one given
 * after the race to the next. The rule reads "the next race in which the
 * driver participates", which is taken to be the next race on the calendar.
 */
export function targetRound(races: ScheduleRace[], published: string) {
  const at = Date.parse(published);
  return races.find((r) => startOf(r) > at)?.round;
}

/** Decisions a later document replaced, keyed "event#doc". */
function replaced(decisions: DatedDecision[]) {
  return new Set(decisions
    .filter((d) => d.decision.replacesDoc)
    .map((d) => `${d.event}#${d.decision.replacesDoc}`));
}

/**
 * The grid penalties the guide for `round` lists, split into those carried
 * from earlier races and those given during its weekend. Only decisions
 * published before lights out count, so a finished guide stays as it was.
 */
export function gridPenaltiesFor(races: ScheduleRace[], round: number, decisions: DatedDecision[]) {
  const race = races.find((r) => r.round === round);
  if (!race) return { carried: [], weekend: [] };
  const lightsOut = startOf(race);
  const weekendStart = sessionsOf(race)[0].start;
  const gone = replaced(decisions);
  const applying = decisions
    .filter((d) => affectsGrid(d.decision) && Date.parse(d.published) < lightsOut)
    .filter((d) => !(d.decision.doc && gone.has(`${d.event}#${d.decision.doc}`)))
    .filter((d) => targetRound(races, d.published) === round)
    .sort((a, b) => a.published.localeCompare(b.published));
  return {
    carried: applying.filter((d) => Date.parse(d.published) < weekendStart),
    weekend: applying.filter((d) => Date.parse(d.published) >= weekendStart),
  };
}

/** Each driver's latest printed reprimand count this season, as of `before`. */
export function reprimandCounts(decisions: DatedDecision[], season: number, before: number) {
  const latest = new Map<number, { car: number; driver?: string; count: number; kind?: string; url: string; published: string }>();
  for (const d of decisions) {
    const { reprimand, car } = d.decision;
    if (!reprimand?.count || car === undefined) continue;
    if (Number(d.published.slice(0, 4)) !== season || Date.parse(d.published) >= before) continue;
    const prev = latest.get(car);
    if (!prev || reprimand.count > prev.count) {
      latest.set(car, { car, driver: d.decision.driver, count: reprimand.count, kind: reprimand.kind, url: d.url, published: d.published });
    }
  }
  return [...latest.values()].sort((a, b) => b.count - a.count || a.car - b.car);
}
