import facts from '../quiz/facts.json';

// True/false F1 quiz. Questions come from a seed, so the server can rebuild a
// game's exact questions when its answers are submitted and score it itself.

export interface Season {
  year: number;
  drivers: { id: string; name: string; team: string; pos: number; wins: number }[];
  teams: { name: string; pos: number; wins: number }[];
  countries: string[];
}

export interface Question {
  template: string; // a messages.ts key on the client
  params: Record<string, string | number>;
  answer: boolean;
}

export const SEASONS = (facts as { seasons: Season[] }).seasons;
export const LIVES = 3;
export const QUESTION_COUNT = 150;
const RECENT_FROM = 2000; // the first questions stay with seasons most fans watched
const WARMUP = 10;

// Each era is its own game with its own leaderboard
export const ERAS: Record<string, [from: number, to: number]> = {
  all: [1950, 9999],
  pre2000: [1950, 1999],
  '2000s': [2000, 2009],
  '2010s': [2010, 2019],
  '2020s': [2020, 2029],
};
export const seasonsFor = (era: string) => SEASONS.filter((s) => s.year >= ERAS[era][0] && s.year <= ERAS[era][1]);

// Seconds to answer question n (1-based); mirrored in the client's timer.
export const timeLimit = (n: number) => (n <= 10 ? 8 : n <= 20 ? 6 : 5);
export const REVEAL_MS = 1100;

// FNV-1a and mulberry32, as in WhoFirst
export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619);
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T>(rng: Rng, xs: T[]): T => xs[Math.floor(rng() * xs.length)];
const driverParams = (d: Season['drivers'][number], suffix = '') => ({ [`driver${suffix}Id`]: d.id, [`driver${suffix}`]: d.name });

// Each maker returns a statement plus whether it's true, or null when the
// season can't support it (no constructors' title before 1958, etc.).
type Maker = (s: Season, top: Season['drivers'], truth: boolean, rng: Rng, all: Season[]) => Question | null;

const MAKERS: Maker[] = [
  // {year} drivers' champion is {driver}
  (s, _top, truth, rng) => {
    const champ = s.drivers[0];
    const d = truth ? champ : pick(rng, s.drivers.slice(1, 6));
    return d ? { template: 'quizQChampion', params: { year: s.year, ...driverParams(d) }, answer: d === champ } : null;
  },
  // {year} constructors' champion is {team}
  (s, _top, truth, rng) => {
    if (s.teams.length < 2) return null;
    const t = truth ? s.teams[0] : pick(rng, s.teams.slice(1, 5));
    return { template: 'quizQTeamChampion', params: { year: s.year, team: t.name }, answer: t === s.teams[0] };
  },
  // {driver} won {n} races in {year}
  (s, top, truth, rng) => {
    const d = pick(rng, top);
    let n = d.wins;
    if (!truth) {
      const off = 1 + Math.floor(rng() * 3);
      n = d.wins - off >= 0 && rng() < 0.5 ? d.wins - off : d.wins + off;
    }
    return { template: 'quizQWins', params: { year: s.year, ...driverParams(d), n }, answer: n === d.wins };
  },
  // {driver} drove for {team} in {year}
  (s, top, truth, rng) => {
    // ponytail: standings list one team per driver, so a mid-season move could make a
    // "false" team actually true; kept to 1990+ where moves are rare. Use race results to be exact.
    if (s.year < 1990) return null;
    const d = pick(rng, top);
    const others = [...new Set(s.drivers.map((x) => x.team))].filter((t) => t !== d.team);
    const team = truth || !others.length ? d.team : pick(rng, others);
    return { template: 'quizQTeam', params: { year: s.year, ...driverParams(d), team }, answer: team === d.team };
  },
  // {driver} finished ahead of {driver2} in {year}: truth falls out of the pair
  (s, top, _truth, rng) => {
    const a = pick(rng, top);
    const b = pick(rng, top.filter((x) => x !== a));
    return b ? { template: 'quizQAhead', params: { year: s.year, ...driverParams(a), ...driverParams(b, '2') }, answer: a.pos < b.pos } : null;
  },
  // A Grand Prix was held in {country} in {year}
  (s, _top, truth, rng, all) => {
    const elsewhere = [...new Set(all.flatMap((x) => x.countries))].filter((c) => !s.countries.includes(c));
    const country = truth || !elsewhere.length ? pick(rng, s.countries) : pick(rng, elsewhere);
    return { template: 'quizQCountry', params: { year: s.year, country }, answer: s.countries.includes(country) };
  },
];

export function generateQuiz(seed: string, seasons: Season[] = SEASONS, count = QUESTION_COUNT): Question[] {
  const rng = mulberry32(hash(seed));
  // Before 2000 only, the warm-up falls back to the era's last 20 seasons
  const recent = seasons.some((s) => s.year >= RECENT_FROM) ? seasons.filter((s) => s.year >= RECENT_FROM) : seasons.slice(-20);
  const seen = new Set<string>();
  const out: Question[] = [];
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const warm = out.length < WARMUP;
    const s = pick(rng, warm ? recent : seasons);
    const top = s.drivers.slice(0, warm ? 5 : 12);
    const q = pick(rng, MAKERS)(s, top, rng() < 0.5, rng, seasons);
    const key = q && JSON.stringify(q);
    if (!q || seen.has(key!)) continue;
    seen.add(key!);
    out.push(q);
  }
  return out;
}

// Replays submitted answers (null = timed out) and returns how many were right
// before the last life went.
export function score(questions: Question[], answers: (boolean | null)[]): number {
  let right = 0;
  let wrong = 0;
  for (let i = 0; i < answers.length && i < questions.length && wrong < LIVES; i++) {
    if (answers[i] === questions[i].answer) right++;
    else wrong++;
  }
  return right;
}

// The longest a game with this many answers can honestly take: every timer run
// out plus every reveal.
export function maxMs(answered: number): number {
  let ms = 0;
  for (let n = 1; n <= answered; n++) ms += timeLimit(n) * 1000 + REVEAL_MS;
  return ms;
}
