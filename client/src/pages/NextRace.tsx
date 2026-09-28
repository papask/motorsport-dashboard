import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import useFeatures from '../hooks/useFeatures';
import useCountdown from '../hooks/useCountdown';
import { calendarUrl, getNextRaceGuide } from '../services/api';
import { useLang, useT } from '../i18n';
import PageMasthead from '../components/PageMasthead';
import StateBlock from '../components/StateBlock';
import ErrorBanner from '../components/ErrorBanner';
import { getCircuitNameKR, getCountryNameKR, getDriverNameKR, getSessionNameKR, getTeamNameKR } from '../constants/koreanTerms';
import { getTeamColor } from '../theme/tokens';
import { formatLocalShort, getLocalTZLabel } from '../utils/raceDate';

// The next-race guide. Objective facts only: the server works every number
// out from the schedule, the standings, the stewards' decisions and the
// circuit's history; this page lays them out in fixed wording.

type SessionKey = 'firstPractice' | 'secondPractice' | 'thirdPractice' | 'sprintQualifying' | 'sprint' | 'qualifying' | 'race';

interface Penalty {
  url: string;
  event: string;
  published: string;
  doc: number | null;
  car: number | null;
  driver: string | null;
  driverId?: string;
  code?: string;
  team?: string;
  session: string | null;
  fact: string | null;
  gridDrop: number | null;
  pitLaneStart: boolean;
  summarized: boolean;
}

interface Guide {
  seasonOver?: false;
  year: number;
  round: number;
  totalRounds: number;
  raceName: string;
  circuit: { id: string; name: string; locality: string; country: string };
  sessions: { key: SessionKey; start: string; timeKnown: boolean; weather: Weather | null }[];
  /** When the forecast was fetched (Open-Meteo); null when there is none */
  weatherAt: string | null;
  raceStart: string;
  switchesAt: string;
  phase: 'upcoming' | 'weekend' | 'race' | 'finished';
  championship: null | {
    afterRound: number;
    drivers: { position: number; driverId: string; code: string; name: string; team: string; points: number; gap: number }[];
    constructors: { position: number; team: string; points: number; gap: number }[];
    remaining: { races: number; sprints: number; driver: number; constructor: number };
    canClinch: { driver: boolean; constructor: boolean };
  };
  penalties: {
    checkedAt: string | null;
    carried: Penalty[];
    weekend: Penalty[];
    reprimands: null | { car: number; driver?: string; driverId?: string; code?: string; team?: string; count: number; kind?: string; url: string }[];
  };
  notices: null | {
    firstTime: boolean; lastHeld: number | null; yearsSince: number | null; noTelemetry: boolean; notHeldLastYear: boolean; lastLaps: number | null;
    /** The rule change between the pole lap's season and this one */
    regulationChange: { from: number; ko: string; en: string } | null;
  };
  history: null | {
    races: number;
    poleWins: number;
    lastHeld: number | null;
    recentWinners: { season: number; driverId: string; code: string; name: string; team: string; grid: number }[];
    mostWinsDrivers: { driverId: string; name: string; wins: number }[];
    mostWinsTeams: { team: string; wins: number }[];
  };
  grid: null | {
    fromRound: number;
    // driverId is null for a stand-in Jolpica doesn't know yet
    drivers: { driverId: string | null; code: string; number: number; name: string; team: string; starts: number; best: { position: number; season: number } | null }[];
  };
  lastRace: null | {
    season: number;
    round: number;
    qualifying: { position: number; driverId: string; code: string; name: string; team: string; time: string | null }[];
    podium: { position: number; driverId: string; code: string; name: string; team: string; grid: number }[];
    starters: number;
    retired: number;
    pitStops: number | null;
    safetyCars: number | null;
    virtualSafetyCars: number | null;
    redFlags: number | null;
  };
  track: null | TrackProfile;
}

interface Weather {
  temp: number;
  rain: number;
  kind: 'clear' | 'cloud' | 'rain' | 'storm';
}

interface TrackProfile {
  year: number;
  driver: { code: string; name: string; team: string };
  lapTime: number | null;
  topSpeed: number;
  fullThrottle: number | null;
  heavyBraking: number;
  corners: { number: string; x: number; y: number; angle: number | null; distance: number; minSpeed: number | null }[];
  rotation: number;
  trace: { d: number; s: number }[];
  outline: [number, number][];
}

type Response = Guide | { seasonOver: true; year: number } | { notOpen: true; current: { year: number; round: number } | null };

const SESSION_NAME: Record<SessionKey, string> = {
  firstPractice: 'Practice 1',
  secondPractice: 'Practice 2',
  thirdPractice: 'Practice 3',
  sprintQualifying: 'Sprint Qualifying',
  sprint: 'Sprint',
  qualifying: 'Qualifying',
  race: 'Race',
};

// The stewards' "Fact" line, named in fixed words. Anything else stays as printed.
const FACT_KEYS: [RegExp, Parameters<ReturnType<typeof useT>>[0]][] = [
  [/power unit elements/i, 'nrFactPowerUnit'],
  [/gearbox/i, 'nrFactGearbox'],
  [/collision/i, 'nrFactCollision'],
  [/impeding/i, 'nrFactImpeding'],
  [/unsafe release/i, 'nrFactUnsafeRelease'],
  [/yellow flag/i, 'nrFactYellowFlag'],
  [/leaving the track|track limits/i, 'nrFactTrackLimits'],
  [/pit lane speeding|speeding in the pit/i, 'nrFactPitSpeeding'],
  [/parc ferm|changes made|rear wing|floor|suspension/i, 'nrFactParcFerme'],
  [/false start|start procedure|practice start/i, 'nrFactStart'],
];

// Calendar apps subscribe to a webcal:// link; the https one downloads the file
const icsHttp = () => new URL(calendarUrl(), window.location.href).href;
const icsWebcal = () => icsHttp().replace(/^https?:/, 'webcal:');

const localTime = (iso: string) => `${formatLocalShort({ date: iso.slice(0, 10), time: iso.slice(11, 19) + 'Z' })}`;

function driverLabel(p: { driverId?: string; driver?: string | null; name?: string; code?: string }) {
  if (p.driverId) return getDriverNameKR(p.driverId, p.name ?? p.driver ?? undefined);
  return p.driver ?? p.name ?? p.code ?? '–';
}

/**
 * The next session still to start, counting down, and the one after it once
 * it starts. Hidden once only the race is left (the masthead counts to that)
 * and after the race has started.
 */
function NextSession({ sessions }: { sessions: Guide['sessions'] }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const next = sessions.find((s) => s.timeKnown && Date.parse(s.start) > now);
  if (!next || next.key === 'race') return null;
  const left = Math.floor((Date.parse(next.start) - now) / 1000);
  const d = Math.floor(left / 86400);
  const hms = [Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60]
    .map((n) => String(n).padStart(2, '0')).join(':');
  return (
    <div className="guide-next-session" role="timer" aria-live="off">
      <span className="guide-tile-label">{t('nrNextSession')}</span>
      <span style={{ fontWeight: 700 }}>{getSessionNameKR(SESSION_NAME[next.key])}</span>
      <span className="num" style={{ fontSize: 26, lineHeight: 1 }}>
        {d > 0 && <>{d}<span className="en" style={{ fontSize: 13 }}>{t('nrDays')}</span> </>}{hms}
      </span>
    </div>
  );
}

function Countdown({ to }: { to: string }) {
  const t = useT();
  const c = useCountdown(to);
  return (
    <div className="num" style={{ fontSize: 40, lineHeight: 1 }}>
      {c.days}<span className="en" style={{ fontSize: 15 }}>{t('nrDays')}</span>{' '}
      {String(c.hours).padStart(2, '0')}:{String(c.minutes).padStart(2, '0')}:{String(c.seconds).padStart(2, '0')}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="guide-tile">
      <span className="guide-tile-label">{label}</span>
      <span className="guide-tile-value">{value}</span>
      {note && <span className="guide-tile-note">{note}</span>}
    </div>
  );
}

// Stroke icons for the forecast; the words are in the aria-label
const WEATHER_PATHS: Record<Weather['kind'], string> = {
  clear: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  cloud: 'M7 18h10a4 4 0 0 0 0-8a6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z',
  rain: 'M7 14h10a4 4 0 0 0 0-8a6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 14zM9 17l-1 3M13 17l-1 3M17 17l-1 3',
  storm: 'M7 14h10a4 4 0 0 0 0-8a6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 14zM13 15l-2 3h3l-2 3',
};

function WeatherCell({ w }: { w: Weather }) {
  const t = useT();
  const label = t(`nrWeather_${w.kind}` as 'nrWeather_clear');
  return (
    <span className="guide-weather" aria-label={`${label}, ${w.temp}°C, ${t('nrRainChance', { n: w.rain })}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={WEATHER_PATHS[w.kind]} />
      </svg>
      <span aria-hidden="true">{w.temp}°</span>
      <span aria-hidden="true" className={w.rain >= 50 ? 'guide-rain guide-rain--high' : 'guide-rain'}>{t('nrRainShort', { n: w.rain })}</span>
    </span>
  );
}

const lapTimeText =(s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;

// Corner speed bands, as commonly split: slow < 120, medium 120–200, fast > 200 km/h
function cornerBands(corners: TrackProfile['corners']) {
  const speeds = corners.map((c) => c.minSpeed).filter((s): s is number => s != null);
  return [speeds.filter((s) => s < 120).length, speeds.filter((s) => s >= 120 && s <= 200).length, speeds.filter((s) => s > 200).length];
}

/** The pole lap's outline, turned the way FastF1 says the circuit is drawn, with corner numbers. */
function TrackMap({ track, label }: { track: TrackProfile; label: string }) {
  const a = (track.rotation * Math.PI) / 180;
  const turn = ([x, y]: [number, number]): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const line = track.outline.map(turn);
  const corners = track.corners.map((c) => ({ ...c, p: turn([c.x, c.y]) }));
  const xs = line.map((p) => p[0]);
  const ys = line.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08;
  // SVG y grows downwards, track y upwards
  const pt = ([x, y]: [number, number]) => `${(x - minX + pad).toFixed(0)},${(maxY - y + pad).toFixed(0)}`;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const font = Math.max(w, h) / 32;
  const off = font * 1.6;
  // Where a corner's number goes: along the corner's own angle (MultiViewer places it
  // off the track that way, as FastF1's corner-annotation example does); without one,
  // away from the circuit's centre
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const labelAt = (c: (typeof corners)[number]): [number, number] => {
    if (c.angle != null) {
      const r = (c.angle * Math.PI) / 180;
      return turn([c.x + off * Math.cos(r), c.y + off * Math.sin(r)]);
    }
    const len = Math.hypot(c.p[0] - cx, c.p[1] - cy) || 1;
    return [c.p[0] + ((c.p[0] - cx) / len) * off, c.p[1] + ((c.p[1] - cy) / len) * off];
  };
  return (
    <svg className="guide-map" viewBox={`0 0 ${w.toFixed(0)} ${h.toFixed(0)}`} role="img" aria-label={label}>
      <polyline points={line.map(pt).join(' ')} fill="none" stroke="var(--text-primary)" strokeWidth={font / 3} strokeLinejoin="round" strokeLinecap="round" />
      {corners.map((c) => {
        const [lx, ly] = pt(labelAt(c)).split(',');
        const [px, py] = pt(c.p).split(',');
        return (
          <g key={c.number}>
            {/* A short tick from the track to its number, so a number is never read against the wrong corner */}
            <line x1={px} y1={py} x2={lx} y2={ly} stroke="var(--border-strong)" strokeWidth={font / 12} />
            <circle cx={lx} cy={ly} r={font * 0.75} fill="var(--surface-raised)" stroke="var(--border-strong)" strokeWidth={font / 12} />
            <text x={lx} y={ly} fontSize={font * 0.85} textAnchor="middle" dominantBaseline="central" fill="var(--text-primary)" fontWeight={700}>
              {c.number}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Speed over the lap's distance, with each corner's number at its place. */
function SpeedTrace({ track, label }: { track: TrackProfile; label: string }) {
  const W = 600;
  const H = 160;
  const maxD = track.trace.at(-1)?.d || 1;
  const top = Math.ceil(track.topSpeed / 50) * 50;
  const x = (d: number) => (d / maxD) * W;
  const y = (s: number) => H - (s / top) * H;
  return (
    <svg className="guide-trace" viewBox={`0 -14 ${W} ${H + 28}`} role="img" aria-label={label}>
      {[100, 200, 300].filter((s) => s < top).map((s) => (
        <g key={s}>
          <line x1={0} x2={W} y1={y(s)} y2={y(s)} stroke="var(--border-faint)" vectorEffect="non-scaling-stroke" />
          <text x={2} y={y(s) - 3} fontSize={10} fill="var(--text-muted)">{s}</text>
        </g>
      ))}
      <polyline points={track.trace.map((p) => `${x(p.d).toFixed(1)},${y(p.s).toFixed(1)}`).join(' ')}
        fill="none" stroke="var(--trace-speed)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {/* Odd corners only, so neighbouring numbers don't run together; the map has them all */}
      {track.corners.filter((c) => parseInt(c.number) % 2 === 1).map((c) => (
        <text key={c.number} className="guide-trace-corner" x={x(c.distance)} y={H + 12} fontSize={9} textAnchor="middle" fill="var(--text-muted)">{c.number}</text>
      ))}
    </svg>
  );
}

function Bar({ share, color }: { share: number; color: string }) {
  return (
    <div className="guide-bar" aria-hidden="true">
      <div style={{ width: `${Math.max(2, Math.round(share * 100))}%`, background: color }} />
    </div>
  );
}

function PenaltyRow({ p }: { p: Penalty }) {
  const t = useT();
  const factKey = p.fact && FACT_KEYS.find(([re]) => re.test(p.fact!))?.[1];
  const what = p.pitLaneStart ? t('nrPitLaneStart') : t('nrGridDrop', { n: p.gridDrop ?? 0 });
  const docsLink = p.summarized && p.doc
    ? `/docs?event=${encodeURIComponent(`${p.published.slice(0, 4)} ${p.event}`)}#doc-${p.doc}`
    : null;
  return (
    <div className="guide-penalty">
      <div className="guide-car" style={{ background: getTeamColor(p.team) }}>{p.car ?? '–'}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700 }}>
          {driverLabel(p)}
          {p.team && <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}> · {getTeamNameKR(p.team)}</span>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {[p.event, p.session && getSessionNameKR(p.session), factKey ? t(factKey) : p.fact].filter(Boolean).join(' · ')}
        </div>
        <div style={{ fontSize: 13, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {docsLink && <Link to={docsLink}>{t('nrDocSummary', { n: p.doc! })} →</Link>}
          <a href={p.url} target="_blank" rel="noreferrer">{t('fiaOriginal')} ↗</a>
        </div>
      </div>
      <div className="guide-penalty-value">{what}</div>
    </div>
  );
}

/** `year` is the header's season; the address only names the round (/next/16). */
export default function NextRace({ year: season }: { year: number }) {
  const t = useT();
  const { lang } = useLang();
  const { calendar } = useFeatures();
  const params = useParams();
  const round = params.round ? Number(params.round) : undefined;
  const year = round ? season : undefined; // plain /next follows the calendar
  const { data, loading, error, refetch, failures } = useApi<Response>(
    (signal) => getNextRaceGuide(year, round, signal), [year, round]);
  // Marks the sessions already under way when the page was opened
  const [openedAt] = useState(() => Date.now());

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container" aria-busy="true"><div className="loading-spinner" /><div className="loading-text">{t('loadingData')}</div></div>
      </div>
    );
  }
  if (error || !data) {
    return <div className="page-container"><ErrorBanner detail={error} onRetry={refetch} attempts={failures} /></div>;
  }
  if ('notOpen' in data) {
    return (
      <div className="page-container">
        <PageMasthead title={t('nrTitle')} subtitle="Next Grand Prix" />
        <StateBlock title={t('nrNotOpen', { round: round ?? '' })} reason={t('nrNotOpenReason')}
          actions={[{ label: t('nrCurrentGuide'), href: '/next', primary: true }]} />
      </div>
    );
  }
  if (data.seasonOver) {
    return (
      <div className="page-container">
        <PageMasthead title={t('nrTitle')} subtitle="Next Grand Prix" />
        <StateBlock title={t('nrSeasonOver', { year: data.year })} reason={t('nrSeasonOverReason')}
          actions={[{ label: t('navDrivers'), href: '/drivers', primary: true }]} />
      </div>
    );
  }

  const g = data;
  const n = g.notices;
  const kicker = [
    t('nrRound', { round: g.round, total: g.totalRounds }),
    n?.firstTime && t('nrFirstTime'),
    n?.yearsSince && t('nrYearsSince', { year: n.lastHeld!, n: n.yearsSince }),
  ].filter(Boolean).join(' · ');
  const finished = g.phase === 'finished';
  // After qualifying the grid is set, so what is listed is what the race grid carries.
  // ponytail: an hour after qualifying starts stands in for its end; the session's real end isn't in the schedule
  const qualifying = g.sessions.find((s) => s.key === 'qualifying');
  const gridSet = !finished && !!qualifying && Date.parse(qualifying.start) + 60 * 60 * 1000 <= openedAt;

  return (
    <div className="page-container" style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
      <PageMasthead
        kicker={kicker}
        title={g.raceName}
        subtitle={`${getCircuitNameKR(g.circuit.name)} · ${g.circuit.locality}, ${getCountryNameKR(g.circuit.country)}`}
        aside={finished ? null : g.phase === 'race' ? (
          <div className="k">{t('nrRaceUnderway')}</div>
        ) : (
          <>
            <div className="k">{t('nrUntilRace')}</div>
            <Countdown to={g.raceStart} />
            <div className="en">{localTime(g.raceStart)} {getLocalTZLabel()}</div>
          </>
        )}
      />

      {finished && (
        <div className="card guide-finished" role="status">
          <strong>{t('nrFinished')}</strong>
          <span>{t('nrFinishedReason')}</span>
          <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Link to="/results?session=race">{t('navResults')} →</Link>
            <Link to="/next">{t('nrCurrentGuide')} →</Link>
          </span>
        </div>
      )}

      {/* Cards sharing a row stretch to the same height; the full-width ones below have no neighbour */}
      <div className="card-grid card-grid-2">
        {/* Schedule */}
        <section className="card" aria-labelledby="nr-schedule" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="guide-card-head">
            <h2 id="nr-schedule" className="card-title" style={{ margin: 0 }}>{t('nrSchedule')}</h2>
            {calendar && <a className="btn-primary" href={icsWebcal()}>{t('nrSubscribe')}</a>}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>{t('nrSession')}</th><th>{t('nrMyTime', { tz: getLocalTZLabel() })}</th><th className="guide-col-weather">{t('nrWeather')}</th></tr></thead>
              <tbody>
                {g.sessions.map((s) => (
                  <tr key={s.key}>
                    <td style={{ fontWeight: 600 }}>{getSessionNameKR(SESSION_NAME[s.key])}</td>
                    <td>
                      {s.timeKnown ? localTime(s.start) : t('nrTimeTbc')}
                      {Date.parse(s.start) <= openedAt && <span className="stat-badge" style={{ marginLeft: 8, fontSize: 11 }}>{t('nrStarted')}</span>}
                      {/* Phones: under the time instead of a third column that would scroll off */}
                      {s.weather && <div className="guide-weather-inline"><WeatherCell w={s.weather} /></div>}
                    </td>
                    <td className="guide-col-weather">{s.weather ? <WeatherCell w={s.weather} /> : <span className="guide-muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {g.weatherAt && (
            <p className="guide-note">
              {t(finished ? 'nrWeatherFrozen' : 'nrWeatherSource', { time: localTime(g.weatherAt) })}
            </p>
          )}
          {/* The stretched card's spare height, pushed to the foot with the calendar note */}
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            {!finished && <NextSession sessions={g.sessions} />}
            {calendar && <p className="guide-note">{t('nrCalendarNote')} <a href={icsHttp()}>{t('nrIcsFile')}</a></p>}
          </div>
        </section>

        {/* Championship */}
        <section className="card" aria-labelledby="nr-champ">
          <div className="guide-card-head">
            <h2 id="nr-champ" className="card-title" style={{ margin: 0 }}>{t('nrChampionship')}</h2>
            {g.championship && <span className="guide-note" style={{ margin: 0 }}>{t('nrAfterRound', { round: g.championship.afterRound })}</span>}
          </div>
          {!g.championship ? (
            <p className="guide-note">{t('nrNoStandings')}</p>
          ) : (
            <>
              <div className="guide-subhead">{t('navDrivers')}</div>
              {g.championship.drivers.map((d) => (
                <div key={d.driverId} className="guide-standing">
                  <span className="guide-muted">{d.position}</span>
                  <span style={{ fontWeight: 700 }} title={getDriverNameKR(d.driverId, d.name)}>{d.code}</span>
                  <Bar share={d.points / g.championship!.drivers[0].points} color={getTeamColor(d.team)} />
                  <span className="guide-num">{d.points}</span>
                  <span className="guide-num guide-muted">{d.gap ? d.gap : '—'}</span>
                </div>
              ))}
              <div className="guide-subhead">{t('navConstructors')}</div>
              {g.championship.constructors.map((c) => (
                <div key={c.team} className="guide-standing guide-standing--team">
                  <span className="guide-muted">{c.position}</span>
                  <span style={{ fontWeight: 700 }}>{getTeamNameKR(c.team)}</span>
                  <Bar share={c.points / g.championship!.constructors[0].points} color={getTeamColor(c.team)} />
                  <span className="guide-num">{c.points}</span>
                  <span className="guide-num guide-muted">{c.gap ? c.gap : '—'}</span>
                </div>
              ))}
              <div className="guide-tiles">
                <Tile label={t('nrRacesLeft')} value={String(g.championship.remaining.races)}
                  note={g.championship.remaining.sprints ? t('nrSprintsLeft', { n: g.championship.remaining.sprints }) : t('nrIncludingThis')} />
                <Tile label={t('nrMaxDriver')} value={String(g.championship.remaining.driver)} note={t('nrMaxNote')} />
                <Tile label={t('nrClinch')}
                  value={g.championship.canClinch.driver || g.championship.canClinch.constructor ? t('nrClinchPossible') : t('nrClinchNo')}
                  note={[
                    g.championship.canClinch.driver && t('navDrivers'),
                    g.championship.canClinch.constructor && t('navConstructors'),
                  ].filter(Boolean).join(' · ') || t('nrClinchBoth')} />
              </div>
            </>
          )}
        </section>

        {/* Penalties */}
        {/* Full width: the list grows through a weekend, and a half-width card beside it would leave a gap */}
        <section className="card guide-span" aria-labelledby="nr-pen">
          <div className="guide-card-head">
            <h2 id="nr-pen" className="card-title" style={{ margin: 0 }}>{t(finished ? 'nrPenaltiesFinal' : gridSet ? 'nrPenaltiesGrid' : 'nrPenalties')}</h2>
            {g.penalties.checkedAt && !finished && (
              <span className="guide-note" style={{ margin: 0 }}>{t('nrCheckedAt', { time: localTime(g.penalties.checkedAt) })}</span>
            )}
          </div>
          {!finished && <p className="guide-note" style={{ marginTop: 0 }}>{t(gridSet ? 'nrPenaltiesGridNote' : 'nrPenaltiesNote')}</p>}
          <div className="card-grid card-grid-2" style={{ gap: 20 }}>
            <div>
              <div className="guide-subhead">{t('nrCarried', { n: g.penalties.carried.length })}</div>
              {g.penalties.carried.length ? g.penalties.carried.map((p) => <PenaltyRow key={p.url} p={p} />)
                : <div className="guide-empty">{t('nrNone')}</div>}
            </div>
            <div>
              <div className="guide-subhead">{t('nrThisWeekend', { n: g.penalties.weekend.length })}</div>
              {g.penalties.weekend.length ? g.penalties.weekend.map((p) => <PenaltyRow key={p.url} p={p} />)
                : <div className="guide-empty">{t('nrNoneYet')}</div>}
            </div>
          </div>
          <div className="guide-subhead">{t('nrReprimands')}</div>
          {g.penalties.reprimands === null ? (
            <div className="guide-empty">{t('nrReprimandsPending')}</div>
          ) : g.penalties.reprimands.length === 0 ? (
            <div className="guide-empty">{t('nrNone')}</div>
          ) : (
            <div className="guide-chips">
              {g.penalties.reprimands.map((r) => (
                <a key={r.car} className="stat-badge" href={r.url} target="_blank" rel="noreferrer" title={r.kind}>
                  {r.code ?? r.driver ?? `#${r.car}`} {t('nrReprimandCount', { n: r.count })}
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Pole lap profile: the circuit as last year's fastest qualifying lap drove it */}
        {g.track && (() => {
          const tr = g.track;
          const [slow, medium, fast] = cornerBands(tr.corners);
          const era = n?.regulationChange;
          return (
            <section className="card guide-span" aria-labelledby="nr-profile">
              <div className="guide-card-head">
                <h2 id="nr-profile" className="card-title" style={{ margin: 0 }}>{t('nrPoleLap', { year: tr.year })}</h2>
                <span className="guide-note" style={{ margin: 0 }}>
                  {getDriverNameKR(g.lastRace?.qualifying[0]?.driverId ?? '', tr.driver.name)} · {getTeamNameKR(tr.driver.team)}
                  {tr.lapTime != null && ` · ${lapTimeText(tr.lapTime)}`} · {t('nrProfileSource')}
                </span>
              </div>
              {era && <div className="guide-warning" role="note">{t('nrEraNote', { year: tr.year, now: g.year, change: lang === 'en' ? era.en : era.ko })}</div>}
              <div className="guide-profile">
                <TrackMap track={tr} label={t('nrMapLabel', { circuit: getCircuitNameKR(g.circuit.name) })} />
                <div style={{ minWidth: 0 }}>
                  <div className="guide-subhead" style={{ marginTop: 0 }}>{t('nrSpeedTrace')}</div>
                  <SpeedTrace track={tr} label={t('nrSpeedTraceLabel', { top: Math.round(tr.topSpeed) })} />
                  <div className="guide-tiles guide-tiles--4">
                    <Tile label={t('nrTopSpeed')} value={`${Math.round(tr.topSpeed)} km/h`} />
                    <Tile label={t('nrFullThrottle')} value={tr.fullThrottle != null ? `${Math.round(tr.fullThrottle * 100)}%` : '–'} note={t('nrFullThrottleNote')} />
                    <Tile label={t('nrHeavyBraking')} value={t('nrZones', { n: tr.heavyBraking })} note={t('nrHeavyBrakingNote')} />
                    <Tile label={t('nrCorners', { n: tr.corners.length })} value={`${slow} · ${medium} · ${fast}`} note={t('nrCornerBands')} />
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        {/* The last race held here */}
        {g.lastRace && (
          <section className="card guide-span" aria-labelledby="nr-last">
            <h2 id="nr-last" className="card-title">{t('nrLastRace', { year: g.lastRace.season })}</h2>
            <div className="card-grid card-grid-3">
              <div>
                <div className="guide-subhead" style={{ marginTop: 0 }}>{t('nrLastQuali')}</div>
                <table className="data-table">
                  <tbody>
                    {g.lastRace.qualifying.map((q) => (
                      <tr key={q.driverId}>
                        <td className="guide-muted">P{q.position}</td>
                        <td style={{ fontWeight: 600 }}>{getDriverNameKR(q.driverId, q.name)}</td>
                        <td className="guide-num" style={{ fontWeight: 400 }}>{q.time ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="guide-subhead" style={{ marginTop: 0 }}>{t('nrLastPodium')}</div>
                <table className="data-table">
                  <tbody>
                    {g.lastRace.podium.map((p) => (
                      <tr key={p.driverId}>
                        <td style={{ fontWeight: 700 }}>P{p.position}</td>
                        <td style={{ fontWeight: 600 }}>{getDriverNameKR(p.driverId, p.name)}<div className="guide-muted" style={{ fontSize: 12, fontWeight: 400 }}>{getTeamNameKR(p.team)}</div></td>
                        <td className="guide-num guide-muted" style={{ fontWeight: 400 }}>{t('nrFromGrid', { n: p.grid })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="guide-subhead" style={{ marginTop: 0 }}>{t('nrLastRaceData')}</div>
                <div className="guide-tiles" style={{ marginTop: 0, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <Tile label={t('nrSafetyCar')} value={g.lastRace.safetyCars ?? '–'} />
                  <Tile label="VSC" value={g.lastRace.virtualSafetyCars ?? '–'} />
                  <Tile label={t('nrPitStops')} value={g.lastRace.pitStops ?? '–'} note={t('nrAllDrivers')} />
                  <Tile label={t('nrRetired')} value={`${g.lastRace.retired} / ${g.lastRace.starters}`} />
                </div>
                {!!g.lastRace.redFlags && <p className="guide-note">{t('nrRedFlags', { n: g.lastRace.redFlags })}</p>}
              </div>
            </div>
          </section>
        )}

        {/* History */}
        <section className="card guide-span" aria-labelledby="nr-hist">
          <div className="guide-card-head">
            <h2 id="nr-hist" className="card-title" style={{ margin: 0 }}>{t('nrHistory', { circuit: getCircuitNameKR(g.circuit.name) })}</h2>
            {g.history && g.history.races > 0 && <span className="guide-note" style={{ margin: 0 }}>{t('nrHistoryNote')}</span>}
          </div>
          {!g.history ? (
            <div className="guide-empty">{t('nrPreparing')}</div>
          ) : g.history.races === 0 ? (
            <div className="guide-empty">{t('nrFirstTimeHistory')}</div>
          ) : (
            <>
              {/* Why there is no pole-lap section, or when it is coming */}
              {n && (n.noTelemetry || !g.track) && (
                <p className="guide-note" style={{ marginTop: 0, marginBottom: 12 }}>
                  {n.noTelemetry ? t('nrNoTelemetry', { year: n.lastHeld! }) : t('nrTrackPreparing')}
                </p>
              )}
              <div className="guide-tiles guide-tiles--fit">
                <Tile label={t('nrTimesHeld')} value={String(g.history.races)}
                  note={n?.lastHeld ? t('nrLastHeld', { year: n.lastHeld }) : undefined} />
                <Tile label={t('nrLaps')} value={t('nrLapsTbc')}
                  note={n?.lastLaps && n.lastHeld ? t('nrLapsLast', { year: n.lastHeld, n: n.lastLaps }) : undefined} />
                <Tile label={t('nrPoleWins')} value={`${g.history.poleWins}`}
                  note={`${Math.round((g.history.poleWins / g.history.races) * 100)}%`} />
                <Tile label={t('nrMostWinsDriver')}
                  value={g.history.mostWinsDrivers.map((d) => getDriverNameKR(d.driverId, d.name)).join(' · ')}
                  note={t('nrWins', { n: g.history.mostWinsDrivers[0]?.wins ?? 0 })} />
                <Tile label={t('nrMostWinsTeam')}
                  value={g.history.mostWinsTeams.map((c) => getTeamNameKR(c.team)).join(' · ')}
                  note={t('nrWins', { n: g.history.mostWinsTeams[0]?.wins ?? 0 })} />
              </div>
              <div className="card-grid card-grid-2" style={{ marginTop: 16 }}>
                <div>
                  <div className="guide-subhead">{t('nrRecentWinners')}</div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead><tr><th>{t('nrSeason')}</th><th>{t('nrDriver')}</th><th>{t('nrTeam')}</th><th>{t('nrGridStart')}</th></tr></thead>
                      <tbody>
                        {g.history.recentWinners.map((w) => (
                          <tr key={w.season}>
                            <td>{w.season}</td>
                            <td style={{ fontWeight: 600 }}>{getDriverNameKR(w.driverId, w.name)}</td>
                            <td>{getTeamNameKR(w.team)}</td>
                            <td>P{w.grid}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {g.grid && (
                  <div>
                    <div className="guide-subhead">
                      {t('nrGridExperience', { n: g.grid.drivers.filter((d) => d.starts).length, total: g.grid.drivers.length })}
                    </div>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead><tr><th>{t('nrDriver')}</th><th>{t('nrStarts')}</th><th>{t('nrBest')}</th></tr></thead>
                        <tbody>
                          {g.grid.drivers.filter((d) => d.starts).sort((a, b) =>
                            (a.best?.position ?? 99) - (b.best?.position ?? 99) || b.starts - a.starts).map((d) => (
                            <tr key={d.number}>
                              <td style={{ fontWeight: 600 }}>{getDriverNameKR(d.driverId ?? '', d.name)}</td>
                              <td>{d.starts}</td>
                              <td>{d.best ? t('nrBestResult', { pos: d.best.position, year: d.best.season }) : '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="guide-note">
                      <strong>{t('nrFirstTimers', { n: g.grid.drivers.filter((d) => !d.starts).length })}</strong>{' '}
                      {g.grid.drivers.filter((d) => !d.starts).map((d) => d.code).join(' ')}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <p className="guide-note" style={{ marginTop: 16 }}>{t('nrFooter')}</p>
    </div>
  );
}
