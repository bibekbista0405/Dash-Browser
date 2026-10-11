import { useEffect } from 'react';

/** Detaches the native page view while a chrome overlay is open so it is not hidden behind it. */
export function useDetachesActiveViewWhileOpen(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    void window.dash.overlay.push();
    return () => {
      void window.dash.overlay.pop();
    };
  }, [isOpen]);
}
