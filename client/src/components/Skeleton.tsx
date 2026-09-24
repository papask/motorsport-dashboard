import type { CSSProperties, ReactNode } from 'react';
import { useT } from '../i18n';

/**
 * Placeholder blocks that occupy the same place and size as the content they
 * stand in for, so nothing jumps when the data lands.
 *
 * They are flat sunken rectangles rather than shimmering bars: the canvas asks
 * for no animation, and a pulse that outlasts the wait is just noise. The
 * optional pulse is under 1.2s and is switched off under prefers-reduced-motion
 * (see index.css).
 */

export function SkeletonBlock({
  width = '100%',
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}) {
  return <span className="skeleton-block" style={{ width, height, ...style }} aria-hidden="true" />;
}

/**
 * Wraps a loading region: marks it busy for assistive tech and names what is
 * loading, so a screen reader is told rather than shown.
 */
export function SkeletonRegion({ children, label }: { children: ReactNode; label?: string }) {
  const t = useT();
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label ?? t('loadingData')}</span>
      {children}
    </div>
  );
}

/** Header block: kicker, title, subtitle — matches PageMasthead's metrics. */
export function SkeletonMasthead() {
  return (
    <div className="masthead">
      <div style={{ flex: 1 }}>
        <SkeletonBlock width={180} height={10} style={{ marginBottom: 10 }} />
        <SkeletonBlock width={320} height={40} style={{ marginBottom: 8 }} />
        <SkeletonBlock width={160} height={13} />
      </div>
    </div>
  );
}

/** Four hairline-divided figures, as on the dashboard. */
export function SkeletonStatRow() {
  return (
    <div className="stat-row">
      {[0, 1, 2, 3].map((i) => (
        <div className="stat-cell" key={i}>
          <SkeletonBlock width={90} height={10} style={{ marginBottom: 10 }} />
          <SkeletonBlock width={140} height={28} style={{ marginBottom: 8 }} />
          <SkeletonBlock width={110} height={11} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 10, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <table className="data-table skeleton-table">
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }, (_, c) => (
              <td key={c}>
                <SkeletonBlock height={14} width={c === 1 ? '70%' : c === 0 ? 28 : '45%'} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SkeletonChart({ height = 420 }: { height?: number }) {
  return <SkeletonBlock height={height} style={{ display: 'block' }} />;
}

/** Grid of schedule-sized cells. */
export function SkeletonCards({ count = 8, minHeight = 170 }: { count?: number; minHeight?: number }) {
  return (
    <div className="schedule-grid">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} height={minHeight} style={{ display: 'block' }} />
      ))}
    </div>
  );
}
