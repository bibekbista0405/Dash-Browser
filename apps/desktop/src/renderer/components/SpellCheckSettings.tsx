import { useEffect, useState } from 'react';

interface Props {
  enabled: boolean;
  languages: string;
  set: (key: 'spellCheckEnabled' | 'spellCheckLanguages', value: boolean | string) => void;
}

/** Spell check on/off and which dictionaries to use. Languages come from what this system's Chromium offers. */
export function SpellCheckSettings({ enabled, languages, set }: Props) {
  const [available, setAvailable] = useState<string[] | null>(null);
  useEffect(() => {
    void window.dash.tabs.spellCheckLanguages().then(setAvailable);
  }, []);

  const chosen = languages.split(',').map((l) => l.trim()).filter(Boolean);
  const remaining = (available ?? []).filter((l) => !chosen.includes(l));
  const save = (list: string[]) => set('spellCheckLanguages', list.join(','));
  const name = (tag: string): string => {
    try {
      return `${new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag} (${tag})`;
    } catch {
      return tag;
    }
  };

  if (!enabled) return null;
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2.5 mt-2">
      <div className="text-[12px] text-text-tertiary mb-1.5">
        {chosen.length === 0 ? 'Spell check uses your system language.' : 'Dictionaries in use:'}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chosen.map((l) => (
          <span key={l} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-surface text-text-secondary">
            {name(l)}
            <button aria-label={`Remove ${l}`} className="text-text-tertiary hover:text-text-primary" onClick={() => save(chosen.filter((x) => x !== l))}>
              ×
            </button>
          </span>
        ))}
      </div>
      {available === null ? null : available.length === 0 ? (
        <div className="text-[12px] text-text-tertiary mt-2">This system offers no choice of dictionaries (macOS uses the system spell checker).</div>
      ) : (
        <select
          aria-label="Add a spell-check language"
          value=""
          disabled={chosen.length >= 6}
          onChange={(e) => e.target.value && save([...chosen, e.target.value])}
          className="mt-2 h-8 px-2 rounded-md bg-surface border border-border/60 text-[12px] text-text-primary"
        >
          <option value="">Add a language…</option>
          {remaining.map((l) => (
            <option key={l} value={l}>
              {name(l)}
            </option>
          ))}
        </select>
      )}
      <div className="text-[11px] text-text-tertiary mt-2">A language's dictionary is downloaded the first time it is used.</div>
    </div>
  );
}
