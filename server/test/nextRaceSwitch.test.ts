import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';

// The services read DATA_DIR when first imported, so each run gets a fresh one
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-race-'));
process.env.DATA_DIR = dataDir;

// Any outside call fails the test: Jolpica goes through axios, the FIA through fetch
const outsideCalls: string[] = [];
let restoreFetch: typeof fetch;

before(async () => {
  const axios = (await import('axios')).default;
  axios.defaults.adapter = async (config) => {
    outsideCalls.push(String(config.url));
    throw new Error('outside call');
  };
  restoreFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    outsideCalls.push(String(url));
    throw new Error('outside call');
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = restoreFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function get(app: import('express').Express, url: string) {
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    return await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${url}`, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      }).on('error', reject);
    });
  } finally {
    server.close();
  }
}

test('off by default, and off means no outside calls and no guide', async () => {
  const settings = await import('../src/services/nextRaceSettings');
  const { refreshGuides, guideBuilderStatus } = await import('../src/services/guideBuilder');
  const { catchUpDecisions, decisionEntries } = await import('../src/services/stewardDecisions');
  const express = (await import('express')).default;
  const nextRace = (await import('../src/routes/nextRace')).default;
  const calendar = (await import('../src/routes/calendar')).default;

  assert.equal(settings.nextRaceEnabled(), false);
  await refreshGuides();
  await catchUpDecisions();
  assert.deepEqual(outsideCalls, []);
  assert.equal(guideBuilderStatus().lastBuild, null);
  assert.equal(decisionEntries().length, 0);
  assert.equal(fs.existsSync(path.join(dataDir, 'guides')), false);

  const app = express();
  app.use('/api/next-race', nextRace);
  app.use('/api', calendar);
  assert.equal((await get(app, '/api/next-race')).status, 404);
  assert.equal((await get(app, '/api/next-race/2026/16')).status, 404);
  assert.equal((await get(app, '/api/calendar.ics')).status, 404);
  assert.deepEqual(outsideCalls, []);
});

test('flipping the switch is saved and announced', async () => {
  const settings = await import('../src/services/nextRaceSettings');
  const seen: boolean[] = [];
  settings.onNextRaceToggle((on) => seen.push(on));
  settings.setNextRaceEnabled(true);
  settings.setNextRaceEnabled(true); // no change, no announcement
  settings.setNextRaceEnabled(false);
  assert.deepEqual(seen, [true, false]);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'next-race-settings.json'), 'utf8'));
  assert.deepEqual(saved, { enabled: false });
  assert.throws(() => settings.assertNextRaceEnabled(), settings.NextRaceDisabledError);
});

test('the calendar follows the guide unless pinned', async () => {
  const settings = await import('../src/services/nextRaceSettings');
  settings.setNextRaceEnabled(true);
  assert.equal(settings.calendarEnabled(), true);
  settings.setCalendarEnabled(true);
  settings.setNextRaceEnabled(false);
  assert.equal(settings.calendarEnabled(), true, 'pinned on: subscribers keep their feed');
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'next-race-settings.json'), 'utf8'));
  assert.deepEqual(saved, { enabled: false, calendar: true });
  settings.setCalendarEnabled(null);
  assert.equal(settings.calendarEnabled(), false, 'unpinned: follows the guide again');
});
