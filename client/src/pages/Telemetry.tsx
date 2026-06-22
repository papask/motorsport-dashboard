import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule, getTelemetryDrivers, getDriverTelemetry } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getCountryNameKR, UI_LABELS } from '../constants/koreanTerms';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, Area, AreaChart, ComposedChart, ReferenceLine } from 'recharts';

interface Props { year: number; }

const TIRE_COLORS: Record<string, string> = {
  'SOFT': '#E10600',
  'MEDIUM': '#FFD700',
  'HARD': '#FFFFFF',
  'INTERMEDIATE': '#00C853',
  'WET': '#0091FF',
};

function Telemetry({ year }: Props) {
  const { data: schedule, loading: schedLoading } = useApi(
    (signal) => getSeasonSchedule(year, signal), [year]
  );
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'speed' | 'inputs' | 'laps'>('speed');

  // Load drivers for the selected round
  const { data: driversData, loading: driversLoading } = useApi(
    (signal) => selectedRound ? getTelemetryDrivers(year, selectedRound, signal) : Promise.resolve(null),
    [year, selectedRound]
  );

  // Load telemetry for the selected driver
  const { data: telemetryData, loading: telLoading, error: telError } = useApi(
    (signal) => (selectedRound && selectedDriver) 
      ? getDriverTelemetry(year, selectedRound, selectedDriver, signal) 
      : Promise.resolve(null),
    [year, selectedRound, selectedDriver]
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

  // Auto-select first driver
  useEffect(() => {
    if (driversData?.drivers?.length && !selectedDriver) {
      setSelectedDriver(driversData.drivers[0].number);
    }
  }, [driversData]);

  // Reset driver when round changes
  useEffect(() => {
    setSelectedDriver(null);
  }, [selectedRound]);

  const drivers = driversData?.drivers || [];
  const currentDriver = drivers.find((d: any) => d.number === selectedDriver);

  // Prepare telemetry chart data
  const speedData = useMemo(() => {
    if (!telemetryData?.telemetry) return [];
    return telemetryData.telemetry.map((t: any) => ({
      distance: Math.round(t.distance),
      speed: t.speed,
      throttle: t.throttle,
      brake: t.brake ? 100 : 0,
      gear: t.gear,
      rpm: t.rpm,
      drs: t.drs >= 10 ? 1 : 0,
    }));
  }, [telemetryData]);

  // Lap time chart data
  const lapData = useMemo(() => {
    if (!telemetryData?.laps) return [];
    return telemetryData.laps
      .filter((l: any) => l.lapTime != null && l.lapTime > 0 && l.lapTime < 300)
      .map((l: any) => ({
        lap: l.lapNumber,
        time: l.lapTime,
        s1: l.sector1,
        s2: l.sector2,
        s3: l.sector3,
        compound: l.compound,
        tyreLife: l.tyreLife,
        stint: l.stint,
        isPB: l.isPersonalBest,
      }));
  }, [telemetryData]);

  const avgLapTime = useMemo(() => {
    if (!lapData.length) return 0;
    return lapData.reduce((s: number, l: any) => s + l.time, 0) / lapData.length;
  }, [lapData]);

  const fastestLap = useMemo(() => {
    if (!lapData.length) return null;
    return lapData.reduce((min: any, l: any) => (!min || l.time < min.time) ? l : min, null);
  }, [lapData]);

  const formatLapTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return mins > 0 ? `${mins}:${parseFloat(secs) < 10 ? '0' : ''}${secs}` : `${secs}`;
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
        <h2>🏎️ 텔레메트리</h2>
        <p className="page-subtitle">FastF1 데이터 기반 차량 텔레메트리 분석</p>
      </div>

      {/* Race & Driver Selector */}
      <div className="telemetry-selectors" style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
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

        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="selector-label">드라이버 선택</label>
          {driversLoading ? (
            <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 13 }}>로딩 중...</div>
          ) : (
            <select
              className="season-select"
              value={selectedDriver || ''}
              onChange={(e) => setSelectedDriver(Number(e.target.value))}
              style={{ width: '100%' }}
            >
              <option value="">드라이버를 선택하세요</option>
              {drivers.map((d: any) => (
                <option key={d.number} value={d.number}>
                  #{d.number} {getDriverNameKR(d.code) || `${d.firstName} ${d.lastName}`} ({getTeamNameKR(d.team) || d.team})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      {telLoading && (
        <div className="loading-spinner">
          <div className="spinner-ring" />
          <p>텔레메트리 데이터 로딩 중... (첫 요청 시 1-2분 소요될 수 있습니다)</p>
        </div>
      )}

      {telError && (
        <div className="card" style={{ borderColor: 'var(--accent-red)', padding: 24 }}>
          <p style={{ color: 'var(--accent-red)' }}>⚠️ {telError}</p>
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
                  {telemetryData.laps?.length ? ` • ${telemetryData.laps.length} 랩` : ''}
                  {fastestLap ? ` • 최빠른 랩: ${formatLapTime(fastestLap.time)}` : ''}
                </div>
              </div>
            </div>
          )}

          {/* Tab Selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {([
              { key: 'speed', label: '속도 & RPM', icon: '⚡' },
              { key: 'inputs', label: '드라이버 입력', icon: '🎮' },
              { key: 'laps', label: '랩 타임', icon: '⏱️' },
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

          {/* Speed & RPM Tab */}
          {activeTab === 'speed' && speedData.length > 0 && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🏎️ 속도 (최빠른 랩)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={speedData}>
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
                    formatter={(value: any) => [`${Math.round(value)} km/h`, '속도']}
                    labelFormatter={(v) => `거리: ${v}m`}
                  />
                  <Area type="monotone" dataKey="speed" stroke="#E10600" fill="url(#speedGrad)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>

              <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                ⚙️ RPM
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={speedData}>
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
                    formatter={(value: any) => [`${Math.round(value)}`, 'RPM']}
                  />
                  <Area type="monotone" dataKey="rpm" stroke="#FFD700" fill="url(#rpmGrad)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>

              <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🔧 기어
              </h3>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={speedData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="distance" tick={{ fill: '#6a6a7d', fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                  <YAxis tick={{ fill: '#6a6a7d', fontSize: 10 }} domain={[0, 8]} ticks={[1,2,3,4,5,6,7,8]} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any) => [`${value}단`, '기어']}
                  />
                  <Line type="stepAfter" dataKey="gear" stroke="#00C853" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Driver Inputs Tab */}
          {activeTab === 'inputs' && speedData.length > 0 && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🟢 스로틀
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={speedData}>
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
                    formatter={(value: any) => [`${Math.round(value)}%`, '스로틀']}
                  />
                  <Area type="monotone" dataKey="throttle" stroke="#00C853" fill="url(#throttleGrad)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>

              <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🔴 브레이크
              </h3>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={speedData}>
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
                    formatter={(value: any) => [value > 0 ? 'ON' : 'OFF', '브레이크']}
                  />
                  <Area type="stepAfter" dataKey="brake" stroke="#E10600" fill="url(#brakeGrad)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>

              <h3 style={{ margin: '32px 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                🟦 DRS
              </h3>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={speedData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="distance" tick={{ fill: '#6a6a7d', fontSize: 10 }} tickFormatter={(v) => `${v}m`} />
                  <YAxis tick={{ fill: '#6a6a7d', fontSize: 10 }} domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => v ? 'ON' : 'OFF'} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any) => [value > 0 ? 'ON' : 'OFF', 'DRS']}
                  />
                  <Area type="stepAfter" dataKey="drs" stroke="#0091FF" fill="rgba(0,145,255,0.2)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Lap Times Tab */}
          {activeTab === 'laps' && lapData.length > 0 && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                ⏱️ 랩 타임
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={lapData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="lap" tick={{ fill: '#6a6a7d', fontSize: 10 }} label={{ value: '랩', fill: '#6a6a7d', fontSize: 11, position: 'insideBottom', offset: -5 }} />
                  <YAxis
                    tick={{ fill: '#6a6a7d', fontSize: 10 }}
                    domain={[
                      (dataMin: number) => Math.floor(dataMin - 2),
                      (dataMax: number) => Math.ceil(dataMax + 2),
                    ]}
                    tickFormatter={formatLapTime}
                  />
                  {avgLapTime > 0 && (
                    <ReferenceLine y={avgLapTime} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" label={{ value: '평균', fill: '#6a6a7d', fontSize: 10 }} />
                  )}
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, name: string) => {
                      if (name === 'time') return [formatLapTime(value), '랩 타임'];
                      return [formatLapTime(value), name];
                    }}
                    labelFormatter={(v) => `랩 ${v}`}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div style={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>랩 {label}</div>
                          <div>랩 타임: <b>{formatLapTime(d.time)}</b></div>
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
                              {d.compound} (수명: {d.tyreLife}랩)
                            </div>
                          )}
                          {d.isPB && <div style={{ color: '#00C853', marginTop: 2 }}>🟢 개인 최고 기록</div>}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="time" radius={[2, 2, 0, 0]} barSize={6}>
                    {lapData.map((entry: any, idx: number) => (
                      <Cell
                        key={idx}
                        fill={TIRE_COLORS[entry.compound] || '#888'}
                        fillOpacity={entry.isPB ? 1 : 0.6}
                        stroke={entry.isPB ? '#00C853' : 'none'}
                        strokeWidth={entry.isPB ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>

              {/* Stint Summary */}
              <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginRight: 8, alignSelf: 'center' }}>
                  타이어 범례:
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
                    섹터 타임
                  </h4>
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>랩</th>
                        <th>타이어</th>
                        <th>S1</th>
                        <th>S2</th>
                        <th>S3</th>
                        <th>랩 타임</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lapData.slice(0, 20).map((l: any) => (
                        <tr key={l.lap} style={{ background: l.isPB ? 'rgba(0,200,83,0.08)' : undefined }}>
                          <td style={{ fontWeight: 600 }}>{l.lap}</td>
                          <td>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 22, height: 22, borderRadius: '50%',
                              background: TIRE_COLORS[l.compound] || '#888',
                              color: '#000', fontWeight: 800, fontSize: 10,
                            }}>
                              {l.compound?.charAt(0) || '?'}
                            </span>
                          </td>
                          <td style={{ color: '#FFD700' }}>{l.s1 ? l.s1.toFixed(3) : '-'}</td>
                          <td style={{ color: '#00C853' }}>{l.s2 ? l.s2.toFixed(3) : '-'}</td>
                          <td style={{ color: '#0091FF' }}>{l.s3 ? l.s3.toFixed(3) : '-'}</td>
                          <td style={{ fontWeight: 700 }}>{formatLapTime(l.time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lapData.length > 20 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                      상위 20랩 표시 (전체 {lapData.length}랩)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No data fallback */}
          {!speedData.length && !lapData.length && (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                이 드라이버의 텔레메트리 데이터가 없습니다.
              </p>
            </div>
          )}
        </>
      )}

      {!selectedRound && !telLoading && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏎️</div>
          <h3 style={{ fontSize: 18, marginBottom: 8, fontFamily: 'var(--font-display)' }}>텔레메트리 분석</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            레이스와 드라이버를 선택하면 상세 텔레메트리 데이터를 확인할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}

export default Telemetry;
