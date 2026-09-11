import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule } from '../services/api';
import { getCountryNameKR, UI_LABELS } from '../constants/koreanTerms';
import { getRaceDateTime, formatLocalDate, formatLocalShort, getRaceSessions, getLocalTZLabel } from '../utils/raceDate';
import { useT } from '../i18n';

interface Props { year: number; }

// Sessions always visible when collapsed; practice/qualifying hide behind the toggle.
const ALWAYS_SHOWN = new Set(['sprint', 'race']);

export default function RaceSchedule({ year }: Props) {
  const t = useT();
  const { data, loading, error, refetch } = useApi((signal) => getSeasonSchedule(year, signal), [year]);
  const [expanded, setExpanded] = useState(false);


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
        <button className="retry-btn" onClick={refetch}>{t('retry')}</button>
      </div>
    </div>
  );

  const races = data?.races || [];
  const now = new Date();
  const nextRaceIdx = races.findIndex((r: any) => getRaceDateTime(r) > now);

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">📅 {UI_LABELS.raceSchedule}</h2>
        <p className="page-subtitle">{t('scheduleSubtitle', { year, count: races.length, tz: getLocalTZLabel() })}</p>
        <label className="switch-field">
          <span className="switch-field-label">{t('showAllSessions')}</span>
          <input
            type="checkbox"
            className="switch-input"
            checked={expanded}
            onChange={(e) => setExpanded(e.target.checked)}
          />
          <span className="switch" aria-hidden="true" />
        </label>
      </div>

      <div className="card-grid card-grid-3">
        {races.map((race: any, idx: number) => {
          const isPast = getRaceDateTime(race) < now;
          const isNext = idx === nextRaceIdx;

          return (
            <div
              key={race.round}
              className={`card schedule-card fade-in ${isPast ? 'schedule-past' : ''} ${isNext ? 'schedule-next' : ''}`}
              style={{ animationDelay: `${Math.min(idx * 0.03, 0.3)}s`, opacity: 0 }}
            >
              <div className="schedule-round">{t('roundN', { n: race.round })}</div>
              <div className="schedule-name">{race.raceName}</div>
              <div className="schedule-circuit">{race.circuit.name}</div>
              <div className="schedule-circuit">{race.circuit.locality}, {getCountryNameKR(race.circuit.country)}</div>
              <div className="schedule-date">
                📅 {formatLocalDate(race)}
              </div>
              <div className="schedule-sessions">
                {getRaceSessions(race)
                  .filter((s) => expanded || ALWAYS_SHOWN.has(s.key))
                  .map((s) => (
                    <div className="schedule-session-row" key={s.key}>
                      <span className="schedule-session-label">{s.label}</span>
                      <span className="schedule-session-time">{formatLocalShort(s)}</span>
                    </div>
                  ))}
              </div>
              {isNext && <span className="schedule-badge badge-next">{t('nextRace')}</span>}
              {isPast && <span className="schedule-badge badge-completed">{t('completed')}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
