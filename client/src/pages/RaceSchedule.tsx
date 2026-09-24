import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule } from '../services/api';
import { getCountryNameKR, UI_LABELS } from '../constants/koreanTerms';
import { getRaceDateTime, formatLocalDate, formatLocalShort, getRaceSessions, getLocalTZLabel } from '../utils/raceDate';
import PageMasthead from '../components/PageMasthead';
import ErrorBanner from '../components/ErrorBanner';
import { SkeletonRegion, SkeletonMasthead, SkeletonCards } from '../components/Skeleton';
import useDeferredLoading from '../hooks/useDeferredLoading';
import { useT } from '../i18n';

interface Props { year: number; }

// Sessions always visible when collapsed; practice/qualifying hide behind the toggle.
const ALWAYS_SHOWN = new Set(['sprint', 'race']);

export default function RaceSchedule({ year }: Props) {
  const t = useT();
  const { data, loading, error, refetch, failures } = useApi((signal) => getSeasonSchedule(year, signal), [year]);
  const [expanded, setExpanded] = useState(false);
  const showSkeleton = useDeferredLoading(loading);

  // Land on the next race instead of round 1 once the schedule arrives.
  useEffect(() => {
    const next = data?.races?.find((r: any) => getRaceDateTime(r) > new Date());
    if (next) document.getElementById(`round-${next.round}`)?.scrollIntoView({ block: 'start' });
  }, [data]);

  if (loading) return (
    <div className="page-container">
      {showSkeleton && (
        <SkeletonRegion>
          <SkeletonMasthead />
          <SkeletonCards count={12} />
        </SkeletonRegion>
      )}
    </div>
  );

  if (error) return (
    <div className="page-container">
      <ErrorBanner detail={error} onRetry={refetch} attempts={failures} />
    </div>
  );

  const races = data?.races || [];
  const now = new Date();
  const nextRaceIdx = races.findIndex((r: any) => getRaceDateTime(r) > now);

  const nextRace = nextRaceIdx >= 0 ? races[nextRaceIdx] : null;

  return (
    <div className="page-container">
      <PageMasthead
        kicker={t('scheduleSubtitle', { year, count: races.length, tz: getLocalTZLabel() })}
        title={UI_LABELS.raceSchedule}
        subtitle="Race Schedule"
        aside={
          <div className="seg" role="group" aria-label={t('showAllSessions')}>
            <button
              type="button"
              className={`seg-opt ${!expanded ? 'active' : ''}`}
              aria-pressed={!expanded}
              onClick={() => setExpanded(false)}
            >
              {t('segRaceOnly')}
            </button>
            <button
              type="button"
              className={`seg-opt ${expanded ? 'active' : ''}`}
              aria-pressed={expanded}
              onClick={() => setExpanded(true)}
            >
              {t('segAllSessions')}
            </button>
          </div>
        }
      />

      {/* On a narrow screen the next race is easy to lose in a long grid, so it
          is pinned above it with a jump link. */}
      {nextRace && (
        <a className="next-race-pin" href={`#round-${nextRace.round}`}>
          <span className="k">{t('nextRace')} · {t('roundN', { n: nextRace.round })}</span>
          <span className="next-race-pin-name">{nextRace.raceName}</span>
          <span className="en">{formatLocalDate(nextRace)}</span>
        </a>
      )}

      <div className="schedule-grid">
        {races.map((race: any, idx: number) => {
          const isPast = getRaceDateTime(race) < now;
          const isNext = idx === nextRaceIdx;

          return (
            <div
              key={race.round}
              id={`round-${race.round}`}
              className={`schedule-cell ${isPast ? 'is-past' : ''} ${isNext ? 'is-next' : ''}`}
            >
              <div className="schedule-cell-top">
                <span className="num schedule-round-num">{String(race.round).padStart(2, '0')}</span>
                <span className="k schedule-status">
                  {isNext ? t('nextRace') : isPast ? t('completed') : t('upcoming')}
                </span>
              </div>
              <div className="schedule-cell-body">
                <strong className="schedule-name">{race.raceName}</strong>
                <div className="en">
                  {race.circuit.name} · {race.circuit.locality}, {getCountryNameKR(race.circuit.country)}
                </div>
                <div className="schedule-date">{formatLocalDate(race)}</div>
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
