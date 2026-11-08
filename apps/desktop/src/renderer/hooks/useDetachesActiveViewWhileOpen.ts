import { useEffect } from 'react';
import { useOverlayStore } from '../store/overlay-store';

/**
 * Detaches the native page view while a chrome overlay is open so it is not
 * hidden behind it, and paints a snapshot of the page in its place so the
 * page doesn't appear to vanish.
 */
export function useDetachesActiveViewWhileOpen(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void window.dash.overlay.push().then((snapshot) => {
      if (!cancelled) useOverlayStore.getState().setSnapshot(snapshot);
    });
    return () => {
      cancelled = true;
      useOverlayStore.getState().setSnapshot(null);
      void window.dash.overlay.pop();
    };
  }, [isOpen]);
}
