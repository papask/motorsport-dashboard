import { useApi } from '../hooks/useApi';
import { getSeasonSchedule } from '../services/api';
import { getCountryNameKR, UI_LABELS } from '../constants/koreanTerms';

interface Props { year: number; }

export default function RaceSchedule({ year }: Props) {
  const { data, loading, error, refetch } = useApi((signal) => getSeasonSchedule(year, signal), [year]);


  if (loading) return (
    <div className="page-container">
      <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{UI_LABELS.loading}</div></div>
    </div>
  );

  if (error) return (
    <div className="page-container">
      <div className="error-container">
        <div className="error-icon">⚠️</div>
        <div className="error-message">{error}</div>
        <button className="retry-btn" onClick={refetch}>다시 시도</button>
      </div>
    </div>
  );

  const races = data?.races || [];
  const now = new Date();
  const nextRaceIdx = races.findIndex((r: any) => new Date(r.date) > now);

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">📅 {UI_LABELS.raceSchedule}</h2>
        <p className="page-subtitle">{year} 시즌 · 총 {races.length}개 그랑프리</p>
      </div>

      <div className="card-grid card-grid-3">
        {races.map((race: any, idx: number) => {
          const isPast = new Date(race.date) < now;
          const isNext = idx === nextRaceIdx;
          const raceDate = new Date(race.date);

          return (
            <div
              key={race.round}
              className={`card schedule-card fade-in ${isPast ? 'schedule-past' : ''} ${isNext ? 'schedule-next' : ''}`}
              style={{ animationDelay: `${Math.min(idx * 0.03, 0.3)}s`, opacity: 0 }}
            >
              <div className="schedule-round">라운드 {race.round}</div>
              <div className="schedule-name">{race.raceName}</div>
              <div className="schedule-circuit">{race.circuit.name}</div>
              <div className="schedule-circuit">{race.circuit.locality}, {getCountryNameKR(race.circuit.country)}</div>
              <div className="schedule-date">
                📅 {raceDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
              </div>
              {isNext && <span className="schedule-badge badge-next">다음 레이스</span>}
              {isPast && <span className="schedule-badge badge-completed">완료</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
