import { app, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDatabase } from '../db/database';
import type { ArchiveEntry } from '../../shared/ipc-channels';

const TEXT_LIMIT = 200_000;

/**
 * Offline page archive. A page is saved as a single MHTML file (the page and its images/styles in one file) under
 * this profile's data folder, so it opens later with no network. The page's visible text is stored alongside so the
 * library can be searched. Private tabs are never archived.
 */
export class ArchiveManager {
  private dir(): string {
    const d = path.join(app.getPath('userData'), 'archive');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  async save(wc: WebContents, isPrivate: boolean): Promise<ArchiveEntry> {
    if (isPrivate) throw new Error('Private tabs are never saved to disk.');
    const url = wc.getURL();
    if (!/^https?:/i.test(url)) throw new Error('Only web pages can be saved for offline reading.');
    const file = `${Date.now()}-${randomBytes(4).toString('hex')}.mhtml`;
    const full = path.join(this.dir(), file);
    await wc.savePage(full, 'MHTML');
    const size = fs.statSync(full).size;
    let text = '';
    try {
      const t = await wc.executeJavaScript('document.body ? document.body.innerText : ""');
      if (typeof t === 'string') text = t.slice(0, TEXT_LIMIT);
    } catch {
      /* text search just won't cover this page */
    }
    const title = wc.getTitle().trim() || url;
    return getDatabase().addArchive(url, title.slice(0, 300), file, size, text);
  }

  list(search = ''): ArchiveEntry[] {
    return getDatabase().listArchive(search);
  }

  fileUrl(id: number): string | null {
    const row = getDatabase().getArchiveFile(id);
    if (!row) return null;
    const full = path.join(this.dir(), path.basename(row));
    return fs.existsSync(full) ? pathToFileURL(full).toString() : null;
  }

  delete(id: number): void {
    const row = getDatabase().getArchiveFile(id);
    getDatabase().deleteArchive(id);
    if (row) {
      try {
        fs.unlinkSync(path.join(this.dir(), path.basename(row)));
      } catch {
        /* already gone */
      }
    }
  }
}
