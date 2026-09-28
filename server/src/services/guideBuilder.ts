import fs from 'fs';
import path from 'path';
import { getCircuitRaceHistory, getRaceResults, getSeasonSchedule } from './jolpicaService';
import { guideRace, type ScheduleRace } from './guideRules';
import { assertNextRaceEnabled, nextRaceEnabled, NextRaceDisabledError, onNextRaceToggle } from './nextRaceSettings';

// Builds the slow parts of a next-race guide ahead of time: the circuit's race
// history and what the current drivers have done there. Five or so Jolpica
// pages per circuit, so it runs in the background (hourly, and when switched
// on) for the guide's race and the one after, and the page only reads the file.

const GUIDES_DIR = path.join(process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data'), 'guides');
const CHECK_EVERY_MS = 60 * 60 * 1000;
// Bump when the file's shape changes; older files are rebuilt on the next check
const GUIDE_VERSION = 1;

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
  /** The drivers of the latest race before this one, and what each did at this circuit */
  grid: {
    fromRound: number;
    drivers: { driverId: string; code: string; number: number; name: string; team: string; starts: number; best: { position: number; season: number } | null }[];
  } | null;
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

export async function buildGuide(year: number, race: ScheduleRace): Promise<GuideFile> {
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
  assertNextRaceEnabled();
  const grid = latest && {
    fromRound: latest.round,
    drivers: latest.results.map((entry: any) => {
      const runs = past.flatMap((r: any) => r.results.filter((x: any) => x.driver.id === entry.driver.id).map((x: any) => ({ ...x, season: r.season })));
      const finished = runs.filter((x: any) => Number.isFinite(x.position));
      const best = finished.sort((a: any, b: any) => a.position - b.position || a.season - b.season)[0];
      return {
        driverId: entry.driver.id,
        code: entry.driver.code,
        number: entry.driver.number,
        name: nameOf(entry.driver),
        team: entry.constructor.name,
        starts: runs.length,
        best: best ? { position: best.position, season: best.season } : null,
      };
    }),
  };

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
  };
}

/** A guide is stale when missing, or when a newer race than its grid came from has results. */
async function needsBuild(year: number, race: ScheduleRace) {
  const guide = readGuide(year, race.round);
  if (!guide) return true;
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
      if (!(await needsBuild(year, race))) continue;
      writeGuide(await buildGuide(year, race));
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
  schedule();
}
