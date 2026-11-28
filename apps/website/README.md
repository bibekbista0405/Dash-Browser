# DASH website

```
apps/website/
  content.json            all the site's text, lists and links  <- edit this
  pages/                  the written pages: privacy, terms, security, docs (HTML fragments)
  template/index.tpl.html the main site: home, connections, features, playground, download, questions
  template/doc.tpl.html   the layout shared by privacy, terms, security, docs, licenses, promises and 404
  template/admin.html     the visual editor for content.json (local use only, never deployed)
  assets/                 the real DASH logo, split into animatable pieces
  static/                 files copied as they are: robots.txt, site.webmanifest, icon
  snapsnapshot/           copies of THIRD_PARTY_NOTICES.md and build statistics, so the site builds from this folder alone, refreshed on every build
  build.mjs               content.json + templates -> public/ (no dependencies)
  vercel.json             Vercel settings (build command, output folder, security headers, clean URLs)
  public/                 THE READY-TO-HOST SITE: index.html, docs.html, privacy.html, terms.html, security.html, licenses.html, promises.html, 404.html, robots.txt, icon. Committed on purpose, so Vercel can serve it as is
```

## Deploy on Vercel
1. Push the repository to GitHub, then in Vercel choose **Add New > Project** and import it.
2. Set **Root Directory** to `apps/website`. Leave "Framework Preset" as Other. There is nothing to build: `vercel.json` serves the `public` folder as it is. Leave Build Command and Install Command empty.
3. Deploy. Every push to `main` redeploys. For a sitemap and canonical links, rebuild once with your address, `SITE_URL=https://your-domain node build.mjs`, and commit `public/`.
4. Pages you get: `/` (home and the five sections as `#connections`, `#features`, `#playground`, `#get`, `#questions`), `/docs`, `/privacy`, `/terms`, `/security`, `/licenses`, `/promises`, `/verify`, `/compare`, `/press` and a 404 page.
5. Use `/privacy` as the privacy-policy URL wherever a store or form asks for one.

After you edit `content.json` or a template, run `node build.mjs` to rebuild `public/`, then commit it. Local preview: open `public/index.html`, or `npm run preview` in this folder for a local server.

## Change the text (the "CMS")
1. Run `WITH_ADMIN=1 node build.mjs`, then open `public/admin.html` on your own computer. It is not part of the normal build, so it never goes live. Delete it again with a normal `node build.mjs`. It loads `content.json` into a form. Edit text, add, remove or reorder
   FAQ items, features, ledger rows, steps and more. Nothing is uploaded.
2. Press **Download content.json**, or **Copy JSON** then **Edit on GitHub** and paste.
3. Commit it as `apps/website/content.json`. The GitHub Action (`.github/workflows/website.yml`) rebuilds and publishes the site.

To change the look or the animations, edit `template/index.tpl.html`.

## Build and preview locally
    node apps/website/build.mjs
    open apps/website/public/index.html

## Publish on GitHub Pages (still works)
Settings > Pages > Source: **GitHub Actions**. Pushes to `main` that touch `apps/website` deploy automatically to
`https://bibekbista0405.github.io/Dash-Browser/`.

## Notes
- Download buttons read the newest release of the repository from the GitHub API and link straight to the `.exe` and `.apk`.
  If the API is unreachable they open the releases page.
- The hero window and phone are illustrations, and the "trackers cut" game is a toy. Neither shows real data.
- The site sets no cookies and has no analytics. Outside requests: Google Fonts and the GitHub API.
- The site is one file with six hash-routed pages (#home, #connections, #features, #playground, #get, #questions). Nav labels and targets live in `nav` in content.json; page headings in `pages`.
- Motion respects "reduce motion": no intro, instant page swaps, no pinned scroll sections.
