/** Shared empty state for the internal pages: an icon, a headline and one line of guidance. */
export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-16 gap-2">
      <div className="h-12 w-12 rounded-2xl bg-surface-elevated border border-border/60 flex items-center justify-center text-xl text-text-tertiary">
        {icon}
      </div>
      <div className="text-[14px] font-medium text-text-primary">{title}</div>
      {hint && <div className="text-[13px] text-text-tertiary max-w-sm">{hint}</div>}
    </div>
  );
}
