import { useState } from 'react';

/** Shows a recovery key once, with copy and save, and a checkbox that must be ticked before the caller may continue. */
export function RecoveryKeyView({ keyText, onSavedChange }: { keyText: string; onSavedChange: (saved: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState(false);
  const [checked, setChecked] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-[13px] wl-muted leading-relaxed">
        This is the only key that can reset a forgotten website password. DASH does not keep it and <b>cannot recover it</b> if it is lost. Anyone who has it can reset your
        website passwords, so keep it private.
      </p>
      <div className="wl-glass p-4 text-center font-mono text-[15px] tracking-wider select-all break-all" aria-label="Recovery key">{keyText}</div>
      <div className="flex gap-2">
        <button
          className="wl-btn flex-1"
          onClick={() => {
            void navigator.clipboard.writeText(keyText).then(() => setCopied(true)).catch(() => setCopied(false));
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <button
          className="wl-btn flex-1"
          onClick={() => {
            void window.dash.websiteLock.saveRecoveryKey(keyText).then((r) => r.ok && setFile(r.value.saved));
          }}
        >
          {file ? 'Saved ✓' : 'Save as file…'}
        </button>
      </div>
      <label className="flex items-start gap-2 text-[13px] cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            onSavedChange(e.target.checked);
          }}
        />
        <span>I saved my recovery key somewhere safe.</span>
      </label>
    </div>
  );
}
