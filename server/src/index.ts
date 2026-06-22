import express from 'express';
import cors from 'cors';
import standingsRouter from './routes/standings';
import scheduleRouter from './routes/schedule';
import resultsRouter from './routes/results';
import telemetryRouter from './routes/telemetry';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/standings', standingsRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/results', resultsRouter);
app.use('/api/telemetry', telemetryRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🏎️  F1 Dashboard Server running on http://localhost:${PORT}`);
});

export default app;
