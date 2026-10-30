import { Router, type Request } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { ERAS, generateQuiz, maxMs, score, seasonsFor } from '../services/quizService';

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'quiz.db'));
db.exec(`CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  seed TEXT NOT NULL,
  era TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  device TEXT,
  nick TEXT,
  score INTEGER, -- null until the answers come in
  ms INTEGER
)`);

const SLACK_MS = 10_000;
const NICK_MAX = 12;
const ID = /^[0-9a-f-]{36}$/;

// Each device's best game in an era (bound as ?), best first; ties go to the faster run.
const BEST = `SELECT id, nick, score, ms FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY device ORDER BY score DESC, ms ASC) AS r
  FROM games WHERE score IS NOT NULL AND era = ?
) WHERE r = 1`;
const eraOf = (v: unknown) => (typeof v === 'string' && Object.hasOwn(ERAS, v) ? v : 'all');

// Each start writes a row, so starts are capped per IP. The last X-Forwarded-For entry is the
// one Render's proxy appended (earlier ones are client-supplied); locally there is no header.
const STARTS_PER_WINDOW = 30;
const WINDOW_MS = 10 * 60_000;
const starts = new Map<string, { n: number; reset: number }>();
function allowStart(req: Request): boolean {
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim() || req.socket.remoteAddress || '';
  const now = Date.now();
  if (starts.size > 10_000) for (const [k, v] of starts) if (v.reset < now) starts.delete(k);
  const e = starts.get(ip);
  if (!e || e.reset < now) {
    starts.set(ip, { n: 1, reset: now + WINDOW_MS });
    return true;
  }
  return ++e.n <= STARTS_PER_WINDOW;
}

const router = Router();

// POST /api/quiz/start { era } → a new game and its questions
// ponytail: answers ship with the questions so the reveal is instant, so a player could
// read them from the network tab; check each answer server-side if cheating shows up.
router.post('/start', (req, res) => {
  if (!allowStart(req)) return res.status(429).json({ error: 'too many games' });
  const era = eraOf(req.body?.era);
  const id = crypto.randomUUID();
  const seed = crypto.randomBytes(8).toString('hex');
  // Games nobody finished within a day are dropped
  db.prepare('DELETE FROM games WHERE score IS NULL AND created_at < ?').run(Date.now() - 86_400_000);
  db.prepare('INSERT INTO games (id, seed, era, created_at) VALUES (?, ?, ?, ?)').run(id, seed, era, Date.now());
  res.json({ gameId: id, questions: generateQuiz(seed, seasonsFor(era)) });
});

// POST /api/quiz/result { gameId, device, nick, answers, ms } → the server's own score and rank
router.post('/result', (req, res) => {
  const { gameId, device, nick, answers, ms } = req.body ?? {};
  const name = typeof nick === 'string' ? nick.replace(/[\p{C}]/gu, '').trim().slice(0, NICK_MAX) : '';
  if (typeof gameId !== 'string' || typeof device !== 'string' || !ID.test(device) || !name
    || !Array.isArray(answers) || !answers.every((a) => a === true || a === false || a === null)
    || !Number.isInteger(ms) || ms < 0) {
    return res.status(400).json({ error: 'bad request' });
  }
  const game = db.prepare('SELECT seed, era, created_at, score FROM games WHERE id = ?').get(gameId) as
    { seed: string; era: string; created_at: number; score: number | null } | undefined;
  if (!game) return res.status(404).json({ error: 'unknown game' });
  if (game.score !== null) return res.status(409).json({ error: 'already submitted' });
  // The time claimed can't beat the server's clock or exceed every timer running out
  if (ms > Date.now() - game.created_at + SLACK_MS || ms > maxMs(answers.length) + SLACK_MS) {
    return res.status(422).json({ error: 'implausible time' });
  }

  const s = score(generateQuiz(game.seed, seasonsFor(game.era)), answers);
  db.prepare('UPDATE games SET device = ?, nick = ?, score = ?, ms = ? WHERE id = ?').run(device, name, s, ms, gameId);
  const { rank } = db.prepare(`SELECT COUNT(*) + 1 AS rank FROM (${BEST}) WHERE score > ? OR (score = ? AND ms < ?)`)
    .get(game.era, s, s, ms) as { rank: number };
  res.json({ score: s, rank });
});

// GET /api/quiz/leaderboard?era= → top 20, one row per device
router.get('/leaderboard', (req, res) => {
  res.json(db.prepare(`${BEST} ORDER BY score DESC, ms ASC LIMIT 20`).all(eraOf(req.query.era)));
});

// GET /api/quiz/result/:id → a finished game, for share links
router.get('/result/:id', (req, res) => {
  const row = db.prepare('SELECT nick, era, score, ms FROM games WHERE id = ? AND score IS NOT NULL').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

export default router;
