import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { seasonCalendar } from '../src/routes/calendar';
import type { ScheduleRace } from '../src/services/guideRules';

const races: ScheduleRace[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'schedule-2026.json'), 'utf8'));

test('the season as an iCalendar feed', () => {
  const ics = seasonCalendar(2026, races, 'https://www.onthelimit.app');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  // Sepang's race: 2026-10-04 07:00 UTC, two hours long
  const race = ics.split('BEGIN:VEVENT').find((e) => e.includes('UID:2026-16-race@onthelimit'))!;
  assert.match(race, /DTSTART:20261004T070000Z/);
  assert.match(race, /DTEND:20261004T090000Z/);
  assert.match(race.replace(/\r\n /g, ''), /SUMMARY:F1 R16 Bahrain Grand Prix in Malaysia · 레이스/);
  assert.match(race.replace(/\r\n /g, ''), /URL:https:\/\/www.onthelimit.app\/next\/16/);
  // Singapore has a sprint weekend
  assert.ok(ics.includes('UID:2026-17-sprint@onthelimit'));
});

test('long lines fold at 75 octets without splitting a character', () => {
  const ics = seasonCalendar(2026, races, 'https://www.onthelimit.app');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.ok(!ics.includes('�'));
});
