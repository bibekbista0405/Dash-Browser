import { SEARCH_ENGINES, type SearchEngineId } from '../../shared/ipc-channels';
import { LOGO_MARK_DATA_URI } from './logo-data';

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

/**
 * Theme id for the page wrapper (`<div class="dash-home" data-theme="…">`).
 * Taken from the user's own CSS: the first `data-theme="name"` selector in it. A CSS with no such
 * selector keeps the built-in "default" look and simply layers on top of it.
 */
export function detectThemeId(customCss: string): string {
  const m = /data-theme\s*=\s*["']?([a-z0-9_-]{1,32})/i.exec(customCss);
  return m ? m[1].toLowerCase() : 'default';
}

/** Structural CSS every theme gets. Low specificity on purpose so any user theme can override it. */
const BASE_CSS = `
  :root { color-scheme: __SCHEME__; __VARS__ }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: var(--bg); color: var(--fg); font-family: -apple-system, "Inter", "Segoe UI", system-ui, sans-serif; }
  a { color: inherit; text-decoration: none; }
  .dash-home { position: fixed; inset: 0; isolation: isolate; overflow-x: hidden; overflow-y: auto; background: var(--bg); color: var(--fg); }
  .dash-atmosphere, .dash-light-orbs, .dash-bubbles, .dash-cursor-glow, .dash-sparkles { position: absolute; inset: 0; pointer-events: none; }
  .dash-particle-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0; }
  .dash-content { position: relative; z-index: 2; min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
  .dash-branding { display: flex; flex-direction: column; align-items: center; }
  /* The real DASH logo is drawn as a mask. Fill defaults to the theme's --accent; set --logo-fill (any colour or gradient) to change it. */
  .dash-logo { width: 80px; height: 80px; background: var(--logo-fill, var(--accent, var(--fg)));
    -webkit-mask: url(__LOGO__) center / contain no-repeat; mask: url(__LOGO__) center / contain no-repeat; }
  .dash-search { display: flex; align-items: center; }
  .dash-search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: inherit; font: inherit; }
  .dash-shortcut { position: relative; cursor: pointer; }
  button.dash-shortcut { font: inherit; color: inherit; background: none; border: none; }
  .dash-shortcut-link { display: contents; }
  .dash-shortcut-icon { position: relative; overflow: hidden; display: grid; place-items: center; background: var(--tile-color, transparent); }
  .dash-shortcut-icon img { display: block; }
  .dash-shortcut-remove { position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; z-index: 1; border-radius: 999px;
    background: rgba(127,127,127,.35); color: inherit; display: none; align-items: center; justify-content: center; font-size: 14px; line-height: 1; }
  .dash-shortcut:hover .dash-shortcut-remove { display: flex; }
  .dash-shortcut-remove:hover { background: #ef4444; color: #fff; }
  .dash-add-form { display: none; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 16px; }
  .dash-add-form.open { display: flex; }
  .dash-add-form input { height: 34px; padding: 0 12px; border-radius: 8px; background: rgba(127,127,127,.16); border: 1px solid rgba(127,127,127,.3); color: inherit; font-size: 13px; outline: none; }
  .dash-add-form button { height: 34px; padding: 0 14px; border-radius: 8px; border: none; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
  .dash-theme-button { cursor: pointer; }
  .dash-recovery { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 5; display: flex; align-items: center; gap: 14px; max-width: min(560px, 92vw);
    padding: 10px 14px; border-radius: 12px; font-size: 13px; background: var(--card); color: var(--fg); border: 1px solid var(--line); box-shadow: 0 6px 24px rgba(0,0,0,.18); }
  .dash-recovery a { font-weight: 600; color: var(--accent); white-space: nowrap; }
`;

/** The built-in look. Wrapped in :where() so it has the lowest possible specificity: user CSS always wins. */
const DEFAULT_CSS = `
  :where(.dash-home[data-theme="default"]) { --logo-fill: var(--fg); }
  :where(.dash-home[data-theme="default"]) .dash-content { gap: 34px; }
  :where(.dash-home[data-theme="default"]) .dash-branding { gap: 14px; animation: dash-fade-in .4s ease-out; }
  :where(.dash-home[data-theme="default"]) .dash-logo { width: 92px; height: 92px; }
  :where(.dash-home[data-theme="default"]) .dash-title { font-size: 30px; font-weight: 700; letter-spacing: .18em; }
  :where(.dash-home[data-theme="default"]) .dash-title span { color: var(--accent); }
  :where(.dash-home[data-theme="default"]) .dash-tagline { font-size: 13px; color: var(--faint); margin-top: -6px; }
  @keyframes dash-fade-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  :where(.dash-home[data-theme="default"]) .dash-search { width: min(560px, 90vw); gap: 10px; height: 48px; padding: 0 20px; border-radius: 999px;
    background: var(--card); border: 1px solid var(--line); transition: border-color .15s, box-shadow .15s; animation: dash-fade-in .4s ease-out .05s backwards; }
  :where(.dash-home[data-theme="default"]) .dash-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
  :where(.dash-home[data-theme="default"]) .dash-search input { height: 100%; font-size: 15px; }
  :where(.dash-home[data-theme="default"]) .dash-search input::placeholder { color: var(--faint); }
  :where(.dash-home[data-theme="default"]) .dash-shortcuts { width: min(640px, 92vw); display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 12px; animation: dash-fade-in .4s ease-out .1s backwards; }
  :where(.dash-home[data-theme="default"]) .dash-shortcut { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 6px 10px; border-radius: 16px;
    border: 1px solid transparent; transition: background-color .15s, border-color .15s, transform .12s; }
  :where(.dash-home[data-theme="default"]) .dash-shortcut:hover { background-color: var(--card); border-color: var(--line); transform: translateY(-2px); }
  :where(.dash-home[data-theme="default"]) .dash-shortcut:active { transform: scale(.97); }
  :where(.dash-home[data-theme="default"]) .dash-shortcut:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  :where(.dash-home[data-theme="default"]) .dash-shortcut-icon { width: 52px; height: 52px; border-radius: 16px; font-size: 20px; font-weight: 600; color: #0b0d10;
    box-shadow: 0 1px 2px rgba(0,0,0,.18), inset 0 0 0 1px rgba(0,0,0,.06); }
  /* Favicons are drawn for light backgrounds: always sit them on an opaque light plate. */
  :where(.dash-home[data-theme="default"]) .dash-shortcut-icon img { position: absolute; inset: 0; width: 100%; height: 100%; padding: 11px; object-fit: contain; background: #fff; }
  :where(.dash-home[data-theme="default"]) .dash-shortcut-label { font-size: 12px; color: var(--muted); text-align: center; max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :where(.dash-home[data-theme="default"]) .dash-shortcut:hover .dash-shortcut-label { color: var(--fg); }
  :where(.dash-home[data-theme="default"]) .dash-shortcut-add .dash-shortcut-icon { background: transparent; color: var(--muted); font-size: 26px; font-weight: 400; box-shadow: none; border: 1.5px dashed var(--faint); }
  :where(.dash-home[data-theme="default"]) .dash-shortcut-add:hover .dash-shortcut-icon { color: var(--accent); border-color: var(--accent); }
  :where(.dash-home[data-theme="default"]) .dash-restore { font-size: 12px; color: var(--accent); }
  :where(.dash-home[data-theme="default"]) .dash-restore:hover { text-decoration: underline; }
  :where(.dash-home[data-theme="default"]) .dash-empty { font-size: 12px; color: var(--faint); }
  :where(.dash-home[data-theme="default"]) .dash-theme-switcher { display: flex; gap: 6px; padding: 4px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); }
  :where(.dash-home[data-theme="default"]) .dash-theme-button { padding: 6px 12px; border-radius: 999px; font-size: 12px; color: var(--muted); }
  :where(.dash-home[data-theme="default"]) .dash-theme-button[aria-pressed="true"] { background: var(--bg); color: var(--fg); }
`;

/** Our own page script. Pure presentation helpers for themes (cursor position, sparkles, particles); never touches page data. */
const PAGE_SCRIPT = `(function(){
var home=document.querySelector('.dash-home');if(!home)return;
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var addBtn=document.getElementById('dash-add-btn'),addForm=document.getElementById('dash-add-form');
if(addBtn&&addForm)addBtn.addEventListener('click',function(){addForm.classList.toggle('open');var i=addForm.querySelector('input[name=url]');if(addForm.classList.contains('open')&&i)i.focus();});
if(home.getAttribute('data-theme')==='default')return;
home.addEventListener('mousemove',function(e){home.style.setProperty('--mouse-x',e.clientX+'px');home.style.setProperty('--mouse-y',e.clientY+'px');},{passive:true});
var sp=document.querySelector('.dash-sparkles');
if(sp&&!reduce){for(var i=0;i<16;i++){var s=document.createElement('div');s.className='dash-sparkle';s.style.left=(Math.random()*100)+'%';s.style.top=(Math.random()*100)+'%';s.style.animationDelay=(-Math.random()*3)+'s';s.style.animationDuration=(2+Math.random()*3)+'s';sp.appendChild(s);}}
var cv=document.querySelector('.dash-particle-canvas');
if(cv&&!reduce){var cs=getComputedStyle(cv);if(cs.display!=='none'&&parseFloat(cs.opacity)>0){
var ctx=cv.getContext('2d'),W=0,H=0,P=[];
var g=function(n){return getComputedStyle(home).getPropertyValue(n).trim();};
var cols=[g('--pink'),g('--lavender'),g('--blue'),g('--peach'),g('--accent')].filter(Boolean);if(!cols.length)cols=['#ffffff'];
var fit=function(){W=cv.width=cv.clientWidth;H=cv.height=cv.clientHeight;};fit();window.addEventListener('resize',fit);
for(var j=0;j<42;j++)P.push({x:Math.random()*W,y:Math.random()*H,r:1+Math.random()*2.6,vx:(Math.random()-.5)*.25,vy:-.1-Math.random()*.35,c:cols[j%cols.length],a:.3+Math.random()*.6});
var tick=function(){if(!document.hidden){ctx.clearRect(0,0,W,H);for(var k=0;k<P.length;k++){var p=P[k];p.x+=p.vx;p.y+=p.vy;if(p.y<-6){p.y=H+6;p.x=Math.random()*W;}if(p.x<-6)p.x=W+6;if(p.x>W+6)p.x=-6;ctx.globalAlpha=p.a;ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fill();}}requestAnimationFrame(tick);};
tick();}}
})();`;

export function buildNewTabHtml(
  topSites: TopSite[],
  searchEngine: SearchEngineId,
  hiddenCount = 0,
  isDark = true,
  customCss = '',
  hasStoredCustomCss = false,
  recoverableTabs = 0
): string {
  // User CSS is only ever placed inside its own <style>; neutralise any attempt to close it early.
  const userCss = customCss.replace(/<\/(style)/gi, '<\\/$1');
  const themeId = userCss ? detectThemeId(userCss) : 'default';
  const engine = SEARCH_ENGINES[searchEngine];
  const searchActionUrl = engine.url.split('%s')[0];

  const tiles = topSites
    .slice(0, 8)
    .map((site) => {
      const host = hostnameOf(site.url);
      const initial = host.charAt(0).toUpperCase() || '?';
      const color = colorFor(host);
      const label = site.title || host;
      // Real favicon captured from the site itself — no third-party favicon service. If it fails
      // to load (or none was captured) the tile falls back to a coloured initial.
      const iconInner = site.faviconUrl
        ? `<img src="${escapeHtml(site.faviconUrl)}" alt="" data-i="${escapeHtml(initial)}" onerror="var s=document.createElement('span');s.className='dash-tile-initial';s.textContent=this.dataset.i;this.replaceWith(s)">`
        : `<span class="dash-tile-initial">${escapeHtml(initial)}</span>`;
      return `
        <div class="dash-shortcut">
          <a class="dash-shortcut-link" href="${escapeHtml(site.url)}" title="${escapeHtml(label)}">
            <span class="dash-shortcut-icon" style="--tile-color:${color}">${iconInner}</span>
            <span class="dash-shortcut-label">${escapeHtml(label.length > 18 ? label.slice(0, 17) + '…' : label)}</span>
          </a>
          <a class="dash-shortcut-remove" title="Remove shortcut" href="${NEWTAB_ACTION_PREFIX}remove?host=${encodeURIComponent(host)}">×</a>
        </div>`;
    })
    .join('');

  const vars = isDark
    ? '--bg:#0b0d10;--fg:#f2f3f5;--card:#15181d;--line:#262b33;--muted:#a7adb8;--faint:#5c626d;--accent:#5b8cff;'
    : '--bg:#ffffff;--fg:#14161a;--card:#f1f3f6;--line:#dfe3e8;--muted:#5a606b;--faint:#8a919c;--accent:#3b64dc;';
  const baseCss = BASE_CSS.replace('__SCHEME__', isDark ? 'dark' : 'light')
    .replace('__VARS__', vars)
    .split('__LOGO__')
    .join(LOGO_MARK_DATA_URI);

  const recovery =
    recoverableTabs > 0
      ? `<div class="dash-recovery" role="status"><span>DASH closed unexpectedly last time. Restore your ${recoverableTabs} tab${recoverableTabs > 1 ? 's' : ''}?</span>
         <a href="${NEWTAB_ACTION_PREFIX}restore-session">Restore</a><a href="${NEWTAB_ACTION_PREFIX}dismiss-session">Dismiss</a></div>`
      : '';
  const customActive = userCss.length > 0;
  const switcher = hasStoredCustomCss
    ? `<div class="dash-theme-switcher" role="group" aria-label="Home page theme">
         <a class="dash-theme-button" aria-pressed="${customActive ? 'false' : 'true'}" href="${NEWTAB_ACTION_PREFIX}theme?mode=default">Classic</a>
         <a class="dash-theme-button" aria-pressed="${customActive ? 'true' : 'false'}" href="${NEWTAB_ACTION_PREFIX}theme?mode=custom">Custom</a>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>New Tab</title>
<style id="dash-base-css">${baseCss}${DEFAULT_CSS}</style>
${userCss ? `<style id="dash-user-css">\n${userCss}\n</style>` : ''}
</head>
<body>
<div class="dash-home" data-theme="${escapeHtml(themeId)}">
  ${recovery}
  <div class="dash-atmosphere"></div>
  <div class="dash-light-orbs"><div class="dash-orb"></div><div class="dash-orb"></div><div class="dash-orb"></div></div>
  <div class="dash-bubbles"><div class="dash-bubble"></div><div class="dash-bubble"></div><div class="dash-bubble"></div><div class="dash-bubble"></div><div class="dash-bubble"></div></div>
  <div class="dash-cursor-glow"></div>
  <canvas class="dash-particle-canvas"></canvas>
  <div class="dash-sparkles"></div>
  <main class="dash-content">
    <div class="dash-branding">
      <div class="dash-logo" role="img" aria-label="DASH logo"></div>
      <div class="dash-title">DA<span>SH</span></div>
      <div class="dash-tagline">Privacy First. Built for You.</div>
    </div>
    <form class="dash-search" action="${escapeHtml(searchActionUrl)}" method="GET">
      <input name="q" placeholder="Search or enter address" autofocus autocomplete="off" spellcheck="false">
    </form>
    <div class="dash-shortcuts">${tiles}
      <button type="button" class="dash-shortcut dash-shortcut-add" id="dash-add-btn" title="Add shortcut"><span class="dash-shortcut-icon">+</span><span class="dash-shortcut-label">Add shortcut</span></button>
    </div>
    <form class="dash-add-form" id="dash-add-form" action="${NEWTAB_ACTION_PREFIX}add" method="GET">
      <input name="title" placeholder="Name" maxlength="60" autocomplete="off">
      <input name="url" placeholder="Website address" required autocomplete="off" spellcheck="false">
      <button type="submit">Add</button>
    </form>
    ${topSites.length === 0 ? '<p class="dash-empty">Sites you visit often will show up here.</p>' : ''}
    ${hiddenCount > 0 ? `<a class="dash-restore" href="${NEWTAB_ACTION_PREFIX}restore">Restore ${hiddenCount} removed shortcut${hiddenCount > 1 ? 's' : ''}</a>` : ''}
    ${switcher}
  </main>
</div>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
}
