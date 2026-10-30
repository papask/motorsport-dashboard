import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageMasthead from '../components/PageMasthead';
import { useT, type MessageKey } from '../i18n';
import { getCountryNameKR, getDriverNameKR, getTeamNameKR } from '../constants/koreanTerms';
import {
  getQuizLeaderboard, getQuizResult, startQuiz, submitQuiz, type QuizEntry, type QuizQuestion,
} from '../services/api';

// Same rules as server/src/services/quizService.ts
const LIVES = 3;
const REVEAL_MS = 1100;
const timeLimit = (n: number) => (n <= 10 ? 8 : n <= 20 ? 6 : 5);
const ERAS = ['all', 'pre2000', '2000s', '2010s', '2020s'] as const;
type Era = (typeof ERAS)[number];

// localStorage can be blocked (private mode); the game still runs without it
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

function deviceId() {
  let id = store.get('quiz.device');
  if (!id) store.set('quiz.device', (id = crypto.randomUUID()));
  return id;
}

const formatMs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

type Phase = 'home' | 'play' | 'done';
interface Played { q: QuizQuestion; pick: boolean | null }

export default function Quiz() {
  const t = useT();
  const [params] = useSearchParams();
  const vsId = params.get('vs');
  const [phase, setPhase] = useState<Phase>('home');
  const [nick, setNick] = useState(() => store.get('quiz.nick') || `F1fan${Math.floor(Math.random() * 900 + 100)}`);
  const [era, setEra] = useState<Era>('all');
  const bestKey = `quiz.best.${era}`;
  const best = Number(store.get(bestKey)) || 0; // finishing a game re-renders, so this stays fresh
  const [board, setBoard] = useState<QuizEntry[]>([]);
  const [vs, setVs] = useState<Omit<QuizEntry, 'id'> & { era: string } | null>(null);
  const [error, setError] = useState('');

  const [game, setGame] = useState<{ gameId: string; questions: QuizQuestion[] } | null>(null);
  const [played, setPlayed] = useState<Played[]>([]);
  const [revealing, setRevealing] = useState(false);
  const started = useRef(0);
  const [result, setResult] = useState<{ score: number; rank: number | null; ms: number } | null>(null);

  useEffect(() => { getQuizLeaderboard(era).then(setBoard).catch(() => {}); }, [phase, era]);
  // A challenge link opens on the challenger's era
  useEffect(() => {
    if (vsId) getQuizResult(vsId).then((r) => { setVs(r); if ((ERAS as readonly string[]).includes(r.era)) setEra(r.era as Era); }).catch(() => {});
  }, [vsId]);

  const misses = played.filter((p) => p.pick !== p.q.answer).length;
  const right = played.length - misses;
  const n = played.length + 1;
  const current = game?.questions[played.length];

  async function start() {
    setError('');
    store.set('quiz.nick', nick.trim());
    try {
      setGame(await startQuiz(era));
      setPlayed([]);
      setResult(null);
      setRevealing(false);
      started.current = Date.now();
      setPhase('play');
    } catch {
      setError(t('quizLoadError'));
    }
  }

  async function finish(all: Played[], g: NonNullable<typeof game>) {
    const ms = Date.now() - started.current;
    const score = all.filter((p) => p.pick === p.q.answer).length;
    setResult({ score, rank: null, ms });
    setPhase('done');
    if (score > best) store.set(bestKey, String(score));
    try {
      const r = await submitQuiz({ gameId: g.gameId, device: deviceId(), nick: nick.trim(), answers: all.map((p) => p.pick), ms });
      setResult({ score: r.score, rank: r.rank, ms });
      getQuizLeaderboard(era).then(setBoard).catch(() => {});
    } catch {
      setError(t('quizSubmitError'));
    }
  }

  function answer(pick: boolean | null) {
    if (!current || !game || revealing) return;
    const all = [...played, { q: current, pick }];
    setPlayed(all);
    setRevealing(true);
    const over = all.filter((p) => p.pick !== p.q.answer).length >= LIVES || all.length >= game.questions.length;
    setTimeout(() => {
      setRevealing(false);
      if (over) finish(all, game);
    }, REVEAL_MS);
  }

  // Statement in the reader's language; names go through the same maps as the rest of the site
  function statement(q: QuizQuestion) {
    const p: Record<string, string | number> = { ...q.params };
    if (p.driverId) p.driver = getDriverNameKR(String(p.driverId), String(p.driver));
    if (p.driver2Id) p.driver2 = getDriverNameKR(String(p.driver2Id), String(p.driver2));
    if (p.team) p.team = getTeamNameKR(String(p.team));
    if (p.country) p.country = getCountryNameKR(String(p.country));
    return t(q.template as MessageKey, p);
  }

  async function share(score: number) {
    const url = `${location.origin}/quiz?vs=${game?.gameId}`;
    const text = t('quizShareText', { n: score });
    try {
      if (navigator.share) await navigator.share({ text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setError(t('quizCopied')); }
    } catch { /* share sheet dismissed */ }
  }

  const last = played[played.length - 1];
  const shown = revealing ? last : null; // the card under reveal is the one just answered
  const card = shown?.q ?? current;
  const lastMiss = [...played].reverse().find((p) => p.pick !== p.q.answer);

  return (
    <div className="page-container quiz-page">
      <PageMasthead kicker={t('quizKicker')} title={t('quizTitle')} subtitle={t('quizIntro')} />

      {phase === 'home' && (
        <section className="quiz-home card">
          {vs && <p className="quiz-vs">{t('quizVs', { nick: vs.nick, n: vs.score })}</p>}
          <div className="tabs quiz-eras" role="radiogroup" aria-label={t('quizEra')}>
            {ERAS.map((e) => (
              <button key={e} role="radio" aria-checked={era === e} className={`tab ${era === e ? 'is-active' : ''}`} onClick={() => setEra(e)}>
                {t(`quizEra_${e}`)}
              </button>
            ))}
          </div>
          <label className="quiz-nick">
            <span>{t('quizNick')}</span>
            <input className="admin-input" value={nick} maxLength={12} onChange={(e) => setNick(e.target.value)} />
          </label>
          <button className="btn-primary quiz-start" disabled={!nick.trim()} onClick={start}>{t('quizStart')}</button>
          {best > 0 && <p className="quiz-muted">{t('quizBest', { n: best })}</p>}
        </section>
      )}

      {phase === 'play' && card && (
        <section className="quiz-play">
          <div className="quiz-status">
            <span aria-label={t('quizLives', { n: LIVES - misses })}>
              {'♥'.repeat(Math.max(0, LIVES - misses))}<span className="quiz-lost">{'♥'.repeat(Math.min(LIVES, misses))}</span>
            </span>
            <span className="num">Q{shown ? n - 1 : n}</span>
            <span className="num">{right}</span>
          </div>
          <div
            key={n}
            className="quiz-timer"
            style={{ animationDuration: `${timeLimit(n)}s`, animationPlayState: revealing ? 'paused' : 'running' }}
            onAnimationEnd={() => answer(null)}
          />
          <div className="quiz-card card" aria-live="polite">
            <p className="quiz-statement">{statement(card)}</p>
            {shown && (
              <span className={`quiz-stamp ${shown.pick === shown.q.answer ? 'is-right' : 'is-wrong'}`}>
                {shown.pick === null ? t('quizTimeout') : shown.pick === shown.q.answer ? t('quizRight') : t('quizWrong')}
              </span>
            )}
          </div>
          <div className="quiz-answers">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                className={`quiz-answer ${shown && shown.q.answer === v ? 'is-answer' : ''}`}
                disabled={revealing}
                onClick={() => answer(v)}
              >
                {v ? `○ ${t('quizTrue')}` : `✕ ${t('quizFalse')}`}
              </button>
            ))}
          </div>
        </section>
      )}

      {phase === 'done' && result && (
        <section className="quiz-done card">
          <p className="quiz-score num">{t('quizScore', { n: result.score })}</p>
          <p className="quiz-muted">
            {formatMs(result.ms)}
            {result.rank != null && ` · ${t('quizRank', { rank: result.rank })}`}
            {` · ${t('quizBest', { n: best })}`}
          </p>
          {vs && <p className="quiz-vs">{t(result.score > vs.score ? 'quizBeat' : 'quizLost', { nick: vs.nick })}</p>}
          {lastMiss && (
            <div className="quiz-missed">
              <div className="k">{t('quizMissed')}</div>
              <p>{statement(lastMiss.q)}</p>
              <p className="quiz-muted">{t('quizAnswerWas', { a: t(lastMiss.q.answer ? 'quizTrue' : 'quizFalse') })}</p>
            </div>
          )}
          <div className="quiz-actions">
            <button className="btn-primary" onClick={start}>{t('quizAgain')}</button>
            <button className="btn-secondary" onClick={() => share(result.score)}>{t('quizShare')}</button>
          </div>
        </section>
      )}

      {error && <p className="quiz-muted" role="status">{error}</p>}

      {phase !== 'play' && board.length > 0 && (
        <section className="quiz-board card">
          <h2 className="card-title">{t('quizLeaderboard')} · {t(`quizEra_${era}`)}</h2>
          <ol>
            {board.slice(0, 10).map((e, i) => (
              <li key={e.id} className={e.id === game?.gameId ? 'is-me' : ''}>
                <span><span className="num">{i + 1}.</span> {e.nick}</span>
                <span className="num">{e.score} · {formatMs(e.ms)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
