import { Router } from 'express';
import { getSeasonSchedule } from '../services/jolpicaService';
import { sessionsOf, type ScheduleRace, type SessionKey } from '../services/guideRules';
import { calendarEnabled } from '../services/nextRaceSettings';
import { sendRouteError } from '../utils/errorResponse';

// The season's sessions as an iCalendar feed (RFC 5545). Times go out in UTC,
// so each subscriber's calendar shows them in its own time zone. Part of the
// next-race guide; its switch follows the guide's unless pinned on its own.

const router = Router();

const SESSION_KO: Record<SessionKey, [name: string, minutes: number]> = {
  // The site's own session names (client SESSION_NAMES_KR)
  firstPractice: ['프랙티스 1', 60],
  secondPractice: ['프랙티스 2', 60],
  thirdPractice: ['프랙티스 3', 60],
  sprintQualifying: ['스프린트 퀄리파잉', 45],
  sprint: ['스프린트', 60],
  qualifying: ['퀄리파잉', 60],
  race: ['레이스', 120],
};

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Lines longer than 75 octets continue on the next line after a space (RFC 5545 3.1). */
function fold(line: string) {
  const out: string[] = [];
  let current = '';
  for (const ch of line) {
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (Buffer.byteLength(current + ch) > limit) {
      out.push(current);
      current = '';
    }
    current += ch;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function seasonCalendar(year: number, races: ScheduleRace[], site: string) {
  const now = stamp(Date.now());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//onthelimit//F1 calendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`F1 ${year} · 온더리밋`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
  ];
  for (const race of races) {
    for (const s of sessionsOf(race)) {
      if (!s.timeKnown) continue; // a date without a time would land at midnight
      const [name, minutes] = SESSION_KO[s.key];
      lines.push(
        'BEGIN:VEVENT',
        `UID:${year}-${race.round}-${s.key}@onthelimit`,
        `DTSTAMP:${now}`,
        `DTSTART:${stamp(s.start)}`,
        `DTEND:${stamp(s.start + minutes * 60_000)}`,
        `SUMMARY:${escapeText(`F1 R${race.round} ${race.raceName} · ${name}`)}`,
        `LOCATION:${escapeText(`${race.circuit.name}, ${race.circuit.locality}, ${race.circuit.country}`)}`,
        ...(site ? [`URL:${site}/next/${race.round}`] : []),
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

router.get('/calendar.ics', async (req, res) => {
  if (!calendarEnabled()) {
    res.status(404).json({ error: 'disabled' });
    return;
  }
  try {
    const year = new Date().getUTCFullYear();
    const { races } = await getSeasonSchedule(year);
    const site = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
    res.type('text/calendar; charset=utf-8');
    res.set('Content-Disposition', `inline; filename="f1-${year}.ics"`);
    res.send(seasonCalendar(year, races, site));
  } catch (err) {
    sendRouteError(res, err, '캘린더를 만들지 못했습니다');
  }
});

export default router;
