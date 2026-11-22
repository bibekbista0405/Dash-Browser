import { useEffect, useRef, type ReactNode } from 'react';
import { useEscape } from '../hooks/useEscape';
import { useDetachesActiveViewWhileOpen } from '../hooks/useDetachesActiveViewWhileOpen';

/** Toolbar dropdown with the same behaviour as the main menu: Esc and outside click close it, arrows move, focus stays inside. */
export function PopMenu({ label, onClose, width = 'w-72', children }: { label: string; onClose: () => void; width?: string; children: ReactNode }) {
  useEscape(onClose);
  useDetachesActiveViewWhileOpen(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKey}
      className={`absolute right-0 top-9 z-50 ${width} max-h-[calc(100vh-64px)] overflow-y-auto py-1 rounded-lg bg-surface-elevated border border-border shadow-2xl`}
    >
      {children}
    </div>
  );
}

export function MenuItem({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left transition-colors hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent ${danger ? 'text-red-400' : 'text-text-primary'}`}
    >
      {children}
    </button>
  );
}

export const MenuDivider = () => <div className="h-px bg-border my-1" />;
export const MenuHeading = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-text-tertiary">{children}</div>
);
