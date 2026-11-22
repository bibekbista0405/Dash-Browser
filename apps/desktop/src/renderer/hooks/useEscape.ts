import { useEffect } from 'react';

/** Calls `onEscape` when Escape is pressed while `active` (default true) — for menus and popups. */
export function useEscape(onEscape: () => void, active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape, active]);
}
