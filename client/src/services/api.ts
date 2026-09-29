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
export const getFiaDocuments = (event: string | null, signal?: AbortSignal) =>
  api.get('/fia/documents', { params: { event: event ?? undefined }, signal }).then((r) => r.data);

// Optional features the server has switched on
export const getFeatures = (signal?: AbortSignal) =>
  api.get('/features', { signal }).then((r) => r.data as { nextRace: boolean; calendar: boolean });

// Next-race guide: the coming race, or one race pinned by year and round
// A guide not open yet (a later race than the current one) comes back as { notOpen, current }
export const getNextRaceGuide = (year?: number, round?: number, signal?: AbortSignal) =>
  api.get(year && round ? `/next-race/${year}/${round}` : '/next-race', { signal })
    .then((r) => r.data)
    .catch((err) => {
      const body = err.response?.data;
      if (err.response?.status === 404 && body?.error === 'not_open') return { notOpen: true, current: body.current };
      throw err;
    });

// The season calendar feed, as a link the viewer's calendar app subscribes to
export const calendarUrl = () => `${api.defaults.baseURL}/calendar.ics`;

// Admin (/admin page): one login with ADMIN_TOKEN sets an HttpOnly session
// cookie that every later call carries by itself (same origin), so no token
// is kept in the page
export const loginAdmin = (token: string) => api.post('/admin/login', { token });
export const logoutAdmin = () => api.post('/admin/logout');
export const getAdminStatus = () =>
  Promise.all(['threads', 'next-race', 'news'].map((p) => api.get(`/admin/${p}`)))
    .then(([t, n, news]) => ({ threads: t.data, nextRace: n.data, news: news.data as {
      enabled: boolean; feeds: string[]; muted: string[]; items: NewsItem[];
      bulk: { total: number; done: number } | null; // "draft all" progress while it runs
    } }));

export interface NewsItem {
  url: string;
  title: string;
  found: string;
  published?: string; // when the outlet published it, if its feed says
  status: 'new' | 'ready' | 'failed' | 'posted';
  draft?: { text: string; copied: string[] };
  error?: string;
  also?: { url: string; title: string }[]; // the same story from other outlets
  drafting?: boolean; // a draft is being made right now
}
export const setAdminSwitch = (path: 'threads' | 'next-race' | 'news', body: Record<string, boolean | string>) =>
  api.post(`/admin/${path}`, body).then((r) => r.data);
// newsUrl marks the watched article the text came from as posted
export const postThreadsNews = (text: string, newsUrl?: string) =>
  api.post('/admin/threads/post', { text, newsUrl }).then((r) => r.data as { posts: number });
// Claude reads the article and drafts a Korean summary; `copied` lists sentences too close to the source
// `text`: the article pasted from the admin's browser, when the page couldn't be read (a 422 with needsText asks for it)
export const draftNewsPost = (url: string, text?: string) =>
  api.post('/admin/news/draft', { url, text }).then((r) => r.data as { text: string; copied: string[] });
// The posts a text becomes on Threads, split exactly as posting will split it
export const previewThreadsPosts = (text: string, signal?: AbortSignal) =>
  api.post('/admin/threads/preview', { text }, { signal }).then((r) => r.data.posts as string[]);
