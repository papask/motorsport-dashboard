import useIsMobile from '../hooks/useIsMobile';
import { useT } from '../i18n';

export interface RoundOption {
  round: number;
  raceName: string;
  /** False for a round that has not run yet — selectable but marked. */
  available?: boolean;
  /** Optional suffix, e.g. "· 텔레메트리 없음". */
  note?: string;
  /** Circuit locality, used to shorten the label on narrow screens. */
  locality?: string;
  /** Replaces the round label, for lists that aren't championship rounds (FiA events). */
  label?: string;
}

interface Props {
  rounds: RoundOption[];
  value: number | null;
  onChange: (round: number) => void;
  /** Shown when nothing is selected yet. */
  placeholder?: string;
  /** Compact rendering for mobile / dense headers. */
  compact?: boolean;
}

/**
 * One round selector for every screen that has one.
 *
 * Results, timeline, telemetry and incidents each used to roll their own — a
 * three-part control here, a bare select there — so the same task looked
 * different on each page. This is the canvas's version: previous / select /
 * next as a single unit, arrows disabled at the ends, and ←/→ to step.
 */
export default function RoundSelector({ rounds, value, onChange, placeholder, compact }: Props) {
  const t = useT();
  // A full "라운드 13 - Italian Grand Prix" does not fit a phone, so the label
  // drops to "R13 · Monza" where a locality is known.
  const isMobile = useIsMobile();
  const label = (r: RoundOption) =>
    r.label ?? (isMobile
      ? `R${r.round}${r.locality ? ` · ${r.locality}` : ''}`
      : t('roundNameOption', { n: r.round, name: r.raceName }));
  const index = rounds.findIndex((r) => r.round === value);
  const prev = index > 0 ? rounds[index - 1] : null;
  const next = index >= 0 && index < rounds.length - 1 ? rounds[index + 1] : null;

  return (
    <div
      className={`round-selector ${compact ? 'is-compact' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' && prev) onChange(prev.round);
        if (e.key === 'ArrowRight' && next) onChange(next.round);
      }}
    >
      <button
        type="button"
        className="round-step"
        onClick={() => prev && onChange(prev.round)}
        disabled={!prev}
        aria-label={t('prevRound')}
      >
        ‹
      </button>
      <select
        className="round-select"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={t('selectGP')}
      >
        {value == null && (
          <option value="" disabled>
            {placeholder ?? t('selectGP')}
          </option>
        )}
        {rounds.map((r) => (
          <option key={r.round} value={r.round}>
            {label(r)}
            {r.available === false ? t('upcomingSuffix') : ''}
            {r.note ? ` · ${r.note}` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="round-step"
        onClick={() => next && onChange(next.round)}
        disabled={!next}
        aria-label={t('nextRound')}
      >
        ›
      </button>
    </div>
  );
}
