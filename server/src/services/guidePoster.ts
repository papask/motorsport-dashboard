import fs from 'fs';
import path from 'path';
import { getSeasonSchedule } from './jolpicaService';
import { guideRace, startOf, SWITCH_AFTER_MS, type ScheduleRace } from './guideRules';
import { guideThreadsEnabled, nextRaceEnabled, onNextRaceToggle } from './nextRaceSettings';
import { gpHeading, packPosts, postToThreads, threadsStatus } from './threadsService';
import { DRIVERS_KO } from './resultsPoster';
import { guideFor } from '../routes/nextRace';

// Posts each race's guide to Threads once, as soon as everything on it is in:
// the previous race's standings and stewards' decisions, the circuit data and
// the race forecast. Checked hourly; never after practice has started, and
// only while the guide, its Threads switch and the Threads switch are all on.

const POSTED_FILE = path.join(process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data'), 'guides', 'threads-posted.json');
const CHECK_EVERY_MS = 60 * 60 * 1000;

type Guide = NonNullable<Awaited<ReturnType<typeof guideFor>>>;

/** What the guide is still waiting for; empty when it is ready to post. */
export function missingForPost(g: Guide, races: ScheduleRace[]): string[] {
  const missing: string[] = [];
  if (!g.history || !g.grid) missing.push('circuit history');
  const prev = races.find((r) => r.round === g.round - 1);
  if (prev) {
    if (g.championship?.afterRound !== prev.round) missing.push(`standings after R${prev.round}`);
    // The watcher has looked at the FIA page since the previous race's decisions were due
    const checked = g.penalties.checkedAt ? Date.parse(g.penalties.checkedAt) : 0;
    if (checked < startOf(prev) + SWITCH_AFTER_MS) missing.push(`decisions after R${prev.round}`);
  }
  if (g.notices && !g.notices.noTelemetry && (!g.track || !g.lastRace)) missing.push('pole lap profile');
  if (!g.sessions.find((s) => s.key === 'race')?.weather) missing.push('race forecast');
  return missing;
}

// "10/4 (일) 16:00", in Korea time: the posts are for Korean fans
function kst(iso: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.month}/${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute}`;
}

const SESSION_KO = { sprint: '스프린트', qualifying: '퀄리파잉', race: '레이스' } as const;
const SKY = { clear: '☀️', cloud: '☁️', rain: '🌧', storm: '⛈' } as const;
const koName = (code?: string, name?: string | null) => (code && DRIVERS_KO[code]) || name || code || '';

/** The guide as Threads posts: fixed wording from the guide's own numbers, no AI. */
export function guidePosts(g: Guide, site: string) {
  const lines: string[] = [];
  const when = (['race', 'qualifying', 'sprint'] as const)
    .map((key) => g.sessions.find((s) => s.key === key && s.timeKnown))
    .filter((s) => !!s)
    .map((s) => `${SESSION_KO[s!.key as keyof typeof SESSION_KO]} ${kst(s!.start)}`);
  if (when.length) lines.push(`🗓 ${when.join(' · ')} (KST)`);
  if (g.championship) {
    lines.push(`🏆 ${g.championship.drivers.slice(0, 3).map((d: { position: number; code: string; name: string; points: number; gap: number }) =>
      `${d.position}위 ${koName(d.code, d.name)} ${d.points}${d.gap ? ` (−${Math.abs(d.gap)})` : ''}`).join(' · ')}`);
  }
  const grid = [...g.penalties.carried, ...g.penalties.weekend]
    .map((p) => `${koName(p.code, p.driver)} ${p.pitLaneStart ? '피트레인 출발' : `−${p.gridDrop}`}`);
  lines.push(`⛔ 현재까지 그리드 페널티: ${grid.length ? grid.join(' · ') : '없음'}`);
  const race = g.sessions.find((s) => s.key === 'race')?.weather;
  if (race) lines.push(`${SKY[race.kind]} 레이스 시각 ${race.temp}° · 강수 확률 ${race.rain}%`);
  if (g.notices?.firstTime) lines.push('📍 첫 개최 서킷');
  else if (g.notices?.yearsSince) lines.push(`📍 ${g.notices.lastHeld}년 이후 ${g.notices.yearsSince}년 만의 개최`);

  const head = [`${gpHeading(g.year, g.round, g.raceName)} 가이드`, site && `🔗 ${site}/next/${g.round}`]
    .filter(Boolean).join('\n');
  return packPosts([[head, ''], ...lines.map((line, i): [string, string] => [line, i ? '\n' : '\n\n'])]);
}

function readPosted(): string[] {
  try {
    return JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
  } catch {
    return [];
  }
}

let checking = false;

export async function checkGuidePost(now = Date.now()) {
  if (checking || !nextRaceEnabled() || !guideThreadsEnabled()) return;
  const threads = threadsStatus();
  if (!threads.enabled || !threads.hasToken) return; // posting would silently do nothing, and it would be marked done
  checking = true;
  try {
    const year = new Date(now).getUTCFullYear();
    const { races } = await getSeasonSchedule(year);
    const race: ScheduleRace | undefined = guideRace(races, now);
    if (!race) return;
    const key = `${year}-${race.round}`;
    if (readPosted().includes(key)) return;
    const g = await guideFor(year, race.round, now);
    if (!g || g.phase !== 'upcoming') return; // practice under way: too late to be useful
    const missing = missingForPost(g, races);
    if (missing.length) {
      console.log(`[NextRace] Threads post ${key} waiting for: ${missing.join(', ')}`);
      return;
    }
    await postToThreads(guidePosts(g, process.env.SITE_URL ?? ''));
    // Recorded after posting: a failure is tried again on the next check
    fs.mkdirSync(path.dirname(POSTED_FILE), { recursive: true });
    fs.writeFileSync(POSTED_FILE, JSON.stringify([...readPosted(), key]));
    console.log(`[NextRace] Threads post ${key} published`);
  } catch (err: any) {
    console.error('[NextRace] Threads post failed:', err.message);
  } finally {
    checking = false;
  }
}

let timer: NodeJS.Timeout | undefined;

function schedule() {
  clearTimeout(timer);
  timer = undefined;
  if (!nextRaceEnabled()) return;
  checkGuidePost();
  timer = setTimeout(schedule, CHECK_EVERY_MS);
}

export function startGuidePoster() {
  onNextRaceToggle(schedule);
  schedule();
}
