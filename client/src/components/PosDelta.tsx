// Rank change vs the previous round: ▲ up (green), ▼ down (red), – no change,
// NEW when the driver/constructor was not present in the previous round.
export default function PosDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>NEW</span>;
  if (delta > 0) return <span style={{ color: '#00C853', fontSize: 11, fontWeight: 700 }}>▲{delta}</span>;
  if (delta < 0) return <span style={{ color: '#E10600', fontSize: 11, fontWeight: 700 }}>▼{Math.abs(delta)}</span>;
  return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>–</span>;
}
