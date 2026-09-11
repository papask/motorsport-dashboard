import axios from 'axios';
import NodeCache from 'node-cache';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1';
const cache = new NodeCache({ stdTTL: 300 }); // 5분 캐시
const inFlightRequests = new Map<string, Promise<unknown>>();

const JOLPICA_BURST_INTERVAL_MS = getPositiveEnvNumber('JOLPICA_BURST_INTERVAL_MS', 260);
const JOLPICA_SUSTAINED_LIMIT = getPositiveEnvNumber('JOLPICA_SUSTAINED_LIMIT', 500);
const JOLPICA_SUSTAINED_WINDOW_MS = getPositiveEnvNumber('JOLPICA_SUSTAINED_WINDOW_MS', 60 * 60 * 1000);
const JOLPICA_MAX_QUEUE_WAIT_MS = getPositiveEnvNumber('JOLPICA_MAX_QUEUE_WAIT_MS', 110 * 1000);
const JOLPICA_MAX_RETRIES = getPositiveEnvNumber('JOLPICA_MAX_RETRIES', 2);

let rateLimitQueue: Promise<void> = Promise.resolve();
let nextBurstSlotAt = 0;
const requestWindow: number[] = [];

class JolpicaRateLimitError extends Error {
  statusCode = 429;
  retryAfterSeconds: number;

  constructor(waitMs: number) {
    const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));
    super(`Jolpica 요청 제한 보호 중입니다. 잠시 후 다시 시도해주세요. 예상 대기 시간: ${retryAfterSeconds}초`);
    this.name = 'JolpicaRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getPositiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneRequestWindow(now: number) {
  while (requestWindow.length > 0 && now - requestWindow[0] >= JOLPICA_SUSTAINED_WINDOW_MS) {
    requestWindow.shift();
  }
}

function sustainedLimitWait(now: number) {
  pruneRequestWindow(now);
  if (requestWindow.length < JOLPICA_SUSTAINED_LIMIT) return 0;
  return Math.max(0, requestWindow[0] + JOLPICA_SUSTAINED_WINDOW_MS - now);
}

async function waitForJolpicaSlot() {
  const slot = rateLimitQueue.then(async () => {
    const now = Date.now();
    const burstWait = Math.max(0, nextBurstSlotAt - now);
    const sustainedWait = sustainedLimitWait(now);
    const waitMs = Math.max(burstWait, sustainedWait);

    if (waitMs > JOLPICA_MAX_QUEUE_WAIT_MS) {
      throw new JolpicaRateLimitError(waitMs);
    }

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const requestAt = Date.now();
    pruneRequestWindow(requestAt);
    requestWindow.push(requestAt);
    nextBurstSlotAt = requestAt + JOLPICA_BURST_INTERVAL_MS;
  });

  rateLimitQueue = slot.catch(() => undefined);
  return slot;
}

function parseRetryAfterMs(headers: any) {
  const rawValue = headers?.['retry-after'];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const retryAt = Date.parse(value);
  if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());

  return null;
}

async function limitedGet<T>(url: string, attempt = 0): Promise<T> {
  await waitForJolpicaSlot();

  try {
    const response = await axios.get<T>(url, { timeout: 10000 });
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 429) {
      const retryAfterMs = parseRetryAfterMs(error.response.headers) ?? Math.min(60_000, 1000 * 2 ** attempt);
      if (attempt >= JOLPICA_MAX_RETRIES) {
        throw new JolpicaRateLimitError(retryAfterMs);
      }

      if (retryAfterMs > JOLPICA_MAX_QUEUE_WAIT_MS) {
        throw new JolpicaRateLimitError(retryAfterMs);
      }

      await sleep(retryAfterMs);
      return limitedGet<T>(url, attempt + 1);
    }

    throw error;
  }
}

async function cachedGet<T>(url: string): Promise<T> {
  const cached = cache.get<T>(url);
  if (cached !== undefined) return cached;

  const inFlight = inFlightRequests.get(url) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  const request = limitedGet<T>(url)
    .then((data) => {
      cache.set(url, data);
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(url);
    });

  inFlightRequests.set(url, request);
  return request;
}

export async function getDriverStandings(year: string | number, round?: string | number) {
  const url = round ? `${BASE_URL}/${year}/${round}/driverstandings/` : `${BASE_URL}/${year}/driverstandings/`;
  const data: any = await cachedGet(url);
  const standingsList = data?.MRData?.StandingsTable?.StandingsLists?.[0];
  if (!standingsList) return { season: year, round: undefined, standings: [] };

  const result = {
    season: standingsList.season,
    round: standingsList.round,
    standings: standingsList.DriverStandings.map((s: any, i: number) => ({
      // Ergast occasionally omits `position` for the last 0-point driver; the
      // list is already in standings order, so fall back to the list index.
      position: parseInt(s.position) || (i + 1),
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
      driver: {
        id: s.Driver.driverId,
        number: s.Driver.permanentNumber,
        code: s.Driver.code,
        firstName: s.Driver.givenName,
        lastName: s.Driver.familyName,
        nationality: s.Driver.nationality,
      },
      constructor: {
        id: s.Constructors[0]?.constructorId,
        name: s.Constructors[0]?.name,
        nationality: s.Constructors[0]?.nationality,
      },
    })),
  };

  // For the latest standings (no explicit round), annotate each entry with its
  // rank change vs the previous round so callers can show movement arrows.
  if (!round) {
    await annotateDriverPositionDelta(year, result);
  }

  return result;
}

// Adds `positionDelta` (previous round position - current) to each standing.
// null = driver was not in the previous round (or it's round 1).
async function annotateDriverPositionDelta(year: string | number, result: any) {
  const currentRound = parseInt(String(result.round || '0'));
  const prevById: Record<string, number> = {};
  if (currentRound > 1) {
    const prev = await getDriverStandings(year, currentRound - 1).catch(() => null);
    for (const s of prev?.standings || []) prevById[s.driver.id] = s.position;
  }
  for (const s of result.standings) {
    const prevPos = prevById[s.driver.id];
    s.positionDelta = prevPos != null ? prevPos - s.position : null;
  }
}

export async function getConstructorStandings(year: string | number, round?: string | number) {
  const url = round ? `${BASE_URL}/${year}/${round}/constructorstandings/` : `${BASE_URL}/${year}/constructorstandings/`;
  const data: any = await cachedGet(url);
  const standingsList = data?.MRData?.StandingsTable?.StandingsLists?.[0];
  if (!standingsList) return { season: year, round: undefined, standings: [] };

  return {
    season: standingsList.season,
    round: standingsList.round,
    standings: standingsList.ConstructorStandings.map((s: any, i: number) => ({
      position: parseInt(s.position) || (i + 1),
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
      constructor: {
        id: s.Constructor.constructorId,
        name: s.Constructor.name,
        nationality: s.Constructor.nationality,
        url: s.Constructor.url,
      },
    })),
  };
}

// Championship standings enriched with per-round history and this-round point
// breakdown (previous total, race points, sprint points, position change).
export async function getDriverStandingsHistory(year: string | number) {
  const current = await getDriverStandings(year);
  const latest = parseInt(String(current.round || '0'));
  if (!latest) return { season: current.season, round: 0, hasSprint: false, standings: [], history: [] };

  const perRound = await Promise.all(
    Array.from({ length: latest }, (_, i) => getDriverStandings(year, i + 1).catch(() => null))
  );

  const [raceRes, sprintRes] = await Promise.all([
    getRaceResults(year, latest).catch(() => null),
    getSprintResults(year, latest).catch(() => null),
  ]);
  const racePointsById: Record<string, number> = {};
  for (const r of raceRes?.results || []) racePointsById[r.driver.id] = r.points;
  const sprintPointsById: Record<string, number> = {};
  for (const r of sprintRes?.results || []) sprintPointsById[r.driver.id] = r.points;

  const prev = perRound[latest - 2];
  const prevById: Record<string, any> = {};
  for (const s of prev?.standings || []) prevById[s.driver.id] = s;

  const standings = current.standings.map((s: any) => {
    const prevEntry = prevById[s.driver.id];
    return {
      ...s,
      prevPoints: prevEntry ? prevEntry.points : 0,
      racePoints: racePointsById[s.driver.id] || 0,
      sprintPoints: sprintPointsById[s.driver.id] || 0,
      positionDelta: prevEntry ? prevEntry.position - s.position : null,
    };
  });

  const history = perRound
    .filter((pr: any) => pr && pr.standings)
    .map((pr: any) => ({
      round: parseInt(String(pr.round)),
      standings: pr.standings.map((s: any) => ({ id: s.driver.id, code: s.driver.code, position: s.position, points: s.points })),
    }));

  return { season: current.season, round: latest, hasSprint: !!sprintRes, standings, history };
}

export async function getConstructorStandingsHistory(year: string | number) {
  const current = await getConstructorStandings(year);
  const latest = parseInt(String(current.round || '0'));
  if (!latest) return { season: current.season, round: 0, hasSprint: false, standings: [], history: [] };

  const perRound = await Promise.all(
    Array.from({ length: latest }, (_, i) => getConstructorStandings(year, i + 1).catch(() => null))
  );

  const [raceRes, sprintRes] = await Promise.all([
    getRaceResults(year, latest).catch(() => null),
    getSprintResults(year, latest).catch(() => null),
  ]);
  // Constructor points per session = sum of its drivers' points
  const racePointsById: Record<string, number> = {};
  for (const r of raceRes?.results || []) racePointsById[r.constructor.id] = (racePointsById[r.constructor.id] || 0) + r.points;
  const sprintPointsById: Record<string, number> = {};
  for (const r of sprintRes?.results || []) sprintPointsById[r.constructor.id] = (sprintPointsById[r.constructor.id] || 0) + r.points;

  const prev = perRound[latest - 2];
  const prevById: Record<string, any> = {};
  for (const s of prev?.standings || []) prevById[s.constructor.id] = s;

  const standings = current.standings.map((s: any) => {
    const prevEntry = prevById[s.constructor.id];
    return {
      ...s,
      prevPoints: prevEntry ? prevEntry.points : 0,
      racePoints: racePointsById[s.constructor.id] || 0,
      sprintPoints: sprintPointsById[s.constructor.id] || 0,
      positionDelta: prevEntry ? prevEntry.position - s.position : null,
    };
  });

  const history = perRound
    .filter((pr: any) => pr && pr.standings)
    .map((pr: any) => ({
      round: parseInt(String(pr.round)),
      standings: pr.standings.map((s: any) => ({ id: s.constructor.id, code: s.constructor.name, position: s.position, points: s.points })),
    }));

  return { season: current.season, round: latest, hasSprint: !!sprintRes, standings, history };
}

export async function getSeasonSchedule(year: string | number) {
  const url = `${BASE_URL}/${year}/`;
  const data: any = await cachedGet(url);
  const races = data?.MRData?.RaceTable?.Races || [];

  return {
    season: year,
    races: races.map((r: any) => ({
      round: parseInt(r.round),
      raceName: r.raceName,
      circuit: {
        id: r.Circuit.circuitId,
        name: r.Circuit.circuitName,
        locality: r.Circuit.Location.locality,
        country: r.Circuit.Location.country,
        lat: parseFloat(r.Circuit.Location.lat),
        lng: parseFloat(r.Circuit.Location.long),
      },
      date: r.date,
      time: r.time,
      firstPractice: r.FirstPractice,
      secondPractice: r.SecondPractice,
      thirdPractice: r.ThirdPractice,
      qualifying: r.Qualifying,
      sprint: r.Sprint,
      sprintQualifying: r.SprintQualifying,
    })),
  };
}

export async function getRaceResults(year: string | number, round: string | number) {
  const url = `${BASE_URL}/${year}/${round}/results/`;
  const data: any = await cachedGet(url);
  const race = data?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;

  return {
    season: race.season,
    round: parseInt(race.round),
    raceName: race.raceName,
    circuit: {
      id: race.Circuit.circuitId,
      name: race.Circuit.circuitName,
      locality: race.Circuit.Location.locality,
      country: race.Circuit.Location.country,
    },
    date: race.date,
    time: race.time,
    results: race.Results.map((r: any) => ({
      position: r.position,
      positionText: r.positionText,
      points: parseFloat(r.points),
      driver: {
        id: r.Driver.driverId,
        number: parseInt(r.number),
        code: r.Driver.code,
        firstName: r.Driver.givenName,
        lastName: r.Driver.familyName,
      },
      constructor: {
        id: r.Constructor.constructorId,
        name: r.Constructor.name,
      },
      grid: parseInt(r.grid),
      laps: parseInt(r.laps),
      status: r.status,
      time: r.Time?.time || null,
      fastestLap: r.FastestLap ? {
        rank: parseInt(r.FastestLap.rank),
        lap: parseInt(r.FastestLap.lap),
        time: r.FastestLap.Time?.time,
        averageSpeed: r.FastestLap.AverageSpeed?.speed,
      } : null,
    })),
  };
}

export async function getQualifyingResults(year: string | number, round: string | number) {
  const url = `${BASE_URL}/${year}/${round}/qualifying/`;
  const data: any = await cachedGet(url);
  const race = data?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;

  return {
    season: race.season,
    round: parseInt(race.round),
    raceName: race.raceName,
    circuit: {
      id: race.Circuit.circuitId,
      name: race.Circuit.circuitName,
      locality: race.Circuit.Location.locality,
      country: race.Circuit.Location.country,
    },
    date: race.date,
    results: (race.QualifyingResults || []).map((q: any) => ({
      position: parseInt(q.position),
      driver: {
        id: q.Driver.driverId,
        number: parseInt(q.Driver.permanentNumber),
        code: q.Driver.code,
        firstName: q.Driver.givenName,
        lastName: q.Driver.familyName,
      },
      constructor: {
        id: q.Constructor.constructorId,
        name: q.Constructor.name,
      },
      q1: q.Q1 || null,
      q2: q.Q2 || null,
      q3: q.Q3 || null,
    })),
  };
}

export async function getSprintResults(year: string | number, round: string | number) {
  const url = `${BASE_URL}/${year}/${round}/sprint/`;
  const data: any = await cachedGet(url);
  const race = data?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;

  return {
    season: race.season,
    round: parseInt(race.round),
    raceName: race.raceName,
    circuit: {
      id: race.Circuit.circuitId,
      name: race.Circuit.circuitName,
      locality: race.Circuit.Location.locality,
      country: race.Circuit.Location.country,
    },
    date: race.date,
    results: (race.SprintResults || []).map((r: any) => ({
      position: r.position,
      positionText: r.positionText,
      points: parseFloat(r.points),
      driver: {
        id: r.Driver.driverId,
        number: parseInt(r.number),
        code: r.Driver.code,
        firstName: r.Driver.givenName,
        lastName: r.Driver.familyName,
      },
      constructor: {
        id: r.Constructor.constructorId,
        name: r.Constructor.name,
      },
      grid: parseInt(r.grid),
      laps: parseInt(r.laps),
      status: r.status,
      time: r.Time?.time || null,
    })),
  };
}

export async function getLastRaceResults() {
  const url = `${BASE_URL}/current/last/results/`;
  const data: any = await cachedGet(url);
  const race = data?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;

  return {
    season: race.season,
    round: parseInt(race.round),
    raceName: race.raceName,
    date: race.date,
    results: race.Results.slice(0, 10).map((r: any) => ({
      position: r.position,
      points: parseFloat(r.points),
      driver: {
        number: parseInt(r.number),
        code: r.Driver.code,
        firstName: r.Driver.givenName,
        lastName: r.Driver.familyName,
      },
      constructor: {
        name: r.Constructor.name,
      },
      time: r.Time?.time || r.status,
    })),
  };
}

export async function getRawLapTimings(year: string | number, round: string | number) {
  const url = `${BASE_URL}/${year}/${round}/laps.json?limit=100&offset=0`;
  const firstPage: any = await cachedGet(url);
  const total = parseInt(firstPage?.MRData?.total || '0');
  if (total <= 100) {
    return firstPage?.MRData?.RaceTable?.Races?.[0]?.Laps || [];
  }

  const allLaps: any[] = [];
  const races = firstPage?.MRData?.RaceTable?.Races;
  if (races && races[0] && races[0].Laps) {
    // Deep clone timings array to prevent mutating cached objects
    for (const lap of races[0].Laps) {
      allLaps.push({
        number: lap.number,
        Timings: [...lap.Timings]
      });
    }
  }

  const promises: Promise<any>[] = [];
  for (let offset = 100; offset < total; offset += 100) {
    const pageUrl = `${BASE_URL}/${year}/${round}/laps.json?limit=100&offset=${offset}`;
    promises.push(cachedGet(pageUrl));
  }

  const pages = await Promise.all(promises);
  for (const page of pages) {
    const pageLaps = page?.MRData?.RaceTable?.Races?.[0]?.Laps || [];
    for (const lap of pageLaps) {
      const existingLap = allLaps.find(l => l.number === lap.number);
      if (existingLap) {
        existingLap.Timings.push(...lap.Timings);
      } else {
        allLaps.push({
          number: lap.number,
          Timings: [...lap.Timings]
        });
      }
    }
  }

  return allLaps;
}

export async function getRawPitStops(year: string | number, round: string | number) {
  const url = `${BASE_URL}/${year}/${round}/pitstops.json?limit=100&offset=0`;
  const firstPage: any = await cachedGet(url);
  const total = parseInt(firstPage?.MRData?.total || '0');
  if (total <= 100) {
    return firstPage?.MRData?.RaceTable?.Races?.[0]?.PitStops || [];
  }

  const allPitStops: any[] = [];
  const races = firstPage?.MRData?.RaceTable?.Races;
  if (races && races[0] && races[0].PitStops) {
    allPitStops.push(...races[0].PitStops);
  }

  const promises: Promise<any>[] = [];
  for (let offset = 100; offset < total; offset += 100) {
    const pageUrl = `${BASE_URL}/${year}/${round}/pitstops.json?limit=100&offset=${offset}`;
    promises.push(cachedGet(pageUrl));
  }

  const pages = await Promise.all(promises);
  for (const page of pages) {
    const pagePitStops = page?.MRData?.RaceTable?.Races?.[0]?.PitStops || [];
    allPitStops.push(...pagePitStops);
  }

  return allPitStops;
}
