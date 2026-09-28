import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weather-'));
process.env.DATA_DIR = dataDir;

let calls = 0;
let failNext = false;
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async () => {
    calls++;
    if (failNext) throw new Error('offline');
    return new Response(JSON.stringify({
      hourly: {
        time: ['2026-10-04T06:00', '2026-10-04T07:00'],
        temperature_2m: [30.4, 29.1],
        precipitation_probability: [40, 75],
        weather_code: [3, 61],
      },
    }));
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const RACE = '2026-10-04T07:00:00.000Z';
const raceStart = Date.parse(RACE);

test('the hour a session starts in, saved, refetched at most hourly, frozen at lights out', async () => {
  const { sessionWeather } = await import('../src/services/weatherService');
  const first = await sessionWeather(2026, 16, 2.76, 101.74, [RACE], raceStart, raceStart - 5 * 3600_000);
  assert.deepEqual(first?.sessions[RACE], { temp: 29, rain: 75, kind: 'rain' });
  assert.equal(calls, 1);

  await sessionWeather(2026, 16, 2.76, 101.74, [RACE], raceStart, raceStart - 4.5 * 3600_000);
  assert.equal(calls, 1, 'within the hour: the saved forecast');

  failNext = true;
  const stale = await sessionWeather(2026, 16, 2.76, 101.74, [RACE], raceStart, raceStart - 2 * 3600_000);
  assert.equal(calls, 2);
  assert.deepEqual(stale?.sessions[RACE], first?.sessions[RACE], 'a failed refresh keeps the older forecast');

  const frozen = await sessionWeather(2026, 16, 2.76, 101.74, [RACE], raceStart, raceStart + 60_000);
  assert.equal(calls, 2, 'after lights out nothing is fetched');
  assert.deepEqual(frozen?.sessions[RACE], first?.sessions[RACE]);
});

test('a session beyond the forecast has none', async () => {
  const { sessionWeather } = await import('../src/services/weatherService');
  failNext = false;
  const later = '2026-10-25T19:00:00.000Z';
  const w = await sessionWeather(2026, 18, 30.13, -97.64, [later], Date.parse(later), Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(w?.sessions[later], null);
});
