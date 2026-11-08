import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../store/settings-store';

export interface ThemeTemplate {
  name: string;
  css: string;
}

interface Props {
  cssKey: 'newTabCustomCss' | 'appCustomCss';
  enabledKey: 'newTabCustomCssEnabled' | 'appCustomCssEnabled';
  enableLabel: string;
  maxLength: number;
  templates: ThemeTemplate[];
  reference: string;
  note: string;
  applyMessage: string;
}

/** A CSS editor bound to one pair of settings: enable toggle, templates, import, copy, apply, reset. */
export function ThemeCssEditor({ cssKey, enabledKey, enableLabel, maxLength, templates, reference, note, applyMessage }: Props) {
  const { settings } = useSettingsStore();
  const saved = settings[cssKey];
  const enabled = settings[enabledKey];
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = useSettingsStore.getState().set;

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const dirty = draft !== saved;

  const apply = async () => {
    try {
      await set(cssKey, draft);
      // Applying something implies wanting to see it.
      if (draft.trim() && !enabled) await set(enabledKey, true);
      setStatus(applyMessage);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > maxLength * 4) {
      setStatus('That file is too large for a theme.');
      return;
    }
    const text = await file.text();
    if (text.length > maxLength) {
      setStatus(`That file is ${text.length.toLocaleString()} characters; the limit is ${maxLength.toLocaleString()}.`);
      return;
    }
    setDraft(text);
    setStatus(`Loaded ${file.name}. Press Apply to use it.`);
  };

  const btn = 'h-7 px-2.5 rounded-md text-[12px] border border-border/60 bg-surface-elevated text-text-secondary hover:bg-surface-hover';

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between h-10 px-3 rounded-lg bg-surface-elevated border border-border/60 text-[13px] text-text-primary">
        {enableLabel}
        <input type="checkbox" checked={enabled} onChange={() => set(enabledKey, !enabled)} className="h-4 w-4 accent-[var(--accent)]" />
      </label>

      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-[12px] text-text-tertiary">Start from:</span>
        {templates.map((t) => (
          <button key={t.name} onClick={() => setDraft(t.css)} className={btn}>
            {t.name}
          </button>
        ))}
        <button onClick={() => fileRef.current?.click()} className={btn}>
          Import .css file…
        </button>
        <input ref={fileRef} type="file" accept=".css,text/css,text/plain" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
        spellCheck={false}
        rows={12}
        placeholder="/* Paste or write CSS here, or pick a template above */"
        className="w-full rounded-lg bg-surface-elevated border border-border/60 p-3 font-mono text-[12px] leading-5 text-text-primary outline-none focus:border-accent resize-y"
      />
      <pre className="text-[11px] leading-4 text-text-tertiary whitespace-pre-wrap">{reference}</pre>

      <div className="flex items-center gap-2">
        <button onClick={apply} disabled={!dirty} className="h-8 px-3 rounded-md text-[13px] font-medium bg-accent text-white disabled:opacity-40">
          Apply
        </button>
        <button
          onClick={() => {
            setDraft('');
            void set(cssKey, '');
            setStatus('Cleared. Back to the built-in look.');
          }}
          className={btn.replace('h-7', 'h-8').replace('text-[12px]', 'text-[13px]')}
        >
          Reset
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(draft).then(
              () => setStatus('Copied to clipboard.'),
              () => setStatus('Could not copy.')
            );
          }}
          disabled={!draft}
          className={btn.replace('h-7', 'h-8').replace('text-[12px]', 'text-[13px]') + ' disabled:opacity-40'}
        >
          Copy
        </button>
        <span className="ml-auto text-[11px] text-text-tertiary tabular-nums">
          {draft.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>
      {status && <div className="text-[12px] text-text-tertiary">{status}</div>}
      <div className="text-[11px] text-text-tertiary">{note}</div>
    </div>
  );
}
