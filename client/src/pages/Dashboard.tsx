import { useApi } from '../hooks/useApi';
import { getDriverStandings, getLastRaceResults, getSeasonSchedule } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, getCountryNameKR, UI_LABELS } from '../constants/koreanTerms';
import { getRaceDateTime, formatLocalDateTime, getNextRace } from '../utils/raceDate';
import useCountdown from '../hooks/useCountdown';
import PosDelta from '../components/PosDelta';
import { useT } from '../i18n';

interface DashboardProps {
  year: number;
}

interface ScheduleRace {
  round: number;
  raceName: string;
  date: string;
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

function getPodiumClass(position: number) {
  if (position === 1) return 'podium-first';
  if (position === 2) return 'podium-second';
  return 'podium-third';
}

export default function Dashboard({ year }: DashboardProps) {
  const t = useT();
  const schedule = useApi((signal) => getSeasonSchedule(year, signal), [year]);
  const standings = useApi((signal) => getDriverStandings(year, signal), [year]);
  const lastRace = useApi((signal) => getLastRaceResults(signal), []);


  const nextRace = schedule.data ? getNextRace(schedule.data.races) : null;
  const countdown = useCountdown(nextRace ? getRaceDateTime(nextRace).toISOString() : null);

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">{UI_LABELS.dashboard}</h2>
        <p className="page-subtitle">{t('dashboardSubtitle', { year })}</p>
      </div>

      {/* Next Race Countdown */}
      <div className="card countdown-card fade-in fade-in-delay-1" style={{ marginBottom: 20 }}>
        <div className="card-title">🏁 {UI_LABELS.nextRace}</div>
        {schedule.loading ? (
          <div className="loading-text">{UI_LABELS.loading}</div>
        ) : nextRace ? (
          <>
            <div className="countdown-grid">
              <div className="countdown-item">
                <div className="countdown-number">{countdown.days}</div>
                <div className="countdown-unit">{t('unitDays')}</div>
              </div>
              <div className="countdown-item">
                <div className="countdown-number">{countdown.hours}</div>
                <div className="countdown-unit">{t('unitHours')}</div>
              </div>
              <div className="countdown-item">
                <div className="countdown-number">{countdown.minutes}</div>
                <div className="countdown-unit">{t('unitMinutes')}</div>
              </div>
              <div className="countdown-item">
                <div className="countdown-number">{countdown.seconds}</div>
                <div className="countdown-unit">{t('unitSeconds')}</div>
              </div>
            </div>
            <div className="race-info">
              <div className="race-info-name">{nextRace.raceName}</div>
              <div className="race-info-detail">
                {nextRace.circuit.name} · {getCountryNameKR(nextRace.circuit.country)}
              </div>
              <div className="race-info-detail">
                {t('roundAndDate', { round: nextRace.round, datetime: formatLocalDateTime(nextRace) })}
              </div>
            </div>
          </>
        ) : (
          <div className="loading-text">{t('seasonEnded')}</div>
        )}
      </div>

      <div className="card-grid card-grid-2">
        {/* Driver Standings Summary */}
        <div className="card fade-in fade-in-delay-2">
          <div className="card-title">🏆 {UI_LABELS.driverStandings} TOP 5</div>
          {standings.loading ? (
            <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{UI_LABELS.loading}</div></div>
          ) : standings.error ? (
            <div className="error-container"><div className="error-icon">⚠️</div><div className="error-message">{standings.error}</div></div>
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
        <div className="card fade-in fade-in-delay-3">
          <div className="card-title">🏁 {UI_LABELS.lastRace}</div>
          {lastRace.loading ? (
            <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{UI_LABELS.loading}</div></div>
          ) : lastRace.error ? (
            <div className="error-container"><div className="error-icon">⚠️</div><div className="error-message">{lastRace.error}</div></div>
          ) : lastRace.data ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {lastRace.data.raceName} · {t('roundN', { n: lastRace.data.round })}
              </div>
              <div className="podium-layout">
                {[
                  lastRace.data.results?.[1],
                  lastRace.data.results?.[0],
                  lastRace.data.results?.[2],
                ].filter(Boolean).map((r: LastRaceResult) => {
                  const position = Number(r.position);
                  const driverName = `${r.driver.firstName} ${r.driver.lastName}`;
                  const teamName = r.constructor?.name || '';

                  return (
                    <div className={`podium-driver ${getPodiumClass(position)}`} key={position}>
                      <div className="podium-driver-card">
                        <div className={`podium-medal position-${position}`}>
                          {position}
                        </div>
                        <div
                          className="podium-team-strip"
                          style={{ backgroundColor: getTeamColor(teamName) }}
                        />
                        <div className="podium-driver-name">{driverName}</div>
                        <div className="podium-team-name">{getTeamNameKR(teamName)}</div>
                        <div className="podium-time">{r.time}</div>
                      </div>
                      <div className="podium-block">
                        <span>{position}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="loading-text">{UI_LABELS.noData}</div>
          )}
        </div>
      </div>
    </div>
  );
}
