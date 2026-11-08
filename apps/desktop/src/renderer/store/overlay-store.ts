import { create } from 'zustand';

/** Snapshot of the page painted behind chrome overlays while the native page view is detached. */
interface OverlayStore {
  snapshot: string | null;
  setSnapshot: (snapshot: string | null) => void;
}

export const useOverlayStore = create<OverlayStore>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}));
