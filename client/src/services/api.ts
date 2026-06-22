import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  timeout: 120000,
});

// Standings
export const getDriverStandings = (year: number, signal?: AbortSignal) =>
  api.get(`/standings/drivers/${year}`, { signal }).then((r) => r.data);

export const getConstructorStandings = (year: number, signal?: AbortSignal) =>
  api.get(`/standings/constructors/${year}`, { signal }).then((r) => r.data);

// Schedule
export const getSeasonSchedule = (year: number, signal?: AbortSignal) =>
  api.get(`/schedule/${year}`, { signal }).then((r) => r.data);

// Results
export const getLastRaceResults = (signal?: AbortSignal) =>
  api.get('/results/last', { signal }).then((r) => r.data);

export const getRaceResults = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/results/${year}/${round}`, { signal }).then((r) => r.data);

export const getRaceTimeline = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/results/timeline/${year}/${round}`, { signal }).then((r) => r.data);

// Telemetry (FastF1)
export const getTelemetrySessions = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/telemetry/sessions/${year}/${round}`, { signal }).then((r) => r.data);

export const getTelemetryDrivers = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/telemetry/drivers/${year}/${round}`, { signal }).then((r) => r.data);

export const getDriverTelemetry = (year: number, round: number, driverNumber: number, signal?: AbortSignal) =>
  api.get(`/telemetry/${year}/${round}/${driverNumber}`, { signal }).then((r) => r.data);

// Incidents (FastF1)
export const getRaceIncidents = (year: number, round: number, signal?: AbortSignal) =>
  api.get(`/telemetry/incidents/${year}/${round}`, { signal }).then((r) => r.data);
