import { useEffect, useState } from 'react';
import type { PermissionName } from '../../shared/ipc-channels';

interface PermissionPromptPayload {
  requestId: string;
  origin: string;
  permission: PermissionName;
}

const LABELS: Record<PermissionName, string> = {
  notifications: 'show notifications',
  geolocation: 'know your location',
  camera: 'use your camera',
  microphone: 'use your microphone',
  'clipboard-read': 'read your clipboard',
};

export function PermissionPrompt() {
  const [prompt, setPrompt] = useState<PermissionPromptPayload | null>(null);

  useEffect(() => {
    return window.dash.permissions.onRequest((payload) => setPrompt(payload));
  }, []);

  if (!prompt) return null;

  const respond = (decision: 'granted' | 'denied') => {
    window.dash.permissions.respondToRequest(prompt.requestId, decision);
    setPrompt(null);
  };

  return (
    <div className="app-no-drag absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-surface-elevated border border-border shadow-2xl">
      <span className="text-[13px] text-text-primary">
        <span className="text-text-secondary">{prompt.origin}</span> wants to {LABELS[prompt.permission]}
      </span>
      <button
        onClick={() => respond('denied')}
        className="text-[12px] text-text-secondary hover:text-text-primary px-2 py-1 rounded transition-colors"
      >
        Block
      </button>
      <button
        onClick={() => respond('granted')}
        className="text-[12px] font-medium text-white bg-accent hover:opacity-90 px-3 py-1 rounded-full transition-opacity"
      >
        Allow
      </button>
    </div>
  );
}
