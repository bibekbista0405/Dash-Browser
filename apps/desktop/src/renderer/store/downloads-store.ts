import { create } from 'zustand';
import type { DownloadEntry } from '../../shared/ipc-channels';

interface DownloadsStore {
  downloads: DownloadEntry[];
  hasActive: boolean;
  /** bytes/sec per download id, computed from real receivedBytes deltas — not simulated. */
  speeds: Record<number, number>;
  load: () => Promise<void>;
  subscribe: () => () => void;
  cancel: (id: number) => Promise<void>;
  pause: (id: number) => Promise<void>;
  resume: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clearCompleted: () => Promise<void>;
  openFile: (savePath: string) => Promise<void>;
  showInFolder: (savePath: string) => Promise<void>;
  startDrag: (savePath: string) => Promise<void>;
}

/** Module-scoped so it survives store re-subscriptions; keyed by download id. */
const lastSample = new Map<number, { bytes: number; time: number }>();

function computeSpeed(id: number, receivedBytes: number): number {
  const now = Date.now();
  const prev = lastSample.get(id);
  lastSample.set(id, { bytes: receivedBytes, time: now });
  if (!prev) return 0;
  const deltaTimeSec = (now - prev.time) / 1000;
  if (deltaTimeSec < 0.15) return -1; // too soon to get a stable reading — caller keeps the previous value
  const deltaBytes = receivedBytes - prev.bytes;
  return Math.max(0, deltaBytes / deltaTimeSec);
}

export const useDownloadsStore = create<DownloadsStore>((set) => ({
  downloads: [],
  hasActive: false,
  speeds: {},

  load: async () => {
    const downloads = await window.dash.downloads.list();
    set({ downloads, hasActive: downloads.some((d) => d.state === 'progressing') });
  },

  subscribe: () => {
    return window.dash.downloads.onStateChanged((incoming) => {
      set((s) => {
        const exists = s.downloads.some((d) => d.id === incoming.id);
        const downloads = exists
          ? s.downloads.map((d) => (d.id === incoming.id ? incoming : d))
          : [incoming, ...s.downloads];

        let speeds = s.speeds;
        if (incoming.state === 'progressing') {
          const measured = computeSpeed(incoming.id, incoming.receivedBytes);
          if (measured >= 0) speeds = { ...s.speeds, [incoming.id]: measured };
        } else {
          lastSample.delete(incoming.id);
          if (incoming.id in s.speeds) {
            speeds = { ...s.speeds };
            delete speeds[incoming.id];
          }
        }

        return { downloads, hasActive: downloads.some((d) => d.state === 'progressing'), speeds };
      });
    });
  },

  cancel: async (id: number) => {
    await window.dash.downloads.cancel(id);
  },

  pause: async (id: number) => {
    await window.dash.downloads.pause(id);
  },

  resume: async (id: number) => {
    await window.dash.downloads.resume(id);
  },

  remove: async (id: number) => {
    await window.dash.downloads.remove(id);
    set((s) => ({ downloads: s.downloads.filter((d) => d.id !== id) }));
  },

  clearCompleted: async () => {
    const removable = useDownloadsStore
      .getState()
      .downloads.filter((d) => d.state === 'completed' || d.state === 'cancelled' || d.state === 'interrupted');
    await Promise.all(removable.map((d) => window.dash.downloads.remove(d.id)));
    set((s) => ({
      downloads: s.downloads.filter(
        (d) => !(d.state === 'completed' || d.state === 'cancelled' || d.state === 'interrupted')
      ),
    }));
  },

  openFile: async (savePath: string) => {
    await window.dash.downloads.openFile(savePath);
  },

  showInFolder: async (savePath: string) => {
    await window.dash.downloads.showInFolder(savePath);
  },

  startDrag: async (savePath: string) => {
    await window.dash.downloads.startDrag(savePath);
  },
}));
