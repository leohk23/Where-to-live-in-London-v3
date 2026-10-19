import { useEffect, useRef } from 'react';

// For a <details> used as a dropdown menu: it closes when you tap anywhere else or press Escape.
export function useDismissableDetails() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => ref.current?.removeAttribute('open');
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) {
        close();
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return { ref, close: () => ref.current?.removeAttribute('open') };
}
