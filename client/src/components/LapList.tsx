import { useEffect, useRef } from 'react';
import { tireColor } from '../theme/tokens';
import { useT } from '../i18n';

export interface LapRow {
  lapNumber: number;
  lapTime?: number | null;
  compound?: string | null;
}


interface Props {
  laps: LapRow[];
  value: number | null;
  onChange: (lap: number) => void;
  /** The driver's fastest lap, marked and used as the default. */
  fastestLap?: number | null;
  /** Compare mode: each row shows both drivers' times, A over B. Swatches are
   *  CSS backgrounds for each driver's marker (dashed for a teammate). */
  compare?: {
    swatchA: string;
    b: { laps: LapRow[]; value: number | null; fastestLap?: number | null; swatch: string };
  };
}

function formatLapTime(seconds?: number | null): string {
  if (seconds == null || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}

/**
 * The race's laps as a scrollable list rather than a dropdown.
 *
 * A dropdown hides the shape of the stint — you cannot see where the times drop
 * after a stop, or which laps were slow, without opening it and reading one line
 * at a time. The list shows all of them at once and still fits beside the charts.
 *
 * Compound is carried by its letter; the coloured underline is the second cue,
 * so the row survives both themes and colour-blind viewers.
 */
export default function LapList({ laps, value, onChange, fastestLap, compare }: Props) {
  const t = useT();

  // Compare mode lists every lap either driver ran (one may have retired early).
  const byLapB = new Map((compare?.b.laps ?? []).map((l) => [l.lapNumber, l]));
  const byLapA = new Map(laps.map((l) => [l.lapNumber, l]));
  const lapNumbers = compare
    ? [...new Set([...byLapA.keys(), ...byLapB.keys()])].sort((x, y) => x - y)
    : laps.map((l) => l.lapNumber);

  const timeLine = (l: LapRow | undefined, isFastest: boolean) => (
    <>
      <span className="en lap-row-t">{formatLapTime(l?.lapTime)}</span>
      {isFastest && <span className="lap-row-fl" aria-label={t('fastestLap')}>⚡</span>}
      {l?.compound && (
        <span
          className="lap-row-tyre"
          style={{ borderBottomColor: tireColor(l.compound) }}
          title={l.compound}
        >
          {l.compound.charAt(0)}
        </span>
      )}
    </>
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const didCentre = useRef(false);

  // Centre the selected lap on first paint: the default is usually the fastest
  // lap, which is typically deep in the race and otherwise off-screen.
  useEffect(() => {
    if (didCentre.current || value == null) return;
    const box = scrollRef.current;
    const row = box?.querySelector<HTMLElement>(`[data-lap="${value}"]`);
    if (box && row) {
      box.scrollTop = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
      didCentre.current = true;
    }
  }, [value, laps.length]);

  return (
    <div className="lap-list">
      <div className="lap-list-head">
        <span className="k">{t('lapListLaps', { n: laps.length })}</span>
        <span className="k">{t('lapListCols')}</span>
      </div>
      <div className="lap-list-scroll" ref={scrollRef} role="listbox" aria-label={t('lapListLaps', { n: laps.length })}>
        {lapNumbers.map((n) => {
          const selected = n === value;
          return (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={selected}
              data-lap={n}
              className={`lap-row ${compare ? 'is-compare' : ''} ${selected ? 'is-selected' : ''}`}
              onClick={() => onChange(n)}
            >
              <span className="num lap-row-n">{n}</span>
              {compare ? (
                <span className="lap-row-pair">
                  <span className="lap-row-line">
                    <span className="lap-row-mark" style={{ background: compare.swatchA }} />
                    {timeLine(byLapA.get(n), n === fastestLap)}
                  </span>
                  <span className={`lap-row-line ${n === compare.b.value ? 'is-b-viewed' : ''}`}>
                    <span className="lap-row-mark" style={{ background: compare.b.swatch }} />
                    {timeLine(byLapB.get(n), n === compare.b.fastestLap)}
                  </span>
                </span>
              ) : (
                timeLine(byLapA.get(n), n === fastestLap)
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
