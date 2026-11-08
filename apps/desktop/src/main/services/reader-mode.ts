/**
 * Reading mode: a self-contained script run inside the page. It extracts the
 * main article with a text-density heuristic, strips it down to safe
 * elements/attributes, and shows it in a full-page overlay rendered inside a
 * shadow root (so page CSS can't leak in). Running it again closes the
 * overlay. Nothing leaves the page and no network requests are made.
 *
 * Returns 'opened' | 'closed' | 'unreadable'.
 */
export function buildReaderScript(isDark: boolean): string {
  return `(() => {
  const DARK = ${isDark ? 'true' : 'false'};
  const HOST_ID = '__dash_reader__';
  const existing = document.getElementById(HOST_ID);
  if (existing) { existing.remove(); document.documentElement.style.overflow = existing.dataset.prevOverflow || ''; return 'closed'; }

  const JUNK = 'script,style,noscript,nav,aside,footer,form,iframe,button,input,select,textarea,svg,canvas,video,audio,object,embed,dialog,[role=navigation],[role=banner],[role=complementary],[aria-hidden=true]';
  const textLen = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().length;

  function pickRoot() {
    const direct = document.querySelector('article') || document.querySelector('[role=main]') || document.querySelector('main');
    if (direct && textLen(direct) > 400) return direct;
    let best = null, bestScore = 0;
    for (const el of document.body.querySelectorAll('div,section,article,main,td')) {
      let score = 0;
      for (const child of el.children) {
        if (child.tagName === 'P') { const l = textLen(child); if (l > 60) score += l; }
      }
      if (score > bestScore) { best = el; bestScore = score; }
    }
    return bestScore > 300 ? best : (direct && textLen(direct) > 200 ? direct : null);
  }

  const root = pickRoot();
  if (!root) return 'unreadable';

  const ALLOWED = new Set(['P','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','PRE','CODE','EM','STRONG','B','I','A','IMG','FIGURE','FIGCAPTION','BR','HR','TABLE','THEAD','TBODY','TR','TH','TD','SUB','SUP','DIV','SPAN','SECTION','ARTICLE','MAIN']);
  function clean(src) {
    const out = document.createDocumentFragment();
    for (const node of src.childNodes) {
      if (node.nodeType === 3) { out.appendChild(document.createTextNode(node.textContent)); continue; }
      if (node.nodeType !== 1) continue;
      if (node.matches(JUNK)) continue;
      const tag = node.tagName;
      if (!ALLOWED.has(tag)) { out.appendChild(clean(node)); continue; }
      const el = document.createElement(tag.toLowerCase());
      if (tag === 'A') {
        const href = node.href || '';
        if (/^https?:/i.test(href)) { el.setAttribute('href', href); el.setAttribute('rel', 'noopener noreferrer'); }
      } else if (tag === 'IMG') {
        const s = node.currentSrc || node.src || '';
        if (!/^https?:/i.test(s) || (node.naturalWidth && node.naturalWidth < 80)) continue;
        el.setAttribute('src', s); el.setAttribute('alt', node.alt || ''); el.setAttribute('loading', 'lazy');
      }
      el.appendChild(clean(node));
      if ((tag === 'DIV' || tag === 'SPAN' || tag === 'SECTION') && !el.textContent.trim() && !el.querySelector('img')) continue;
      out.appendChild(el);
    }
    return out;
  }

  const body = clean(root);
  if (!(body.textContent || '').trim()) return 'unreadable';

  const h1 = root.querySelector('h1') || document.querySelector('h1');
  const title = (h1 && h1.textContent.trim()) || document.title || location.hostname;
  const lead = body.querySelector('h1');
  if (lead && lead.textContent.trim() === title) lead.remove();
  const words = (body.textContent || '').trim().split(/\\s+/).length;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset.prevOverflow = document.documentElement.style.overflow;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = \`
    :host{all:initial}
    .wrap{--bg:#fbfbf9;--fg:#1d1d1f;--mute:#6b6b70;--link:#2f5fd0;--rule:#e2e2dd;--code:#efefea;
      position:absolute;inset:0;overflow:auto;background:var(--bg);color:var(--fg);font:var(--fs,19px)/1.7 Georgia,'Times New Roman',serif}
    
    .wrap.dark{--bg:#121316;--fg:#e4e4e7;--mute:#9a9aa3;--link:#8ab0ff;--rule:#2a2b30;--code:#1d1e23}
    .bar{position:sticky;top:0;display:flex;gap:6px;align-items:center;justify-content:flex-end;padding:10px 16px;background:var(--bg);border-bottom:1px solid var(--rule);font:13px system-ui,sans-serif}
    .bar span{color:var(--mute);margin-right:auto}
    .bar button{font:inherit;color:var(--fg);background:transparent;border:1px solid var(--rule);border-radius:6px;padding:4px 10px;cursor:pointer}
    .bar button:hover{background:var(--code)}
    article{max-width:680px;margin:0 auto;padding:32px 20px 96px}
    h1.t{font-size:1.9em;line-height:1.25;margin:0 0 .3em}
    .meta{color:var(--mute);font:13px system-ui,sans-serif;margin-bottom:2em}
    a{color:var(--link)} img{max-width:100%;height:auto;border-radius:6px;display:block;margin:1em auto}
    blockquote{margin:1em 0;padding-left:1em;border-left:3px solid var(--rule);color:var(--mute)}
    pre,code{background:var(--code);border-radius:4px;font:.85em ui-monospace,Menlo,Consolas,monospace}
    pre{padding:12px;overflow:auto} code{padding:1px 4px} pre code{padding:0}
    table{border-collapse:collapse;max-width:100%} td,th{border:1px solid var(--rule);padding:4px 8px}
    h2,h3,h4{line-height:1.3;margin:1.6em 0 .5em} hr{border:0;border-top:1px solid var(--rule)}
  \`;
  const wrap = document.createElement('div'); wrap.className = 'wrap' + (DARK ? ' dark' : '');
  const bar = document.createElement('div'); bar.className = 'bar';
  const info = document.createElement('span'); info.textContent = words.toLocaleString() + ' words · ~' + Math.max(1, Math.round(words / 230)) + ' min read';
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); return b; };
  let size = 19;
  const setSize = (d) => { size = Math.min(30, Math.max(14, size + d)); wrap.style.setProperty('--fs', size + 'px'); };
  const close = () => { host.remove(); document.documentElement.style.overflow = host.dataset.prevOverflow || ''; document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  bar.append(info, mk('A−', () => setSize(-2)), mk('A+', () => setSize(2)), mk('Close', close));
  const art = document.createElement('article');
  const t = document.createElement('h1'); t.className = 't'; t.textContent = title;
  const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = location.hostname;
  art.append(t, meta, body);
  wrap.append(bar, art);
  shadow.append(style, wrap);
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.appendChild(host);
  document.addEventListener('keydown', onKey, true);
  return 'opened';
})()`;
}
