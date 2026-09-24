// Demo data server: emulates the Jolpica/Ergast endpoints the app uses, plus a
// /fastf1/* JSON API consumed by fake_helper.py. All results are SIMULATED.
const http = require('http');

// ---------- deterministic RNG ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const SEASON = '2026';
const TEAMS = {
  mclaren: { name: 'McLaren', nat: 'British', pace: 0.00, color: 'FF8000' },
  mercedes: { name: 'Mercedes', nat: 'German', pace: 0.05, color: '27F4D2' },
  red_bull: { name: 'Red Bull', nat: 'Austrian', pace: 0.12, color: '3671C6' },
  ferrari: { name: 'Ferrari', nat: 'Italian', pace: 0.14, color: 'E8002D' },
  williams: { name: 'Williams', nat: 'British', pace: 0.55, color: '64C4FF' },
  rb: { name: 'Racing Bulls', nat: 'Italian', pace: 0.65, color: '6692FF' },
  aston_martin: { name: 'Aston Martin', nat: 'British', pace: 0.70, color: '229971' },
  haas: { name: 'Haas F1 Team', nat: 'American', pace: 0.72, color: 'B6BABD' },
  audi: { name: 'Audi', nat: 'German', pace: 0.80, color: '52E252' },
  alpine: { name: 'Alpine F1 Team', nat: 'French', pace: 0.88, color: '0093CC' },
  cadillac: { name: 'Cadillac F1 Team', nat: 'American', pace: 1.05, color: 'FFD700' },
};
const DRIVERS = [
  ['norris', 4, 'NOR', 'Lando', 'Norris', 'British', 'mclaren', -0.03],
  ['piastri', 81, 'PIA', 'Oscar', 'Piastri', 'Australian', 'mclaren', 0.0],
  ['russell', 63, 'RUS', 'George', 'Russell', 'British', 'mercedes', -0.02],
  ['antonelli', 12, 'ANT', 'Andrea Kimi', 'Antonelli', 'Italian', 'mercedes', 0.08],
  ['max_verstappen', 1, 'VER', 'Max', 'Verstappen', 'Dutch', 'red_bull', -0.12],
  ['hadjar', 6, 'HAD', 'Isack', 'Hadjar', 'French', 'red_bull', 0.12],
  ['leclerc', 16, 'LEC', 'Charles', 'Leclerc', 'Monegasque', 'ferrari', -0.03],
  ['hamilton', 44, 'HAM', 'Lewis', 'Hamilton', 'British', 'ferrari', 0.04],
  ['albon', 23, 'ALB', 'Alexander', 'Albon', 'Thai', 'williams', 0.0],
  ['sainz', 55, 'SAI', 'Carlos', 'Sainz', 'Spanish', 'williams', 0.0],
  ['lawson', 30, 'LAW', 'Liam', 'Lawson', 'New Zealander', 'rb', 0.03],
  ['arvid_lindblad', 41, 'LIN', 'Arvid', 'Lindblad', 'British', 'rb', 0.06],
  ['alonso', 14, 'ALO', 'Fernando', 'Alonso', 'Spanish', 'aston_martin', -0.03],
  ['stroll', 18, 'STR', 'Lance', 'Stroll', 'Canadian', 'aston_martin', 0.1],
  ['ocon', 31, 'OCO', 'Esteban', 'Ocon', 'French', 'haas', 0.02],
  ['bearman', 87, 'BEA', 'Oliver', 'Bearman', 'British', 'haas', 0.0],
  ['hulkenberg', 27, 'HUL', 'Nico', 'Hulkenberg', 'German', 'audi', 0.0],
  ['bortoleto', 5, 'BOR', 'Gabriel', 'Bortoleto', 'Brazilian', 'audi', 0.03],
  ['gasly', 10, 'GAS', 'Pierre', 'Gasly', 'French', 'alpine', 0.0],
  ['colapinto', 43, 'COL', 'Franco', 'Colapinto', 'Argentine', 'alpine', 0.06],
  ['perez', 11, 'PER', 'Sergio', 'Perez', 'Mexican', 'cadillac', 0.0],
  ['bottas', 77, 'BOT', 'Valtteri', 'Bottas', 'Finnish', 'cadillac', 0.0],
].map(([id, num, code, first, last, nat, team, skill]) => ({ id, num, code, first, last, nat, team, skill }));

// round, name, circuitId, circuitName, locality, country, lat, lng, raceDate, laps, baseLap(s), sprint
const CAL = [
  ['Australian Grand Prix', 'albert_park', 'Albert Park Grand Prix Circuit', 'Melbourne', 'Australia', -37.8497, 144.968, '2026-03-08', 58, 80.5, false, '04:00:00Z'],
  ['Chinese Grand Prix', 'shanghai', 'Shanghai International Circuit', 'Shanghai', 'China', 31.3389, 121.22, '2026-03-15', 56, 94.2, true, '07:00:00Z'],
  ['Japanese Grand Prix', 'suzuka', 'Suzuka Circuit', 'Suzuka', 'Japan', 34.8431, 136.541, '2026-03-29', 53, 91.0, false, '05:00:00Z'],
  ['Bahrain Grand Prix', 'bahrain', 'Bahrain International Circuit', 'Sakhir', 'Bahrain', 26.0325, 50.5106, '2026-04-12', 57, 94.5, false, '15:00:00Z'],
  ['Saudi Arabian Grand Prix', 'jeddah', 'Jeddah Corniche Circuit', 'Jeddah', 'Saudi Arabia', 21.6319, 39.1044, '2026-04-19', 50, 90.8, false, '17:00:00Z'],
  ['Miami Grand Prix', 'miami', 'Miami International Autodrome', 'Miami', 'USA', 25.9581, -80.2389, '2026-05-03', 57, 89.7, true, '20:00:00Z'],
  ['Canadian Grand Prix', 'villeneuve', 'Circuit Gilles Villeneuve', 'Montreal', 'Canada', 45.5, -73.5228, '2026-05-24', 70, 75.1, true, '20:00:00Z'],
  ['Monaco Grand Prix', 'monaco', 'Circuit de Monaco', 'Monte-Carlo', 'Monaco', 43.7347, 7.42056, '2026-06-07', 78, 74.2, false, '13:00:00Z'],
  ['Barcelona-Catalunya Grand Prix', 'catalunya', 'Circuit de Barcelona-Catalunya', 'Montmeló', 'Spain', 41.57, 2.26111, '2026-06-14', 66, 77.8, false, '13:00:00Z'],
  ['Austrian Grand Prix', 'red_bull_ring', 'Red Bull Ring', 'Spielberg', 'Austria', 47.2197, 14.7647, '2026-06-28', 71, 68.3, false, '13:00:00Z'],
  ['British Grand Prix', 'silverstone', 'Silverstone Circuit', 'Silverstone', 'UK', 52.0786, -1.01694, '2026-07-05', 52, 90.1, true, '14:00:00Z'],
  ['Belgian Grand Prix', 'spa', 'Circuit de Spa-Francorchamps', 'Spa', 'Belgium', 50.4372, 5.97139, '2026-07-19', 44, 107.2, false, '13:00:00Z'],
  ['Hungarian Grand Prix', 'hungaroring', 'Hungaroring', 'Budapest', 'Hungary', 47.5789, 19.2486, '2026-07-26', 70, 80.9, false, '13:00:00Z'],
  ['Dutch Grand Prix', 'zandvoort', 'Circuit Park Zandvoort', 'Zandvoort', 'Netherlands', 52.3888, 4.54092, '2026-08-23', 72, 73.1, true, '13:00:00Z'],
  ['Italian Grand Prix', 'monza', 'Autodromo Nazionale di Monza', 'Monza', 'Italy', 45.6156, 9.28111, '2026-09-06', 53, 83.2, false, '13:00:00Z'],
  ['Spanish Grand Prix', 'madring', 'Madring', 'Madrid', 'Spain', 40.4637, -3.6166, '2026-09-13', 57, 88.4, false, '13:00:00Z'],
  ['Azerbaijan Grand Prix', 'baku', 'Baku City Circuit', 'Baku', 'Azerbaijan', 40.3725, 49.8533, '2026-09-26', 51, 105.0, false, '11:00:00Z'],
  ['Singapore Grand Prix', 'marina_bay', 'Marina Bay Street Circuit', 'Marina Bay', 'Singapore', 1.2914, 103.864, '2026-10-11', 62, 94.0, true, '12:00:00Z'],
  ['United States Grand Prix', 'americas', 'Circuit of the Americas', 'Austin', 'USA', 30.1328, -97.6411, '2026-10-25', 56, 97.0, false, '19:00:00Z'],
  ['Mexico City Grand Prix', 'rodriguez', 'Autódromo Hermanos Rodríguez', 'Mexico City', 'Mexico', 19.4042, -99.0907, '2026-11-01', 71, 80.0, false, '20:00:00Z'],
  ['São Paulo Grand Prix', 'interlagos', 'Autódromo José Carlos Pace', 'Sao Paulo', 'Brazil', -23.7036, -46.6997, '2026-11-08', 71, 72.4, false, '17:00:00Z'],
  ['Las Vegas Grand Prix', 'vegas', 'Las Vegas Strip Street Circuit', 'Las Vegas', 'USA', 36.1147, -115.173, '2026-11-21', 50, 95.0, false, '04:00:00Z'],
  ['Qatar Grand Prix', 'losail', 'Losail International Circuit', 'Lusail', 'Qatar', 25.49, 51.4542, '2026-11-29', 57, 83.0, false, '16:00:00Z'],
  ['Abu Dhabi Grand Prix', 'yas_marina', 'Yas Marina Circuit', 'Abu Dhabi', 'UAE', 24.4672, 54.6031, '2026-12-06', 58, 85.6, false, '13:00:00Z'],
].map((a, i) => ({ round: i + 1, raceName: a[0], cid: a[1], cname: a[2], loc: a[3], country: a[4], lat: a[5], lng: a[6], date: a[7], laps: a[8], base: a[9], sprint: a[10], time: a[11] }));
const COMPLETED = 16;

const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmtLap = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(3).padStart(6, '0')}`; };
const fmtGap = (s) => s >= 60 ? `+${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : `+${s.toFixed(3)}`;
const fmtTotal = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`; };
const RACE_PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_PTS = [8, 7, 6, 5, 4, 3, 2, 1];
const circuitObj = (c) => ({ circuitId: c.cid, url: '', circuitName: c.cname, Location: { lat: String(c.lat), long: String(c.lng), locality: c.loc, country: c.country } });
const driverObj = (d) => ({ driverId: d.id, permanentNumber: String(d.num), code: d.code, url: '', givenName: d.first, familyName: d.last, dateOfBirth: '2000-01-01', nationality: d.nat });
const consObj = (t) => ({ constructorId: t, url: '', name: TEAMS[t].name, nationality: TEAMS[t].nat });

// ---------- race simulation ----------
const simCache = {};
function simulate(round, kind) { // kind: 'R' | 'S'
  const key = `${round}${kind}`;
  if (simCache[key]) return simCache[key];
  const c = CAL[round - 1];
  const r = rng(round * 7919 + (kind === 'S' ? 13 : 0));
  const nLaps = kind === 'S' ? Math.round(c.laps / 3) : c.laps;
  // form drift through the season: McLaren/Mercedes/Red Bull/Ferrari rotate
  const form = {};
  for (const t of Object.keys(TEAMS)) form[t] = TEAMS[t].pace + gauss(r) * 0.12 + (t === 'red_bull' ? -0.01 * round : 0) + (t === 'mercedes' ? 0.08 * Math.sin(round / 2) : 0);
  const pace = {};
  for (const d of DRIVERS) pace[d.id] = form[d.team] + d.skill + gauss(r) * 0.1;
  // qualifying
  const quali = DRIVERS.map((d) => ({ d, t: c.base - 3.2 + pace[d.id] * 1.0 + gauss(r) * 0.12 })).sort((a, b) => a.t - b.t);
  const grid = {}; quali.forEach((q, i) => (grid[q.d.id] = i + 1));
  // DNFs
  const dnf = {};
  const nDnf = kind === 'S' ? (r() < 0.3 ? 1 : 0) : Math.floor(r() * 3);
  const causes = ['Collision', 'Engine', 'Hydraulics', 'Accident', 'Gearbox', 'Brakes'];
  for (let k = 0; k < nDnf; k++) { const d = DRIVERS[Math.floor(r() * DRIVERS.length)]; if (!dnf[d.id]) dnf[d.id] = { lap: 2 + Math.floor(r() * (nLaps - 5)), status: causes[Math.floor(r() * causes.length)] }; }
  // safety car
  const scLap = kind === 'R' && r() < 0.7 ? 8 + Math.floor(r() * (nLaps - 20)) : null;
  const vscLap = kind === 'R' && r() < 0.4 ? 5 + Math.floor(r() * (nLaps - 10)) : null;
  // strategy
  const strat = {};
  for (const d of DRIVERS) {
    if (kind === 'S') { strat[d.id] = [{ c: 'MEDIUM', from: 1 }]; continue; }
    const two = r() < 0.35;
    if (two) { const p1 = Math.round(nLaps * (0.28 + r() * 0.08)); const p2 = Math.round(nLaps * (0.6 + r() * 0.1)); strat[d.id] = [{ c: 'MEDIUM', from: 1 }, { c: 'HARD', from: p1 + 1 }, { c: 'SOFT', from: p2 + 1 }]; }
    else { const p = Math.round(nLaps * (0.35 + r() * 0.2)); strat[d.id] = r() < 0.7 ? [{ c: 'MEDIUM', from: 1 }, { c: 'HARD', from: p + 1 }] : [{ c: 'HARD', from: 1 }, { c: 'MEDIUM', from: p + 1 }]; }
    if (scLap && r() < 0.5) { // opportunistic stop under SC
      const s = strat[d.id]; if (!s.some((x) => Math.abs(x.from - scLap - 1) < 6)) s.push({ c: 'SOFT', from: scLap + 1 }); s.sort((a, b) => a.from - b.from);
    }
  }
  const compDelta = { SOFT: -0.6, MEDIUM: 0, HARD: 0.4 };
  const deg = { SOFT: 0.09, MEDIUM: 0.05, HARD: 0.03 };
  const cum = {}; const lapRows = []; const lapTimes = {}; const pits = [];
  DRIVERS.forEach((d) => { cum[d.id] = (grid[d.id] - 1) * 0.35; lapTimes[d.id] = []; });
  for (let lap = 1; lap <= nLaps; lap++) {
    const underSC = scLap && lap >= scLap && lap < scLap + 4;
    const underVSC = vscLap && lap >= vscLap && lap < vscLap + 2;
    for (const d of DRIVERS) {
      if (dnf[d.id] && lap > dnf[d.id].lap) continue;
      const s = strat[d.id]; let si = 0; for (let i = 0; i < s.length; i++) if (lap >= s[i].from) si = i;
      const age = lap - s[si].from + 1;
      let t = c.base + pace[d.id] + compDelta[s[si].c] + deg[s[si].c] * age - lap * 0.035 + gauss(r) * 0.25;
      if (lap === 1) t += 4 + grid[d.id] * 0.25;
      const pitNext = s[si + 1] && s[si + 1].from === lap + 1;
      if (pitNext) { const dur = 2.1 + Math.abs(gauss(r)) * 0.8 + (r() < 0.06 ? 3 : 0); t += 19 + dur; pits.push({ driverId: d.id, lap, stop: si + 1, dur: 20 + dur }); }
      if (underSC) t = c.base * 1.45 + gauss(r) * 0.3;
      if (underVSC) t = c.base * 1.3 + gauss(r) * 0.3;
      cum[d.id] += t; lapTimes[d.id].push(t);
    }
    if (underSC) { // bunch up field
      const order = DRIVERS.filter((d) => !(dnf[d.id] && lap > dnf[d.id].lap)).sort((a, b) => cum[a.id] - cum[b.id]);
      order.forEach((d, i) => { cum[d.id] = cum[order[0].id] + i * 0.8; });
    }
    const running = DRIVERS.filter((d) => !(dnf[d.id] && lap > dnf[d.id].lap)).sort((a, b) => cum[a.id] - cum[b.id]);
    lapRows.push({ lap, order: running.map((d, i) => ({ id: d.id, pos: i + 1, t: lapTimes[d.id][lap - 1] })) });
  }
  // final classification
  const finishers = DRIVERS.filter((d) => !dnf[d.id]).sort((a, b) => cum[a.id] - cum[b.id]);
  const retired = DRIVERS.filter((d) => dnf[d.id]).sort((a, b) => dnf[b.id].lap - dnf[a.id].lap);
  const leaderT = cum[finishers[0].id];
  let fl = null;
  for (const d of finishers) { const best = Math.min(...lapTimes[d.id]); const bl = lapTimes[d.id].indexOf(best) + 1; if (!fl || best < fl.t) fl = { id: d.id, t: best, lap: bl }; }
  const pts = kind === 'S' ? SPRINT_PTS : RACE_PTS;
  const results = [...finishers, ...retired].map((d, i) => {
    const isDnf = !!dnf[d.id]; const gap = cum[d.id] - leaderT;
    const lapped = !isDnf && gap > c.base * 0.97 ? Math.floor(gap / c.base) || 1 : 0;
    const best = Math.min(...lapTimes[d.id]);
    return {
      d, position: i + 1, grid: grid[d.id], points: !isDnf && i < pts.length ? pts[i] : 0,
      laps: isDnf ? dnf[d.id].lap : nLaps - lapped,
      status: isDnf ? dnf[d.id].status : lapped ? `+${lapped} Lap${lapped > 1 ? 's' : ''}` : 'Finished',
      time: isDnf || lapped ? null : i === 0 ? fmtTotal(leaderT) : fmtGap(gap), millis: Math.round(cum[d.id] * 1000),
      best, bestLap: lapTimes[d.id].indexOf(best) + 1,
    };
  });
  const flRank = [...results].sort((a, b) => a.best - b.best);
  results.forEach((x) => (x.flRank = flRank.indexOf(x) + 1));
  const out = { c, nLaps, quali, grid, results, lapRows, pits, strat, lapTimes, scLap, vscLap, dnf, fl, pace };
  simCache[key] = out; return out;
}

// ---------- Ergast payloads ----------
const MR = (extra, total = 1) => ({ MRData: { xmlns: '', series: 'f1', url: '', limit: '100', offset: '0', total: String(total), ...extra } });
function scheduleRace(c) {
  const o = { season: SEASON, round: String(c.round), url: '', raceName: c.raceName, Circuit: circuitObj(c), date: c.date, time: c.time };
  const sat = addDays(c.date, -1), fri = addDays(c.date, -2);
  const [h] = c.time.split(':').map(Number);
  const T = (hh) => `${String(((hh % 24) + 24) % 24).padStart(2, '0')}:30:00Z`;
  o.FirstPractice = { date: fri, time: T(h - 3) };
  if (c.sprint) { o.SprintQualifying = { date: fri, time: T(h + 1) }; o.Sprint = { date: sat, time: T(h - 3) }; o.Qualifying = { date: sat, time: T(h + 1) }; }
  else { o.SecondPractice = { date: fri, time: T(h + 1) }; o.ThirdPractice = { date: sat, time: T(h - 2) }; o.Qualifying = { date: sat, time: T(h + 1) }; }
  return o;
}
function raceHead(c) { return { season: SEASON, round: String(c.round), url: '', raceName: c.raceName, Circuit: circuitObj(c), date: c.date, time: c.time }; }
function resultsPayload(round, kind) {
  const s = simulate(round, kind);
  const list = s.results.map((x) => ({
    number: String(x.d.num), position: String(x.position), positionText: s.dnf[x.d.id] ? 'R' : String(x.position), points: String(x.points),
    Driver: driverObj(x.d), Constructor: consObj(x.d.team), grid: String(x.grid), laps: String(x.laps), status: x.status,
    ...(x.time ? { Time: { millis: String(x.millis), time: x.time } } : {}),
    ...(kind === 'R' ? { FastestLap: { rank: String(x.flRank), lap: String(x.bestLap), Time: { time: fmtLap(x.best) }, AverageSpeed: { units: 'kph', speed: (5300 / x.best * 3.6).toFixed(3) } } } : {}),
  }));
  return MR({ RaceTable: { season: SEASON, round: String(round), Races: [{ ...raceHead(s.c), [kind === 'S' ? 'SprintResults' : 'Results']: list }] } }, list.length);
}
function qualiPayload(round) {
  const s = simulate(round, 'R');
  const pole = s.quali[0].t;
  const list = s.quali.map((q, i) => ({
    number: String(q.d.num), position: String(i + 1), Driver: driverObj(q.d), Constructor: consObj(q.d.team),
    Q1: fmtLap(q.t + 0.9 + (i % 3) * 0.05), ...(i < 15 ? { Q2: fmtLap(q.t + 0.45) } : {}), ...(i < 10 ? { Q3: fmtLap(q.t) } : {}),
  }));
  void pole;
  return MR({ RaceTable: { season: SEASON, round: String(round), Races: [{ ...raceHead(s.c), QualifyingResults: list }] } }, list.length);
}
function standingsAfter(round) {
  const dp = {}, dw = {}, cp = {}, cw = {};
  DRIVERS.forEach((d) => { dp[d.id] = 0; dw[d.id] = 0; }); Object.keys(TEAMS).forEach((t) => { cp[t] = 0; cw[t] = 0; });
  for (let r = 1; r <= round; r++) {
    for (const kind of CAL[r - 1].sprint ? ['S', 'R'] : ['R']) {
      for (const x of simulate(r, kind).results) { dp[x.d.id] += x.points; cp[x.d.team] += x.points; if (x.position === 1 && kind === 'R') { dw[x.d.id]++; cw[x.d.team]++; } }
    }
  }
  const ds = [...DRIVERS].sort((a, b) => dp[b.id] - dp[a.id] || dw[b.id] - dw[a.id]);
  const cs = Object.keys(TEAMS).sort((a, b) => cp[b] - cp[a] || cw[b] - cw[a]);
  return { ds, cs, dp, dw, cp, cw };
}
function driverStandingsPayload(round) {
  const { ds, dp, dw } = standingsAfter(round);
  return MR({ StandingsTable: { season: SEASON, round: String(round), StandingsLists: [{ season: SEASON, round: String(round), DriverStandings: ds.map((d, i) => ({ position: String(i + 1), positionText: String(i + 1), points: String(dp[d.id]), wins: String(dw[d.id]), Driver: driverObj(d), Constructors: [consObj(d.team)] })) }] } }, ds.length);
}
function constructorStandingsPayload(round) {
  const { cs, cp, cw } = standingsAfter(round);
  return MR({ StandingsTable: { season: SEASON, round: String(round), StandingsLists: [{ season: SEASON, round: String(round), ConstructorStandings: cs.map((t, i) => ({ position: String(i + 1), positionText: String(i + 1), points: String(cp[t]), wins: String(cw[t]), Constructor: consObj(t) })) }] } }, cs.length);
}
function lapsPayload(round) {
  const s = simulate(round, 'R');
  const Laps = s.lapRows.map((l) => ({ number: String(l.lap), Timings: l.order.map((o) => ({ driverId: o.id, position: String(o.pos), time: fmtLap(o.t) })) }));
  return MR({ RaceTable: { season: SEASON, round: String(round), Races: [{ ...raceHead(s.c), Laps }] } }, 50);
}
function pitsPayload(round) {
  const s = simulate(round, 'R');
  const PitStops = s.pits.map((p) => ({ driverId: p.driverId, lap: String(p.lap), stop: String(p.stop), time: '14:00:00', duration: p.dur.toFixed(3) }));
  return MR({ RaceTable: { season: SEASON, round: String(round), Races: [{ ...raceHead(s.c), PitStops }] } }, PitStops.length);
}

// ---------- FastF1 substitutes ----------
function stints(s) {
  const out = {};
  for (const d of DRIVERS) {
    const last = s.dnf[d.id] ? s.dnf[d.id].lap : s.nLaps;
    const st = s.strat[d.id].filter((x) => x.from <= last);
    out[String(d.num)] = st.map((x, i) => ({ stintNumber: i + 1, compound: x.c, lapStart: x.from, lapEnd: st[i + 1] ? st[i + 1].from - 1 : last }));
  }
  return out;
}
function raceControl(s) {
  const ev = [];
  if (s.vscLap) { ev.push({ type: 'vsc', msg: 'VIRTUAL SAFETY CAR DEPLOYED', lap: s.vscLap }); ev.push({ type: 'green', msg: 'VIRTUAL SAFETY CAR ENDING', lap: s.vscLap + 2 }); }
  if (s.scLap) { ev.push({ type: 'yellowFlag', msg: 'DOUBLE YELLOW IN TRACK SECTOR 7', lap: s.scLap }); ev.push({ type: 'safetyCar', msg: 'SAFETY CAR DEPLOYED', lap: s.scLap }); ev.push({ type: 'green', msg: 'TRACK CLEAR', lap: s.scLap + 4 }); }
  ev.push({ type: 'chequered', msg: 'CHEQUERED FLAG', lap: s.nLaps });
  return ev.sort((a, b) => a.lap - b.lap);
}
function hms(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60; return `0 days ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x.toFixed(3).padStart(6, '0')}000`; }
function incidents(round) {
  const s = simulate(round, 'R'); const r = rng(round * 31);
  const t0 = 3600 + 5 * 60; const L = s.c.base; const out = [];
  const byNum = Object.fromEntries(DRIVERS.map((d) => [d.id, d]));
  const add = (lap, category, flag, scope, sector, message, driverNumber) => out.push({ time: hms(t0 + (lap - 1) * L + r() * L), category, flag, scope, sector, message, lap, driverNumber: driverNumber != null ? String(driverNumber) : null });
  add(1, 'Flag', 'GREEN', 'Track', null, 'GREEN LIGHT - PIT EXIT OPEN', null);
  add(1, 'Drs', '', '', null, 'DRS DISABLED', null);
  add(3, 'Drs', '', '', null, 'DRS ENABLED', null);
  for (const [id, info] of Object.entries(s.dnf)) {
    add(info.lap, 'Flag', 'DOUBLE YELLOW', 'Sector', 7, `DOUBLE YELLOW IN TRACK SECTOR 7`, null);
    add(info.lap, 'Other', '', '', null, `CAR ${byNum[id].num} (${byNum[id].code}) ${info.status === 'Collision' ? 'INVOLVED IN INCIDENT' : 'STOPPED ON TRACK'}`, byNum[id].num);
  }
  if (s.vscLap) { add(s.vscLap, 'SafetyCar', '', '', null, 'VIRTUAL SAFETY CAR DEPLOYED', null); add(s.vscLap + 1, 'SafetyCar', '', '', null, 'VIRTUAL SAFETY CAR ENDING', null); add(s.vscLap + 2, 'Flag', 'GREEN', 'Track', null, 'TRACK CLEAR', null); }
  if (s.scLap) { add(s.scLap, 'SafetyCar', '', '', null, 'SAFETY CAR DEPLOYED', null); add(s.scLap + 3, 'SafetyCar', '', '', null, 'SAFETY CAR IN THIS LAP', null); add(s.scLap + 4, 'Flag', 'GREEN', 'Track', null, 'TRACK CLEAR', null); }
  const a = DRIVERS[4], b = DRIVERS[1], c2 = DRIVERS[14];
  add(12, 'Other', '', '', null, `TURN 4 INCIDENT INVOLVING CARS ${a.num} (${a.code}) AND ${b.num} (${b.code}) NOTED - CAUSING A COLLISION`, null);
  add(14, 'Other', '', '', null, `FIA STEWARDS: NO FURTHER INVESTIGATION FOR TURN 4 INCIDENT INVOLVING CARS ${a.num} (${a.code}) AND ${b.num} (${b.code})`, null);
  add(21, 'Other', '', '', null, `CAR ${c2.num} (${c2.code}) TIME ${fmtLap(80 + r() * 5)} DELETED - TRACK LIMITS AT TURN 9 LAP 21`, c2.num);
  add(27, 'Other', '', '', null, `FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR ${c2.num} (${c2.code}) - LEAVING THE TRACK AND GAINING AN ADVANTAGE`, c2.num);
  for (let k = 0; k < 6; k++) { const d = DRIVERS[15 + (k % 6)]; add(30 + k * 3, 'Flag', 'BLUE', 'Driver', null, `WAVED BLUE FLAG FOR CAR ${d.num} (${d.code}) TIMED AT 14:${30 + k}:12`, d.num); }
  add(s.nLaps, 'Flag', 'CHEQUERED', 'Track', null, 'CHEQUERED FLAG', null);
  out.sort((x, y) => x.time.localeCompare(y.time));
  const drivers = Object.fromEntries(DRIVERS.map((d) => [String(d.num), { code: d.code, name: `${d.first} ${d.last}`, team: TEAMS[d.team].name }]));
  return { season: +SEASON, round, raceName: s.c.raceName, incidents: out, drivers };
}
function ffDrivers(round) {
  const s = simulate(round, 'R');
  return { drivers: s.results.map((x) => ({ number: x.d.num, code: x.d.code, firstName: x.d.first, lastName: x.d.last, team: TEAMS[x.d.team].name, teamColor: TEAMS[x.d.team].color, position: x.position })) };
}
function ffSessions(round) {
  const c = CAL[round - 1]; const sr = scheduleRace(c);
  const names = c.sprint ? [['Practice 1', sr.FirstPractice], ['Sprint Qualifying', sr.SprintQualifying], ['Sprint', sr.Sprint], ['Qualifying', sr.Qualifying], ['Race', sr]] : [['Practice 1', sr.FirstPractice], ['Practice 2', sr.SecondPractice], ['Practice 3', sr.ThirdPractice], ['Qualifying', sr.Qualifying], ['Race', sr]];
  return { year: +SEASON, round, eventName: c.raceName, sessions: names.map(([n, o], i) => ({ key: i + 1, name: n, date: `${o.date} ${o.time.replace('Z', '')}` })) };
}
// Synthetic track: segments of [length m, cornerSpeed km/h]
const TRACK = [[820, 95], [300, 165], [450, 120], [680, 250], [260, 80], [540, 210], [900, 105], [380, 180], [310, 140], [620, 280], [220, 75], [300, 150]];
function telemetry(round, num, lapReq) {
  const s = simulate(round, 'R');
  const d = DRIVERS.find((x) => x.num === +num); if (!d) return { laps: [], telemetry: [], telemetryLap: null };
  const times = s.lapTimes[d.id];
  const best = Math.min(...times); const fastest = times.indexOf(best) + 1;
  const lap = lapReq ? +lapReq : fastest;
  const r = rng(round * 1000 + d.num * 17 + lap);
  const k = 1 - (s.pace[d.id] * 0.012) - (times[lap - 1] - best) * 0.002;
  const tel = []; let dist = 0; const vmax = 330 * k;
  let v = TRACK[TRACK.length - 1][1];
  const ratios = [0, 90, 130, 165, 200, 235, 270, 305, 999];
  for (const [len, cs] of TRACK) {
    const cSp = cs * k;
    const brakeDist = Math.max(0, (v * v - cSp * cSp) / 2600); void brakeDist;
    const steps = Math.round(len / 12);
    for (let i = 0; i < steps; i++) {
      const remain = len - i * 12;
      const bDist = Math.max(0, (v * v - cSp * cSp) / 1150);
      let thr, brk;
      if (remain < bDist && v > cSp + 3) { v -= 12 * (v / 110) * 1.05; thr = 0; brk = true; }
      else if (v < vmax) { v += 12 * (260 / (v + 60)) * 0.55; thr = v < cSp + 20 && remain > len * 0.8 ? 55 + r() * 30 : 100; brk = false; }
      else { thr = 100; brk = false; }
      v = Math.max(60, Math.min(vmax, v)) + gauss(r) * 0.6;
      let g = 1; while (g < 8 && v > ratios[g]) g++;
      const lo = ratios[g - 1], hi = Math.min(ratios[g], 345);
      const rpm = 9500 + ((v - lo) / Math.max(1, hi - lo)) * 2400;
      tel.push({ distance: +dist.toFixed(1), speed: +v.toFixed(1), throttle: +thr.toFixed(0), brake: brk, gear: g, rpm: +Math.min(12400, rpm).toFixed(0), drs: len > 600 && v > 250 && !brk ? 12 : 0 });
      dist += 12;
    }
  }
  const stL = stints(s)[String(d.num)] || [];
  const pitLaps = new Set(s.pits.filter((p) => p.driverId === d.id).map((p) => p.lap));
  const laps = times.map((t, i) => {
    const ln = i + 1; const st = stL.find((x) => ln >= x.lapStart && ln <= x.lapEnd) || stL[0];
    const status = s.scLap && ln >= s.scLap && ln < s.scLap + 4 ? '4' : s.vscLap && ln >= s.vscLap && ln < s.vscLap + 2 ? '6' : '1';
    return { lapNumber: ln, lapTime: +t.toFixed(3), sector1: +(t * 0.31).toFixed(3), sector2: +(t * 0.37).toFixed(3), sector3: +(t * 0.32).toFixed(3), compound: st?.compound || 'MEDIUM', tyreLife: st ? ln - st.lapStart + 1 : ln, stint: st?.stintNumber || 1, isPersonalBest: ln === fastest, trackStatus: status, pitIn: pitLaps.has(ln), pitOut: pitLaps.has(ln - 1), speedI1: +(250 + r() * 30).toFixed(0), speedI2: +(230 + r() * 30).toFixed(0), speedFL: +(270 + r() * 20).toFixed(0), speedST: +(315 + r() * 18).toFixed(0) };
  });
  return { driver: { number: d.num, code: d.code, firstName: d.first, lastName: d.last, team: TEAMS[d.team].name, teamColor: TEAMS[d.team].color }, telemetryLap: lap, laps, telemetry: tel };
}

// ---------- router ----------
function route(p) {
  p = p.replace(/\.json$/, '').replace(/\/+$/, '');
  let m;
  if ((m = p.match(/^\/fastf1\/(\w+)\/(\d+)\/(\d+)(?:\/(\w+))?(?:\/(\w+))?$/))) {
    const [, action, , round, a4, a5] = m; const rd = +round;
    if (rd > COMPLETED && action !== 'sessions') return { error: 'Session not available yet' };
    if (action === 'timeline_extras') { const s = simulate(rd, 'R'); return { stints: stints(s), raceControl: raceControl(s) }; }
    if (action === 'incidents') return incidents(rd);
    if (action === 'drivers') return ffDrivers(rd);
    if (action === 'sessions') return ffSessions(rd);
    if (action === 'telemetry') return telemetry(rd, a4, a5);
    return { error: 'unsupported' };
  }
  if ((m = p.match(/^\/ergast\/f1\/(\d{4}|current)(?:\/(\d+|last))?(?:\/(\w+))?$/))) {
    let [, year, round, what] = m;
    if (year !== 'current' && year !== SEASON) return MR({ RaceTable: { season: year, Races: [] }, StandingsTable: { season: year, StandingsLists: [] } }, 0);
    if (round === 'last') round = String(COMPLETED);
    const rd = round ? +round : null;
    if (!what && !rd) return MR({ RaceTable: { season: SEASON, Races: CAL.map(scheduleRace) } }, CAL.length);
    if (what === 'driverstandings') return driverStandingsPayload(rd || COMPLETED);
    if (what === 'constructorstandings') return constructorStandingsPayload(rd || COMPLETED);
    if (rd && rd > COMPLETED) return MR({ RaceTable: { season: SEASON, round: String(rd), Races: [] } }, 0);
    if (what === 'results') return resultsPayload(rd, 'R');
    if (what === 'sprint') return CAL[rd - 1].sprint ? resultsPayload(rd, 'S') : MR({ RaceTable: { Races: [] } }, 0);
    if (what === 'qualifying') return qualiPayload(rd);
    if (what === 'laps') return lapsPayload(rd);
    if (what === 'pitstops') return pitsPayload(rd);
  }
  return null;
}
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let body;
  try { body = route(u.pathname); } catch (e) { console.error(e); res.writeHead(500); return res.end(String(e)); }
  if (!body) { res.writeHead(404); return res.end('{}'); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}).listen(4010, () => console.log('mock on 4010'));
