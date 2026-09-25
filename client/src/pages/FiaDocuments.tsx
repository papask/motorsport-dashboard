import { useApi } from '../hooks/useApi';
import { getFiaDocuments } from '../services/api';
import { useLang, useT } from '../i18n';
import PageMasthead from '../components/PageMasthead';
import StateBlock from '../components/StateBlock';
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

export default function FiaDocuments() {
  const t = useT();
  const { lang } = useLang();
  const { data, loading, error, refetch, failures } = useApi<{ documents: FiaDocument[] }>(getFiaDocuments, []);

  if (loading) return (
    <div className="page-container">
      <div className="loading-container" aria-busy="true"><div className="loading-spinner" /><div className="loading-text">{t('loadingData')}</div></div>
    </div>
  );
  if (error) return (
    <div className="page-container">
      <ErrorBanner detail={error} onRetry={refetch} attempts={failures} />
    </div>
  );

  const docs = data?.documents ?? [];
  // Documents arrive newest first; keep that order within and across events
  const events = [...new Set(docs.map((d) => d.event))];

  return (
    <div className="page-container">
      <PageMasthead kicker={t('fiaKicker')} title={t('fiaTitle')} subtitle="FiA Documents" />

      {docs.length === 0 && <StateBlock title={t('fiaEmpty')} reason={t('fiaEmptyReason')} />}

      {events.map((event) => (
        <section key={event} style={{ marginBottom: 32 }}>
          <h2 className="k" style={{ marginBottom: 12 }}>{event}</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {docs.filter((d) => d.event === event).map((d) => {
              const s = d.summary;
              const lines = s ? (lang === 'en' ? s.summary_en : s.summary_ko) : [];
              const category = s && CATEGORY_KEYS[s.category as keyof typeof CATEGORY_KEYS];
              return (
                <article key={d.url} className="card" style={{ padding: '16px 20px' }}>
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
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
