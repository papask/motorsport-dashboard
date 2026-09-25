/**
 * Visitor analytics. Fill in the ids after creating the projects — an empty id
 * loads nothing. Both ids are public (they sit in the page source anyway), so
 * they live here rather than in an env var, like the AdSense settings.
 *
 * - Microsoft Clarity (clarity.microsoft.com): heatmaps and session recordings
 * - Google Analytics 4 (analytics.google.com): visitors, pages, countries, referrers
 *
 * Both follow client-side route changes on their own (Clarity watches history,
 * GA4's enhanced measurement counts history changes as page views).
 */
const ANALYTICS = {
  clarityId: '', // Clarity project id, e.g. 'abcd1234ef'
  gaId: '',      // GA4 measurement id, e.g. 'G-XXXXXXXXXX'
};

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function loadScript(src: string) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function initAnalytics() {
  // Keep local development out of the numbers
  if (import.meta.env.DEV) return;

  if (ANALYTICS.clarityId) {
    // Queue calls until the tag loads, as Clarity's own snippet does
    window.clarity ??= Object.assign(
      (...args: unknown[]) => { (window.clarity!.q ??= []).push(args); },
      { q: [] as unknown[] },
    );
    loadScript(`https://www.clarity.ms/tag/${ANALYTICS.clarityId}`);
  }

  if (ANALYTICS.gaId) {
    window.dataLayer ??= [];
    // gtag.js expects the arguments object itself, not an array
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', ANALYTICS.gaId);
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${ANALYTICS.gaId}`);
  }
}
