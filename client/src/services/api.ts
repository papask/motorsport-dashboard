import axios from 'axios';

// Same-origin '/api' by default: the Vite dev server proxies it to the Express
// server, and in production Express serves both the app and the API.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 120000,
});

// Standings
export const getDriverStandings = (year: number, signal?: AbortSignal) =>
  api.get(`/standings/drivers/${year}`, { signal }).then((r) => r.data);

export const getConstructorStandings = (year: number, signal?: AbortSignal) =>
  api.get(`/standings/constructors/${year}`, { signal }).then((r) => r.data);

export const getDriverStandingsHistory = (year: number, signal?: AbortSignal) =>
  api.get(`/standings/drivers/${year}/history`, { signal }).then((r) => r.data);

export const getConstructorStandingsHistory = (year: number, signal?: AbortSignal) =>
  api.get(`/standings/constructors/${year}/history`, { signal }).then((r) => r.data);

// Schedule
export const getSeasonSchedule = (year: number, signal?: AbortSignal) =>
  api.get(`/schedule/${year}`, { signal }).then((r) => r.data);

// Results
export const getLastRaceResults = (signal?: AbortSignal) =>
  api.get('/results/last', { signal }).then((r) => r.data);

export const getRaceResults = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/results/${year}/${round}`, { signal }).then((r) => r.data);

export const getQualifyingResults = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/results/${year}/${round}/qualifying`, { signal }).then((r) => r.data);

export const getSprintResults = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/results/${year}/${round}/sprint`, { signal }).then((r) => r.data);

export const getRaceTimeline = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/results/timeline/${year}/${round}`, { signal }).then((r) => r.data);

export const getSprintTimeline = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/results/timeline/${year}/${round}/sprint`, { signal }).then((r) => r.data);

// Telemetry (FastF1)
export const getTelemetrySessions = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/telemetry/sessions/${year}/${round}`, { signal }).then((r) => r.data);

export const getTelemetryDrivers = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/telemetry/drivers/${year}/${round}`, { signal }).then((r) => r.data);

export const getDriverTelemetry = (year: number, round: number, driverNumber: number, lap?: number | null, signal?: AbortSignal) =>
  api.get(`/telemetry/${year}/${round}/${driverNumber}`, { params: lap ? { lap } : undefined, signal }).then((r) => r.data);

export interface TelemetryAvailability {
  results: boolean;
  lapTimes: boolean;
  telemetry: boolean;
  reason: string | null;
}

/**
 * What a session actually has, checked before committing to the telemetry
 * fetch — that one costs a minute or two on a cold cache, and finding out
 * afterwards that there was nothing to fetch is the worst way to spend it.
 */
export const getTelemetryAvailability = (year: number, round: number, session = 'R', signal?: AbortSignal): Promise<TelemetryAvailability> =>
  api.get(`/telemetry/availability/${year}/${round}`, { params: { session }, signal }).then((r) => r.data);

// Incidents (FastF1)
export const getRaceIncidents = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/telemetry/incidents/${year}/${round}`, { signal }).then((r) => r.data);

// FIA documents (auto-summarized by the server)
export const getFiaDocuments = (signal?: AbortSignal) =>
  api.get('/fia/documents', { signal }).then((r) => r.data);
