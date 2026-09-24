import { useCallback, useEffect, useState } from 'react';

/**
 * Theme preference. `system` is the default and the product's intended
 * behaviour: no `data-theme` attribute is set, so the palette in tokens.css
 * follows `prefers-color-scheme`. The other two pin the attribute and win over
 * the OS in both directions.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-pref';

function isPref(value: unknown): value is ThemePref {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Read the stored preference. Storage can throw in a locked-down browser. */
function readStored(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isPref(raw)) return raw;
  } catch {
    /* private mode or blocked site data — fall through to the OS default */
  }
  return 'system';
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

// Apply once at module load, before React paints, so there is no flash of the
// wrong theme on a hard refresh.
apply(readStored());

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readStored);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* preference just won't survive a reload */
    }
  }, []);

  // Keep other tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isPref(e.newValue)) {
        setPrefState(e.newValue);
        apply(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { pref, setPref };
}
