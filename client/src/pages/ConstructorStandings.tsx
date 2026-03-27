import { useApi } from '../hooks/useApi';
import { getConstructorStandings } from '../services/api';
import { getTeamNameKR, getTeamColor, UI_LABELS } from '../constants/koreanTerms';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props { year: number; }

export default function ConstructorStandings({ year }: Props) {
  const { data, loading, error, refetch } = useApi((signal) => getConstructorStandings(year, signal), [year]);


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
  const chartData = standings.map((s: any) => ({
    name: getTeamNameKR(s.constructor.name),
    points: s.points,
    color: getTeamColor(s.constructor.name),
  }));

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">🏎️ {UI_LABELS.constructorStandings}</h2>
        <p className="page-subtitle">{year} 시즌 · 라운드 {data?.round || '-'}</p>
      </div>

      {/* Points Horizontal Bar Chart */}
      <div className="card fade-in fade-in-delay-1" style={{ marginBottom: 20 }}>
        <div className="card-title">{UI_LABELS.team} {UI_LABELS.points} 비교</div>
        <div className="chart-container" style={{ height: 400 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, bottom: 10, left: 100 }}>
              <XAxis type="number" tick={{ fill: '#5c5c72', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9494a8', fontSize: 12 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip
                contentStyle={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13 }}
                formatter={(value) => [`${value} ${UI_LABELS.points}`, '']}
              />
              <Bar dataKey="points" radius={[0, 6, 6, 0]} maxBarSize={32}>
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
        <div className="card-title">전체 컨스트럭터 스탠딩</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>{UI_LABELS.position}</th>
              <th>{UI_LABELS.team}</th>
              <th style={{ textAlign: 'center' }}>{UI_LABELS.wins}</th>
              <th style={{ textAlign: 'right' }}>{UI_LABELS.points}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s: any) => (
              <tr key={s.constructor.id}>
                <td>
                  <span className={`position-badge position-${s.position <= 3 ? s.position : 'other'}`}>
                    {s.position}
                  </span>
                </td>
                <td>
                  <span className="team-indicator" style={{ backgroundColor: getTeamColor(s.constructor.name) }} />
                  <span className="driver-name">{getTeamNameKR(s.constructor.name)}</span>
                </td>
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
