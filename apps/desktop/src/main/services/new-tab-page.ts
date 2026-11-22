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

/** Short, consistent tile name: a short page title if it is really the site's name, otherwise the site's own host name. */
function tileLabel(title: string, host: string): string {
  const t = title.trim();
  // IP addresses and single-word hosts (127.0.0.1, localhost, a router) are shown whole, never split at the dots.
  if (/^[\d.:]+$/.test(host) || !host.includes('.')) return t && t.length <= 14 && !/[|\u2013\u2014:()]| - /.test(t) ? t : host;
  const base = host.split('.').filter((p) => !['www', 'web', 'm', 'app'].includes(p));
  const core = base.length >= 2 ? base[base.length - 2] : base[0] ?? host;
  const fallback = core.charAt(0).toUpperCase() + core.slice(1);
  // Titles like "he was thrown out - YouTube" or "Inbox (3) - mail" describe a page, not the site: use the host name.
  if (!t || t.length > 14 || /[|\u2013\u2014:()]| - /.test(t) || /\s/.test(t) && t.split(/\s+/).length > 2) return fallback;
  return t;
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
export const NEWTAB_SUGGEST_PREFIX = 'dash-suggest:';
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
  :root { color-scheme: light dark; __VARS__ }
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
  .dash-suggest { position: fixed; z-index: 30; padding: 6px; border-radius: 18px; background: var(--card, #15181d); color: var(--fg, #f2f3f5);
    border: 1px solid var(--line, #262b33); box-shadow: 0 14px 40px rgba(0,0,0,.28); max-height: 320px; overflow: auto; }
  .dash-suggest-item { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-radius: 12px; font-size: 14px; cursor: pointer; }
  .dash-suggest-item:hover, .dash-suggest-item[aria-selected="true"] { background: color-mix(in srgb, var(--accent, #5b8cff) 16%, transparent); }
  .dash-suggest-icon { width: 16px; text-align: center; color: var(--muted, #a7adb8); flex: none; }
  .dash-suggest-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dash-search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: inherit; font: inherit; }
  .dash-shortcut { position: relative; cursor: pointer; }
  button.dash-shortcut { font: inherit; color: inherit; background: none; border: none; }
  .dash-shortcut-link { display: contents; }
  .dash-shortcut-icon { position: relative; overflow: hidden; display: grid; place-items: center; background: var(--tile-color, transparent); }
  .dash-shortcut-icon img { display: block; }
  .dash-shortcut-remove { position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; z-index: 1; border-radius: 999px;
    background: rgba(127,127,127,.35); color: inherit; display: none; align-items: center; justify-content: center; font-size: 14px; line-height: 1; }
  .dash-shortcut-edit { position: absolute; top: 6px; left: 6px; width: 20px; height: 20px; z-index: 1; border-radius: 999px; border: none; cursor: pointer;
    background: rgba(127,127,127,.35); color: inherit; display: none; align-items: center; justify-content: center; font-size: 11px; line-height: 1; padding: 0; }
  .dash-shortcut-edit:hover { background: var(--accent); color: #fff; }
  .dash-shortcut:hover .dash-shortcut-remove, .dash-shortcut:hover .dash-shortcut-edit, .dash-shortcut:focus-within .dash-shortcut-remove, .dash-shortcut:focus-within .dash-shortcut-edit { display: flex; }
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
  :where(.dash-home[data-theme="default"]) .dash-shortcuts { width: min(100%, 640px); display: grid; grid-template-columns: repeat(5, 112px); justify-content: center; gap: 14px 10px; animation: dash-fade-in .4s ease-out .1s backwards; }
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
  @media (max-width: 620px) { :where(.dash-home[data-theme="default"]) .dash-shortcuts { grid-template-columns: repeat(3, 100px); } }
  :where(.dash-home[data-theme="default"]) .dash-restore { font-size: 12px; color: var(--accent); }
  :where(.dash-home[data-theme="default"]) .dash-restore:hover { text-decoration: underline; }
  .dash-protect { display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; padding: 7px 14px 7px 11px; border-radius: 999px; font-size: 12px; color: var(--muted, #8a93a8); border: 1px solid var(--line, rgba(128,128,128,.25)); animation: dash-fade-in .6s ease-out .35s backwards; }
  .dash-protect svg { flex: none; color: var(--accent, #5b8cff); }
  .dash-protect b { font-weight: 600; color: var(--fg, inherit); font-variant-numeric: tabular-nums; }
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
document.querySelectorAll('.dash-shortcut-edit').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(!addForm)return;addForm.querySelector('input[name=title]').value=b.getAttribute('data-name')||'';addForm.querySelector('input[name=url]').value=b.getAttribute('data-url')||'';addForm.classList.add('open');var n=addForm.querySelector('input[name=title]');n.focus();n.select();});});
document.querySelectorAll('.dash-shortcut-remove').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var t=a.closest('.dash-shortcut');if(t){t.style.transition='opacity .16s ease, transform .16s ease';t.style.opacity='0';t.style.transform='scale(.9)';setTimeout(function(){t.remove();},170);}location.href=a.href;});});
if(addBtn&&addForm)addBtn.addEventListener('click',function(){addForm.classList.toggle('open');var i=addForm.querySelector('input[name=url]');if(addForm.classList.contains('open')&&i)i.focus();});

var sForm=document.querySelector('.dash-search'),sIn=sForm&&sForm.querySelector('input[name=q]'),sBox=document.getElementById('dash-suggest'),sItems=[],sSel=-1,sTimer=0,sLast='';
function sHide(){if(sBox){sBox.style.display='none';sBox.innerHTML='';}sItems=[];sSel=-1;}
function sPlace(){var r=sForm.getBoundingClientRect();sBox.style.left=r.left+'px';sBox.style.top=(r.bottom+6)+'px';sBox.style.width=r.width+'px';}
function sMark(){var k=sBox.children;for(var i=0;i<k.length;i++)k[i].setAttribute('aria-selected',i===sSel?'true':'false');}
function sGo(it){if(it.kind==='site'&&it.url){location.href=it.url;}else{sIn.value=it.text;sForm.submit();}}
window.__dashSuggest=function(d){
  if(!sIn||!sBox||d.q!==sIn.value.trim().slice(0,120))return;
  sItems=d.items||[];sSel=-1;sBox.innerHTML='';
  if(!sItems.length){sBox.style.display='none';return;}
  sItems.forEach(function(it,i){var b=document.createElement('div');b.className='dash-suggest-item';b.setAttribute('role','option');
    var ic=document.createElement('span');ic.className='dash-suggest-icon';ic.textContent=it.kind==='site'?'↳':'⌕';
    var t=document.createElement('span');t.className='dash-suggest-text';t.textContent=it.text;b.appendChild(ic);b.appendChild(t);
    b.addEventListener('mousedown',function(e){e.preventDefault();sGo(it);});sBox.appendChild(b);});
  sPlace();sBox.style.display='block';
};
if(sIn&&sBox){
  sIn.addEventListener('input',function(){var v=sIn.value.trim();clearTimeout(sTimer);if(!v){sLast='';sHide();return;}
    sTimer=setTimeout(function(){if(v!==sLast){sLast=v;console.debug('dash-suggest:'+v.slice(0,120));}},90);});
  sIn.addEventListener('keydown',function(e){if(!sItems.length)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();sSel=(sSel+(e.key==='ArrowDown'?1:-1)+sItems.length+1)%(sItems.length+1);if(sSel===sItems.length)sSel=-1;sMark();if(sSel>=0)sIn.value=sItems[sSel].kind==='site'?sIn.value:sItems[sSel].text;}
    else if(e.key==='Enter'&&sSel>=0&&sItems[sSel].kind==='site'){e.preventDefault();sGo(sItems[sSel]);}
    else if(e.key==='Escape'){sHide();}});
  sIn.addEventListener('blur',function(){setTimeout(sHide,120);});
  window.addEventListener('resize',function(){if(sBox.style.display==='block')sPlace();});
}
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
  _hiddenCount = 0,
  isDark = true,
  customCss = '',
  hasStoredCustomCss = false,
  recoverableTabs = 0,
  blockedTotal = 0
): string {
  // User CSS is only ever placed inside its own <style>; neutralise any attempt to close it early.
  const userCss = customCss.replace(/<\/(style)/gi, '<\\/$1');
  const themeId = userCss ? detectThemeId(userCss) : 'default';
  const engine = SEARCH_ENGINES[searchEngine];
  const searchActionUrl = engine.url.split('%s')[0];

  const tiles = topSites
    .slice(0, 9)
    .map((site) => {
      const host = hostnameOf(site.url);
      const initial = host.charAt(0).toUpperCase() || '?';
      const color = colorFor(host);
      const label = tileLabel(site.title, host);
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
          <button type="button" class="dash-shortcut-edit" title="Edit shortcut" aria-label="Edit ${escapeHtml(label)}" data-url="${escapeHtml(site.url)}" data-name="${escapeHtml(label)}">✎</button>
          <a class="dash-shortcut-remove" title="Remove shortcut" aria-label="Remove ${escapeHtml(label)}" href="${NEWTAB_ACTION_PREFIX}remove?host=${encodeURIComponent(host)}">×</a>
        </div>`;
    })
    .join('');

  // Both palettes ship in the page: the baked one is the default and prefers-color-scheme (which follows the
  // app theme) swaps live, so an already-open New Tab follows a theme change without a reload or a flash.
  const darkVars = '--bg:#0b0d10;--fg:#f2f3f5;--card:#15181d;--line:#262b33;--muted:#a7adb8;--faint:#5c626d;--accent:#5b8cff;';
  const lightVars = '--bg:#ffffff;--fg:#14161a;--card:#f1f3f6;--line:#dfe3e8;--muted:#5a606b;--faint:#8a919c;--accent:#3b64dc;';
  const vars = `${isDark ? darkVars : lightVars} } @media (prefers-color-scheme: ${isDark ? 'light' : 'dark'}) { :root { ${isDark ? lightVars : darkVars} }`;
  const baseCss = BASE_CSS.replace('__VARS__', vars)
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
    <div id="dash-suggest" class="dash-suggest" role="listbox" aria-label="Suggestions" style="display:none"></div>
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
    ${blockedTotal > 0 ? `<div class="dash-protect" title="Counted on this device only. Nothing is sent anywhere."><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.500-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg><span>DASH has blocked <b>${blockedTotal.toLocaleString('en-US')}</b> ad and tracker requests for you</span></div>` : ''}
    ${topSites.length === 0 ? '<p class="dash-empty">Sites you visit often will show up here.</p>' : ''}
    ${switcher}
  </main>
</div>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
}

export type PrivateVpnOutcome = 'connecting' | 'connected' | 'not-configured' | 'failed' | 'disabled' | 'bypassed';

/** New Tab page of a private tab: no shortcuts or history, and an honest statement of what private tabs do and do not do. */
export function buildPrivateNewTabHtml(outcome: PrivateVpnOutcome, isDark: boolean, searchEngine: SearchEngineId): string {
  const engine = SEARCH_ENGINES[searchEngine];
  const action = engine.url.split('%s')[0];
  const A = NEWTAB_ACTION_PREFIX;
  const status: Record<PrivateVpnOutcome, { tone: 'ok' | 'warn' | 'busy'; text: string; links: string }> = {
    connecting: { tone: 'busy', text: 'Connecting to your VPN before anything loads…', links: '' },
    connected: { tone: 'ok', text: 'Your VPN is on. Websites and your network see the VPN server, not your own address.', links: '' },
    'not-configured': {
      tone: 'warn',
      text: 'No VPN is set up, so websites and your network can see your address. Add a VPN server and private tabs will connect it for you.',
      links: `<a href="${A}open-settings">Set up a VPN</a>`,
    },
    failed: {
      tone: 'warn',
      text: 'Your VPN could not connect, so this tab has not loaded anything. Nothing was sent.',
      links: `<a href="${A}retry-vpn">Try again</a><a href="${A}browse-without-vpn">Continue without the VPN</a><a href="${A}open-settings">VPN settings</a>`,
    },
    disabled: {
      tone: 'warn',
      text: 'Automatic VPN for private tabs is off, so websites and your network can see your address.',
      links: `<a href="${A}open-settings">Open settings</a>`,
    },
    bypassed: { tone: 'warn', text: 'This tab is browsing without the VPN, so websites and your network can see your address.', links: '' },
  };
  const st = status[outcome];
  const darkVars = '--bg:#0d0b14;--fg:#f2f1f7;--card:#17141f;--line:#2a2536;--muted:#aaa5b8;--faint:#6b6679;--accent:#a78bfa;';
  const lightVars = '--bg:#f6f4fb;--fg:#17141f;--card:#ffffff;--line:#e0dbec;--muted:#5d586b;--faint:#8c869b;--accent:#6d4fd6;';
  const vars = `${isDark ? darkVars : lightVars} } @media (prefers-color-scheme: ${isDark ? 'light' : 'dark'}) { :root { ${isDark ? lightVars : darkVars} }`;
  const css = BASE_CSS.replace('__VARS__', vars).split('__LOGO__').join(LOGO_MARK_DATA_URI);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>New private tab</title>
<style>${css}
  .p-wrap { width: min(560px, 92vw); display: flex; flex-direction: column; align-items: center; gap: 22px; text-align: center; }
  .p-logo { width: 64px; height: 64px; background: var(--accent); -webkit-mask: url(${LOGO_MARK_DATA_URI}) center / contain no-repeat; mask: url(${LOGO_MARK_DATA_URI}) center / contain no-repeat; }
  .p-wrap h1 { font-size: 24px; font-weight: 650; letter-spacing: -.01em; }
  .p-status { width: 100%; display: flex; gap: 12px; text-align: left; padding: 14px 16px; border-radius: 14px; background: var(--card); border: 1px solid var(--line); font-size: 13.5px; line-height: 1.5; }
  .p-dot { flex: none; width: 9px; height: 9px; border-radius: 99px; margin-top: 6px; background: #22c55e; }
  .p-status[data-tone="warn"] .p-dot { background: #f59e0b; }
  .p-status[data-tone="busy"] .p-dot { background: var(--accent); animation: p-pulse 1s ease-in-out infinite; }
  @keyframes p-pulse { 50% { opacity: .3; } }
  .p-links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 6px; }
  .p-links a { color: var(--accent); font-weight: 600; }
  .p-links a:hover { text-decoration: underline; }
  .p-search { width: 100%; display: flex; height: 46px; padding: 0 18px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); }
  .p-search:focus-within { border-color: var(--accent); }
  .p-search input { font-size: 15px; width: 100%; }
  .p-list { width: 100%; text-align: left; font-size: 12.5px; line-height: 1.55; color: var(--muted); display: grid; gap: 8px; }
  .p-list b { color: var(--fg); font-weight: 600; }
</style></head><body><main class="dash-content" style="position:fixed;inset:0;background:var(--bg);color:var(--fg)"><div class="p-wrap">
<div class="p-logo" role="img" aria-label="DASH"></div>
<h1>Private tab</h1>
<div class="p-status" data-tone="${st.tone}" role="status"><span class="p-dot"></span><div>${escapeHtml(st.text)}${st.links ? `<div class="p-links">${st.links}</div>` : ''}</div></div>
<form class="p-search" action="${escapeHtml(action)}" method="GET"><input name="q" placeholder="Search or enter address" autofocus autocomplete="off" spellcheck="false" style="background:transparent;border:none;outline:none;color:inherit;font:inherit"></form>
<div class="p-list">
<div><b>Not kept:</b> history, cookies, site data, passwords and form entries from private tabs are erased when the last private tab closes. Search suggestions are not requested here.</div>
<div><b>Not hidden:</b> sites you sign in to, your VPN provider, and your school or work network can still see what you do. No browser can make you invisible, and a VPN only moves who can see your traffic.</div>
</div></div></main></body></html>`;
}


/** The empty pane of a new split view: pick an open tab or a shortcut, or search. Plain page, no bridge to the app. */
export function buildSplitPickerHtml(
  openTabs: { id: string; title: string; url: string; faviconUrl: string }[],
  searchEngine: SearchEngineId,
  isDark: boolean
): string {
  const engine = SEARCH_ENGINES[searchEngine];
  const searchActionUrl = engine.url.split('%s')[0];
  const icon = (faviconUrl: string, host: string): string => {
    const initial = escapeHtml(host.charAt(0).toUpperCase() || '?');
    return faviconUrl
      ? `<span class="ic"><img src="${escapeHtml(faviconUrl)}" alt="" data-i="${initial}" onerror="var s=document.createElement('span');s.textContent=this.dataset.i;this.replaceWith(s)"></span>`
      : `<span class="ic"><span>${initial}</span></span>`;
  };
  const row = (href: string, title: string, host: string, faviconUrl: string): string =>
    `<a class="row" href="${escapeHtml(href)}">${icon(faviconUrl, host)}<span class="tx"><b>${escapeHtml(title.length > 48 ? title.slice(0, 47) + '…' : title)}</b><small>${escapeHtml(host)}</small></span></a>`;
  const tabRows = openTabs
    .slice(0, 12)
    .map((t) => row(`${NEWTAB_ACTION_PREFIX}split-pick?tab=${encodeURIComponent(t.id)}`, t.title || hostnameOf(t.url), hostnameOf(t.url) || t.url, t.faviconUrl))
    .join('');
  const dark = '--bg:#0f1417;--fg:#f2f3f5;--card:#1b2227;--hover:#252d33;--muted:#a7adb8;--accent:#5b8cff;';
  const light = '--bg:#f4f6f8;--fg:#14161a;--card:#ffffff;--hover:#eaeef2;--muted:#5a606b;--accent:#3b64dc;';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>New Tab</title><style>
:root{${isDark ? dark : light}}@media (prefers-color-scheme:${isDark ? 'light' : 'dark'}){:root{${isDark ? light : dark}}}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:14px system-ui,'Segoe UI',sans-serif}
main{max-width:520px;margin:0 auto;padding:9vh 20px 24px}
h1{font-size:15px;font-weight:600;margin:0 0 14px;text-align:center}
form{margin-bottom:18px}input{width:100%;height:40px;border-radius:20px;border:1px solid var(--hover);background:var(--card);color:var(--fg);padding:0 16px;font-size:14px;outline:none}
input:focus{border-color:var(--accent)}
h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:16px 4px 6px;font-weight:600}
.list{background:var(--card);border-radius:14px;overflow:hidden}
.row{display:flex;align-items:center;gap:12px;padding:8px 10px;color:inherit;text-decoration:none}
.row:hover,.row:focus-visible{background:var(--hover);outline:none}
.ic{width:36px;height:36px;border-radius:9px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none;overflow:hidden}
.ic img{width:20px;height:20px}.tx{display:flex;flex-direction:column;min-width:0}.tx b{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tx small{color:var(--muted)}
.empty{color:var(--muted);text-align:center;margin:18px 0}
</style></head><body><main>
<h1>Choose what to show on this side</h1>
<form action="${escapeHtml(searchActionUrl)}" method="GET"><input name="q" placeholder="Search or enter address" autofocus autocomplete="off" spellcheck="false"></form>
${tabRows ? `<h2>Your open tabs</h2><div class="list">${tabRows}</div>` : ''}
${!tabRows ? '<p class="empty">No other tabs are open. Type an address above to open it here.</p>' : ''}
</main></body></html>`;
}
