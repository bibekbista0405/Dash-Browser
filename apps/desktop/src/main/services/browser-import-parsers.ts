export interface ImportedBookmark {
  url: string;
  title: string;
  /** Folder path like "Work / Docs", or null for items directly on the bookmarks bar. */
  folder: string | null;
  addedAt: number;
}

export interface ImportedHistoryItem {
  url: string;
  title: string;
  visitedAt: number;
}

const CHROME_EPOCH_OFFSET_MS = 11_644_473_600_000;

/** Chrome stores times as microseconds since 1601-01-01. */
export function chromeTimeToMs(microseconds: number): number {
  return Math.floor(microseconds / 1000) - CHROME_EPOCH_OFFSET_MS;
}

const isWebUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

interface ChromeNode {
  type?: string;
  name?: string;
  url?: string;
  date_added?: string;
  children?: ChromeNode[];
}

/** Parses Chrome / Edge / Brave / Chromium's `Bookmarks` JSON file. */
export function parseChromeBookmarks(json: unknown): ImportedBookmark[] {
  const out: ImportedBookmark[] = [];
  const roots = (json as { roots?: Record<string, ChromeNode> } | null)?.roots;
  if (!roots) return out;

  const walk = (node: ChromeNode, path: string[]): void => {
    if (node.type === 'url' && isWebUrl(node.url)) {
      const added = Number(node.date_added);
      out.push({
        url: node.url,
        title: (node.name ?? '').trim() || node.url,
        folder: path.length ? path.join(' / ') : null,
        addedAt: Number.isFinite(added) && added > 0 ? chromeTimeToMs(added) : Date.now(),
      });
    } else if (node.type === 'folder' && Array.isArray(node.children)) {
      const next = node.name ? [...path, node.name] : path;
      for (const child of node.children) walk(child, next);
    }
  };

  const rootLabels: Record<string, string[]> = {
    bookmark_bar: [],
    other: ['Other bookmarks'],
    synced: ['Mobile bookmarks'],
  };
  for (const [key, node] of Object.entries(roots)) {
    if (!node || typeof node !== 'object' || !Array.isArray(node.children)) continue;
    const base = rootLabels[key] ?? [];
    for (const child of node.children) walk(child, base);
  }
  return out;
}

export interface FirefoxBookmarkRow {
  id: number;
  type: number;
  parent: number | null;
  title: string | null;
  guid: string;
  url: string | null;
  dateAdded: number | null; // microseconds since epoch
}

/** Builds folder paths from Firefox's moz_bookmarks tree rows. */
export function parseFirefoxBookmarks(rows: FirefoxBookmarkRow[]): ImportedBookmark[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rootLabel: Record<string, string[]> = {
    toolbar_____: [],
    menu________: ['Bookmarks menu'],
    unfiled_____: ['Other bookmarks'],
    mobile______: ['Mobile bookmarks'],
  };

  const pathOf = (parentId: number | null): string[] | null => {
    const names: string[] = [];
    let cur = parentId !== null ? byId.get(parentId) : undefined;
    let guard = 0;
    while (cur && guard++ < 50) {
      if (cur.guid in rootLabel) return [...rootLabel[cur.guid], ...names.reverse()];
      if (cur.guid === 'root________') return names.reverse();
      if (cur.title) names.push(cur.title);
      cur = cur.parent !== null ? byId.get(cur.parent) : undefined;
    }
    return names.reverse();
  };

  const out: ImportedBookmark[] = [];
  for (const r of rows) {
    if (r.type !== 1 || !isWebUrl(r.url)) continue;
    const path = pathOf(r.parent) ?? [];
    out.push({
      url: r.url,
      title: (r.title ?? '').trim() || r.url,
      folder: path.length ? path.join(' / ') : null,
      addedAt: r.dateAdded ? Math.floor(r.dateAdded / 1000) : Date.now(),
    });
  }
  return out;
}

export { isWebUrl };
