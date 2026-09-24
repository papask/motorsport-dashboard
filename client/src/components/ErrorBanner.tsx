import { useT } from '../i18n';

interface Props {
  /** Raw message from the failed request — endpoint, status, whatever we got. */
  detail?: string | null;
  onRetry?: () => void;
  /** How many times this request has failed in a row. */
  attempts?: number;
  /** True when stale content is still on screen underneath. */
  keepsData?: boolean;
}

/** Shown after three consecutive failures — at that point it is not transient. */
const STATUS_PAGE = 'https://status.jolpi.ca/';
const PERSISTENT_AFTER = 3;

/**
 * A failure that sits above the data instead of replacing it.
 *
 * Wiping the table on a refresh failure costs the reader what they were already
 * looking at, for no gain — the previous round's results are still true. So the
 * banner reports the failure, says the figures below may be stale, and offers a
 * retry. Red is not used: it belongs to race control.
 */
export default function ErrorBanner({ detail, onRetry, attempts = 1, keepsData }: Props) {
  const t = useT();
  const persistent = attempts >= PERSISTENT_AFTER;

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-body">
        <strong className="error-banner-title">{t('errorLoadTitle')}</strong>
        <span className="en">
          {keepsData ? t('errorKeepsData') : t('errorLoadReason')}
        </span>
        {detail && <span className="error-banner-detail">{detail}</span>}
        {persistent && (
          <span className="en">
            {t('errorPersistent', { n: attempts })}{' '}
            <a href={STATUS_PAGE} target="_blank" rel="noreferrer">
              {t('errorStatusPage')}
            </a>
          </span>
        )}
      </div>
      {onRetry && (
        <button type="button" className="btn-primary" onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  );
}
