import { useEffect, useState } from 'react';
import { getFeatures } from '../services/api';

type Features = { nextRace: boolean };

// One request per page load, shared by every caller. Until it answers, and if
// it fails, everything optional counts as off.
let pending: Promise<Features> | null = null;
let known: Features | null = null;

export default function useFeatures(): Features & { loaded: boolean } {
  const [features, setFeatures] = useState<Features | null>(known);
  useEffect(() => {
    if (known) return;
    pending ??= getFeatures().catch(() => ({ nextRace: false }));
    pending.then((f) => {
      known = f;
      setFeatures(f);
    });
  }, []);
  return { nextRace: false, ...features, loaded: features !== null };
}
