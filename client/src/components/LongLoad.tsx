import { useEffect, useState } from 'react';
import { useT } from '../i18n';

/**
 * The one place a spinner is still right: telemetry's first request warms a
 * FastF1 cache and can take one to two minutes. A skeleton would imply the data
 * is nearly here; a ring plus an elapsed counter says work is in progress and
 * lets the viewer judge whether to wait.
 *
 * The page header and selectors stay mounted around this — only the chart area
 * is replaced.
 */
export default function LongLoad({ hint }: { hint: string }) {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="long-load" aria-busy="true" aria-live="polite">
      <div className="long-load-ring" aria-hidden="true" />
      <div>
        <div className="long-load-hint">{hint}</div>
        <div className="en" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {t('elapsed')} {mm}:{ss}
        </div>
      </div>
    </div>
  );
}
