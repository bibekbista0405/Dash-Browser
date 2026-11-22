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
    <div role="alertdialog" aria-label="Site permission request" className="dash-prompt app-no-drag absolute top-[96px] left-1/2 z-40 w-[380px] max-w-[92vw] p-4 rounded-2xl bg-surface-elevated border border-border shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="shrink-0 h-9 w-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" /></svg>
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-text-primary truncate">{prompt.origin}</div>
          <div className="text-[13px] text-text-secondary mt-0.5">wants to {LABELS[prompt.permission]}</div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => respond('denied')} className="h-9 px-4 rounded-full text-[13px] font-medium text-text-primary bg-surface-hover hover:bg-border/60 active:scale-95 transition-[background-color,transform]">
          Block
        </button>
        <button onClick={() => respond('granted')} className="h-9 px-5 rounded-full text-[13px] font-semibold text-white bg-accent hover:opacity-90 active:scale-95 transition-[opacity,transform]">
          Allow
        </button>
      </div>
    </div>
  );
}
