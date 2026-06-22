import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getRaceIncidents } from '../services/api';
import { getDriverNameKR, getCountryNameKR } from '../constants/koreanTerms';

interface Props { year: number; }

const FLAG_STYLES: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  'GREEN': { color: '#000', bg: '#00C853', icon: '🟢', label: '그린 플래그' },
  'YELLOW': { color: '#000', bg: '#FFD700', icon: '🟡', label: '옐로 플래그' },
  'DOUBLE YELLOW': { color: '#000', bg: '#FFA500', icon: '🟡🟡', label: '더블 옐로' },
  'RED': { color: '#fff', bg: '#E10600', icon: '🔴', label: '레드 플래그' },
  'BLUE': { color: '#fff', bg: '#0055FF', icon: '🔵', label: '블루 플래그' },
  'BLACK AND WHITE': { color: '#fff', bg: '#333', icon: '⚫⚪', label: '흑백 플래그' },
  'CHEQUERED': { color: '#fff', bg: '#333', icon: '🏁', label: '체커드 플래그' },
  'CLEAR': { color: '#000', bg: '#00C853', icon: '🟢', label: '클리어' },
};

const CATEGORY_ICONS: Record<string, string> = {
  'Flag': '🚩',
  'SafetyCar': '🚗',
  'Drs': '📡',
  'Other': '📋',
  'CarEvent': '🏎️',
};

function RaceIncidents({ year }: Props) {
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
        <div className="loading-spinner">
          <div className="spinner-ring" />
          <p>데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>🚩 레이스 인시던트</h2>
        <p className="page-subtitle">레이스 컨트롤 메시지 및 인시던트 기록</p>
      </div>

      {/* Race Selector */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="selector-label">레이스 선택</label>
          <select
            className="season-select"
            value={selectedRound || ''}
            onChange={(e) => setSelectedRound(Number(e.target.value))}
            style={{ width: '100%' }}
          >
            <option value="">레이스를 선택하세요</option>
            {schedule?.races?.map((r: any) => (
              <option key={r.round} value={r.round}>
                R{r.round} - {r.raceName}
              </option>
            ))}
          </select>
        </div>

        {categories.length > 0 && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="selector-label">카테고리 필터</label>
            <select
              className="season-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="all">전체 ({incidents.length})</option>
              {categories.map((c: string) => (
                <option key={c} value={c}>
                  {CATEGORY_ICONS[c] || '📋'} {c} ({incidents.filter((i: any) => i.category === c).length})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Content */}
      {incLoading && (
        <div className="loading-spinner">
          <div className="spinner-ring" />
          <p>인시던트 데이터 로딩 중...</p>
        </div>
      )}

      {incError && (
        <div className="card" style={{ borderColor: 'var(--accent-red)', padding: 24 }}>
          <p style={{ color: 'var(--accent-red)' }}>⚠️ {incError}</p>
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
                시즌 {incidentsData.season} • 라운드 {incidentsData.round}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <span className="stat-badge" style={{ fontSize: 12 }}>
                📋 총 {incidents.length}건
              </span>
              <span className="stat-badge" style={{ fontSize: 12, background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>
                🟡 옐로 {incidents.filter((i: any) => i.flag?.includes('YELLOW')).length}
              </span>
              <span className="stat-badge" style={{ fontSize: 12, background: 'rgba(225,6,0,0.15)', color: '#E10600' }}>
                🔴 레드 {incidents.filter((i: any) => i.flag?.includes('RED')).length}
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

                  {groupedByLap[lap].map((inc: any, i: number) => {
                    const flagStyle = FLAG_STYLES[inc.flag?.toUpperCase()] || null;
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
                              {inc.message}
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
                                  {flagStyle.icon} {flagStyle.label}
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
                                  섹터 {inc.sector}
                                </span>
                              )}
                              {inc.driverNumber && (
                                <span style={{
                                  fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                  background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)',
                                  fontWeight: 700,
                                }}>
                                  #{inc.driverNumber}
                                </span>
                              )}
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
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>인시던트 데이터가 없습니다.</p>
            </div>
          )}
        </>
      )}

      {!selectedRound && !incLoading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚩</div>
          <h3 style={{ fontSize: 18, marginBottom: 8, fontFamily: 'var(--font-display)' }}>레이스 인시던트</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            레이스를 선택하면 레이스 컨트롤 메시지와 인시던트를 확인할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}

export default RaceIncidents;
