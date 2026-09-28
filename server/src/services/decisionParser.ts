// Reads a stewards' decision from the text of its PDF. The FIA prints every
// decision on the same form (Document, No / Driver, Competitor, Session, Fact,
// Infringement, Decision, Reason), so fixed patterns find each field: no AI,
// and the same text always gives the same result. A text that does not match
// the form comes back unreadable instead of guessed.

export interface StewardDecision {
  doc?: number;
  car?: number;
  driver?: string;
  competitor?: string;
  session?: string;
  fact?: string;
  /** The Decision field as printed */
  decision: string;
  gridDrop?: number;
  pitLaneStart?: boolean;
  /** The season count the stewards print ("3rd reprimand of the season") */
  reprimand?: { count?: number; kind?: string };
  warning?: boolean;
  timePenaltySec?: number;
  penaltyLaps?: number;
  driveThrough?: boolean;
  stopGo?: boolean;
  disqualified?: boolean;
  fine?: string;
  /** Printed up to 2025: "1 penalty point (total of 6 for the 12 month period)" */
  penaltyPoints?: { points: number; total: number };
  noFurtherAction?: boolean;
  /** A corrected decision names the document it replaces */
  replacesDoc?: number;
}

export type ParseResult =
  | { status: 'parsed'; decision: StewardDecision }
  | { status: 'not_decision' }
  | { status: 'unreadable' };

const ORDINAL = /(\d+)(?:st|nd|rd|th)\s+reprimand/i;

const field = (text: string, pattern: RegExp) => text.match(pattern)?.[1]?.trim();

export function parseDecision(raw: string): ParseResult {
  const text = raw.replace(/\s+/g, ' ');
  if (!/From The Stewards/i.test(text)) return { status: 'not_decision' };
  // A summons names a hearing, not an outcome
  const decision = field(text, / Decision (.+?) (?:Reason|Competitors are reminded|The Stewards$)/);
  if (!decision) return /summon|required to report to the Stewards/i.test(text) ? { status: 'not_decision' } : { status: 'unreadable' };

  const result: StewardDecision = { decision };
  const doc = field(text, /Document (\d+)/);
  if (doc) result.doc = Number(doc);
  const driver = text.match(/No \/ Driver (\d+) - (.+?) Competitor /);
  if (driver) {
    result.car = Number(driver[1]);
    result.driver = driver[2].trim();
  }
  result.competitor = field(text, / Competitor (.+?) Time /);
  result.session = field(text, / Session (.+?) Fact /);
  result.fact = field(text, / Fact (.+?) (?:Infringement|Decision) /);

  // Only the Decision field decides what the penalty is; the Reason can quote other penalties
  const grid = decision.match(/drop of (\d+) grid (?:positions|places)|(\d+) grid (?:place|position) penalty/i);
  if (grid) result.gridDrop = Number(grid[1] ?? grid[2]);
  if (/start the race from the pit ?lane/i.test(decision)) result.pitLaneStart = true;
  if (/reprimand/i.test(decision)) {
    const count = decision.match(ORDINAL)?.[1];
    const kind = field(decision, /Reprimand \(([^)]+)\)/i);
    result.reprimand = { ...(count && { count: Number(count) }), ...(kind && { kind }) };
  }
  if (/\bwarning\b/i.test(decision)) result.warning = true;
  // "10 second time penalty converted to a drop of 5 grid positions" is served as the grid drop
  const seconds = decision.match(/(\d+) second time penalty(?! converted)/i)?.[1];
  if (seconds) result.timePenaltySec = Number(seconds);
  const laps = decision.match(/(\d+) penalty laps?/i)?.[1];
  if (laps) result.penaltyLaps = Number(laps);
  if (/drive[- ]through/i.test(decision)) result.driveThrough = true;
  if (/stop[- ]?(?:and[- ]go|\/go)/i.test(decision)) result.stopGo = true;
  if (/disqualif/i.test(decision)) result.disqualified = true;
  const fine = decision.match(/fined ((?:€|EUR ?)\d[\d,.]*\d)/i)?.[1];
  if (fine) result.fine = fine;
  const points = decision.match(/(\d+) penalty points? \(total of (\d+)/i);
  if (points) result.penaltyPoints = { points: Number(points[1]), total: Number(points[2]) };
  if (/no further action/i.test(decision)) result.noFurtherAction = true;
  const replaces = text.match(/(?:replaces|supersedes|corrects) (?:document|doc\.?) ?(\d+)/i)?.[1];
  if (replaces) result.replacesDoc = Number(replaces);
  return { status: 'parsed', decision: result };
}

/** Whether a decision moves the driver on the starting grid. */
export const affectsGrid = (d: StewardDecision) => Boolean(d.gridDrop || d.pitLaneStart);
