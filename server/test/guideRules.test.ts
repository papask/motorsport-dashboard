import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { parseDecision } from '../src/services/decisionParser';
import {
  canClinchAt, circuitNotices, gridPenaltiesFor, guidePhase, guideRace, regulationChange,
  remainingMax, startOf, SWITCH_AFTER_MS, targetRound,
  type DatedDecision, type ScheduleRace,
} from '../src/services/guideRules';

// The 2026 calendar as Jolpica served it (getSeasonSchedule)
const races: ScheduleRace[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'schedule-2026.json'), 'utf8'));
const byName = (name: string) => races.find((r) => r.raceName === name)!;
const sepang = byName('Bahrain Grand Prix in Malaysia');
const monza = byName('Italian Grand Prix');

function decision(name: string, event: string, published: string): DatedDecision {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'decisions', `${name}.txt`), 'utf8');
  const result = parseDecision(text);
  assert.equal(result.status, 'parsed');
  return { url: `https://fia.test/${name}.pdf`, event, published, decision: (result as any).decision };
}

test('the guide moves on four hours after lights out', () => {
  const baku = byName('Azerbaijan Grand Prix');
  assert.equal(guideRace(races, startOf(baku) + SWITCH_AFTER_MS - 1)?.round, baku.round);
  assert.equal(guideRace(races, startOf(baku) + SWITCH_AFTER_MS)?.round, sepang.round);
  assert.equal(guideRace(races, Date.parse('2026-09-28T00:00:00Z'))?.round, 16);
  assert.equal(guideRace(races, Date.parse('2027-01-01T00:00:00Z')), undefined, 'season over');
});

test('weekend phases', () => {
  const fp1 = startOf(sepang.firstPractice!);
  assert.equal(guidePhase(sepang, fp1 - 1), 'upcoming');
  assert.equal(guidePhase(sepang, fp1), 'weekend');
  assert.equal(guidePhase(sepang, startOf(sepang)), 'race');
  assert.equal(guidePhase(sepang, startOf(sepang) + SWITCH_AFTER_MS), 'finished');
});

test('what one driver or team can still score from Sepang', () => {
  // 8 races and the Singapore sprint left, no fastest-lap point since 2025
  assert.deepEqual(remainingMax(races, 16, 2026), { races: 8, sprints: 1, driver: 208, constructor: 359 });
  assert.equal(remainingMax(races, 16, 2024).driver, 8 * 26 + 8, 'the fastest-lap point counted up to 2024');
});

test('when a title can be settled', () => {
  // A 66-point lead can't be settled at Sepang: 66 + 25 is less than the 183 still to score after it
  assert.equal(canClinchAt(66, races, 16, 2026, 'driver'), false);
  assert.equal(canClinchAt(160, races, 16, 2026, 'constructor'), false);
  // Going into the last race, any lead that a 25-point swing can't cover is enough
  assert.equal(canClinchAt(1, races, 22, 2026, 'driver'), true);
  assert.equal(canClinchAt(0, races, 23, 2026, 'driver'), true);
  // Standings still after R16 when looking at R18: R17 (with its sprint) and R18
  // add up to 58, against 125 still to score after R18
  assert.equal(canClinchAt(67, races, 18, 2026, 'driver', 17), false);
  assert.equal(canClinchAt(68, races, 18, 2026, 'driver', 17), true);
});

test('notices from the circuit history', () => {
  const sepangSeasons = Array.from({ length: 19 }, (_, i) => 1999 + i); // 1999–2017
  assert.deepEqual(circuitNotices(sepangSeasons, 2026), {
    firstTime: false, lastHeld: 2017, yearsSince: 9, noTelemetry: true, notHeldLastYear: true,
  });
  assert.deepEqual(circuitNotices([], 2023), {
    firstTime: true, lastHeld: null, yearsSince: null, noTelemetry: true, notHeldLastYear: true,
  });
  const yearly = circuitNotices([2021, 2022, 2023, 2024, 2025], 2026);
  assert.equal(yearly.yearsSince, null);
  assert.equal(yearly.notHeldLastYear, false);
  assert.equal(yearly.noTelemetry, false);
});

test('regulation eras', () => {
  assert.equal(regulationChange(2025, 2026)?.from, 2026);
  assert.equal(regulationChange(2026, 2027), null);
  assert.equal(regulationChange(2023, 2024), null);
});

test('a grid penalty applies to the first race after it was published', () => {
  const colapinto = decision('colapinto-next-race-grid', 'Azerbaijan Grand Prix', '2026-09-26T17:29:00Z');
  assert.equal(targetRound(races, colapinto.published), 16);
  const { carried, weekend } = gridPenaltiesFor(races, 16, [colapinto]);
  assert.equal(carried.length, 1);
  assert.equal(carried[0].decision.gridDrop, 5);
  assert.equal(weekend.length, 0);
  assert.equal(gridPenaltiesFor(races, 15, [colapinto]).carried.length, 0, 'not the race it came from');
});

test('penalties handed out during a weekend apply to that race', () => {
  const impeding = decision('impeding-grid-drop', 'Italian Grand Prix', '2026-09-05T16:24:00Z');
  const puPitLane = decision('pu-pit-lane', 'Italian Grand Prix', '2026-09-06T10:40:00Z');
  const reprimand = decision('reprimand-3rd', 'Italian Grand Prix', '2026-09-06T13:33:00Z');
  const { carried, weekend } = gridPenaltiesFor(races, monza.round, [impeding, puPitLane, reprimand]);
  assert.equal(carried.length, 0);
  assert.deepEqual(weekend.map((d) => d.decision.car), [81, 14], 'grid only, in publication order');
});

test('a guide freezes at lights out', () => {
  const late = decision('pu-grid-drop', 'Italian Grand Prix', new Date(startOf(monza) + 60_000).toISOString());
  assert.equal(gridPenaltiesFor(races, monza.round, [late]).weekend.length, 0);
});

test('a replaced decision drops out', () => {
  const original = decision('colapinto-next-race-grid', 'Azerbaijan Grand Prix', '2026-09-26T17:29:00Z');
  const correction: DatedDecision = {
    ...original,
    url: 'https://fia.test/corrected.pdf',
    published: '2026-09-26T18:00:00Z',
    decision: { ...original.decision, doc: 71, replacesDoc: 66, gridDrop: 3 },
  };
  const { carried } = gridPenaltiesFor(races, 16, [original, correction]);
  assert.deepEqual(carried.map((d) => d.decision.gridDrop), [3]);
});
