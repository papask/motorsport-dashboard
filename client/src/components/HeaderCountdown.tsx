import { useLocation } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { getSeasonSchedule } from '../services/api';
import { getCountryNameKR } from '../constants/koreanTerms';
import { getRaceDateTime, getNextRace } from '../utils/raceDate';
import useCountdown from '../hooks/useCountdown';
import { useT } from '../i18n';

const pad = (n: number) => n.toString().padStart(2, '0');

// Compact next-race countdown for the header. Hidden on the dashboard (which
// already shows the full countdown card) and when there is no upcoming race.
export default function HeaderCountdown({ year }: { year: number }) {
  const location = useLocation();
  const t = useT();
  const schedule = useApi((signal) => getSeasonSchedule(year, signal), [year]);
  const nextRace = schedule.data?.races ? getNextRace(schedule.data.races) : null;
  const countdown = useCountdown(nextRace ? getRaceDateTime(nextRace).toISOString() : null);

  if (location.pathname === '/' || !nextRace) return null;

  return (
    <div className="header-countdown" title={nextRace.raceName}>
      <div className="hc-info">
        <span className="hc-label">{t('nextRace')}</span>
        <span className="hc-name">{getCountryNameKR(nextRace.circuit.country)}</span>
      </div>
      <span className="hc-time">
        {countdown.days}{t('dayShort')} {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
      </span>
    </div>
  );
}
