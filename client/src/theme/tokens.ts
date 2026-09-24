/**
 * TypeScript view of the design tokens declared in `styles/tokens.css`.
 *
 * Every value here is a `var(--…)` reference, not a literal. Custom properties
 * resolve in inline styles and in SVG presentation attributes alike, so Recharts
 * `stroke` / `fill` / `stopColor` props take these directly and follow a theme
 * change for free. The rule is the same as in CSS: no hex literals outside
 * `tokens.css`.
 *
 * Names mirror the "00 컬러 팔레트" artboard of the design canvas.
 */

const v = (name: string) => `var(--${name})`;

/* -------------------------------------------------------------------------- */
/* Surfaces, text, borders                                                    */
/* -------------------------------------------------------------------------- */

export const surface = {
  base: v('surface-base'),
  raised: v('surface-raised'),
  sunken: v('surface-sunken'),
  /** Ink fill used for selected items and primary actions. */
  inverse: v('surface-inverse'),
  chrome: v('surface-chrome'),
  menu: v('surface-menu'),
  tooltip: v('surface-tooltip'),
  scrim: v('surface-scrim'),
  veil: v('surface-veil'),
} as const;

export const ink = {
  a02: v('ink-02'),
  a04: v('ink-04'),
  a06: v('ink-06'),
  a08: v('ink-08'),
  a10: v('ink-10'),
  a18: v('ink-18'),
  a20: v('ink-20'),
  a40: v('ink-40'),
  a70: v('ink-70'),
} as const;

export const text = {
  primary: v('text-primary'),
  secondary: v('text-secondary'),
  muted: v('text-muted'),
  /** Text drawn on an ink fill — selected controls, primary buttons, flag chips. */
  onInverse: v('text-on-inverse'),

  /* Tooltips are a raised surface, so they use the ordinary text ladder.
     These aliases keep the call sites reading as what they are. */
  tooltipHeading: v('text-primary'),
  tooltipLabel: v('text-secondary'),
  tooltipMuted: v('text-secondary'),
  /** Disabled text still clears AA — the state is carried by ground + border. */
  disabled: v('text-secondary'),
} as const;

export const border = {
  subtle: v('border-subtle'),
  strong: v('border-strong'),
  faint: v('border-faint'),
} as const;

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

export const control = {
  hoverBg: v('control-hover-bg'),
  selectedBg: v('control-selected-bg'),
  selectedFg: v('control-selected-fg'),
  actionBg: v('action-primary-bg'),
  actionFg: v('action-primary-fg'),
  focusRing: v('focus-ring'),
} as const;

/**
 * Disabled styling. Never opacity — a sunken ground keeps secondary text above
 * 4.5:1, and the dashed border carries the state non-chromatically.
 */
export const disabled = {
  background: v('disabled-bg'),
  color: v('disabled-fg'),
  border: `1px dashed ${v('disabled-border')}`,
  cursor: 'not-allowed',
} as const;

/* -------------------------------------------------------------------------- */
/* Race control                                                               */
/* -------------------------------------------------------------------------- */

export const status = {
  redFlag: v('status-red-flag'),
  redFlagTint: v('status-red-flag-tint'),
  safetyCar: v('status-safety-car'),
  safetyCarTint: v('status-safety-car-tint'),
  vsc: v('status-vsc'),
  yellowFlag: v('status-yellow-flag'),
  fastestLap: v('status-fastest-lap'),
  dnf: v('status-dnf'),
  pit: v('status-pit'),
} as const;

/** A fill plus the text colour that stays legible on top of it. */
export interface SignalStyle {
  bg: string;
  color: string;
}

export const FLAG_STYLES: Record<string, SignalStyle> = {
  GREEN: { bg: v('team-audi'), color: v('text-on-inverse') },
  CLEAR: { bg: v('team-audi'), color: v('text-on-inverse') },
  YELLOW: { bg: v('status-yellow-flag'), color: v('text-on-inverse') },
  'DOUBLE YELLOW': { bg: v('status-safety-car'), color: v('text-on-inverse') },
  RED: { bg: v('status-red-flag'), color: v('text-on-inverse') },
  BLUE: { bg: v('team-williams'), color: v('text-on-inverse') },
  'BLACK AND WHITE': { bg: v('surface-inverse'), color: v('text-on-inverse') },
  CHEQUERED: { bg: v('surface-inverse'), color: v('text-on-inverse') },
};

export const EVENT_COLORS = {
  pit: { bg: v('status-pit'), color: v('text-on-inverse') },
  yellowFlag: { bg: v('status-yellow-flag'), color: v('text-on-inverse') },
  redFlag: { bg: v('status-red-flag'), color: v('text-on-inverse') },
  safetyCar: { bg: v('status-safety-car'), color: v('text-on-inverse') },
  vsc: { bg: v('status-vsc'), color: v('text-on-inverse') },
  green: { bg: v('team-audi'), color: v('text-on-inverse') },
  chequered: { bg: v('surface-inverse'), color: v('text-on-inverse') },
} as const satisfies Record<string, SignalStyle>;

export const incident = {
  scBg: v('incident-sc-bg'),
  scBorder: v('status-safety-car'),
  redBg: v('incident-red-bg'),
  redBorder: v('status-red-flag'),
  dnfBg: v('dnf-bg'),
  dnfBorder: v('status-dnf'),
  pitMarker: v('status-pit'),
} as const;

/* -------------------------------------------------------------------------- */
/* Podium                                                                     */
/* -------------------------------------------------------------------------- */

export const podium = {
  p1: v('podium-p1'),
  p2: v('podium-p2'),
  p3: v('podium-p3'),
} as const;

/** Colour for a finishing position, or `null` outside the podium. */
export function podiumColor(position: number): string | null {
  if (position === 1) return podium.p1;
  if (position === 2) return podium.p2;
  if (position === 3) return podium.p3;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Position delta                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Rank movement is a lightness ladder, not red/green — it reads the same in
 * both themes and does not rely on hue discrimination.
 */
export const delta = {
  up: v('delta-up'),
  down: v('delta-down'),
  none: v('delta-none'),
} as const;

/* -------------------------------------------------------------------------- */
/* Tyres                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The compound LETTER is the primary cue; these colours are the secondary one
 * (badge underline, chart marker fill). SOFT is a desaturated rose so it never
 * reads as a red flag.
 */
export const TIRE_COLORS: Record<string, string> = {
  SOFT: v('tyre-soft'),
  MEDIUM: v('tyre-medium'),
  HARD: v('tyre-hard'),
  INTERMEDIATE: v('tyre-inter'),
  WET: v('tyre-wet'),
};

export const TIRE_UNKNOWN = v('text-muted');

/** Tyre fill for a compound, falling back to the neutral swatch. */
export function tireColor(compound?: string | null): string {
  return (compound && TIRE_COLORS[compound]) || TIRE_UNKNOWN;
}

/* -------------------------------------------------------------------------- */
/* Telemetry and charts                                                       */
/* -------------------------------------------------------------------------- */

export const telemetry = {
  /** Comparison mode: A is ink, B is secondary — never two hues. */
  driverA: v('data-series-a'),
  driverB: v('data-series-b'),
  speed: v('trace-speed'),
  rpm: v('trace-rpm'),
  gear: v('trace-gear'),
  throttle: v('trace-throttle'),
  brake: v('trace-brake'),
  drs: v('trace-drs'),
  drsFill: v('trace-drs-fill'),
  lapTime: v('data-series-a'),
  /** Laps run under a neutralisation (SC/VSC) — tinted, not a trace colour. */
  neutral: v('status-safety-car'),
  sector1: v('sector-1'),
  sector2: v('sector-2'),
  sector3: v('sector-3'),
} as const;

export const chart = {
  axisTick: v('chart-axis-tick'),
  axisLabel: v('chart-axis-label'),
  /** Smaller/secondary tick text; same ladder step as the axis label. */
  tickMuted: v('chart-axis-label'),
  gridline: v('chart-gridline'),
  referenceLine: v('chart-reference-line'),
  dotStroke: v('chart-dot-stroke'),
  seriesLabel: v('chart-series-label'),
  seriesLabelDimmed: v('chart-series-label-dimmed'),
  zebra: v('chart-zebra'),
  zebraStripe: v('chart-zebra-stripe'),
  markerDashedBorder: v('marker-dashed-border'),
  markerRing: v('marker-ring'),
  bar: v('data-bar'),
  progress: v('data-progress'),
  track: v('data-track'),
  placeholderHatch: v('placeholder-hatch'),
} as const;

/** Shared Recharts tooltip chrome, so every chart's popover matches. */
export const tooltipSurface = {
  background: surface.tooltip,
  border: `1px solid ${border.subtle}`,
  borderRadius: 8,
  fontSize: 12,
} as const;

export const rowTint = {
  hover: v('row-hover'),
  personalBest: v('row-personal-best'),
  neutralised: v('row-neutralised'),
  retired: v('row-retired'),
} as const;

/* -------------------------------------------------------------------------- */
/* Constructors                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Team name (as the API spells it) to brand colour token.
 *
 * This is the single team palette for the whole app. Each token carries a
 * light and a dark value that share a hue and differ only in lightness, so a
 * constructor stays recognisable across themes while clearing AA on both.
 */
export const TEAM_COLORS: Record<string, string> = {
  McLaren: v('team-mclaren'),
  Mercedes: v('team-mercedes'),
  'Red Bull': v('team-red-bull'),
  'Red Bull Racing': v('team-red-bull'),
  Ferrari: v('team-ferrari'),
  Williams: v('team-williams'),
  RB: v('team-racing-bulls'),
  'RB F1 Team': v('team-racing-bulls'),
  'Racing Bulls': v('team-racing-bulls'),
  'Visa Cash App RB': v('team-racing-bulls'),
  AlphaTauri: v('team-racing-bulls'),
  'Aston Martin': v('team-aston-martin'),
  Haas: v('team-haas'),
  'Haas F1 Team': v('team-haas'),
  'Kick Sauber': v('team-audi'),
  'Stake F1 Team': v('team-audi'),
  Sauber: v('team-audi'),
  Audi: v('team-audi'),
  Alpine: v('team-alpine'),
  'Alpine F1 Team': v('team-alpine'),
  'Alfa Romeo': v('team-ferrari'),
  Cadillac: v('team-cadillac'),
  'Cadillac F1 Team': v('team-cadillac'),
};

export const TEAM_UNKNOWN = v('team-unknown');

/** Longest keys first, so "Red Bull Racing" wins over "Red Bull". */
const TEAM_KEYS_BY_LENGTH = Object.keys(TEAM_COLORS).sort((a, b) => b.length - a.length);

/**
 * Brand colour for a constructor.
 *
 * Tries an exact name match, then a substring match (API names carry sponsor
 * prefixes that change between seasons), then the hex the API supplied for that
 * team, and finally the neutral swatch.
 *
 * The API's own hex is a last resort on purpose: it is a single value tuned for
 * a dark ground, so it will not follow the light theme.
 *
 * @param teamName   Constructor name as returned by the API.
 * @param apiColour  Optional bare hex from the API (`"E8002D"`, no leading `#`).
 */
export function getTeamColor(teamName?: string | null, apiColour?: string | null): string {
  if (teamName) {
    const exact = TEAM_COLORS[teamName];
    if (exact) return exact;

    const partial = TEAM_KEYS_BY_LENGTH.find((key) => teamName.includes(key));
    if (partial) return TEAM_COLORS[partial];
  }
  return apiColour ? `#${apiColour}` : TEAM_UNKNOWN;
}
