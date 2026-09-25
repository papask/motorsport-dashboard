import { Fragment, useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import useCountdown from '../hooks/useCountdown';
import AdSlot from '../components/AdSlot';
import { getFiaDocuments } from '../services/api';
import { useLang, useT } from '../i18n';
import PageMasthead from '../components/PageMasthead';
import StateBlock from '../components/StateBlock';
import RoundSelector from '../components/RoundSelector';
import ErrorBanner from '../components/ErrorBanner';
import { formatLocalShort, getLocalTZLabel } from '../utils/raceDate';

interface FiaDocument {
  url: string;
  event: string;
  title: string;
  published: string; // UTC ISO
  status: 'summarized' | 'skipped' | 'failed';
  summary?: { title_ko: string; category: string; summary_ko: string[]; summary_en: string[] };
}

const CATEGORY_KEYS = {
  penalty: 'fiaCatPenalty',
  no_action: 'fiaCatNoAction',
  summons: 'fiaCatSummons',
  race_director: 'fiaCatRaceDirector',
  technical: 'fiaCatTechnical',
  other: 'fiaCatOther',
} as const;

interface FiaResponse {
  events: string[]; // oldest first, e.g. "2026 Singapore Grand Prix"
  event: string | null;
  documents: FiaDocument[];
  nextCheck: string | null; // null while the server's watcher is off
  checkEveryMin: number;
}

export default function FiaDocuments() {
  const t = useT();
  const { lang } = useLang();
  // null = let the server pick the latest event
  const [event, setEvent] = useState<string | null>(null);
  const { data, loading, error, refetch, failures, refresh } = useApi<FiaResponse>((signal) => getFiaDocuments(event, signal), [event]);
  // Keep the selector and countdown up while the next event loads (useApi clears data on a switch)
  const last = useRef<FiaResponse | null>(null);
  if (data) last.current = data;
  const events = last.current?.events ?? [];
  const selected = event ?? data?.event ?? null;
  const docs = data?.documents ?? [];

  // Reload quietly just after the server's next check. While a check is still
  // running its nextCheck has already passed, so this retries every minute.
  const nextCheck = last.current?.nextCheck ?? null;
  useEffect(() => {
    if (!data?.nextCheck) return;
    const id = setTimeout(refresh, Math.max(Date.parse(data.nextCheck) - Date.now() + 30_000, 60_000));
    return () => clearTimeout(id);
  }, [data]);
  const { minutes, seconds } = useCountdown(nextCheck);
  const remaining = minutes + seconds > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : null;
  const kicker = [
    t('fiaKicker', { n: last.current?.checkEveryMin ?? 30 }),
    nextCheck && (remaining ? t('fiaNextCheck', { time: remaining }) : t('fiaChecking')),
  ].filter(Boolean).join(' · ');

  // keep-all: Korean wraps at spaces instead of mid-word; break-word still
  // lets a single over-long token (a URL, an article number) wrap.
  return (
    <div className="page-container" style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
      <PageMasthead
        kicker={kicker}
        title={t('fiaTitle')}
        subtitle="FiA Documents"
        aside={events.length > 0 && (
          <div className="masthead-controls">
            <RoundSelector
              rounds={events.map((e, i) => ({ round: i, raceName: e, label: e }))}
              value={selected == null ? null : events.indexOf(selected)}
              onChange={(i) => setEvent(events[i])}
            />
          </div>
        )}
      />

      {loading ? (
        <div className="loading-container" aria-busy="true"><div className="loading-spinner" /><div className="loading-text">{t('loadingData')}</div></div>
      ) : error ? (
        <ErrorBanner detail={error} onRetry={refetch} attempts={failures} />
      ) : docs.length === 0 ? (
        <StateBlock title={t('fiaEmpty')} reason={t('fiaEmptyReason')} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {docs.map((d, i) => {
            const s = d.summary;
            const lines = s ? (lang === 'en' ? s.summary_en : s.summary_ko) : [];
            const category = s && CATEGORY_KEYS[s.category as keyof typeof CATEGORY_KEYS];
            const shown = i + 1;
            return (
              <Fragment key={d.url}>
              <article className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  {category && <span className="stat-badge" style={{ fontSize: 11 }}>{t(category)}</span>}
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatLocalShort({ date: d.published.slice(0, 10), time: d.published.slice(11) })} {getLocalTZLabel()}</span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                  {s && lang !== 'en' ? s.title_ko : d.title}
                </h3>
                {s && lang !== 'en' && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{d.title}</div>
                )}
                {lines.length > 0 && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.6, fontSize: 14 }}>
                    {lines.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                )}
                {!s && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '8px 0 0' }}>
                    {t(d.status === 'failed' ? 'fiaFailed' : 'fiaNotSummarized')}
                  </p>
                )}
                <a href={d.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 13 }}>
                  {t('fiaOriginal')} ↗
                </a>
              </article>
              {shown % 10 === 0 && shown < docs.length && <AdSlot />}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
