import axios from 'axios';
import NodeCache from 'node-cache';

const BASE_URL = 'https://api.openf1.org/v1';
const cache = new NodeCache({ stdTTL: 1800 }); // 30 min cache

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function cachedGet<T>(url: string): Promise<T> {
  const cached = cache.get<T>(url);
  if (cached) return cached;

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get<T>(url, { timeout: 60000 });
      cache.set(url, response.data);
      return response.data;
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`Rate limited, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function getSessions(year: number) {
  const url = `${BASE_URL}/sessions?year=${year}`;
  const data: any[] = await cachedGet(url);
  return data.map((s) => ({
    sessionKey: s.session_key,
    sessionName: s.session_name,
    sessionType: s.session_type,
    meetingKey: s.meeting_key,
    circuitShortName: s.circuit_short_name,
    countryName: s.country_name,
    dateStart: s.date_start,
    dateEnd: s.date_end,
    year: s.year,
  }));
}

export async function getDrivers(sessionKey: number) {
  const url = `${BASE_URL}/drivers?session_key=${sessionKey}`;
  const data: any[] = await cachedGet(url);
  return data.map((d) => ({
    driverNumber: d.driver_number,
    broadcastName: d.broadcast_name,
    fullName: d.full_name,
    nameAcronym: d.name_acronym,
    teamName: d.team_name,
    teamColour: d.team_colour,
    countryCode: d.country_code,
    headshotUrl: d.headshot_url,
  }));
}

export async function getLaps(sessionKey: number, driverNumber?: number) {
  let url = `${BASE_URL}/laps?session_key=${sessionKey}`;
  if (driverNumber) url += `&driver_number=${driverNumber}`;
  const data: any[] = await cachedGet(url);
  return data.map((l) => ({
    driverNumber: l.driver_number,
    lapNumber: l.lap_number,
    lapDuration: l.lap_duration,
    dateStart: l.date_start,
    durationSector1: l.duration_sector_1,
    durationSector2: l.duration_sector_2,
    durationSector3: l.duration_sector_3,
    isPitOutLap: l.is_pit_out_lap,
    stInt: l.st_number,
  }));
}

export async function getCarData(sessionKey: number, driverNumber: number) {
  // Get a sample of telemetry data (latest 200 points to avoid huge payloads)
  const url = `${BASE_URL}/car_data?session_key=${sessionKey}&driver_number=${driverNumber}&speed>=0`;
  const data: any[] = await cachedGet(url);
  const sampled = data.length > 500 ? data.filter((_: any, i: number) => i % Math.ceil(data.length / 500) === 0) : data;
  return sampled.map((c) => ({
    date: c.date,
    speed: c.speed,
    rpm: c.rpm,
    gear: c.n_gear,
    throttle: c.throttle,
    brake: c.brake,
    drs: c.drs,
  }));
}

export async function getPositions(sessionKey: number) {
  // To avoid missing data and 1000-record limits, fetch per driver
  const drivers = await getDrivers(sessionKey);
  const driverNumbers = drivers.map((d: any) => d.driverNumber);
  
  let allData: any[] = [];
  console.log(`[Positions] Fetching positions for ${driverNumbers.length} drivers...`);
  
  for (const dn of driverNumbers) {
    const url = `${BASE_URL}/position?session_key=${sessionKey}&driver_number=${dn}`;
    try {
      const chunk: any[] = await cachedGet(url);
      allData = allData.concat(chunk);
    } catch (err) {
      console.error(`[Positions] Failed to fetch for driver ${dn}:`, err);
    }
  }
  
  return allData.map((p) => ({
    driverNumber: p.driver_number,
    position: p.position,
    date: p.date,
  }));
}

export async function getPitStops(sessionKey: number) {
  const url = `${BASE_URL}/pit?session_key=${sessionKey}`;
  const data: any[] = await cachedGet(url);
  return data.map((p) => ({
    driverNumber: p.driver_number,
    pitDuration: p.pit_duration,
    lapNumber: p.lap_number,
    date: p.date,
  }));
}

export async function getWeather(sessionKey: number) {
  const url = `${BASE_URL}/weather?session_key=${sessionKey}`;
  const data: any[] = await cachedGet(url);
  if (data.length === 0) return null;
  const latest = data[data.length - 1];
  return {
    airTemperature: latest.air_temperature,
    trackTemperature: latest.track_temperature,
    humidity: latest.humidity,
    windSpeed: latest.wind_speed,
    windDirection: latest.wind_direction,
    rainfall: latest.rainfall,
    date: latest.date,
  };
}

export async function getRaceControl(sessionKey: number) {
  const url = `${BASE_URL}/race_control?session_key=${sessionKey}`;
  const data: any[] = await cachedGet(url);
  return data.map((rc) => ({
    date: rc.date,
    category: rc.category,       // Flag, SafetyCar, etc.
    flag: rc.flag,               // GREEN, YELLOW, RED, etc.
    message: rc.message,
    scope: rc.scope,             // Track, Sector, Driver
    sector: rc.sector,
    lapNumber: rc.lap_number,
    driverNumber: rc.driver_number,
  }));
}

export async function getStints(sessionKey: number) {
  const url = `${BASE_URL}/stints?session_key=${sessionKey}`;
  const data: any[] = await cachedGet(url);
  return data.map((s) => ({
    driverNumber: s.driver_number,
    stintNumber: s.stint_number,
    compound: s.compound,
    lapStart: s.lap_start,
    lapEnd: s.lap_end,
    tyreAgeAtStart: s.tyre_age_at_start,
  }));
}

export async function getRaceTimeline(sessionKey: number) {
  try {
    console.log(`[Timeline] Fetching data for session ${sessionKey}...`);
    
    // Fetch data sequentially to avoid triggering 429 Rate Limiting
    const lapsData = await getLaps(sessionKey);
    console.log(`[Timeline] Received ${lapsData.length} laps`);
    
    const driversData = await getDrivers(sessionKey);
    console.log(`[Timeline] Received ${driversData.length} drivers`);
    
    const pitData = await getPitStops(sessionKey);
    console.log(`[Timeline] Received ${pitData.length} pit stops`);
    
    const raceControlData = await getRaceControl(sessionKey);
    console.log(`[Timeline] Received ${raceControlData.length} race control events`);
    
    const stintsData = await getStints(sessionKey);
    console.log(`[Timeline] Received ${stintsData.length} stints`);

    const positionData = await getPositions(sessionKey);
    console.log(`[Timeline] Received ${positionData.length} position data points`);

    // Build driver info map
    const driverMap: Record<number, any> = {};
    for (const d of driversData) {
      driverMap[d.driverNumber] = d;
    }

  // Get all lap numbers
  const allLapNumbers = new Set<number>();
  for (const lap of lapsData) {
    allLapNumbers.add(lap.lapNumber);
  }
  const sortedLaps = [...allLapNumbers].sort((a, b) => a - b);

  // Build lap dateStart boundaries per driver
  // For each driver, map lapNumber -> dateStart
  const driverLapStarts: Record<number, Record<number, string>> = {};
  for (const lap of lapsData) {
    if (!driverLapStarts[lap.driverNumber]) driverLapStarts[lap.driverNumber] = {};
    if (lap.dateStart) {
      driverLapStarts[lap.driverNumber][lap.lapNumber] = lap.dateStart;
    }
  }

  // Build global lap start times (use the earliest dateStart among all drivers for each lap)
  const lapStartTimes: Record<number, number> = {};
  for (const lapNum of sortedLaps) {
    let earliest = Infinity;
    for (const dn of Object.keys(driverLapStarts)) {
      const ds = driverLapStarts[Number(dn)]?.[lapNum];
      if (ds) {
        const t = new Date(ds).getTime();
        if (t < earliest) earliest = t;
      }
    }
    if (earliest !== Infinity) lapStartTimes[lapNum] = earliest;
  }

  // Use actual position data from OpenF1 /v1/position endpoint
  // Group positions by driver, sorted by timestamp
  const driverPositions: Record<number, { time: number; position: number }[]> = {};
  for (const p of positionData) {
    const time = new Date(p.date).getTime();
    if (isNaN(time)) continue; // Skip invalid dates
    
    if (!driverPositions[p.driverNumber]) driverPositions[p.driverNumber] = [];
    driverPositions[p.driverNumber].push({
      time,
      position: p.position,
    });
  }
  // Sort each driver's positions by time
  for (const dn of Object.keys(driverPositions)) {
    driverPositions[Number(dn)].sort((a, b) => a.time - b.time);
  }

  // For each lap, determine each driver's position at the end of that lap
  // "End of lap N" = start of lap N+1 (or final positions for the last lap)
  const driverNumbers = Object.keys(driverPositions).map(Number);
  const positionsPerLap: Record<number, Record<number, number>> = {};

  for (const lapNum of sortedLaps) {
    positionsPerLap[lapNum] = {};
    // Use the start of the next lap as the reference time, or a very large time for the last lap
    const nextLapNum = sortedLaps[sortedLaps.indexOf(lapNum) + 1];
    const refTime = nextLapNum && lapStartTimes[nextLapNum]
      ? lapStartTimes[nextLapNum]
      : (lapStartTimes[lapNum] || 0) + 200_000; // fallback: 200s after lap start

    for (const dn of driverNumbers) {
      const positions = driverPositions[dn];
      if (!positions || positions.length === 0) continue;

      // Find the last position entry at or before the reference time
      let pos: number | null = null;
      for (let i = positions.length - 1; i >= 0; i--) {
        if (positions[i].time <= refTime) {
          pos = positions[i].position;
          break;
        }
      }
      if (pos !== null && pos <= 20) {
        positionsPerLap[lapNum][dn] = pos;
      }
    }
  }

  // Build pit stop events per lap
  const pitEvents: Record<number, any[]> = {};
  for (const pit of pitData) {
    const lap = pit.lapNumber || 0;
    if (!pitEvents[lap]) pitEvents[lap] = [];
    pitEvents[lap].push({
      type: 'pit',
      driverNumber: pit.driverNumber,
      duration: pit.pitDuration,
      driver: driverMap[pit.driverNumber]?.nameAcronym || `#${pit.driverNumber}`,
    });
  }

  // Build race control events per lap
  const rcEvents: Record<number, any[]> = {};
  for (const rc of raceControlData) {
    const lap = rc.lapNumber || 0;
    if (!rcEvents[lap]) rcEvents[lap] = [];

    let eventType = 'other';
    if (rc.flag === 'YELLOW' || rc.flag === 'DOUBLE YELLOW') eventType = 'yellowFlag';
    else if (rc.flag === 'RED') eventType = 'redFlag';
    else if (rc.category === 'SafetyCar' || (rc.message && rc.message.includes('SAFETY CAR'))) eventType = 'safetyCar';
    else if (rc.category === 'Vsc' || rc.flag === 'VSC' || (rc.message && rc.message.includes('VIRTUAL SAFETY CAR'))) eventType = 'vsc';
    else if (rc.flag === 'GREEN' || rc.flag === 'CLEAR') eventType = 'green';
    else if (rc.flag === 'CHEQUERED') eventType = 'chequered';
    else continue;

    // Deduplicate consecutive identical types within the same lap to reduce noise
    const lastEvent = rcEvents[lap].length > 0 ? rcEvents[lap][rcEvents[lap].length - 1] : null;
    if (lastEvent && lastEvent.type === eventType) continue;

    rcEvents[lap].push({
      type: eventType,
      message: rc.message,
      flag: rc.flag,
      category: rc.category,
      scope: rc.scope,
    });

  }

  // Build timeline data (lap-by-lap chart)
  // Include Lap 0 (Starting Grid)
  const lap0Data: any = { lap: 0 };
  for (const dn of driverNumbers) {
    // Use the earliest recorded position for each driver as their starting grid position
    const firstPos = driverPositions[dn]?.[0];
    if (firstPos) {
      lap0Data[`d${dn}`] = firstPos.position;
    }
  }

  const timeline = [
    lap0Data,
    ...sortedLaps.map((lapNum) => {
      const lapData: any = { lap: lapNum };
      for (const dn of driverNumbers) {
        const pos = positionsPerLap[lapNum]?.[dn];
        if (pos) {
          lapData[`d${dn}`] = pos;
        }
      }
      const events: any[] = [];
      if (pitEvents[lapNum]) events.push(...pitEvents[lapNum]);
      if (rcEvents[lapNum]) events.push(...rcEvents[lapNum]);
      if (events.length > 0) lapData._events = events;
      return lapData;
    })
  ];

  // Build raw timestamped data for animation replay
  const positionStream = positionData
    .filter((p: any) => p.position <= 20)
    .map((p: any) => {
      const t = new Date(p.date).getTime();
      return { t, dn: p.driverNumber, pos: p.position };
    })
    .filter(p => !isNaN(p.t))
    .sort((a: any, b: any) => a.t - b.t);

  const pitStream = pitData.map((p: any) => ({
    t: new Date(p.date).getTime(),
    dn: p.driverNumber,
    dur: p.pitDuration,
    lap: p.lapNumber,
  })).filter(p => !isNaN(p.t)).sort((a: any, b: any) => a.t - b.t);

  const rcStream = raceControlData
    .filter((rc: any) => {
      return rc.flag === 'YELLOW' || rc.flag === 'DOUBLE YELLOW' || rc.flag === 'RED' ||
        rc.flag === 'GREEN' || rc.flag === 'CHEQUERED' || rc.flag === 'VSC' ||
        rc.flag === 'CLEAR' ||
        rc.category === 'SafetyCar' || rc.category === 'Vsc' ||
        (rc.message && (rc.message.includes('SAFETY CAR') || rc.message.includes('VIRTUAL SAFETY CAR')));
    })

    .map((rc: any) => {
      let type = 'other';
      const msg = (rc.message || '').toUpperCase();
      const isEnding = msg.includes('ENDING') || msg.includes('CLEARED') || 
                       msg.includes('RECOVERED') || msg.includes('CLEAR') || 
                       msg.includes('NORMAL') || msg.includes('TERMINATED');

      if (rc.flag === 'YELLOW' || rc.flag === 'DOUBLE YELLOW') type = isEnding ? 'green' : 'yellowFlag';
      else if (rc.flag === 'RED') type = 'redFlag';
      else if (rc.category === 'SafetyCar' || msg.includes('SAFETY CAR')) type = isEnding ? 'green' : 'safetyCar';
      else if (rc.category === 'Vsc' || rc.flag === 'VSC' || msg.includes('VIRTUAL SAFETY CAR')) type = isEnding ? 'green' : 'vsc';
      else if (rc.flag === 'GREEN' || rc.flag === 'CLEAR') type = 'green';
      else if (rc.flag === 'CHEQUERED') type = 'chequered';
      
      const t = new Date(rc.date).getTime();
      return { t, type, msg: rc.message, lap: rc.lapNumber };
    })

    .filter(rc => !isNaN(rc.t))
    .sort((a: any, b: any) => a.t - b.t);

  let lapStream = sortedLaps.map(lapNum => {
    const lap = lapsData.find((l: any) => l.lapNumber === lapNum && l.dateStart);
    const t = lap ? new Date(lap.dateStart).getTime() : 0;
    return { lap: lapNum, t };
  }).filter(l => l.t > 0 && !isNaN(l.t)).sort((a, b) => a.t - b.t);

  // Interpolate Lap 1 start if missing (it usually is because it starts from grid)
  if (lapStream.length > 0 && lapStream[0].lap === 2) {
    const lap1Dur = lapsData.find((l: any) => l.lapNumber === 1)?.lapDuration || 100;
    lapStream.unshift({
      lap: 1,
      t: lapStream[0].t - (lap1Dur * 1000)
    });
  }

  // Build stint map
  const stintMap: Record<number, any[]> = {};
  for (const s of stintsData) {
    if (!stintMap[s.driverNumber]) stintMap[s.driverNumber] = [];
    stintMap[s.driverNumber].push(s);
  }

  // Race time bounds
  const chequered = rcStream.find((rc: any) => rc.type === 'chequered');
  const raceStartTime = lapStream.length > 0 ? lapStream[0].t : 
    (positionStream.length > 0 ? positionStream[0].t : 0);
  const raceEndTime = chequered ? chequered.t : 
    (lapStream.length > 0 ? lapStream[lapStream.length - 1].t : 
    (positionStream.length > 0 ? positionStream[positionStream.length - 1].t : 0));

  return {
    drivers: Object.values(driverMap),
    totalLaps: sortedLaps.length,
    timeline,
    stints: stintMap,
    // Animation data
    positionStream,
    pitStream,
    rcStream,
    lapStream,
    raceStartTime: isNaN(raceStartTime) ? 0 : raceStartTime,
    raceEndTime: isNaN(raceEndTime) ? 0 : raceEndTime,
  };

} catch (error: any) {
  console.error(`[Timeline] Error fetching timeline for session ${sessionKey}:`, error?.message || error);
  throw error;
}
}

export async function getRaceIncidents(sessionKey: number) {
  const url = `${BASE_URL}/race_control?session_key=${sessionKey}`;
  const data: any[] = await cachedGet(url);
  
  const incidents: any[] = [];
  const activeIncidents = new Map<string, any>();

  // Sort by date to process chronologically
  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const rc of sortedData) {
    const lap = rc.lap_number || 0;
    const message = rc.message || '';
    const flag = rc.flag || '';
    const category = rc.category || '';
    const scope = rc.scope || '';
    
    let key = '';
    let type = '';
    let isStart = false;
    let isEnd = false;

    if (flag === 'YELLOW' || flag === 'DOUBLE YELLOW') {
      type = 'Yellow Flag';
      key = `YELLOW_${rc.sector || scope}`;
      isStart = true;
    } else if (flag === 'CLEAR' || (message && message.includes('CLEAR'))) {
      type = 'Yellow Flag';
      key = `YELLOW_${rc.sector || scope}`;
      isEnd = true;
    } else if (category === 'SafetyCar' || (message && message.includes('SAFETY CAR'))) {
      type = 'Safety Car';
      key = 'SC';
      if (message.includes('DEPLOYED')) isStart = true;
      else if (message.includes('ENDING') || message.includes('ENDED') || message.includes('IN THIS LAP')) isEnd = true;
    } else if (category === 'Vsc' || (message && message.includes('VIRTUAL SAFETY CAR'))) {
      type = 'VSC';
      key = 'VSC';
      if (message.includes('DEPLOYED')) isStart = true;
      else if (message.includes('ENDING') || message.includes('ENDED')) isEnd = true;
    } else if (flag === 'RED') {
      type = 'Red Flag';
      key = 'RED';
      isStart = true;
    } else if (flag === 'CHEQUERED') {
      type = 'Chequered Flag';
      key = 'FINISH';
      isStart = true;
    }

    if (isStart) {
      if (activeIncidents.has(key)) {
        const existing = activeIncidents.get(key);
        existing.endLap = lap;
        incidents.push(existing);
      }
      activeIncidents.set(key, {
        type,
        startLap: lap,
        message: message,
        timestamp: rc.date,
        key
      });
    } else if (isEnd) {
      if (activeIncidents.has(key)) {
        const incident = activeIncidents.get(key);
        incident.endLap = lap;
        incidents.push(incident);
        activeIncidents.delete(key);
      }
    } else if (type === '' && message && !message.includes('DRS') && !message.includes('Overtake')) {
       // Single interesting events (filtering some noise like DRS)
       incidents.push({
         type: 'System',
         startLap: lap,
         endLap: lap,
         message: message,
         timestamp: rc.date
       });
    }
  }

  for (const incident of activeIncidents.values()) {
    incidents.push(incident);
  }

  return incidents.sort((a, b) => a.startLap - b.startLap || new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

