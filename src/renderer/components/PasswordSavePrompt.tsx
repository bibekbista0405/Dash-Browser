import { useEffect, useState } from 'react';

interface SavePromptPayload {
  promptId: string;
  origin: string;
  username: string;
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
    <div className="app-no-drag absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-surface-elevated border border-border shadow-2xl">
      <span className="text-[13px] text-text-primary">
        Save password for <span className="font-medium">{prompt.username}</span> on{' '}
        <span className="text-text-secondary">{prompt.origin}</span>?
      </span>
      <button
        onClick={() => respond(false)}
        className="text-[12px] text-text-secondary hover:text-text-primary px-2 py-1 rounded transition-colors"
      >
        Not now
      </button>
      <button
        onClick={() => respond(true)}
        className="text-[12px] font-medium text-white bg-accent hover:opacity-90 px-3 py-1 rounded-full transition-opacity"
      >
        Save
      </button>
    </div>
  );
}
