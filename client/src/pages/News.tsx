import { Fragment } from 'react';
import { useApi } from '../hooks/useApi';
import AdSlot from '../components/AdSlot';
import { getNews } from '../services/api';
import { useT } from '../i18n';
import PageMasthead from '../components/PageMasthead';
import StateBlock from '../components/StateBlock';
import ErrorBanner from '../components/ErrorBanner';
import { formatLocalShort, getLocalTZLabel } from '../utils/raceDate';

interface NewsArticle {
  url: string;
  title: string; // the outlet's headline
  published: string; // UTC ISO
  title_ko: string;
  summary_ko: string[];
  also: { url: string; title: string }[];
}

const host = (url: string) => new URL(url).host.replace(/^www\./, '');

export default function News() {
  const t = useT();
  const { data, loading, error, refetch, failures } = useApi<NewsArticle[]>((signal) => getNews(signal), []);
  const articles = data ?? [];

  return (
    <div className="page-container" style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
      <PageMasthead kicker={t('newsKicker')} title={t('newsTitle')} subtitle="News" />

      {loading ? (
        <div className="loading-container" aria-busy="true"><div className="loading-spinner" /><div className="loading-text">{t('loadingData')}</div></div>
      ) : error ? (
        <ErrorBanner detail={error} onRetry={refetch} attempts={failures} />
      ) : articles.length === 0 ? (
        <StateBlock title={t('newsEmpty')} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {articles.map((a, i) => (
            <Fragment key={a.url}>
              <article className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className="stat-badge" style={{ fontSize: 11 }}>{host(a.url)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatLocalShort({ date: a.published.slice(0, 10), time: a.published.slice(11) })} {getLocalTZLabel()}</span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{a.title_ko}</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{a.title}</div>
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.6, fontSize: 14 }}>
                  {a.summary_ko.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 13 }}>
                  {t('newsOriginal')} ↗
                </a>
                {a.also.length > 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
                    {t('newsAlso')}:{' '}
                    {a.also.map((o, j) => (
                      <Fragment key={o.url}>
                        {j > 0 && ' · '}
                        <a href={o.url} target="_blank" rel="noreferrer" title={o.title}>{host(o.url)}</a>
                      </Fragment>
                    ))}
                  </div>
                )}
              </article>
              {(i + 1) % 10 === 0 && i + 1 < articles.length && <AdSlot />}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
