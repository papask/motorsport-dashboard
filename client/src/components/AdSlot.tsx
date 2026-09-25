import { useEffect, useRef } from 'react';
import { useT } from '../i18n';

/**
 * AdSense settings. Fill these in after approval — until `client` and the slot
 * are set, every <AdSlot> renders nothing. The publisher id is public (it sits
 * in the page source anyway), so it lives here rather than in an env var.
 */
const ADSENSE = {
  client: '',          // 'ca-pub-XXXXXXXXXXXXXXXX'
  infeedSlot: '',      // in-feed ad unit's data-ad-slot (FiA document list)
  infeedLayoutKey: '', // in-feed ad unit's data-ad-layout-key
  displaySlot: '',     // responsive display ad unit's data-ad-slot (standings pages)
};

// Set to true to outline unconfigured slots on the dev server (never in production).
const SHOW_PREVIEW = false;

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

function loadScript(client: string) {
  if (document.querySelector('script[data-adsbygoogle]')) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  s.crossOrigin = 'anonymous';
  s.dataset.adsbygoogle = '';
  document.head.appendChild(s);
}

/**
 * An ad labelled as such. `infeed` sits between list items; `display` is a
 * responsive banner for a free block of the page. Hidden if unconfigured or unfilled.
 */
export default function AdSlot({ variant = 'infeed' }: { variant?: 'infeed' | 'display' }) {
  const t = useT();
  const pushed = useRef(false);
  const slot = variant === 'infeed' ? ADSENSE.infeedSlot : ADSENSE.displaySlot;
  const enabled = !!(ADSENSE.client && slot);

  useEffect(() => {
    // Guard: StrictMode re-runs effects on the same <ins>, and a second push
    // for one slot makes AdSense throw.
    if (!enabled || pushed.current) return;
    pushed.current = true;
    loadScript(ADSENSE.client);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }, [enabled]);

  if (!enabled) {
    // Dev server only: outline where the ad would go, so placement can be
    // checked before AdSense is set up. Production builds render nothing.
    if (!import.meta.env.DEV || !SHOW_PREVIEW) return null;
    return (
      <div className="ad-slot-preview" style={{ height: variant === 'infeed' ? 120 : 250 }}>
        {t('adLabel')} · {variant}
      </div>
    );
  }

  return (
    <aside className="ad-slot" aria-label={t('adLabel')}>
      <span className="ad-slot-label">{t('adLabel')}</span>
      {variant === 'infeed' ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={ADSENSE.client}
          data-ad-slot={slot}
          data-ad-format="fluid"
          data-ad-layout-key={ADSENSE.infeedLayoutKey}
        />
      ) : (
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={ADSENSE.client}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </aside>
  );
}
