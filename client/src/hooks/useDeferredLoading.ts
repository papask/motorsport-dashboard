import { useEffect, useState } from 'react';

/**
 * True only once `loading` has stayed true past `delay`.
 *
 * A fetch that resolves in 150ms would otherwise flash a skeleton on screen and
 * remove it again, which reads as a glitch. Waiting 400ms means fast responses
 * paint straight to content and only genuinely slow ones show placeholder.
 */
export default function useDeferredLoading(loading: boolean, delay = 400): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(id);
  }, [loading, delay]);

  return show;
}
