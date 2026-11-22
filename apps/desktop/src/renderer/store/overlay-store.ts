import { create } from 'zustand';
import type { OverlaySnapshot } from '../../shared/ipc-channels';

/** Picture of the page painted behind chrome overlays while the native page view is hidden. */
interface OverlayStore {
  snapshot: OverlaySnapshot | null;
  setSnapshot: (snapshot: OverlaySnapshot | null) => void;
  /** Clears the snapshot only if it is still this one (a newer overlay may have replaced it). */
  clearIfSame: (snapshot: OverlaySnapshot | null) => void;
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
  clearIfSame: (snapshot) => {
    if (get().snapshot === snapshot) set({ snapshot: null });
  },
}));
