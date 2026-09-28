import { useEffect, useState } from 'react';
import { getFeatures } from '../services/api';

type Features = { nextRace: boolean; calendar: boolean };
const OFF: Features = { nextRace: false, calendar: false };

// One request per page load, shared by every caller. Until it answers, and if
// it fails, everything optional counts as off.
let pending: Promise<Features> | null = null;
let known: Features | null = null;

export default function useFeatures(): Features & { loaded: boolean } {
  const [features, setFeatures] = useState<Features | null>(known);
  useEffect(() => {
    if (known) return;
    pending ??= getFeatures().then((f) => ({ ...OFF, ...f })).catch(() => OFF);
    pending.then((f) => {
      known = f;
      setFeatures(f);
    });
  }, []);
  return { ...OFF, ...features, loaded: features !== null };
}
