import fs from 'fs';
import path from 'path';

// Forecasts for a race weekend's sessions, from Open-Meteo (free, no key).
// A forecast is fetched at most hourly and saved; from lights out on only the
// saved one is served, so a finished guide keeps the forecast it had then.

const GUIDES_DIR = path.join(process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data'), 'guides');
const REFRESH_MS = 60 * 60 * 1000;

export interface SessionWeather {
  temp: number;
  /** Chance of precipitation that hour, % */
  rain: number;
  kind: 'clear' | 'cloud' | 'rain' | 'storm';
}

interface Saved {
  fetchedAt: string;
  /** Session start (ISO) → that hour's forecast */
  sessions: Record<string, SessionWeather | null>;
}

// WMO weather codes as Open-Meteo reports them
function kindOf(code: number): SessionWeather['kind'] {
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 1) return 'clear';
  return 'cloud';
}

const fileOf = (year: number, round: number) => path.join(GUIDES_DIR, `${year}-${round}-weather.json`);

function readSaved(year: number, round: number): Saved | null {
  try {
    return JSON.parse(fs.readFileSync(fileOf(year, round), 'utf8'));
  } catch {
    return null;
  }
}

async function fetchForecast(lat: number, lng: number, starts: string[], now: number): Promise<Saved> {
  const days = starts.map((s) => s.slice(0, 10)).sort();
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lng}&timezone=UTC`
    + '&hourly=temperature_2m,precipitation_probability,weather_code'
    + `&start_date=${days[0]}&end_date=${days.at(-1)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { hourly } = await res.json() as { hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] } };
  const sessions: Saved['sessions'] = {};
  for (const start of starts) {
    const i = hourly.time.indexOf(start.slice(0, 13) + ':00'); // the hour the session starts in
    const temp = hourly.temperature_2m[i];
    sessions[start] = i >= 0 && temp != null
      ? { temp: Math.round(temp), rain: hourly.precipitation_probability[i] ?? 0, kind: kindOf(hourly.weather_code[i]) }
      : null;
  }
  return { fetchedAt: new Date(now).toISOString(), sessions };
}

const inFlight = new Map<string, Promise<Saved | null>>();

/**
 * The forecast for each session start, or null when there is none yet (more
 * than about 16 days out) or Open-Meteo is unreachable; a failure never
 * breaks the guide.
 */
export async function sessionWeather(
  year: number, round: number, lat: number, lng: number, starts: string[], raceStart: number, now = Date.now(),
): Promise<Saved | null> {
  const saved = readSaved(year, round);
  if (now >= raceStart) return saved; // frozen at lights out
  if (saved && now - Date.parse(saved.fetchedAt) < REFRESH_MS) return saved;
  const key = `${year}-${round}`;
  if (!inFlight.has(key)) {
    inFlight.set(key, fetchForecast(lat, lng, starts, now)
      .then((fresh) => {
        fs.mkdirSync(GUIDES_DIR, { recursive: true });
        fs.writeFileSync(fileOf(year, round), JSON.stringify(fresh));
        return fresh;
      })
      .catch((err) => {
        console.error(`[Weather] ${key}:`, err.message);
        return saved; // the older forecast beats none
      })
      .finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key)!;
}
