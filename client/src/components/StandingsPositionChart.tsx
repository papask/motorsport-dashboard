import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';
import { t } from '../i18n';
import { UI_LABELS } from '../constants/koreanTerms';

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
}

function edgeLabel(props: any, text: string, targetIndex: number, side: 'start' | 'end') {
  const { x, y, index, value } = props;
  if (value == null || index !== targetIndex || x == null || y == null) return null;
  const isStart = side === 'start';
  return (
    <text x={x} y={y} dx={isStart ? -8 : 8} dy={4} fill="rgba(255,255,255,0.75)" fontSize={10} fontWeight={800}
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
    <div style={{ background: '#1a1a28', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px', maxHeight: 420, overflowY: 'auto', fontSize: 12, minWidth: 180 }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: '#f0f0f5' }}>{t('roundN', { n: label })}</div>
      {rows.map((r: any) => {
        const m = info[r.dataKey] || {};
        return (
          <div key={r.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
            <span style={{ width: 22, textAlign: 'right', fontWeight: 700, fontSize: 11, color: r.value <= 3 ? '#FFD700' : '#9494a8' }}>P{r.value}</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.stroke, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: '#f0f0f5', flex: 1 }}>{m.code || r.dataKey}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{m.points != null ? t('subPts', { n: m.points }) : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function StandingsPositionChart({ history, items, showTooltip = true }: Props) {
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

  return (
    <div
      className="chart-container"
      style={{ height: Math.max(420, items.length * 22), '--chart-min-width': `${mobileMinWidth}px` } as any}
    >
      <div className="chart-scroll-inner">
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 16, right: 84, bottom: 16, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="round" ticks={rounds} tick={{ fill: '#9494a8', fontSize: 11 }} axisLine={false} tickLine={false}
            type="number" domain={[rounds[0], lastRound]} allowDecimals={false} padding={{ left: 64, right: 0 }}
            label={{ value: UI_LABELS.round, fill: '#5c5c72', fontSize: 11, position: 'insideBottomRight', offset: -5 }} />
          <YAxis reversed domain={[0.5, maxPos + 0.5]} allowDecimals={false}
            ticks={Array.from({ length: maxPos }, (_, i) => i + 1)}
            tick={{ fill: '#5c5c72', fontSize: 10 }} axisLine={false} tickLine={false} width={28}
            label={{ value: UI_LABELS.position, fill: '#5c5c72', fontSize: 11, angle: -90, position: 'insideLeft' }} />
          {showTooltip && <Tooltip content={<ChartTooltip meta={meta} />} />}
          {items.map((it) => (
            <Line key={it.id} type="monotone" dataKey={it.id} stroke={it.color} strokeWidth={2}
              strokeDasharray={it.dashed ? '5 5' : '0'}
              dot={{ r: 2, fill: it.color }} connectNulls
              activeDot={{ r: 4, fill: it.color, stroke: '#0a0a0f', strokeWidth: 2 }} isAnimationActive={false}>
              <LabelList dataKey={it.id} content={(props) => edgeLabel(props, it.code + (it.number != null ? ` (#${it.number})` : ''), 0, 'start')} />
              <LabelList dataKey={it.id} content={(props) => edgeLabel(props, it.code + (it.number != null ? ` (#${it.number})` : ''), chartData.length - 1, 'end')} />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
