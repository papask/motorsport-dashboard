import fs from 'fs';
import path from 'path';
import { getSeasonSchedule } from './jolpicaService';
import { getSessionResults } from './fastf1Service';
import { gpHeading, packPosts, postToThreads, threadsStatus } from './threadsService';

// Posts each session's classification (sprint qualifying, sprint, qualifying,
// race) to Threads once it is out. Every 5 minutes, sessions that should have
// ended are checked through FastF1 until results appear; each one is posted
// once, recorded on the data disk so a restart doesn't post it again.

const POSTED_FILE = path.join(
  process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data'),
  'threads-results.json',
);
const CHECK_EVERY_MS = 5 * 60 * 1000;
// Past this, a session whose results never showed up is dropped
const GIVE_UP_AFTER_MS = 8 * 60 * 60 * 1000;

// Scheduled length; checks start once it has passed (red flags just mean a few empty checks)
const SESSIONS = [
  { id: 'SQ', key: 'sprintQualifying', name: '스프린트 퀄리파잉', minutes: 45 },
  { id: 'S', key: 'sprint', name: '스프린트', minutes: 45 },
  { id: 'Q', key: 'qualifying', name: '퀄리파잉', minutes: 60 },
  { id: 'R', key: 'race', name: '레이스', minutes: 120 },
] as const;

// By FastF1 abbreviation, which every session carries (sprint qualifying has
// no driver ids). Names follow client/src/constants/koreanTerms.ts.
const DRIVERS_KO: Record<string, string> = {
  VER: '막스 베르스타펜', HAM: '루이스 해밀턴', NOR: '랜도 노리스', LEC: '샤를 르클레르', SAI: '카를로스 사인츠',
  PIA: '오스카 피아스트리', RUS: '조지 러셀', PER: '세르히오 페레즈', ALO: '페르난도 알론소', STR: '랜스 스트롤',
  GAS: '피에르 가슬리', OCO: '에스테반 오콘', ALB: '알렉산더 알본', TSU: '유키 츠노다', BOT: '발테리 보타스',
  ZHO: '저우 관위', MAG: '케빈 마그누센', HUL: '니코 휠켄베르크', RIC: '다니엘 리카르도', SAR: '로건 사전트',
  LAW: '리암 로슨', LIN: '아르비드 린드블라드', BEA: '올리버 베어만', COL: '프랑코 콜라핀토', DOO: '잭 두한',
  ANT: '안드레아 키미 안토넬리', HAD: '아이작 하자르', BOR: '가브리엘 보르톨레토',
};
const TEAMS_KO: Record<string, string> = {
  McLaren: '맥라렌', Mercedes: '메르세데스', 'Red Bull Racing': '레드불', Ferrari: '페라리', Williams: '윌리엄스',
  'Racing Bulls': '레이싱 불스', 'Aston Martin': '애스턴 마틴', 'Haas F1 Team': '하스', Alpine: '알핀',
  Audi: '아우디', 'Kick Sauber': '아우디', Cadillac: '캐딜락',
};
// FastF1 ClassifiedPosition letters for cars without a finishing place
const UNCLASSIFIED: Record<string, string> = { R: 'DNF', F: 'DNF', D: 'DSQ', E: 'EX', W: 'DNS', N: 'NC' };

interface Row {
  position: number | null;
  classified: string;
  code: string;
  firstName: string;
  lastName: string;
  team: string;
  status: string;
  time: number | null;
  laps: number | null;
  points: number;
  q: (number | null)[];
}

let posted: string[] = [];
try {
  posted = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
} catch {
  // nothing posted yet
}

function markPosted(key: string) {
  posted.push(key);
  fs.mkdirSync(path.dirname(POSTED_FILE), { recursive: true });
  fs.writeFileSync(POSTED_FILE, JSON.stringify(posted));
}

/** 83.4 → "1:23.400", 5663.8 → "1:34:23.800" */
function lapTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(3).padStart(6, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const driverName = (r: Row) => DRIVERS_KO[r.code] ?? `${r.firstName} ${r.lastName}`;
const teamName = (r: Row) => TEAMS_KO[r.team] ?? r.team;

/** One line per car: finishing order, gap or laps down, points (race/sprint) or best lap (qualifying). */
function resultLine(r: Row, winner: Row, quali: boolean) {
  const who = `${driverName(r)} (${teamName(r)})`;
  if (quali) {
    const best = [...r.q].reverse().find((t) => t != null);
    return `${r.position ?? '-'}. ${who} ${best != null ? lapTime(best) : '기록 없음'}`;
  }
  const place = /^\d+$/.test(r.classified) ? r.classified : UNCLASSIFIED[r.classified] ?? String(r.position ?? '-');
  let detail = '';
  if (r === winner && r.time != null) detail = lapTime(r.time);
  else if (!/^\d+$/.test(r.classified)) detail = '';
  else if (r.status === 'Finished' && r.time != null) detail = `+${r.time < 60 ? r.time.toFixed(3) : lapTime(r.time)}`;
  else if (winner.laps != null && r.laps != null && winner.laps > r.laps) detail = `+${winner.laps - r.laps}랩`;
  const points = r.points > 0 ? ` · ${r.points}점` : '';
  return `${place}. ${who}${detail ? ` ${detail}` : ''}${points}`;
}

/** Heading, site link, then one line per car; long lists continue in replies. */
export function resultPosts(year: string | number, round: number, raceName: string, sessionName: string, rows: Row[], quali: boolean) {
  const head = [
    `${gpHeading(year, round, raceName)} ${sessionName} 결과 (잠정)`,
    process.env.SITE_URL && `🔗 ${process.env.SITE_URL}/results`,
  ].filter(Boolean).join('\n');
  const units: [string, string][] = [[head, '']];
  rows.forEach((r, i) => units.push([resultLine(r, rows[0], quali), i ? '\n' : '\n\n']));
  return packPosts(units);
}

/**
 * Official-looking enough to post: at least 10 placed cars, and for a race or
 * sprint the winner's time (FastF1 only has it once the result is in).
 */
const isReady = (rows: Row[], quali: boolean) =>
  rows.filter((r) => r.position != null).length >= 10 && (quali || rows[0].time != null);

let running = false;

export async function checkSessionResults(now = Date.now()) {
  const { enabled, hasToken } = threadsStatus();
  // FastF1 loads are heavy on a 512MB host; don't run them for posts that can't go out
  if (running || !enabled || !hasToken) return;
  running = true;
  try {
    const year = new Date(now).getUTCFullYear();
    const { races } = await getSeasonSchedule(year);
    for (const race of races) {
      for (const s of SESSIONS) {
        const slot = s.key === 'race' ? { date: race.date, time: race.time } : race[s.key];
        if (!slot?.date || !slot.time) continue;
        const start = Date.parse(`${slot.date}T${slot.time}`);
        const key = `${year}-${race.round}-${s.id}`;
        if (now < start + s.minutes * 60000 || now > start + GIVE_UP_AFTER_MS || posted.includes(key)) continue;

        const quali = s.id === 'Q' || s.id === 'SQ';
        const data = await getSessionResults(year, race.round, s.id).catch((err: any) => {
          console.error(`[Results] ${key}:`, err.message);
          return null;
        });
        if (!data || !isReady(data.results, quali)) continue; // not out yet; next check tries again
        // Marked first: a failed post is logged, never retried, so a half-posted chain isn't repeated
        markPosted(key);
        await postToThreads(resultPosts(year, race.round, race.raceName, s.name, data.results, quali))
          .then(() => console.log(`[Results] posted ${key}`))
          .catch((err) => console.error(`[Results] ${key} post failed:`, err.message));
      }
    }
  } catch (err: any) {
    console.error('[Results] check failed:', err.message);
  } finally {
    running = false;
  }
}

export function startResultsPoster() {
  checkSessionResults();
  setInterval(checkSessionResults, CHECK_EVERY_MS);
}
