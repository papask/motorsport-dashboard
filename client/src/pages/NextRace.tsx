import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import useCountdown from '../hooks/useCountdown';
import { calendarUrl, getNextRaceGuide } from '../services/api';
import { useT } from '../i18n';
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
  sessions: { key: SessionKey; start: string; timeKnown: boolean }[];
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
  notices: null | { firstTime: boolean; lastHeld: number | null; yearsSince: number | null; noTelemetry: boolean; notHeldLastYear: boolean; lastLaps: number | null };
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
    drivers: { driverId: string; code: string; name: string; team: string; starts: number; best: { position: number; season: number } | null }[];
  };
}

type Response = Guide | { seasonOver: true; year: number };

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

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="guide-tile">
      <span className="guide-tile-label">{label}</span>
      <span className="guide-tile-value">{value}</span>
      {note && <span className="guide-tile-note">{note}</span>}
    </div>
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

export default function NextRace() {
  const t = useT();
  const params = useParams();
  const year = params.year ? Number(params.year) : undefined;
  const round = params.round ? Number(params.round) : undefined;
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

      <div className="card-grid card-grid-2" style={{ alignItems: 'start' }}>
        {/* Schedule */}
        <section className="card" aria-labelledby="nr-schedule">
          <div className="guide-card-head">
            <h2 id="nr-schedule" className="card-title" style={{ margin: 0 }}>{t('nrSchedule')}</h2>
            <a className="btn-primary" href={icsWebcal()}>
              {t('nrSubscribe')}
            </a>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>{t('nrSession')}</th><th>{t('nrMyTime', { tz: getLocalTZLabel() })}</th></tr></thead>
              <tbody>
                {g.sessions.map((s) => (
                  <tr key={s.key}>
                    <td style={{ fontWeight: 600 }}>{getSessionNameKR(SESSION_NAME[s.key])}</td>
                    <td>
                      {s.timeKnown ? localTime(s.start) : t('nrTimeTbc')}
                      {Date.parse(s.start) <= openedAt && <span className="stat-badge" style={{ marginLeft: 8, fontSize: 11 }}>{t('nrStarted')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="guide-note">{t('nrCalendarNote')} <a href={icsHttp()}>{t('nrIcsFile')}</a></p>
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
        <section className="card" aria-labelledby="nr-pen">
          <div className="guide-card-head">
            <h2 id="nr-pen" className="card-title" style={{ margin: 0 }}>{t(finished ? 'nrPenaltiesFinal' : 'nrPenalties')}</h2>
            {g.penalties.checkedAt && !finished && (
              <span className="guide-note" style={{ margin: 0 }}>{t('nrCheckedAt', { time: localTime(g.penalties.checkedAt) })}</span>
            )}
          </div>
          {!finished && <p className="guide-note">{t('nrPenaltiesNote')}</p>}
          <div className="guide-subhead">{t('nrCarried', { n: g.penalties.carried.length })}</div>
          {g.penalties.carried.length ? g.penalties.carried.map((p) => <PenaltyRow key={p.url} p={p} />)
            : <div className="guide-empty">{t('nrNone')}</div>}
          <div className="guide-subhead">{t('nrThisWeekend', { n: g.penalties.weekend.length })}</div>
          {g.penalties.weekend.length ? g.penalties.weekend.map((p) => <PenaltyRow key={p.url} p={p} />)
            : <div className="guide-empty">{t('nrNoneYet')}</div>}
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

        {/* Track data */}
        <section className="card" aria-labelledby="nr-track">
          <h2 id="nr-track" className="card-title">{t('nrTrack')}</h2>
          {!n ? (
            <div className="guide-empty">{t('nrPreparing')}</div>
          ) : (
            <>
              <div className="guide-tiles">
                <Tile label={t('nrTimesHeld')} value={String(g.history?.races ?? 0)}
                  note={n.lastHeld ? t('nrLastHeld', { year: n.lastHeld }) : t('nrFirstTime')} />
                <Tile label={t('nrLaps')} value={t('nrLapsTbc')}
                  note={n.lastLaps && n.lastHeld ? t('nrLapsLast', { year: n.lastHeld, n: n.lastLaps }) : undefined} />
              </div>
              {n.noTelemetry ? (
                <p className="guide-note">{n.firstTime ? t('nrNoTelemetryFirst') : t('nrNoTelemetry', { year: n.lastHeld! })}</p>
              ) : (
                <p className="guide-note">{t('nrTelemetrySoon')}</p>
              )}
              {n.notHeldLastYear && <p className="guide-note">{t('nrNotHeldLastYear', { year: g.year - 1 })}</p>}
            </>
          )}
        </section>

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
              <div className="guide-tiles guide-tiles--4">
                <Tile label={t('nrTimesHeld')} value={String(g.history.races)} />
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
                            <tr key={d.driverId}>
                              <td style={{ fontWeight: 600 }} title={getDriverNameKR(d.driverId, d.name)}>{d.code}</td>
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
