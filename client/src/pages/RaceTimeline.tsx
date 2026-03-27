import { useState, useEffect, useRef, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { getSessions, getRaceTimeline } from '../services/api';
import { getSessionNameKR, getTeamNameKR, getDriverNameKR, UI_LABELS } from '../constants/koreanTerms';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, LabelList } from 'recharts';

function renderCustomLabel(props: any, name: string, isEnd: boolean, dataLength: number, isDimmed: boolean) {
  const { x, y, index } = props;
  if (isEnd && index !== dataLength - 1) return null;
  if (!isEnd && index !== 0) return null;
  
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
      #{name}
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

const EVENT_STYLES: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  pit: { color: '#fff', bg: '#555', label: '피트 스톱', icon: '🛞' },
  yellowFlag: { color: '#000', bg: '#FFD700', label: '옐로 플래그', icon: '🟡' },
  redFlag: { color: '#fff', bg: '#E10600', label: '레드 플래그', icon: '🔴' },
  safetyCar: { color: '#000', bg: '#FF8C00', label: '세이프티 카', icon: '🚗' },
  vsc: { color: '#000', bg: '#FFA500', label: '버추얼 세이프티 카', icon: '🟠' },
  green: { color: '#fff', bg: '#00C853', label: '그린 플래그', icon: '🟢' },
  chequered: { color: '#fff', bg: '#333', label: '체커드 플래그', icon: '🏁' },
};

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

function TimelineTooltip({ active, payload, label, driverInfoMap, selectedDrivers }: any) {
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

  return (
    <div style={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '12px 16px', maxHeight: 400, overflowY: 'auto', fontSize: 12, minWidth: 200 }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: '#f0f0f5' }}>랩 {label}</div>
      {events.length > 0 && (
        <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {events.map((ev: any, i: number) => {
            const style = EVENT_STYLES[ev.type] || EVENT_STYLES.pit;
            return (
              <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: style.bg, color: style.color, marginRight: 4, marginBottom: 4 }}>
                {style.icon} {ev.driver || style.label}{ev.duration ? ` (${ev.duration.toFixed(1)}s)` : ''}
              </div>
            );
          })}
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
            <span style={{ fontWeight: 600, color: '#f0f0f5', flex: 1 }}>#{info?.name || entry.dataKey}</span>
          </div>
        );
      })}
      {sorted.length > displayEntries.length && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
          외 {sorted.length - displayEntries.length}명의 드라이버
        </div>
      )}
    </div>
  );
}

// ===================================
// POSITION-STREAM RACE REPLAY
// ===================================
function RaceReplay({ data, getTireCompound }: { data: any, getTireCompound: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [simTime, setSimTime] = useState(0); // ms offset from effective race start
  const animRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const { positionStream, pitStream, rcStream, lapStream, drivers, raceStartTime, raceEndTime } = data;

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
      console.log(`[RaceReplay] Progress: Lap ${state.lap}, AbsTime: ${new Date(absTime).toLocaleTimeString()}, simTime: ${Math.floor(simTime/1000)}s`);
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

  // Sort drivers by position
  const sortedDrivers = Object.entries(positions)
    .map(([dn, pos]) => ({
      driverNumber: Number(dn),
      position: pos,
      info: driverMap[Number(dn)],
      prevPosition: prevPositions[Number(dn)] || pos,
    }))
    .filter(d => d.info && d.position <= 20)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: activeFlag ? `${EVENT_STYLES[activeFlag.type]?.bg}15` : 'transparent',
        borderBottom: `2px solid ${activeFlag ? EVENT_STYLES[activeFlag.type]?.bg : 'var(--border-color)'}`,
        transition: 'all 0.3s ease',
      }}>
        <div>
          <div className="card-title" style={{ margin: 0 }}>
            🏎️ 레이스 리플레이
            {activeFlag && (
              <span style={{
                marginLeft: 12, padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                background: EVENT_STYLES[activeFlag.type]?.bg, color: EVENT_STYLES[activeFlag.type]?.color,
              }}>
                {EVENT_STYLES[activeFlag.type]?.icon} {EVENT_STYLES[activeFlag.type]?.label}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-display)' }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>랩 {currentLap}</span>
            <span style={{ margin: '0 10px', opacity: 0.3 }}>|</span>
            레이스 경과 {simMin}:{simSec.toString().padStart(2, '0')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
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

      {/* Pit stop banner */}
      {activePits.length > 0 && (
        <div style={{
          padding: '6px 24px', background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>🛞 PIT:</span>
          {activePits.map((pit: any, i: number) => (
            <span key={i} style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#555', color: '#fff',
            }}>
              {driverMap[pit.dn]?.nameAcronym || `#${pit.dn}`} {pit.dur ? `(${pit.dur.toFixed(1)}s)` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      <div style={{ padding: '8px 0' }}>
        {sortedDrivers.map((driver) => {
          const color = driver.info?.teamColour ? `#${driver.info.teamColour}` : '#888';
          const isPitting = pitDriverNumbers.has(driver.driverNumber);
          const krName = getDriverNameKR(driver.info?.fullName || '');
          const krTeam = getTeamNameKR(driver.info?.teamName || '');
          const posDelta = driver.prevPosition - driver.position;

          return (
            <div
              key={driver.driverNumber}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '7px 24px',
                background: driver.position <= 3 ? `linear-gradient(90deg, ${color}18, transparent 60%)` : 'transparent',
                borderLeft: `3px solid ${color}`,
                transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                opacity: isPitting ? 0.55 : 1,
              }}
            >
              <div style={{
                width: 30, fontWeight: 800, fontSize: 17, fontFamily: 'var(--font-display)',
                color: driver.position === 1 ? '#FFD700' : driver.position === 2 ? '#C0C0C0' : driver.position === 3 ? '#CD7F32' : 'var(--text-secondary)',
                textAlign: 'center',
              }}>
                {driver.position}
              </div>
              <div style={{ width: 28, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                {posDelta > 0 ? <span style={{ color: '#00C853' }}>▲{posDelta}</span>
                  : posDelta < 0 ? <span style={{ color: '#E10600' }}>▼{Math.abs(posDelta)}</span>
                  : <span style={{ color: 'rgba(255,255,255,0.15)' }}>–</span>}
              </div>
              <div style={{ width: 4, height: 26, background: color, borderRadius: 2, margin: '0 10px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {driver.info?.nameAcronym || '???'}
                  {(() => {
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
              {isPitting && (
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
export default function RaceTimeline({ year }: Props) {
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [isChartOpen, setIsChartOpen] = useState(true);
  const [isReplayOpen, setIsReplayOpen] = useState(true);
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());

  const { data: sessionsData } = useApi(() => getSessions(year), [year]);
  const timeline = useApi(
    (signal) => (selectedSession ? getRaceTimeline(selectedSession, signal) : Promise.resolve(null)),
    [selectedSession]
  );

  const toggleDriver = (driverKey: string) => {
    const next = new Set(selectedDrivers);
    if (next.has(driverKey)) next.delete(driverKey);
    else next.add(driverKey);
    setSelectedDrivers(next);
  };

  const getTireCompound = (driverNumber: number, lap: number, onlyIfStart: boolean = false) => {
    if (!timeline.data?.stints) return null;
    const driverStints = timeline.data.stints[driverNumber] || (timeline.data.stints as any)[String(driverNumber)];
    if (!driverStints || driverStints.length === 0) return null;

    if (onlyIfStart) {
      if (lap === 0) {
        // Always show the very first stint at Lap 0
        const firstStint = driverStints.find((s: any) => s.stintNumber === 1 || s.lapStart <= 1);
        return firstStint?.compound || null;
      }
      
      const stintStarting = driverStints.find((s: any) => s.lapStart === lap);
      // If stint 1 started at lap 1, we already forced it to lap 0, so don't show it at lap 1
      if (stintStarting && stintStarting.stintNumber === 1 && stintStarting.lapStart === 1) {
        return null;
      }
      return stintStarting?.compound || null;
    }

    // Standard lookup for non-marker use
    const currentStint = driverStints.find((s: any) => lap >= s.lapStart && lap <= s.lapEnd);
    return currentStint?.compound || null;
  };

  const raceSessions = (sessionsData || []).filter((s: any) => s.sessionType === 'Race');

  const driverKeys: { key: string; color: string; name: string; fullName: string; driverNumber: number; dashed?: boolean }[] = [];
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
          fullName: driver.fullName,
          driverNumber: driver.driverNumber,
          dashed: count > 0 
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

  const eventLaps: { lap: number; type: string }[] = [];
  if (timeline.data?.timeline) {
    for (const ld of timeline.data.timeline) {
      if (ld._events) {
        const sig = ld._events.filter((e: any) => ['redFlag', 'safetyCar', 'vsc', 'yellowFlag'].includes(e.type));
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

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">📈 레이스 타임라인</h2>
        <p className="page-subtitle">{year} 시즌 · 실시간 순위 변동 및 레이스 이벤트 시각화</p>
      </div>

      <div className="selector-group fade-in fade-in-delay-1">
        <select className="selector" value={selectedSession || ''} onChange={(e) => setSelectedSession(Number(e.target.value))}>
          <option value="" disabled>레이스 선택</option>
          {raceSessions.map((s: any) => (
            <option key={s.sessionKey} value={s.sessionKey}>
              {s.circuitShortName} - {getSessionNameKR(s.sessionName)}
            </option>
          ))}
        </select>
      </div>

      {timeline.loading && (
        <div className="loading-container fade-in">
          <div className="loading-spinner" />
          <p>데이터를 불러오는 중...</p>
        </div>
      )}

      {timeline.data && timeline.data.timeline && (
        <div className="layout-content fade-in">
          {/* Section 1: Position Change Chart */}
          <div className="accordion-item">
            <div className="accordion-header" onClick={() => setIsChartOpen(!isChartOpen)}>
              <div className="accordion-title">📈 순위 변동 차트</div>
              <div className={`accordion-icon ${isChartOpen ? 'open' : ''}`}>▼</div>
            </div>
            {isChartOpen && (
              <div className="accordion-content">
                {driverKeys.length > 0 && (
                  <div className="card fade-in" style={{ padding: '24px 16px' }}>
                    <div className="card-title" style={{ paddingLeft: 8 }}>
                      순위 변동 차트
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 8 }}>
                        총 {timeline.data.totalLaps} 랩 · {driverKeys.length}명
                      </span>
                    </div>
                    <div className="chart-container" style={{ height: Math.max(500, driverKeys.length * 26) }}>
                      <ResponsiveContainer>
                        <LineChart data={timeline.data.timeline} margin={{ top: 35, right: 80, bottom: 20, left: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="lap" ticks={oddTicks} tick={{ fill: '#9494a8', fontSize: 11 }} axisLine={false} tickLine={false}
                            label={{ value: UI_LABELS.lap, fill: '#5c5c72', fontSize: 11, position: 'insideBottomRight', offset: -5 }} />
                          <YAxis reversed domain={[0.5, Math.min(20, driverKeys.length) + 0.5]}
                            tick={false} axisLine={false} tickLine={false}
                            label={{ value: UI_LABELS.position, fill: '#5c5c72', fontSize: 11, angle: -90, position: 'insideLeft' }}
                            ticks={Array.from({ length: Math.min(20, driverKeys.length) }, (_, i) => i + 1)} />
                          <Tooltip content={<TimelineTooltip selectedDrivers={selectedDrivers} driverInfoMap={Object.fromEntries(driverKeys.map(d => [d.key, { name: d.name, color: d.color, dashed: d.dashed }]))} />} />
                          
                          {/* Zebra Stripes */}
                          {Array.from({ length: Math.ceil((timeline.data.totalLaps || 0) / 2) }, (_, i) => (
                            <ReferenceArea 
                              key={`stripe-${i}`} 
                              x1={i * 2 + 1} 
                              x2={i * 2 + 2} 
                              fill="rgba(255,255,255,0.015)" 
                              stroke="none" 
                            />
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
                                <LabelList dataKey={d.key} content={(props) => renderCustomLabel(props, d.name, false, timeline.data.timeline.length, isDimmed)} />
                                <LabelList dataKey={d.key} content={(props) => renderCustomLabel(props, d.name, true, timeline.data.timeline.length, isDimmed)} />
                                <LabelList dataKey={d.key} content={(props) => renderTireMarker(props, d.key, getTireCompound, timeline.data.timeline, selectedDrivers)} />
                              </Line>
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                      {driverKeys.map((d) => {
                        const isSelected = selectedDrivers.has(d.key);
                        const isDimmed = selectedDrivers.size > 0 && !isSelected;
                        const krName = getDriverNameKR(d.fullName);
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
                              {krName} (#{d.driverNumber})
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
            <div className="accordion-header" onClick={() => setIsReplayOpen(!isReplayOpen)}>
              <div className="accordion-title">🎬 레이스 리플레이</div>
              <div className={`accordion-icon ${isReplayOpen ? 'open' : ''}`}>▼</div>
            </div>
            {isReplayOpen && (
              <div className="accordion-content">
                {/* ... (existing legend and info) */}
                <div className="card fade-in" style={{ marginBottom: 12, padding: '16px 24px' }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>범례:</div>
                    {Object.entries(EVENT_STYLES).filter(([k]) => k !== 'green' && k !== 'chequered').map(([key, style]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: style.bg }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{style.icon} {style.label}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <span style={{ color: '#00C853', fontWeight: 700 }}>▲</span><span style={{ color: 'var(--text-secondary)' }}>상승</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      <span style={{ color: '#E10600', fontWeight: 700 }}>▼</span><span style={{ color: 'var(--text-secondary)' }}>하락</span>
                    </div>
                  </div>
                </div>
                <RaceReplay key={selectedSession} data={timeline.data} getTireCompound={getTireCompound} />
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedSession && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>레이스를 선택하세요</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
            레이스를 선택하고 ▶ 버튼을 누르면<br />실시간 순위 변동을 리플레이합니다.
          </div>
        </div>
      )}
    </div>
  );
}
