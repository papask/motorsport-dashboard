import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getRaceResults, getQualifyingResults, getSprintResults } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, getStatusKR, UI_LABELS } from '../constants/koreanTerms';
import { status, podiumColor } from '../theme/tokens';
import PageMasthead from '../components/PageMasthead';
import RoundSelector from '../components/RoundSelector';
import StateBlock from '../components/StateBlock';
import { SkeletonRegion, SkeletonTable } from '../components/Skeleton';
import useDeferredLoading from '../hooks/useDeferredLoading';
import { getRaceDateTime, formatLocalDateTime } from '../utils/raceDate';
import { useT } from '../i18n';

interface Props { year: number; }

type SessionType = 'race' | 'qualifying' | 'sprint';

export default function RaceResults({ year }: Props) {
  const t = useT();
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  // ?session=race (the dashboard's "more" link) opens straight onto that
  // session of the auto-selected latest round.
  const [searchParams] = useSearchParams();
  const initialSession = searchParams.get('session');
  const [sessionType, setSessionType] = useState<SessionType | ''>(
    initialSession === 'race' || initialSession === 'qualifying' || initialSession === 'sprint' ? initialSession : ''
  );
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


  const showSkeleton = useDeferredLoading(results.loading);
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

  // Land on the race itself rather than an empty prompt: the canvas shows a
  // session on entry, and the race is the one people come for.
  useEffect(() => {
    if (selectedRound && !sessionType && selectedRace && isSessionStarted(selectedRace, 'race')) {
      setSessionType('race');
    }
  }, [selectedRound, sessionType, selectedRace]);

  const sessionOptions: { value: SessionType; label: string; enabled: boolean }[] = [
    { value: 'race', label: UI_LABELS.raceResults, enabled: !selectedRace || isSessionStarted(selectedRace, 'race') },
    { value: 'qualifying', label: UI_LABELS.qualifying, enabled: !selectedRace || isSessionStarted(selectedRace, 'qualifying') },
    ...(hasSprint
      ? [{ value: 'sprint' as SessionType, label: UI_LABELS.sprint, enabled: isSessionStarted(selectedRace, 'sprint') }]
      : []),
  ];

  return (
    <div className="page-container">
      <PageMasthead
        kicker={
          selectedRace
            ? `${t('seasonRound', { year, round: selectedRace.round })} · ${selectedRace.circuit?.locality ?? ''}`
            : t('raceResultsSubtitle', { year })
        }
        title={selectedRace ? selectedRace.raceName : UI_LABELS.raceResults}
        subtitle={
          results.data
            ? `${results.data.circuit?.name ?? ''} · ${formatLocalDateTime(results.data)}`
            : 'Race Results'
        }
        aside={
          <div className="masthead-controls">
            <RoundSelector
              rounds={races.map((r: any) => ({
                round: r.round,
                raceName: r.raceName,
                locality: r.circuit?.locality,
                available: isRoundStarted(r),
              }))}
              value={selectedRound}
              onChange={handleRoundChange}
            />
            <div className="seg" role="group" aria-label={t('selectSession')}>
              {sessionOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`seg-opt ${sessionType === o.value ? 'active' : ''}`}
                  aria-pressed={sessionType === o.value}
                  aria-disabled={!o.enabled}
                  disabled={!o.enabled}
                  onClick={() => setSessionType(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {(!selectedRound || !sessionType) ? (
        <StateBlock
          title={!selectedRound ? t('promptSelectGP') : t('promptSelectSession')}
          reason={t('promptSelectReason')}
        />
      ) : results.loading ? (
        showSkeleton ? <SkeletonRegion><SkeletonTable rows={14} columns={6} /></SkeletonRegion> : null
      ) : (results.error || !hasResults) ? (
        <StateBlock
          title={t('noResultsTitle')}
          reason={`${t('notRunYetBody')} ${t('checkBackAfter')}`}
          detail={results.error || undefined}
          tone={results.error ? 'error' : 'empty'}
          actions={results.error ? [{ label: t('retry'), onClick: results.refetch, primary: true }] : undefined}
        />
      ) : hasResults ? (
        <div className="fade-in fade-in-delay-2">
          {sessionType === 'qualifying' ? (
            <div className="table-scroll">
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
            </div>
          ) : (
            <>
            {/* Podium strip: the three results people came for, read before the
                table rather than found inside it. */}
            <div className="podium-strip">
              {results.data.results?.slice(0, 3).map((r: any) => (
                <div className="podium-slot" key={r.position}>
                  <span className="num podium-slot-pos" style={{ color: podiumColor(r.position) ?? 'var(--text-primary)' }}>
                    {r.position}
                  </span>
                  <span className="podium-slot-body">
                    <strong className="podium-slot-name">
                      {getDriverNameKR(r.driver.id, `${r.driver.firstName} ${r.driver.lastName}`)}
                    </strong>
                    <span className="en">
                      {getTeamNameKR(r.constructor.name)}
                      {r.time ? ` · ${r.time}` : ''}
                      {r.points > 0 ? ` · ${t('subPts', { n: r.points })}` : ''}
                      {r.fastestLap?.rank === 1 ? ' · FL' : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="table-scroll">
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
                          <span style={{ color: status.fastestLap, fontWeight: 700 }}>⚡ {UI_LABELS.fastestLap}</span>
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
                        <span style={{ color: status.fastestLap, marginLeft: 8, fontSize: 11, fontWeight: 700 }}>⚡ {UI_LABELS.fastestLap}</span>
                      )}
                    </td>
                    <td className="col-detail" style={{ textAlign: 'right' }}><span className="points-value">{r.points}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
