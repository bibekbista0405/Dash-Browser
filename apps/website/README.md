# DASH website

```
apps/website/
  content.json            all the site's text, lists and links  <- edit this
  template/index.tpl.html the page design (HTML, CSS, motion)
  template/admin.html     the visual editor for content.json
  assets/                 the real DASH logo, split into animatable pieces
  build.mjs               content.json + template -> dist/ (no dependencies)
  dist/                   the built site (index.html, admin.html, content.json)
```

## Change the text (the "CMS")
1. Open `dist/admin.html` (on the live site: `/admin.html`). It loads `content.json` into a form. Edit text, add, remove or reorder
   FAQ items, features, ledger rows, steps and more. Nothing is uploaded.
2. Press **Download content.json**, or **Copy JSON** then **Edit on GitHub** and paste.
3. Commit it as `apps/website/content.json`. The GitHub Action (`.github/workflows/website.yml`) rebuilds and publishes the site.

To change the look or the animations, edit `template/index.tpl.html`.

## Build and preview locally
    node apps/website/build.mjs
    open apps/website/dist/index.html

## Publish on GitHub Pages
Settings > Pages > Source: **GitHub Actions**. Pushes to `main` that touch `apps/website` deploy automatically to
`https://bibekbista0405.github.io/Dash-Browser/`.

## Notes
- Download buttons read the newest release of the repository from the GitHub API and link straight to the `.exe` and `.apk`.
  If the API is unreachable they open the releases page.
- The hero window and phone are illustrations, and the "trackers cut" game is a toy. Neither shows real data.
- The site sets no cookies and has no analytics. Outside requests: Google Fonts and the GitHub API.
- The site is one file with six hash-routed pages (#home, #connections, #features, #playground, #get, #questions). Nav labels and targets live in `nav` in content.json; page headings in `pages`.
- Motion respects "reduce motion": no intro, instant page swaps, no pinned scroll sections.
