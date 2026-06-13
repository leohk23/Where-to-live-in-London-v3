import { useEffect, useState } from 'react';

// Collapsed/expanded state for a section, persisted across visits.
export function usePersistedCollapse(key: string) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });

  // Only the collapsed state is remembered; expanded (the default) clears the entry.
  useEffect(() => {
    try {
      if (collapsed) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch {
      // Storage unavailable (private mode etc.) — state simply won't persist.
    }
  }, [key, collapsed]);

  return { collapsed, setCollapsed, toggle: () => setCollapsed(c => !c) };
}
