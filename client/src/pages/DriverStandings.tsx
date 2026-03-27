import { useApi } from '../hooks/useApi';
import { getDriverStandings } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, UI_LABELS } from '../constants/koreanTerms';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props { year: number; }

export default function DriverStandings({ year }: Props) {
  const { data, loading, error, refetch } = useApi((signal) => getDriverStandings(year, signal), [year]);


  if (loading) return (
    <div className="page-container">
      <div className="loading-container"><div className="loading-spinner" /><div className="loading-text">{UI_LABELS.loading}</div></div>
    </div>
  );

  if (error) return (
    <div className="page-container">
      <div className="error-container">
        <div className="error-icon">⚠️</div>
        <div className="error-message">{error}</div>
        <button className="retry-btn" onClick={refetch}>다시 시도</button>
      </div>
    </div>
  );

  const standings = data?.standings || [];
  const chartData = standings.slice(0, 10).map((s: any) => ({
    name: s.driver.code,
    points: s.points,
    color: getTeamColor(s.constructor.name),
    fullName: getDriverNameKR(s.driver.id, `${s.driver.firstName} ${s.driver.lastName}`),
    team: getTeamNameKR(s.constructor.name),
  }));

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">🏆 {UI_LABELS.driverStandings}</h2>
        <p className="page-subtitle">{year} 시즌 · 라운드 {data?.round || '-'}</p>
      </div>

      {/* Points Bar Chart */}
      <div className="card fade-in fade-in-delay-1" style={{ marginBottom: 20 }}>
        <div className="card-title">{UI_LABELS.points} 분포 (TOP 10)</div>
        <div className="chart-container" style={{ height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <XAxis dataKey="name" tick={{ fill: '#9494a8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5c5c72', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: '#f0f0f5', fontWeight: 600 }}
                formatter={(value, _, props) => [`${value} ${UI_LABELS.points}`, (props as any).payload.fullName]}
                labelFormatter={(label) => chartData.find((d: any) => d.name === label)?.team || String(label)}
              />
              <Bar dataKey="points" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {chartData.map((entry: any, index: number) => (
                  <Cell key={index} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full Standings Table */}
      <div className="card fade-in fade-in-delay-2">
        <div className="card-title">전체 드라이버 스탠딩</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>{UI_LABELS.position}</th>
              <th>{UI_LABELS.driver}</th>
              <th>{UI_LABELS.team}</th>
              <th style={{ textAlign: 'center' }}>{UI_LABELS.wins}</th>
              <th style={{ textAlign: 'right' }}>{UI_LABELS.points}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s: any) => (
              <tr key={s.driver.id}>
                <td>
                  <span className={`position-badge position-${s.position <= 3 ? s.position : 'other'}`}>
                    {s.position}
                  </span>
                </td>
                <td>
                  <span className="team-indicator" style={{ backgroundColor: getTeamColor(s.constructor.name) }} />
                  <span className="driver-name">{getDriverNameKR(s.driver.id, `${s.driver.firstName} ${s.driver.lastName}`)}</span>
                  <span className="driver-code" style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{s.driver.code}</span>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{getTeamNameKR(s.constructor.name)}</td>
                <td style={{ textAlign: 'center' }}>{s.wins}</td>
                <td style={{ textAlign: 'right' }}><span className="points-value">{s.points}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
