# DASH — Privacy-First Browser Platform

A monorepo housing DASH across every platform it will eventually run on.
Today that's desktop (Electron); Android and iOS are architected for but
not yet built.

## License, privacy and policies

DASH is **source-available**, not open source: you can read, build, change and share it for noncommercial purposes, and you cannot sell it ([LICENSE](LICENSE), PolyForm Noncommercial 1.0.0 plus a few notes), © 2026 Bibek Bista. Releases up to 0.1.0 were GPL-3.0-only (see `LICENSE-GPL-3.0-legacy.txt`). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md), an independent developer in
Nepal. It has **no telemetry and no accounts**; what it stores and the few connections it can make are listed in
[PRIVACY.md](PRIVACY.md). Windows builds are currently **unsigned** — see
[CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md) and [docs/WINDOWS-RELEASE.md](docs/WINDOWS-RELEASE.md). Security
reports: [SECURITY.md](SECURITY.md). Dependency licenses:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Changes: [CHANGELOG.md](CHANGELOG.md).

## Structure

```
apps/
  desktop/    Electron implementation — the only shipping platform today
  android/    Not started. See apps/android/README.md for the contract
              a real implementation must satisfy.
  ios/        Not started. See apps/ios/README.md.

packages/
  browser-core/   Platform-independent domain logic. Zero Electron, zero
                  DOM, zero Node built-ins — verified by typechecking it
                  standalone with no ambient types available. Holds:
                    - Domain types (TabState, HistoryEntry, BookmarkEntry,
                      DownloadEntry, BlockStats)
                    - Settings types + defaults
                    - Search engine config
                    - The address-bar resolver (resolveAddressBarInput) —
                      a pure function, unit-testable, identical omnibox
                      behavior on every platform
                    - The ad/tracker blocklist + classifier
                    - Repository *interfaces* (HistoryRepository,
                      BookmarkRepository, DownloadRepository,
                      SettingsRepository, SessionRepository) that any
                      platform's storage layer must implement — browser
                      logic never talks to SQLite (or any storage engine)
                      directly
```

Electron in `apps/desktop` is treated as one platform implementation, not
the foundation everything else is bolted onto: it does window creation,
native menus, IPC, dialogs, file access, and desktop integration, and
delegates every actual browser decision (what does this address-bar input
resolve to, is this domain blocked, what are the default settings) to
`@dash/browser-core`.

## What changed in this pass (architecture rework)

- **Extracted `@dash/browser-core`** from what used to be a single
  `apps/desktop/src/shared/ipc-channels.ts` file. That file now just
  re-exports the package plus the Electron-specific IPC channel name map
  (IPC is a transport concept, correctly Electron-specific, so it stays in
  `apps/desktop`). Every existing import of `"../../shared/ipc-channels"`
  elsewhere in the app kept working unchanged — the barrel re-export made
  this a non-breaking move.
- **Verified `@dash/browser-core` is genuinely platform-independent**, not
  just organized to look that way: its `tsconfig.json` has no DOM/Node
  ambient types, and it typechecks clean standalone. If anyone later adds
  an accidental `window.` or `Buffer.` reference to a "pure" module, this
  fails immediately.
- **Found and fixed a real build-system bug**, not a hypothetical one: the
  old `build` script ran `vite build` (which correctly bundles main +
  preload + renderer) followed by `tsc -p tsconfig.main.json` — and that
  second step had no `noEmit` and wrote to the *same* `dist-electron`
  folder, silently overwriting Vite's correctly bundled output with raw,
  unbundled `tsc` output. That reverted the preload script from CJS back to
  ESM, which is exactly the "Electron module resolution fails" failure
  mode. Fixed: `tsc` is typecheck-only everywhere now (`noEmit: true`);
  Vite is the single build system, full stop.
- **Extracted `resolveAddressBarInput`** out of the Electron `TabManager`
  into `browser-core` as a pure function, and wired the TabManager to call
  it instead of duplicating the regex logic — a concrete example of the
  "browser logic decoupled from Electron" principle actually applied, not
  just stated as a goal.
- **Added real electron-builder packaging config** — `asarUnpack` for
  `better-sqlite3`'s native binary, win/mac/linux targets, and
  `dist`/`dist:win`/`dist:portable` scripts — and actually ran the
  packaging pipeline rather than just writing config and assuming it
  works (see Verification below).

## Verification performed (this session)

- `packages/browser-core` typechecked standalone with zero ambient
  DOM/Node/Electron types — clean.
- Full monorepo `npm run typecheck` (browser-core + desktop, both
  `tsconfig.json` and `tsconfig.main.json`) — clean.
- `npm run lint` — clean.
- `npm run build` (Vite renderer + main + preload) — succeeds; confirmed
  preload output is still real CJS (`"use strict";const r=require("electron")…`),
  not silently reverted to ESM.
- `electron-builder --linux AppImage --dir` — **succeeded**. Produced a
  real `linux-unpacked` app; confirmed `better-sqlite3`'s native `.node`
  binary was correctly unpacked from `app.asar` via `asarUnpack`, and that
  `app.asar` contains our actual built `dist-electron` output (verified by
  listing its contents, not assumed).
- `electron-builder --win --dir` — produced a real, complete
  `win-unpacked/DASH.exe` (186MB, full Electron + Chromium + our app) with
  the same correct `resources/app.asar` + unpacked native module structure
  as the Linux build. Along the way this surfaced a second real bug:
  electron-builder's automatic native-module rebuild (`npmRebuild`) cannot
  actually cross-compile `better-sqlite3`'s C++ addon for Windows when
  running on Linux — it silently reuses the host's own Linux binary, which
  would crash at runtime on a real Windows machine. Fixed with
  `scripts/prebuild-win-sqlite3.mjs`, which fetches the real prebuilt
  Windows binary via `better-sqlite3`'s own `prebuild-install` mechanism,
  combined with `build.npmRebuild: false` so electron-builder never
  clobbers it, plus `scripts/restore-dev-sqlite3.mjs` (wired as
  `postinstall` and chained after `dist:win`/`dist:portable` regardless of
  success) so a developer's own machine never gets left with a Windows
  binary that breaks local `npm run dev`. Verified end-to-end: ran
  `npm run dist:win`, confirmed the fetched binary was a real Windows
  build, confirmed `DASH.exe` was still produced, and confirmed the
  restore step put a genuine Linux ELF binary back afterward (checked with
  `file`, not assumed).

  The build then failed at a *later*, unrelated step — embedding an asar
  integrity hash into the exe's PE resources — which electron-builder
  implements via a Windows tool run through `wine` on non-Windows hosts,
  and this sandbox has no `wine` installed. **This remains a sandbox
  limitation, not a project defect**: the same command will complete on an
  actual Windows machine or any CI runner with wine (e.g. GitHub Actions'
  standard `ubuntu-latest` runner has it, or use electron-builder's
  official Docker image).
- **Not re-verified visually**: same limitation as every prior milestone —
  no display server in this environment, so the running window itself
  hasn't been eyeballed since the restructure. Functionally nothing in the
  restructure touched runtime browser logic (only import locations moved),
  so regressions here are unlikely, but please run `npm run dev` and
  confirm normal browsing still works exactly as before.

## Known follow-ups (stated honestly, not hidden)

- ~~`electron-builder` bundles devDependencies~~ — checked in M52: the packaged `app.asar` contains production
  dependencies only (eslint, vite, typescript are not in it); the `node_modules/**/*` pattern only matches the small
  app-local folder. The asar is about 17 MB; the rest of the installer size is Electron itself.
- The preload bundle pulls in slightly more of `browser-core` than it
  strictly uses, because `export *` barrels are harder for bundlers to
  fully tree-shake. A few KB of unused blocklist data ends up in the
  preload chunk. Not a correctness issue, just a minor size inefficiency.
- `packages/browser-core` is consumed as TypeScript source via a path
  alias (both `tsconfig` `paths` and a Vite `resolve.alias`), not as a
  compiled, published package with its own `dist/`. That's the right
  tradeoff today — one consumer, fast iteration, no build-order
  coordination — but the moment a second real platform (Android/iOS)
  needs to consume it outside a Vite/TS toolchain, it should get a real
  build step (`tsc` to `dist/` + `.d.ts`) and be versioned properly.
- Android/iOS are documented contracts (see their READMEs), not scaffolded
  projects. Generating empty Gradle/Xcode projects with no real
  implementation behind them would be exactly the kind of fake
  implementation this project has avoided from milestone 1 onward.

## Running it

```bash
npm install          # installs and links all workspaces
npm run dev           # desktop app, hot reload
npm run build          # production build (renderer + main + preload)
npm run typecheck       # browser-core + desktop, both tsconfigs
npm run lint
npm run dist            # package for the current OS
npm run dist:win         # Windows (NSIS installer + portable) — needs wine on non-Windows hosts
npm run dist:portable     # Windows portable exe only
```

---

For the full feature history and per-milestone details (History &
Bookmarks, Downloads, Settings & Private Browsing, Session Restore &
Sleeping Tabs, Ad/Tracker Blocking), see `apps/desktop/README.md`.

## M33 — Theme switching + toolbar polish

- **Smooth light/dark switch.** `useTheme` now swaps the theme as one 180 ms cross-fade of the whole window (View
  Transitions) with per-control transitions paused during the swap; this removes the half-old/half-new flicker. It is a
  single instant repaint with "Reduce motion" or when the window is hidden. `html`/`body` paint the surface colour
  themselves so they can never disagree with the controls.
- **New Tab and error/crash pages follow the theme live** (both palettes ship in the page, switched by
  `prefers-color-scheme`), and DASH's own pages get a themed native background (no white flash while loading).
- **Toolbar icons** are now one SVG set (`components/Icons.tsx`) instead of text glyphs that differ per OS font; buttons have tooltips.
- Verified on Linux/Electron by sampling computed colours frame by frame (light↔dark) and screenshots. Not verified on Windows.
- **Print preview** (More menu, page right-click menu): renders the page to a PDF in a temp folder and opens it in a new tab in Chromium's PDF viewer (real pagination, its own Print/Download). Old previews are deleted after an hour. Tested on Linux; refused for DASH's own pages.
- **Vertical tabs** (Settings → General → Toolbar): tab list down the left side with groups, pin/mute indicators, drag-reorder and the same right-click menu; collapsible to icons. Page views are offset to match. Also fixes a lag where toggling the bookmarks bar resized pages one step late.
- **Move tab to a new window**: tab right-click → "Move to new window", or drag a tab out of the window. The page is re-opened in the new window (it reloads; scroll position and typed input are not carried over) and the old tab closes. Private tabs and a window's only tab are refused. The menu path is tested; the drag-out gesture uses the native drag-end position and could not be exercised in the headless test.
- **PDF annotations**: not built by DASH. Electron 32's built-in PDF viewer already ships highlighter/pen annotation and "Download edited" (confirmed the controls exist in the viewer; drawing itself not exercised headlessly).
- **Extensions**: unpacked Chrome extensions load through Electron's `session.loadExtension`; Electron only implements a subset of the Chrome extension APIs, so many extensions will not work fully.
- **Encrypted backup / manual sync** (Settings → Import & Export → Encrypted backup): one `.dashbackup` file sealed with a passphrase (scrypt + AES-256-GCM, authenticated; crafted KDF parameters are rejected). Contains settings, bookmarks, per-site zoom, shortcuts, hidden sites, permissions and optionally saved passwords; history/downloads are excluded. Import merges (no duplicate bookmarks, unknown settings keys ignored). Nothing is uploaded — to sync two computers, keep the file in a folder you already sync yourself. Tested: crypto unit checks (round trip, wrong passphrase, tampering, hostile parameters, no plaintext in file) and a full export → wipe → import in the real app with dialogs stubbed. The saved-passwords path needs OS secure storage and was only tested for its refusal message here.

## M38 — Tier 0 sweep + container tabs

- **Automated UI check** (`npm run build && npm run ui-check`): launches DASH with a throw-away profile and opens every internal screen (all Settings categories, History, Downloads, Bookmarks, New Tab, the browser chrome) in dark and light at 760×520, 1024×700 and 1440×900, flagging sideways scroll, elements past the edge, clipped button labels and console errors. (Electron has no window-resize protocol, so sizes are applied as viewport emulation.) It found and fixed an overflowing DNS selector in narrow windows.
- **Escape closes menus** (More menu, tab menu, group menu, container menu) — the More menu ignored Escape before. Emoji icons in the tab strip, address bar, bookmarks bar and Settings sidebar replaced with the SVG set; Private chip readable in light mode.
- **Container tabs**: Settings → Privacy & Security → Container tabs, and the ▾ next to + in the tab bar. Each container is its own persistent session partition (own cookies, localStorage, cache) set up like the normal session (blocking, header policy, permissions, VPN, spell check, downloads). Tabs show the container colour as an underline (right edge in vertical mode); duplicate/move-to-window/session restore keep the container; deleting a container closes its tabs and erases its data; auto-clear-on-exit covers containers. Tested in the real app: cookies and localStorage are isolated between two containers and the normal profile, tabs restore into the right container, cookies persist across a restart (after Chromium's 30 s cookie flush; a hard kill sooner than that loses unflushed cookies for normal tabs too), deleted-then-recreated container starts empty. Limits: extensions run in normal tabs only; saved passwords and permissions are shared across containers; DASH pages (settings, history) always open in the normal profile.

## M39 — Profiles, Web Store extensions, translate (Tier 2 complete)

- **Profiles** (Settings → Import & Export → Profiles): each profile is its own data folder (history, bookmarks, passwords, cookies, settings, containers) opened in its own DASH process (`--dash-profile=<id>`); a chip next to the logo names a non-default profile. Create / rename / open / delete (delete refuses the running profile and any profile whose instance is alive; stale locks from a crash are recognised). Tested on Linux: a second profile starts with empty bookmarks and its own folder, the spawned process runs, delete is refused while running and works after a crash left a stale lock. Not tested on Windows/macOS (lock detection there relies on Chromium's `lockfile`/`SingletonLock`).
- **Chrome Web Store install** (Extensions panel): paste a store link or id → DASH downloads the CRX from Google's update endpoint over HTTPS, unpacks it into its own folder (zip-slip safe), shows the permissions it asks for, and loads it only after you approve. Honest limits: the CRX signature is not verified, no automatic updates, Electron supports only a subset of the Chrome extension API, runs in normal tabs only. The download could NOT be tested here (the sandbox blocks Google); the URL parsing, CRX2/3 header handling, unpacking, zip-slip refusal and permission summary are unit-tested, and the error paths were exercised in the app.
- **Translate page…** (More menu, right-click): there is no offline translator, so it opens the page in Google Translate or Microsoft Translator (Settings → General), after a confirmation that names the service and the address being sent — every time. Only public http(s) pages. Tested: confirmation shown, translation tab opened in the same private/container context.
- Encrypted sync stays file-based (M37); there is no DASH server.

## M40 — Smooth transitions, docked DevTools, zoom controls, first-run welcome

- **No more flashes between pages.** The old page stays on screen until the new view exists and has loaded (`revealView` in `tab-manager.ts`); a replaced view is removed only after its successor is attached. In dark theme Chromium paints a dark default for a new document, so a website navigation briefly hides the view over a white backdrop, and the backdrop under the page area is white while a website is active. Measured on a real compositor (Xvfb) for new tab ↔ site, site ↔ settings, site ↔ site, history ↔ downloads and tab switching, in both themes: no intermediate dark frames.
- **Developer tools docked inside the window** (F12 / Ctrl+Shift+I / More menu). Settings → Developer tools: right (default), bottom, or a separate window. The panel takes 40% of the page area and follows the tab (hidden with it, closed with it, closed with the DevTools “×”). Not implemented: dragging the divider to resize.
- **Page zoom:** the address bar shows a zoom chip when a page is not at its default zoom; clicking it opens −/+/Reset. Ctrl+wheel and trackpad pinch zoom (Electron does not do this by itself; `zoom-changed` is handled). The More menu shows the current percentage. Per-site memory, shortcuts and Settings → default zoom were already there; DASH's own pages are not zoomed by wheel.
- **First-run welcome** (`dash://welcome`): animated steps for look, search engine and privacy toggles, then optional bookmark import. Writes the same real settings as Settings. Shown only on a fresh profile; Skip is on every step; leaving mid-way shows it again next launch. Honours Reduce motion.
- `npm run ui-check` now also covers the welcome page.

Testing notes: transitions were measured by sampling the real screen under Xvfb; the welcome flow was driven end to end on a fresh profile; DevTools open/close and Ctrl+wheel zoom were verified with real pointer events. Not tested here: Windows/macOS, a real GPU, trackpad pinch hardware.

## M41 — Tier 3: quick notes, offline archive, split view, local AI helper

- **Side panel.** Quick notes and the AI helper dock inside the window, on the right of the page area (More menu). The panel is an internal DASH page in its own view; opening a menu hides it briefly like any other overlay.
- **Quick notes** (`dash://notes` or the panel): write, edit, copy, delete, search; optionally link a note to the page you are on. Stored in this profile's local database and included in encrypted backups (import skips notes already present).
- **Saved pages** (`dash://archive`, More menu → *Save for offline*): saves the page as one MHTML file under the profile's data folder plus its visible text for search. Opens with no network (tested with the web server stopped). Private tabs are refused. Limits: pages that load content with scripts after the first render may be incomplete; scripts inside a saved page can still run when it is opened; archives are **not** part of backups (the files can be large).
- **Split view** (More menu or tab right-click → *Split view with new tab* / *Show beside current tab*; *Swap panes*; *Close split view*): two tabs side by side, a ▥ marker on both tabs, clicking a pane makes it the active tab (address bar follows). Limits: one split per window, 50/50 only (no draggable divider), not restored after restart; while a menu is open the panes are hidden rather than snapshotted.
- **AI helper** (`dash://ai` or the panel): chats with **Ollama running on your own computer** (127.0.0.1:11434) and can optionally read the current page's text. DASH ships no model and contacts no online AI service; with no Ollama it shows setup steps instead of fake answers. The model gets no tools, so page text cannot make it act; answers can still be wrong. Only the first 12,000 characters of a page are sent. Tested against a stub Ollama server (streaming, stop, page context); not against a real model here.
- `npm run ui-check` covers the new pages.

Not done in Tier 3 / still open: auto-update feed, signed Windows build, macOS/Linux installers, Android/iPhone apps, a real Windows install check.

## M42 — Updates and Linux packaging

- **Opt-in updates.** Settings → Updates: a switch ("Check for updates when DASH starts", off by default) and an https address for a folder you host containing `latest.yml` / `latest-linux.yml` / `latest-mac.yml` and the installers `npm run dist` produces. DASH contacts nothing until you enter an address, and then only that address; the old unconditional startup check is gone. Verified end to end with the real AppImage against a test feed: found 99.0.0, downloaded it, verified its sha512 and reported "ready". Integrity is the sha512 in `latest.yml`; this build is unsigned, so there is no publisher check on top. Updates apply only to an installed build (AppImage on Linux, installed app on Windows), never in `npm run dev`.
- **Packaging fix.** electron-builder failed with "Cannot read properties of null (reading 'channel')" because the updater was present but no publish target was configured. `build.publish` now has a generic placeholder (`https://updates.invalid/dash`) so it writes `latest*.yml`, and `scripts/dist.mjs` passes `--publish never` so nothing is ever uploaded. The placeholder is never contacted; the runtime address comes from Settings.
- **Linux:** `npm run dist` builds `release/DASH-0.1.0.AppImage` (+ `latest-linux.yml`); the executable is now called `dash`. Built and launched here. A `.deb` needs a real project homepage (electron-builder refuses without one), so it is not enabled.
- **Not done / not verifiable here:** Windows installer and portable `.exe` (this Linux container has no Wine, so `dist:win` must be run on Windows), code signing (needs your certificate), macOS `.dmg` (needs macOS), Android and iPhone apps.

## M43 — Split view divider

- The divider between the two panes can be dragged (20%–80%) and double-clicked to reset to an even split; *Swap panes* keeps each page's width. Verified with real mouse drags on the compositor. The strip between panes is 8 px so it is easy to grab.
- Still not done for split view: restoring a split after restart, more than two panes. DevTools and the side panel keep fixed proportions (40% and about a third, capped), with no drag handle yet.

## M44 – Draggable dividers
- The side panel (Notes / AI), docked DevTools and split view now each have a draggable divider.
- Drag to resize; double-click resets to the default share. Limits: split 20–80 %, panel 20–60 %, DevTools 20–80 %.
- Main process owns the layout (`TabManager.setDividerFraction`) and pushes divider geometry to the chrome renderer; IPC input is validated.
- Sizes are kept per session only; they are not yet restored after restart.

## M45 – Transition flash hardening
- Page swaps keep the outgoing page above the incoming one for 90 ms, so a freshly re-attached view can never expose an unpainted (black) frame.
- The window background is white while a website is showing (dark theme surface otherwise), so gaps between views never show dark.
- Verified by recording the content area at 50 fps through 13 transitions (site/internal/new tab, back, reload, rapid switching, with side panel) in dark and light themes: no stray frames. Note: the test machine uses software rendering; GPU-specific flashes on real Windows hardware can't be reproduced here.

## M46 – Split view survives restart
- Session save now records the split pair (which two tabs) and the divider position in a new `session_split` table; restore re-opens the pair with the left pane active.
- Verified: opened a split, quit, relaunched the same profile — both panes restored.
- Not restored: side-panel / DevTools open state and their divider sizes (by design: they are transient).

## M47 – Flash, menu and first-run fixes
- **Root cause of the dark flash on DASH's own pages:** every internal page (History, Downloads, Settings…) started with the *dark* theme class and only switched after its settings arrived. Fixed with a blocking `theme-boot.js` that applies the last-used theme before first paint, and the theme hook no longer applies the built-in default before real settings load.
- **Three-dot menu no longer refreshes the page:** overlays now hide the page view instead of detaching it, so the page keeps its last frame and never repaints from nothing. Verified: no change in the page area while the menu opens/closes, document state (typed text, JS state) intact.
- **First-run intro:** whether a profile is new is now decided once when the database opens (a stray early setting write used to hide the intro). It also shows even if a session is restored, and Settings → About has "Replay the welcome tour". "Reset settings" keeps the flag.
- **Menu accessibility:** More menu has menu/menuitem roles, focuses its first item, supports Arrow/Home/End/Tab, scrolls when the window is short; zoom buttons have labels.
- **Measured:** tab switch median 6 ms (p95 9 ms) with 20 tabs; ~12 MB proportional memory per simple tab (sleeping tabs free idle ones). Automated name audit: no unlabeled controls on the toolbar or any internal page.

## M48 – "rejected IPC call from an unrecognized window"
- Trust for DASH's own pages (Settings, History, side panel…) is now also derived from the live tab state: a window accepts IPC from a page if that page is one of its own tabs/side panel *and* is currently showing DASH's bundled `internal.html`. Previously trust depended solely on a separately maintained list that could get out of step with the tabs.
- Verified with the old list deliberately disabled: Settings still loads fully, no rejections.
- Any remaining rejection is now logged with the sender's URL, so a real occurrence can be traced.
- The `ExtensionLoadWarning ... 'background.scripts' requires manifest version of 2 or lower` line is Chromium's warning about an extension in your profile that uses a Firefox-style manifest; it is harmless to DASH and that extension's background part simply doesn't run.

## M49 – Windows publisher identity and release infrastructure
- Metadata: author Bibek Bista (Windows CompanyName), copyright, appId `com.bibekbista.dash`, `executableName` DASH, `asInvoker`, explicit NSIS options (per-user, install dir choice, keeps user data on uninstall), artifact names unchanged. AppUserModelID set on Windows.
- `scripts/verify-signatures.ps1` (SIGNED / UNSIGNED / INVALID, exit codes 0–3, `-AllowUnsigned`, `-ExpectedSigner`), `scripts/check-artifacts.mjs`, `.github/workflows/windows-release.yml` (build → SignPath sign with approval environment → verified publish; dormant until enabled), `signing/signpath/artifact-configuration.xml`, `docs/WINDOWS-RELEASE.md`.
- Vite warning: `theme-boot.js` is intentionally a classic blocking script (it must run before first paint); it is now referenced as a public asset (`/theme-boot.js`), which silences the warning and is emitted as `./theme-boot.js`.
- Lint: replaced a literal BOM character in `crx.ts` with `﻿` (same behaviour) so `npm run lint` passes.
- Status: nothing is signed. DASH has no OSI license yet, which SignPath Foundation requires. Windows build output not verified in the Linux environment this was prepared in (needs wine); see docs.

## M50 – Windows build confirmed; signature check runs under PowerShell's default policy
- Confirmed on a real Windows build (`npm run dist:win`): `check-artifacts` passed for `DASH.exe`, the NSIS installer and the portable exe (Bibek Bista / DASH / copyright / description all present).
- `verify-signatures.ps1` was blocked by Windows' execution policy (unsigned script from a download). New `npm run verify:signatures -- [-AllowUnsigned] [paths]` (and `npm run check:artifacts`) start PowerShell with a process-only `-ExecutionPolicy Bypass`; nothing system-wide changes. Documented in `docs/WINDOWS-RELEASE.md`.
- verify-signatures.ps1 no longer echoes Windows' confusing 'cannot run this script' text for unsigned files.

## M52 — License, policies, About page, community files
- `LICENSE` is the PolyForm Noncommercial 1.0.0 text, unchanged, with a header of extra notes that a lawyer has not reviewed. The old GPL text is kept as `LICENSE-GPL-3.0-legacy.txt`, and the package.json files say `SEE LICENSE IN LICENSE`. All 92 production dependencies are permissive (MIT/ISC/BSD/Apache-2.0 etc.), so they allow this licence if their notices are kept.
- `PRIVACY.md` (written from the code: every network connection DASH can make), `CODE_SIGNING_POLICY.md` (states that nothing is signed yet and that the free SignPath route is closed to a non-open-source project), `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md` (generated by `node scripts/gen-third-party.mjs`).
- Settings → About & Reset: version (from package.json at build time), license line, links to the privacy statement, signing policy and third-party notices (they open in a normal tab).
- `.github`: issue templates, release-notes categories, CODEOWNERS, Dependabot (npm + Actions).
- Packaging follow-up re-checked: nothing to tighten (see Known follow-ups).

## M53 — Menu freeze/refresh fix, compact toolbar, Chrome-like navigation, instant section switching
- **Dropdown (three-dot) menu no longer blanks or "refreshes" the page.** Reproduced at 125% display scaling (one fully blank frame when the menu opened). Cause: the page view was hidden before the toolbar had painted the page snapshot, and the snapshot was placed at hard-coded offsets. Now: capture → paint the snapshot and wait for it to be on screen → only then hide the page; close does the reverse; the snapshot is placed at the page view's exact bounds; and a capture that never returns times out after 350 ms so a menu can never be left waiting. Verified by recording the page area at 50 fps through open/close at 125% scale: no deviating frame. All dropdowns share this path.
- **Compact upper bar:** tab strip 40→34 px, toolbar 48→38 px (address field 36→30), bookmarks bar 32→28 px; the page area starts 16 px (bookmarks bar off) / 20 px (on) higher. Window-control overlay height matches (34).
- **Chrome-style navigation:** side items are pills — soft grey on hover, tinted accent with medium weight when selected; no thick outline box (keyboard focus on navigation items is a stronger tint; elsewhere focus rings are unchanged).
- **Section switching is instant:** History/Downloads/Bookmarks/Settings/Notes/Saved pages/AI helper used to be a full page load per click. They now switch in place (13–24 ms measured); the address bar, tab title, reload and session restore follow the section (`internal:page-changed`, validated). Ctrl/Shift-click still opens the link normally.

## M54 — Crash fix, Chrome-style click focus, full-window first-run intro
- **"Object has been destroyed" in `settings:set` / `settings:reset` fixed.** `TabManager.layoutActiveView` now returns early for a destroyed window and sets bounds through a guard that skips views whose page is already gone (closed devtools/side-panel/partner tab), so a settings change can no longer throw while another view is closing.
- **No blue outline after clicking.** Mouse clicks never draw a focus ring anymore. Keyboard focus shows a thin soft ring on standalone buttons and a tinted background on menu items, side navigation, lists and tabs. Text boxes keep the border-colour change. Settings → "Always show keyboard focus" still forces the strong ring for people who want it. The selected cards in the welcome tour use a border + tint instead of a ring.
- **First-run intro fills the whole window.** While the welcome tour is showing, the page covers the entire window (no tab strip, toolbar or bookmarks bar), with a drag strip at the top and Skip clear of the window buttons. "Start browsing"/Skip returns to the normal window. Verified on a fresh profile: all five steps, theme change, finish.

## M55 — Tidy home shortcuts, maximised start, private-tab VPN, search suggestions, split & extension controls
- **Home shortcuts:** one clean name per site (host-based when a page title is long), nine tiles plus "Add shortcut" in a fixed 5-column grid, an edit (✎) and remove (×) button on hover/focus.
- **Window:** opens maximised like Chrome; **F11** toggles real full screen from the page or the toolbar.
- **Private tabs:** a dedicated private New Tab page (no shortcuts or history); opening one connects your configured VPN first and holds the page until it is up (Settings → Privacy switch). If the VPN fails the tab loads nothing until you retry or choose to continue without it. The VPN stops again when the last private tab closes if a private tab started it. Cookies, storage, cache and logins are wiped when the last private tab closes. Honest limits are shown on the page: DASH needs a VPN server you provide, and no browser makes anyone anonymous.
- **Search suggestions** on the New Tab box and in the address bar (engine suggestions + this device's history), switchable, never requested from private tabs.
- **Split view menu** in the toolbar: swap, equal sizes, show another tab beside this one, end split, close either side.
- **Extensions:** puzzle-piece menu with pin/unpin; pinned extensions show their own icon in the toolbar and open their popup (sized to its content) or options page.
- **Private badge shows the VPN state live** ("Private · VPN on", "VPN…", "No VPN"). Verified against a local logging proxy: opening a private tab connected the VPN first, its first request went through the proxy, and closing the last private tab turned the VPN off again.

## Milestone 57 — Website Lock + hardened private tabs

**Website Lock** (`dash://website-lock`, lock icon in the toolbar): each protected site has its own password (scrypt, never stored in plain text). Everything starts locked on every launch; unlock state lives only in memory. Enforcement is in the browser itself: navigation guard, tab manager and a network backstop, so typed URLs, links, redirects, popups, back/forward and new tabs all show the lock screen first. Recovery key (shown once), encrypted backup/restore (AES-256-GCM), persistent wrong-password rate limiting, activity list. Limits: it protects sites inside DASH on this device; it is not disk encryption, and a local reset exists for lost keys (it removes old protection, never reveals passwords). Tests: `npm test` (29 engine tests).

**Private tabs, honestly:** no browser can be "completely anonymous". Private tabs now: use an in-memory session wiped when the last private tab closes, disable non-proxied WebRTC (no IP leak), send origin-only Referer, remove client-hint headers, use one fixed Accept-Language and a generic user agent, and block third-party cookies. Your network provider and sites still see your IP unless you use a VPN/proxy, and sites can still fingerprint you in other ways. For real anonymity use Tor Browser.
