import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import { getDatabase } from '../db/database';

/**
 * The Netscape Bookmark File Format is the de facto open standard every
 * browser (Chrome, Firefox, Safari, Edge) reads and writes for bookmark
 * import/export — this is not a DASH-specific format, so exported files
 * open correctly in other browsers and vice versa.
 */
export class BookmarksIO {
  async export(win: BrowserWindow): Promise<{ exported: number } | null> {
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Bookmarks',
      defaultPath: 'dash-bookmarks.html',
      filters: [{ name: 'Bookmarks HTML', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return null;

    const bookmarks = getDatabase().listBookmarks();
    const items = bookmarks
      .map(
        (b) =>
          `    <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${Math.floor(b.createdAt / 1000)}">${escapeHtml(b.title)}</A>`
      )
      .join('\n');

    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. It will be read and overwritten. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${items}
</DL><p>
`;
    await fs.writeFile(result.filePath, html, 'utf-8');
    return { exported: bookmarks.length };
  }

  async import(win: BrowserWindow): Promise<{ imported: number } | null> {
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Bookmarks',
      filters: [{ name: 'Bookmarks HTML', extensions: ['html', 'htm'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const html = await fs.readFile(result.filePaths[0], 'utf-8');
    const linkPattern = /<A\s+[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/gi;
    let match: RegExpExecArray | null;
    let imported = 0;
    const db = getDatabase();

    while ((match = linkPattern.exec(html)) !== null) {
      const url = unescapeHtml(match[1]);
      const title = unescapeHtml(match[2]).trim();
      if (!url || !/^https?:\/\//.test(url)) continue;
      db.addBookmark(url, title || url, null);
      imported += 1;
    }
    return { imported };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function unescapeHtml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
