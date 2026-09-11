import { useState, useEffect, useRef, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getRaceTimeline, getSprintTimeline } from '../services/api';
import { getTeamNameKR, getDriverNameKR, UI_LABELS, getCountryNameKR, getStatusKR } from '../constants/koreanTerms';
import { getRaceDateTime } from '../utils/raceDate';
import useIsMobile from '../hooks/useIsMobile';
import { t, useT, type MessageKey } from '../i18n';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, LabelList } from 'recharts';

function renderCustomLabel(props: any, text: string, isEnd: boolean, endIndex: number, isDimmed: boolean) {
  const { x, y, index, value } = props;
  // End label sits at the driver's own last plotted lap (so lapped finishers get
  // labelled at their finishing position, not only the lead-lap cars).
  if (isEnd && index !== endIndex) return null;
  if (!isEnd && index !== 0) return null;
  if (value == null || x == null || y == null) return null;

  return (
    <text
      x={x} y={y}
      dx={isEnd ? 8 : -8}
      dy={4}
      fill={isDimmed ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.7)"}
      fontSize={10}
      fontWeight={800}
      textAnchor={isEnd ? "start" : "end"}
      fontFamily="var(--font-display)"
      style={{ pointerEvents: 'none' }}
    >
      {text}
    </text>
  );
}

const TIRE_COLORS: Record<string, string> = {
  'SOFT': '#E10600',
  'MEDIUM': '#FFD700',
  'HARD': '#FFFFFF',
  'INTERMEDIATE': '#00C853',
  'WET': '#0091FF',
};

interface Props { year: number; }

const EVENT_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
  pit: { color: '#fff', bg: '#555', icon: '🛞' },
  yellowFlag: { color: '#000', bg: '#FFD700', icon: '🟡' },
  redFlag: { color: '#fff', bg: '#E10600', icon: '🔴' },
  safetyCar: { color: '#000', bg: '#FF8C00', icon: '🚗' },
  vsc: { color: '#000', bg: '#FFA500', icon: '🟠' },
  green: { color: '#fff', bg: '#00C853', icon: '🟢' },
  chequered: { color: '#fff', bg: '#333', icon: '🏁' },
};

// Localized label for a race-control event type.
const EVT_LABEL_KEY: Record<string, MessageKey> = {
  pit: 'evtPit',
  yellowFlag: 'evtYellow',
  redFlag: 'evtRed',
  safetyCar: 'evtSafetyCar',
  vsc: 'evtVsc',
  green: 'evtGreen',
  chequered: 'evtChequered',
};
const evtLabel = (type: string) => t(EVT_LABEL_KEY[type] ?? 'evtPit');

// Marks where a retired driver's line ends (their last completed lap) with a
// red "DNF" badge. The retirement reason is shown in the tooltip for that lap.
function renderDnfMarker(props: any, lastIndex: number, isDimmed: boolean) {
  const { x, y, index } = props;
  if (index !== lastIndex || x == null || y == null) return null;
  const opacity = isDimmed ? 0.2 : 1;
  return (
    <g style={{ pointerEvents: 'none', opacity }}>
      <circle cx={x} cy={y} r={4} fill="#E10600" stroke="#0a0a0f" strokeWidth={1.5} />
      <text
        x={x + 8} y={y} dy={3.5}
        textAnchor="start"
        fill="#ff6a5d"
        fontSize={9}
        fontWeight={800}
        fontFamily="var(--font-display)"
      >
        DNF
      </text>
    </g>
  );
}

function renderTireMarker(props: any, driverKey: string, getTireCompound: any, timelineData: any[], selectedDrivers: Set<string>) {
  const { x, y, index } = props;
  if (index === undefined || !timelineData[index]) return null;

  // Filter: If there are selected drivers, only show markers for them
  if (selectedDrivers.size > 0 && !selectedDrivers.has(driverKey)) return null;

  const lap = timelineData[index].lap;
  const driverNum = parseInt(driverKey.replace('d', ''));
  const compound = getTireCompound(driverNum, lap, true);

  if (!compound) return null;

  const color = TIRE_COLORS[compound] || '#888';
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={x} cy={y} r={7.5} fill={color} stroke="#0a0a0f" strokeWidth={2} />
      <text
        x={x} y={y}
        dy={3.5}
        textAnchor="middle"
        fill="#000"
        fontSize={10}
        fontWeight={900}
        fontFamily="var(--font-display)"
      >
        {compound.charAt(0)}
      </text>
    </g>
  );
}

function TimelineTooltip({ active, payload, label, driverInfoMap, selectedDrivers, dnfByLap }: any) {
  if (!active || !payload?.length) return null;
  const lapData = payload[0]?.payload;
  const events = lapData?._events || [];
  const drivers: Record<string, any> = driverInfoMap || {};

  const sorted = [...payload]
    .filter((p: any) => p.value != null)
    .sort((a: any, b: any) => a.value - b.value);

  // Filter: Top 3 + Selected Drivers
  const displayEntries = sorted.filter((entry: any, idx: number) => {
    if (idx < 3) return true;
    if (selectedDrivers?.has(entry.dataKey)) return true;
    return false;
  });

  // Flag events (yellow/SC/VSC/…): dedupe by type — few per lap, keep as chips
  const flagEvents = events.reduce((acc: any[], ev: any) => {
    if (ev.type !== 'pit' && !acc.some((existing: any) => existing.type === ev.type)) {
      acc.push(ev);
    }
    return acc;
  }, []);

  // Pit events can be many on the same lap, so group them compactly. Put any
  // chart-selected drivers first (highlighted), then order by fastest stop.
  const pitEvents = events.filter((ev: any) => ev.type === 'pit');
  const isSelectedPit = (ev: any) => !!selectedDrivers?.has(`d${ev.driverNumber}`);
  const sortedPits = [...pitEvents].sort((a: any, b: any) => {
    const selDiff = (isSelectedPit(b) ? 1 : 0) - (isSelectedPit(a) ? 1 : 0);
    if (selDiff !== 0) return selDiff;
    return (a.duration || 999) - (b.duration || 999);
  });
  const hasSelection = !!(selectedDrivers && selectedDrivers.size > 0);
  // When drivers are selected, focus on their stops; otherwise show all.
  const shownPits = hasSelection ? sortedPits.filter(isSelectedPit) : sortedPits;
  const hiddenPitCount = pitEvents.length - shownPits.length;

  // Safety car / VSC chips read "시작" on the deploy lap and "종료" on the ending lap.
  const flagLabel = (ev: any) => {
    if (ev.type === 'safetyCar' || ev.type === 'vsc') {
      const m = (ev.msg || '').toUpperCase();
      const base = ev.type === 'vsc' ? t('scVirtual') : t('scNormal');
      if (m.includes('DEPLOYED')) return t('scStart', { base });
      if (m.includes('IN THIS LAP') || m.includes('ENDING')) return t('scEnd', { base });
    }
    return evtLabel(ev.type);
  };

  return (
    <div style={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '12px 16px', maxHeight: 400, overflowY: 'auto', fontSize: 12, minWidth: 200 }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: '#f0f0f5' }}>{t('lapN', { n: label })}</div>
      {flagEvents.length > 0 && (
        <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {flagEvents.map((ev: any, i: number) => {
            const style = EVENT_STYLES[ev.type] || EVENT_STYLES.pit;
            return (
              <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: style.bg, color: style.color, marginRight: 4, marginBottom: 4 }}>
                {style.icon} {flagLabel(ev)}
              </div>
            );
          })}
        </div>
      )}
      {dnfByLap?.[label]?.length > 0 && (
        <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ff6a5d', marginBottom: 6 }}>{t('ttRetiredDnf')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {dnfByLap[label].map((r: any, i: number) => (
              <span key={i} style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap',
                background: 'rgba(225,6,0,0.18)', color: '#ff9b91', border: '1px solid rgba(225,6,0,0.4)',
              }}>
                {r.code} (#{r.driverNumber}){r.statusKR ? ` · ${r.statusKR}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      {pitEvents.length > 0 && (
        <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c9c9d4', marginBottom: 6 }}>
            {t('ttPitCount', { n: pitEvents.length })}
          </div>
          {shownPits.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, auto)', gap: 4, justifyContent: 'start' }}>
              {shownPits.map((ev: any, i: number) => {
                const selected = isSelectedPit(ev);
                return (
                  <span key={i} style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap', textAlign: 'center',
                    background: selected ? '#6b6b78' : 'rgba(255,255,255,0.07)',
                    color: selected ? '#fff' : '#b8b8c4',
                    border: `1px solid ${selected ? 'rgba(255,255,255,0.35)' : 'transparent'}`,
                  }}>
                    {ev.driver}{ev.duration ? ` ${ev.duration.toFixed(1)}s` : ''}
                  </span>
                );
              })}
            </div>
          )}
          {hasSelection && shownPits.length > 0 && hiddenPitCount > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
              {t('ttMorePit', { n: hiddenPitCount })}
            </div>
          )}
        </div>
      )}
      {displayEntries.map((entry: any) => {
        const info = drivers[entry.dataKey];
        return (
          <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', opacity: selectedDrivers?.has(entry.dataKey) ? 1 : 0.8 }}>
            <span style={{ width: 22, textAlign: 'right', fontWeight: 700, fontSize: 11, color: entry.value <= 3 ? '#FFD700' : '#9494a8' }}>P{entry.value}</span>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: info?.color || '#888',
              flexShrink: 0,
              border: info?.dashed ? '1px dashed rgba(255,255,255,0.8)' : 'none',
              boxShadow: info?.dashed ? '0 0 0 1px rgba(0,0,0,0.5)' : 'none'
            }} />
            <span style={{ fontWeight: 600, color: '#f0f0f5', flex: 1 }}>{info?.code ? `${info.code}(#${info.name})` : `#${info?.name || entry.dataKey}`}</span>
          </div>
        );
      })}
      {sorted.length > displayEntries.length && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
          {t('ttMoreDrivers', { n: sorted.length - displayEntries.length })}
        </div>
      )}
    </div>
  );
}

// ===================================
// POSITION-STREAM RACE REPLAY
// ===================================
function RaceReplay({ data, getTireCompound }: { data: any, getTireCompound: any }) {
  const isMobile = useIsMobile();
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [simTime, setSimTime] = useState(0); // ms offset from effective race start
  const animRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const { positionStream, pitStream, rcStream, lapStream, drivers, raceStartTime, raceEndTime, totalLaps } = data;

  // Compute the last completed lap for each driver to determine retired status
  const maxLapsPerDriver = useMemo(() => {
    const maxLaps: Record<number, number> = {};
    if (!data?.timeline) return maxLaps;
    for (const lapData of data.timeline) {
      const lapNum = lapData.lap;
      for (const key of Object.keys(lapData)) {
        if (key.startsWith('d') && key !== '_drivers' && key !== '_events') {
          const dn = parseInt(key.replace('d', ''));
          if (!isNaN(dn)) {
            maxLaps[dn] = Math.max(maxLaps[dn] || 0, lapNum);
          }
        }
      }
    }
    return maxLaps;
  }, [data]);

  // Find effective race start: prefer interpolated Lap 1 start from lapStream
  const effectiveStart = useMemo(() => {
    if (lapStream && lapStream.length > 0) return lapStream[0].t;

    const green = rcStream?.find((rc: any) => rc.type === 'green');
    if (green) return green.t;

    return raceStartTime;
  }, [rcStream, lapStream, raceStartTime]);

  const effectiveEnd = raceEndTime;
  const totalDuration = effectiveEnd - effectiveStart;

  // Debug log
  useEffect(() => {
    console.log('[RaceReplay] Initialization:', {
      effectiveStart: new Date(effectiveStart).toLocaleTimeString(),
      effectiveEnd: new Date(effectiveEnd).toLocaleTimeString(),
      totalDurationMin: Math.floor(totalDuration / 60000),
      posCount: positionStream?.length,
      lapCount: lapStream?.length,
      rcCount: rcStream?.length
    });
  }, [effectiveStart, effectiveEnd, totalDuration, positionStream, lapStream, rcStream]);

  // Driver info map
  const driverMap = useMemo(() => {
    const map: Record<number, any> = {};
    for (const d of drivers) map[d.driverNumber] = d;
    return map;
  }, [drivers]);

  // Precompute: for each position event index, store the running state
  // This avoids scanning from the beginning every frame
  const positionSnapshots = useMemo(() => {
    if (!positionStream || positionStream.length === 0) return [];
    // Build an array of { t, positions } snapshots at each position change
    const snapshots: { t: number; positions: Record<number, number> }[] = [];
    const current: Record<number, number> = {};

    for (const p of positionStream) {
      current[p.dn] = p.pos;
      snapshots.push({ t: p.t, positions: { ...current } });
    }
    return snapshots;
  }, [positionStream]);

  // Get positions at a given absolute time using binary search
  const getPositionsAt = (absTime: number): Record<number, number> => {
    if (positionSnapshots.length === 0) return {};
    // Binary search for the latest snapshot at or before absTime
    let lo = 0, hi = positionSnapshots.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (positionSnapshots[mid].t <= absTime) lo = mid;
      else hi = mid - 1;
    }
    return positionSnapshots[lo].t <= absTime ? positionSnapshots[lo].positions : {};
  };

  // Get current lap and active flag
  const getRaceState = (absTime: number) => {
    let lap = 1;
    let flag: any = null;
    let raceFinished = false;

    // Use lapStream if available (more reliable than rcStream for laps)
    if (lapStream && lapStream.length > 0) {
      for (const l of lapStream) {
        if (l.t > absTime) break;
        lap = l.lap;
      }
    }

    if (rcStream) {
      for (const rc of rcStream) {
        if (rc.t > absTime) break;
        // Ignore flags that occur BEFORE the effective start (pre-race noise)
        if (rc.t < effectiveStart) continue;

        if (rc.type === 'chequered') raceFinished = true;

        // Track flag state
        if (['redFlag', 'safetyCar', 'vsc', 'yellowFlag'].includes(rc.type)) {
          // Only accept new flags if race is NOT finished
          if (!raceFinished) flag = rc;
        } else if (rc.type === 'green' || rc.type === 'chequered') {
          flag = null; // green or chequered clears flags
        }
      }
    }

    return { lap, flag };
  };

  // Get active pit stops near the current time
  const getActivePits = (absTime: number) => {
    if (!pitStream) return [];
    return pitStream.filter((p: any) => absTime >= p.t && absTime - p.t < 25000);
  };

  // Calculate previous positions (1 second ago in sim time) for delta arrows
  const getPrevPositions = (absTime: number): Record<number, number> => {
    const prevTime = absTime - 5000; // 5 seconds ago in real time
    return getPositionsAt(prevTime);
  };

  // Animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    console.log('[RaceReplay] Starting animation at simTime:', simTime);

    const animate = (timestamp: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const delta = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;

      setSimTime((prev) => {
        const next = prev + delta * speed;
        if (next >= totalDuration) {
          console.log('[RaceReplay] Reached end of race');
          setIsPlaying(false);
          return totalDuration;
        }
        return next;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    lastFrameRef.current = 0;
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, speed, totalDuration]);

  // Current absolute time
  const absTime = useMemo(() => {
    const t = effectiveStart + simTime;
    return isNaN(t) ? effectiveStart : t;
  }, [effectiveStart, simTime]);

  // Debug periodically
  useEffect(() => {
    if (isPlaying && !isNaN(absTime)) {
      const state = getRaceState(absTime);
      console.log(`[RaceReplay] Progress: Lap ${state.lap}, AbsTime: ${new Date(absTime).toLocaleTimeString()}, simTime: ${Math.floor(simTime / 1000)}s`);
    }
  }, [Math.floor(simTime / 2000), isPlaying, absTime]);


  const positions = getPositionsAt(absTime);
  const prevPositions = getPrevPositions(absTime);
  const { lap: currentLap, flag: activeFlag } = getRaceState(absTime);
  const activePits = getActivePits(absTime);
  const pitDriverNumbers = new Set(activePits.map((p: any) => p.dn));

  const progress = totalDuration > 0 ? (simTime / totalDuration) * 100 : 0;
  const simMin = Math.floor(simTime / 60000);
  const simSec = Math.floor((simTime % 60000) / 1000);

  // Sort drivers by position (active first, retired/DNS at the bottom)
  const sortedDrivers = Object.entries(positions)
    .map(([dn, pos]) => {
      const driverNumber = Number(dn);
      const info = driverMap[driverNumber];
      const maxLap = maxLapsPerDriver[driverNumber] || 0;
      // Retired = an actual DNF (from official status) that has already dropped out
      // by the current replay lap. A lapped finisher (dnf=false) is NOT retired even
      // once the leader laps past it — it keeps circulating to the flag.
      const isRetired = !!info?.dnf && maxLap < totalLaps && currentLap > maxLap;
      const isDNS = maxLap === 0 && currentLap >= 1;
      // Once out, show the official final classification position (stable), not the
      // now-stale on-track position.
      const finishPosition = info?.finishPosition;

      return {
        driverNumber,
        position: pos,
        info,
        prevPosition: prevPositions[driverNumber] || pos,
        isRetired,
        isDNS,
        finishPosition,
      };
    })
    .filter(d => d.info)
    .sort((a, b) => {
      const aRet = a.isRetired || a.isDNS;
      const bRet = b.isRetired || b.isDNS;

      if (aRet && !bRet) return 1;
      if (!aRet && bRet) return -1;
      if (aRet && bRet) {
        // Retired/DNS sit at the bottom ordered by official final classification.
        const aFin = a.finishPosition ?? 999;
        const bFin = b.finishPosition ?? 999;
        if (aFin !== bFin) return aFin - bFin;
        return a.position - b.position;
      }
      return a.position - b.position;
    });

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px 14px' : '16px 24px',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: isMobile ? 10 : 0,
        background: activeFlag ? `${EVENT_STYLES[activeFlag.type]?.bg}15` : 'transparent',
        borderBottom: `2px solid ${activeFlag ? EVENT_STYLES[activeFlag.type]?.bg : 'var(--border-color)'}`,
        transition: 'all 0.3s ease',
      }}>
        <div>
          <div className="card-title" style={{ margin: 0 }}>
            🏎️ {t('raceReplay')}
            {activeFlag && (
              <span style={{
                marginLeft: 12, padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                background: EVENT_STYLES[activeFlag.type]?.bg, color: EVENT_STYLES[activeFlag.type]?.color,
              }}>
                {EVENT_STYLES[activeFlag.type]?.icon} {evtLabel(activeFlag.type)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-display)' }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{t('lapN', { n: currentLap })}</span>
            <span style={{ margin: '0 10px', opacity: 0.3 }}>|</span>
            {t('raceElapsed')} {simMin}:{simSec.toString().padStart(2, '0')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: isMobile ? 'space-between' : 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { label: '30x', value: 30 },
              { label: '60x', value: 60 },
              { label: '120x', value: 120 },
              { label: '240x', value: 240 },
              { label: '480x', value: 480 },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setSpeed(opt.value)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
                  background: speed === opt.value ? 'var(--f1-red)' : 'rgba(255,255,255,0.08)',
                  color: speed === opt.value ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (simTime >= totalDuration) setSimTime(0);
              setIsPlaying(!isPlaying);
            }}
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none',
              background: isPlaying ? 'var(--f1-red)' : 'var(--accent-green)',
              color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, transition: 'all 0.2s ease',
              boxShadow: `0 0 20px ${isPlaying ? 'rgba(225,6,0,0.3)' : 'rgba(0,200,83,0.3)'}`,
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{ height: 5, background: 'rgba(255,255,255,0.05)', cursor: 'pointer' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          setSimTime(pct * totalDuration);
        }}
      >
        <div style={{
          height: '100%', width: `${progress}%`,
          background: activeFlag ? EVENT_STYLES[activeFlag.type]?.bg : 'linear-gradient(90deg, var(--accent-green), var(--f1-red))',
          transition: isPlaying ? 'none' : 'width 0.3s ease',
        }} />
      </div>

      {/* Pit stop banner (always rendered to maintain layout stability) */}
      <div style={{
        padding: isMobile ? '6px 14px' : '6px 24px', background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        minHeight: 37,
        boxSizing: 'border-box',
      }}>
        {activePits.length > 0 ? (
          <>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>🛞 PIT:</span>
            {activePits.map((pit: any, i: number) => (
              <span key={i} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#555', color: '#fff',
              }}>
                {driverMap[pit.dn]?.nameAcronym || `#${pit.dn}`} {pit.dur ? `(${pit.dur.toFixed(1)}s)` : ''}
              </span>
            ))}
          </>
        ) : (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', fontWeight: 500 }}>{t('noPitCars')}</span>
        )}
      </div>

      {/* Leaderboard */}
      <div style={{ padding: '8px 0' }}>
        {sortedDrivers.map((driver) => {
          const color = driver.info?.teamColour ? `#${driver.info.teamColour}` : '#888';
          const isPitting = pitDriverNumbers.has(driver.driverNumber);
          const krName = getDriverNameKR(driver.info?.driverId || '', driver.info?.fullName || '');
          const krTeam = getTeamNameKR(driver.info?.teamName || '');
          const posDelta = driver.prevPosition - driver.position;
          const isRetiredOrDNS = driver.isRetired || driver.isDNS;

          return (
            <div
              key={driver.driverNumber}
              style={{
                display: 'flex', alignItems: 'center',
                padding: isMobile ? '7px 14px' : '7px 24px',
                background: !isRetiredOrDNS && driver.position <= 3 ? `linear-gradient(90deg, ${color}18, transparent 60%)` : 'transparent',
                borderLeft: `3px solid ${color}`,
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                opacity: isRetiredOrDNS ? 0.35 : (isPitting ? 0.55 : 1),
              }}
            >
              <div style={{
                width: 30, fontWeight: 800, fontSize: isRetiredOrDNS ? 11 : 17, fontFamily: 'var(--font-display)',
                color: isRetiredOrDNS ? 'var(--text-muted)' : (driver.position === 1 ? '#FFD700' : driver.position === 2 ? '#C0C0C0' : driver.position === 3 ? '#CD7F32' : 'var(--text-secondary)'),
                textAlign: 'center',
              }}>
                {driver.isDNS ? 'DNS' : (driver.isRetired ? (driver.finishPosition ?? driver.position) : driver.position)}
              </div>
              <div style={{ width: 28, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                {isRetiredOrDNS ? (
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>–</span>
                ) : posDelta > 0 ? (
                  <span style={{ color: '#00C853' }}>▲{posDelta}</span>
                ) : posDelta < 0 ? (
                  <span style={{ color: '#E10600' }}>▼{Math.abs(posDelta)}</span>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>–</span>
                )}
              </div>
              <div style={{ width: 4, height: 26, background: color, borderRadius: 2, margin: '0 10px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {driver.info?.nameAcronym || '???'}
                  {!isRetiredOrDNS && (() => {
                    const compound = getTireCompound(driver.driverNumber, currentLap);
                    if (!compound) return null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: TIRE_COLORS[compound] || '#888' }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>{compound.charAt(0)}</span>
                      </div>
                    );
                  })()}
                  <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {krName !== driver.info?.fullName ? krName : driver.info?.fullName}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {krTeam || driver.info?.teamName}
                </div>
              </div>
              {isPitting && !isRetiredOrDNS && (
                <div style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#555', color: '#fff' }}>
                  🛞 PIT
                </div>
              )}
              <div style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 600, color, fontFamily: 'var(--font-display)' }}>
                #{driver.driverNumber}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Team Colors Optimization
const TEAM_COLORS_OVERRIDE: Record<string, string> = {
  'Red Bull Racing': '#4781D7',
  'Red Bull': '#4781D7',
  'Mercedes': '#00D7B6',
  'Ferrari': '#ED1131',
  'McLaren': '#F47600',
  'Aston Martin': '#229971',
  'Alpine': '#00A1E8',
  'Williams': '#1868DB',
  'RB': '#6C98FF',
  'Racing Bulls': '#6C98FF',
  'Visa Cash App RB': '#6C98FF',
  'Kick Sauber': '#F50537',
  'Stake F1 Team': '#F50537',
  'Audi': '#F50537',
  'Haas F1 Team': '#9C9FA2',
  'Haas': '#9C9FA2',
  'Cadillac': '#909090',
};

function getTeamColor(teamName: string, defaultColor: string) {
  if (!teamName) return `#${defaultColor}` || '#888';
  for (const [key, color] of Object.entries(TEAM_COLORS_OVERRIDE)) {
    if (teamName.includes(key)) return color;
  }
  return defaultColor ? `#${defaultColor}` : '#888';
}

// ===================================
// MAIN PAGE
// ===================================
type SessionType = 'race' | 'sprint' | '';

export default function RaceTimeline({ year }: Props) {
  useT(); // re-render this subtree when the language changes
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>('');
  const [isChartOpen, setIsChartOpen] = useState(true);
  const [isReplayOpen, setIsReplayOpen] = useState(true);
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());

  const { data: scheduleData } = useApi(() => getSeasonSchedule(year), [year]);
  const timeline = useApi(
    (signal) => (selectedRound && sessionType
      ? (sessionType === 'sprint' ? getSprintTimeline(year, selectedRound, signal) : getRaceTimeline(year, selectedRound, signal))
      : Promise.resolve(null)),
    [year, selectedRound, sessionType]
  );

  // First page entry auto-selects the most recent round (below); switching the
  // season afterwards resets to round 1 with no session type picked. Compare
  // against the previous year (not a "first load" flag) so StrictMode's
  // double-invoked mount effect doesn't misfire a reset.
  const prevYearRef = useRef(year);
  useEffect(() => {
    if (prevYearRef.current !== year) {
      prevYearRef.current = year;
      setSelectedRound(1);
      setSessionType('');
    }
  }, [year]);

  const toggleDriver = (driverKey: string) => {
    const next = new Set(selectedDrivers);
    if (next.has(driverKey)) next.delete(driverKey);
    else next.add(driverKey);
    setSelectedDrivers(next);
  };

  const getTireCompound = (driverNumber: number, lap: number, onlyAtChange: boolean = false) => {
    if (!timeline.data?.stints) return null;
    const driverStints = timeline.data.stints[driverNumber] || (timeline.data.stints as any)[String(driverNumber)];
    if (!driverStints || driverStints.length === 0) return null;

    if (onlyAtChange) {
      if (lap === 0) {
        // Always show the very first stint (starting tire) at Lap 0
        const firstStint = driverStints.find((s: any) => s.stintNumber === 1 || s.lapStart <= 1);
        return firstStint?.compound || null;
      }

      // Mark the new compound on the pit-in lap (where the change happened),
      // i.e. the lap right before the new stint's first (out-)lap. A stint that
      // starts on lap N was fitted during the pit stop on lap N-1.
      const nextStint = driverStints.find((s: any) => s.lapStart === lap + 1);
      return nextStint?.compound || null;
    }

    // Standard lookup for non-marker use (current tire on a given lap)
    const currentStint = driverStints.find((s: any) => lap >= s.lapStart && lap <= s.lapEnd);
    return currentStint?.compound || null;
  };

  const races = scheduleData?.races || [];
  const selectedRace = races.find((r: any) => r.round === selectedRound);
  const hasSprint = !!selectedRace?.sprint;

  // A round is selectable once its first session has started (the sprint on a
  // sprint weekend, otherwise the race). The race session itself stays disabled
  // until the race has started, so a completed sprint can still be viewed.
  const now = new Date();
  const isRoundStarted = (r: any) => (r?.sprint?.date ? getRaceDateTime(r.sprint) : getRaceDateTime(r)) <= now;
  const isRaceStarted = (r: any) => !!r && getRaceDateTime(r) <= now;
  const hasTimeline = !!(timeline.data && Array.isArray(timeline.data.timeline) && timeline.data.timeline.length > 0);

  // Auto-select the most recent round that has run (session still needs picking).
  if (!selectedRound && races.length > 0) {
    const started = races.filter((r: any) => getRaceDateTime(r) < now);
    if (started.length > 0) {
      const lastRound = started[started.length - 1].round;
      setTimeout(() => setSelectedRound(lastRound), 0);
    }
  }

  const handleRoundChange = (round: number) => {
    setSelectedRound(round);
    // Changing the round always requires picking the race type again.
    setSessionType('');
  };

  const driverKeys: { key: string; color: string; name: string; code: string; fullName: string; driverId: string; driverNumber: number; dashed?: boolean; dnf?: boolean; statusKR?: string; finishPosition?: number }[] = [];
  if (timeline.data?.drivers && timeline.data?.timeline?.length > 0) {
    const keysWithData = new Set<string>();
    for (const lapData of timeline.data.timeline) {
      for (const k of Object.keys(lapData)) {
        if (k.startsWith('d') && k !== '_drivers' && k !== '_events') keysWithData.add(k);
      }
    }
    const seenTeams = new Map<string, number>();
    for (const driver of timeline.data.drivers) {
      const key = `d${driver.driverNumber}`;
      if (keysWithData.has(key)) {
        const teamName = driver.teamName || 'Unknown';
        const count = seenTeams.get(teamName) || 0;
        seenTeams.set(teamName, count + 1);

        driverKeys.push({
          key,
          color: getTeamColor(teamName, driver.teamColour),
          name: `${driver.driverNumber}`,
          code: driver.nameAcronym || driver.broadcastName || `${driver.driverNumber}`,
          fullName: driver.fullName,
          driverId: driver.driverId || '',
          driverNumber: driver.driverNumber,
          dashed: count > 0,
          dnf: !!driver.dnf,
          statusKR: driver.dnf ? getStatusKR(driver.status || '') : '',
          finishPosition: driver.finishPosition
        });
      }
    }
    // Sort by Grid Position (Lap 0)
    const firstLap = timeline.data.timeline[0];
    if (firstLap) {
      driverKeys.sort((a, b) => {
        const posA = firstLap[a.key] || 999;
        const posB = firstLap[b.key] || 999;
        return posA - posB;
      });
    }
  }

  // Index of each driver's last plotted lap — the lap they retired / were last recorded.
  const lastLapIndexByDriver: Record<string, number> = {};
  const dnfByLap: Record<number, { code: string; statusKR: string; driverNumber: number }[]> = {};
  if (timeline.data?.timeline) {
    for (const d of driverKeys) {
      let lastIdx = 0;
      for (let i = 0; i < timeline.data.timeline.length; i++) {
        if (timeline.data.timeline[i][d.key] != null) lastIdx = i;
      }
      lastLapIndexByDriver[d.key] = lastIdx;
      if (d.dnf) {
        const lap = timeline.data.timeline[lastIdx]?.lap;
        if (lap != null) {
          if (!dnfByLap[lap]) dnfByLap[lap] = [];
          dnfByLap[lap].push({ code: d.code, statusKR: d.statusKR || '', driverNumber: d.driverNumber });
        }
      }
    }
  }

  // Settle every driver's line onto the official post-race classification at the
  // final lap, so the right edge reads as the real final standings (penalties and
  // all) and no line cuts off mid-chart:
  //  · a DNF / lapped car holds its official finishing position from the lap after
  //    its last recorded lap through to the end;
  //  · a full-distance finisher keeps its on-track line and only its final point is
  //    pinned to the official position (a post-race penalty shows as a last-lap
  //    step). Positions are unique 1..N, so the right-edge labels never collide.
  const filledTimeline: any[] = (() => {
    const raw = timeline.data?.timeline;
    if (!raw || raw.length === 0 || driverKeys.length === 0) return raw || [];
    const lastIdx = raw.length - 1;

    const filled = raw.map((row: any) => ({ ...row }));
    for (const d of driverKeys) {
      const finalPos = d.finishPosition;
      if (finalPos == null || finalPos >= 99) continue; // no official position → leave as-is
      const idx = lastLapIndexByDriver[d.key];
      const from = idx < lastIdx ? idx + 1 : lastIdx;
      for (let i = from; i <= lastIdx; i++) filled[i][d.key] = finalPos;
    }
    return filled;
  })();

  // Continuous safety-car / VSC / red-flag periods, derived from the deploy→clear
  // sequence in the race-control stream. A period runs from its deploy lap until
  // the next green/chequered clears it — a lone marker lap would under-represent a
  // multi-lap event (e.g. a 13→16 safety car).
  const flagPeriods: { start: number; end: number; type: string }[] = [];
  {
    const stream = timeline.data?.rcStream || [];
    const total = timeline.data?.totalLaps || 0;
    let active: { type: string; start: number } | null = null;
    for (const rc of stream) {
      if (rc.type === 'safetyCar' || rc.type === 'vsc' || rc.type === 'redFlag') {
        if (!active) active = { type: rc.type, start: rc.lap };
        else if (active.type !== rc.type) {
          flagPeriods.push({ type: active.type, start: active.start, end: rc.lap });
          active = { type: rc.type, start: rc.lap };
        }
      } else if (rc.type === 'green' || rc.type === 'chequered') {
        if (active) { flagPeriods.push({ type: active.type, start: active.start, end: rc.lap }); active = null; }
      }
    }
    if (active) flagPeriods.push({ type: active.type, start: active.start, end: total });
  }
  const inFlagPeriod = (lap: number) => flagPeriods.some((p) => lap >= p.start && lap <= p.end);

  // Transient yellow-flag laps (thin markers / short areas), skipping any that
  // fall inside a larger SC/VSC/red period already highlighted, and the grid lap.
  const eventLaps: { lap: number; type: string }[] = [];
  if (timeline.data?.timeline) {
    for (const ld of timeline.data.timeline) {
      if (ld._events && ld.lap > 0 && !inFlagPeriod(ld.lap)) {
        const sig = ld._events.filter((e: any) => e.type === 'yellowFlag');
        if (sig.length > 0) eventLaps.push({ lap: ld.lap, type: sig[0].type });
      }
    }
  }
  const eventAreas: { start: number; end: number; type: string }[] = [];
  for (const el of eventLaps) {
    const last = eventAreas[eventAreas.length - 1];
    if (last && last.type === el.type && el.lap - last.end <= 2) last.end = el.lap;
    else eventAreas.push({ start: el.lap, end: el.lap, type: el.type });
  }

  const oddTicks = useMemo(() => {
    if (!timeline.data?.timeline) return [];
    const total = timeline.data.totalLaps || 0;
    // Always include Lap 0 (Grid) and odd laps 1, 3, 5...
    return Array.from({ length: total + 1 }, (_, i) => i).filter(n => n === 0 || n % 2 !== 0);
  }, [timeline.data]);

  const evenTicks = useMemo(() => {
    if (!timeline.data?.timeline) return [];
    const total = timeline.data.totalLaps || 0;
    // Always include Lap 0 (Grid) and even laps 2, 4, 6...
    return Array.from({ length: total + 1 }, (_, i) => i).filter(n => n === 0 || n % 2 === 0);
  }, [timeline.data]);

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">📈 {t('raceTimeline')}</h2>
        <p className="page-subtitle">{t('timelineSubtitle', { year })}</p>
      </div>

      <div className="selector-group fade-in fade-in-delay-1" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <select className="selector" value={selectedRound || ''} onChange={(e) => handleRoundChange(Number(e.target.value))}>
          <option value="" disabled>{t('selectRace')}</option>
          {races.map((r: any) => {
            const started = isRoundStarted(r);
            return (
              <option key={r.round} value={r.round} disabled={!started}>
                {t('raceCountryOption', { n: r.round, country: getCountryNameKR(r.circuit.country), name: r.raceName })}{started ? '' : t('upcomingSuffix')}
              </option>
            );
          })}
        </select>

        <select className="selector" value={sessionType} onChange={(e) => setSessionType(e.target.value as SessionType)}>
          <option value="" disabled>{t('selectRaceType')}</option>
          {hasSprint && <option value="sprint">{UI_LABELS.sprint}</option>}
          <option value="race" disabled={!!selectedRace && !isRaceStarted(selectedRace)}>{t('race')}</option>
        </select>
      </div>

      {timeline.loading && (
        <div className="loading-container fade-in">
          <div className="loading-spinner" />
          <p>{t('loadingData')}</p>
        </div>
      )}

      {/* Selected a session but data is missing / no response — likely not run yet */}
      {selectedRound && sessionType && !timeline.loading && !hasTimeline && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏁</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('noTimelineTitle')}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
            {t('notRunYetBody')}<br />{t('checkBackAfter')}
          </div>
        </div>
      )}

      {hasTimeline && (
        <div className="layout-content fade-in">
          {/* Section 1: Position Change Chart */}
          <div className="accordion-item">
            <div className={`accordion-header ${isChartOpen ? '' : 'collapsed'}`} onClick={() => setIsChartOpen(!isChartOpen)}>
              <div className="accordion-title">📈 {t('posChangeChart')}</div>
              <div className="collapse-toggle">{isChartOpen ? t('collapse') : t('expand')}</div>
            </div>
            {isChartOpen && (
              <div className="accordion-content">
                {driverKeys.length > 0 && (
                  <div className="card fade-in" style={{ padding: '24px 16px' }}>
                    <div className="card-title" style={{ paddingLeft: 8 }}>
                      {t('posChangeChart')}
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 8 }}>
                        {t('totalLapsDrivers', { laps: timeline.data.totalLaps, n: driverKeys.length })}
                      </span>
                    </div>
                    <div className="chart-container" style={{ height: Math.max(500, driverKeys.length * 26), '--chart-min-width': '800px' } as any}>
                      <div className="chart-scroll-inner">
                      <ResponsiveContainer>
                        <LineChart data={filledTimeline} margin={{ top: 35, right: 84, bottom: 20, left: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="lap" ticks={oddTicks} tick={{ fill: '#9494a8', fontSize: 11 }} axisLine={false} tickLine={false}
                            label={{ value: UI_LABELS.lap, fill: '#5c5c72', fontSize: 11, position: 'insideBottomRight', offset: -5 }} />
                          <XAxis xAxisId="top" orientation="top" dataKey="lap" ticks={evenTicks} tick={{ fill: '#9494a8', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis reversed domain={[0.5, driverKeys.length + 0.5]}
                            tick={false} axisLine={false} tickLine={false}
                            label={{ value: UI_LABELS.position, fill: '#5c5c72', fontSize: 11, angle: -90, position: 'insideLeft' }}
                            ticks={Array.from({ length: driverKeys.length }, (_, i) => i + 1)} />
                          <Tooltip content={<TimelineTooltip selectedDrivers={selectedDrivers} dnfByLap={dnfByLap} driverInfoMap={Object.fromEntries(driverKeys.map(d => [d.key, { name: d.name, code: d.code, color: d.color, dashed: d.dashed }]))} />} />

                          {/* Zebra Stripes */}
                          {Array.from({ length: Math.ceil((timeline.data.totalLaps || 0) / 2) }, (_, i) => (
                            <ReferenceArea
                              key={`stripe-${i}`}
                              x1={i * 2 + 1}
                              x2={i * 2 + 2}
                              fill="rgba(255,255,255,0.045)"
                              stroke="none"
                            />
                          ))}

                          {/* Continuous SC / VSC / red-flag periods (e.g. safety car 13→16) */}
                          {flagPeriods.map((p, idx) => (
                            <ReferenceArea key={`fp-${idx}`} x1={p.start} x2={p.end}
                              fill={EVENT_STYLES[p.type]?.bg || '#FF8C00'} fillOpacity={0.16}
                              stroke={EVENT_STYLES[p.type]?.bg || '#FF8C00'} strokeOpacity={0.4} />
                          ))}
                          {eventAreas.map((area, idx) => (
                            <ReferenceArea key={`a-${idx}`} x1={area.start} x2={area.end}
                              fill={EVENT_STYLES[area.type]?.bg || '#FF8C00'} fillOpacity={0.08}
                              stroke={EVENT_STYLES[area.type]?.bg || '#FF8C00'} strokeOpacity={0.2} />
                          ))}
                          {eventLaps.filter(el => !eventAreas.some(a => a.start <= el.lap && el.lap <= a.end && a.start !== a.end))
                            .map((el, idx) => (
                              <ReferenceLine key={`l-${idx}`} x={el.lap}
                                stroke={EVENT_STYLES[el.type]?.bg || '#FFD700'} strokeDasharray="4 4" strokeOpacity={0.5} />
                            ))}
                          {driverKeys.map((d) => {
                            const isSelected = selectedDrivers.has(d.key);
                            const isDimmed = selectedDrivers.size > 0 && !isSelected;
                            return (
                              <Line key={d.key} type="monotone" dataKey={d.key}
                                stroke={d.color}
                                strokeWidth={isSelected ? 4 : 2}
                                strokeOpacity={isDimmed ? 0.12 : 1}
                                dot={false} connectNulls name={d.name}
                                strokeDasharray={d.dashed ? "5 5" : "0"}
                                onClick={() => toggleDriver(d.key)}
                                style={{ cursor: 'pointer' }}
                                activeDot={{ r: 4, fill: d.color, stroke: '#0a0a0f', strokeWidth: 2 }}>
                                <LabelList dataKey={d.key} content={(props) => renderCustomLabel(props, `${d.code} (#${d.driverNumber})`, false, 0, isDimmed)} />
                                <LabelList dataKey={d.key} content={(props) => renderCustomLabel(props, `${d.code} (#${d.driverNumber})`, true, filledTimeline.length - 1, isDimmed)} />
                                <LabelList dataKey={d.key} content={(props) => renderTireMarker(props, d.key, getTireCompound, timeline.data.timeline, selectedDrivers)} />
                                {d.dnf && <LabelList dataKey={d.key} content={(props) => renderDnfMarker(props, lastLapIndexByDriver[d.key], isDimmed)} />}
                              </Line>
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                      {driverKeys.map((d) => {
                        const isSelected = selectedDrivers.has(d.key);
                        const isDimmed = selectedDrivers.size > 0 && !isSelected;
                        const krName = getDriverNameKR(d.driverId, d.fullName);
                        return (
                          <div key={d.key}
                            onClick={() => toggleDriver(d.key)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                              cursor: 'pointer',
                              opacity: isDimmed ? 0.25 : 1,
                              transition: 'all 0.2s',
                              background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: `1px solid ${isSelected ? 'rgba(255,255,255,0.1)' : 'transparent'}`
                            }}
                          >
                            <span style={{
                              width: 14, height: 3, borderRadius: 2,
                              background: d.color,
                              display: 'inline-block',
                              borderBottom: d.dashed ? '1px dashed rgba(0,0,0,0.5)' : 'none',
                              opacity: d.dashed ? 0.7 : 1,
                              position: 'relative'
                            }}>
                              {d.dashed && (
                                <span style={{
                                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                  background: `repeating-linear-gradient(90deg, transparent, transparent 3px, #0a0a0f 3px, #0a0a0f 6px)`
                                }} />
                              )}
                            </span>
                            <span style={{ fontWeight: isSelected ? 800 : 600, fontFamily: 'var(--font-display)', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              {krName}({d.code})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Race Replay */}
          <div className="accordion-item">
            <div className={`accordion-header ${isReplayOpen ? '' : 'collapsed'}`} onClick={() => setIsReplayOpen(!isReplayOpen)}>
              <div className="accordion-title">🎬 {t('raceReplay')}</div>
              <div className="collapse-toggle">{isReplayOpen ? t('collapse') : t('expand')}</div>
            </div>
            {isReplayOpen && (
              <div className="accordion-content">
                {/* ... (existing legend and info) */}
                <div className="card fade-in" style={{ marginBottom: 12, padding: '16px 24px' }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{t('legend')}</div>
                    {Object.entries(EVENT_STYLES).filter(([k]) => k !== 'green' && k !== 'chequered').map(([key, style]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: style.bg }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{style.icon} {evtLabel(key)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <span style={{ color: '#00C853', fontWeight: 700 }}>▲</span><span style={{ color: 'var(--text-secondary)' }}>{t('gained')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <span style={{ color: '#E10600', fontWeight: 700 }}>▼</span><span style={{ color: 'var(--text-secondary)' }}>{t('dropped')}</span>
                    </div>
                  </div>
                </div>
                <RaceReplay key={`${selectedRound}-${sessionType}`} data={timeline.data} getTireCompound={getTireCompound} />
              </div>
            )}
          </div>
        </div>
      )}

      {(!selectedRound || !sessionType) && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {!selectedRound ? t('promptSelectRace') : t('promptSelectRaceType')}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
            {t('replayHintLine1')}<br />{t('replayHintLine2')}
          </div>
        </div>
      )}
    </div>
  );
}
