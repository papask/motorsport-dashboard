import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';
import { t } from '../i18n';
import { UI_LABELS } from '../constants/koreanTerms';
import { chart, podium, text as textToken, tooltipSurface } from '../theme/tokens';

export interface HistoryRound {
  round: number;
  standings: { id: string; code: string; position: number; points: number }[];
}

export interface ChartItem {
  id: string;
  code: string;   // short label drawn at the line end
  color: string;
  dashed?: boolean; // second driver of a team → dashed, to tell teammates apart
  number?: number;  // driver number, appended to the end label as "(#N)"
}

interface Props {
  history: HistoryRound[];
  items: ChartItem[]; // ordered by current championship position
  showTooltip?: boolean;
  /**
   * Id of the row the pointer is on in the table beside the chart. That line is
   * drawn at full strength and thicker, every other one drops back — which is
   * the only way 22 overlapping lines become readable.
   */
  highlightId?: string | null;
}

function edgeLabel(props: any, text: string, targetIndex: number, side: 'start' | 'end', dimmed: boolean, bold: boolean) {
  const { x, y, index, value } = props;
  if (value == null || index !== targetIndex || x == null || y == null) return null;
  const isStart = side === 'start';
  return (
    <text x={x} y={y} dx={isStart ? -8 : 8} dy={4}
      fill={dimmed ? chart.seriesLabelDimmed : chart.seriesLabel}
      fontSize={10} fontWeight={bold ? 900 : 800}
      textAnchor={isStart ? 'end' : 'start'} fontFamily="var(--font-display)" style={{ pointerEvents: 'none' }}>
      {text}
    </text>
  );
}

function ChartTooltip({ active, payload, label, meta }: any) {
  if (!active || !payload?.length) return null;
  const rows = [...payload]
    .filter((p: any) => p.value != null)
    .sort((a: any, b: any) => a.value - b.value);
  const info = meta?.[label] || {};
  return (
    <div style={{ ...tooltipSurface, borderRadius: 10, padding: '10px 14px', maxHeight: 420, overflowY: 'auto', minWidth: 180 }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: textToken.tooltipHeading }}>{t('roundN', { n: label })}</div>
      {rows.map((r: any) => {
        const m = info[r.dataKey] || {};
        return (
          <div key={r.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
            <span style={{ width: 22, textAlign: 'right', fontWeight: 700, fontSize: 11, color: r.value <= 3 ? podium.p1 : textToken.secondary }}>P{r.value}</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.stroke, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: textToken.tooltipHeading, flex: 1 }}>{m.code || r.dataKey}</span>
            <span style={{ color: textToken.secondary }}>{m.points != null ? t('subPts', { n: m.points }) : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function StandingsPositionChart({ history, items, showTooltip = true, highlightId = null }: Props) {
  if (!history || history.length === 0 || items.length === 0) return null;

  const lastRound = history[history.length - 1].round;
  // Pivot: one row per round with each item's position; plus a meta map for the tooltip.
  const meta: Record<number, Record<string, { code: string; points: number }>> = {};
  const chartData = history.map((h) => {
    const row: any = { round: h.round };
    meta[h.round] = {};
    for (const s of h.standings) {
      row[s.id] = s.position;
      meta[h.round][s.id] = { code: s.code, points: s.points };
    }
    return row;
  });

  const rounds = history.map((h) => h.round);
  const maxPos = items.length;

  // On mobile the chart scrolls horizontally (see CSS); keep it at least 800px
  // wide, widening further with the number of rounds so the x-axis isn't cramped.
  const mobileMinWidth = Math.max(800, rounds.length * 44);

  // One sentence for screen readers: who moved where, and who moved most. The
  // hidden table below carries the detail, so the summary stays short.
  const first = history[0];
  const last = history[history.length - 1];
  const firstPos = new Map(first.standings.map((s) => [s.id, s.position]));
  const biggestMover = last.standings
    .map((s) => ({ code: s.code, diff: (firstPos.get(s.id) ?? s.position) - s.position }))
    .sort((a, b) => b.diff - a.diff)[0];
  const summary = t('srChartSummary', {
    from: first.round,
    to: last.round,
    n: items.length,
    mover: biggestMover && biggestMover.diff > 0 ? `${biggestMover.code} +${biggestMover.diff}` : '–',
  });

  return (
    <div
      className="chart-container"
      style={{ height: Math.max(420, items.length * 22), '--chart-min-width': `${mobileMinWidth}px` } as any}
      role="img"
      aria-label={summary}
      aria-describedby="standings-chart-table"
    >
      {/* The same data as a table, visually hidden: a line chart is unreadable
          to a screen reader, and the numbers are the point. */}
      <table id="standings-chart-table" className="sr-only">
        <caption>{summary}</caption>
        <thead>
          <tr>
            <th scope="col">{UI_LABELS.round}</th>
            {items.map((it) => (
              <th scope="col" key={it.id}>{it.code}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map((h) => {
            const byId = new Map(h.standings.map((s) => [s.id, s.position]));
            return (
              <tr key={h.round}>
                <th scope="row">{h.round}</th>
                {items.map((it) => (
                  <td key={it.id}>{byId.get(it.id) ?? '–'}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="chart-scroll-inner" aria-hidden="true">
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 16, right: 84, bottom: 16, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chart.gridline} />
          <XAxis dataKey="round" ticks={rounds} tick={{ fill: chart.axisTick, fontSize: 11 }} axisLine={false} tickLine={false}
            type="number" domain={[rounds[0], lastRound]} allowDecimals={false} padding={{ left: 64, right: 0 }}
            label={{ value: UI_LABELS.round, fill: chart.axisLabel, fontSize: 11, position: 'insideBottomRight', offset: -5 }} />
          <YAxis reversed domain={[0.5, maxPos + 0.5]} allowDecimals={false}
            ticks={Array.from({ length: maxPos }, (_, i) => i + 1)}
            tick={{ fill: chart.axisLabel, fontSize: 10 }} axisLine={false} tickLine={false} width={28}
            label={{ value: UI_LABELS.position, fill: chart.axisLabel, fontSize: 11, angle: -90, position: 'insideLeft' }} />
          {showTooltip && <Tooltip content={<ChartTooltip meta={meta} />} />}
          {items.map((it) => {
            const isHit = highlightId === it.id;
            const dimmed = highlightId != null && !isHit;
            const label = it.code + (it.number != null ? ` (#${it.number})` : '');
            return (
              <Line key={it.id} type="monotone" dataKey={it.id} stroke={it.color}
                strokeWidth={isHit ? 3.5 : 2}
                strokeOpacity={dimmed ? 0.2 : 1}
                strokeDasharray={it.dashed ? '5 5' : '0'}
                dot={dimmed ? false : { r: 2, fill: it.color }} connectNulls
                activeDot={{ r: 4, fill: it.color, stroke: chart.dotStroke, strokeWidth: 2 }} isAnimationActive={false}>
                <LabelList dataKey={it.id} content={(props) => edgeLabel(props, label, 0, 'start', dimmed, isHit)} />
                <LabelList dataKey={it.id} content={(props) => edgeLabel(props, label, chartData.length - 1, 'end', dimmed, isHit)} />
              </Line>
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
