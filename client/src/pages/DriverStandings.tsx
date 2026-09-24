import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getDriverStandingsHistory } from '../services/api';
import { getTeamNameKR, getDriverNameKR, getTeamColor, UI_LABELS } from '../constants/koreanTerms';
import StandingsPositionChart from '../components/StandingsPositionChart';
import PosDelta from '../components/PosDelta';
import PageMasthead from '../components/PageMasthead';
import StateBlock from '../components/StateBlock';
import ErrorBanner from '../components/ErrorBanner';
import { SkeletonRegion, SkeletonMasthead, SkeletonTable, SkeletonChart } from '../components/Skeleton';
import useDeferredLoading from '../hooks/useDeferredLoading';
import { useT } from '../i18n';

interface Props { year: number; }

export default function DriverStandings({ year }: Props) {
  const t = useT();
  const { data, loading, error, refetch, failures } = useApi((signal) => getDriverStandingsHistory(year, signal), [year]);
  const showSkeleton = useDeferredLoading(loading);
  // Which table row the pointer (or keyboard focus) is on; the chart dims every
  // other line so this one can actually be followed.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  if (loading) return (
    <div className="page-container">
      {showSkeleton && (
        <SkeletonRegion>
          <SkeletonMasthead />
          <div className="split-2">
            <SkeletonTable rows={12} columns={5} />
            <SkeletonChart />
          </div>
        </SkeletonRegion>
      )}
    </div>
  );

  if (error) return (
    <div className="page-container">
      <ErrorBanner detail={error} onRetry={refetch} attempts={failures} />
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

  // Before the first round there is no order to show: the table keeps the entry
  // list, every position reads "–", and the chart is replaced by a state block
  // rather than an empty axis.
  const preSeason = history.length === 0;

  return (
    <div className="page-container">
      <PageMasthead
        kicker={
          preSeason
            ? t('mhPreSeason', { year })
            : t('seasonRound', { year, round: data?.round || '-' })
        }
        title={UI_LABELS.driverStandings}
        subtitle={preSeason ? t('mhPreSeasonSub') : 'Driver Standings'}
      />

      <div className="split-2 fade-in">
        {/* Full standings table */}
        <div>
          <div className="section-label">
            <span className="k">{t('fullDriverStandings')}</span>
          </div>
          <table className="data-table">
          <thead>
            <tr>
              <th>{UI_LABELS.position}</th>
              <th>{UI_LABELS.driver}</th>
              <th className="col-team">{UI_LABELS.team}</th>
              <th className="col-points" style={{ textAlign: 'right' }}>{t('thThisGain')}</th>
              <th className="col-points" style={{ textAlign: 'right' }}>{t('thCurrentPoints')}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s: any) => (
              <tr
                key={s.driver.id}
                className={`linked-row ${highlightId === s.driver.id ? 'is-linked' : ''}`}
                tabIndex={0}
                onMouseEnter={() => setHighlightId(s.driver.id)}
                onMouseLeave={() => setHighlightId((h) => (h === s.driver.id ? null : h))}
                onFocus={() => setHighlightId(s.driver.id)}
                onBlur={() => setHighlightId((h) => (h === s.driver.id ? null : h))}
              >
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {preSeason ? (
                      <span className="position-badge position-other">–</span>
                    ) : (
                      <span className={`position-badge position-${s.position <= 3 ? s.position : 'other'}`}>
                        {s.position}
                      </span>
                    )}
                    <span style={{ width: 30 }}>
                      {!preSeason && <PosDelta delta={s.positionDelta} />}
                    </span>
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
                <td className="col-points" style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 700 }}>+{s.racePoints}</span>
                  {hasSprint && s.sprintPoints > 0 && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--status-fastest-lap)' }}>{t('sprintGain', { n: s.sprintPoints })}</span>
                  )}
                </td>
                <td className="col-points" style={{ textAlign: 'right' }}><span className="points-value">{s.points}</span></td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>

        {/* Championship position over rounds */}
        <div>
          <div className="section-label">
            <span className="k">{t('posChangeByRound')}</span>
            {!preSeason && history.length > 0 && (
              <span className="en">R{history[0].round} → R{history[history.length - 1].round}</span>
            )}
          </div>
          {preSeason ? (
            <StateBlock
              title={t('emptyChartTitle')}
              reason={t('emptyChartReason')}
              actions={[{ label: UI_LABELS.raceSchedule, href: '#/schedule' }]}
            />
          ) : (
            <StandingsPositionChart history={history} items={chartItems} showTooltip={false} highlightId={highlightId} />
          )}
          <div className="en" style={{ marginTop: 8 }}>{t('chartTeammateDashed')}</div>
        </div>
      </div>
    </div>
  );
}
