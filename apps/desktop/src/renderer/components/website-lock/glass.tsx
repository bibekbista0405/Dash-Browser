import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WebsiteLockResult } from '../../../shared/ipc-channels';

/** Message for a failed Website Lock call: includes tries left or the wait, so nothing is hidden from the person. */
export function failText(r: Extract<WebsiteLockResult<unknown>, { ok: false }>): string {
  if (r.retryAfterMs) return `${r.message} Try again in ${Math.ceil(r.retryAfterMs / 1000)}s.`;
  if (typeof r.attemptsLeft === 'number' && r.attemptsLeft > 0) return `${r.message} ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left.`;
  return r.message;
}

export function LockGlyph({ open = false, size = 84 }: { open?: boolean; size?: number }) {
  return (
    <svg className={open ? 'wl-open' : ''} width={size} height={size} viewBox="0 0 36 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id="wlg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--color-accent))" />
          <stop offset="1" stopColor="rgb(var(--color-accent))" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <path className="wl-shackle" d="M10 18v-5a8 8 0 0 1 16 0v5" stroke="url(#wlg)" strokeWidth="3.2" strokeLinecap="round" />
      <rect x="5" y="18" width="26" height="19" rx="6" fill="url(#wlg)" />
      <circle cx="18" cy="26.5" r="2.6" fill="rgb(var(--color-surface))" />
      <rect x="16.9" y="27" width="2.2" height="5" rx="1.1" fill="rgb(var(--color-surface))" />
    </svg>
  );
}

export function PasswordField({
  value,
  onChange,
  placeholder,
  autoFocus,
  label,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  label: string;
  onEnter?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className="wl-input pr-16"
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2 rounded-lg text-[11px] font-semibold wl-muted hover:text-[var(--wl-text)]"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`wl-glass wl-pop w-full ${wide ? 'max-w-lg' : 'max-w-md'} p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-lg wl-muted hover:bg-[var(--wl-glass)]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Countdown label for a lockout that lasts `ms` from now. */
export function useCountdown(untilMs: number | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!untilMs) return setLeft(0);
    const tick = () => setLeft(Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [untilMs]);
  return left;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  // A letter tile: DASH never fetches a site's icon just to draw a list of locked sites.
  return (
    <span
      className="shrink-0 flex items-center justify-center rounded-xl font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.44, background: 'rgb(var(--color-accent))', color: '#fff' }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
