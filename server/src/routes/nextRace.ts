import { Router, type Request, type Response, type NextFunction } from 'express';
import { getConstructorStandings, getDriverStandings, getSeasonSchedule } from '../services/jolpicaService';
import {
  canClinchAt, circuitNotices, gridPenaltiesFor, guidePhase, guideRace, remainingMax, reprimandCounts,
  sessionsOf, startOf, SWITCH_AFTER_MS, type DatedDecision, type ScheduleRace,
} from '../services/guideRules';
import { readGuide, type GuideFile } from '../services/guideBuilder';
import { decisionEntries, seasonCaughtUp } from '../services/stewardDecisions';
import { fiaLastChecked, storedFiaDocuments } from '../services/fiaService';
import { nextRaceEnabled } from '../services/nextRaceSettings';
import { sendRouteError } from '../utils/errorResponse';

// The next-race guide: objective facts about the coming Grand Prix, assembled
// per request from the schedule, the standings before it, the stored
// decisions and the guide file built ahead of time. /api/next-race follows the
// calendar; /api/next-race/:year/:round stays on one race, and its content
// stops changing at lights out.

const router = Router();

// Switched off, the guide doesn't exist
router.use((_req: Request, res: Response, next: NextFunction) => {
  if (!nextRaceEnabled()) {
    res.status(404).json({ error: 'disabled' });
    return;
  }
  next();
});

const TOP = 5;

async function standingsBefore(year: number, round: number, races: ScheduleRace[]) {
  if (round <= 1) return null; // nothing scored yet
  const [drivers, teams] = await Promise.all([
    getDriverStandings(year, round - 1),
    getConstructorStandings(year, round - 1),
  ]);
  if (!drivers.standings.length) return null;
  const driverGap = drivers.standings[0].points - (drivers.standings[1]?.points ?? 0);
  const teamGap = teams.standings.length ? teams.standings[0].points - (teams.standings[1]?.points ?? 0) : 0;
  return {
    afterRound: round - 1,
    drivers: drivers.standings.slice(0, TOP).map((s: any) => ({
      position: s.position,
      driverId: s.driver.id,
      code: s.driver.code,
      name: `${s.driver.firstName} ${s.driver.lastName}`,
      team: s.constructor.name,
      points: s.points,
      gap: s.points - drivers.standings[0].points,
    })),
    constructors: teams.standings.slice(0, TOP).map((s: any) => ({
      position: s.position,
      team: s.constructor.name,
      points: s.points,
      gap: s.points - teams.standings[0].points,
    })),
    remaining: remainingMax(races, round, year),
    canClinch: {
      driver: canClinchAt(driverGap, races, round, year, 'driver'),
      constructor: teams.standings.length ? canClinchAt(teamGap, races, round, year, 'constructor') : false,
    },
  };
}

function penalties(year: number, race: ScheduleRace, races: ScheduleRace[], guide: GuideFile | null) {
  const decisions: DatedDecision[] = decisionEntries()
    .filter((e) => e.status === 'parsed' && e.decision && e.published.startsWith(String(year)))
    .map((e) => ({ url: e.url, event: e.event, published: e.published, decision: e.decision! }));
  // Decisions name a car; the latest race's entry list says who drove it and for whom
  const byNumber = new Map((guide?.grid?.drivers ?? []).map((d) => [d.number, d]));
  const who = (car?: number) => {
    const d = car === undefined ? undefined : byNumber.get(car);
    return d ? { driverId: d.driverId, code: d.code, team: d.team } : {};
  };
  // Decisions the documents page summarized can link there instead of only to the PDF
  const summarized = new Set(storedFiaDocuments().filter((d) => d.summary).map((d) => d.url));
  const shape = (d: DatedDecision) => ({
    url: d.url,
    event: d.event,
    published: d.published,
    doc: d.decision.doc ?? null,
    car: d.decision.car ?? null,
    driver: d.decision.driver ?? null,
    ...who(d.decision.car),
    session: d.decision.session ?? null,
    fact: d.decision.fact ?? null,
    gridDrop: d.decision.gridDrop ?? null,
    pitLaneStart: d.decision.pitLaneStart ?? false,
    summarized: summarized.has(d.url),
  });
  const { carried, weekend } = gridPenaltiesFor(races, race.round, decisions);
  return {
    checkedAt: fiaLastChecked(),
    carried: carried.map(shape),
    weekend: weekend.map(shape),
    // Counts need the whole season read; until then they would undercount
    reprimands: seasonCaughtUp(year)
      ? reprimandCounts(decisions, year, startOf(race)).map((r) => ({ ...r, ...who(r.car) }))
      : null,
  };
}

async function guideFor(year: number, round: number, now: number) {
  const { races } = await getSeasonSchedule(year);
  const race: ScheduleRace | undefined = races.find((r: ScheduleRace) => r.round === round);
  if (!race) return null;
  const guide = readGuide(year, round);
  const lastHeld = guide?.history.lastHeld ?? null;
  return {
    year,
    round,
    totalRounds: races.length,
    raceName: race.raceName,
    circuit: race.circuit,
    sessions: sessionsOf(race).map((s) => ({ key: s.key, start: new Date(s.start).toISOString(), timeKnown: s.timeKnown })),
    raceStart: new Date(startOf(race)).toISOString(),
    switchesAt: new Date(startOf(race) + SWITCH_AFTER_MS).toISOString(),
    phase: guidePhase(race, now),
    championship: await standingsBefore(year, round, races),
    penalties: penalties(year, race, races, guide),
    // Built in the background; null means "being prepared"
    notices: guide ? { ...circuitNotices(guide.history.seasons, year), lastLaps: lastHeld ? guide.history.lastLaps : null } : null,
    history: guide?.history ?? null,
    grid: guide?.grid ?? null,
  };
}

router.get('/', async (_req, res) => {
  try {
    const now = Date.now();
    const year = new Date(now).getUTCFullYear();
    const { races } = await getSeasonSchedule(year);
    const race = guideRace(races, now);
    if (!race) {
      res.json({ seasonOver: true, year });
      return;
    }
    res.json(await guideFor(year, race.round, now));
  } catch (err) {
    sendRouteError(res, err, '다음 경기 정보를 불러오지 못했습니다');
  }
});

router.get('/:year/:round', async (req, res) => {
  const year = Number(req.params.year);
  const round = Number(req.params.round);
  if (!Number.isInteger(year) || !Number.isInteger(round)) {
    res.status(400).json({ error: 'year and round must be numbers' });
    return;
  }
  try {
    const guide = await guideFor(year, round, Date.now());
    if (!guide) {
      res.status(404).json({ error: 'no such race' });
      return;
    }
    res.json(guide);
  } catch (err) {
    sendRouteError(res, err, '다음 경기 정보를 불러오지 못했습니다');
  }
});

export default router;
