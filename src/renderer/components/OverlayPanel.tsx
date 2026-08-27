import { useEffect, useRef } from 'react';

interface OverlayPanelProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}

export function OverlayPanel({ title, onClose, children, headerActions }: OverlayPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex justify-end app-no-drag" role="dialog" aria-label={title}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative h-full w-[380px] bg-surface-elevated border-l border-border shadow-2xl
          flex flex-col animate-in"
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-border shrink-0">
          <h2 className="text-[13px] font-medium text-text-primary">{title}</h2>
          <div className="flex items-center gap-1">
            {headerActions}
            <button
              onClick={onClose}
              className="h-6 w-6 flex items-center justify-center rounded-full text-text-secondary
                hover:bg-surface-hover hover:text-text-primary transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
