import { useEffect, useState } from 'react';

interface SavePromptPayload {
  promptId: string;
  origin: string;
  username: string;
  isUpdate: boolean;
}

export function PasswordSavePrompt() {
  const [prompt, setPrompt] = useState<SavePromptPayload | null>(null);

  useEffect(() => {
    return window.dash.passwords.onSavePrompt((payload) => setPrompt(payload));
  }, []);

  if (!prompt) return null;

  const respond = (save: boolean) => {
    window.dash.passwords.respondToSavePrompt(prompt.promptId, save);
    setPrompt(null);
  };

  return (
    <div role="alertdialog" aria-label="Save password" className="dash-prompt app-no-drag absolute top-[96px] left-1/2 z-40 w-[380px] max-w-[92vw] p-4 rounded-2xl bg-surface-elevated border border-border shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="shrink-0 h-9 w-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></svg>
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-text-primary">{prompt.isUpdate ? 'Update saved password?' : 'Save password?'}</div>
          <div className="text-[13px] text-text-secondary mt-0.5 truncate"><span className="text-text-primary">{prompt.username}</span> on {prompt.origin}</div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => respond(false)} className="h-9 px-4 rounded-full text-[13px] font-medium text-text-primary bg-surface-hover hover:bg-border/60 active:scale-95 transition-[background-color,transform]">
          Not now
        </button>
        <button onClick={() => respond(true)} className="h-9 px-5 rounded-full text-[13px] font-semibold text-white bg-accent hover:opacity-90 active:scale-95 transition-[opacity,transform]">
          {prompt.isUpdate ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  );
}
