import { getRaceResults, getRawLapTimings, getRawPitStops } from './jolpicaService';

interface TimelineDriver {
  driverNumber: number;
  broadcastName: string;
  fullName: string;
  nameAcronym: string;
  teamName: string;
  teamColour: string;
  countryCode: string;
  headshotUrl: string;
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

    driverMap[dNum] = {
      driverNumber: dNum,
      broadcastName: r.driver.code,
      fullName: `${r.driver.firstName} ${r.driver.lastName}`,
      nameAcronym: r.driver.code,
      teamName: r.constructor.name,
      teamColour: teamColour,
      countryCode: '',
      headshotUrl: ''
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
  const LAP_DURATION_MS = 90000; // 90 seconds per lap
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
    stints: {}, // Jolpica does not provide stints data
    positionStream,
    pitStream,
    rcStream,
    lapStream,
    raceStartTime,
    raceEndTime
  };
}
