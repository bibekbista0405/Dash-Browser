import { useEffect, useState } from 'react';
import { HOST_LIST_MAX_LENGTH, parseHostList } from '../../shared/ipc-channels';

/** A "one site per line" box. Saves when you click away; shows how many sites were understood. */
export function SiteListField({ value, onSave, label, placeholder }: { value: string; onSave: (v: string) => void; label: string; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const count = parseHostList(draft).length;
  return (
    <div className="mt-2">
      <div className="text-[12px] text-text-secondary mb-1">{label}</div>
      <textarea
        value={draft}
        rows={3}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value.slice(0, HOST_LIST_MAX_LENGTH))}
        onBlur={() => draft !== value && onSave(draft)}
        className="w-full rounded-lg bg-surface-elevated border border-border/60 p-2.5 font-mono text-[12px] leading-5 text-text-primary outline-none focus:border-accent resize-y"
      />
      <div className="text-[11px] text-text-tertiary">{count} site{count === 1 ? '' : 's'} recognised · saved when you click away</div>
    </div>
  );
}
