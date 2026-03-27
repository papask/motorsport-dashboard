import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  timeout: 90000,
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

// Telemetry (OpenF1)
export const getSessions = (year: number, signal?: AbortSignal) =>
  api.get(`/telemetry/sessions/${year}`, { signal }).then((r) => r.data);

export const getLaps = (sessionKey: number, driverNumber?: number, signal?: AbortSignal) => {
  const params = driverNumber ? `?driver_number=${driverNumber}` : '';
  return api.get(`/telemetry/laps/${sessionKey}${params}`, { signal }).then((r) => r.data);
};

export const getCarData = (sessionKey: number, driverNumber: number, signal?: AbortSignal) =>
  api.get(`/telemetry/car/${sessionKey}/${driverNumber}`, { signal }).then((r) => r.data);

export const getPositions = (sessionKey: number, signal?: AbortSignal) =>
  api.get(`/telemetry/positions/${sessionKey}`, { signal }).then((r) => r.data);

export const getPitStops = (sessionKey: number, signal?: AbortSignal) =>
  api.get(`/telemetry/pitstops/${sessionKey}`, { signal }).then((r) => r.data);

export const getWeather = (sessionKey: number, signal?: AbortSignal) =>
  api.get(`/telemetry/weather/${sessionKey}`, { signal }).then((r) => r.data);

export const getDriversBySession = (sessionKey: number, signal?: AbortSignal) =>
  api.get(`/drivers/${sessionKey}`, { signal }).then((r) => r.data);

export const getRaceTimeline = (sessionKey: number, signal?: AbortSignal) =>
  api.get(`/telemetry/timeline/${sessionKey}`, { signal }).then((r) => r.data);

export const getRaceIncidents = (sessionKey: number, signal?: AbortSignal) =>
  api.get(`/telemetry/incidents/${sessionKey}`, { signal }).then((r) => r.data);

