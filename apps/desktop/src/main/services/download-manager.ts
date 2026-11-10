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

  /** Resume requests waiting for their will-download event, keyed by the file they continue. */
  private resuming: Map<string, number> = new Map();
  private session: Session;

  constructor(targetSession: Session, onStateChange: (entry: DownloadEntry) => void) {
    this.onStateChange = onStateChange;
    this.session = targetSession;
    getDatabase().markUnfinishedDownloadsInterrupted();
    targetSession.on('will-download', (_event, item) => this.handleWillDownload(item));
  }

  private handleWillDownload(item: DownloadItem): void {
    // A download continued from an earlier run keeps its record and file; it is not a new download.
    const resumedId = this.resuming.get(item.getSavePath());
    let dbId: number;
    if (resumedId !== undefined) {
      this.resuming.delete(item.getSavePath());
      dbId = resumedId;
    } else {
      const downloadsDir = app.getPath('downloads');
      if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
      const savePath = this.resolveUniquePath(downloadsDir, item.getFilename());
      item.setSavePath(savePath);
      dbId = getDatabase().insertDownload(path.basename(savePath), item.getURL(), savePath, item.getTotalBytes());
      // Keep what Chromium needs to continue this download if DASH is closed or crashes before it finishes.
      getDatabase().setDownloadResumeInfo(dbId, {
        urlChain: item.getURLChain(),
        mimeType: item.getMimeType(),
        eTag: item.getETag(),
        lastModified: item.getLastModifiedTime(),
        startTime: item.getStartTime(),
      });
    }
    this.active.set(dbId, { dbId, item });
    this.emit(dbId, item, resumedId !== undefined ? 'interrupted' : 'progressing');
    if (resumedId !== undefined) item.resume();

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
      canResume: state === 'paused' || (state === 'interrupted' && item.canResume()),
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
    if (entry) {
      if (entry.item.canResume()) entry.item.resume();
      return;
    }
    // Not running in this session: it was interrupted by a restart or crash. Continue from the bytes already on disk.
    const row = getDatabase().getDownloadForResume(dbId);
    if (!row || row.state !== 'interrupted' || !row.info || row.totalBytes <= 0) return;
    let offset = 0;
    try {
      offset = fs.statSync(row.savePath).size;
    } catch {
      offset = 0;
    }
    if (offset >= row.totalBytes) offset = 0; // the file is not a usable partial copy: start over
    this.resuming.set(row.savePath, dbId);
    this.session.createInterruptedDownload({
      path: row.savePath,
      urlChain: row.info.urlChain,
      mimeType: row.info.mimeType,
      offset,
      length: row.totalBytes,
      lastModified: row.info.lastModified,
      eTag: row.info.eTag,
      startTime: row.info.startTime,
    });
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
