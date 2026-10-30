import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERAS, generateQuiz, maxMs, score, SEASONS, seasonsFor, type Question, type Season } from '../src/services/quizService';

const byYear = new Map(SEASONS.map((s) => [s.year, s]));

// Re-derives each statement's truth from the facts, independently of the makers
function truth(q: Question): boolean {
  const s = byYear.get(q.params.year as number) as Season;
  const d = s.drivers.find((x) => x.id === q.params.driverId);
  switch (q.template) {
    case 'quizQChampion': return s.drivers[0].id === q.params.driverId;
    case 'quizQTeamChampion': return s.teams[0].name === q.params.team;
    case 'quizQWins': return d!.wins === q.params.n;
    case 'quizQTeam': return d!.team === q.params.team;
    case 'quizQAhead': return d!.pos < s.drivers.find((x) => x.id === q.params.driver2Id)!.pos;
    case 'quizQCountry': return s.countries.includes(q.params.country as string);
    default: throw new Error(`unknown template ${q.template}`);
  }
}

test('facts cover every season since 1950', () => {
  assert.equal(SEASONS[0].year, 1950);
  for (const s of SEASONS) assert.ok(s.drivers.length && s.countries.length, `${s.year} is empty`);
});

test('the same seed gives the same questions, another seed different ones', () => {
  assert.deepEqual(generateQuiz('abc'), generateQuiz('abc'));
  assert.notDeepEqual(generateQuiz('abc'), generateQuiz('abd'));
});

test('every answer matches the facts, true and false roughly balanced, no repeats', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const qs = generateQuiz(seed);
    assert.equal(qs.length, 150);
    for (const q of qs) assert.equal(q.answer, truth(q), JSON.stringify(q));
    const trues = qs.filter((q) => q.answer).length / qs.length;
    assert.ok(trues > 0.35 && trues < 0.65, `true share ${trues}`);
    assert.equal(new Set(qs.map((q) => JSON.stringify(q))).size, qs.length);
  }
});

test('warm-up questions stay in recent seasons', () => {
  for (const q of generateQuiz('warm').slice(0, 10)) assert.ok((q.params.year as number) >= 2000);
});

test('every era fills a full game from its own seasons', () => {
  for (const [era, [from, to]] of Object.entries(ERAS)) {
    const qs = generateQuiz('era', seasonsFor(era));
    assert.equal(qs.length, 150, era);
    for (const q of qs) {
      const y = q.params.year as number;
      assert.ok(y >= from && y <= to, `${era}: ${y}`);
      assert.equal(q.answer, truth(q), JSON.stringify(q));
    }
  }
  // Before 2000 warms up on its last 20 seasons
  for (const q of generateQuiz('old', seasonsFor('pre2000')).slice(0, 10)) assert.ok((q.params.year as number) >= 1980);
});

test('score counts right answers until the third miss', () => {
  const qs = generateQuiz('score');
  const right = qs.map((q) => q.answer);
  assert.equal(score(qs, right.slice(0, 5)), 5);
  // miss, timeout, miss → over; the right answer after doesn't count
  assert.equal(score(qs, [right[0], !right[1], null, right[3], !right[4], right[5]]), 2);
  assert.equal(score(qs, []), 0);
});

test('maxMs allows every timer plus reveal', () => {
  assert.equal(maxMs(1), 8000 + 1100);
  assert.equal(maxMs(11), 10 * 9100 + 6000 + 1100);
});
