import { useApi } from '../hooks/useApi';
import { getDriverStandingsHistory } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, UI_LABELS } from '../constants/koreanTerms';
import StandingsPositionChart from '../components/StandingsPositionChart';
import PosDelta from '../components/PosDelta';
import CollapsibleCard from '../components/CollapsibleCard';
import { useT } from '../i18n';

interface Props { year: number; }

export default function DriverStandings({ year }: Props) {
  const t = useT();
  const { data, loading, error, refetch } = useApi((signal) => getDriverStandingsHistory(year, signal), [year]);

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
        <button className="retry-btn" onClick={refetch}>{t('retry')}</button>
      </div>
    </div>
  );

  const standings = data?.standings || [];
  const history = data?.history || [];
  const hasSprint = !!data?.hasSprint;

  // Within a team, the first driver (by standings order) stays solid and the
  // second becomes dashed so teammates sharing a colour are distinguishable.
  const teamSeen: Record<string, number> = {};
  const chartItems = standings.map((s: any) => {
    const seen = teamSeen[s.constructor.name] || 0;
    teamSeen[s.constructor.name] = seen + 1;
    return {
      id: s.driver.id,
      code: s.driver.code,
      color: getTeamColor(s.constructor.name),
      dashed: seen > 0,
      number: s.driver.number != null ? Number(s.driver.number) : undefined,
    };
  });

  return (
    <div className="page-container">
      <div className="page-header fade-in">
        <h2 className="page-title">🏆 {UI_LABELS.driverStandings}</h2>
        <p className="page-subtitle">{t('seasonRound', { year, round: data?.round || '-' })}</p>
      </div>

      {/* Championship position over rounds */}
      <CollapsibleCard title={t('posChangeByRound')} className="fade-in fade-in-delay-1" style={{ marginBottom: 20 }}>
        <StandingsPositionChart history={history} items={chartItems} showTooltip={false} />
      </CollapsibleCard>

      {/* Full Standings Table */}
      <div className="card fade-in fade-in-delay-2">
        <div className="card-title">{t('fullDriverStandings')}</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>{UI_LABELS.position}</th>
              <th>{UI_LABELS.driver}</th>
              <th className="col-team">{UI_LABELS.team}</th>
              <th className="col-points" style={{ textAlign: 'right' }}>{t('thBeforeRace')}</th>
              <th className="col-points" style={{ textAlign: 'right' }}>{t('thThisGain')}</th>
              <th className="col-points" style={{ textAlign: 'right' }}>{t('thCurrentPoints')}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s: any) => (
              <tr key={s.driver.id}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span className={`position-badge position-${s.position <= 3 ? s.position : 'other'}`}>
                      {s.position}
                    </span>
                    <span style={{ width: 30 }}><PosDelta delta={s.positionDelta} /></span>
                  </span>
                </td>
                <td>
                  <span className="team-indicator" style={{ backgroundColor: getTeamColor(s.constructor.name) }} />
                  <span className="driver-name">{getDriverNameKR(s.driver.id, `${s.driver.firstName} ${s.driver.lastName}`)}</span>
                  <span className="driver-code" style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{s.driver.code}</span>
                  <span className="driver-team-sub">{getTeamNameKR(s.constructor.name)}</span>
                  <span className="driver-points-sub">
                    <span>{t('subPrev', { n: s.prevPoints })}</span>
                    <span className="gain">{t('subGain', { n: s.racePoints })}{hasSprint && s.sprintPoints > 0 ? ` (🏁+${s.sprintPoints})` : ''}</span>
                    <span className="cur">{t('subCur', { n: s.points })}</span>
                  </span>
                </td>
                <td className="col-team" style={{ color: 'var(--text-secondary)' }}>{getTeamNameKR(s.constructor.name)}</td>
                <td className="col-points" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{s.prevPoints}</td>
                <td className="col-points" style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 700 }}>+{s.racePoints}</span>
                  {hasSprint && s.sprintPoints > 0 && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--accent-gold)' }}>{t('sprintGain', { n: s.sprintPoints })}</span>
                  )}
                </td>
                <td className="col-points" style={{ textAlign: 'right' }}><span className="points-value">{s.points}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
