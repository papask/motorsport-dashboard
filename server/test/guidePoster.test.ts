import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { guidePosts, missingForPost } from '../src/services/guidePoster';
import { gpHeading } from '../src/services/threadsService';
import type { ScheduleRace } from '../src/services/guideRules';

const races: ScheduleRace[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'schedule-2026.json'), 'utf8'));

// Sepang as the guide API gave it, trimmed to what the post reads
const ready: any = {
  year: 2026,
  round: 16,
  raceName: 'Bahrain Grand Prix in Malaysia',
  phase: 'upcoming',
  sessions: [
    { key: 'firstPractice', start: '2026-10-02T04:30:00.000Z', timeKnown: true, weather: null },
    { key: 'qualifying', start: '2026-10-03T08:00:00.000Z', timeKnown: true, weather: null },
    { key: 'race', start: '2026-10-04T07:00:00.000Z', timeKnown: true, weather: { temp: 29, rain: 75, kind: 'rain' } },
  ],
  championship: {
    afterRound: 15,
    drivers: [
      { position: 1, code: 'ANT', name: 'Andrea Kimi Antonelli', points: 302, gap: 0 },
      { position: 2, code: 'RUS', name: 'George Russell', points: 236, gap: -66 },
      { position: 3, code: 'HAM', name: 'Lewis Hamilton', points: 199, gap: -103 },
      { position: 4, code: 'NOR', name: 'Lando Norris', points: 186, gap: -116 },
    ],
  },
  penalties: {
    checkedAt: '2026-09-27T09:00:00Z',
    carried: [{ code: 'COL', driver: 'Franco Colapinto', gridDrop: 5, pitLaneStart: false }],
    weekend: [],
  },
  notices: { firstTime: false, lastHeld: 2017, yearsSince: 9, noTelemetry: true },
  history: { races: 19 },
  grid: { drivers: [] },
  track: null,
  lastRace: null,
};

test('ready once the previous race is fully in', () => {
  assert.deepEqual(missingForPost(ready, races), []);
  assert.deepEqual(missingForPost({ ...ready, championship: { ...ready.championship, afterRound: 14 } }, races), ['standings after R15']);
  // Baku started 11:00 UTC on the 26th; its decisions are counted as in four hours later
  assert.deepEqual(missingForPost({ ...ready, penalties: { ...ready.penalties, checkedAt: '2026-09-26T14:00:00Z' } }, races), ['decisions after R15']);
  const noForecast = { ...ready, sessions: ready.sessions.map((s: any) => ({ ...s, weather: null })) };
  assert.deepEqual(missingForPost(noForecast, races), ['race forecast']);
  const withTelemetry = { ...ready, notices: { ...ready.notices, noTelemetry: false } };
  assert.deepEqual(missingForPost(withTelemetry, races), ['pole lap profile']);
});

test('the post: Korea time, top 3, grid penalties so far', () => {
  const [post, ...more] = guidePosts(ready, 'https://www.onthelimit.app');
  assert.equal(more.length, 0);
  assert.equal(post, [
    '2026 16 라운드 바레인 그랑프리 (말레이시아) 가이드',
    '🔗 https://www.onthelimit.app/next/16',
    '',
    '🗓 레이스 10/4 (일) 16:00 · 퀄리파잉 10/3 (토) 17:00 (KST)',
    '🏆 1위 안드레아 키미 안토넬리 302 · 2위 조지 러셀 236 (−66) · 3위 루이스 해밀턴 199 (−103)',
    '⛔ 현재까지 그리드 페널티: 프랑코 콜라핀토 −5',
    '🌧 레이스 시각 29° · 강수 확률 75%',
    '📍 2017년 이후 9년 만의 개최',
  ].join('\n'));
  const none = guidePosts({ ...ready, penalties: { ...ready.penalties, carried: [] } }, '')[0];
  assert.match(none, /현재까지 그리드 페널티: 없음/);
});

test('an event held away from home keeps its name and adds the host', () => {
  assert.equal(gpHeading(2026, 16, 'Bahrain Grand Prix in Malaysia'), '2026 16 라운드 바레인 그랑프리 (말레이시아)');
  assert.equal(gpHeading(2026, 15, 'Azerbaijan Grand Prix'), '2026 15 라운드 아제르바이잔 그랑프리');
});
