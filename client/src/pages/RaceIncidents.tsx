import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getRaceIncidents } from '../services/api';
import { UI_LABELS } from '../constants/koreanTerms';
import { t, useT, type MessageKey } from '../i18n';

interface Props { year: number; }

const FLAG_STYLES: Record<string, { color: string; bg: string; icon: string; labelKey: MessageKey }> = {
  'GREEN': { color: '#000', bg: '#00C853', icon: '🟢', labelKey: 'flagGreen' },
  'YELLOW': { color: '#000', bg: '#FFD700', icon: '🟡', labelKey: 'flagYellow' },
  'DOUBLE YELLOW': { color: '#000', bg: '#FFA500', icon: '🟡🟡', labelKey: 'flagDoubleYellow' },
  'RED': { color: '#fff', bg: '#E10600', icon: '🔴', labelKey: 'flagRed' },
  'BLUE': { color: '#fff', bg: '#0055FF', icon: '🔵', labelKey: 'flagBlue' },
  'BLACK AND WHITE': { color: '#fff', bg: '#333', icon: '⚫⚪', labelKey: 'flagBlackWhite' },
  'CHEQUERED': { color: '#fff', bg: '#333', icon: '🏁', labelKey: 'flagChequered' },
  'CLEAR': { color: '#000', bg: '#00C853', icon: '🟢', labelKey: 'flagClear' },
};

const CATEGORY_ICONS: Record<string, string> = {
  'Flag': '🚩',
  'SafetyCar': '🚗',
  'Drs': '📡',
  'Other': '📋',
  'CarEvent': '🏎️',
};

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

  const { data: incidentsData, loading: incLoading, error: incError } = useApi(
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

  // Group by lap
  const groupedByLap: Record<number, any[]> = {};
  for (const inc of filtered) {
    const lap = inc.lap || 0;
    if (!groupedByLap[lap]) groupedByLap[lap] = [];
    groupedByLap[lap].push(inc);
  }
  const sortedLaps = Object.keys(groupedByLap).map(Number).sort((a, b) => a - b);

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
        <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{UI_LABELS.loading}</div></div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">🚩 {t('raceIncidents')}</h2>
        <p className="page-subtitle">{t('incidentsSubtitle')}</p>
      </div>

      {/* Race Selector */}
      <div className="selector-group fade-in fade-in-delay-1" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <select
          className="selector"
          value={selectedRound || ''}
          onChange={(e) => setSelectedRound(Number(e.target.value))}
        >
          <option value="" disabled>{t('selectRace')}</option>
          {schedule?.races?.map((r: any) => (
            <option key={r.round} value={r.round}>
              {t('roundNameOption', { n: r.round, name: r.raceName })}
            </option>
          ))}
        </select>

        {categories.length > 0 && (
          <select
            className="selector"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">{t('all')} ({incidents.length})</option>
            {categories.map((c: string) => (
              <option key={c} value={c}>
                {CATEGORY_ICONS[c] || '📋'} {c} ({incidents.filter((i: any) => i.category === c).length})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {incLoading && (
        <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{t('incLoadingHint')}</div></div>
      )}

      {incError && (
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{incError}</div>
        </div>
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
              <span className="stat-badge" style={{ fontSize: 12, background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>
                {t('yellowCount', { n: incidents.filter((i: any) => i.flag?.includes('YELLOW')).length })}
              </span>
              <span className="stat-badge" style={{ fontSize: 12, background: 'rgba(225,6,0,0.15)', color: '#E10600' }}>
                {t('redCount', { n: incidents.filter((i: any) => (i.flag || '').toUpperCase() === 'RED').length })}
              </span>
            </div>
          </div>

          {/* Timeline */}
          {sortedLaps.length > 0 ? (
            <div className="incidents-timeline">
              {sortedLaps.map(lap => (
                <div key={lap} style={{ marginBottom: 20 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                    position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 2, padding: '4px 0',
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 60, height: 24, borderRadius: 12,
                      background: 'rgba(255,255,255,0.08)',
                      fontSize: 11, fontWeight: 700,
                      fontFamily: 'var(--font-display)',
                      color: 'var(--text-secondary)',
                    }}>
                      {lap === 0 ? 'PRE' : `LAP ${lap}`}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  </div>

                  {mergeBlueFlags(groupedByLap[lap]).map((inc: any, i: number) => {
                    const flagStyle = FLAG_STYLES[inc.flag?.toUpperCase()] || null;
                    // For merged blue flags the per-message "TIMED AT ..." stamp is
                    // meaningless once collapsed, so drop it from the display text.
                    const displayMessage = inc._count > 1
                      ? inc.message.replace(/\s*TIMED AT[\s\d:]+$/i, '')
                      : inc.message;
                    return (
                      <div
                        key={i}
                        className="card"
                        style={{
                          marginBottom: 6,
                          padding: '12px 16px',
                          borderLeft: flagStyle ? `3px solid ${flagStyle.bg}` : '3px solid rgba(255,255,255,0.1)',
                          transition: 'transform 0.1s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>
                            {CATEGORY_ICONS[inc.category] || '📋'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                              {displayMessage}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                              {inc.category && (
                                <span style={{
                                  fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                                  fontWeight: 600,
                                }}>
                                  {inc.category}
                                </span>
                              )}
                              {flagStyle && (
                                <span style={{
                                  fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                  background: flagStyle.bg, color: flagStyle.color,
                                  fontWeight: 600,
                                }}>
                                  {flagStyle.icon} {t(flagStyle.labelKey)}
                                </span>
                              )}
                              {inc._count > 1 && (
                                <span style={{
                                  fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                  background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)',
                                  fontWeight: 700,
                                }}>
                                  ×{inc._count}
                                </span>
                              )}
                              {inc.scope && (
                                <span style={{
                                  fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                                  fontWeight: 600,
                                }}>
                                  {inc.scope}
                                </span>
                              )}
                              {inc.sector && (
                                <span style={{
                                  fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                                  fontWeight: 600,
                                }}>
                                  {t('sectorN', { n: inc.sector })}
                                </span>
                              )}
                              {inc.driverNumber && (() => {
                                const drv = driversMap[inc.driverNumber];
                                const label = drv?.code
                                  ? `#${inc.driverNumber} ${drv.code}`
                                  : `#${inc.driverNumber}`;
                                return (
                                  <span
                                    title={drv?.name || undefined}
                                    style={{
                                      fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                      background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {label}
                                  </span>
                                );
                              })()}
                              {inc.time && (
                                <span style={{
                                  fontSize: 10, color: 'var(--text-muted)',
                                  alignSelf: 'center',
                                }}>
                                  {formatTime(inc.time)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: 48, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('noIncidents')}</p>
            </div>
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
