import { create } from 'zustand';
import { DEFAULT_VPN_CONFIG, type VpnState } from '../../shared/ipc-channels';

const INITIAL: VpnState = {
  status: 'off',
  config: DEFAULT_VPN_CONFIG,
  hasPassword: false,
  passwordPersisted: false,
  encryptionAvailable: false,
  error: null,
  since: null,
};

interface VpnStore {
  state: VpnState;
  /** Loads the current state and keeps it live. Returns an unsubscribe function. */
  start: () => () => void;
}

export const useVpnStore = create<VpnStore>((set) => ({
  state: INITIAL,
  start: () => {
    void window.dash.vpn.getState().then((state) => set({ state })).catch(() => undefined);
    return window.dash.vpn.onChanged((state) => set({ state }));
  },
}));
