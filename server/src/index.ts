import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import standingsRouter from './routes/standings';
import scheduleRouter from './routes/schedule';
import resultsRouter from './routes/results';
import telemetryRouter from './routes/telemetry';
import { getFiaDocuments, startFiaWatcher } from './services/fiaService';
import { startThreadsTokenRefresh } from './services/threadsService';

// Local secrets (ANTHROPIC_API_KEY) live in server/.env; hosts set real env vars
try {
  process.loadEnvFile(path.resolve(__dirname, '..', '.env'));
} catch {
  // no .env file
}

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
