import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { MESSAGES, type Lang, type MessageKey } from './messages';

export type { Lang, MessageKey };

const STORAGE_KEY = 'app.lang';

// Initial language: a persisted choice wins, otherwise the browser locale
// ("ko*" → Korean, everything else → English).
export function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch { /* localStorage unavailable */ }
  const nav =
    (typeof navigator !== 'undefined' &&
      (navigator.language || (navigator.languages && navigator.languages[0]))) || '';
  return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

// Module-global current language. Pure helper functions (getTeamName, the
// UI_LABELS proxy, raceDate formatters…) are called deep inside render where a
// React hook isn't available, so they read this. LanguageProvider keeps it in
// sync synchronously during render, before any descendant reads it.
let _lang: Lang = detectInitialLang();

export function getLang(): Lang {
  return _lang;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

// Translate a key in the current language, with {placeholder} interpolation.
// Falls back to Korean, then to the raw key, if a message is missing.
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const table = MESSAGES[_lang] || MESSAGES.ko;
  const raw = (table as Record<string, string>)[key]
    ?? (MESSAGES.ko as Record<string, string>)[key]
    ?? key;
  return interpolate(raw, vars);
}

interface LanguageCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LanguageCtx>({ lang: _lang, setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(_lang);

  // Sync the module global on every render so non-hook helpers invoked further
  // down the same render tree observe the up-to-date language.
  _lang = lang;

  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    try { document.documentElement.lang = l; } catch { /* ignore */ }
    _lang = l;
    setLangState(l);
  }, []);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

// Subscribe a component to language changes. Returning `t` (bound to the module
// global) is enough because consuming the context re-renders the component — and
// the whole subtree beneath it — whenever the language flips.
export function useLang(): LanguageCtx {
  return useContext(LanguageContext);
}

export function useT(): typeof t {
  useContext(LanguageContext);
  return t;
}
