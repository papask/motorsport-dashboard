import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settledTtl } from '../src/services/jolpicaService';

const BASE = 'https://api.jolpi.ca/ergast/f1';
const now = Date.parse('2026-10-19T00:00:00Z');
const race = (date: string) => ({ MRData: { RaceTable: { Races: [{ round: '17', date, time: '12:00:00Z' }] } } });

test('a race three days gone is cached for a day; a fresh one keeps the default', () => {
  assert.equal(settledTtl(`${BASE}/2026/17/results/`, race('2026-10-10'), now), 86400);
  assert.equal(settledTtl(`${BASE}/2026/17/results/`, race('2026-10-17'), now), undefined);
});

test('a past season is cached for a day; this season without a round keeps the default', () => {
  assert.equal(settledTtl(`${BASE}/2025/driverstandings/`, {}, now), 86400);
  assert.equal(settledTtl(`${BASE}/2026/driverstandings/`, {}, now), undefined);
  assert.equal(settledTtl(`${BASE}/circuits/monza/results/`, {}, now), undefined);
});
