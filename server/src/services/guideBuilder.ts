import fs from 'fs';
import path from 'path';
import { getCircuitRaceHistory, getQualifyingResults, getRaceResults, getRawPitStops, getSeasonSchedule } from './jolpicaService';
import { getTimelineExtras, getTrackProfile } from './fastf1Service';
import { guideRace, targetRound, TELEMETRY_FROM, type ScheduleRace } from './guideRules';
import { parseEntryList, type EntryListDriver } from './decisionParser';
import { getPdf, pdfText } from './fiaSite';
import { onFiaDocument, storedFiaDocuments } from './fiaService';
import { assertNextRaceEnabled, nextRaceEnabled, NextRaceDisabledError, onNextRaceToggle } from './nextRaceSettings';

// Builds the slow parts of a next-race guide ahead of time: the circuit's race
// history, what the current drivers have done there, and, when the circuit was
// last used in the FastF1 era (2018 on), that race's results and its pole lap
// read as a track profile. Jolpica pages plus two FastF1 loads per circuit, so
// it runs in the background (hourly, and when switched on) for the guide's
// race and the one after, and the page only reads the file.

const GUIDES_DIR = path.join(process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data'), 'guides');
const CHECK_EVERY_MS = 60 * 60 * 1000;
// Bump when the file's shape changes; older files are rebuilt on the next check
const GUIDE_VERSION = 3;
// A failed FastF1 load is tried again after this long, not on every hourly check
const FASTF1_RETRY_MS = 6 * 60 * 60 * 1000;

export interface GuideFile {
  version: number;
  builtAt: string;
  year: number;
  round: number;
  circuitId: string;
  history: {
    seasons: number[];
    races: number;
    poleWins: number;
    lastHeld: number | null;
    lastLaps: number | null;
    recentWinners: { season: number; driverId: string; code: string; name: string; team: string; grid: number }[];
    mostWinsDrivers: { driverId: string; name: string; wins: number }[];
    mostWinsTeams: { team: string; wins: number }[];
  };
  /**
   * This race's drivers and what each did at this circuit: from the event's
   * entry list once the FIA publishes it (so a stand-in shows up), else from
   * the latest race before this one.
   */
  grid: {
    fromRound: number;
    entryListUrl?: string;
    /** driverId is null for a driver Jolpica doesn't know yet (a first start) */
    drivers: { driverId: string | null; code: string; number: number; name: string; team: string; starts: number; best: { position: number; season: number } | null }[];
  } | null;
  /** The last race held here, when FastF1 covers it */
  lastRace: {
    season: number;
    round: number;
    qualifying: { position: number; driverId: string; code: string; name: string; team: string; time: string | null }[];
    podium: { position: number; driverId: string; code: string; name: string; team: string; grid: number }[];
    starters: number;
    retired: number;
    pitStops: number | null;
    /** From FastF1 race control; null when that load failed */
    safetyCars: number | null;
    virtualSafetyCars: number | null;
    redFlags: number | null;
  } | null;
  /** That race's pole lap (fastf1_helper track_profile); null until a load succeeds */
  track: TrackProfile | null;
  /** Set when a FastF1 load failed, so it is tried again later */
  fastf1FailedAt?: string;
}

export interface TrackProfile {
  year: number;
  round: number;
  driver: { code: string; name: string; team: string };
  lapTime: number | null;
  length: number;
  topSpeed: number;
  fullThrottle: number | null;
  heavyBraking: number;
  corners: { number: string; x: number; y: number; distance: number; minSpeed: number | null }[];
  rotation: number;
  trace: { d: number; s: number }[];
  outline: [number, number][];
}

const fileOf = (year: number, round: number) => path.join(GUIDES_DIR, `${year}-${round}.json`);

export function readGuide(year: number, round: number): GuideFile | null {
  try {
    const guide: GuideFile = JSON.parse(fs.readFileSync(fileOf(year, round), 'utf8'));
    return guide.version === GUIDE_VERSION ? guide : null;
  } catch {
    return null;
  }
}

function writeGuide(guide: GuideFile) {
  fs.mkdirSync(GUIDES_DIR, { recursive: true });
  const file = fileOf(guide.year, guide.round);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(guide, null, 2));
  fs.renameSync(`${file}.tmp`, file); // a crash mid-write leaves no half file
}

const nameOf = (d: { firstName: string; lastName: string }) => `${d.firstName} ${d.lastName}`;

function top<T>(counts: Map<string, T & { wins: number }>) {
  const list = [...counts.values()];
  const most = Math.max(0, ...list.map((c) => c.wins));
  return most ? list.filter((c) => c.wins === most) : [];
}

/** The latest round before `round` whose classification Jolpica has published. */
async function latestResults(year: number, round: number) {
  for (let r = round - 1; r >= 1; r--) {
    const results = await getRaceResults(year, r).catch(() => null);
    if (results) return results;
  }
  return null;
}

/** The latest entry list the FIA watcher stored for this race's weekend. */
function entryListDoc(year: number, race: ScheduleRace, races: ScheduleRace[]) {
  return storedFiaDocuments()
    .filter((d) => /entry list/i.test(d.title) && d.published.startsWith(String(year)) && targetRound(races, d.published) === race.round)
    .sort((a, b) => b.published.localeCompare(a.published))[0];
}

async function readEntryList(url: string): Promise<EntryListDriver[] | null> {
  return parseEntryList(await pdfText(await getPdf(url)));
}

export async function buildGuide(year: number, race: ScheduleRace, races: ScheduleRace[] = []): Promise<GuideFile> {
  const past = (await getCircuitRaceHistory(race.circuit.id)).filter((r: any) => r.season < year);
  assertNextRaceEnabled();
  const winners = past.map((r: any) => ({ race: r, win: r.results.find((x: any) => x.position === 1) })).filter((w: any) => w.win);

  const driverWins = new Map<string, { driverId: string; name: string; wins: number }>();
  const teamWins = new Map<string, { team: string; wins: number }>();
  for (const { win } of winners) {
    const d = driverWins.get(win.driver.id) ?? { driverId: win.driver.id, name: nameOf(win.driver), wins: 0 };
    d.wins++;
    driverWins.set(win.driver.id, d);
    const t = teamWins.get(win.constructor.name) ?? { team: win.constructor.name, wins: 0 };
    t.wins++;
    teamWins.set(win.constructor.name, t);
  }
  const last = past.at(-1);

  const latest = await latestResults(year, race.round);
  const entryDoc = entryListDoc(year, race, races);
  // An unreadable or unreachable entry list leaves the latest race's drivers in place
  const entries = entryDoc ? await readEntryList(entryDoc.url).catch((err) => {
    console.error(`[NextRace] entry list ${entryDoc.title}:`, err.message);
    return null;
  }) : null;
  assertNextRaceEnabled();

  const record = (match: (x: any) => boolean) => {
    const runs = past.flatMap((r: any) => r.results.filter(match).map((x: any) => ({ ...x, season: r.season })));
    const finished = runs.filter((x: any) => Number.isFinite(x.position));
    const best = finished.sort((a: any, b: any) => a.position - b.position || a.season - b.season)[0];
    return { starts: runs.length, best: best ? { position: best.position, season: best.season } : null };
  };
  const latestRows: any[] = latest?.results ?? [];
  let grid: GuideFile['grid'] = null;
  if (entries) {
    grid = {
      fromRound: latest?.round ?? 0,
      entryListUrl: entryDoc!.url,
      drivers: entries.map((car) => {
        // Known drivers by the latest race; a stand-in by their code in the circuit's history
        const known = latestRows.find((r) => r.driver.code === car.code)?.driver
          ?? past.flatMap((r: any) => r.results).find((x: any) => x.driver.code === car.code)?.driver;
        const team = latestRows.find((r) => r.driver.number === car.number)?.constructor.name ?? car.entrant;
        return {
          driverId: known?.id ?? null,
          code: car.code,
          number: car.number,
          name: known ? nameOf(known) : car.name,
          team,
          ...(known ? record((x) => x.driver.id === known.id) : { starts: 0, best: null }),
        };
      }),
    };
  } else if (latest) {
    grid = {
      fromRound: latest.round,
      drivers: latestRows.map((entry) => ({
        driverId: entry.driver.id,
        code: entry.driver.code,
        number: entry.driver.number,
        name: nameOf(entry.driver),
        team: entry.constructor.name,
        ...record((x) => x.driver.id === entry.driver.id),
      })),
    };
  }

  // The last race here with FastF1 data: its results, and its pole lap as the track profile
  const recent = last && last.season >= TELEMETRY_FROM ? last : null;
  let lastRace: GuideFile['lastRace'] = null;
  let track: TrackProfile | null = null;
  let fastf1FailedAt: string | undefined;
  const fastf1Failed = (what: string) => (err: Error) => {
    console.error(`[NextRace] ${what} ${recent!.season} R${recent!.round}:`, err.message);
    fastf1FailedAt = new Date().toISOString();
    return null;
  };
  if (recent) {
    const [quali, result, stops] = await Promise.all([
      getQualifyingResults(recent.season, recent.round).catch(() => null),
      getRaceResults(recent.season, recent.round).catch(() => null),
      getRawPitStops(recent.season, recent.round).catch(() => null),
    ]);
    assertNextRaceEnabled();
    const extras: any = await getTimelineExtras(recent.season, recent.round).catch(fastf1Failed('race control'));
    const flags = (type: string, deployedOnly: boolean) => extras
      ? extras.raceControl.filter((e: any) => e.type === type && (!deployedOnly || /DEPLOYED/i.test(e.msg))).length
      : null;
    assertNextRaceEnabled();
    const rows = result?.results ?? [];
    lastRace = {
      season: recent.season,
      round: recent.round,
      qualifying: (quali?.results ?? []).slice(0, 5).map((q: any) => ({
        position: q.position, driverId: q.driver.id, code: q.driver.code, name: nameOf(q.driver),
        team: q.constructor.name, time: q.q3 || q.q2 || q.q1,
      })),
      podium: rows.filter((r: any) => ['1', '2', '3'].includes(r.positionText)).map((r: any) => ({
        position: Number(r.positionText), driverId: r.driver.id, code: r.driver.code, name: nameOf(r.driver),
        team: r.constructor.name, grid: r.grid,
      })),
      starters: rows.length,
      // Classified finishers carry a number; R, D, W and the like mean out of the race
      retired: rows.filter((r: any) => !/^\d+$/.test(r.positionText)).length,
      pitStops: stops ? stops.length : null,
      safetyCars: flags('safetyCar', true),
      virtualSafetyCars: flags('vsc', true),
      redFlags: flags('redFlag', false),
    };
    track = await getTrackProfile(recent.season, recent.round).catch(fastf1Failed('track profile'));
  }

  return {
    version: GUIDE_VERSION,
    builtAt: new Date().toISOString(),
    year,
    round: race.round,
    circuitId: race.circuit.id,
    history: {
      seasons: [...new Set(past.map((r: any) => r.season as number))],
      races: past.length,
      poleWins: winners.filter((w: any) => w.win.grid === 1).length,
      lastHeld: last?.season ?? null,
      lastLaps: last ? Math.max(...last.results.map((x: any) => x.laps)) : null,
      recentWinners: winners.slice(-5).reverse().map(({ race: r, win }: any) => ({
        season: r.season, driverId: win.driver.id, code: win.driver.code, name: nameOf(win.driver), team: win.constructor.name, grid: win.grid,
      })),
      mostWinsDrivers: top(driverWins),
      mostWinsTeams: top(teamWins),
    },
    grid,
    lastRace,
    track,
    ...(fastf1FailedAt && { fastf1FailedAt }),
  };
}

/**
 * A guide is stale when missing, when its race's entry list came out since,
 * or when a newer race than its grid came from has results.
 */
async function needsBuild(year: number, race: ScheduleRace, races: ScheduleRace[]) {
  const guide = readGuide(year, race.round);
  if (!guide) return true;
  if (guide.fastf1FailedAt && Date.now() - Date.parse(guide.fastf1FailedAt) > FASTF1_RETRY_MS) return true;
  const entryDoc = entryListDoc(year, race, races);
  if (entryDoc && guide.grid?.entryListUrl !== entryDoc.url) return true;
  if (guide.grid?.entryListUrl) return false; // the weekend's own list beats the previous race's classification
  const expected = race.round - 1;
  if (!guide.grid || guide.grid.fromRound < expected) {
    return Boolean(expected >= 1 && await getRaceResults(year, expected).catch(() => null));
  }
  return false;
}

let lastBuild: string | null = null;
let lastError: string | null = null;
export const guideBuilderStatus = () => ({ lastBuild, lastError });

let building = false;

/** Builds the guide's race and the one after it when they are missing or stale. */
export async function refreshGuides(now = Date.now()) {
  if (building || !nextRaceEnabled()) return;
  building = true;
  try {
    const year = new Date(now).getUTCFullYear();
    const { races } = await getSeasonSchedule(year);
    const current = guideRace(races, now);
    const targets = current ? races.filter((r: ScheduleRace) => r.round === current.round || r.round === current.round + 1) : [];
    for (const race of targets) {
      assertNextRaceEnabled();
      if (!(await needsBuild(year, race, races))) continue;
      writeGuide(await buildGuide(year, race, races));
      lastBuild = new Date().toISOString();
      console.log(`[NextRace] guide built: ${year} R${race.round} ${race.raceName}`);
    }
    lastError = null;
  } catch (err: any) {
    if (err instanceof NextRaceDisabledError) {
      console.log('[NextRace] build stopped: switched off');
    } else {
      lastError = err.message;
      console.error('[NextRace] guide build failed:', err.message); // the next hourly check tries again
    }
  } finally {
    building = false;
  }
}

let timer: NodeJS.Timeout | undefined;

function schedule() {
  clearTimeout(timer);
  timer = undefined;
  if (!nextRaceEnabled()) return;
  refreshGuides();
  timer = setTimeout(schedule, CHECK_EVERY_MS);
}

export function startGuideBuilder() {
  onNextRaceToggle(schedule); // on: build now and hourly; off: the timer goes
  // A new entry list rebuilds at once rather than on the next hourly check. Not
  // awaited: the watcher stores the document right after its listeners return,
  // and refreshGuides only reads the store after its first await.
  onFiaDocument(async (doc) => {
    if (/entry list/i.test(doc.title)) refreshGuides();
  });
  schedule();
}
