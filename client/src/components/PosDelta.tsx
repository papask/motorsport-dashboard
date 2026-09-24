import { delta as deltaToken, text } from '../theme/tokens';

// Rank change vs the previous round. The direction is carried by a lightness
// ladder (▲ primary / ▼ secondary / – muted) rather than red/green: red is
// reserved for race control, and hue alone would fail for red-green colour
// blindness. NEW when the driver/constructor was not in the previous round.
export default function PosDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span style={{ fontSize: 10, color: text.muted, fontWeight: 700 }}>NEW</span>;
  if (delta > 0) return <span style={{ color: deltaToken.up, fontSize: 11, fontWeight: 700 }}>▲{delta}</span>;
  if (delta < 0) return <span style={{ color: deltaToken.down, fontSize: 11, fontWeight: 700 }}>▼{Math.abs(delta)}</span>;
  return <span style={{ color: deltaToken.none, fontSize: 11 }}>–</span>;
}
