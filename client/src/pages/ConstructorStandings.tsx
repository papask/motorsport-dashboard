import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getConstructorStandingsHistory } from '../services/api';
import { getTeamNameKR, getTeamColor, UI_LABELS } from '../constants/koreanTerms';
import StandingsPositionChart from '../components/StandingsPositionChart';
import PosDelta from '../components/PosDelta';
import PageMasthead from '../components/PageMasthead';
import StateBlock from '../components/StateBlock';
import ErrorBanner from '../components/ErrorBanner';
import { SkeletonRegion, SkeletonMasthead, SkeletonTable, SkeletonChart } from '../components/Skeleton';
import useDeferredLoading from '../hooks/useDeferredLoading';
import useIsMobile from '../hooks/useIsMobile';
import AdSlot from '../components/AdSlot';
import { useT } from '../i18n';

interface Props { year: number; }

export default function ConstructorStandings({ year }: Props) {
  const t = useT();
  const { data, loading, error, refetch, failures } = useApi((signal) => getConstructorStandingsHistory(year, signal), [year]);
  const showSkeleton = useDeferredLoading(loading);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Matches the .split-2 breakpoint where the two columns stack.
  const stacked = useIsMobile(900);

  if (loading) return (
    <div className="page-container">
      {showSkeleton && (
        <SkeletonRegion>
          <SkeletonMasthead />
          <div className="split-2">
            <SkeletonTable rows={11} columns={5} />
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

  const chartItems = standings.map((s: any) => ({
    id: s.constructor.id,
    code: getTeamNameKR(s.constructor.name),
    color: getTeamColor(s.constructor.name),
  }));

  const preSeason = history.length === 0;
  // Bars are read against the leader, so the top team fills the track.
  const maxPoints = standings.reduce((m: number, s: any) => Math.max(m, s.points), 0) || 1;

  return (
    <div className="page-container">
      <PageMasthead
        kicker={
          preSeason
            ? t('mhPreSeason', { year })
            : t('seasonRound', { year, round: data?.round || '-' })
        }
        title={UI_LABELS.constructorStandings}
        subtitle={preSeason ? t('mhPreSeasonSub') : 'Constructor Standings'}
      />

      <div className="split-2 fade-in">
        <div>
          <div className="section-label">
            <span className="k">{t('fullConstructorStandings')}</span>
          </div>
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{UI_LABELS.position}</th>
                <th>{UI_LABELS.team}</th>
                <th className="col-detail" style={{ width: '28%' }}>{UI_LABELS.points}</th>
                <th className="col-points" style={{ textAlign: 'right' }}>{t('thThisGain')}</th>
                <th className="col-points" style={{ textAlign: 'right' }}>{t('thCurrentPoints')}</th>
              </tr>
            </thead>
            <tbody>
            {standings.map((s: any) => (
              <tr
                key={s.constructor.id}
                className={`linked-row ${highlightId === s.constructor.id ? 'is-linked' : ''}`}
                tabIndex={0}
                onMouseEnter={() => setHighlightId(s.constructor.id)}
                onMouseLeave={() => setHighlightId((h) => (h === s.constructor.id ? null : h))}
                onFocus={() => setHighlightId(s.constructor.id)}
                onBlur={() => setHighlightId((h) => (h === s.constructor.id ? null : h))}
              >
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
                  <span className="driver-name">{getTeamNameKR(s.constructor.name)}</span>
                  <span className="driver-points-sub">
                    <span>{t('subPrev', { n: s.prevPoints })}</span>
                    <span className="gain">{t('subGain', { n: s.racePoints })}{hasSprint && s.sprintPoints > 0 ? ` (🏁+${s.sprintPoints})` : ''}</span>
                    <span className="cur">{t('subCur', { n: s.points })}</span>
                  </span>
                </td>
                <td className="col-detail">
                  <span
                    className="points-bar"
                    style={{ width: `${Math.round((s.points / maxPoints) * 100)}%`, background: getTeamColor(s.constructor.name) }}
                    aria-hidden="true"
                  />
                </td>
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
        </div>

        {/* Stacked (≤900px): the ad sits between the table and the chart. */}
        {stacked && <AdSlot variant="display" />}

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
            <StandingsPositionChart history={history} items={chartItems} highlightId={highlightId} />
          )}
          {/* Two columns: the ad fills the free space under the chart. */}
          {!stacked && <div style={{ marginTop: 24 }}><AdSlot variant="display" /></div>}
        </div>
      </div>
    </div>
  );
}
