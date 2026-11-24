// Builds the DASH website: template/index.tpl.html + content.json -> public/index.html (one self-contained file).
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
data.nav = data.nav.map((n) => ({ ...n, url: n.href ? n.href : '#' + n.page, hard: n.href ? '1' : '', docUrl: n.href ? n.href : 'index.html#' + n.page }));
data.hero.trust = (data.hero.trust || []).map((s) => ({ s }));
// real numbers about the code base, counted at build time (so nothing on the Developer page is invented)
function repoStats() {
  const root = path.join(here, '..', '..'), snap = path.join(here, 'snapshot', 'stats.json');
  const dirs = [['apps/desktop/src', ['.ts', '.tsx', '.css']], ['apps/android/app/src', ['.kt', '.xml']], ['packages', ['.ts', '.tsx']], ['apps/website', ['.html', '.mjs', '.json']]];
  if (!fs.existsSync(path.join(root, 'apps/desktop'))) { try { return JSON.parse(fs.readFileSync(snap, 'utf8')); } catch { return null; } }
  let lines = 0, files = 0;
  const skip = new Set(['node_modules', 'dist', 'dist-electron', 'release', 'public', 'snapshot', '.git', 'build', 'out']);
  const walk = (dir, exts) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (skip.has(e.name)) continue; const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, exts); else if (exts.includes(path.extname(e.name)) && !/package-lock|logo-parts|content\.json/.test(e.name)) { const t = fs.readFileSync(f, 'utf8'); lines += t.split('\n').length; files++; } } };
  for (const [d, x] of dirs) { const full = path.join(root, d); if (fs.existsSync(full)) walk(full, x); }
  const log = (fs.existsSync(path.join(root, 'CHANGELOG.md')) ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') : '');
  const heads = [...log.matchAll(/^## (M\d+) - (.+)$/gm)];
  const out = { lines, files, milestones: heads.length, timeline: heads.slice(0, 7).map((m) => ({ n: m[1], t: m[2] })) };
  fs.mkdirSync(path.dirname(snap), { recursive: true }); fs.writeFileSync(snap, JSON.stringify(out));
  return out;
}
const rs = repoStats();
data.dev = rs ? { lines: rs.lines, files: rs.files, milestones: rs.milestones, timeline: rs.timeline } : { lines: 0, files: 0, milestones: 0, timeline: [] };
data.developer.rings = data.developer.rings.map((r) => ({ items: r.map((s) => ({ s })) }));
data.developer.counts = data.developer.counts.map((s) => ({ s }));
data.updated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
data._logo = logo();
data._logoLoop = logo('loop');
data._logoBuild = logo('build');
data._maskCss = maskCss;
data._favicon = favicon;
data._json = JSON.stringify({ repo: content.site.repo, thanks: content.thanks, demo: content.demo, rows: content.connections.rows, pages: Object.fromEntries(Object.entries(content.pages).map(([k, v]) => [k, v.kicker])), siteName: content.site.name, dev: { lines: rs ? rs.lines : 0, files: rs ? rs.files : 0, milestones: rs ? rs.milestones : 0 } }).replace(/</g, '\\u003c');

const siteUrl = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : content.site.url || '')).replace(/\/$/, '');
data.ogImage = siteUrl ? siteUrl + '/og.png' : 'og.png';
const html = render(read('template/index.tpl.html'), { this: data, '@root': data });
const out = path.join(here, 'public');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'content.json'), JSON.stringify(content, null, 2));
fs.copyFileSync(path.join(here, 'template/admin.html'), path.join(out, 'admin.html'));

// ---- real pages: privacy, terms, security, docs, licenses, changelog, 404 ----
const esc2 = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (t) => esc2(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
// the repository's own files are the source of truth; keep a snapshot so the site still builds if only this folder is checked out
fs.mkdirSync(path.join(here, 'snapshot'), { recursive: true });
const repoFile = (name) => {
  const up = path.join(here, '..', '..', name), snap = path.join(here, 'snapshot', name);
  if (fs.existsSync(up)) { const t = fs.readFileSync(up, 'utf8'); fs.writeFileSync(snap, t); return t; }
  return fs.existsSync(snap) ? fs.readFileSync(snap, 'utf8') : '';
};
function changelogHtml(md) {
  const out = []; let inList = false, id = 0;
  for (const line of md.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^## (.+)/))) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h2 id="r${id++}">${inline(m[1])}</h2>`); }
    else if ((m = line.match(/^[-*] (.+)/))) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (line.trim() === '' && inList) { out.push('</ul>'); inList = false; }
    else if (/^[^#\s-]/.test(line) && !/^(All notable|\[Keep|Changelog)/.test(line) && !line.startsWith('#') && !line.startsWith('[SemVer]') && !line.startsWith('versions follow')) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<p>${inline(line)}</p>`); }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}
function licensesBody() {
  const tp = repoFile('THIRD_PARTY_NOTICES.md'); const rows = [...tp.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]*) \|$/gm)].filter((m) => m[1].trim() !== 'Package' && !/^-+$/.test(m[1].trim()));
  const sum = (tp.match(/\*\*(\d+) packages\.\*\* By license: ([^\n]+)/) || []);
  const body = rows.map((m) => `<tr><td>${esc2(m[1].trim())}</td><td>${esc2(m[2].trim())}</td><td>${esc2(m[3].trim())}</td></tr>`).join('');
  return `<p class="lead">DASH is free software under the GPL. It builds on other free software, each piece under its own licence.</p>
<p class="meta">Updated ${data.updated}.</p>
<h2 id="dash">DASH</h2>
<p>DASH is licensed under <b>GPL-3.0-only</b>, copyright 2026 ${esc2(content.site.developer)}. Read the full text in the <a href="https://github.com/${content.site.repo}/blob/main/LICENSE" rel="noopener">LICENSE</a> file, or the <a href="https://www.gnu.org/licenses/gpl-3.0.html" rel="noopener">GNU site</a>. The complete source code is public at <a href="https://github.com/${content.site.repo}" rel="noopener">github.com/${content.site.repo}</a>, which is what the GPL asks of anyone who distributes the program.</p>
<h2 id="electron">Electron and Chromium</h2>
<p>DASH for Windows is built on Electron, which embeds Chromium. They are separate works with their own notices. After installing, find <code>LICENSE.electron.txt</code> and <code>LICENSES.chromium.html</code> in DASH's installed app folder.</p>
<h2 id="packages">Packages inside DASH for Windows</h2>
<p>${sum[1] ? `<b>${sum[1]} packages.</b> By licence: ${esc2(sum[2])}.` : 'The list below comes from the installed production dependencies.'} It is generated from the repository by <code>scripts/gen-third-party.mjs</code>.</p>
<div class="tablewrap"><table><thead><tr><th>Package</th><th>Version</th><th>Licence</th></tr></thead><tbody>${body}</tbody></table></div>
<h2 id="site">This website</h2>
<p>The website's fonts are Bricolage Grotesque, Hanken Grotesk and JetBrains Mono, all under the SIL Open Font License 1.1, loaded from Google Fonts. The site's own code is part of the DASH repository under GPL-3.0.</p>`;
}
const pages = [
  { file: 'privacy', title: 'Privacy policy', kicker: 'Legal', desc: 'What DASH and this website do with your data: nothing is sent to the developer, no accounts, no telemetry, and every connection is listed.' },
  { file: 'terms', title: 'Terms of use', kicker: 'Legal', desc: 'The short terms for using DASH and this website. GPL-3.0 licence, no warranty, plain words.' },
  { file: 'security', title: 'Security', kicker: 'Security', desc: 'How to report a vulnerability in DASH privately, what is in scope, and how to check what you download.' },
  { file: 'compare', title: 'DASH compared honestly', kicker: 'About', desc: 'Where DASH is a good fit, where other browsers are ahead today, and what to check in any browser you use.' },
  { file: 'contribute', title: 'Contribute and roadmap', kicker: 'Project', desc: 'Report problems, run DASH from source, send a pull request, and see what might come next.' },
  { file: 'press', title: 'Press kit', kicker: 'Project', desc: 'Facts, a short description, logo and colours for anyone writing about DASH.' },
  { file: 'verify', title: 'Verify your download', kicker: 'Security', desc: 'How to check the SHA-256 checksum of the DASH installer or APK against the official GitHub release.' },
  { file: 'docs', title: 'Documentation', kicker: 'Docs', desc: 'Install DASH, keyboard shortcuts, privacy tools, App Lock, backups and fixes for common problems.' },
  { file: 'licenses', title: 'Licenses', kicker: 'Legal', desc: 'The GPL-3.0 licence of DASH and the licences of the software it builds on.', gen: licensesBody },
  { file: 'changelog', title: 'Changelog', kicker: 'Releases', desc: 'Every change made to DASH, newest first.', gen: () => `<p class="lead">What changed in each milestone, newest first. The same list is in the repository.</p>${changelogHtml(repoFile('CHANGELOG.md'))}` },
];
const docTpl = read('template/doc.tpl.html');
const urls = ['index.html'];
for (const pg of pages) {
  let body = pg.gen ? pg.gen() : render(read(`pages/${pg.file}.html`), { this: data, '@root': data });
  const heads = [...body.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].filter((m, i) => pg.file !== 'changelog' || i < 40);
  const toc = heads.map((m) => `<a href="#${m[1]}">${m[2].replace(/<[^>]+>/g, '')}</a>`).join('');
  const navDoc = data.nav.map((n) => ({ ...n, cur: n.page === pg.file }));
  const page = render(docTpl, { this: { ...data, nav: navDoc, doc: { ...pg, body, toc, canonical: siteUrl ? `${siteUrl}/${pg.file}` : '' } }, '@root': data });
  fs.writeFileSync(path.join(out, `${pg.file}.html`), page);
  urls.push(`${pg.file}.html`);
}
// 404
const nf = render(docTpl, { this: { ...data, nav: data.nav.map((n) => ({ ...n })), doc: { title: 'Page not found', kicker: '404', desc: 'This page does not exist.', toc: '', body: '<p class="lead">That page is not here. It may have moved.</p><p><a class="btn-link" href="index.html">Go to the home page</a></p>' } }, '@root': data });
fs.writeFileSync(path.join(out, '404.html'), nf);
// static files (robots, manifest, icons...) copied as they are
const pub = path.join(here, 'static');
if (fs.existsSync(pub)) fs.cpSync(pub, out, { recursive: true });
if (siteUrl) {
  const routes = ['', ...pages.map((p) => p.file)];
  fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((r) => `  <url><loc>${siteUrl}/${r}</loc></url>`).join('\n')}\n</urlset>\n`);
  fs.appendFileSync(path.join(out, 'robots.txt'), `\nSitemap: ${siteUrl}/sitemap.xml\n`);
}
console.log(`Built ${urls.length} pages + 404${siteUrl ? ' + sitemap for ' + siteUrl : ' (set SITE_URL to also write sitemap.xml)'}`);
console.log(`Built public/index.html (${(html.length / 1024).toFixed(0)} KB), public/admin.html and public/content.json`);
