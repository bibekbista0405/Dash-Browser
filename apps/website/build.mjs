// Builds the DASH website: template/index.tpl.html + content.json -> dist/index.html (one self-contained file).
// Usage: node apps/website/build.mjs      (no dependencies)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const content = JSON.parse(read('content.json'));

// ---- the real DASH logo, split into pieces so it can be animated (made from apps/desktop/resources/icon-512.png) ----
const parts = JSON.parse(read('assets/logo-parts.json'));
const BOX = { x: 62, y: 123, w: 382, h: 254 };
const maskCss = parts
  .map((p) => `.lg .${p.name}{left:${(((p.x - BOX.x) / BOX.w) * 100).toFixed(3)}%;top:${(((p.y - BOX.y) / BOX.h) * 100).toFixed(3)}%;width:${((p.w / BOX.w) * 100).toFixed(3)}%;height:${((p.h / BOX.h) * 100).toFixed(3)}%;-webkit-mask-image:url(data:image/png;base64,${p.png});mask-image:url(data:image/png;base64,${p.png})}`)
  .join('\n');
const logo = (cls = '') => `<span class="lg ${cls}" aria-hidden="true">${parts.map((p) => `<i class="${p.name}"></i>`).join('')}</span>`;
const favicon = read('assets/favicon.b64').trim();

// ---- small illustrated, animated panels for the feature cards ----
const ART = {
  block: `<div class="art-block"><div class="rq r1"><span>GET ads.network.example/pixel.gif</span><b>blocked</b></div><div class="rq r2"><span>GET track.metrics.example/collect</span><b>blocked</b></div><div class="rq r3"><span>GET news-site.example/article</span><em>loaded</em></div></div>`,
  https: `<div class="art-https"><div class="u"><span class="plain">http</span><span class="sec">https</span><span>://example.org</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div></div>`,
  private: `<div class="art-private"><i class="t t1"></i><i class="t t2"></i><i class="t t3 ghost"></i><span>wiped</span></div>`,
  vault: `<div class="art-vault"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path class="shackle" d="M20 28v-7a12 12 0 0 1 24 0v7"/><rect x="14" y="28" width="36" height="26" rx="6"/><circle cx="32" cy="41" r="3.2" fill="currentColor"/></svg><p>••••••••••</p></div>`,
  backup: `<div class="art-backup"><div class="file"><b>backup</b><span>.dash</span></div><div class="beam"><i></i><i></i><i></i></div><div class="key">scrypt<br>AES-256-GCM</div></div>`,
  audio: `<div class="art-audio"><div class="eq"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="np"><b>Now playing</b><span>screen off</span><div class="prog"><i></i></div></div></div>`,
  desktop: `<div class="art-desktop"><div class="w"><div class="p a"></div><div class="p b"></div></div><div class="w sm"><div class="p a"></div></div></div>`,
  mobile: `<div class="art-mobile"><div class="ph"><i></i><i></i><i></i></div><div class="sw"><b></b></div></div>`,
  reader: `<div class="art-reader"><div class="noisy"><i></i><i></i><i></i></div><div class="clean"><b></b><b></b><b></b><b></b></div></div>`
};

// ---- a tiny template engine: {{a.b}} escaped, {{{a.b}}} raw, {{#each a}}..{{/each}} (this, @index), {{#if a}}..{{/if}} ----
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lookup = (ctx, key) => {
  if (key === 'this') return ctx.this;
  if (key === '@index') return ctx['@index'];
  if (key === '@index1') return ctx['@index'] + 1;
  if (key.startsWith('@root.')) return key.slice(6).split('.').reduce((o, k) => (o == null ? o : o[k]), ctx['@root']);
  const own = ctx.this !== null && typeof ctx.this === 'object' ? key.split('.').reduce((o, k) => (o == null ? o : o[k]), ctx.this) : undefined;
  return own !== undefined ? own : key.split('.').reduce((o, k) => (o == null ? o : o[k]), ctx['@root']);
};
function render(tpl, ctx) {
  let out = '';
  let i = 0;
  while (i < tpl.length) {
    const open = tpl.indexOf('{{', i);
    if (open < 0) { out += tpl.slice(i); break; }
    out += tpl.slice(i, open);
    if (tpl.startsWith('{{{', open)) {
      const end = tpl.indexOf('}}}', open);
      out += String(lookup(ctx, tpl.slice(open + 3, end).trim()) ?? '');
      i = end + 3; continue;
    }
    const end = tpl.indexOf('}}', open);
    const tag = tpl.slice(open + 2, end).trim();
    i = end + 2;
    if (tag.startsWith('#each ') || tag.startsWith('#if ')) {
      const isEach = tag.startsWith('#each ');
      const closer = isEach ? '{{/each}}' : '{{/if}}';
      // find the matching closer by counting every block opener and closer
      let depth = 1, j = i;
      const tags = ['{{#each ', '{{#if ', '{{/each}}', '{{/if}}'];
      while (depth > 0) {
        let best = -1, which = '';
        for (const t of tags) { const k = tpl.indexOf(t, j); if (k >= 0 && (best < 0 || k < best)) { best = k; which = t; } }
        if (best < 0) throw new Error('Unclosed block in template: ' + tag);
        if (which.startsWith('{{#')) { depth++; j = best + which.length; } else { depth--; j = best + which.length; }
      }
      const inner = tpl.slice(i, j - closer.length);
      i = j;
      const val = lookup(ctx, tag.replace(/^#(each|if) /, ''));
      if (isEach) (Array.isArray(val) ? val : []).forEach((v, idx) => { out += render(inner, { ...ctx, this: v, '@index': idx }); });
      else if (val && !(Array.isArray(val) && val.length === 0)) out += render(inner, ctx);
      continue;
    }
    out += esc(lookup(ctx, tag) ?? '');
  }
  return out;
}

const data = JSON.parse(JSON.stringify(content));
data.features.items.forEach((f) => { f.artHtml = ART[f.art] ?? ''; f.chips = f.chips ?? []; });
data.steps.windows.items = data.steps.windows.items.map((s) => ({ s }));
data.steps.android.items = data.steps.android.items.map((s) => ({ s }));
data.platforms.windows.points = data.platforms.windows.points.map((s) => ({ s }));
data.platforms.android.points = data.platforms.android.points.map((s) => ({ s }));
data.hero.lines = data.hero.lines.map((s) => ({ s }));
data.ribbon = data.ribbon.map((s) => ({ s }));
data.features.items.forEach((f) => { f.chips = f.chips.map((s) => ({ s })); });
data.home.manifestoWords = data.home.manifesto.split(/\s+/).map((s) => ({ s }));
data.home.how.items.forEach((h, i) => { h.artHtml = ART[h.art] ?? ''; h.n = String(i + 1).padStart(2, '0'); });
data.intro.letters = [...data.site.name].map((s) => ({ s }));
data._logo = logo();
data._logoLoop = logo('loop');
data._logoBuild = logo('build');
data._maskCss = maskCss;
data._favicon = favicon;
data._json = JSON.stringify({ repo: content.site.repo, thanks: content.thanks, rows: content.connections.rows, pages: Object.fromEntries(Object.entries(content.pages).map(([k, v]) => [k, v.kicker])), siteName: content.site.name }).replace(/</g, '\\u003c');

const html = render(read('template/index.tpl.html'), { this: data, '@root': data });
const out = path.join(here, 'dist');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'content.json'), JSON.stringify(content, null, 2));
fs.copyFileSync(path.join(here, 'template/admin.html'), path.join(out, 'admin.html'));
console.log(`Built dist/index.html (${(html.length / 1024).toFixed(0)} KB), dist/admin.html and dist/content.json`);
