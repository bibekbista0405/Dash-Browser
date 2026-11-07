import { SEARCH_ENGINES, type SearchEngineId } from '../../shared/ipc-channels';

interface TopSite {
  url: string;
  title: string;
  faviconUrl: string | null;
}

const TILE_COLORS = ['#5b8cff', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function colorFor(hostname: string): string {
  let hash = 0;
  for (let i = 0; i < hostname.length; i++) hash = (hash * 31 + hostname.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

/**
 * Builds the New Tab Page as a self-contained HTML document, loaded via a
 * `data:` URL — a real rendered page with real dynamic data (actual top
 * sites from the history table), not a placeholder. Deliberately has NO
 * external favicon fetching: real browsers' New Tab Pages often silently
 * leak your most-visited sites to a favicon CDN, which is exactly the kind
 * of hidden third-party request this project promises never to make.
 * Colored initial tiles instead — a real design tradeoff for privacy, not
 * a missing feature.
 *
 * Plain HTML forms/links only, no inline script needed for navigation:
 * clicking a tile or submitting the search form navigates this same
 * WebContentsView normally, exactly like any other page would.
 */
export const NEWTAB_ACTION_PREFIX = 'dash://newtab-action/';

export function buildNewTabHtml(topSites: TopSite[], searchEngine: SearchEngineId, hiddenCount = 0): string {
  const engine = SEARCH_ENGINES[searchEngine];
  const searchActionUrl = engine.url.split('%s')[0];

  const tiles = topSites
    .slice(0, 8)
    .map((site) => {
      const host = hostnameOf(site.url);
      const initial = host.charAt(0).toUpperCase() || '?';
      const color = colorFor(host);
      const label = site.title || host;
      // Real favicon, captured directly from the site itself when we
      // have one — same privacy stance as everywhere else in DASH: no
      // third-party favicon service. Falls back to a colored-initial tile
      // if the image fails to load or none was ever captured (e.g. the
      // site was visited before favicon capture existed, or hasn't been
      // revisited since).
      const iconHtml = site.faviconUrl
        ? `<span class="tile-icon" style="background:${color}">
             <img src="${escapeHtml(site.faviconUrl)}" alt="" onerror="this.remove()">
             <span class="tile-fallback">${escapeHtml(initial)}</span>
           </span>`
        : `<span class="tile-icon" style="background:${color}">${escapeHtml(initial)}</span>`;
      return `
        <div class="tile-wrap">
          <a class="tile" href="${escapeHtml(site.url)}" title="${escapeHtml(label)}">
            ${iconHtml}
            <span class="tile-label">${escapeHtml(label.length > 18 ? label.slice(0, 17) + '…' : label)}</span>
          </a>
          <a class="tile-x" title="Remove shortcut" href="${NEWTAB_ACTION_PREFIX}remove?host=${encodeURIComponent(host)}">×</a>
        </div>`;
    })
    .join('');

  const emptyState = topSites.length === 0
    ? `<p class="empty">Sites you visit often will show up here.</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>New Tab</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%;
    background: #0b0d10;
    color: #f2f3f5;
    font-family: -apple-system, "Inter", "Segoe UI", system-ui, sans-serif;
  }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 40px;
    padding: 24px;
  }
  .wordmark {
    font-size: 64px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #f2f3f5;
    animation: fade-in 0.4s ease-out;
  }
  .wordmark span { color: #5b8cff; }
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  form.search {
    width: min(560px, 90vw);
    display: flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 20px;
    border-radius: 999px;
    background: #15181d;
    border: 1px solid #262b33;
    transition: border-color 0.15s, box-shadow 0.15s;
    animation: fade-in 0.4s ease-out 0.05s backwards;
  }
  form.search:focus-within {
    border-color: rgba(91,140,255,0.6);
    box-shadow: 0 0 0 3px rgba(91,140,255,0.12);
  }
  form.search input {
    flex: 1;
    height: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #f2f3f5;
    font-size: 15px;
  }
  form.search input::placeholder { color: #5c626d; }
  .tiles {
    width: min(560px, 90vw);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    animation: fade-in 0.4s ease-out 0.1s backwards;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    color: inherit;
    padding: 8px 4px;
    border-radius: 12px;
    transition: background-color 0.15s, transform 0.1s;
  }
  .tile:hover {
    background-color: #15181d;
  }
  .tile:active {
    transform: scale(0.96);
  }
  .tile-icon {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 600;
    color: #0b0d10;
    overflow: hidden;
    transition: transform 0.15s;
  }
  .tile-icon img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #f2f3f5;
  }
  .tile:hover .tile-icon {
    transform: scale(1.06);
  }
  .tile-label {
    font-size: 11px;
    color: #a7adb8;
    text-align: center;
    max-width: 76px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tile-wrap { position: relative; }
  .tile-x {
    position: absolute; top: 2px; right: 2px; width: 20px; height: 20px;
    border-radius: 999px; background: #262b33; color: #f2f3f5; text-decoration: none;
    display: none; align-items: center; justify-content: center; font-size: 14px; line-height: 1;
  }
  .tile-wrap:hover .tile-x { display: flex; }
  .tile-x:hover { background: #ef4444; }
  .add-tile { background: none; border: none; cursor: pointer; font: inherit; color: inherit; }
  .add-tile .tile-icon { background: #262b33; color: #a7adb8; font-size: 24px; }
  form.add { display: none; gap: 8px; flex-wrap: wrap; justify-content: center; }
  form.add.open { display: flex; }
  form.add input { height: 34px; padding: 0 12px; border-radius: 8px; background: #15181d; border: 1px solid #262b33; color: #f2f3f5; font-size: 13px; outline: none; }
  form.add button { height: 34px; padding: 0 14px; border-radius: 8px; border: none; background: #5b8cff; color: #0b0d10; font-weight: 600; cursor: pointer; }
  .restore { font-size: 12px; color: #5b8cff; text-decoration: none; }
  .restore:hover { text-decoration: underline; }
  .empty {
    font-size: 12px;
    color: #5c626d;
  }
</style>
</head>
<body>
  <div class="wordmark">DA<span>SH</span></div>
  <form class="search" action="${escapeHtml(searchActionUrl)}" method="GET">
    <input name="q" placeholder="Search or enter address" autofocus autocomplete="off" spellcheck="false">
  </form>
  <div class="tiles">${tiles}
    <div class="tile-wrap"><button type="button" class="tile add-tile" id="add-btn" title="Add shortcut"><span class="tile-icon">+</span><span class="tile-label">Add shortcut</span></button></div>
  </div>
  <form class="add" id="add-form" action="${NEWTAB_ACTION_PREFIX}add" method="GET">
    <input name="title" placeholder="Name" maxlength="60" autocomplete="off">
    <input name="url" placeholder="Website address" required autocomplete="off" spellcheck="false">
    <button type="submit">Add</button>
  </form>
  <script>document.getElementById('add-btn').addEventListener('click',function(){var f=document.getElementById('add-form');f.classList.toggle('open');var i=f.querySelector('input[name=url]');if(f.classList.contains('open'))i.focus();});</script>
  ${emptyState}
  ${hiddenCount > 0 ? `<a class="restore" href="${NEWTAB_ACTION_PREFIX}restore">Restore ${hiddenCount} removed shortcut${hiddenCount > 1 ? 's' : ''}</a>` : ''}
</body>
</html>`;
}
