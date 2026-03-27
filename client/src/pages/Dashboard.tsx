import { useApi } from '../hooks/useApi';
import { getDriverStandings, getLastRaceResults, getSeasonSchedule } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, getCountryNameKR, UI_LABELS } from '../constants/koreanTerms';
import { useState, useEffect } from 'react';

interface DashboardProps {
  year: number;
}

function getNextRace(races: any[]) {
  const now = new Date();
  return races.find((r: any) => new Date(r.date) > now);
}

function useCountdown(targetDate: string | null) {
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!targetDate) return;
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return countdown;
}

export default function Dashboard({ year }: DashboardProps) {
  const schedule = useApi((signal) => getSeasonSchedule(year, signal), [year]);
  const standings = useApi((signal) => getDriverStandings(year, signal), [year]);
  const lastRace = useApi((signal) => getLastRaceResults(signal), []);


  const nextRace = schedule.data ? getNextRace(schedule.data.races) : null;
  const countdown = useCountdown(nextRace?.date || null);

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">{UI_LABELS.dashboard}</h2>
        <p className="page-subtitle">{year} 시즌 포뮬러 1 데이터 한눈에 보기</p>
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
                <div className="countdown-unit">일</div>
              </div>
              <div className="countdown-item">
                <div className="countdown-number">{countdown.hours}</div>
                <div className="countdown-unit">시간</div>
              </div>
              <div className="countdown-item">
                <div className="countdown-number">{countdown.minutes}</div>
                <div className="countdown-unit">분</div>
              </div>
              <div className="countdown-item">
                <div className="countdown-number">{countdown.seconds}</div>
                <div className="countdown-unit">초</div>
              </div>
            </div>
            <div className="race-info">
              <div className="race-info-name">{nextRace.raceName}</div>
              <div className="race-info-detail">
                {nextRace.circuit.name} · {getCountryNameKR(nextRace.circuit.country)}
              </div>
              <div className="race-info-detail">
                라운드 {nextRace.round} · {new Date(nextRace.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </div>
            </div>
          </>
        ) : (
          <div className="loading-text">시즌이 종료되었습니다</div>
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
                  <th>{UI_LABELS.team}</th>
                  <th style={{ textAlign: 'right' }}>{UI_LABELS.points}</th>
                </tr>
              </thead>
              <tbody>
                {standings.data?.standings?.slice(0, 5).map((s: any) => (
                  <tr key={s.driver.id}>
                    <td>
                      <span className={`position-badge position-${s.position <= 3 ? s.position : 'other'}`}>
                        {s.position}
                      </span>
                    </td>
                    <td>
                      <span className="team-indicator" style={{ backgroundColor: getTeamColor(s.constructor.name) }} />
                      <span className="driver-name">{getDriverNameKR(s.driver.id, `${s.driver.firstName} ${s.driver.lastName}`)}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{getTeamNameKR(s.constructor.name)}</td>
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
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                {lastRace.data.raceName} · 라운드 {lastRace.data.round}
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{UI_LABELS.position}</th>
                    <th>{UI_LABELS.driver}</th>
                    <th style={{ textAlign: 'right' }}>시간</th>
                  </tr>
                </thead>
                <tbody>
                  {lastRace.data.results?.slice(0, 5).map((r: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <span className={`position-badge position-${r.position <= 3 ? r.position : 'other'}`}>
                          {r.position}
                        </span>
                      </td>
                      <td>
                        <span className="driver-name">{r.driver.firstName} {r.driver.lastName}</span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 13 }}>
                        {r.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="loading-text">{UI_LABELS.noData}</div>
          )}
        </div>
      </div>
    </div>
  );
}
