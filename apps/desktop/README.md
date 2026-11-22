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

## Milestone 13

- **Dropdowns no longer hide behind the page.** Native page views paint above the chrome DOM, so the active view is detached while any menu, omnibox dropdown, tab context menu, tab search or Task Manager is open (`overlay:push/pop`, depth-counted). Side effect: the page area is blank while a menu is open.
- **New Tab shortcuts are manageable.** One tile per site, hover × removes it (stored locally in `hidden_sites`), "Restore removed shortcuts" brings them back. Adding custom shortcuts is not built yet.
- **Right-click menu on web pages:** open/copy link, open/copy/save image, spelling suggestions, cut/copy/paste, search selection, back/forward/reload, save page, print, inspect.
- **Links with target=_blank / Ctrl-click / middle-click open as tabs**; `window.open` popups (OAuth) still open as popup windows.
- Not visually verified: no display in the build sandbox.

## Milestone 14

- **Bookmarks bar** under the address bar: click opens in the current tab, middle-click in a new tab, hover × removes. Toggle with Ctrl+Shift+B or Settings → Toolbar (stored as `showBookmarksBar`, default on). Page area resizes accordingly.
- Not built yet: bookmark folders in the bar, drag-to-reorder, overflow ("»") menu for bookmarks that don't fit, custom New Tab shortcuts.
- Not visually verified.

## Milestone 15

- **Custom New Tab shortcuts:** "+" tile opens an inline name/address form; added sites are stored locally (`custom_shortcuts`), listed before most-visited sites, and removable with ×. Only http/https accepted. A site's logo appears once it has been visited (favicon from history), otherwise a colored initial.
- Not verified on screen; the add form relies on an inline script in the New Tab data: page.

## Milestone 16

- **Password autofill:** on pages in normal (non-private) tabs, if a password was saved for the exact origin, DASH fills the visible username and password fields of the top-level frame. Never in iframes, private tabs or internal pages. Uses the most recently saved login when several exist.
- Limits: no account picker for multiple logins, no fill-on-click, doesn't update a saved password when it changes, and the page's own scripts can read filled values (same as other browsers). Heuristic field detection; unusual login forms may not fill.
- Audit note: database layer (history, shortcuts, bookmarks, settings, suggestions) was tested headlessly with real SQLite. Window/tab code needs a real Electron run and has not been exercised.

## Milestone 17

- **Shortcuts fixed (root cause):** the shortcut hook captured the tab store once at startup, so anything needing the active tab (Ctrl+W/R/P/S, zoom, Ctrl+1–9, Alt+arrows…) silently did nothing. It now reads fresh state per key press. Also, keys pressed while a web page had focus never reached the toolbar; the main process now intercepts exactly the browser shortcuts (`shortcut-filter.ts`) and forwards them. Added F5.
- **Three-dot menu / dropdowns:** the page is no longer blank while a menu is open. A snapshot of the page is captured and painted behind the menu while the native view is detached.
- **PDF viewer:** `plugins: true` on tab views enables Chromium's built-in PDF viewer. Images, video, audio, text and SVG open natively.
- **Ad blocking:** added URL-path rules for ad endpoints on hosts that can't be blocked wholesale, plus a YouTube-specific script (strips ad data from player responses, hides ad containers, auto-skips ads that still play). As of M19 it is delivered as a session preload that runs before page scripts and asks the main process whether ad blocking is on (M17's DevTools-protocol injection never actually ran before page load). Limitation: YouTube changes its player often; this will need upkeep and may stop working after a YouTube update. Unit-tested against a stubbed page, not against live YouTube.
- **Light mode:** New Tab page now follows the theme; Chromium's color scheme (and websites' prefers-color-scheme) follows the DASH theme setting; window background matches; private-tab tint fixed for light. Not visually verified.

## Milestone 18

- **Import from other browsers** (Settings → Import from another browser): detects Chrome, Edge, Brave, Chromium and Firefox profiles on this computer and imports bookmarks (with folders) and up to 10,000 recent history entries. Source databases are copied to a temp file first (the other browser locks them). Duplicates are skipped, so importing twice adds nothing. Only http/https URLs are imported. **Passwords are not imported** (they're encrypted with the other browser's keys).
- **Bookmark folders:** Bookmarks page has a per-row "Move" control (existing folder or a new one). The bookmarks bar shows each folder as a dropdown button; nested folders appear as "Parent / Child".
- **Bookmarks bar overflow:** entries that don't fit collapse behind a "»" menu.
- **Bug fix:** bookmark changes made anywhere (Ctrl+D, the Bookmarks page, import) now update every window and internal page immediately; before, the bar only refreshed on restart.
- **Verification:** tested in the real Electron app (virtual display) with fake Chrome and Firefox profiles, covering import, dedupe, the bar, overflow menu and folder menu; plus real-keystroke shortcuts, three-dot menu, PDF viewer, light-mode New Tab, New Tab shortcut remove/add/restore, and target=_blank links. Not verifiable there: password autofill (no OS keyring in the test machine), YouTube ad blocking (needs live YouTube), context menus (native popups), and the Windows installer.

## Milestone 19

Found by running the real app (Electron under a virtual display) and fixed:
- **No window buttons:** the frameless window had no minimize/maximize/close. Now uses native title-bar overlay buttons (Windows/Linux) / traffic lights (macOS); tab strip leaves room for them and the overlay follows the theme.
- **Internal pages were saved into history** (`internal.html?page=…`). No longer recorded; existing such rows are deleted on startup.
- **Tabs were clipped** when many were open. Tabs now shrink like Chrome's.
- **YouTube ad script never ran** on directly-opened pages (registered too late) and aborted at document-start (no `<head>` yet). Rewritten as a session preload; verified against a local stand-in for YouTube: ad data stripped, ad boxes hidden, skip clicked, ad endpoints blocked, all inert when Block ads is off.

New privacy settings (Settings → Privacy):
- **Do Not Track + Global Privacy Control headers** (on by default). Header only; `navigator.globalPrivacyControl` is not set.
- **Block third-party cookies** (off by default; can break "Sign in with…" flows). Strips Cookie on outgoing and Set-Cookie on incoming cross-site sub-resource requests. "Third party" uses an approximate registrable-domain check, not the full Public Suffix List.
- **Secure DNS (DNS-over-HTTPS):** off / automatic / always, with Cloudflare, Quad9, Google or Mullvad. Off by default so DASH never contacts a DNS provider on its own. Applied through Chromium's host resolver; the setting is wired and verified to save, but actual encrypted resolution could not be tested in the sandbox (no external network).
- All request-header features share one `HeaderPolicy` handler per session (Electron allows one listener); the login detector now plugs into it.

## Milestone 19.1 (startup hardening)

- A startup failure used to leave DASH running with no window. It now shows an error dialog with the details, and writes `dash-startup.log` in the app's data folder (also records when Chromium helper processes such as the network service crash).
- DNS-over-HTTPS no longer touches Chromium's resolver unless it is turned on, and can never abort startup.
- Reported by a Windows user: "Network service crashed" plus a blank window. Cause not reproduced (Linux test machine); this build adds the diagnostics needed to pin it down.

## Milestone 20 — Full audit & fixes

Audited every feature against the real app (Electron under Xvfb, driven over CDP + xdotool).

**Fixed**
- Address bar: `localhost:3000`, `127.0.0.1:8080/x`, `[::1]:80` and `domain.com:8443/path` now load directly (http for local/IP, https for domains) instead of becoming web searches. Whitespace always means search; `javascript:`/`data:` never navigate. 14 unit cases in the audit.
- Bookmarks: adding an already-bookmarked URL returns the existing entry instead of creating a duplicate.

**Verified working (real app):** create/switch/close/reopen/duplicate/pin/mute/reorder tabs, back/forward, address resolution, suggestions, history (and private tabs leave none), bookmarks, settings persistence + invalid-value rejection, downloads incl. pause (byte count frozen) / resume / completion, zoom, find, task manager.

**Not verifiable in the sandbox:** password autofill (no OS keyring), live youtube.com, native right-click menus, real DoH, Windows `.exe` build and the Windows blank-window report (send PowerShell output + `dash-startup.log`).

## Milestone 21 — Privacy Report

Settings → **Privacy Report → Blocked ads & trackers** shows total blocked, ads vs trackers, and the most-blocked hosts with bars, plus a "Reset report" button.

- Counts are stored locally in a new `block_hosts` table (host, category, count). Nothing is sent anywhere.
- Private tabs count toward the lifetime total but their hosts are **never** recorded.
- Verified in the real app: normal tab records per host (2 ads + 1 tracker), private tab adds no hosts, ad blocking OFF stops ad counting, reset clears everything.
- Limitation: per-host stats begin from this version; older installs show the lifetime total but an empty host list until new blocks occur. There is no per-site (page) breakdown yet, only per blocked host.

## Milestone 22 — Reading mode

Menu (⋮) → **Reading mode**, or **Ctrl/Cmd+Shift+R**. Esc or Close exits; A−/A+ change text size; shows word count and read time.

- Runs entirely in the page: a text-density heuristic picks the article, then it is rebuilt from a whitelist of tags/attributes (scripts, nav, sidebars, forms, buttons, bad image URLs and event handlers are dropped) inside a closed shadow root. No network requests, nothing stored.
- Follows DASH's dark/light theme. Not offered on internal `dash://` pages.
- Verified in the real app: junk stripped, link and bold kept, title not duplicated, dark and light rendering, real Ctrl+Shift+R opens and Esc closes, short/non-article pages report "unreadable" instead of breaking, internal pages unsupported.
- Limitations: heuristic extraction (no Mozilla Readability), so unusual layouts can pick the wrong block; the toolbar gives no visible message when a page is unreadable yet; text size isn't remembered; ordinary Ctrl+R reload is unchanged.

## Milestone 23 — Tab groups

Right-click a tab → **Add to new group** / **Add to “<group>”** / **Remove from group**. Click a group's coloured chip to collapse/expand; right-click the chip to rename (type + Enter), pick one of 8 colours, **Ungroup**, or **Close group**.

- A group's tabs stay side by side; collapsed groups show one chip with a tab count (the active tab stays visible). Pinning a tab removes it from its group; pinned tabs can't be grouped. Empty groups vanish.
- Main process owns group state; IPC is validated (unknown group ids, invalid colours and non-boolean collapse are rejected).
- Fixed along the way: tabs closed by the main process (Close group) no longer linger in the tab strip.
- Verified in the real app: API ops (create/join/rename/colour/collapse/close, invalid input), UI tab count equals main's tab count after Close group, real right-click → Add to new group, real right-click on chip + typing a name.
- Limitations: groups are **session-only** (not restored after restart, tab URLs still are); dragging a tab can separate it from its group visually; no drag-into-group yet.

## Milestone 23.1 — Windows install fix

**Reported:** `npm install` aborted in the postinstall step (`npx prebuild-install` → "JavaScript heap out of memory"), after npm also logged `EPERM ... rmdir` cleanup warnings.

**Fixes**
- The native-binary step no longer uses `npx` + a shell. It runs prebuild-install's own entry with Node directly (4 GB heap allowed, 3 retries), so it can't trigger a stray package download.
- The postinstall step is **non-fatal**: if the binary can't be fetched, `npm install` still succeeds and prints how to retry: `npm run native:electron`.
- `dist`, `dist:win`, `dist:portable` now run through `scripts/dist.mjs`. The old one-liners used `VAR=1 cmd` and `;`, which don't work in Windows `cmd.exe`. The driver also restores the dev binary afterwards even if packaging fails.

**Verified here (Linux):** postinstall success path; forced failure still exits 0 with instructions; `native:electron` exits 1 on failure; `dist:win` builds the app, fetches the Windows binary, produces `win-unpacked/DASH.exe` with a Windows (PE) `better_sqlite3.node`, then restores the Linux dev binary; app rebuilt and re-audited (25 checks + 10 tab-group checks pass).
**Not verified:** the final `.exe`/installer step needs Windows (here it stops at "wine is required"), and your PC's memory/EPERM behaviour.

**If install still fails on Windows**
1. Move the project out of `Downloads` (e.g. `C:\dev\dash-monorepo`) — avoid OneDrive/synced folders and paths with spaces.
2. Delete the half-installed `node_modules` folder (and `package-lock.json` only if it is corrupt), then `npm install`.
3. Pause antivirus real-time scanning for that folder (it causes the `EPERM rmdir` errors).
4. If the native step still reports a problem: `npm run native:electron`, then `npm run dev`.

## Milestone 24 — Real logo everywhere, custom New Tab CSS, shortcuts redesign

**Logo.** The real DASH mark (from `resources/icon.png`) is now used in: the New Tab Page (logo + wordmark + tagline), the tab strip, the internal-page sidebar, the Settings header, and as the tab icon for DASH's own pages. It is drawn as a CSS mask, so it follows the theme colour. (Window/taskbar/installer icons already came from the same artwork; the window now loads the 512px copy instead of the 5016px original.)

**Custom New Tab CSS** (Settings → New Tab Page): enable toggle, editor (20,000-char cap), three starter templates (Aurora, Minimal, Paper), Apply/Reset, and a reference of the CSS variables/classes you can target. Open New Tab Pages refresh immediately. It's stored locally, injected only into the New Tab Page's own `<style>`, and can't run scripts (a `</style><script>` attempt is neutralised). Note: CSS that links to online files (`@import`, `url(http…)`) will fetch them.

**Shortcuts.** Redesigned (card tiles, hover lift, dashed "Add shortcut" tile, responsive grid). Bugs fixed:
- Favicons sat on `var(--fg)` — near-black in light mode — so transparent icons looked like dark boxes. They now sit on an opaque light plate in both themes.
- Favicons of **http** sites were blocked by the chrome page's CSP, so tab icons never showed. Allowed `http:` for images.
- Favicons usually arrive after page load, so history/shortcuts almost never got one on first visit. They are now attached to that visit's history row.
- Custom CSS refresh used a stale cached settings object (lagged one change behind); it now reads the database.

**Verified in the real app:** logo in all placements (dark + light); tiles with/without favicon in both themes; custom CSS disabled→enabled→edited→injection→disabled, size cap, persistence; real mouse clicks on template + Apply; all earlier audits (25 + 10 checks) still pass.
**Limitations:** the editor has no syntax highlighting or live preview (Apply refreshes open New Tab tabs); only one tile per host; the logo mask is a 256px raster, so extremely large sizes (>256px) will look soft.

## Milestone 25 — UI/UX stability tier + privacy quick wins

**UI/UX stability (Tier 0)**
- Opening Settings/History/Downloads/Bookmarks again focuses the existing tab instead of stacking duplicates.
- Failed page loads show a real error page (reason + Retry), not a blank view; the address bar keeps the failed URL.
- The address-bar lock icon reflects the real connection state (no false "secure" for http/internal pages).
- Narrow-window layouts fixed (responsive sidebar, no horizontal scroll, tabs keep a readable minimum width).
- Consistent empty states on History, Downloads and Bookmarks.

**Privacy quick wins (Tier 1)**
- **Tracker-free links** (default on): `stripTrackingParams()` in `@dash/browser-core` removes known tracking
  parameters (`utm_*`, `fbclid`, `gclid`, `msclkid`, `mc_eid`, …) from top-level GET navigations via the existing
  `RequestBlocker`. Deliberately conservative: generic names like `ref` or `source` are never touched. POSTs are never rewritten.
- **Auto-clear on exit** (default off): optional wipe of history and/or cookies + site storage + cache on quit.
- **GPC JS flag**: `navigator.globalPrivacyControl` is now exposed (matching the `Sec-GPC` header) when "Send Do Not Track and
  Global Privacy Control signals" is on; takes effect on next page load.

**Testing:** 9 unit cases for `stripTrackingParams`; real-app checks for strip on/off, GPC on/off, history + cookie wipe on quit.

**Honest limitations**
- Parameter stripping uses a fixed list; unknown trackers pass through. Sites that need a listed parameter for real
  functionality are rare but possible — turn the setting off if one breaks.
- Exit clearing runs when the app quits normally (window close / Quit). A crash or force-kill skips it.
- Private windows never persist data anyway; this setting concerns the normal profile only.

## Milestone 26 — Full theming: browser theme, home-page theme, Sweet Dream

**What's new**
- **Home page rebuilt around stable theme hooks.** The page is now `<div class="dash-home" data-theme="…">` with `.dash-atmosphere`,
  `.dash-light-orbs/.dash-orb`, `.dash-bubbles/.dash-bubble`, `.dash-cursor-glow`, `.dash-particle-canvas`, `.dash-sparkles/.dash-sparkle`,
  `.dash-content`, `.dash-branding/.dash-logo/.dash-title/.dash-tagline`, `.dash-search`, `.dash-shortcuts/.dash-shortcut/.dash-shortcut-icon/.dash-shortcut-label`,
  `.dash-shortcut-add`, `.dash-restore`, `.dash-theme-switcher/.dash-theme-button`. CSS written for these names (like Sweet Dream) works as pasted.
- **Theme name comes from your CSS.** DASH reads the first `data-theme="name"` selector; no such selector = your CSS just tweaks the built-in look.
  The built-in look is written with `:where()` (zero specificity) so your CSS always wins.
- **Page helpers** (our own script, no data access): `--mouse-x/--mouse-y` for the cursor glow, 16 random sparkles, a particle canvas
  (drawn only if your CSS makes it visible, paused when the tab is hidden, off under reduced-motion).
- **Classic / Custom switcher** at the bottom of the home page (appears once you have saved custom CSS); it flips the same setting as Settings.
- **Browser Theme** (Settings): your CSS applies live to the toolbar, tabs, menus and internal pages. Colour variables `--color-*` under `.dark` / `.light`.
- **Templates and import:** Blank template, Sweet Dream, Aurora, Minimal, Paper (home); Blank template, Sweet Dream, Ocean, Forest (browser); Import .css file, Copy.
  Ready-made files are also in `/themes`. CSS limit raised to 60,000 characters.
- Logo is tinted by `--logo-fill`, falling back to your `--accent`, so themed pages get a coloured logo automatically.

**Testing (real app):** Sweet Dream applied (theme id `sweet`, 100px search radius, 16 sparkles, canvas on, 82px logo, switcher present); Classic switch restored the
built-in look and persisted; browser theme set `--color-accent` and recoloured the chrome; regression audits 25/25 and 10/10.

**Honest limitations**
- Older home-page CSS written for the previous class names (`.tile`, `.brand`, `form.search`) no longer matches; the old built-in templates were rewritten.
- The native window-button strip on Windows keeps its own colour; a browser theme doesn't recolour it.
- The Classic/Custom switch doesn't update an already-open Settings page until it is reopened.
- Sweet Dream's 5-column shortcut grid looks sparse until you have several frequently visited sites.

## Milestone 27 — Fingerprint protection, Save as PDF, sleep controls, exit keep-list

**What's new**
- **Fingerprint protection** (Settings → Privacy, default on): per-launch-consistent tiny noise on canvas readback (`toDataURL`, `toBlob`, `getImageData`) and
  audio samples; `hardwareConcurrency` reports 4 and `deviceMemory` 8. Applied through the session preload (same mechanism as the GPC flag).
- **Save as PDF** (three-dot menu and page right-click menu): real `printToPDF` with backgrounds, saved where you choose.
- **Never sleep these sites**: one site per line; matching tabs are skipped by the sleeping-tabs timer (subdomains included).
- **Sleeping tab stats** in Settings: tabs asleep now, and an estimate of renderer memory released (measured when each tab went to sleep; skipped when another tab shares the process).
- **Keep list for "Clear on exit"**: sites whose cookies and storage survive the wipe. Logic lives in `main/services/exit-cleanup.ts`; every step is time-limited.
- Roadmap audit: **tab search (Ctrl+Shift+A) already existed**, so it is not new.

**Testing**
- Unit: 10 cases for the site-list parser/matcher, 9 for link stripping.
- Real app: canvas hash differs from the unprotected one and is identical across pages in a session; `hardwareConcurrency` 4 vs real 2; toggling off restores the real value.
- Real app, sleep timers temporarily shortened (then restored): background tab slept, a never-sleep site stayed awake, stats reported sleeping tabs.
- Real app: Save as PDF opened the real save dialog and wrote a valid PDF containing the page text.
- Standalone Electron test of the keep-list: with `127.0.0.1` kept, its cookie and localStorage survive while `localhost`'s are removed; with no keep list both are removed.
- Regression audits 25/25 and 10/10.

**Honest limitations**
- Fingerprint protection covers canvas, audio and two hardware values only. **Not covered:** WebGL parameters, installed fonts, screen size, iframes (session preloads run in the top frame). Canvas apps that read pixels back may see ±1 colour noise; turn the setting off for them.
- Memory-released is an estimate, not a measurement of the final result.
- Keep-list cannot enumerate storage for sites that left no cookie and no history entry; those are not cleared.
- **Quit flow not verified end to end:** in my Linux sandbox the app does not exit on window close even with no cleanup settings, so the quit-time wiring (`will-quit` hold, then quit) was verified in pieces (history wipe on `will-quit`, the clearing logic standalone) but not as one full real quit. Please test a normal close on Windows.

## Milestone 28 — VPN and crash/error management

### VPN (Settings → VPN, toolbar shield)
- **Off by default.** Nothing is routed until you turn it on (or tick "Connect on startup").
- It is a real tunnel for **browser traffic**: all tabs (normal and private) go through an HTTPS, HTTP or SOCKS5 proxy/VPN server you configure, via Chromium's proxy settings. DNS goes through the server too, and WebRTC is restricted so it cannot leak your address.
- **Kill switch** (default on): if the server stops working, traffic is blocked, not sent directly. A clear error page explains it. Local and private-network addresses bypass the tunnel.
- The password is encrypted with the OS keystore (Electron safeStorage). If the OS offers none, it is kept in memory only and is not saved.
- Test connection and "Check my IP" buttons do real requests; no result is invented.
- **Limits (honest):** DASH does not ship or run a VPN server — you bring your own (company VPN gateway, self-hosted, or a provider's proxy endpoint). It does not tunnel other apps' traffic (no WireGuard/OpenVPN), and Chromium cannot do SOCKS5 with a username/password, so those servers are refused with a message. The update check is skipped while the VPN is active.

### Crash and error management
- **A tab's page crashes / runs out of memory:** that tab shows "This page stopped working" with **Try again**; other tabs are untouched. Crash loops are capped.
- **The browser window's own UI crashes:** it reloads itself; if it keeps happening, a dialog offers Restart or Quit.
- **Unresponsive page:** a dialog offers Wait or Close page.
- **DASH is killed, crashes, or power is lost:** the next start shows "DASH closed unexpectedly last time. Restore your N tab(s)?" on the New Tab page. A normal quit shows nothing.
- **Graphics process keeps crashing (3 times):** DASH offers a restart and the next run uses software rendering.
- **Damaged data file:** moved aside to `dash.sqlite.damaged-<time>`, DASH starts fresh and tells you where the old file is.
- **Second launch:** brings the existing window to the front instead of opening a second copy fighting over the same data.
- **Unexpected internal errors** are logged, never shown as a raw crash box; repeated ones offer a restart.
- **Startup failure** shows a message with the log location. The log is `dash-startup.log` in the app data folder (local only, never sent anywhere; rolls over at 512 KB).

### Testing done (Linux, real app under Xvfb)
Tab crash page + Try again; SIGKILL then relaunch banner and Restore; clean quit then no banner; corrupt database quarantine; second instance exits; VPN connect-on-startup with a dead server fails closed with the VPN error page; earlier VPN tests against local HTTP/auth/SOCKS5 proxies; regression suites (25 audit, 10 groups, tier-1, fingerprint, unit tests).

### Not verified
Windows installer/uninstall behaviour, real window-close flow (the sandbox does not exit on window close), safeStorage on a real keyring, a real HTTPS VPN server and public IP lookup (sandbox has no internet), real GPU driver crashes.

## Milestone 29 — Tier 2: per-site privacy panel

Click the lock / "Not secure" badge in the address bar.

- **Connection:** says honestly whether the page is HTTPS, plain HTTP, a DASH page or a local file.
- **Ad and tracker blocking switch (per site):** turns blocking off for just that site (stored as `blockingOffHosts`, a plain list, local only). The page's own address decides, so third-party scripts on that site are let through only while you are on that site. Reload to apply.
- **Cookies:** live count of cookies the page can send, and **Clear site data** (cookies, local storage, IndexedDB, service workers, cache for that origin).
- **Permissions:** the camera/mic/location/notification choices saved for that origin, each with Reset. Private tabs save none and say so.
- Works in private tabs (uses that tab's own session).

Limits: the switch covers the request blocker, not the YouTube ad-skipping script or HTTPS-only/tracking-parameter stripping, which stay global. Cookie counts include cookies from the site's parent domains, because those are the ones sent.

Tested in the real app: blocked 3 -> 0 with protection off -> 3 again after turning it back on; cookie count 2 -> cleared 2 -> 0; invalid host rejected; permission Reset removes the saved choice; panel opens over the page and closes with Esc.

## Milestone 30 — Tier 2 batch: bookmarks, site settings, passwords

### Better bookmarks
- **Drag to reorder** on the bookmarks bar; drop a bookmark on a folder button to move it in. Order is saved (new `position` column; existing bookmarks keep their old order).
- **Nested folders** by path: name a folder `Work/Docs`. The bar shows `Work`; its menu shows `Docs` as a section. (Folders are path names, not separate objects, so an empty folder cannot exist and renaming a parent means moving its bookmarks.)
- Search inside bookmarks already existed on the Bookmarks page. The page now lists in bar order (it used to be newest first).

### Site settings (Settings → Site settings)
One searchable list per site: saved permissions, **page zoom (now remembered per site across restarts)**, blocking switched off, kept-on-exit and never-sleep entries. Each has a × and there is "Forget all". Private tabs neither save nor apply saved zoom.

### Password manager
- **Update prompt:** if you log in with a saved username but a different password, DASH asks "Update saved password?" (same password = no prompt).
- **Several logins for one site:** DASH no longer auto-fills when a site has more than one saved login (it could pick the wrong account). Right-click the password field → "Fill login: <name>".
- **Generator:** right-click a password field → "Use a strong password" (fills it and any empty confirm box), or **Generate** in Settings → Passwords. 20 characters by default, from the OS secure random source, no look-alike characters.
- **Import CSV:** Settings → Passwords → Import CSV reads the file Chrome and Edge export (chrome://password-manager → Export). Existing site+username pairs are left as they are. Refuses to import if the OS keystore is unavailable, so nothing is stored unencrypted. DASH cannot read Chrome's own encrypted database; the CSV is plain text, so delete it afterwards.

### Tested
Real app: reorder and drag-and-drop (bar and folder drop), nested folder menu, zoom saved and applied to a new tab, site-settings list and removals, update prompt and no prompt for an unchanged password, single versus two-login autofill, both right-click fill items clicked in the native menu. Unit tests: CSV parser (quotes, commas, line breaks inside fields, BOM, invalid rows) and generator (500 samples). Password tests ran with Electron's plaintext fallback switched on from a test-only launcher, because the sandbox has no OS keyring; the shipped app never uses it.

### Not verified
Import CSV through the real file dialog (parsing and import logic are tested, the dialog is not), a real Chrome/Edge export file, a real OS keyring, Windows.

## Milestone 31 — Tier 2 batch: session layout, resumable downloads, spell check

### Tab groups and pinned tabs survive a restart
With "Continue where you left off" the saved session now also keeps which tabs are pinned and which group each tab is in (group name, colour, collapsed). Private tabs are never saved. Limit: after a crash, the "Restore your tabs" banner restores the pages only, not groups or pins.

### Downloads resume after a restart or crash
- Each download stores what Chromium needs to continue it (address chain, ETag, last-modified).
- Anything still running when DASH ended shows as **Interrupted** with a **Resume** button; Resume continues from the bytes already on disk into the same file and the same list entry.
- Needs a server that supports byte ranges and still has the same file. If the file changed or the server refuses, the download stays Interrupted (remove it and download again).
- Tested: killed DASH at 3.4 MB of 8 MB, restarted, resumed; finished at exactly 8,000,000 bytes, byte-identical to an uninterrupted download, one list entry.

### Spell check (Settings → Privacy)
On/off and a list of dictionary languages (up to 6), chosen from what this system's Chromium offers. Applies to normal and private tabs immediately. Chromium downloads a dictionary the first time it is used (Windows/Linux); macOS uses the system checker and ignores the list. Not verified here: actual underlining in a new language, because the sandbox cannot reach the dictionary download server.

## Milestone 32 — Settings sections and accessibility

### Settings is now organised in sections
A left menu groups everything: **General** (search engine, homepage, startup, toolbar) · **Appearance & Themes** (colour mode, Browser Theme styler, Home Page Theme styler) · **Privacy & Security** (ad/tracker blocking, tracking protection, clear on exit, clear browsing data, privacy report, site settings) · **VPN & Network** (VPN, secure DNS) · **Passwords** · **Accessibility & Language** (display options, spell check) · **Performance** · **Extensions** · **Import & Export** · **About & Reset**. A **Search settings** box finds a setting in any section (try "dns", "cookies", "zoom"). The last section you used is remembered. On a narrow window the menu becomes a wrapped row above the content.

### Accessibility (Settings → Accessibility & Language)
- **High contrast** for DASH's own screens (pure black/white surfaces, strong borders, brighter accent). Websites keep their own colours.
- **Reduce motion** turns off DASH's animations; the operating system's own "reduce motion" choice is always honoured too.
- **Always show keyboard focus** draws a visible outline on whatever has focus, including text boxes. Buttons, links, menus and switches now always show a focus ring when reached by keyboard (there was none defined before).
- **Default page zoom** (100–300%): pages open at this size; a zoom you set for a site is remembered and wins; "Reset zoom" returns to the default; private tabs use the default and never save site zoom.
- **Contrast fix:** the dim text used for hints and labels measured 2.6:1 (dark) and 2.4:1 (light) against its background; both are now at least 4.6:1 (WCAG AA is 4.5:1).
- **Screen-reader names:** a scripted check of the browser window and every Settings, History, Downloads and Bookmarks screen found 5 controls without a name (theme CSS boxes, site lists, history row checkboxes); all are labelled now and the check reports none.
- Also fixed: the on/off switches' knob stuck out past the edge of the switch.

### Not verified
Real screen readers (NVDA, VoiceOver, Narrator); the check is automated and only looks for missing names. High contrast does not restyle the New Tab page or web pages. Windows.
