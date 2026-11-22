import { useEffect } from 'react';
import { useOverlayStore } from '../store/overlay-store';

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Hides the native page view while a chrome overlay is open (a native view always draws above the toolbar's HTML, so
 * it would cover the dropdown), with a snapshot of the page painted in its place so the page doesn't vanish.
 *
 * Order matters, to avoid a blank frame at either end:
 *   open:  capture snapshot -> paint it and wait for it to be on screen -> only then hide the page view
 *   close: show the page view again -> keep the snapshot underneath for a few frames -> remove it
 */
export function useDetachesActiveViewWhileOpen(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let mine: ReturnType<typeof useOverlayStore.getState>['snapshot'] = null;
    void (async () => {
      mine = await window.dash.overlay.push();
      if (cancelled) return;
      if (mine) {
        useOverlayStore.getState().setSnapshot(mine);
        await nextFrame(); // one frame is enough for the picture to be on screen; more only adds delay
      }
      if (cancelled) return;
      await window.dash.overlay.commit();
    })();
    return () => {
      cancelled = true;
      void window.dash.overlay.pop().then(() => {
        // The page view is visible again; leave the snapshot under it for a moment so no gap can show.
        setTimeout(() => useOverlayStore.getState().clearIfSame(mine), 150);
      });
    };
  }, [isOpen]);
}
