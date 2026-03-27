import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getRaceResults } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, getStatusKR, UI_LABELS } from '../constants/koreanTerms';

interface Props { year: number; }

export default function RaceResults({ year }: Props) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const schedule = useApi((signal) => getSeasonSchedule(year, signal), [year]);
  const results = useApi(
    (signal) => selectedRound ? getRaceResults(year, selectedRound, signal) : Promise.resolve(null),
    [year, selectedRound]
  );


  // Auto-select latest completed race
  const races = schedule.data?.races || [];
  if (!selectedRound && races.length > 0) {
    const now = new Date();
    const pastRaces = races.filter((r: any) => new Date(r.date) < now);
    if (pastRaces.length > 0) {
      const lastRound = pastRaces[pastRaces.length - 1].round;
      setTimeout(() => setSelectedRound(lastRound), 0);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">🏁 {UI_LABELS.raceResults}</h2>
        <p className="page-subtitle">{year} 시즌 레이스 결과 상세</p>
      </div>

      <div className="selector-group fade-in fade-in-delay-1">
        <select
          className="selector"
          value={selectedRound || ''}
          onChange={(e) => setSelectedRound(Number(e.target.value))}
        >
          <option value="" disabled>그랑프리 선택</option>
          {races.map((r: any) => (
            <option key={r.round} value={r.round}>
              라운드 {r.round} - {r.raceName}
            </option>
          ))}
        </select>
      </div>

      {results.loading && selectedRound ? (
        <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{UI_LABELS.loading}</div></div>
      ) : results.error ? (
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{results.error}</div>
        </div>
      ) : results.data ? (
        <div className="card fade-in fade-in-delay-2">
          <div className="card-title">
            {results.data.raceName}
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 12, fontWeight: 400 }}>
              {results.data.circuit?.name} · {results.data.date}
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>{UI_LABELS.position}</th>
                <th>{UI_LABELS.driver}</th>
                <th>{UI_LABELS.team}</th>
                <th style={{ textAlign: 'center' }}>{UI_LABELS.grid}</th>
                <th style={{ textAlign: 'center' }}>{UI_LABELS.lap}</th>
                <th>시간 / 상태</th>
                <th style={{ textAlign: 'right' }}>{UI_LABELS.points}</th>
              </tr>
            </thead>
            <tbody>
              {results.data.results?.map((r: any) => (
                <tr key={r.position}>
                  <td>
                    <span className={`position-badge position-${r.position <= 3 ? r.position : 'other'}`}>
                      {r.positionText}
                    </span>
                  </td>
                  <td>
                    <span className="team-indicator" style={{ backgroundColor: getTeamColor(r.constructor.name) }} />
                    <span className="driver-name">{getDriverNameKR(r.driver.id, `${r.driver.firstName} ${r.driver.lastName}`)}</span>
                    <span className="driver-code" style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{r.driver.code}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{getTeamNameKR(r.constructor.name)}</td>
                  <td style={{ textAlign: 'center' }}>{r.grid}</td>
                  <td style={{ textAlign: 'center' }}>{r.laps}</td>
                  <td style={{ fontSize: 13 }}>
                    {r.time || getStatusKR(r.status)}
                    {r.fastestLap?.rank === 1 && (
                      <span style={{ color: '#a855f7', marginLeft: 8, fontSize: 11, fontWeight: 700 }}>⚡ {UI_LABELS.fastestLap}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}><span className="points-value">{r.points}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !selectedRound ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏁</div>
          <div style={{ color: 'var(--text-secondary)' }}>그랑프리를 선택하여 결과를 확인하세요</div>
        </div>
      ) : null}
    </div>
  );
}
