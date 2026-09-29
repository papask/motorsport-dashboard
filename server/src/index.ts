import express from 'express';
import cors from 'cors';
import './loadEnv'; // first: the services below read env on import
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import standingsRouter from './routes/standings';
import scheduleRouter from './routes/schedule';
import resultsRouter from './routes/results';
import telemetryRouter from './routes/telemetry';
import nextRaceRouter from './routes/nextRace';
import calendarRouter from './routes/calendar';
import { getFiaDocuments, startFiaWatcher } from './services/fiaService';
import {
  packPosts, postToThreads, setThreadsEnabled, startThreadsTokenRefresh, textUnits, threadsStatus,
} from './services/threadsService';
import {
  addFeed, draftAllListed, draftOnRequest, newsStatus, removeFeed, setFeedMuted, setNewsEnabled, setNewsStatus, startNewsWatcher,
} from './services/newsService';
import { startResultsPoster } from './services/resultsPoster';
import {
  calendarEnabled, guideThreadsEnabled, nextRaceEnabled, setCalendarEnabled, setGuideThreadsEnabled, setNextRaceEnabled,
} from './services/nextRaceSettings';
import { checkGuidePost, startGuidePoster } from './services/guidePoster';
import { guideBuilderStatus, startGuideBuilder } from './services/guideBuilder';
import { decisionEntries, startStewardDecisions } from './services/stewardDecisions';
import { renderPage } from './pageMeta';
import { issueSession, readCookie, SESSION_COOKIE, SESSION_MAX_AGE_MS, verifySession } from './adminSession';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '300kb' })); // room for an article pasted into the admin page

// API Routes
app.use('/api/standings', standingsRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/results', resultsRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/next-race', nextRaceRouter);
app.use('/api', calendarRouter);

// Which optional features are on, so the client can hide what is off
app.get('/api/features', (_req, res) => {
  res.json({ nextRace: nextRaceEnabled(), calendar: calendarEnabled() });
});
app.get('/api/fia/documents', (req, res) => {
  res.json(getFiaDocuments(typeof req.query.event === 'string' ? req.query.event : undefined));
});

// Admin routes need `Authorization: Bearer <ADMIN_TOKEN>`; with no ADMIN_TOKEN set they stay closed
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest(); // equal lengths for timingSafeEqual
const isAdminToken = (given: string) => {
  const expected = process.env.ADMIN_TOKEN;
  return !!expected && crypto.timingSafeEqual(sha256(given), sha256(expected));
};

// The admin page signs in once with ADMIN_TOKEN and gets a 30-day session
// cookie: HttpOnly (scripts can't read it), SameSite=Strict (other sites can't
// send it), Secure off only on localhost, and sent only to /api/admin.
const sessionCookie = (req: express.Request) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: !['localhost', '127.0.0.1'].includes(req.hostname),
  path: '/api/admin',
});
app.post('/api/admin/login', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!isAdminToken(token)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.cookie(SESSION_COOKIE, issueSession(process.env.ADMIN_TOKEN!), { ...sessionCookie(req), maxAge: SESSION_MAX_AGE_MS });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookie(req));
  res.json({ ok: true });
});

// Every other admin route needs that session cookie, or `Authorization: Bearer
// <ADMIN_TOKEN>` for scripts; with no ADMIN_TOKEN set they stay closed
app.use('/api/admin', (req, res, next) => {
  const secret = process.env.ADMIN_TOKEN;
  const session = readCookie(req.get('cookie'), SESSION_COOKIE);
  const bearer = req.get('authorization')?.replace(/^Bearer /i, '');
  if (!secret || !((session && verifySession(session, secret)) || (bearer && isAdminToken(bearer)))) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

// Threads posting on/off without a restart: GET reads it, POST {"enabled": true|false} flips it
app.get('/api/admin/threads', (_req, res) => {
  res.json(threadsStatus());
});
app.post('/api/admin/threads', (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') {
    res.status(400).json({ error: 'body must be {"enabled": true|false}' });
    return;
  }
  setThreadsEnabled(req.body.enabled);
  res.json(threadsStatus());
});
// Watched news: GET lists feeds, articles and their drafts. POST {"enabled": bool}
// flips the watcher, {"url", "status": "dismissed"} hides one article,
// {"addFeed": site or RSS address} / {"removeFeed": feed} edit the feed list,
// {"muteFeed": feed, "muted": bool} stops or resumes reading one without removing it,
// {"draftAll": true} drafts every listed article that has no draft yet
app.get('/api/admin/news', (_req, res) => {
  res.json(newsStatus());
});
app.post('/api/admin/news', async (req, res) => {
  const { enabled, url, status, addFeed: feedToAdd, removeFeed: feedToRemove, muteFeed, muted, draftAll } = req.body ?? {};
  if (draftAll === true) {
    // Starts in the background; the page follows it through `bulk` in the status
    try {
      res.json({ ...newsStatus(), started: draftAllListed() });
    } catch (err: any) {
      res.status(409).json({ error: err.message });
    }
    return;
  }
  if (typeof enabled === 'boolean') setNewsEnabled(enabled);
  else if (typeof feedToRemove === 'string') removeFeed(feedToRemove);
  else if (typeof muteFeed === 'string' && typeof muted === 'boolean') {
    if (!setFeedMuted(muteFeed, muted)) {
      res.status(400).json({ error: 'muteFeed must be a listed feed' });
      return;
    }
  }
  else if (typeof feedToAdd === 'string' && feedToAdd.length <= 2000) {
    try {
      await addFeed(feedToAdd.trim());
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }
  } else if (!(typeof url === 'string' && status === 'dismissed' && setNewsStatus(url, status))) {
    res.status(400).json({ error: 'body must hold "enabled", "addFeed", "removeFeed" or {"url": listed article, "status": "dismissed"}' });
    return;
  }
  res.json(newsStatus());
});

// A news draft for the admin to review: {"url": "https://...", "text"?: article
// text pasted from the admin's browser} → {text, copied}. When the page can't be
// read, a 422 with needsText asks the admin page for that paste.
app.post('/api/admin/news/draft', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const pasted = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) {
    res.status(400).json({ error: 'body must be {"url": "https://..."}' });
    return;
  }
  if (req.body?.text !== undefined && pasted.length < 200) {
    res.status(400).json({ error: '붙여 넣은 본문이 너무 짧아요' });
    return;
  }
  try {
    res.json(await draftOnRequest(url, pasted));
  } catch (err: any) {
    console.error('[News] draft failed:', err.message);
    res.status(err.needsText ? 422 : 502).json({ error: err.message, needsText: err.needsText === true });
  }
});

// How {"text"} will be split, so the admin page can show where replies start
app.post('/api/admin/threads/preview', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  res.json({ posts: text ? packPosts(textUnits(text)) : [] });
});

// A reviewed post, {"text": "..."}: packed sentence by sentence into 500-char
// posts chained as replies (line breaks kept). Goes out even while the
// automatic posting above is off.
app.post('/api/admin/threads/post', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 5000) {
    res.status(400).json({ error: 'body must be {"text": "..."} of 1-5000 chars' });
    return;
  }
  if (!threadsStatus().hasToken) {
    res.status(503).json({ error: 'THREADS_ACCESS_TOKEN is not set' });
    return;
  }
  const posts = packPosts(textUnits(text));
  try {
    await postToThreads(posts, { manual: true });
    // {"newsUrl"} marks the watched article it came from as posted
    if (typeof req.body.newsUrl === 'string') setNewsStatus(req.body.newsUrl, 'posted');
    res.json({ posts: posts.length });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// Next-race guide on/off without a restart. Off, it makes no outside calls
// and its pages and API are gone; on, it catches up on what it missed.
const nextRaceStatus = () => ({
  enabled: nextRaceEnabled(),
  calendar: calendarEnabled(),
  threads: guideThreadsEnabled(),
  ...guideBuilderStatus(),
  decisionsRead: decisionEntries().length,
});
app.get('/api/admin/next-race', (_req, res) => {
  res.json(nextRaceStatus());
});
// {"enabled": bool} flips the guide; {"calendar": bool} the calendar feed and its subscribe
// link; {"threads": bool} posts each guide to Threads once it's ready
app.post('/api/admin/next-race', (req, res) => {
  const { enabled, calendar, threads } = req.body ?? {};
  const given = [enabled, calendar, threads].filter((v) => v !== undefined);
  if (!given.length || !given.every((v) => typeof v === 'boolean')) {
    res.status(400).json({ error: 'body must hold "enabled", "calendar" and/or "threads": true|false' });
    return;
  }
  if (enabled !== undefined) setNextRaceEnabled(enabled);
  if (calendar !== undefined) setCalendarEnabled(calendar);
  if (threads !== undefined) {
    setGuideThreadsEnabled(threads);
    if (threads) checkGuidePost(); // a guide already ready goes out now, not in an hour
  }
  res.json(nextRaceStatus());
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the built client (client/dist) when it exists, so one server hosts
// both the app and the API. In development Vite serves the client instead.
const CLIENT_DIST = process.env.CLIENT_DIST || path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  // index: false so "/" also goes through renderPage below
  app.use(express.static(CLIENT_DIST, { index: false }));
  const template = fs.readFileSync(path.join(CLIENT_DIST, 'index.html'), 'utf8');
  // Client-side routes fall back to index.html, with that page's meta tags; unknown /api paths stay 404
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
    const site = process.env.SITE_URL || `https://${req.get('host')}`;
    res.type('html').send(renderPage(template, req.path, site));
  });
}

app.listen(PORT, () => {
  console.log(`🏎️  F1 Dashboard Server running on http://localhost:${PORT}`);
  startFiaWatcher();
  startThreadsTokenRefresh();
  startResultsPoster();
  startStewardDecisions();
  startGuideBuilder();
  startGuidePoster();
  startNewsWatcher();
});

export default app;
