# Changelog

All notable changes to DASH. Format: [Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

## M92 - Website step 2: honest comparison, contribute and press pages, OS note

- New pages: "DASH compared honestly" (where DASH fits, where other browsers are ahead, what to check in any browser), "Contribute and roadmap" (real commands from CONTRIBUTING.md, ideas not promises) and "Press kit" (facts, logo, colours). Linked from the footer.
- Page transitions are about 25 percent faster.
- Visitors on Mac, iPad, iPhone, Linux or ChromeOS now see a short note that DASH is not available for their device yet.
- Not done: real app screenshots (need images from the developer) and translations (need a native speaker to review).
- Tested in headless Chromium only.

## M91 - Website step 1: self-hosted fonts, social image, verify guide, motion controls

- Fonts are now served from the site itself (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono, all SIL OFL, licence in `fonts/OFL.txt`). The site no longer contacts Google Fonts.
- Outlined headings fixed so inner overlap lines no longer show.
- Social preview image (`og.png`, 1200x630) and large-card Open Graph and Twitter tags. The image link becomes absolute when `SITE_URL` is set at build time.
- New page: Verify your download (SHA-256 steps for Windows, Android, Linux and macOS), linked from the footer.
- Intro now plays once per browser, not once per session. Footer has "Replay intro", "Smooth scrolling" and "Calm mode" switches, remembered on the device.
- Tested in headless Chromium only.

## M90 - Website: intro sound, minimal thank-you, footer cleanup

- Intro: removed the centre beam, rays and shake. Added a soft glow and a second shockwave ring.
- Intro sound, synthesized with Web Audio (no audio files): rising whoosh, low hit when the logo lands, a note per letter, final chime. Sound button in the intro, choice remembered on this device. Browsers block audio until a click, tap or key press, so the button reads "Tap for sound" until then.
- Thank-you after download is now one small card: ring draws around the logo, title, two short steps, one button.
- Footer: removed the developer card. The Developer page link stays, and the portfolio link lives on the Developer page only.
- Tested in headless Chromium only. Audio output was not listened to.

## M89 - Website: intro fix, calmer hero, new footer, smoother nav

- Intro: fixed the logo jumping off screen. Two `@keyframes shake` rules clashed and the later one shifted the whole intro by 50%; the intro ones are now `ishake` and `isplit`.
- Hero: two-line headline, streak field masked away from the text, dot grid behind the illustration, Windows and Android buttons side by side, shorter trust row.
- Footer: giant DASH wordmark that lights up under the pointer, running streaks, developer card with live Nepal time, link hover lines, back-to-top button. Removed the duplicate Developer link.
- Nav: drop-in entrance with staggered links, back-to-top button in the compact end state, magnetic Download button.
- Tested in headless Chromium only (1440px and 390px).

## M88 - Website: developer page, thank-you takeover, smoother scrolling

- New **Developer** page (footer link, `#developer`): tilting holographic maker pass, counters computed from the repo at build time, orbiting tech stack, build timeline from this changelog, flip-card principles. Only facts from the repository are shown.
- New full-screen **thank-you takeover** after a download: letter-by-letter title, progress rail, step cards, canvas dash burst, pointer tilt, Esc/backdrop/focus trap.
- Download buttons redesigned (sheen, arrow, busy state).
- Scrolling: eased wheel scrolling on desktop with a single frame loop; geometry re-measured on layout change so sections no longer stall.
- Intro: light beam and rays burst added; `beam` keyframe name clash fixed.
- Tested in headless Chromium only (desktop and 390px). Not tested on real touch devices or other browsers.

## M87 - Website: smoother motion, docs and legal pages, Vercel
- Smoother scrolling: one animation loop with cached positions and eased values, so parallax, the manifesto, the pinned scroller and the ribbon glide instead of jumping. Frame pacing in headless Chromium held at 60 fps during a scripted scroll.
- Nav rewritten to be cheap to draw: no backdrop blur, transform-based states, no layout reads while scrolling.
- Intro is truly centred (the logo starts at the exact screen centre and eases up as the wordmark arrives); measured at desktop and 390 px width.
- Interactive hero: a live streak field that bends around the pointer and bursts when you click, headline letters that lift near the pointer, buttons that lean toward it.
- New home sections: "what any website can read about you" (values read from the visitor's own browser, never sent), why people switch, switch in three steps, and a live GitHub strip (stars, forks, downloads, latest release; hidden if GitHub does not answer or the number is zero). A dismissible download bar appears after the hero and picks Windows or Android from the visitor's system.
- Real pages: Privacy policy, Terms of use, Security, Documentation (install, shortcuts, privacy tools, App Lock, backups, fixes), Licenses and Changelog (both generated from the repository files), and a 404. They share the streak-wipe transition with the main site.
- Vercel-ready: `vercel.json` (build, output folder, security headers, clean URLs), `package.json`, `public/` for static files, sitemap and canonical links from `SITE_URL` or Vercel's production URL, deploy steps in `apps/website/README.md`.
- Fixed: the smoothed scroll value shared a name with the cursor element and broke the parallax.
- The built site now lives in `apps/website/public/` (index.html and every page, committed), so Vercel can host the folder as it is with no build step. Static source files moved to `apps/website/static/`.
- Not tested: real phones, Safari, a live Vercel deploy. The privacy policy and terms were written by the developer without a lawyer.

## M86 - Website: multi-page, intro, scroll motion
- Six dedicated pages (Home, Connections, Features, Playground, Download, Questions) with hash routes, so links and the back button work.
- Page changes use a skewed streak-wipe transition with the page name; the same wipe closes the intro.
- Warp-speed intro: a streak field accelerates, the real DASH logo parts fly in, a shockwave ring, then the wordmark and tagline. Skip button or Esc; shown once per session.
- Nav is a pill that reshapes while you scroll: full width at the top, a glass capsule after scrolling, compact when scrolling down, wider when scrolling up, a single Download button at the page end. Scroll-progress ring around the logo, a stretchy sliding active indicator, magnetic links, and a full-screen menu on phones.
- Home scroll effects: hero parallax, velocity-skewed marquee, word-by-word manifesto, pinned horizontal "what happens when you open a page" scroller, hover-fill tiles. Cursor ring on mouse devices.
- Connections is an interactive node map. Features cards tilt and have a pointer spotlight. Playground is full screen with a best-single-dash score (the auto demo does not count). Download page shows the release version, size and the SHA-256 when GitHub provides one, plus tabbed install steps. Questions has live search.
- Tested in headless Chromium only (desktop, 390 px phone, light, dark, reduced motion). Not tried on real phones or Safari.

## M85 - Website redesign
- Uses the real DASH logo, split into pieces and animated (build-in intro, drifting streaks, loop).
- New motion language: left-to-right entrances, headline wipes, a streak background, a ribbon, an illustrated DASH window and phone, and an animated panel per feature.
- Content now lives in `apps/website/content.json`; `build.mjs` builds a static site; `dist/admin.html` is a form editor for it; `.github/workflows/website.yml` publishes to GitHub Pages.

## M84 - Website
- New `apps/website`: single-file official site with an interactive hero, a connections ledger copied from PRIVACY.md, feature overview, Windows and Android download cards fed from the GitHub release API, install steps, FAQ and a thank-you message after download. Light and dark. See apps/website/README.md.

## M83 - Desktop: one clean reveal on start
- The window is now shown once, when the toolbar and the first page have both painted (4 s cap if something is slow, such as a VPN still connecting). Before, it appeared in pieces: window frame, toolbar, an empty page area, then the page.
- It is maximised while fully transparent and then shown, so the resize/maximise jump is never visible (Windows and macOS honour window opacity).
- DASH_TRACE_STARTUP=1 now also logs every window and web contents created at start-up, to show if anything opens that should not.

## M82 - Desktop: faster start, steadier first frame
- Start-up no longer waits for extensions and "connect VPN on startup". The window and toolbar open at once; the first tabs are created when both are ready (so nothing loads outside the tunnel or without its extensions). Before, both were awaited before any window existed.
- First frame: the window is placed on the work area before it is shown and marked maximised afterwards, instead of being maximised while hidden. On Windows, window-occlusion tracking is switched off, a known cause of black or stale frames on a newly shown window.
- Every start writes one line to dash-startup.log (appReady, gateOpen, chromeLoaded, windowShown, tabsCreated, in ms since the process began). Set DASH_TRACE_STARTUP=1 for a step-by-step trace.
- Portable build shows a splash while it unpacks (path fixed in M82.1: relative to the project folder) (the unpacking itself happens before any DASH code runs).

## M81 - Android: clean intro, screen-off playback, swipe gestures
- Intro rebuilt as three quiet pages (welcome, theme and search engine, ready). No background effects. The back button steps back; choices are applied for real. Asks for the notification permission when it ends.
- Screen-off playback: with the screen locked or another app open, a playing page keeps going (YouTube, music, podcasts). DASH tells the page it is always visible, keeps the page's renderer at high priority, runs a foreground media service with a partial wake lock, and shows a media notification (lock screen too) with play/pause and stop. Off in Incognito; Settings > Keep audio playing in the background turns it off. Not tested on a device; YouTube may change how it detects hidden pages.
- Tabs: swipe a tab card sideways to close it, with Undo (not for Incognito). Swipe the address bar left or right to switch tabs. Toolbar buttons shrink slightly when pressed and give a light haptic tick on tab actions.
- New permission: WAKE_LOCK.

## M80 - Android: folders, voice and QR search, picture-in-picture, background audio, reading mode, translate, cookie popups
- Bookmark folders: move a bookmark into a folder (long-press), create, rename, remove or delete folders, search across all folders. A folder exists while it holds bookmarks. Folders are kept in the HTML export/import and in the shared backup file.
- Address bar: microphone (voice search, done by the phone's own speech service) and QR scanner (offline, ZXing). A scanned web address opens; other text is shown first and only searched if you choose.
- Picture-in-picture for full-screen video when you leave the app (gesture or Home).
- Background audio: music or podcasts keep playing when you leave DASH, with a notification and a Stop button. Sites that pause themselves when hidden (YouTube) still pause. Turn off in Settings.
- Reading mode (menu): the article text and images in a clean layout, light or dark. Menu > Exit reading mode returns to the page.
- Translate page (menu): opens the page through Google Translate after telling you Google sees the address.
- Hide cookie popups (Settings, on by default): hides common consent banners (OneTrust, Cookiebot, Didomi, Quantcast and others). Hiding is not rejecting.
- New dependency: com.journeyapps:zxing-android-embedded 4.3.0 (QR scanner).
- Not compiled or run on a device here. Tested in a simulated page: the reading-mode extractor and the cookie-banner hiding script. Everything that needs Android (PiP, audio service, scanner, speech, dialogs) is untested.
- Still not done: tab groups, web push notifications, installable web apps, tablet layout, translations of DASH itself.

## M79 - Android: password manager
- DASH offers to save a login after you sign in (not in Incognito, not for sites you chose "Never" for) and to update it when the password changed. A failed login is not offered: the page must move on or the password box must go away.
- Tap a login field on a site you have saved and a sheet offers your saved logins; tapping one fills the page. Only the exact site, only https, only the top frame.
- Settings > Passwords: search, show (fingerprint or screen lock first, screenshots blocked), copy (cleared after 60 s, marked sensitive), open site, delete, add by hand, delete all.
- Storage: AES-256-GCM file with a key that stays in the Android Keystore. Nothing is sent anywhere.
- The encrypted backup can now carry passwords both ways with the desktop app (you choose to include them when saving; they are imported when restoring, https sites only).
- Not compiled or run on a device here. The page script was tested in a simulated page (capture and fill); the save/fill sheets, the Keystore file and the prompts have not been run.
- Limits: needs a WebView recent enough for message listeners (most phones); logins inside iframes, and sites that build their own fields in unusual ways, may not be detected; fill is by tapping, not automatic.

## M78 - Android: share into DASH, live downloads, print
- Share a link or text from any app to DASH (a shared "Title + link" opens the link, plain text becomes a search). "Search with DASH" appears when you select text in other apps. Opening the same intent again after a rotation or theme change no longer duplicates the tab.
- Downloads screen: live percentage and size while downloading, "waiting for Wi-Fi/connection" states, tap a failed download to retry, long-press a finished file to share it, cancel a running download, confirm before deleting a file from the phone.
- Menu > Print / Save as PDF uses Android's print dialog (choose "Save as PDF" as the printer).
- Not compiled or run on a device here.

## M77 - Offline handling, address bar and search, intro rebuild
- Android: friendly "can't load" pages with the real reason (offline, site not found, timeout, connection refused, redirect loop, bad certificate) and Try again / Wi-Fi settings buttons. Failed tabs reload by themselves when the connection returns, an "You're offline" strip shows while offline, and pages you visited before open from the saved copy offline (never in Incognito).
- Android: a tab whose page process crashes or is reclaimed by Android is rebuilt and reloaded instead of closing the app. Cancelled loads (downloads, replaced navigations) no longer show an error page. Bad-certificate pages show a clear block page (no click-through).
- Android address bar: stricter address detection (1.5, v1.2 or "fix bug.in code" are searches, not websites), only http/https typed schemes open, search suggestions from your engine as you type (setting, off in Incognito, sends only what you type), results pages show the search text instead of a long address, the keyboard hides when you scroll suggestions, hardware Enter works, no flicker when focusing.
- Desktop address bar: Up/Down to move through suggestions, Enter opens the highlighted one, Esc closes the list then restores the address, a first row for "Search ..." or "Go to this address", suggestions only after you type (not on a plain click), local matches before web suggestions, accessible combobox roles.
- Desktop: "You're offline" and similar connection errors retry by themselves when Windows reports a connection again.
- Android intro rebuilt on a single column layout (brand, page, buttons) so nothing overlaps on small screens; pages scroll; buttons are inactive until the logo animation settles; tapping during it skips ahead.
- Not compiled or run on a device here. The desktop address bar was tested here with keyboard input; online suggestions and the auto-retry could not be tested because this machine has no internet.

## M76 - Android and desktop share one backup file
- The Android backup now uses the desktop `.dashbackup` format (scrypt + AES-256-GCM). A file saved on the phone opens in desktop DASH (Settings > Backup) and the other way round.
- Shared: search engine, theme, ad blocking, HTTPS-only, third-party cookies, privacy signal, per-site blocking exceptions, bookmarks, hidden home sites, camera/microphone/location site choices.
- Not shared: history (never in backups), and on Android: saved passwords, notes, custom shortcuts and per-site zoom in a desktop file are skipped, and the restore dialog says how many.
- scrypt is implemented in Kotlin (Android has none built in) and was checked against Node's crypto.scryptSync in both directions. The Android app itself is still not compiled or run on a device here.
- Replaces the short-lived M75 `.dashbk` format.

## M75 - Android: encrypted backup
- Settings > Your data: save and restore one passphrase-protected backup file (bookmarks, history, settings, site permission choices). AES-256-GCM, key from PBKDF2-HMAC-SHA256 (210,000 rounds). No recovery if the passphrase is lost.
- Restore merges: new bookmarks and history are added, settings and site choices are replaced.
- The desktop app cannot open this file yet (format: "DASHBK1" + salt + iv + ciphertext, JSON inside).
- Not compiled or run on a device in this environment.

## M74 - Android: recently closed, bookmark import/export, site settings
- Recently closed: closed normal tabs (never Incognito) are kept, listed in the menu and can be reopened.
- Bookmarks can be imported from and exported to the standard bookmarks HTML file (works with Chrome and Firefox exports).
- Real camera, microphone and location prompts for https sites; the answer is remembered per site (not in Incognito) and can be changed from the padlock sheet or Settings > Site settings. Android's own permission is only asked after you allow the site.
- Not compiled or run on a device in this environment.

## M73 - Android: first-run intro, animations, light/dark fixes
- New motion-graphics intro on first launch (logo reveal with speed streaks, glow and rings, animated wordmark, four short pages). The theme and search engine you pick there are really applied.
- Animations: tab crossfade, tab switcher scale and staggered cards, staggered list rows in History/Bookmarks/Downloads.
- Light/dark: Material 3 colour roles and dialog theme mapped to DASH colours, status/navigation bar icons follow the theme, private home page colours aligned with the toolbar.
- Note: the Android app has not been compiled or run on a device in this environment.

## [Unreleased]

### M72
- Android: real DASH logo (launcher, home, lock screen); Chrome-style home page (logo, search box that opens the address bar, Incognito / Bookmarks / History chips, shortcuts with real site icons); stronger ad blocking (more hosts, URL patterns, ad-hiding script, YouTube ad skipping); link/image long-press menu; hardened Incognito; dark/light fixes (bar icons, theme colors, optional web dark mode).

## M71
- apps/android redesigned Chrome-style: address pill with suggestions, tab card grid with previews, private tabs, animated menu, site info sheet, history/bookmarks/downloads/settings pages, find in page, add to Home screen, pull to refresh, per-site blocking, text size.

## M70
- apps/android: first native Android app (Kotlin + WebView): tabs, private tabs, search/URL bar, home shortcuts, ad/tracker blocking, HTTPS upgrade, bookmarks, history, downloads, app lock. Not yet compiled by the author.

## M69
- Removed the blue focus outline/border on buttons and chosen options (keyboard focus now uses a soft tint).
- Welcome → home: content fades out, toolbar eases in (no pop). Intro has word-by-word title reveal, pulsing logo ring, drifting glow orbs and a shine on the main button.
- Google sign-in: DASH no longer injects fingerprint noise, GPC or DNT on Google/Microsoft/etc. sign-in sites, and fills in the Chrome-only `window.chrome` parts (best effort).
- Closing the last tab now closes the window (and DASH quits with its last window).

## M68
- Bigger tabs, toolbar buttons and address bar; taller, easier-to-hit menu rows.
- Smoother dropdown/menu animation (spring ease, items fade in one after another).
- Permission and save-password prompts redesigned as cards that drop in.
- Changing the search engine now updates the home page search box straight away.
- Proxy errors: page now says whether DASH's VPN or your system proxy failed, with "Turn VPN off and retry" / "Connect directly and retry".

## M67
- Unlock transition: password field no longer clears mid-fade, lock screen just fades (no zoom/jump), page appears after the fade instead of popping over it.
- Google sign-in: pages on Google hosts now also see a Chrome-like `window.chrome` object (best effort, unverified on real accounts).

## M66
- Top bar restyled like Chrome: tab-search button at the far left, tabs merge into the toolbar, darker address pill.
- Chrome-style tab right-click menu (new tab to the right, split, group, move to window, reload, duplicate, pin, mute, close other/right).
- Home shortcuts now only show sites visited 5+ times; deleting one is permanent (no Restore) and no longer reloads the page.
- Google sign-in: browser brand list patched to look like Chrome (best effort, unverified on real accounts).

## M65
- Fixed: `npm run dist:win` failed with "warning 6001: Variable DeleteDataCheck not referenced" (NSIS warning treated as error). The uninstaller's variables are now declared only in the uninstaller build. Reproduced the exact error here with the old installer script and confirmed the new one builds the installer without warnings.

### M64
- New Tab page: a quiet line shows how many ad and tracker requests DASH has blocked for you (real lifetime count from this device, hidden until the first block).
- Fixed: a shortcut for an IP address or single-word host (127.0.0.1, localhost) was labelled "0" with a "1" icon; it now shows the full address.

### M63
- Settings → Installed apps: open or uninstall web apps installed from the address bar (removes the app, its shortcuts and closes its window).
- Tests for the encrypted backup (round trip, wrong passphrase, tampering, crafted KDF parameters). 44 tests total.

### M62
- Tabs: equal widths, accent line on the active tab, subtle dividers, neat close button, the + button sits right after the last tab, and crowded inactive tabs collapse to icon only.
- Sign-in: sign-in and CAPTCHA providers (Google, Facebook, GitHub, Microsoft, Apple, ...) are exempt from third-party cookie stripping and private-mode header stripping, so embedded sign-in boxes, SSO frames and CAPTCHAs keep working. New tests; manual checklist in docs/SIGN_IN.md.

### M61
- Fixed: when DASH starts locked, the browser home / tabs could flash for a moment before the lock screen. The toolbar now knows it starts locked before its first paint, and the lock screen is the first thing drawn.
- Faster: opening the three-dot menu and other dropdowns (lighter page snapshot, one frame of wait instead of three, live-frame updates start after the menu has opened). Page, tab and menu animations are shorter (90-120 ms) and tab switching hands over sooner.
- Installer redesign: welcome page with DASH sidebar artwork, GPL licence page, install-folder page, finish page with "Launch DASH now". Uninstaller: branded welcome and a "Your DASH data" page where you choose to keep (default) or delete history, bookmarks, passwords and settings, with a second confirmation before anything is deleted.

### M60
- New: Install as app (like Chrome). When a site ships a valid web-app manifest (https, name, standalone display, PNG icon), an Install button appears in the address bar. Installed apps open in their own window (no tabs or address bar), get Start Menu and Desktop shortcuts on Windows, are listed in the menu, and links outside the site open in the normal browser.
- Faster: Settings, History and Downloads open sooner. DASH keeps a spare renderer ready in the background.
- Tabs: switch on press instead of release, middle-click closes, small press animations on tabs and toolbar buttons.

### M59.1
- Fixed: a page (video, animation) froze while the three-dot menu or any dropdown was open. The page now keeps running behind the menu and its picture refreshes about 9 times a second.
- Fixed: WhatsApp Web said it needs Chrome 100+. DASH's browser identity carried "Electron" and app-name tokens; every session now presents as plain Chromium. (Could not test against WhatsApp itself from the build machine.)
- New: Keyboard shortcuts cheat sheet (Ctrl+/ or menu → Keyboard shortcuts).

### M59
- Fixed: videos could not go full screen (YouTube etc.). DASH was denying the browser's fullscreen permission. Now the page fills the whole window, Esc / F11 / switching tab / locking DASH leaves it.
- Fixed: first-run Welcome intro missing after a reset or reinstall. The Windows uninstaller now removes DASH's profile data, "Reset settings" and the App Lock "Erase and reset" bring the intro back on next start.
- New App Lock screen: DASH logo with lock badge, animated aura and rings, clock, pill password field with show/hide, wrong-password shake, unlock animation, reduced-motion aware.

### Added
- Private tabs: connect the configured VPN first, dedicated private New Tab page, live "VPN on / No VPN" badge,
  storage wipe when the last private tab closes.
- Search suggestions (New Tab box and address bar, switchable, never from private tabs).
- Toolbar split-view menu; extension pinning with toolbar icons and popups; F11 full screen; maximised start.
- Home shortcut tiles: clean names, fixed grid, edit button.
- GPL-3.0-only `LICENSE`, `PRIVACY.md`, `CODE_SIGNING_POLICY.md`, `SECURITY.md`, `CONTRIBUTING.md`,
  `THIRD_PARTY_NOTICES.md` (generate with `node scripts/gen-third-party.mjs`).
- Settings → About: version, source code, license, privacy statement, code signing policy and third-party notices.
- Windows publisher metadata, `npm run verify:signatures`, `npm run check:artifacts`, and a gated Windows release
  workflow prepared for SignPath (nothing is signed yet).

### Changed
- Application ID is now `com.bibekbista.dash`. An existing 0.1.0 install is treated as a separate app; uninstall it once.
- The packaged app no longer bundles development dependencies.

### Fixed
- Dark flash when opening DASH's own pages (the theme is now applied before first paint).
- The three-dot menu no longer makes the page repaint or appear to reload.
- First-run welcome shows on a new profile every time until finished; "Replay the welcome tour" in Settings.
- "Rejected IPC call from an unrecognized window" errors on internal pages.
- Split view and its divider position are restored after a restart.

## [0.1.0] — unreleased pre-release

First feature-complete desktop build: tabs, groups and pinning, container tabs, profiles, history, bookmarks,
downloads, encrypted password manager, tracker/ad blocking, Secure DNS, VPN/proxy, Chrome Web Store extensions,
page translate (via your chosen service), docked DevTools, page zoom, split view with draggable dividers, quick notes,
offline saved pages, a local-only AI helper (Ollama), opt-in updates, encrypted file-based backup and sync,
light/dark themes, and a first-run welcome. No telemetry.

## M57
- Website Lock (per-site passwords, recovery key, encrypted backup, browser-level enforcement, dashboard, lock screen).
- Private tab hardening (WebRTC, Referer, client hints, UA/Accept-Language, third-party cookies).

## M57.1
- Fix: `npm run dev` showed a blank window (ERR_SSL_PROTOCOL_ERROR). HTTPS-only mode wrongly upgraded the local dev server `http://localhost:5173` to https. Local addresses (localhost, 127.x, private ranges, *.local, single-label hosts) are no longer upgraded.
- Fix: the Website Lock toolbar button opened a broken address (`dash://websitelock`); it now opens `dash://website-lock`.
- Website Lock toolbar popup: shows the current site's status, lock now, lock all, protect/manage.

## M57.2
- Website Lock now follows the DASH theme (light, dark, high contrast and accent colour) instead of its own fixed purple style.
- The toolbar lock button has "Lock this website…": set a password right in the popup for the page you are on (recovery key setup is offered first if needed). No typing the address.

## M57.3
- Fix: on `dash://website-lock` the sidebar links (History, Downloads, Settings…) could not be clicked: Website Lock's background glow covered the sidebar. It no longer blocks clicks.
- Keyboard shortcuts now work like Chrome while a web page has focus: Ctrl+K / Ctrl+E / Alt+D / F6 (address bar), Ctrl+G / F3 (find next, Shift for previous), Ctrl+F re-focuses an open find bar, Ctrl+PageUp/PageDown (switch tab), Ctrl+Shift+W (close window), Ctrl+Shift+J (DevTools), Ctrl+Shift+Delete (clear browsing data in Settings), Alt+Home (home page), Ctrl+Shift+- zoom out.
- Split view redesigned: rounded panes with a gap and a frame (accent colour on the active pane), a tab chip with a close button under each pane, and a "Choose what to show on this side" picker in the new pane (open tabs, shortcuts, search).
- Fix: a tab closed from inside DASH could stay in the tab strip.

## M58
- App Lock: lock the whole browser with one password (Settings → Privacy & Security, toolbar lock menu, Ctrl+Alt+L). Always starts locked, optional auto-lock after 1–60 minutes without computer use, wrong-password waits that survive restarts, "Erase and reset" if the password is forgotten. Design: `docs/APP_LOCK.md`. 7 new tests.
- Split view: the two tabs sit side by side in the tab strip as one joined pill, with a sound icon on tabs that are playing audio. The empty pane lists your open tabs (not shortcuts).
- Slimmer bookmarks bar (24 px) and a smaller empty-bar hint.
- Tells Chromium the GPU memory budget to reduce the "tile memory limits exceeded" warning.

## M58.1
- Start-up: the window stays hidden until DASH's first frame is painted (no more black/white flash).
- No focus ring or box after a mouse click anywhere (menus, side navigation, buttons); a soft ring appears only when using Tab/arrow keys.
- Switching tabs now always shows that tab's own address (typed text no longer carries over; suggestions close).
- Clear way to lock the app: "Lock DASH…" in the main menu (⋮), "Lock DASH with a password…" in the toolbar lock menu, Ctrl+Alt+L, and a card on the Website Lock page. If App Lock is off, it opens the password dialog right there.
- Smooth motion: pages fade up when switching in internal screens, tabs ease in, menus pop in, buttons press-in. Honours Reduce motion.
