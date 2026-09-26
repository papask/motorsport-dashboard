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
import { getFiaDocuments, startFiaWatcher } from './services/fiaService';
import { setThreadsEnabled, startThreadsTokenRefresh, threadsStatus } from './services/threadsService';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/standings', standingsRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/results', resultsRouter);
app.use('/api/telemetry', telemetryRouter);
app.get('/api/fia/documents', (req, res) => {
  res.json(getFiaDocuments(typeof req.query.event === 'string' ? req.query.event : undefined));
});

// Admin routes need `Authorization: Bearer <ADMIN_TOKEN>`; with no ADMIN_TOKEN set they stay closed
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest(); // equal lengths for timingSafeEqual
app.use('/api/admin', (req, res, next) => {
  const expected = process.env.ADMIN_TOKEN;
  const given = req.get('authorization')?.replace(/^Bearer /i, '') ?? '';
  if (!expected || !crypto.timingSafeEqual(sha256(given), sha256(expected))) {
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the built client (client/dist) when it exists, so one server hosts
// both the app and the API. In development Vite serves the client instead.
const CLIENT_DIST = process.env.CLIENT_DIST || path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST));
  // Client-side routes fall back to index.html; unknown /api paths stay 404
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🏎️  F1 Dashboard Server running on http://localhost:${PORT}`);
  startFiaWatcher();
  startThreadsTokenRefresh();
});

export default app;
