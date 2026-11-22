import { useEffect, useMemo, useState } from 'react';
import { useDownloadsStore } from '../store/downloads-store';
import type { DownloadEntry } from '../../shared/ipc-channels';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(remainingBytes: number, bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '';
  const seconds = remainingBytes / bytesPerSec;
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m left`;
  return `${Math.ceil(seconds / 3600)}h left`;
}

const EXTENSION_ICONS: Record<string, string> = {
  pdf: '📄', doc: '📄', docx: '📄', txt: '📄',
  zip: '🗜', rar: '🗜', '7z': '🗜', tar: '🗜', gz: '🗜',
  png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼', webp: '🖼',
  mp4: '🎬', mov: '🎬', mkv: '🎬', webm: '🎬',
  mp3: '🎵', wav: '🎵', flac: '🎵',
  exe: '⚙️', msi: '⚙️', dmg: '⚙️', app: '⚙️',
  csv: '📊', xlsx: '📊', json: '🧾',
};

function iconFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_ICONS[ext] ?? '📁';
}

function dayLabel(startedAt: number): string {
  const date = new Date(startedAt);
  const now = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupByDay(downloads: DownloadEntry[]): [string, DownloadEntry[]][] {
  const groups = new Map<string, DownloadEntry[]>();
  for (const d of downloads) {
    const key = dayLabel(d.startedAt);
    const bucket = groups.get(key) ?? [];
    bucket.push(d);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries());
}

export function DownloadsPage() {
  const { downloads, speeds, load, subscribe, cancel, pause, resume, remove, clearCompleted, openFile, showInFolder, startDrag } =
    useDownloadsStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    load();
    const unsubscribe = subscribe();
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return downloads;
    return downloads.filter((d) => d.filename.toLowerCase().includes(term) || d.url.toLowerCase().includes(term));
  }, [downloads, query]);

  const grouped = groupByDay(filtered);
  const hasCompleted = downloads.some((d) => d.state === 'completed' || d.state === 'cancelled' || d.state === 'interrupted');

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Downloads</h1>
        {hasCompleted && (
          <button
            onClick={clearCompleted}
            className="text-[12px] text-text-tertiary hover:text-text-primary px-3 py-1.5 rounded-lg border border-border/60 transition-colors"
          >
            Clear completed
          </button>
        )}
      </div>

      {downloads.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search downloads"
          className="w-full h-10 px-4 mb-6 rounded-lg bg-surface-elevated border border-border/60 outline-none
            text-[14px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
        />
      )}

      {downloads.length === 0 && <div className="text-[13px] text-text-tertiary">No downloads yet.</div>}
      {downloads.length > 0 && filtered.length === 0 && (
        <div className="text-[13px] text-text-tertiary">No downloads match "{query}".</div>
      )}

      {grouped.map(([label, items]) => (
        <div key={label} className="mb-4">
          <div className="text-[12px] font-medium text-text-tertiary uppercase tracking-wide mb-1">{label}</div>
          <div className="rounded-lg border border-border/60 overflow-hidden">
            {items.map((d) => (
              <DownloadRow
                key={d.id}
                d={d}
                speed={speeds[d.id] ?? 0}
                onOpen={() => openFile(d.savePath)}
                onShowInFolder={() => showInFolder(d.savePath)}
                onPause={() => pause(d.id)}
                onResume={() => resume(d.id)}
                onCancel={() => cancel(d.id)}
                onRemove={() => remove(d.id)}
                onStartDrag={() => startDrag(d.savePath)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface DownloadRowProps {
  d: DownloadEntry;
  speed: number;
  onOpen: () => void;
  onShowInFolder: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onStartDrag: () => void;
}

function DownloadRow({ d, speed, onOpen, onShowInFolder, onPause, onResume, onCancel, onRemove, onStartDrag }: DownloadRowProps) {
  const hasKnownSize = d.totalBytes > 0;
  const pct = hasKnownSize ? Math.min(100, (d.receivedBytes / d.totalBytes) * 100) : 0;
  const isActive = d.state === 'progressing' || d.state === 'paused';
  const isTerminal = d.state === 'completed' || d.state === 'cancelled' || d.state === 'interrupted';

  return (
    <div className="group flex gap-3 px-3 py-2.5 border-b border-border/30 last:border-b-0 hover:bg-surface-hover/40 transition-colors">
      <span className="text-xl leading-none shrink-0 mt-0.5">{iconFor(d.filename)}</span>

      <div className="flex-1 min-w-0">
        <div
          draggable={d.state === 'completed'}
          onDragStart={(e) => {
            e.preventDefault();
            if (d.state === 'completed') onStartDrag();
          }}
          className={`text-[13px] text-text-primary truncate ${
            d.state === 'completed' ? 'cursor-grab hover:underline' : ''
          }`}
          onClick={() => d.state === 'completed' && onOpen()}
          title={d.state === 'completed' ? 'Open file (or drag out)' : undefined}
        >
          {d.filename}
        </div>

        {d.state === 'progressing' && (
          <div className="mt-1.5 h-1 rounded-full bg-surface overflow-hidden">
            {hasKnownSize ? (
              <div className="h-full bg-accent transition-all duration-200" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full w-1/3 bg-accent animate-pulse rounded-full" />
            )}
          </div>
        )}
        {d.state === 'paused' && (
          <div className="mt-1.5 h-1 rounded-full bg-surface overflow-hidden">
            <div className="h-full bg-text-tertiary" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="mt-1 flex items-center justify-between text-[11px] text-text-tertiary">
          <span className="truncate">
            {d.state === 'progressing' &&
              `${formatBytes(d.receivedBytes)}${hasKnownSize ? ` of ${formatBytes(d.totalBytes)}` : ''}` +
                (speed > 0 ? ` · ${formatSpeed(speed)}` : '') +
                (speed > 0 && hasKnownSize ? ` · ${formatEta(d.totalBytes - d.receivedBytes, speed)}` : '')}
            {d.state === 'paused' && `Paused · ${formatBytes(d.receivedBytes)}`}
            {d.state === 'completed' && formatBytes(d.totalBytes)}
            {d.state === 'cancelled' && 'Cancelled'}
            {d.state === 'interrupted' && 'Failed'}
          </span>

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {d.canPause && (
              <button onClick={onPause} className="hover:text-text-primary transition-colors">Pause</button>
            )}
            {d.canResume && (
              <button onClick={onResume} className="hover:text-text-primary transition-colors">Resume</button>
            )}
            {isActive && (
              <button onClick={onCancel} className="hover:text-text-primary transition-colors">Cancel</button>
            )}
            {d.state === 'completed' && (
              <button onClick={onShowInFolder} className="hover:text-text-primary transition-colors">Show in folder</button>
            )}
            {isTerminal && (
              <button onClick={onRemove} className="hover:text-text-primary transition-colors">Remove</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
