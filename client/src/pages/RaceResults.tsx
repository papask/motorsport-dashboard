import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getRaceResults, getQualifyingResults, getSprintResults } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, getStatusKR, UI_LABELS } from '../constants/koreanTerms';
import { getRaceDateTime, formatLocalDateTime } from '../utils/raceDate';
import { useT } from '../i18n';

interface Props { year: number; }

type SessionType = 'race' | 'qualifying' | 'sprint';

export default function RaceResults({ year }: Props) {
  const t = useT();
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState<SessionType | ''>('');
  const schedule = useApi((signal) => getSeasonSchedule(year, signal), [year]);

  // On the first page entry the most recent round is auto-selected (below).
  // Switching the season afterwards resets to round 1 with no session picked.
  // (Compare against the previous year rather than a "first load" flag so that
  // React StrictMode's double-invoked mount effect doesn't trigger a reset.)
  const prevYearRef = useRef(year);
  useEffect(() => {
    if (prevYearRef.current !== year) {
      prevYearRef.current = year;
      setSelectedRound(1);
      setSessionType('');
    }
  }, [year]);

  const fetchers: Record<SessionType, (signal?: AbortSignal) => Promise<any>> = {
    race: (signal) => getRaceResults(year, selectedRound!, signal),
    qualifying: (signal) => getQualifyingResults(year, selectedRound!, signal),
    sprint: (signal) => getSprintResults(year, selectedRound!, signal),
  };
  const results = useApi(
    (signal) => selectedRound && sessionType ? fetchers[sessionType](signal) : Promise.resolve(null),
    [year, selectedRound, sessionType]
  );


  const races = schedule.data?.races || [];
  const now = new Date();

  // Start time of a given session for a round (falls back to the race start).
  const sessionStart = (r: any, type: SessionType) => {
    if (type === 'qualifying' && r?.qualifying?.date) return getRaceDateTime(r.qualifying);
    if (type === 'sprint' && r?.sprint?.date) return getRaceDateTime(r.sprint);
    return getRaceDateTime(r);
  };
  const isSessionStarted = (r: any, type: SessionType) => !!r && sessionStart(r, type) <= now;
  // A round is selectable once its earliest result-bearing session has started.
  const isRoundStarted = (r: any) => {
    const times = [getRaceDateTime(r).getTime()];
    if (r?.qualifying?.date) times.push(getRaceDateTime(r.qualifying).getTime());
    if (r?.sprint?.date) times.push(getRaceDateTime(r.sprint).getTime());
    return Math.min(...times) <= now.getTime();
  };

  // Auto-select the latest race that has already started
  if (!selectedRound && races.length > 0) {
    const started = races.filter((r: any) => getRaceDateTime(r) < now);
    if (started.length > 0) {
      const lastRound = started[started.length - 1].round;
      setTimeout(() => setSelectedRound(lastRound), 0);
    }
  }

  const selectedRace = races.find((r: any) => r.round === selectedRound);
  const hasSprint = !!selectedRace?.sprint;
  const hasResults = !!(results.data && Array.isArray(results.data.results) && results.data.results.length > 0);

  const handleRoundChange = (round: number) => {
    setSelectedRound(round);
    // Changing the round always requires picking the session again.
    setSessionType('');
  };

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">🏁 {UI_LABELS.raceResults}</h2>
        <p className="page-subtitle">{t('raceResultsSubtitle', { year })}</p>
      </div>

      <div className="selector-group fade-in fade-in-delay-1" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <select
          className="selector"
          value={selectedRound || ''}
          onChange={(e) => handleRoundChange(Number(e.target.value))}
        >
          <option value="" disabled>{t('selectGP')}</option>
          {races.map((r: any) => {
            const started = isRoundStarted(r);
            return (
              <option key={r.round} value={r.round} disabled={!started}>
                {t('roundNameOption', { n: r.round, name: r.raceName })}{started ? '' : t('upcomingSuffix')}
              </option>
            );
          })}
        </select>

        <select
          className="selector"
          value={sessionType}
          onChange={(e) => setSessionType(e.target.value as SessionType)}
        >
          <option value="" disabled>{t('selectSession')}</option>
          <option value="race" disabled={!!selectedRace && !isSessionStarted(selectedRace, 'race')}>{UI_LABELS.raceResults}</option>
          <option value="qualifying" disabled={!!selectedRace && !isSessionStarted(selectedRace, 'qualifying')}>{UI_LABELS.qualifying}</option>
          {hasSprint && <option value="sprint" disabled={!isSessionStarted(selectedRace, 'sprint')}>{UI_LABELS.sprint}</option>}
        </select>
      </div>

      {(!selectedRound || !sessionType) ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏁</div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {!selectedRound ? t('promptSelectGP') : t('promptSelectSession')}
          </div>
        </div>
      ) : results.loading ? (
        <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{UI_LABELS.loading}</div></div>
      ) : (results.error || !hasResults) ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏁</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('noResultsTitle')}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
            {t('notRunYetBody')}<br />{t('checkBackAfter')}
          </div>
        </div>
      ) : hasResults ? (
        <div className="card fade-in fade-in-delay-2">
          <div className="card-title">
            {results.data.raceName}
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 12, fontWeight: 400 }}>
              {results.data.circuit?.name} · {formatLocalDateTime(results.data)}
            </span>
          </div>
          {sessionType === 'qualifying' ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_LABELS.position}</th>
                  <th>{UI_LABELS.driver}</th>
                  <th className="col-team">{UI_LABELS.team}</th>
                  <th className="col-detail" style={{ textAlign: 'center' }}>Q1</th>
                  <th className="col-detail" style={{ textAlign: 'center' }}>Q2</th>
                  <th className="col-detail" style={{ textAlign: 'center' }}>Q3</th>
                </tr>
              </thead>
              <tbody>
                {results.data.results?.map((q: any) => (
                  <tr key={q.position}>
                    <td>
                      <span className={`position-badge position-${q.position <= 3 ? q.position : 'other'}`}>
                        {q.position}
                      </span>
                    </td>
                    <td>
                      <span className="team-indicator" style={{ backgroundColor: getTeamColor(q.constructor.name) }} />
                      <span className="driver-name">{getDriverNameKR(q.driver.id, `${q.driver.firstName} ${q.driver.lastName}`)}</span>
                      <span className="driver-code" style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{q.driver.code}</span>
                      <span className="driver-team-sub">{getTeamNameKR(q.constructor.name)}</span>
                      <span className="driver-points-sub">
                        <span>Q1 {q.q1 || '-'}</span>
                        <span>Q2 {q.q2 || '-'}</span>
                        <span>Q3 {q.q3 || '-'}</span>
                      </span>
                    </td>
                    <td className="col-team" style={{ color: 'var(--text-secondary)' }}>{getTeamNameKR(q.constructor.name)}</td>
                    <td className="col-detail" style={{ textAlign: 'center', fontSize: 13 }}>{q.q1 || '-'}</td>
                    <td className="col-detail" style={{ textAlign: 'center', fontSize: 13 }}>{q.q2 || '-'}</td>
                    <td className="col-detail" style={{ textAlign: 'center', fontSize: 13 }}>{q.q3 || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_LABELS.position}</th>
                  <th>{UI_LABELS.driver}</th>
                  <th className="col-team">{UI_LABELS.team}</th>
                  <th className="col-detail" style={{ textAlign: 'center' }}>{UI_LABELS.grid}</th>
                  <th className="col-detail" style={{ textAlign: 'center' }}>{UI_LABELS.lap}</th>
                  <th className="col-detail">{t('timeOrStatus')}</th>
                  <th className="col-detail" style={{ textAlign: 'right' }}>{UI_LABELS.points}</th>
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
                      <span className="driver-team-sub">{getTeamNameKR(r.constructor.name)}</span>
                      <span className="driver-points-sub">
                        <span>{t('subGrid', { n: r.grid })}</span>
                        <span>{t('subLaps', { n: r.laps })}</span>
                        <span>{r.time || getStatusKR(r.status)}</span>
                        {r.fastestLap?.rank === 1 && (
                          <span style={{ color: '#a855f7', fontWeight: 700 }}>⚡ {UI_LABELS.fastestLap}</span>
                        )}
                        <span className="cur">{t('subPts', { n: r.points })}</span>
                      </span>
                    </td>
                    <td className="col-team" style={{ color: 'var(--text-secondary)' }}>{getTeamNameKR(r.constructor.name)}</td>
                    <td className="col-detail" style={{ textAlign: 'center' }}>{r.grid}</td>
                    <td className="col-detail" style={{ textAlign: 'center' }}>{r.laps}</td>
                    <td className="col-detail" style={{ fontSize: 13 }}>
                      {r.time || getStatusKR(r.status)}
                      {r.fastestLap?.rank === 1 && (
                        <span style={{ color: '#a855f7', marginLeft: 8, fontSize: 11, fontWeight: 700 }}>⚡ {UI_LABELS.fastestLap}</span>
                      )}
                    </td>
                    <td className="col-detail" style={{ textAlign: 'right' }}><span className="points-value">{r.points}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
