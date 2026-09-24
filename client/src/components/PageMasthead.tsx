import type { ReactNode } from 'react';

interface Props {
  /** Small uppercase line above the title — season, round, circuit, count. */
  kicker?: ReactNode;
  /** The page name, set at the masthead size. */
  title: ReactNode;
  /** English rendering of the title, or a one-line description. */
  subtitle?: ReactNode;
  /** Right-hand slot: a countdown, a round selector, a filter segment. */
  aside?: ReactNode;
}

/**
 * The shared page header from the design canvas: kicker / title / subtitle on
 * the left, an optional slot on the right, closed by a 2px rule.
 *
 * All eight screens use it, which is what makes them read as one product — the
 * previous per-page headers each invented their own hierarchy.
 */
export default function PageMasthead({ kicker, title, subtitle, aside }: Props) {
  return (
    <header className="masthead">
      <div style={{ minWidth: 0 }}>
        {kicker && <div className="k">{kicker}</div>}
        <h1 className="masthead-title">{title}</h1>
        {subtitle && <div className="en" style={{ fontSize: 13 }}>{subtitle}</div>}
      </div>
      {aside && <div className="masthead-aside">{aside}</div>}
    </header>
  );
}
