import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getRaceIncidents } from '../services/api';
import { t, useT, type MessageKey } from '../i18n';
import { UI_LABELS } from '../constants/koreanTerms';
import { FLAG_STYLES as FLAG_COLORS, incident, status } from '../theme/tokens';
import PageMasthead from '../components/PageMasthead';
import RoundSelector from '../components/RoundSelector';
import StateBlock from '../components/StateBlock';
import ErrorBanner from '../components/ErrorBanner';
import { SkeletonRegion, SkeletonMasthead, SkeletonTable } from '../components/Skeleton';
import useDeferredLoading from '../hooks/useDeferredLoading';

interface Props { year: number; }

// Flag fills come from the design tokens; only the icon and label live here.
const FLAG_STYLES: Record<string, { color: string; bg: string; icon: string; labelKey: MessageKey }> = {
  'GREEN': { ...FLAG_COLORS.GREEN, icon: '🟢', labelKey: 'flagGreen' },
  'YELLOW': { ...FLAG_COLORS.YELLOW, icon: '🟡', labelKey: 'flagYellow' },
  'DOUBLE YELLOW': { ...FLAG_COLORS['DOUBLE YELLOW'], icon: '🟡🟡', labelKey: 'flagDoubleYellow' },
  'RED': { ...FLAG_COLORS.RED, icon: '🔴', labelKey: 'flagRed' },
  'BLUE': { ...FLAG_COLORS.BLUE, icon: '🔵', labelKey: 'flagBlue' },
  'BLACK AND WHITE': { ...FLAG_COLORS['BLACK AND WHITE'], icon: '⚫⚪', labelKey: 'flagBlackWhite' },
  'CHEQUERED': { ...FLAG_COLORS.CHEQUERED, icon: '🏁', labelKey: 'flagChequered' },
  'CLEAR': { ...FLAG_COLORS.CLEAR, icon: '🟢', labelKey: 'flagClear' },
};


// The server's normalised event type, for messages the feed leaves unflagged.
// `flag` stays the first source because it is more granular — it separates a
// double yellow from a single one, which the normalised type collapses.
const EVENT_TYPE_FLAG: Record<string, string> = {
  redFlag: 'RED',
  yellowFlag: 'YELLOW',
  green: 'GREEN',
  chequered: 'CHEQUERED',
};

const flagKeyOf = (inc: any): string =>
  (inc.flag || '').toUpperCase() || EVENT_TYPE_FLAG[inc.eventType] || '';

// Blue flags are waved repeatedly at the same lapped driver within one lap
// (each entry differs only by its "TIMED AT hh:mm:ss" stamp). Collapse all blue
// flags for a given driver in a lap into a single row carrying a `_count`, so
// the timeline isn't flooded with near-identical entries.
function mergeBlueFlags(list: any[]): any[] {
  const result: any[] = [];
  const blueIdxByDriver: Record<string, number> = {};
  for (const inc of list) {
    const isBlue = (inc.flag || '').toUpperCase().includes('BLUE') && inc.driverNumber;
    if (isBlue) {
      const existing = blueIdxByDriver[inc.driverNumber];
      if (existing != null) {
        result[existing]._count += 1;
        continue;
      }
      blueIdxByDriver[inc.driverNumber] = result.length;
      result.push({ ...inc, _count: 1 });
    } else {
      result.push(inc);
    }
  }
  return result;
}

function RaceIncidents({ year }: Props) {
  useT(); // re-render on language change
  const { data: schedule, loading: schedLoading } = useApi(
    (signal) => getSeasonSchedule(year, signal), [year]
  );
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  // Set by shift-clicking a lap in the density rail; a plain click scrolls.
  const [lapFilter, setLapFilter] = useState<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const { data: incidentsData, loading: incLoading, error: incError, refetch: incRefetch, failures: incFailures } = useApi(
    (signal) => selectedRound ? getRaceIncidents(year, selectedRound, signal) : Promise.resolve(null),
    [year, selectedRound]
  );

  // Auto-select most recent race
  useEffect(() => {
    if (schedule?.races?.length && !selectedRound) {
      const now = new Date();
      const pastRaces = schedule.races.filter((r: any) => new Date(r.date || r.session5Date || '') < now);
      const latest = pastRaces.length > 0 ? pastRaces[pastRaces.length - 1] : schedule.races[0];
      setSelectedRound(latest.round);
    }
  }, [schedule]);

  const showSchedSkeleton = useDeferredLoading(schedLoading);
  const showIncSkeleton = useDeferredLoading(incLoading);
  const incidents = incidentsData?.incidents || [];
  // number → { code, name, team } so driver-specific messages can be named.
  const driversMap: Record<string, { code?: string; name?: string; team?: string }> =
    incidentsData?.drivers || {};

  // Unique categories
  const categories = [...new Set(incidents.map((i: any) => i.category).filter(Boolean))];

  // Filtered incidents
  const filtered = filterCategory === 'all'
    ? incidents
    : incidents.filter((i: any) => i.category === filterCategory);

  // Lap-scoped view, driven by shift-clicking the density rail.
  const lapScoped = lapFilter == null ? filtered : filtered.filter((i: any) => (i.lap || 0) === lapFilter);

  // Group by lap
  const groupedByLap: Record<number, any[]> = {};
  for (const inc of lapScoped) {
    const lap = inc.lap || 0;
    if (!groupedByLap[lap]) groupedByLap[lap] = [];
    groupedByLap[lap].push(inc);
  }
  const sortedLaps = Object.keys(groupedByLap).map(Number).sort((a, b) => a - b);

  // The rail spans every lap of the race, not just the ones with messages —
  // a quiet stretch is information too. Counts come from the category-filtered
  // set so the rail always matches what the table can show.
  const countByLap: Record<number, number> = {};
  for (const inc of filtered) {
    const lap = inc.lap || 0;
    countByLap[lap] = (countByLap[lap] ?? 0) + 1;
  }
  const totalLaps = incidentsData?.totalLaps
    ?? Math.max(0, ...incidents.map((i: any) => i.lap || 0));
  const lapAxis = Array.from({ length: totalLaps + 1 }, (_, i) => i);

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    // Try parsing timedelta string like "0 days 01:23:45.678000"
    const match = timeStr.match(/(\d+):(\d+):(\d+)/);
    if (match) return `${match[1]}:${match[2]}:${match[3].split('.')[0]}`;
    return timeStr;
  };

  if (schedLoading) {
    return (
      <div className="page-container">
        {showSchedSkeleton && (
          <SkeletonRegion>
            <SkeletonMasthead />
            <SkeletonTable rows={12} columns={5} />
          </SkeletonRegion>
        )}
      </div>
    );
  }

  const selectedRace = schedule?.races?.find((r: any) => r.round === selectedRound);

  return (
    // page-fill: the message log below sizes itself to the leftover height.
    <div className="page-container page-fill">
      <PageMasthead
        kicker={
          selectedRace
            ? `${t('analysisKicker')} · ${selectedRace.circuit?.locality ?? selectedRace.raceName}`
            : t('analysisKicker')
        }
        title={t('raceIncidents')}
        subtitle={
          incidentsData
            ? `Race control messages · ${t('totalCount', { n: incidents.length })}`
            : t('incidentsSubtitle')
        }
        aside={
          <div className="masthead-controls">
            <RoundSelector
              rounds={(schedule?.races ?? []).map((r: any) => ({ round: r.round, raceName: r.raceName, locality: r.circuit?.locality }))}
              value={selectedRound}
              onChange={setSelectedRound}
              placeholder={t('selectRace')}
            />
            {categories.length > 0 && (
              <div className="seg" role="group" aria-label={t('all')}>
                <button
                  type="button"
                  className={`seg-opt ${filterCategory === 'all' ? 'active' : ''}`}
                  aria-pressed={filterCategory === 'all'}
                  onClick={() => setFilterCategory('all')}
                >
                  {t('all')} {incidents.length}
                </button>
                {categories.map((c: string) => (
                  <button
                    key={c}
                    type="button"
                    className={`seg-opt ${filterCategory === c ? 'active' : ''}`}
                    aria-pressed={filterCategory === c}
                    onClick={() => setFilterCategory(c)}
                  >
                    {c} {incidents.filter((i: any) => i.category === c).length}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      {/* Content */}
      {incLoading && showIncSkeleton && (
        <SkeletonRegion label={t('incLoadingHint')}>
          <SkeletonTable rows={12} columns={5} />
        </SkeletonRegion>
      )}

      {/* The previously loaded race stays on screen underneath — a failed
          refresh does not make the last successful result untrue. */}
      {incError && (
        <ErrorBanner
          detail={incError}
          onRetry={incRefetch}
          attempts={incFailures}
          keepsData={!!incidentsData}
        />
      )}

      {incidentsData && !incLoading && (
        <>
          {/* Race info */}
          <div className="card" style={{ marginBottom: 24, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                {incidentsData.raceName}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 12 }}>
                {t('seasonRoundInline', { season: incidentsData.season, round: incidentsData.round })}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <span className="stat-badge" style={{ fontSize: 12 }}>
                {t('totalCount', { n: incidents.length })}
              </span>
              {/* Counted off the normalised type, not the raw Flag column: a
                  red flag has no Flag value, so counting that way reported 0
                  for a race that was actually suspended. */}
              <span className="stat-badge" style={{ fontSize: 12, background: incident.scBg, color: status.yellowFlag }}>
                {t('yellowCount', { n: incidents.filter((i: any) => i.eventType === 'yellowFlag').length })}
              </span>
              <span className="stat-badge" style={{ fontSize: 12, background: incident.redBg, color: status.redFlag }}>
                {t('redCount', { n: incidents.filter((i: any) => i.eventType === 'redFlag').length })}
              </span>
            </div>
          </div>

          {/* Lap density rail + table.

              The rail is one bar per lap across the table's own width, so its
              length is independent of how many rows the table has. Clicking a
              lap scrolls the table to it rather than filtering — filtering on a
              single click would hide the surrounding context people are reading
              the rail for. Shift+click is the explicit filter. */}
          {sortedLaps.length > 0 ? (
            <>
              <div className="density-head">
                <span className="k">{t('lapDensityLabel', { n: totalLaps })}</span>
                <span className="en">{t('lapDensityHint')}</span>
              </div>
              <div className="density-rail" role="group" aria-label={t('lapDensityLabel', { n: totalLaps })}>
                {lapAxis.map((lap) => {
                  const count = countByLap[lap] ?? 0;
                  return (
                    <button
                      key={lap}
                      type="button"
                      className={`density-bar ${lapFilter === lap ? 'is-filtered' : ''}`}
                      style={{
                        height: count === 0 ? 3 : Math.min(26, 5 + count * 4),
                        background:
                          count >= 3 ? 'var(--status-red-flag)'
                            : count > 0 ? 'var(--text-primary)'
                              : 'var(--border-subtle)',
                      }}
                      title={t('lapIncidentCount', { lap, n: count })}
                      aria-label={t('lapIncidentCount', { lap, n: count })}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          setLapFilter((f) => (f === lap ? null : lap));
                        } else {
                          setLapFilter(null);
                          document
                            .getElementById(`inc-lap-${lap}`)
                            ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                        }
                      }}
                    />
                  );
                })}
              </div>
              {lapFilter != null && (
                <div className="density-filter-note">
                  <span className="en">{t('lapFilterActive', { lap: lapFilter })}</span>
                  <button type="button" className="btn-secondary" onClick={() => setLapFilter(null)}>
                    {t('clearFilter')}
                  </button>
                </div>
              )}

              <div className="incidents-scroll" ref={tableScrollRef}>
                <table className="data-table incidents-table">
                  <thead>
                    {/* Message is the last column on purpose, which is a
                        deliberate departure from the canvas. The canvas draws
                        this table at 1052px, where a flexible message column is
                        ~570px; on a real 1400px+ screen it swells past 900px and
                        the short messages leave a gap between themselves and
                        whatever sits to their right. Putting the elastic column
                        last turns that surplus into a right margin instead. */}
                    <tr>
                      <th style={{ width: 64 }}>{UI_LABELS.lap}</th>
                      <th style={{ width: 90 }}>{t('thTime')}</th>
                      <th style={{ width: 104 }}>{t('thCategory')}</th>
                      <th style={{ width: 132 }}>{t('thFlag')}</th>
                      <th style={{ width: 110 }}>{t('thScope')}</th>
                      <th>{t('thMessage')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLaps.map((lap) =>
                      mergeBlueFlags(groupedByLap[lap]).map((inc: any, i: number) => {
                        const flagStyle = FLAG_STYLES[flagKeyOf(inc)] || null;
                        // Once blue flags are collapsed the per-message "TIMED AT"
                        // stamp no longer describes the row, so it is dropped.
                        const displayMessage = inc._count > 1
                          ? inc.message.replace(/\s*TIMED AT[\s\d:]+$/i, '')
                          : inc.message;
                        const drv = inc.driverNumber ? driversMap[inc.driverNumber] : null;
                        return (
                          <tr
                            key={`${lap}-${i}`}
                            id={i === 0 ? `inc-lap-${lap}` : undefined}
                            style={{ background: (countByLap[lap] ?? 0) >= 3 ? 'var(--row-neutralised)' : undefined }}
                          >
                            <td className="num">{lap === 0 ? 'PRE' : lap}</td>
                            <td className="en">{formatTime(inc.time)}</td>
                            <td className="en">{inc.category}</td>
                            <td>
                              {flagStyle && (
                                <span
                                  className="flag-badge"
                                  style={{ background: flagStyle.bg, color: flagStyle.color }}
                                >
                                  {t(flagStyle.labelKey)}
                                </span>
                              )}
                            </td>
                            {/* Most specific identifier first: a car, then the
                                sector number, then the bare scope word. The raw
                                scope is often just "Sector", which says less
                                than the number the message already carries. */}
                            <td className="en">
                              {drv?.code
                                ? `#${inc.driverNumber} ${drv.code}`
                                : inc.sector
                                  ? t('sectorN', { n: inc.sector })
                                  : inc.scope || '—'}
                            </td>
                            <td className="incident-message">
                              {displayMessage}
                              {inc._count > 1 && <span className="en"> ×{inc._count}</span>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* A clean race really does produce zero messages — say why, and
               offer the filter reset first when a filter caused it. */
            <StateBlock
              title={t('noIncidents')}
              reason={filterCategory === 'all' ? t('noIncidentsReason') : t('noIncidentsFiltered')}
              actions={
                filterCategory === 'all'
                  ? undefined
                  : [{ label: t('clearFilter'), onClick: () => setFilterCategory('all'), primary: true }]
              }
            />
          )}
        </>
      )}

      {!selectedRound && !incLoading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚩</div>
          <h3 style={{ fontSize: 18, marginBottom: 8, fontFamily: 'var(--font-display)' }}>{t('raceIncidents')}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {t('incidentsPrompt')}
          </p>
        </div>
      )}
    </div>
  );
}

export default RaceIncidents;
