import axios from 'axios';
import NodeCache from 'node-cache';

const BASE_URL = 'https://api.jolpi.ca/ergast/f1';
const cache = new NodeCache({ stdTTL: 300 }); // 5분 캐시

async function cachedGet<T>(url: string): Promise<T> {
  const cached = cache.get<T>(url);
  if (cached) return cached;

  const response = await axios.get<T>(url, { timeout: 10000 });
  cache.set(url, response.data);
  return response.data;
}

export async function getDriverStandings(year: string | number) {
  const url = `${BASE_URL}/${year}/driverstandings/`;
  const data: any = await cachedGet(url);
  const standingsList = data?.MRData?.StandingsTable?.StandingsLists?.[0];
  if (!standingsList) return { season: year, standings: [] };

  return {
    season: standingsList.season,
    round: standingsList.round,
    standings: standingsList.DriverStandings.map((s: any) => ({
      position: parseInt(s.position),
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
}

export async function getConstructorStandings(year: string | number) {
  const url = `${BASE_URL}/${year}/constructorstandings/`;
  const data: any = await cachedGet(url);
  const standingsList = data?.MRData?.StandingsTable?.StandingsLists?.[0];
  if (!standingsList) return { season: year, standings: [] };

  return {
    season: standingsList.season,
    round: standingsList.round,
    standings: standingsList.ConstructorStandings.map((s: any) => ({
      position: parseInt(s.position),
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


