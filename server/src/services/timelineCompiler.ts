import { getRaceResults, getRawLapTimings, getRawPitStops } from './jolpicaService';

// Simulated playback timing — one lap maps to this many ms on the replay clock.
const LAP_DURATION_MS = 90000; // 90 seconds per lap

interface TimelineDriver {
  driverNumber: number;
  driverId: string;
  broadcastName: string;
  fullName: string;
  nameAcronym: string;
  teamName: string;
  teamColour: string;
  countryCode: string;
  headshotUrl: string;
  status: string;
  dnf: boolean;
  finishPosition: number;
}

export async function getCompiledRaceTimeline(year: string | number, round: string | number) {
  let raceResults;
  try {
    raceResults = await getRaceResults(year, round);
  } catch (err: any) {
    if (err.response && err.response.status === 404) {
      return null;
    }
    throw err;
  }
  if (!raceResults) return null;

  const rawLaps = await getRawLapTimings(year, round).catch((err) => {
    console.warn(`[TimelineCompiler] Failed to fetch raw laps for ${year}/${round}:`, err.message);
    return [];
  });
  const rawPitStops = await getRawPitStops(year, round).catch((err) => {
    console.warn(`[TimelineCompiler] Failed to fetch raw pit stops for ${year}/${round}:`, err.message);
    return [];
  });

  const results = raceResults.results;
  const driverMap: Record<number, TimelineDriver> = {};
  const driverIdToNumber: Record<string, number> = {};

  // Pre-defined fallback team colors (matching common F1 teams)
  const teamColorMap: Record<string, string> = {
    'red_bull': '4781D7',
    'mercedes': '00D7B6',
    'ferrari': 'ED1131',
    'mclaren': 'F47600',
    'aston_martin': '229971',
    'alpine': '00A1E8',
    'williams': '1868DB',
    'haas': '9C9FA2',
    'sauber': 'F50537',
    'kick_sauber': 'F50537',
    'rb': '6C98FF',
    'racing_bulls': '6C98FF'
  };

  for (const r of results) {
    const dNum = r.driver.number;
    if (isNaN(dNum)) continue;
    driverIdToNumber[r.driver.id] = dNum;

    const constructorId = r.constructor.id;
    const teamColour = teamColorMap[constructorId] || '888888';

    // DNF: judge by `status`, not positionText. A retired car can still be
    // *classified* with a numeric position (e.g. it completed ≥90% distance),
    // so positionText alone misses those. A car reached the flag only if its
    // status is 'Finished' or a lapped classification ('Lapped' / '+N Lap(s)').
    const status = String(r.status || '');
    const reachedFlag = /^finished$/i.test(status) || /lap/i.test(status);
    // Official post-race classification position (Ergast `position`), numeric for
    // every classified car incl. DNFs (e.g. 20/21/22). The chart settles each line
    // here at the final lap so the right edge reads as the real final standings.
    const finishPos = parseInt(String(r.position), 10);
    driverMap[dNum] = {
      driverNumber: dNum,
      driverId: r.driver.id,
      broadcastName: r.driver.code,
      fullName: `${r.driver.firstName} ${r.driver.lastName}`,
      nameAcronym: r.driver.code,
      teamName: r.constructor.name,
      teamColour: teamColour,
      countryCode: '',
      headshotUrl: '',
      status,
      dnf: !reachedFlag,
      finishPosition: Number.isFinite(finishPos) ? finishPos : 99
    };
  }

  const timeline: any[] = [];
  const sortedLaps: number[] = [];

  // Build Lap 0 (Starting Grid positions)
  const lap0Data: any = { lap: 0 };
  for (const r of results) {
    const dNum = r.driver.number;
    if (!isNaN(dNum)) {
      lap0Data[`d${dNum}`] = r.grid;
    }
  }
  timeline.push(lap0Data);

  // Build Laps 1 to N
  for (const lap of rawLaps) {
    const lapNum = parseInt(lap.number);
    sortedLaps.push(lapNum);

    const lapData: any = { lap: lapNum };
    for (const timing of lap.Timings) {
      const dNum = driverIdToNumber[timing.driverId];
      if (dNum) {
        lapData[`d${dNum}`] = parseInt(timing.position);
      }
    }
    timeline.push(lapData);
  }

  // Build Pit Stops mapping
  const pitEvents: Record<number, any[]> = {};
  for (const pit of rawPitStops) {
    const lapNum = parseInt(pit.lap);
    const dNum = driverIdToNumber[pit.driverId];
    if (dNum) {
      if (!pitEvents[lapNum]) pitEvents[lapNum] = [];
      
      let durationSec = 0;
      if (pit.duration) {
        const parts = pit.duration.split(':');
        if (parts.length > 1) {
          durationSec = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
        } else {
          durationSec = parseFloat(parts[0]);
        }
      }

      pitEvents[lapNum].push({
        type: 'pit',
        driverNumber: dNum,
        duration: durationSec,
        driver: driverMap[dNum]?.nameAcronym || `#${dNum}`,
      });
    }
  }

  // Add pit events to timeline laps
  for (const lapData of timeline) {
    const lapNum = lapData.lap;
    if (pitEvents[lapNum]) {
      lapData._events = pitEvents[lapNum];
    }
  }

  // Simulated playback time settings
  const totalLapsCount = sortedLaps.length;
  const raceStartTime = 0;
  const raceEndTime = totalLapsCount * LAP_DURATION_MS;

  // Build lapStream
  const lapStream = sortedLaps.map(lapNum => ({
    lap: lapNum,
    t: (lapNum - 1) * LAP_DURATION_MS
  }));

  // Build positionStream
  const positionStream: any[] = [];
  // Lap 0 Grid positions
  for (const r of results) {
    const dNum = r.driver.number;
    if (!isNaN(dNum)) {
      positionStream.push({
        t: -10000, // start 10s before green flag
        dn: dNum,
        pos: r.grid
      });
    }
  }
  // Lap 1 to N positions
  for (const lap of rawLaps) {
    const lapNum = parseInt(lap.number);
    const t = (lapNum - 1) * LAP_DURATION_MS;
    for (const timing of lap.Timings) {
      const dNum = driverIdToNumber[timing.driverId];
      if (dNum) {
        positionStream.push({
          t,
          dn: dNum,
          pos: parseInt(timing.position)
        });
      }
    }
  }
  positionStream.sort((a, b) => a.t - b.t);

  // Build pitStream
  const pitStream = rawPitStops.map((pit: any) => {
    const lapNum = parseInt(pit.lap);
    const dNum = driverIdToNumber[pit.driverId];
    if (!dNum) return null;

    let durationSec = 0;
    if (pit.duration) {
      const parts = pit.duration.split(':');
      if (parts.length > 1) {
        durationSec = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
      } else {
        durationSec = parseFloat(parts[0]);
      }
    }

    return {
      t: (lapNum - 1) * LAP_DURATION_MS + 45000, // pit mid-lap
      dn: dNum,
      dur: durationSec,
      lap: lapNum
    };
  }).filter(Boolean);

  // Build rcStream (race control flags)
  const rcStream = [
    { t: 0, type: 'green', msg: 'Race Started', lap: 1 },
    { t: raceEndTime, type: 'chequered', msg: 'Chequered Flag', lap: totalLapsCount }
  ];

  return {
    drivers: Object.values(driverMap),
    totalLaps: totalLapsCount,
    timeline,
    stints: {}, // Jolpica has no tire data; caller merges this in from FastF1
    positionStream,
    pitStream,
    rcStream,
    lapStream,
    raceStartTime,
    raceEndTime
  };
}

interface RaceControlEvent {
  type: string;
  msg: string;
  lap: number;
}

/**
 * Merge FastF1 race-control flag events (yellow/red/safety car/VSC/green) into a
 * Jolpica-built timeline, in place. Jolpica has no race-control data, so without
 * this the timeline only has the synthetic green-start / chequered-end markers.
 * Adds each event to `rcStream` (used by the replay for flag state over time) and
 * to the matching lap's `_events` (used by the chart's flag areas and tooltip).
 */
export function mergeRaceControlEvents(timeline: any, raceControlEvents: RaceControlEvent[]) {
  if (!timeline || !raceControlEvents || raceControlEvents.length === 0) return timeline;

  const rcStream = timeline.rcStream || [];
  const eventsByLap: Record<number, RaceControlEvent[]> = {};

  for (const evt of raceControlEvents) {
    const lapNum = evt.lap || 0;
    const t = lapNum > 0 ? (lapNum - 1) * LAP_DURATION_MS : 0;
    rcStream.push({ t, type: evt.type, msg: evt.msg, lap: lapNum });

    if (lapNum > 0) {
      if (!eventsByLap[lapNum]) eventsByLap[lapNum] = [];
      eventsByLap[lapNum].push({ type: evt.type, msg: evt.msg, lap: lapNum });
    }
  }

  rcStream.sort((a: any, b: any) => a.t - b.t);
  timeline.rcStream = rcStream;

  for (const lapData of timeline.timeline || []) {
    const extra = eventsByLap[lapData.lap];
    if (extra) {
      lapData._events = [...(lapData._events || []), ...extra];
    }
  }

  return timeline;
}
