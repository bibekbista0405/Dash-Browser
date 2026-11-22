import { create } from 'zustand';
import { DEFAULT_SETTINGS, type DashSettings } from '../../shared/ipc-channels';

interface SettingsStore {
  settings: DashSettings;
  isLoaded: boolean;
  load: () => Promise<void>;
  subscribe: () => () => void;
  set: <K extends keyof DashSettings>(key: K, value: DashSettings[K]) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  load: async () => {
    const settings = await window.dash.settings.getAll();
    set({ settings, isLoaded: true });
  },

  subscribe: () => {
    return window.dash.settings.onChanged((settings) => set({ settings }));
  },

  set: async (key, value) => {
    await window.dash.settings.set(key, value);
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
  },

  reset: async () => {
    await window.dash.settings.reset();
    set({ settings: DEFAULT_SETTINGS });
  },
}));
