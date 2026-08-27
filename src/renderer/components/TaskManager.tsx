import { useEffect, useState } from 'react';
import type { TaskProcessInfo } from '../../shared/ipc-channels';

export function TaskManager({ onClose }: { onClose: () => void }) {
  const [processes, setProcesses] = useState<TaskProcessInfo[]>([]);

  useEffect(() => {
    const refresh = () => window.dash.taskManager.snapshot().then(setProcesses);
    refresh();
    const interval = setInterval(refresh, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const endProcess = async (pid: number) => {
    await window.dash.taskManager.endProcess(pid);
  };

  const totalMemory = processes.reduce((sum, p) => sum + p.memoryMB, 0);

  return (
    <div className="app-no-drag absolute inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-[520px] max-h-[70vh] flex flex-col rounded-xl bg-surface-elevated border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-11 px-4 border-b border-border shrink-0">
          <h2 className="text-[13px] font-medium text-text-primary">Task Manager</h2>
          <button
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-[1fr_80px_70px_60px] gap-2 px-4 py-1.5 text-[10px] font-medium text-text-tertiary uppercase tracking-wide border-b border-border/60">
          <span>Process</span>
          <span className="text-right">Memory</span>
          <span className="text-right">CPU</span>
          <span></span>
        </div>

        <div className="overflow-y-auto flex-1">
          {processes.map((p) => (
            <div
              key={p.pid}
              className="grid grid-cols-[1fr_80px_70px_60px] gap-2 px-4 py-2 items-center border-b border-border/30 text-[12px]"
            >
              <span className="text-text-primary truncate" title={`${p.label} (pid ${p.pid})`}>
                {p.type === 'Tab' ? p.label : `${p.type} process`}
              </span>
              <span className="text-right text-text-secondary tabular-nums">{p.memoryMB.toFixed(1)} MB</span>
              <span className="text-right text-text-secondary tabular-nums">{p.cpuPercent.toFixed(1)}%</span>
              <span className="text-right">
                {p.type === 'Tab' && (
                  <button
                    onClick={() => endProcess(p.pid)}
                    className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
                  >
                    End
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 text-[11px] text-text-tertiary border-t border-border shrink-0">
          {processes.length} processes · {totalMemory.toFixed(0)} MB total
        </div>
      </div>
    </div>
  );
}
