import { useApi } from '../hooks/useApi';
import { getConstructorStandings, getDriverStandings, getLastRaceResults, getSeasonSchedule } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, getCountryNameKR, UI_LABELS } from '../constants/koreanTerms';
import { getRaceDateTime, formatLocalDateTime, getNextRace } from '../utils/raceDate';
import useCountdown from '../hooks/useCountdown';
import PosDelta from '../components/PosDelta';
import PageMasthead from '../components/PageMasthead';
import { podiumColor } from '../theme/tokens';
import { SkeletonRegion, SkeletonTable, SkeletonBlock } from '../components/Skeleton';
import ErrorBanner from '../components/ErrorBanner';
import useDeferredLoading from '../hooks/useDeferredLoading';
import { useT } from '../i18n';

interface DashboardProps {
  year: number;
}

// The schedule rows this page reads. `useApi` is untyped, so without this the
// generic in getNextRace falls back to its SessionLike constraint and the race
// fields below look missing.
interface ScheduleRace {
  round: number;
  raceName: string;
  date: string;
  time?: string;
  circuit: {
    name: string;
    country: string;
  };
}

interface DriverStanding {
  position: number;
  points: number;
  positionDelta: number | null;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
  };
  constructor: {
    name: string;
  };
}

interface LastRaceResult {
  position: number | string;
  time?: string;
  driver: {
    firstName: string;
    lastName: string;
  };
  constructor?: {
    name?: string;
  };
}

export default function Dashboard({ year }: DashboardProps) {
  const t = useT();
  const schedule = useApi((signal) => getSeasonSchedule(year, signal), [year]);
  const standings = useApi((signal) => getDriverStandings(year, signal), [year]);
  const teams = useApi((signal) => getConstructorStandings(year, signal), [year]);
  const lastRace = useApi((signal) => getLastRaceResults(signal), []);

  const showStandingsSkeleton = useDeferredLoading(standings.loading);
  const showLastRaceSkeleton = useDeferredLoading(lastRace.loading);
  const races: ScheduleRace[] = schedule.data?.races ?? [];
  const nextRace = schedule.data ? getNextRace(races) : null;
  const countdown = useCountdown(nextRace ? getRaceDateTime(nextRace).toISOString() : null);

  // A season with no next race is over. The canvas replaces the countdown and
  // the "recent race" panel with the season result in that case, rather than
  // leaving a dead timer on the page.
  const seasonOver = !schedule.loading && !nextRace && races.length > 0;
  const completedRounds = races.filter((r) => getRaceDateTime(r).getTime() < Date.now()).length;

  const leader = standings.data?.standings?.[0];
  const runnerUp = standings.data?.standings?.[1];
  const teamLeader = teams.data?.standings?.[0];
  const gap = leader && runnerUp ? leader.points - runnerUp.points : null;
  const remaining = races.length - completedRounds;

  const driverName = (s: DriverStanding) =>
    getDriverNameKR(s.driver.id, `${s.driver.firstName} ${s.driver.lastName}`);

  // KPI cells are set at 28px, so they carry the surname only — "안토넬리", not
  // "안드레아 키미 안토넬리". Korean renderings are space-separated the same way
  // the English ones are, so the last token works for both.
  const surname = (s: DriverStanding) => {
    const parts = driverName(s).trim().split(/\s+/);
    return parts[parts.length - 1] || driverName(s);
  };

  return (
    <div className="page-container">
      <PageMasthead
        kicker={
          seasonOver
            ? t('mhSeasonConcluded', { year })
            : t('mhSeasonRound', { year, round: completedRounds })
        }
        title={UI_LABELS.dashboard}
        subtitle={t('dashboardSubtitle', { year })}
        aside={
          schedule.loading ? null : nextRace ? (
            <>
              <div className="k">
                {UI_LABELS.nextRace} · {nextRace.raceName} · {getCountryNameKR(nextRace.circuit.country)}
              </div>
              <div className="num" style={{ fontSize: 44, lineHeight: 1 }}>
                {countdown.days}
                <span className="en" style={{ fontSize: 15 }}>d</span>{' '}
                {String(countdown.hours).padStart(2, '0')}:
                {String(countdown.minutes).padStart(2, '0')}:
                {String(countdown.seconds).padStart(2, '0')}
              </div>
              <div className="en">
                {t('roundAndDate', { round: nextRace.round, datetime: formatLocalDateTime(nextRace) })}
              </div>
            </>
          ) : seasonOver ? (
            <>
              <div className="k">{t('mhSeasonResult')}</div>
              <div className="num" style={{ fontSize: 28, lineHeight: 1.1 }}>
                {leader ? driverName(leader) : '–'}
              </div>
              <div className="en">
                {leader ? t('subPts', { n: leader.points }) : ''}
                {races.length > 0 ? ` · ${races[races.length - 1].raceName}` : ''}
              </div>
            </>
          ) : null
        }
      />

      {/* Season at a glance — four figures, hairline-divided, no card chrome. */}
      <div className="stat-row fade-in">
        <div className="stat-cell">
          <div className="k">{t('kpiLeader')}</div>
          <span className="num">{leader ? surname(leader) : '–'}</span>
          <div className="en">
            {leader ? `${t('subPts', { n: leader.points })} · ${getTeamNameKR(leader.constructor.name)}` : ''}
          </div>
        </div>
        <div className="stat-cell">
          <div className="k">{t('kpiGap')}</div>
          <span className="num">{gap != null ? gap : '–'}</span>
          <div className="en">
            {runnerUp ? `${surname(runnerUp)} ${runnerUp.points}` : ''}
          </div>
        </div>
        <div className="stat-cell">
          <div className="k">{t('kpiConstructor')}</div>
          <span className="num">{teamLeader ? getTeamNameKR(teamLeader.constructor.name) : '–'}</span>
          <div className="en">{teamLeader ? t('subPts', { n: teamLeader.points }) : ''}</div>
        </div>
        <div className="stat-cell">
          <div className="k">{seasonOver ? t('kpiRounds') : t('kpiRemaining')}</div>
          <span className="num">
            {seasonOver ? races.length : remaining} / {races.length}
          </span>
          <div className="en">
            {!seasonOver && nextRace ? `R${nextRace.round} ${getCountryNameKR(nextRace.circuit.country)}` : ''}
            {seasonOver && races.length > 0 ? races[races.length - 1].raceName : ''}
          </div>
        </div>
      </div>

      <div className="split-2">
        {/* Driver Standings Summary */}
        <div className="fade-in fade-in-delay-2">
          <div className="section-label">
            <span className="k">{UI_LABELS.driverStandings} TOP 5</span>
          </div>
          {standings.loading ? (
            showStandingsSkeleton ? (
              <SkeletonRegion><SkeletonTable rows={5} columns={4} /></SkeletonRegion>
            ) : null
          ) : standings.error ? (
            <ErrorBanner detail={standings.error} onRetry={standings.refetch} attempts={standings.failures} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_LABELS.position}</th>
                  <th>{UI_LABELS.driver}</th>
                  <th className="col-team">{UI_LABELS.team}</th>
                  <th style={{ textAlign: 'right' }}>{UI_LABELS.points}</th>
                </tr>
              </thead>
              <tbody>
                {standings.data?.standings?.slice(0, 5).map((s: DriverStanding) => (
                  <tr key={s.driver.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className={`position-badge position-${s.position <= 3 ? s.position : 'other'}`}>
                          {s.position}
                        </span>
                        <span style={{ width: 30 }}><PosDelta delta={s.positionDelta} /></span>
                      </span>
                    </td>
                    <td>
                      <span className="team-indicator" style={{ backgroundColor: getTeamColor(s.constructor.name) }} />
                      <span className="driver-name">{getDriverNameKR(s.driver.id, `${s.driver.firstName} ${s.driver.lastName}`)}</span>
                      <span className="driver-team-sub">{getTeamNameKR(s.constructor.name)}</span>
                    </td>
                    <td className="col-team" style={{ color: 'var(--text-secondary)' }}>{getTeamNameKR(s.constructor.name)}</td>
                    <td style={{ textAlign: 'right' }}><span className="points-value">{s.points}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Last Race Results */}
        <div className="fade-in fade-in-delay-3">
          <div className="section-label">
            <span className="k">{UI_LABELS.lastRace}</span>
            {lastRace.data && (
              <span className="en">
                {lastRace.data.raceName} · {t('roundN', { n: lastRace.data.round })}
              </span>
            )}
          </div>
          {lastRace.loading ? (
            showLastRaceSkeleton ? (
              <SkeletonRegion>
                <div className="result-cards">
                  {[0, 1, 2].map((i) => <SkeletonBlock key={i} height={190} style={{ display: 'block' }} />)}
                </div>
              </SkeletonRegion>
            ) : null
          ) : lastRace.error ? (
            <ErrorBanner detail={lastRace.error} onRetry={lastRace.refetch} attempts={lastRace.failures} />
          ) : lastRace.data ? (
            /* Three equal cards, each led by a large numeral with the driver
               pinned to the bottom — the canvas's "recent race" block. */
            <div className="result-cards">
              {[
                lastRace.data.results?.[0],
                lastRace.data.results?.[1],
                lastRace.data.results?.[2],
              ].filter(Boolean).map((r: LastRaceResult) => {
                const position = Number(r.position);
                const teamName = r.constructor?.name || '';

                return (
                  <div className="result-card" key={position}>
                    <span
                      className="num result-card-pos"
                      style={{ color: podiumColor(position) ?? 'var(--text-primary)' }}
                    >
                      {position}
                    </span>
                    <span
                      className="result-card-strip"
                      style={{ backgroundColor: getTeamColor(teamName) }}
                    />
                    <div className="result-card-name">
                      {`${r.driver.firstName} ${r.driver.lastName}`}
                    </div>
                    <div className="en">
                      {getTeamNameKR(teamName)}
                      {r.time ? ` · ${r.time}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="loading-text">{UI_LABELS.noData}</div>
          )}
        </div>
      </div>
    </div>
  );
}
