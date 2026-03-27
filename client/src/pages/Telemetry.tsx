import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { getSessions, getDriversBySession, getLaps } from '../services/api';
import { getSessionNameKR, UI_LABELS } from '../constants/koreanTerms';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props { year: number; }

export default function Telemetry({ year }: Props) {
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);

  const sessions = useApi((signal) => getSessions(year, signal), [year]);
  const drivers = useApi(
    (signal) => selectedSession ? getDriversBySession(selectedSession, signal) : Promise.resolve([]),
    [selectedSession]
  );
  const laps = useApi(
    (signal) => (selectedSession && selectedDriver) ? getLaps(selectedSession, selectedDriver, signal) : Promise.resolve([]),
    [selectedSession, selectedDriver]
  );


  // Filter to race sessions for cleaner UX
  const raceSessions = (sessions.data || []).filter((s: any) =>
    s.sessionType === 'Race' || s.sessionType === 'Qualifying' || s.sessionType === 'Sprint'
  );

  // Reset driver when session changes
  useEffect(() => {
    setSelectedDriver(null);
  }, [selectedSession]);

  const lapData = (laps.data || [])
    .filter((l: any) => l.lapDuration && l.lapDuration > 0 && !l.isPitOutLap)
    .map((l: any) => ({
      lap: l.lapNumber,
      time: parseFloat(l.lapDuration?.toFixed(3)),
      s1: parseFloat(l.durationSector1?.toFixed(3)),
      s2: parseFloat(l.durationSector2?.toFixed(3)),
      s3: parseFloat(l.durationSector3?.toFixed(3)),
    }));

  const selectedDriverInfo = (drivers.data || []).find((d: any) => d.driverNumber === selectedDriver);

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">📊 {UI_LABELS.telemetry}</h2>
        <p className="page-subtitle">{year} 시즌 · 랩타임 분석 및 텔레메트리 데이터</p>
      </div>

      <div className="selector-group fade-in fade-in-delay-1">
        <select
          className="selector"
          value={selectedSession || ''}
          onChange={(e) => setSelectedSession(Number(e.target.value))}
        >
          <option value="" disabled>세션 선택</option>
          {raceSessions.map((s: any) => (
            <option key={s.sessionKey} value={s.sessionKey}>
              {s.countryName} - {getSessionNameKR(s.sessionName)} ({s.circuitShortName})
            </option>
          ))}
        </select>

        {selectedSession && (
          <select
            className="selector"
            value={selectedDriver || ''}
            onChange={(e) => setSelectedDriver(Number(e.target.value))}
          >
            <option value="" disabled>드라이버 선택</option>
            {(drivers.data || []).map((d: any) => (
              <option key={d.driverNumber} value={d.driverNumber}>
                #{d.driverNumber} {d.broadcastName} ({d.teamName})
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedSession && selectedDriver && laps.loading ? (
        <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{UI_LABELS.loading}</div></div>
      ) : selectedSession && selectedDriver && lapData.length > 0 ? (
        <>
          {/* Driver Header */}
          {selectedDriverInfo && (
            <div className="card fade-in" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: `#${selectedDriverInfo.teamColour || '888'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: '#000',
                }}
              >
                {selectedDriverInfo.driverNumber}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>
                  {selectedDriverInfo.fullName || selectedDriverInfo.broadcastName}
                </div>
                <div style={{ fontSize: 13, color: `#${selectedDriverInfo.teamColour || '888'}` }}>
                  {selectedDriverInfo.teamName}
                </div>
              </div>
            </div>
          )}

          {/* Lap Time Chart */}
          <div className="card fade-in fade-in-delay-1" style={{ marginBottom: 20 }}>
            <div className="card-title">⏱️ {UI_LABELS.lapTime} 추이</div>
            <div className="chart-container" style={{ height: 350 }}>
              <ResponsiveContainer>
                <LineChart data={lapData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="lap"
                    tick={{ fill: '#9494a8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: UI_LABELS.lap, fill: '#5c5c72', fontSize: 11, position: 'insideBottomRight', offset: -5 }}
                  />
                  <YAxis
                    tick={{ fill: '#5c5c72', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    label={{ value: '초', fill: '#5c5c72', fontSize: 11, angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13 }}
                    labelFormatter={(label) => `랩 ${label}`}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { time: UI_LABELS.lapTime, s1: '섹터 1', s2: '섹터 2', s3: '섹터 3' };
                      return [`${value}초`, labels[String(name)] || String(name)];
                    }}
                  />
                  <Line type="monotone" dataKey="time" stroke="#e10600" strokeWidth={2} dot={false} name="time" />
                  <Line type="monotone" dataKey="s1" stroke="#3671C6" strokeWidth={1.5} dot={false} name="s1" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="s2" stroke="#FF8000" strokeWidth={1.5} dot={false} name="s2" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="s3" stroke="#27F4D2" strokeWidth={1.5} dot={false} name="s3" strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lap Data Table */}
          <div className="card fade-in fade-in-delay-2">
            <div className="card-title">📋 {UI_LABELS.lap}별 상세 데이터</div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{UI_LABELS.lap}</th>
                    <th>{UI_LABELS.lapTime}</th>
                    <th>{UI_LABELS.sector} 1</th>
                    <th>{UI_LABELS.sector} 2</th>
                    <th>{UI_LABELS.sector} 3</th>
                  </tr>
                </thead>
                <tbody>
                  {lapData.map((l: any) => (
                    <tr key={l.lap}>
                      <td style={{ fontWeight: 600 }}>{l.lap}</td>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{l.time?.toFixed(3)}s</td>
                      <td style={{ color: '#3671C6' }}>{l.s1?.toFixed(3)}s</td>
                      <td style={{ color: '#FF8000' }}>{l.s2?.toFixed(3)}s</td>
                      <td style={{ color: '#27F4D2' }}>{l.s3?.toFixed(3)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : !selectedSession ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ color: 'var(--text-secondary)' }}>세션과 드라이버를 선택하여 텔레메트리 데이터를 확인하세요</div>
        </div>
      ) : selectedSession && !selectedDriver ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏎️</div>
          <div style={{ color: 'var(--text-secondary)' }}>드라이버를 선택하세요</div>
        </div>
      ) : null}
    </div>
  );
}
