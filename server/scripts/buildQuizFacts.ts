// Collects every finished season's final standings and calendar into
// src/quiz/facts.json, the data the quiz builds its questions from.
// Rerun once a season ends: npm run quiz:facts
import fs from 'fs';
import path from 'path';
import { getConstructorStandings, getDriverStandings, getSeasonSchedule } from '../src/services/jolpicaService';

const OUT = path.resolve(__dirname, '..', 'src', 'quiz', 'facts.json');
const FIRST = 1950;
const LAST = new Date().getFullYear() - 1; // the current season isn't settled yet

// Jolpica's hourly limit runs out over ~230 calls; wait it out instead of failing
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch (e: any) {
      if (e.statusCode !== 429) throw e;
      const s = Math.max(e.retryAfterSeconds ?? 0, 30);
      console.log(`rate limited, waiting ${s}s`);
      await new Promise((r) => setTimeout(r, s * 1000));
    }
  }
}

async function main() {
  const seasons = [];
  for (let year = FIRST; year <= LAST; year++) {
    // 'last' round: final standings without the extra previous-round call
    const d = await retry(() => getDriverStandings(year, 'last'));
    const c = await retry(() => getConstructorStandings(year, 'last')); // empty before 1958, when the title began
    const s = await retry(() => getSeasonSchedule(year));
    seasons.push({
      year,
      drivers: d.standings.map((x: any) => ({
        id: x.driver.id,
        name: `${x.driver.firstName} ${x.driver.lastName}`,
        team: x.constructor.name,
        pos: x.position,
        wins: x.wins,
      })),
      teams: c.standings.map((x: any) => ({ name: x.constructor.name, pos: x.position, wins: x.wins })),
      countries: [...new Set(s.races.map((r: any) => r.circuit.country as string))],
    });
    console.log(year, d.standings.length, c.standings.length, s.races.length);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ seasons }) + '\n');
  console.log(`wrote ${seasons.length} seasons → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
