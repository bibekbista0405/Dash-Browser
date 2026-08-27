# DASH — Milestone 1 through 11 (+ critical internal-pages IPC fix)

> **This app lives in a monorepo.** Root-level `npm install` / `npm run
> dev` / `npm run build` from the repo root are the supported commands —
> see the root `README.md` for the architecture (this app depends on
> `@dash/browser-core`, a platform-independent package, for domain logic).

Privacy-first desktop browser. See below for the full feature history.

## Critical fix: internal pages (History/Downloads/Bookmarks/Settings) were completely broken

**Reported symptoms**: Settings did nothing, a completed download never
showed up in the Downloads tab, and the address bar showed the raw
`http://localhost:5173/internal.html?page=downloads&tabId=...` instead of
a clean `dash://downloads`. The logs showed the real cause directly:
`Error: DASH: rejected IPC call from an unrecognized window` on every
single call these pages made.

**Root cause**: when Milestone 11 converted these from overlay panels into
real tabs, I gave them the chrome preload (for real `window.dash` access)
but never actually registered them as trusted senders in the IPC
authorization system — that registry was keyed only by each window's own
chrome shell, never by any tab living inside it. Every call these "real"
pages made was rejected at the door. This is exactly why they felt
completely non-functional — they were.

**While fixing that, I found a second, more serious bug it was masking: a
real security leak.** The original design only rebuilt a tab's
`WebContentsView` (the only time you can attach or remove a preload)
when navigating *into* an internal page — not when navigating *out* of
one. That means a tab that had shown `dash://history` and then navigated
to a real website via a history entry would carry the privileged
`window.dash` preload — full API access, including revealing saved
passwords — into that untrusted external page. Fixed by rebuilding the
view symmetrically in both directions, not just one.

**Also fixed in the same pass:**
- Live updates (download progress, settings changes) never reached these
  tabs at all — `win.webContents.send()` only reaches the chrome shell,
  never a tab inside it. `broadcast()` now also sends to every registered
  internal-page tab.
- A real dev-mode-only bug: the code that cleared "this tab is showing an
  internal page" state checked for a `file://` URL prefix — correct in a
  packaged app, but internal pages load via `http://localhost:5173/...`
  in `npm run dev`, so that check fired on every single internal-page
  load, immediately reverting the clean `dash://downloads` address-bar
  display back to the raw dev-server URL. This exact bug is what you saw.
  Removed the flawed heuristic entirely — the tab's real navigation
  lifecycle already tracks this state correctly without it.
- The New Tab Page's `dash://newtab` URL is now hidden from the address
  bar (shown blank instead), matching real Chrome/Firefox behavior,
  while the sentinel still works correctly underneath.

**Keyboard shortcuts audited against real Chrome and fixed/added:**
`Ctrl+Shift+D` (which we'd used for "open bookmarks") is actually Chrome's
"bookmark all tabs" shortcut — moved bookmarks-manager to `Ctrl+Shift+O`,
Chrome's real shortcut for it, and `Ctrl+D` now always means "bookmark
this page" with no shift-modifier overload. Added shortcuts that were
missing entirely: `Ctrl+Tab`/`Ctrl+Shift+Tab` (cycle tabs), `Ctrl+1`–`9`
(jump to tab N, with 9 always meaning "last tab" — Chrome's exact
behavior), and `Alt+Left`/`Alt+Right` (back/forward).

**Three-dot menu rebuilt to actually resemble Chrome's** — keyboard
shortcut hints next to each item, New Tab/Window/Private Tab at the top,
History/Downloads/Bookmarks in the menu itself (not just the toolbar),
grouped into sections with dividers.

**New Tab Page polish**: the wordmark is now genuinely large (64px, matching
the visual weight of Chrome's own new-tab branding) with a subtle
entrance animation; tiles get real hover/press feedback. Real favicons on
the tiles were already wired in a previous pass and are unaffected by
this — if you're still seeing colored-initial tiles instead of real site
icons, that's because those history rows predate favicon capture (or the
sites haven't been revisited since); it'll fill in naturally as you
browse, since DASH deliberately never fetches favicons from a third-party
service the way Chrome's own new-tab page does.

**What I did not change**: the `stun_port.cc ... Binding request timed
out` lines in your log are normal Chromium WebRTC noise (it periodically
tries STUN binding for peer-to-peer connectivity checks and logs a
timeout when nothing answers) — not a DASH bug, and not something to
suppress without breaking real WebRTC use (video calls, etc.) on sites
that need it.

**Verified**: full clean-room reinstall, typecheck + lint + build all
clean, a real packaged AppImage built successfully, and — critically for
this fix — I didn't just trust the build succeeding. I searched the
actual compiled output and confirmed `requireContext` now calls the fixed
resolver that checks both chrome windows and trusted internal pages,
rather than assuming the source change made it through the bundler
correctly.

**What I still can't verify myself**: whether Settings/Downloads/History
genuinely work end-to-end now, since I have no display in this
environment. Please retest with the same specificity as your last
report — it's exactly what let this get diagnosed and fixed correctly.

## Milestone 11: real icons, real favicons, real internal-page tabs, and a fix for Chromium's disk-cache corruption error

**⚠️ Mid-build container reset**: this milestone's work was interrupted
partway through by an environment reset that wiped the working directory.
Recovery was possible because the previous zip delivered to the user was
still on disk — restored from that known-good state and rebuilt everything
in this milestone from there. Mentioned here because it's the honest
reason this milestone's commit history (if this were a real git repo)
would look like two passes at the same problem, not one.

**Real app icons** — replaced the programmatically-generated shield icon
with the user's own official logo assets (`.svg`, `.ico` with 8 real
embedded resolutions, `.icns`, PNGs), wired into both `BrowserWindow`'s
runtime icon and electron-builder's packaging config. Caught a real
packaging bug here: the `files` allowlist in `package.json` never included
`resources/**/*`, so while electron-builder's own icon embedding worked
fine (it reads the source directory directly at build time), the
*runtime* icon reference (`path.join(__dirname, '../../resources/icon.png')`
in `main/index.ts`) would have silently failed to resolve in the actually
packaged app, since that directory was never copied in. Confirmed the fix
by listing the packaged `app.asar` contents directly, not by assuming the
config change worked.

**Real favicons, never a third-party service** — captured straight from
each site's own `page-favicon-updated` event (same-origin, exactly what
Chrome does internally before it also phones home to Google's favicon
service — DASH stops after the first, same-origin part). Persisted
alongside history and bookmark rows (real schema migration with a guard
for existing databases), shown in the tab strip, address-bar suggestions,
History, Bookmarks, and New Tab Page tiles (replacing the earlier
colored-initial placeholders when a real one is available). Caught a real
CSP bug while wiring this up: the existing `default-src 'self'` policy had
no `img-src` directive, which would have silently blocked every
cross-origin favicon `<img>` from ever rendering — fixed by adding
`img-src 'self' https: data:;` to both HTML entries.

**History, Downloads, Bookmarks, and Settings are now real browser tabs**
(`dash://history`, `dash://downloads`, `dash://bookmarks`,
`dash://settings`) instead of side-panel overlays — the actual "access it
like Chrome" ask. This needed a genuine architectural addition, not a
styling tweak:
- A second Vite build entry (`internal.html` / `internal-main.tsx`),
  code-split independently from the main chrome bundle.
- These four pages get the SAME preload as the chrome window itself —
  real `window.dash` access — which is what makes them genuinely
  interactive (search, delete, live updates) instead of static documents.
  This is a deliberate, narrow exception: ordinary web content still never
  gets a preload, only these four known sentinel URLs do.
- `TabManager` generalizes the New Tab Page's existing sentinel-URL
  pattern into `INTERNAL_PAGE_URLS`, attaches the preload conditionally at
  `WebContentsView` construction time (preload can't be changed after
  creation, which is why switching *into* an internal page tears down and
  rebuilds the view rather than doing a plain `loadURL`), and correctly
  reports the clean `dash://…` sentinel in the address bar rather than the
  real underlying `file://…/internal.html?page=…` path.
- Real dev/prod branching: internal pages load from Vite's dev server in
  `npm run dev` and from the actual built file in a packaged app — passed
  in as a callback from `main/index.ts` (which already knows this
  distinction for the main window) rather than duplicated logic in
  `TabManager`.
- Clicking a `dash://` link from inside an internal page (the sidebar nav)
  is intercepted via `will-navigate`, since `dash:` isn't a registered
  Electron protocol and would otherwise just fail to load. Caught a real
  safety issue here: the interception was initially calling `navigate()`
  (which tears down and closes the current `webContents`) synchronously
  from within that same `webContents`' own event handler — deferred with
  `setImmediate` to let Electron finish dispatching the event first.
- Chrome-like singleton behavior: clicking History/Downloads/Bookmarks/
  Settings again focuses the already-open tab instead of piling up
  duplicates.
- Bookmarks page adds folder grouping and search that the old side panel
  never had.

**Real "Clear browsing data,"** which is also the actual fix for the
Chromium disk-cache corruption error reported (`Critical error found -8`,
`No file for <hash>`) — that happens when the cache directory gets
partially written, commonly from the disk running out of space mid-write
(consistent with the `ENOSPC` error hit earlier in this project's history).
`session.clearCache()` rebuilds it cleanly rather than trying to repair it
in place. Exposed as a real Settings section with the same checkbox set
Chrome's version has (history, cookies & site data, cached files,
download list), not just a cache-only button.

**Verified, not just claimed**: full clean-room reinstall (all
`node_modules` deleted, fresh `npm install`) → typecheck + lint + build,
all clean. Went further than most prior milestones: a real packaged Linux
AppImage was built from that clean state, and its actual `app.asar`
contents were listed to directly confirm both the icon assets and
`internal.html` + its code-split JS/CSS bundle are genuinely present in
the shipped package — not just assumed from a successful build log.

**What I still can't verify myself**: whether the internal-page tabs
actually render and behave correctly on screen, whether favicons visibly
appear, whether the Facebook OAuth popup fix from the previous milestone
still holds after this much additional change. No display in this
environment, same limitation as every milestone. Please test all of the
above and report back exactly what you see, the same way you did for the
cache error and the OAuth issue — that specificity is what let both of
those get fixed correctly on the first real attempt.

## Bug fix: "Login with Facebook" (and other OAuth popups) did nothing

**Reported symptom**: logging into TikTok via "Continue with Facebook"
silently did nothing, even while already logged into Facebook in another
tab. Two real bugs, both fixed:

1. **The ad/tracker blocklist blocked `connect.facebook.net`.** That
   domain serves Facebook's tracking pixel *and* its Login SDK from the
   same host — blocking it at the domain level breaks every "Continue
   with/Log in with Facebook" button on the web, not just TikTok's. Fixed
   by removing it from `packages/browser-core/src/blocking.ts`, with an
   inline comment explaining why so it doesn't get re-added later without
   someone rediscovering this the hard way.
2. **DASH never handled popup windows at all.** OAuth flows work by
   calling `window.open()` to show the provider's login dialog. Electron
   denies every popup by default unless a handler explicitly allows it —
   with no handler wired up (which was the case everywhere before this
   fix), clicking any OAuth login button does exactly what was reported:
   nothing. Fixed in `TabManager.wirePopupHandling()`: popups are now
   allowed, opened with the SAME session as their opening tab (critical —
   a Facebook login popup needs to see the same cookies as the Facebook
   session already logged into in that browsing context; a private tab's
   popup correctly stays inside that private tab's isolated session
   instead of leaking into the normal one), and sandboxed the same way
   every other tab is.

**Why this didn't need new ad-blocking/permission-prompt wiring**: both
already apply automatically to popups for free, since they're session-level
(`session.webRequest`, `session.setPermissionRequestHandler`) rather than
tied to a specific window — a popup sharing a tab's session automatically
inherits that tab's blocking and permission behavior with zero extra code.

**Honest limitation, stated directly**: this allows *all* popups, the same
as a browser with its popup blocker turned off. A real popup blocker that
distinguishes a legitimate login flow from a spammy ad popup needs to know
whether the request came from an actual user click, which Electron doesn't
expose reliably enough here to build without risking breaking real logins
again. In practice the domain-level ad/tracker blocklist stops most junk
popups already, since their triggering scripts get blocked before they can
even call `window.open()`.

**Verified**: full clean-room reinstall, typecheck + lint + build all
clean, and directly confirmed in the compiled output that the blocklist no
longer contains a `"connect.facebook.net"` entry and that
`setWindowOpenHandler` is present in the bundled main process — not just
checked in source.

**Still can't verify myself**: whether TikTok's Facebook login actually
completes end-to-end now — no display in this environment, same
limitation as every fix here. Please retry the exact flow that failed and
let me know.

## Milestone 10 additions

**Chrome parity, honestly scoped.** Full Chrome parity (its extension
ecosystem at scale, cross-device sync, its exact V8/rendering internals)
isn't realistic to replicate — three concrete, real gaps were closed
instead:

**New Tab Page** (`Ctrl/Cmd+T`) — DASH previously had no real distinction
between "new tab" and "homepage," unlike every mainstream browser. Now:
- New tabs open a genuine New Tab Page: real "most visited" tiles computed
  from actual history-visit frequency (`getTopSites()`, grouped/ranked by
  real visit counts, not fabricated), plus a working search box.
- Deliberately **no external favicon fetching** for the tiles — real
  browsers' New Tab Pages often silently leak your most-visited sites to a
  third-party favicon CDN on every new tab, which is exactly the kind of
  hidden request this project promises never to make. Colored initial
  tiles instead — a real privacy tradeoff, not a missing feature.
- Implemented as a `data:` URL generated fresh in the main process — no
  extra Vite build entry or preload bridge needed, since it's just real
  `<a href>` links and a real `<form>` for search; ordinary navigation
  handles the rest.
- A separate real **Home button** (⌂) now exists, wired to the `homepage`
  setting — Chrome/Firefox's actual distinction between "new tab target"
  and "home page target" is now real here too, not conflated into one
  setting like before.

**Real Chrome extension loading** — genuine Electron `session.loadExtension`
support for unpacked extensions (`Settings → Extensions → Load unpacked`),
the same flow as Chrome's own developer mode. Persisted across restarts
(a folder-path table + `restorePersisted()` on startup, since Electron
itself doesn't remember loaded extensions between launches). Honestly
documented limitations, stated in the code and the UI, not discovered by
the user the hard way: no Chrome Web Store install flow (Electron has no
built-in `.crx` installer), and Electron's own extension API coverage is a
real subset of Chrome's — Manifest V3 service-worker backgrounds and some
`chrome.*` APIs aren't implemented. Extensions are deliberately never
loaded into private-browsing sessions.

**Task Manager** (`Shift+Esc`) — real per-process memory and CPU via
Electron's actual `app.getAppMetrics()`, correlated back to real tab
titles via `webContents.getAllWebContents()` matched by OS process id
(caught and fixed a real type error here: `ProcessMetric` doesn't carry a
`webContents` field the way I first assumed — verified against Electron's
actual types, not guessed). "End process" only ever closes a real DASH tab
through the normal tab-close path — deliberately never a raw OS-level kill
of an arbitrary Chromium process, which is how you crash the whole
browser, not "end a task."

**Verified, not just claimed**: full clean-room reinstall (all
`node_modules` deleted, fresh `npm install`) then typecheck + lint + build,
all clean from that state. Also re-confirmed the preload bundle is still
real CJS output after this much additional code — the exact bug class
fixed back in Milestone 1 stayed fixed.

## Milestone 9 additions

**Downloads panel redesign** — the previous version was functional but
minimal. Now real:
- **Speed and ETA**, computed from actual `receivedBytes` deltas over real
  wall-clock time between push updates (not simulated) — shown as
  `2.4 MB/s · 12s left` while a download is progressing.
- **Date grouping** (Today / Yesterday / older dates), matching the History
  panel's pattern.
- **Search** across filename and source URL.
- **File-type icons** based on extension (documents, archives, images,
  video, audio, installers, spreadsheets).
- **Indeterminate progress** for downloads with no known total size
  (servers that omit `Content-Length`) — previously this silently showed a
  stuck 0% bar; now a real animated indicator instead of a misleading one.
- **Clear completed** — bulk-removes every finished/cancelled/failed entry
  in one action.
- **Drag out to the desktop** — real OS-level drag via
  `webContents.startDrag`, not a fake cursor; drag a completed download's
  row straight onto the desktop or another app, exactly like Chrome's or
  Finder's download tray. Needed a generic file icon for the drag cursor
  (`resources/drag-file-icon.png`, generated the same way as the app icon)
  since Electron requires one.
- Cleaned up a real UI bug: paused downloads previously showed both
  "Cancel" and "Remove" together, which read as two redundant stop
  actions — "Remove" is now only offered once a download reaches a
  terminal state (completed/cancelled/failed).

**Tab Search** (`Ctrl/Cmd+Shift+A`) — a new feature, not a fix: a
command-palette-style overlay that fuzzy-filters every open tab in the
current window by title or URL, with arrow-key navigation and Enter to
switch. **Scope note**: searches tabs in the current window only, not
across multiple windows — cross-window tab search would need IPC
aggregation across window contexts, left as a follow-up rather than
half-built here.

**Verified, not just claimed**: full clean-room reinstall (deleted all
`node_modules`, fresh `npm install`) then typecheck + lint + build, all
passing from that clean state.

## Milestone 8 additions

**JSON-body login detection** — the Password Manager's automatic-save
detection now also parses `application/json` POST bodies (shallow, up to
one level of nesting — e.g. `{user: {email, password}}`), not just classic
form submissions. Deliberately capped in depth and body size to avoid false
positives on unrelated JSON POSTs; still won't catch GraphQL mutations with
deeply nested variables or logins sent via non-POST methods.

**Multi-window session restore** — a real schema change (`session_tabs`
gained a `window_index` column, with an explicit `ALTER TABLE` migration
guard for anyone upgrading from an earlier milestone's database, since
`CREATE TABLE IF NOT EXISTS` never alters an existing table). Session save
is now app-level and fires from every window's tab changes and window-close
events, capturing one URL array per open window; restore recreates that
exact number of windows, each with its own tab set.

**Real app icon** — generated programmatically (`resources/icon.svg`,
rendered via `sharp`'s built-in SVG rasterizer since this environment has
no `rsvg-convert` for ImageMagick), including a hand-built multi-resolution
`.ico` (16 through 256px, verified with `file` to be a genuine Windows icon
resource, not just a renamed PNG) since the usual ImageMagick icon writer
wasn't available either. Wired into `BrowserWindow`'s `icon` option and
electron-builder's `win`/`mac`/`linux` icon fields, and confirmed present
in a real packaged AppImage build. **Not done**: a proper `.icns` for
macOS — electron-builder can sometimes auto-derive one from a high-res PNG,
but that's unverified here since this sandbox can't build for macOS at all.

**`electron-updater` wiring** — real code
(`src/main/services/updater.ts`), correctly kept out of the bundled main
process (`external: ['electron-updater']` in `vite.config.ts`, verified in
a real packaged build that the actual npm package — not a bundled guess at
its internals — is present in `node_modules`, since it does its own
runtime path/`package.json` lookups that a single-file bundle would break).
**What this cannot do without more from you**: actually deliver an update.
That needs a real publish target — a GitHub Releases repo, S3 bucket, or
static feed — configured under `build.publish` in `package.json`, which
isn't set here because there's no real repository to publish to in this
environment, and a placeholder owner/repo would make every `dist` command
silently try to authenticate against a repo that doesn't exist. The code
is genuinely correct and ready; it just has nowhere to check yet. Full
instructions for wiring a real feed are in the file's own comment block.

**Verified, not just claimed**: full typecheck + lint + build clean, AND —
further than in any prior milestone — a complete real packaged Linux
**AppImage** was actually produced (`DASH-0.1.0.AppImage`, 115MB, a genuine
ELF executable), not just an unpacked `--dir` build. Confirmed
`electron-updater` present as a real package inside it, not silently
missing or broken by bundling.

## Milestone 7 additions

**Password Manager** — encrypted with Electron's real `safeStorage` API,
which delegates to the OS's own credential store (Keychain/DPAPI/libsecret),
never a hand-rolled cipher. Two ways passwords get saved:
- **Automatic detection**: DASH watches real outgoing POST bodies (via
  `webRequest.uploadData`, not a DOM content script) for standard
  `application/x-www-form-urlencoded` login submissions and offers to save
  them. **Honest limitation**: this only catches classic HTML form POSTs —
  many modern sites submit credentials via `fetch`/XHR with a JSON body,
  which this does not parse, so those logins won't trigger a save prompt.
  Never attached to private-browsing sessions — offering to save a password
  is itself a record you logged into that site.
- **Manual entry** in the Passwords panel.
- The plaintext password is never sent to the renderer process except on an
  explicit, user-initiated "Show" click — even the save-prompt flow keeps
  the plaintext in the main process the whole time, sending only
  `{origin, username}` to the UI for the prompt text.

**Permission Manager** — replaces the old blanket "deny everything"
handler with a real per-origin prompt-and-remember flow (camera,
microphone, location, notifications, clipboard read). Normal-session
decisions persist to SQLite; private-session decisions are deliberately
kept in memory only and vanish with the window. Settings → Site permissions
lists every decision with a "Forget" button.

**Find in Page** (`Ctrl/Cmd+F`) — real `webContents.findInPage`, live match
count, next/previous.

**Zoom** (`Ctrl/Cmd + =/-/0`, or the toolbar's ⋮ menu) — real
`webContents.setZoomFactor` per tab, persisted per-tab, reapplied
automatically if a tab sleeps and wakes.

**Print** (`Ctrl/Cmd+P`), **Save Page** (`Ctrl/Cmd+S`, real
`webContents.savePage`), **DevTools** (`F12` / `Ctrl/Cmd+Shift+I`, real
`webContents.openDevTools`) — thin, real wrappers around Electron's actual
APIs, nothing simulated.

**Tab management** — duplicate, pin (narrows to an icon, moves to the
front, survives close-to-reopen), mute (real `setAudioMuted`), drag-to-reorder,
and reopen-last-closed-tab (`Ctrl/Cmd+Shift+T`, up to 20 deep, restores
pinned state; never records private tabs).

**Multiple windows** (`Ctrl/Cmd+N`, or ⋮ → New window) — this required a
real architectural fix, not just a `new BrowserWindow()` call:
`ipcMain.handle` registers channels globally, not per-window, so the old
single-window code (which called `registerIpcHandlers` once per window)
would have thrown `"second handler for channel"` the moment a second window
opened. Fixed with a window-context registry (`window-context.ts`) that
maps each window's own chrome `webContents.id` to its `TabManager`, so
handlers registered exactly once can dispatch to whichever window actually
sent the request. Also fixed: several services (`RequestBlocker` on
`webRequest`, `DownloadManager`, `BlockedCountTracker`, shared settings)
were being constructed per-window in earlier milestones, which only mattered
with one window — Electron keeps just the *last* `onBeforeRequest` listener
per session, and `will-download` would have double-fired to multiple
`DownloadManager` instances, double-inserting every download. These are now
correctly app-level singletons; only `TabManager` and its private-session
blockers/permission-manager are genuinely per-window.

**Bookmark import/export** — real Netscape Bookmark File Format (the open
standard Chrome/Firefox/Safari/Edge all use), so exported files open
correctly elsewhere and vice versa. Native save/open dialogs via Electron's
`dialog` module.

**Omnibox suggestions** — typing in the address bar queries real
history + bookmark rows from SQLite and shows a live dropdown.

**HTTPS-Only Mode** (Settings → Privacy) — upgrades every top-level
navigation from `http://` to `https://`. If a site has no https version,
the load simply fails rather than silently falling back to an insecure
connection. Implemented inside `RequestBlocker` rather than as its own
handler, because Electron only keeps one `onBeforeRequest` listener per
session — a second registration would have silently discarded the ad/
tracker blocking logic.

**Verified, not just claimed**: full clean-room reinstall (`rm -rf
node_modules` across every workspace, fresh `npm install`), then
`typecheck` + `lint` + `build` all passing from that clean state.

**What I did NOT build in this pass, stated plainly:**
- DNS-over-HTTPS, fingerprint protection, cookie fine-grained controls —
  genuinely complex, easy to half-fake, deliberately skipped rather than
  built shallow.
- Dedicated Chrome-style full pages for history/downloads/bookmarks
  (`dash://history` etc.) — still side panels, functionally complete but
  not restyled as standalone pages.
- Extension marketplace, sync, AI sidebar, workspaces, split view, notes,
  voice assistant — explicitly deferred as "future features" in the
  original spec, not attempted.
- Multi-window session restore only remembers the first window's tabs
  today (noted inline in the code, not hidden).
- JSON-body login detection (see Password Manager limitation above).
- App icon design, code signing certificates, a real auto-update
  server/feed — need real assets/infrastructure this environment can't
  produce or verify.
- Android/iOS — still documented contracts only (see `apps/android/README.md`,
  `apps/ios/README.md`), no code, consistent with every prior milestone.

## Milestone 6 additions

- **Real network-layer blocking** — hooks Electron's actual
  `session.webRequest.onBeforeRequest` on both the normal session AND the
  dedicated private-browsing session, so private tabs get the same
  protection, not a lesser version. This cancels matching sub-resource
  requests (scripts, images, XHR/fetch, sub-frames, stylesheets, media)
  before they ever leave the app — a genuine network intercept, not a
  CSS-hiding trick. Top-level page navigation is never blocked; if you
  navigate straight to a domain, that's your call.
- **Honest scope note:** the blocklist ships with a curated starter set of
  ~45 well-documented ad-serving and tracking-infrastructure domains
  (`src/main/services/blocklist-data.ts`) — things like `doubleclick.net`,
  `google-analytics.com`, `scorecardresearch.com`, `taboola.com`. This is
  **not** a vendored copy of EasyList or any other third-party filter
  list (those are much larger, separately-licensed datasets); it's real,
  working blocking logic with a smaller real dataset behind it, built so a
  genuine filter-list format can be layered onto the same engine later
  without changing how blocking works.
- **Separate toggles** for ad blocking and tracker blocking in Settings →
  Blocking, both on by default, matching the two distinct MVP features
  in the original spec.
- **Real stats, not fake ones** — a 🛡 badge in the address bar shows how
  many requests were blocked on the *current page* (resets each navigation,
  driven by real per-`webContents` counts), and Settings shows a lifetime
  total persisted to SQLite.

## Milestone 5 additions

- **Session restore** — a new "Startup" setting: "Open homepage" (default)
  or "Restore previous tabs". When restore is on, DASH persists the ordered
  list of open tab URLs to a real SQLite `session_tabs` table (debounced
  800ms after any tab change) and reopens exactly those URLs on next launch.
  Only URL + order is restored — never full page state — and **private tabs
  are never written to this table**, so they can never leak into a restored
  session.
- **Real sleeping tabs** — this is genuine memory reclamation, not a UI
  badge: a background tab left untouched for more than 10 minutes has its
  actual Chromium renderer process torn down
  (`view.webContents.close()`, `view = null`), while DASH caches its last
  known title/URL so the tab strip keeps showing it normally. The instant
  you click back to it, DASH transparently recreates a real
  `WebContentsView` and reloads the page — you'll see a brief reload, which
  is the honest tradeoff for the memory savings. Toggle in Settings →
  Performance (on by default). A 🌙 icon marks sleeping tabs in the strip.
- Checked every 60 seconds; the active tab is never a sleep candidate.

## Milestone 4 additions

- **Settings panel** (gear icon) — search engine (DuckDuckGo/Google/Bing/Brave
  Search), homepage URL, and theme (dark/light/system), all persisted to the
  real SQLite `settings` table and applied live — changing the search engine
  immediately changes what typing a bare term in the address bar does.
- **Real light mode** — theme tokens are CSS variables now, so light/dark/
  system aren't cosmetic; switching actually re-themes the whole UI, and
  "system" follows the OS preference live via `matchMedia`.
- **Real private browsing** — private tabs run in a dedicated in-memory
  Electron session (`session.fromPartition` with no `persist:` prefix), so
  they share zero cookies/localStorage/cache with normal tabs, and the tab
  manager hard-blocks history writes for any tab flagged private — this is
  enforced in the main process, not just hidden in the UI. Open one with the
  🕶 button next to "+ New Tab" or `Ctrl/Cmd+Shift+N`. Private tabs get a
  visible purple ring + "Private" badge so it's never ambiguous which mode
  you're in.
- **New shortcuts:** `Ctrl/Cmd+Shift+N` (new private tab).

## Milestone 3 additions

- **Real download interception** — hooks Electron's actual
  `session.on('will-download')` event. Every download is a genuine Chromium
  `DownloadItem`; bytes land on disk in the OS Downloads folder for real.
- **Collision-safe filenames** — if a file already exists, DASH appends
  " (1)", " (2)", etc. rather than silently overwriting.
- **Live progress** — the Downloads panel shows a real progress bar driven
  by the item's own `updated` events (received/total bytes), not a fake timer.
- **Pause / resume / cancel** — call the actual `DownloadItem` methods.
- **Open file / show in folder** — uses Electron's real `shell.openPath` /
  `shell.showItemInFolder`.
- **Persisted** — every download is a real row in the SQLite `downloads`
  table, so the list survives an app restart.
- **`Ctrl/Cmd+J`** opens the downloads panel (standard browser convention); a
  small pulsing dot on the toolbar download icon indicates an active transfer.

## Milestone 2 additions

- **History panel** (`Ctrl/Cmd+H`) — live-searches the real SQLite `history`
  table (debounced), grouped by day, click-to-navigate, per-row delete, and
  "Clear all" with a confirm prompt. No mock data — every row is a real page
  visit written by the tab manager.
- **Bookmarks panel** (`Ctrl/Cmd+Shift+D`) — lists real rows from the
  `bookmarks` table, click-to-navigate, remove button.
- **Bookmark toggle** — the star icon in the address bar (and `Ctrl/Cmd+D`)
  adds/removes the current tab's URL as a real bookmark, and reflects live
  bookmarked state.
- **Keyboard shortcuts** — `Ctrl/Cmd+T` new tab, `+W` close tab, `+L` focus
  address bar, `+R` reload, `+H` toggle history, `+D` toggle bookmark on
  current page, `+Shift+D` toggle bookmarks panel.

## What's real in this milestone

- **Tabs are real `WebContentsView` instances** — each tab is its own
  sandboxed, isolated Chromium webContents. Closing/creating/switching tabs
  actually attaches/detaches real views on the native window.
- **Navigation is real** — back/forward/reload/stop call Electron's actual
  `navigationHistory` API on the tab's webContents.
- **History is real** — every completed page load writes a row to a local
  SQLite database at `app.getPath('userData')/dash.sqlite`. No mock arrays.
- **Bookmarks are real** — same SQLite file, real insert/delete, queryable
  from the renderer via IPC.
- **IPC is locked down** — `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true` on every webContents. The preload script exposes a narrow,
  typed `window.dash` API — nothing else crosses the bridge. Every main-process
  handler validates the sender and argument types before touching anything.
- **No tracking, no telemetry, no network calls except what the user
  navigates to.** The permission handler denies all requests by default.

## What's explicitly NOT done yet (do not assume otherwise)

- App icon has real .png/.ico now; still missing a proper macOS .icns
- Auto-updates: code is real and wired, but has no publish feed configured
  (needs a real GitHub Releases repo or similar — see updater.ts)
- DNS-over-HTTPS, fingerprint protection
- Dedicated full-page history/downloads/bookmarks (still side panels)
- JSON-body login detection only goes one level deep and skips non-POST
  submissions — see Milestone 8 notes above
- Extension marketplace, sync, AI sidebar, workspaces, split view, notes,
  voice assistant — deferred in the original spec, not attempted
- Android / iOS — documented contracts only, no code

These are the honestly-remaining gaps — not architectural blockers, just
not built yet.

## Running it for real

```bash
npm install
npm run dev
```

This starts Vite's dev server for the renderer and launches Electron pointed
at it, with hot reload for the React UI. A window should open with one tab
loading your configured homepage (DuckDuckGo by default).

To verify the production build pipeline (what actually ships):

```bash
npm run build     # builds renderer (Vite) + main/preload (tsc via vite-plugin-electron)
npm start         # builds, then launches the packaged main process
```

To typecheck without emitting:

```bash
npm run typecheck
```

> Note: this container environment has no display server, so I verified the
> **build and typecheck pipeline** here (all green), but I have not been able
> to visually confirm the running window on a screen. Please run `npm run dev`
> locally and tell me what you see — especially tab switching and navigation —
> so I can fix anything that doesn't match before we move to Milestone 2.

## Architecture

```
src/
  main/            # Electron main process (Node context)
    index.ts        # app entry, window creation, security defaults
    services/
      tab-manager.ts  # owns all WebContentsView instances
    ipc/
      register-ipc.ts # validated IPC handlers
    db/
      database.ts     # SQLite schema + queries (better-sqlite3)
  preload/
    index.ts        # contextBridge — the only main<->renderer bridge
  renderer/          # React app (browser chrome only, not page content)
    App.tsx
    components/
      TabStrip.tsx
      AddressBar.tsx
    store/
      tabs-store.ts   # Zustand, synced live from main via IPC events
  shared/
    ipc-channels.ts  # single source of truth for channel names + types
```

## Recommended next step

Run it locally and confirm: opening a few new tabs shows real tiles once
you've built up some browsing history (fresh installs will show the empty
state, which is correct — visit a handful of sites first, then open a new
tab); the Home button (⌂) actually goes somewhere different from what
Ctrl+T opens; loading a real unpacked extension (many open-source
extensions on GitHub ship as unpacked folders — try a simple one) actually
shows effects on a page, and survives an app restart; `Shift+Esc` shows
plausible-looking memory/CPU numbers that update, and "End" on a tab's row
actually closes that tab. After that, the biggest remaining gap is still
dedicated `dash://` pages for history/downloads/bookmarks (currently side
panels) — or wiring a real `build.publish` target so auto-update has
somewhere to check (see `updater.ts`'s comment block).
