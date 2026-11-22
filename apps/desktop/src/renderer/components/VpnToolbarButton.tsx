import { useEffect, useState } from 'react';
import { useVpnStore } from '../store/vpn-store';

const LABEL = {
  off: 'VPN is off. Click to turn on',
  connecting: 'VPN: connecting…',
  on: 'VPN is on. Browser traffic goes through your VPN server. Click to turn off',
  error: 'VPN problem. Click to open VPN settings',
} as const;

/** Toolbar switch for the VPN. Without a configured server it opens the VPN settings instead of failing. */
export function VpnToolbarButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, start } = useVpnStore();
  const [busy, setBusy] = useState(false);
  useEffect(() => start(), [start]);

  const configured = state.config.host.length > 0;
  const click = async () => {
    if (busy) return;
    if (state.status === 'error' || !configured) return onOpenSettings();
    setBusy(true);
    try {
      if (state.status === 'on') await window.dash.vpn.disconnect();
      else await window.dash.vpn.connect();
    } finally {
      setBusy(false);
    }
  };

  const color =
    state.status === 'on' ? 'text-green-500' : state.status === 'error' ? 'text-red-500' : state.status === 'connecting' ? 'text-amber-500 animate-pulse' : 'text-text-tertiary';
  const label = !configured && state.status === 'off' ? 'VPN is off. Click to set one up' : LABEL[state.status];
  return (
    <button
      onClick={click}
      title={label}
      aria-label={label}
      aria-pressed={state.status === 'on'}
      className={`h-7 px-1.5 shrink-0 flex items-center gap-1 rounded-md hover:bg-surface-hover transition-colors ${color}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3z" />
        {state.status === 'on' && <path d="M9 12l2 2 4-4" />}
        {state.status === 'error' && <path d="M12 8v5M12 16h.01" />}
      </svg>
      {state.status === 'on' && <span className="text-[11px] font-medium">VPN</span>}
    </button>
  );
}
