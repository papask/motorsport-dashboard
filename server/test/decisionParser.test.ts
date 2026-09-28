import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { parseDecision, parseEntryList, affectsGrid } from '../src/services/decisionParser';

// Texts extracted from real FiA decision PDFs (unpdf, pages merged)
const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', 'decisions', `${name}.txt`), 'utf8');

function parsed(name: string) {
  const result = parseDecision(fixture(name));
  assert.equal(result.status, 'parsed', name);
  return (result as Extract<typeof result, { status: 'parsed' }>).decision;
}

test('time penalty converted to a grid drop at the next race', () => {
  const d = parsed('colapinto-next-race-grid');
  assert.equal(d.doc, 66);
  assert.equal(d.car, 43);
  assert.equal(d.driver, 'Franco Colapinto');
  assert.equal(d.competitor, 'BWT Alpine F1 Team');
  assert.equal(d.session, 'Race');
  assert.equal(d.fact, 'Collision with Car 10 in Turn 1');
  assert.equal(d.gridDrop, 5);
  assert.equal(d.timePenaltySec, undefined, 'the time penalty was converted, not served');
  assert.ok(affectsGrid(d));
});

test('grid drops and pit lane starts', () => {
  assert.equal(parsed('impeding-grid-drop').gridDrop, 3);
  assert.equal(parsed('pu-grid-drop').gridDrop, 10);
  assert.equal(parsed('pu-grid-drop').session, 'Qualifying');
  assert.equal(parsed('pit-lane-start-changes').pitLaneStart, true);
  assert.equal(parsed('pu-pit-lane').pitLaneStart, true);
  assert.equal(parsed('pu-pit-lane').driver, 'Fernando Alonso');
});

test('reprimands keep the season count the stewards print', () => {
  assert.deepEqual(parsed('reprimand-3rd').reprimand, { count: 3, kind: 'Driving' });
  assert.equal(parsed('reprimand-3rd').car, 11);
  assert.deepEqual(parsed('reprimand-1st').reprimand, { count: 1, kind: 'Driving' });
  assert.equal(affectsGrid(parsed('reprimand-3rd')), false);
});

test('penalties that do not touch the grid', () => {
  const time = parsed('time-penalty');
  assert.equal(time.timePenaltySec, 10);
  assert.equal(affectsGrid(time), false);
  assert.equal(parsed('warning').warning, true);
  assert.equal(parsed('penalty-lap').penaltyLaps, 1);
  assert.equal(parsed('fine-unsafe-release').fine, '€5,000');
  assert.equal(parsed('fine-unsafe-release').session, 'Qualifying');
  assert.equal(parsed('no-further-action').noFurtherAction, true);
});

test('2025 decisions still carry penalty points', () => {
  const d = parsed('2025-penalty-points');
  assert.equal(d.timePenaltySec, 5);
  assert.deepEqual(d.penaltyPoints, { points: 1, total: 6 });
  assert.equal(d.driver, 'Lance Stroll');
});

test('a summons is not a decision', () => {
  assert.equal(parseDecision(fixture('summons')).status, 'not_decision');
});

test('other documents are not decisions, and a broken form is unreadable', () => {
  assert.equal(parseDecision('2026 ITALIAN GRAND PRIX Provisional Classification').status, 'not_decision');
  assert.equal(parseDecision('From The Stewards To The Team Manager Something unexpected').status, 'unreadable');
});

test('a corrected decision names the document it replaces', () => {
  const text = fixture('colapinto-next-race-grid').replace('Document 66', 'Document 71 This document replaces Document 66');
  const result = parseDecision(text);
  assert.equal(result.status, 'parsed');
  if (result.status === 'parsed') {
    assert.equal(result.decision.doc, 71);
    assert.equal(result.decision.replacesDoc, 66);
  }
});

test('an entry list gives each car its number and driver', () => {
  const cars = parseEntryList(fs.readFileSync(path.join(__dirname, 'fixtures', 'entry-list-baku.txt'), 'utf8'))!;
  assert.equal(cars.length, 22);
  assert.deepEqual(cars[0], { number: 81, code: 'PIA', name: 'Oscar Piastri', entrant: 'McLaren Mastercard F1 Team McLaren Mercedes' });
  assert.deepEqual(cars.find((c) => c.code === 'ANT')?.name, 'Kimi Antonelli');
  assert.equal(parseEntryList('No. TLA Driver Nat Team Constructor'), null);
});
