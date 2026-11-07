import { app, session, shell, Session, DownloadItem } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { getDatabase } from '../db/database';
import type { DownloadEntry, DownloadState } from '../../shared/ipc-channels';

interface ActiveDownload {
  dbId: number;
  item: DownloadItem;
}

/**
 * Wraps Electron's real `will-download` session event. Every download here
 * is an actual DownloadItem driven by Chromium's network stack — file bytes
 * land on disk for real, and progress/state come straight from the item's
 * own events, not a fabricated timer.
 */
export class DownloadManager {
  private active: Map<number, ActiveDownload> = new Map(); // dbId -> item
  private onStateChange: (entry: DownloadEntry) => void;

  constructor(targetSession: Session, onStateChange: (entry: DownloadEntry) => void) {
    this.onStateChange = onStateChange;
    targetSession.on('will-download', (_event, item) => this.handleWillDownload(item));
  }

  private handleWillDownload(item: DownloadItem): void {
    const downloadsDir = app.getPath('downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    const savePath = this.resolveUniquePath(downloadsDir, item.getFilename());
    item.setSavePath(savePath);

    const dbId = getDatabase().insertDownload(
      path.basename(savePath),
      item.getURL(),
      savePath,
      item.getTotalBytes()
    );
    this.active.set(dbId, { dbId, item });
    this.emit(dbId, item, 'progressing');

    item.on('updated', (_e, state) => {
      let mapped: DownloadState;
      if (state === 'interrupted') {
        mapped = 'interrupted';
      } else {
        mapped = item.isPaused() ? 'paused' : 'progressing';
      }
      getDatabase().updateDownloadProgress(dbId, item.getReceivedBytes(), item.getTotalBytes());
      getDatabase().updateDownloadState(dbId, mapped);
      this.emit(dbId, item, mapped);
    });

    item.once('done', (_e, state) => {
      let mapped: DownloadState;
      if (state === 'completed') {
        mapped = 'completed';
      } else if (state === 'cancelled') {
        mapped = 'cancelled';
      } else {
        mapped = 'interrupted';
      }
      getDatabase().updateDownloadProgress(dbId, item.getReceivedBytes(), item.getTotalBytes());
      getDatabase().updateDownloadState(dbId, mapped);
      this.emit(dbId, item, mapped);
      this.active.delete(dbId);
    });
  }

  /** Prevents silently overwriting an existing file — appends " (1)", " (2)", etc. */
  private resolveUniquePath(dir: string, filename: string): string {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let candidate = path.join(dir, filename);
    let counter = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${base} (${counter})${ext}`);
      counter += 1;
    }
    return candidate;
  }

  private emit(dbId: number, item: DownloadItem, state: DownloadState): void {
    this.onStateChange({
      id: dbId,
      filename: path.basename(item.getSavePath() || item.getFilename()),
      url: item.getURL(),
      savePath: item.getSavePath(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      state,
      startedAt: item.getStartTime() ? item.getStartTime() * 1000 : Date.now(),
      canPause: state === 'progressing',
      canResume: state === 'paused',
    });
  }

  cancel(dbId: number): void {
    this.active.get(dbId)?.item.cancel();
  }

  pause(dbId: number): void {
    this.active.get(dbId)?.item.pause();
  }

  resume(dbId: number): void {
    const entry = this.active.get(dbId);
    if (entry?.item.canResume()) entry.item.resume();
  }

  openFile(savePath: string): void {
    shell.openPath(savePath).catch((err) => console.error('[DASH] Failed to open file:', err));
  }

  showInFolder(savePath: string): void {
    shell.showItemInFolder(savePath);
  }
}

export function createDownloadManager(onStateChange: (entry: DownloadEntry) => void): DownloadManager {
  return new DownloadManager(session.defaultSession, onStateChange);
}
