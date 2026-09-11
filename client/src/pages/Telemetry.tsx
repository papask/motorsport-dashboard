import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getTelemetryDrivers, getDriverTelemetry } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getCountryNameKR, UI_LABELS } from '../constants/koreanTerms';
import { useT } from '../i18n';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, Area, AreaChart, ComposedChart, ReferenceLine, ReferenceArea } from 'recharts';

interface Props { year: number; }

const TIRE_COLORS: Record<string, string> = {
  'SOFT': '#E10600',
  'MEDIUM': '#FFD700',
  'HARD': '#FFFFFF',
  'INTERMEDIATE': '#00C853',
  'WET': '#0091FF',
};

const NEUTRAL_COLOR = '#FFB020';

// Fixed per-driver colors used only in comparison mode, so the two drivers
// are told apart consistently across every chart (A = primary, B = compare).
const DRIVER_A_COLOR = '#E10600';
const DRIVER_B_COLOR = '#12B8FF';

// Classify a lap's FastF1 TrackStatus into a neutralization type.
// Status codes: 1=green, 2=yellow, 4=Safety Car, 5=red flag, 6/7=Virtual SC.
// Falls back to SC when the lap has no clean lap time but was still run
// (older data without TrackStatus, or laps FastF1 couldn't classify).
function neutralType(
  trackStatus: string | null | undefined,
  clean: boolean,
  sectorSum: number
): 'RED' | 'SC' | 'VSC' | null {
  const s = trackStatus || '';
  if (s.includes('5')) return 'RED';
  if (s.includes('4')) return 'SC';
  if (s.includes('6') || s.includes('7')) return 'VSC';
  if (!clean && sectorSum > 0) return 'SC';
  return null;
}

// Build the filtered lap-time series for one driver (neutralized laps kept,
// with a sector-sum fallback for their missing lap time).
function buildLapData(laps: any[] | undefined | null) {
  if (!laps) return [];
  return laps
    .map((l: any) => {
      const sectorSum = (l.sector1 || 0) + (l.sector2 || 0) + (l.sector3 || 0);
      const hasTime = l.lapTime != null && l.lapTime > 0 && l.lapTime < 300;
      const nType = neutralType(l.trackStatus, hasTime, sectorSum);
      const clean = hasTime && !nType;
      const time = (l.lapTime != null && l.lapTime > 0 && l.lapTime < 400)
        ? l.lapTime
        : (sectorSum > 0 && sectorSum < 400 ? sectorSum : null);
      return {
        lap: l.lapNumber,
        time,
        clean,
        neutral: nType,
        s1: l.sector1,
        s2: l.sector2,
        s3: l.sector3,
        compound: l.compound,
        tyreLife: l.tyreLife,
        stint: l.stint,
        isPB: l.isPersonalBest,
        pitIn: l.pitIn,
        pitOut: l.pitOut,
        speedI1: l.speedI1,
        speedI2: l.speedI2,
        speedFL: l.speedFL,
        speedST: l.speedST,
      };
    })
    .filter((l: any) => l.time != null && l.time > 0);
}

// Build the full lap list for the sector table (all laps kept, including
// neutralized ones that have no clean lap time).
function buildAllLapData(laps: any[] | undefined | null) {
  if (!laps) return [];
  return laps.map((l: any) => {
    const sectorSum = (l.sector1 || 0) + (l.sector2 || 0) + (l.sector3 || 0);
    const clean = l.lapTime != null && l.lapTime > 0 && l.lapTime < 300;
    return {
      lap: l.lapNumber,
      time: l.lapTime,
      s1: l.sector1,
      s2: l.sector2,
      s3: l.sector3,
      compound: l.compound,
      tyreLife: l.tyreLife,
      stint: l.stint,
      isPB: l.isPersonalBest,
      neutral: neutralType(l.trackStatus, clean, sectorSum),
      pitIn: l.pitIn,
      pitOut: l.pitOut,
    };
  });
}

// Map one driver's telemetry samples into chart rows.
function buildSpeedData(telemetry: any[] | undefined | null) {
  if (!telemetry) return [];
  return telemetry.map((t: any) => ({
    distance: Math.round(t.distance),
    speed: t.speed,
    throttle: t.throttle,
    brake: t.brake ? 100 : 0,
    gear: t.gear,
    rpm: t.rpm,
    drs: t.drs >= 10 ? 1 : 0,
  }));
}

function Telemetry({ year }: Props) {
  const t = useT();
  const { data: schedule, loading: schedLoading } = useApi(
    (signal) => getSeasonSchedule(year, signal), [year]
  );
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [selectedDriverB, setSelectedDriverB] = useState<number | null>(null);
  // Which lap's traces to show (null = the driver's fastest lap, the default).
  const [selectedLapA, setSelectedLapA] = useState<number | null>(null);
  const [selectedLapB, setSelectedLapB] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'speed' | 'inputs' | 'laps'>('speed');

  // Load drivers for the selected round
  const { data: driversData, loading: driversLoading } = useApi(
    (signal) => selectedRound ? getTelemetryDrivers(year, selectedRound, signal) : Promise.resolve(null),
    [year, selectedRound]
  );

  // Base fetch per driver = fastest lap. Gates the page and provides the full
  // laps summary + driver info (both independent of which trace lap is chosen).
  const { data: telemetryData, loading: telLoading, error: telError } = useApi(
    (signal) => (selectedRound && selectedDriver)
      ? getDriverTelemetry(year, selectedRound, selectedDriver, null, signal)
      : Promise.resolve(null),
    [year, selectedRound, selectedDriver]
  );

  // Optional second driver to compare against
  const { data: telemetryDataB, loading: telLoadingB } = useApi(
    (signal) => (selectedRound && selectedDriverB)
      ? getDriverTelemetry(year, selectedRound, selectedDriverB, null, signal)
      : Promise.resolve(null),
    [year, selectedRound, selectedDriverB]
  );

  // Secondary fetch for a specifically chosen lap's traces — kept separate so
  // picking a lap swaps only the speed/input charts, not the whole page.
  const { data: lapTelA, loading: lapLoadingA } = useApi(
    (signal) => (selectedRound && selectedDriver && selectedLapA != null)
      ? getDriverTelemetry(year, selectedRound, selectedDriver, selectedLapA, signal)
      : Promise.resolve(null),
    [year, selectedRound, selectedDriver, selectedLapA]
  );
  const { data: lapTelB, loading: lapLoadingB } = useApi(
    (signal) => (selectedRound && selectedDriverB && selectedLapB != null)
      ? getDriverTelemetry(year, selectedRound, selectedDriverB, selectedLapB, signal)
      : Promise.resolve(null),
    [year, selectedRound, selectedDriverB, selectedLapB]
  );

  // The telemetry actually shown: the chosen lap when set, else fastest (base).
  // While a chosen lap is still loading, fall back to the base traces so the
  // charts stay populated instead of blanking out.
  const telA = selectedLapA != null ? (lapTelA ?? telemetryData) : telemetryData;
  const telB = selectedLapB != null ? (lapTelB ?? telemetryDataB) : telemetryDataB;

  // Auto-select most recent race
  useEffect(() => {
    if (schedule?.races?.length && !selectedRound) {
      const now = new Date();
      const pastRaces = schedule.races.filter((r: any) => new Date(r.date || r.session5Date || '') < now);
      const latest = pastRaces.length > 0 ? pastRaces[pastRaces.length - 1] : schedule.races[0];
      setSelectedRound(latest.round);
    }
  }, [schedule]);

  // Auto-select first driver
  useEffect(() => {
    if (driversData?.drivers?.length && !selectedDriver) {
      setSelectedDriver(driversData.drivers[0].number);
    }
  }, [driversData]);

  // Reset drivers when round changes
  useEffect(() => {
    setSelectedDriver(null);
    setSelectedDriverB(null);
  }, [selectedRound]);

  // Reset the chosen trace lap back to "fastest" whenever the driver changes.
  useEffect(() => { setSelectedLapA(null); }, [selectedDriver, selectedRound]);
  useEffect(() => { setSelectedLapB(null); }, [selectedDriverB, selectedRound]);

  // Never let the compare driver equal the primary driver
  useEffect(() => {
    if (selectedDriverB && selectedDriverB === selectedDriver) setSelectedDriverB(null);
  }, [selectedDriver, selectedDriverB]);

  const drivers = driversData?.drivers || [];
  const currentDriver = drivers.find((d: any) => d.number === selectedDriver);
  const driverB = drivers.find((d: any) => d.number === selectedDriverB);
  const comparing = !!(selectedDriverB && telemetryDataB);

  const driverLabel = (d: any, num: number | null) =>
    d ? (getDriverNameKR(d.code) || d.code || `#${num}`) : `#${num}`;
  const nameA = driverLabel(currentDriver, selectedDriver);
  const nameB = driverLabel(driverB, selectedDriverB);

  // Prepare telemetry chart data (from the effective / chosen lap)
  const speedData = useMemo(() => buildSpeedData(telA?.telemetry), [telA]);
  const speedDataB = useMemo(() => buildSpeedData(telB?.telemetry), [telB]);

  // The lap number currently displayed for each driver (chosen or fastest).
  const viewedLapA = selectedLapA ?? telemetryData?.telemetryLap ?? null;
  const viewedLapB = selectedLapB ?? telemetryDataB?.telemetryLap ?? null;

  // DRS was dropped for 2026 (replaced by manual override, which the F1 feed
  // doesn't expose). Detect whether DRS ever opens and hide the dead chart if
  // not — data-driven so it also covers any race with no DRS activity.
  const hasDrsData = useMemo(
    () => speedData.some((p: any) => p.drs > 0) || speedDataB.some((p: any) => p.drs > 0),
    [speedData, speedDataB]
  );

  // Merge driver B onto driver A's distance grid (nearest sample) so the two
  // fastest laps overlay cleanly on a single shared x-axis / tooltip.
  const chartData = useMemo(() => {
    if (!comparing || !speedDataB.length) return speedData;
    const b = speedDataB;
    let j = 0;
    return speedData.map((pa: any) => {
      while (j < b.length - 1 && b[j + 1].distance <= pa.distance) j++;
      const b0 = b[j], b1 = b[Math.min(j + 1, b.length - 1)];
      const nb = Math.abs(b0.distance - pa.distance) <= Math.abs(b1.distance - pa.distance) ? b0 : b1;
      return {
        ...pa,
        speedB: nb.speed, rpmB: nb.rpm, gearB: nb.gear,
        throttleB: nb.throttle, brakeB: nb.brake, drsB: nb.drs,
      };
    });
  }, [comparing, speedData, speedDataB]);

  // Lap time chart data. Neutralized laps (safety car / VSC / red flag) have
  // no official lapTime from FastF1, so we fall back to the sum of sectors as
  // the bar height and flag them so the chart can mark the SC period.
  const lapData = useMemo(() => buildLapData(telemetryData?.laps), [telemetryData]);
  const lapDataB = useMemo(() => buildLapData(telemetryDataB?.laps), [telemetryDataB]);

  // In compare mode, attach driver B's lap time to each of A's laps by number.
  const lapCompareData = useMemo(() => {
    if (!comparing) return lapData;
    const bMap = new Map(lapDataB.map((l: any) => [l.lap, l.time]));
    return lapData.map((a: any) => ({ ...a, timeB: bMap.get(a.lap) ?? null }));
  }, [comparing, lapData, lapDataB]);

  // Laps where the driver entered the pit lane (in-laps), for chart markers.
  const pitLaps = useMemo(
    () => lapData.filter((l: any) => l.pitIn).map((l: any) => l.lap),
    [lapData]
  );

  // Contiguous neutralized lap ranges, for shading the chart.
  const scPeriods = useMemo(() => {
    const periods: { start: number; end: number; type: string }[] = [];
    let start: number | null = null, prev = 0, type = '';
    for (const l of lapData) {
      if (l.neutral) {
        if (start == null) { start = l.lap; type = l.neutral; }
        prev = l.lap;
      } else if (start != null) {
        periods.push({ start, end: prev, type });
        start = null;
      }
    }
    if (start != null) periods.push({ start, end: prev, type });
    return periods;
  }, [lapData]);

  const neutralLabel = (type: string) =>
    type === 'RED' ? t('redFlag') : type === 'VSC' ? t('virtualSafetyCar') : t('safetyCar');

  // Small round tyre-compound badge used in the sector table.
  const tyreBadge = (compound: string | null | undefined) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: '50%',
      background: TIRE_COLORS[compound || ''] || '#888',
      color: '#000', fontWeight: 800, fontSize: 10,
    }}>
      {compound?.charAt(0) || '?'}
    </span>
  );

  // A/B stacked sector cell: driver A on top (red), B below (blue); the faster
  // of the two is bolded so per-lap sector deltas read at a glance.
  const cmpSectorCell = (a: number | null, b: number | null) => (
    <td style={{ lineHeight: 1.4 }}>
      <div style={{ color: DRIVER_A_COLOR, fontWeight: a != null && (b == null || a <= b) ? 800 : 400 }}>
        {a != null ? a.toFixed(3) : '-'}
      </div>
      <div style={{ color: DRIVER_B_COLOR, fontWeight: b != null && (a == null || b < a) ? 800 : 400 }}>
        {b != null ? b.toFixed(3) : '-'}
      </div>
    </td>
  );

  // Full lap list for the sector table — keep laps with no clean lapTime
  // (safety car, red flag, pit in/out) which FastF1 reports as null.
  const allLapData = useMemo(() => buildAllLapData(telemetryData?.laps), [telemetryData]);
  const allLapDataB = useMemo(() => buildAllLapData(telemetryDataB?.laps), [telemetryDataB]);

  // Sector table rows. In compare mode each row also carries driver B's
  // sectors/lap time (by lap number) so they can be shown side by side.
  const tableData = useMemo(() => {
    if (!comparing) return allLapData;
    const bMap = new Map(allLapDataB.map((l: any) => [l.lap, l]));
    return allLapData.map((a: any) => {
      const b = bMap.get(a.lap);
      return {
        ...a,
        s1B: b?.s1 ?? null,
        s2B: b?.s2 ?? null,
        s3B: b?.s3 ?? null,
        timeB: b?.time ?? null,
        compoundB: b?.compound ?? null,
        neutralB: b?.neutral ?? null,
        pitInB: b?.pitIn ?? false,
        pitOutB: b?.pitOut ?? false,
      };
    });
  }, [comparing, allLapData, allLapDataB]);

  // Stats are based on clean (green-flag) laps only, so neutralized laps
  // don't drag the average up or masquerade as a fastest lap.
  const cleanLaps = useMemo(() => lapData.filter((l: any) => l.clean), [lapData]);

  const avgLapTime = useMemo(() => {
    if (!cleanLaps.length) return 0;
    return cleanLaps.reduce((s: number, l: any) => s + l.time, 0) / cleanLaps.length;
  }, [cleanLaps]);

  const fastestLap = useMemo(() => {
    if (!cleanLaps.length) return null;
    return cleanLaps.reduce((min: any, l: any) => (!min || l.time < min.time) ? l : min, null);
  }, [cleanLaps]);

  const hasNeutral = useMemo(() => lapData.some((l: any) => l.neutral), [lapData]);
  const hasNeutralB = useMemo(() => comparing && lapDataB.some((l: any) => l.neutral), [comparing, lapDataB]);

  // Driver B's fastest clean lap, so the capped domain fits both drivers.
  const fastestB = useMemo(() => {
    const clean = lapDataB.filter((l: any) => l.clean);
    if (!clean.length) return null;
    return clean.reduce((min: any, l: any) => (!min || l.time < min.time) ? l : min, null);
  }, [lapDataB]);

  // When there are neutralized (SC/VSC) laps, their huge times would stretch
  // the whole axis and flatten the green-lap variation. Instead we cap the
  // domain so the average sits ~1/3 up the chart and the slow laps overflow
  // the top (clipped via allowDataOverflow) — showing they're truncated.
  // This applies in compare mode too, anchored to the faster of the two cars.
  const yCap = useMemo<{ domain: [any, any]; overflow: boolean }>(() => {
    if ((hasNeutral || hasNeutralB) && fastestLap && avgLapTime > 0) {
      const fastestTimes = [fastestLap.time];
      if (comparing && fastestB) fastestTimes.push(fastestB.time);
      const min = Math.floor(Math.min(...fastestTimes) - 1);
      const max = Math.ceil(min + (avgLapTime - min) * 3);
      return { domain: [min, max], overflow: true };
    }
    return {
      domain: [
        (dataMin: number) => Math.floor(dataMin - 2),
        (dataMax: number) => Math.ceil(dataMax + 2),
      ],
      overflow: false,
    };
  }, [comparing, hasNeutral, hasNeutralB, fastestLap, fastestB, avgLapTime]);

  const formatLapTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return mins > 0 ? `${mins}:${parseFloat(secs) < 10 ? '0' : ''}${secs}` : `${secs}`;
  };

  // Overlay shown over the trace charts while a chosen lap is being fetched.
  // Only when a specific lap is selected — not the base/fastest no-op state.
  const anyLapLoading = (selectedLapA != null && lapLoadingA) || (selectedLapB != null && lapLoadingB);
  const lapLoadingOverlay = anyLapLoading ? (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 5, borderRadius: 12,
      background: 'rgba(12,12,20,0.6)', backdropFilter: 'blur(1px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="loading-spinner" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t('lapLoadingMsg')}</span>
      </div>
    </div>
  ) : null;

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
        <h2 className="page-title">🏎️ {UI_LABELS.telemetry}</h2>
        <p className="page-subtitle">{t('telemetrySubtitle')}</p>
      </div>

      {/* Race & Driver Selector */}
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

        {driversLoading ? (
          <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>{t('loadingShort')}</div>
        ) : (
          <select
            className="selector"
            value={selectedDriver || ''}
            onChange={(e) => setSelectedDriver(Number(e.target.value))}
          >
            <option value="" disabled>{t('selectDriver')}</option>
            {drivers.map((d: any) => (
              <option key={d.number} value={d.number}>
                #{d.number} {getDriverNameKR(d.code) || `${d.firstName} ${d.lastName}`} ({getTeamNameKR(d.team) || d.team})
              </option>
            ))}
          </select>
        )}

        {/* Optional compare-against driver */}
        {!driversLoading && selectedDriver && (
          <select
            className="selector"
            value={selectedDriverB || ''}
            onChange={(e) => setSelectedDriverB(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('compareVsNone')}</option>
            {drivers.filter((d: any) => d.number !== selectedDriver).map((d: any) => (
              <option key={d.number} value={d.number}>
                {t('compareVsPrefix')} #{d.number} {getDriverNameKR(d.code) || `${d.firstName} ${d.lastName}`} ({getTeamNameKR(d.team) || d.team})
              </option>
            ))}
          </select>
        )}
        {telLoadingB && (
          <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>{t('loadingShort')}</div>
        )}
      </div>

      {/* Comparison legend */}
      {comparing && (
        <div className="fade-in" style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 20, height: 4, borderRadius: 2, background: DRIVER_A_COLOR, display: 'inline-block' }} />
            {nameA}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 20, height: 4, borderRadius: 2, background: DRIVER_B_COLOR, display: 'inline-block' }} />
            {nameB}
          </div>
        </div>
      )}

      {/* Content */}
      {telLoading && (
        <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{t('telLoadingHint')}</div></div>
      )}

      {telError && (
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-message">{telError}</div>
        </div>
      )}

      {telemetryData && !telLoading && (
        <>
          {/* Driver Info Banner */}
          {currentDriver && (
            <div className="card" style={{ 
              marginBottom: 24, 
              padding: '20px 28px',
              borderLeft: `4px solid #${currentDriver.teamColor || '888'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: `#${currentDriver.teamColor || '888'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 800, color: '#000',
                fontFamily: 'var(--font-display)',
              }}>
                {currentDriver.number}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                  {getDriverNameKR(currentDriver.code) || `${currentDriver.firstName} ${currentDriver.lastName}`}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                  {getTeamNameKR(currentDriver.team) || currentDriver.team}
                  {telemetryData.laps?.length ? ` • ${t('lapsSuffix', { n: telemetryData.laps.length })}` : ''}
                  {fastestLap ? ` • ${t('fastestLapLabel', { time: formatLapTime(fastestLap.time) })}` : ''}
                </div>
              </div>
            </div>
          )}

          {/* Tab Selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {([
              { key: 'speed', label: t('tabSpeedRpm'), icon: '⚡' },
              { key: 'inputs', label: t('tabInputs'), icon: '🎮' },
              { key: 'laps', label: t('tabLaps'), icon: '⏱️' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === tab.key ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                  color: activeTab === tab.key ? '#fff' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Lap picker (affects speed/input traces only) */}
          {activeTab !== 'laps' && telemetryData && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {comparing && <span style={{ width: 12, height: 4, borderRadius: 2, background: DRIVER_A_COLOR, display: 'inline-block' }} />}
                <span style={{ fontSize: 12, fontWeight: 700, color: comparing ? DRIVER_A_COLOR : 'var(--text-secondary)' }}>
                  {comparing ? nameA : t('viewLapLabel')}
                </span>
                <select
                  className="selector"
                  style={{ padding: '6px 10px', fontSize: 13 }}
                  value={viewedLapA ?? ''}
                  onChange={(e) => setSelectedLapA(Number(e.target.value))}
                >
                  {(telemetryData?.laps || []).map((l: any) => (
                    <option key={l.lapNumber} value={l.lapNumber}>
                      {t('lapN', { n: l.lapNumber })}{l.lapNumber === telemetryData?.telemetryLap ? ' ⚡' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {comparing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 4, borderRadius: 2, background: DRIVER_B_COLOR, display: 'inline-block' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: DRIVER_B_COLOR }}>{nameB}</span>
                  <select
                    className="selector"
                    style={{ padding: '6px 10px', fontSize: 13 }}
                    value={viewedLapB ?? ''}
                    onChange={(e) => setSelectedLapB(Number(e.target.value))}
                  >
                    {(telemetryDataB?.laps || []).map((l: any) => (
                      <option key={l.lapNumber} value={l.lapNumber}>
                        {t('lapN', { n: l.lapNumber })}{l.lapNumber === telemetryDataB?.telemetryLap ? ' ⚡' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('fastestLapMark')}</span>
            </div>
          )}

          {/* Speed & RPM Tab */}
          {activeTab === 'speed' && speedData.length > 0 && (
            <div className="card" style={{ padding: 24, position: 'relative' }}>
              {lapLoadingOverlay}
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🏎️ {UI_LABELS.speed}{!comparing && viewedLapA != null ? ` · ${t('lapN', { n: viewedLapA })}` : ''}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E10600" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#E10600" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="distance" tick={{ fill: '#6a6a7d', fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                  <YAxis tick={{ fill: '#6a6a7d', fontSize: 10 }} domain={[0, 'auto']} unit=" km/h" />
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: any) => [`${Math.round(value)} km/h`, name]}
                    labelFormatter={(v) => t('distanceColon', { v })}
                  />
                  <Area type="monotone" dataKey="speed" name={comparing ? nameA : UI_LABELS.speed} stroke={DRIVER_A_COLOR} fill={comparing ? 'none' : 'url(#speedGrad)'} strokeWidth={1.5} dot={false} />
                  {comparing && <Area type="monotone" dataKey="speedB" name={nameB} stroke={DRIVER_B_COLOR} fill="none" strokeWidth={1.5} dot={false} />}
                </AreaChart>
              </ResponsiveContainer>

              <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                ⚙️ RPM
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="rpmGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFD700" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FFD700" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="distance" tick={{ fill: '#6a6a7d', fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                  <YAxis tick={{ fill: '#6a6a7d', fontSize: 10 }} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: any) => [`${Math.round(value)}`, comparing ? name : 'RPM']}
                  />
                  <Area type="monotone" dataKey="rpm" name={comparing ? nameA : 'RPM'} stroke={comparing ? DRIVER_A_COLOR : '#FFD700'} fill={comparing ? 'none' : 'url(#rpmGrad)'} strokeWidth={1.5} dot={false} />
                  {comparing && <Area type="monotone" dataKey="rpmB" name={nameB} stroke={DRIVER_B_COLOR} fill="none" strokeWidth={1.5} dot={false} />}
                </AreaChart>
              </ResponsiveContainer>

              <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🔧 {UI_LABELS.gear}
              </h3>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="distance" tick={{ fill: '#6a6a7d', fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                  <YAxis tick={{ fill: '#6a6a7d', fontSize: 10 }} domain={[0, 8]} ticks={[1,2,3,4,5,6,7,8]} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: any) => [t('gearUnit', { n: value }), comparing ? name : UI_LABELS.gear]}
                  />
                  <Line type="stepAfter" dataKey="gear" name={comparing ? nameA : UI_LABELS.gear} stroke={comparing ? DRIVER_A_COLOR : '#00C853'} strokeWidth={1.5} dot={false} />
                  {comparing && <Line type="stepAfter" dataKey="gearB" name={nameB} stroke={DRIVER_B_COLOR} strokeWidth={1.5} dot={false} />}
                </LineChart>
              </ResponsiveContainer>

              {/* Speed trap (fastest-lap top speeds) */}
              {fastestLap && (fastestLap.speedST != null || fastestLap.speedFL != null) && (
                <>
                  <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                    🏁 {t('speedTrapTitle')}
                  </h3>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {([
                      { key: 'speedST', label: 'ST', sub: t('speedTrapST') },
                      { key: 'speedI1', label: 'I1', sub: '' },
                      { key: 'speedI2', label: 'I2', sub: '' },
                      { key: 'speedFL', label: 'FL', sub: '' },
                    ] as const).map((m) => {
                      const a = fastestLap ? (fastestLap as any)[m.key] : null;
                      const b = comparing && fastestB ? (fastestB as any)[m.key] : null;
                      if (a == null && b == null) return null;
                      const aFast = a != null && (b == null || a >= b);
                      const bFast = b != null && (a == null || b > a);
                      return (
                        <div key={m.key} style={{ flex: '1 1 120px', minWidth: 120, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                            {m.label}{m.sub ? ` · ${m.sub}` : ''}
                          </div>
                          {comparing ? (
                            <div style={{ marginTop: 4, lineHeight: 1.4 }}>
                              <div style={{ color: DRIVER_A_COLOR, fontWeight: aFast ? 800 : 500, fontSize: 15 }}>
                                {a != null ? Math.round(a) : '-'}<span style={{ fontSize: 10, marginLeft: 2 }}>km/h</span>
                              </div>
                              <div style={{ color: DRIVER_B_COLOR, fontWeight: bFast ? 800 : 500, fontSize: 15 }}>
                                {b != null ? Math.round(b) : '-'}<span style={{ fontSize: 10, marginLeft: 2 }}>km/h</span>
                              </div>
                              {a != null && b != null && (
                                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                                  Δ {(a - b >= 0 ? '+' : '') + Math.round(a - b)} km/h
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                              {a != null ? Math.round(a) : '-'}<span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>km/h</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('speedTrapNote')}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Driver Inputs Tab */}
          {activeTab === 'inputs' && speedData.length > 0 && (
            <div className="card" style={{ padding: 24, position: 'relative' }}>
              {lapLoadingOverlay}
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🟢 {UI_LABELS.throttle}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="throttleGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00C853" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00C853" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="distance" tick={{ fill: '#6a6a7d', fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                  <YAxis tick={{ fill: '#6a6a7d', fontSize: 10 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: any) => [`${Math.round(value)}%`, comparing ? name : UI_LABELS.throttle]}
                  />
                  <Area type="monotone" dataKey="throttle" name={comparing ? nameA : UI_LABELS.throttle} stroke={comparing ? DRIVER_A_COLOR : '#00C853'} fill={comparing ? 'none' : 'url(#throttleGrad)'} strokeWidth={1.5} dot={false} />
                  {comparing && <Area type="monotone" dataKey="throttleB" name={nameB} stroke={DRIVER_B_COLOR} fill="none" strokeWidth={1.5} dot={false} />}
                </AreaChart>
              </ResponsiveContainer>

              <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🔴 {UI_LABELS.brake}
              </h3>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="brakeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E10600" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#E10600" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="distance" tick={{ fill: '#6a6a7d', fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                  <YAxis tick={{ fill: '#6a6a7d', fontSize: 10 }} domain={[0, 100]} ticks={[0, 100]} tickFormatter={(v) => v ? 'ON' : 'OFF'} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: any) => [value > 0 ? 'ON' : 'OFF', comparing ? name : UI_LABELS.brake]}
                  />
                  <Area type="stepAfter" dataKey="brake" name={comparing ? nameA : UI_LABELS.brake} stroke={DRIVER_A_COLOR} fill={comparing ? 'none' : 'url(#brakeGrad)'} strokeWidth={1.5} dot={false} />
                  {comparing && <Area type="stepAfter" dataKey="brakeB" name={nameB} stroke={DRIVER_B_COLOR} fill="none" strokeWidth={1.5} dot={false} />}
                </AreaChart>
              </ResponsiveContainer>

              {hasDrsData ? (
                <>
                  <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                    🟦 DRS
                  </h3>
                  <ResponsiveContainer width="100%" height={100}>
                    <AreaChart data={chartData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="distance" tick={{ fill: '#6a6a7d', fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                      <YAxis tick={{ fill: '#6a6a7d', fontSize: 10 }} domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => v ? 'ON' : 'OFF'} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                        formatter={(value: any, name: any) => [value > 0 ? 'ON' : 'OFF', comparing ? name : 'DRS']}
                      />
                      <Area type="stepAfter" dataKey="drs" name={comparing ? nameA : 'DRS'} stroke={comparing ? DRIVER_A_COLOR : '#0091FF'} fill={comparing ? 'none' : 'rgba(0,145,255,0.2)'} strokeWidth={1.5} dot={false} />
                      {comparing && <Area type="stepAfter" dataKey="drsB" name={nameB} stroke={DRIVER_B_COLOR} fill="none" strokeWidth={1.5} dot={false} />}
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <div style={{ marginTop: 24, padding: '12px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('drsRemovedNote')}
                </div>
              )}
            </div>
          )}

          {/* Lap Times Tab */}
          {activeTab === 'laps' && lapData.length > 0 && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                ⏱️ {UI_LABELS.lapTime}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={lapCompareData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="lap" tick={{ fill: '#6a6a7d', fontSize: 10 }} label={{ value: UI_LABELS.lap, fill: '#6a6a7d', fontSize: 11, position: 'insideBottom', offset: -5 }} />
                  <YAxis
                    tick={{ fill: '#6a6a7d', fontSize: 10 }}
                    domain={yCap.domain}
                    allowDataOverflow={yCap.overflow}
                    tickFormatter={formatLapTime}
                  />
                  {avgLapTime > 0 && (
                    <ReferenceLine y={avgLapTime} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" label={{ value: t('avg'), fill: '#6a6a7d', fontSize: 10 }} />
                  )}
                  {scPeriods.map((p, i) => (
                    <ReferenceArea
                      key={`sc-${i}`}
                      x1={p.start}
                      x2={p.end}
                      fill={NEUTRAL_COLOR}
                      fillOpacity={0.14}
                      stroke={NEUTRAL_COLOR}
                      strokeOpacity={0.4}
                      strokeDasharray="3 3"
                      label={{ value: p.type, position: 'insideTop', fill: NEUTRAL_COLOR, fontSize: 10, fontWeight: 700 }}
                    />
                  ))}
                  {pitLaps.map((lap: number) => (
                    <ReferenceLine
                      key={`pit-${lap}`}
                      x={lap}
                      stroke="#8A8AFF"
                      strokeDasharray="2 2"
                      strokeOpacity={0.7}
                      label={{ value: '🔧', position: 'top', fontSize: 12 }}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: string) => {
                      if (name === 'time') return [formatLapTime(value), t('lapTimeColon')];
                      return [formatLapTime(value), name];
                    }}
                    labelFormatter={(v) => t('lapN', { n: v })}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div style={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('lapN', { n: label })}</div>
                          {comparing ? (
                            <>
                              <div style={{ color: DRIVER_A_COLOR }}>{nameA}: <b>{formatLapTime(d.time)}</b>{d.neutral ? ' *' : ''}</div>
                              <div style={{ color: DRIVER_B_COLOR }}>{nameB}: <b>{formatLapTime(d.timeB)}</b></div>
                              {d.time > 0 && d.timeB > 0 && (
                                <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                                  Δ {(d.time - d.timeB >= 0 ? '+' : '') + (d.time - d.timeB).toFixed(3)}s
                                </div>
                              )}
                            </>
                          ) : (
                            <div>{t('lapTimeColon')}: <b>{formatLapTime(d.time)}</b>{d.neutral ? ' *' : ''}</div>
                          )}
                          {d.neutral && (
                            <div style={{ color: NEUTRAL_COLOR, marginTop: 2 }}>🟡 {neutralLabel(d.neutral)}</div>
                          )}
                          {d.pitIn && <div style={{ color: '#8A8AFF', marginTop: 2 }}>🔧 {t('pitInLabel')}</div>}
                          {d.pitOut && <div style={{ color: '#8A8AFF', marginTop: 2 }}>🔧 {t('pitOutLabel')}</div>}
                          {d.s1 && <div style={{ color: '#FFD700' }}>S1: {d.s1.toFixed(3)}s</div>}
                          {d.s2 && <div style={{ color: '#00C853' }}>S2: {d.s2.toFixed(3)}s</div>}
                          {d.s3 && <div style={{ color: '#0091FF' }}>S3: {d.s3.toFixed(3)}s</div>}
                          {d.compound && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{
                                display: 'inline-block',
                                width: 8, height: 8, borderRadius: '50%',
                                background: TIRE_COLORS[d.compound] || '#888',
                                marginRight: 4,
                              }} />
                              {d.compound} ({t('tyreLifeLaps', { n: d.tyreLife })})
                            </div>
                          )}
                          {d.isPB && <div style={{ color: '#00C853', marginTop: 2 }}>🟢 {t('personalBest')}</div>}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="time" name={comparing ? nameA : UI_LABELS.lapTime} radius={[2, 2, 0, 0]} barSize={comparing ? 5 : 6}>
                    {lapCompareData.map((entry: any, idx: number) => (
                      <Cell
                        key={idx}
                        fill={comparing ? DRIVER_A_COLOR : (TIRE_COLORS[entry.compound] || '#888')}
                        fillOpacity={comparing ? 0.9 : (entry.isPB ? 1 : 0.6)}
                        stroke={entry.isPB && !comparing ? '#00C853' : 'none'}
                        strokeWidth={entry.isPB && !comparing ? 2 : 0}
                      />
                    ))}
                  </Bar>
                  {comparing && (
                    <Bar dataKey="timeB" name={nameB} radius={[2, 2, 0, 0]} barSize={5} fill={DRIVER_B_COLOR} fillOpacity={0.9} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              {scPeriods.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: NEUTRAL_COLOR, opacity: 0.4, border: `1px solid ${NEUTRAL_COLOR}`, display: 'inline-block' }} />
                  {t('scPeriodNote')}
                </div>
              )}
              {pitLaps.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ color: '#8A8AFF' }}>🔧</span>
                  {t('pitInLabel')} · {pitLaps.map((l: number) => t('lapN', { n: l })).join(', ')}
                </div>
              )}

              {/* Stint Summary */}
              <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginRight: 8, alignSelf: 'center' }}>
                  {t('tyreLegend')}
                </div>
                {Object.entries(TIRE_COLORS).map(([compound, color]) => (
                  <div key={compound} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    {compound}
                  </div>
                ))}
              </div>

              {/* Sector Times Table */}
              {lapData.length > 0 && (
                <div style={{ marginTop: 24, overflowX: 'auto' }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--font-display)' }}>
                    {t('sectorTimes')}
                  </h4>
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>{UI_LABELS.lap}</th>
                        <th>{t('tyre')}</th>
                        <th>S1</th>
                        <th>S2</th>
                        <th>S3</th>
                        <th>{UI_LABELS.lapTime}</th>
                        {comparing && <th>Δ</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((l: any) => {
                        const rowBg = l.isPB ? 'rgba(0,200,83,0.08)' : (l.neutral ? 'rgba(255,176,32,0.08)' : undefined);
                        const aFaster = l.time > 0 && l.timeB > 0 && l.time <= l.timeB;
                        const bFaster = l.time > 0 && l.timeB > 0 && l.timeB < l.time;
                        const delta = (l.time > 0 && l.timeB > 0) ? l.time - l.timeB : null;
                        return (
                          <tr key={l.lap} style={{ background: rowBg }}>
                            <td style={{ fontWeight: 600 }}>
                              {l.lap}
                              {l.neutral && (
                                <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 800, background: NEUTRAL_COLOR, color: '#000' }}>
                                  {l.neutral}
                                </span>
                              )}
                              {(l.pitIn || l.pitOut) && (
                                <span title={l.pitIn ? t('pitInLabel') : t('pitOutLabel')} style={{ marginLeft: 6, fontSize: 11 }}>
                                  🔧{l.pitOut && !l.pitIn ? '↑' : ''}
                                </span>
                              )}
                              {comparing && (l.pitInB || l.pitOutB) && (
                                <span title={`${nameB} · ${l.pitInB ? t('pitInLabel') : t('pitOutLabel')}`} style={{ marginLeft: 4, fontSize: 11, color: DRIVER_B_COLOR }}>
                                  🔧{l.pitOutB && !l.pitInB ? '↑' : ''}
                                </span>
                              )}
                            </td>
                            {comparing ? (
                              <>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                                    {tyreBadge(l.compound)}
                                    {tyreBadge(l.compoundB)}
                                  </div>
                                </td>
                                {cmpSectorCell(l.s1, l.s1B)}
                                {cmpSectorCell(l.s2, l.s2B)}
                                {cmpSectorCell(l.s3, l.s3B)}
                                <td style={{ lineHeight: 1.4 }}>
                                  <div style={{ color: DRIVER_A_COLOR, fontWeight: aFaster ? 800 : 600 }}>{formatLapTime(l.time)}</div>
                                  <div style={{ color: DRIVER_B_COLOR, fontWeight: bFaster ? 800 : 600 }}>{formatLapTime(l.timeB)}</div>
                                </td>
                                <td style={{ fontWeight: 700, color: delta == null ? 'var(--text-muted)' : (delta <= 0 ? '#00C853' : '#E10600') }}>
                                  {delta == null ? '-' : (delta >= 0 ? '+' : '') + delta.toFixed(3)}
                                </td>
                              </>
                            ) : (
                              <>
                                <td>{tyreBadge(l.compound)}</td>
                                <td style={{ color: '#FFD700' }}>{l.s1 ? l.s1.toFixed(3) : '-'}</td>
                                <td style={{ color: '#00C853' }}>{l.s2 ? l.s2.toFixed(3) : '-'}</td>
                                <td style={{ color: '#0091FF' }}>{l.s3 ? l.s3.toFixed(3) : '-'}</td>
                                <td style={{ fontWeight: 700 }}>{formatLapTime(l.time)}</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* No data fallback */}
          {!speedData.length && !lapData.length && (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                {t('noTelForDriver')}
              </p>
            </div>
          )}
        </>
      )}

      {!selectedRound && !telLoading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏎️</div>
          <h3 style={{ fontSize: 18, marginBottom: 8, fontFamily: 'var(--font-display)' }}>{t('telemetryAnalysis')}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {t('telemetryPrompt')}
          </p>
        </div>
      )}
    </div>
  );
}

export default Telemetry;
