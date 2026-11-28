# DASH for Android (0.2)

Privacy-first mobile browser by Bibek Bista, the phone companion of the DASH desktop browser (source-available, free to use).
Kotlin + Android WebView. No accounts, no analytics, no ads. Everything stays on the phone.

## What works
Chrome-style layout: address pill (lock / warning / search icon, clear and reload inside it), tab-count button, three-dot menu.
- **Address bar:** tap to get suggestions from your bookmarks and history (all local); URL or search is detected; engines: DuckDuckGo (default), Google, Bing, Brave, Startpage
- **Tabs:** card grid with page previews, Tabs / Private switch, close, close all, restored on next start; closing the last tab closes DASH
- **Incognito tabs:** never saved to history or suggestions, no cache, their own cookie store (deleted when the last Incognito tab closes and at next start) when the phone's WebView supports profiles, screenshots blocked, purple theme. On an old WebView DASH tells you cookies would be shared.
- **Ad blocking everywhere:** every request in every tab (iframes and Incognito included) is checked against a domain list and URL patterns; a page script hides ad boxes and skips YouTube video ads (best effort, YouTube changes often); per-site switch in the site info sheet
- **Link and image long-press menu:** open in new / Incognito tab, copy, share, download image
- **Real logo:** launcher icon (adaptive + themed), home page, lock screen, toolbar
- **Dark / light:** status and navigation bar icons follow the theme; optional dark mode for web pages
- **Menu:** back / forward / bookmark / share / reload row, new tab, new private tab, history, downloads, bookmarks, find in page, add to Home screen, desktop site
- **Site info sheet** (tap the lock): connection status, ads/trackers blocked on this page, per-site blocking switch, clear this site's cookies
- **Home page:** search box and shortcuts only for sites you really use (5+ visits); remove one and it stays removed; blocked-count card
- **Privacy:** ad/tracker blocking, always-HTTPS, third-party cookies blocked by default, Global Privacy Control, no click-through on bad certificates, no analytics
- **Pages:** History (grouped by day, search), Bookmarks (search), Downloads, Settings (search engine, theme, privacy switches, text size, clear browsing data)
- Pull to refresh, fullscreen video, file upload, app lock (fingerprint / face / screen lock), Dark / Light / System theme (dark by default)

## Honest limits
- Not compiled or run by the author yet (no Android SDK in the build environment). Kotlin syntax and resource references were checked with a parser, but expect to fix a few compile errors on first build.
- Ad blocking is host-based: ads served from the page's own domain (YouTube video ads) are not blocked.
- Camera, microphone and location are refused for websites (no permission prompt yet).
- Google refuses sign-in in embedded WebViews even with a Chrome-like user agent; Facebook/others vary.
- No extensions, no sync with desktop yet (planned: encrypted backup file).

## Build
**Android Studio:** open this folder, let it sync, press Run (needs Android 11 / API 30+).
**Command line (Windows cmd), debug APK, installs on any phone:**
```
cd /d C:\path\to\dash-monorepo\apps\android
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
gradlew.bat assembleDebug
```
APK: `app\build\outputs\apk\debug\app-debug.apk`. Needs JDK 17 (Android Studio's own works: `set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`) and, in the SDK Manager, Android SDK Platform 34 and Build-Tools 34.
**Signed release APK:** create a key once with `keytool -genkeypair -v -keystore %USERPROFILE%\dash-release.jks -alias dash -keyalg RSA -keysize 4096 -validity 10000` (back it up: without it nobody can update the app), then
```
set DASH_KEYSTORE=%USERPROFILE%\dash-release.jks
set DASH_KEYSTORE_PASSWORD=your-password
gradlew.bat assembleRelease
```
APK: `app\build\outputs\apk\release\app-release.apk`. The Gradle wrapper (gradle 8.7) is included, so no separate Gradle install is needed.
**No Android Studio:** push the monorepo to GitHub; `.github/workflows/android-apk.yml` builds the APK and attaches it as a download.

## Relation to the monorepo
This is a native Kotlin app, so it cannot import `@dash/browser-core` (TypeScript). The address-bar rules, search engines, tracker host list and the
"5+ visits" home-shortcut rule are mirrored by hand in `Omnibox.kt`, `Blocker.kt` and `Store.kt`; keep them in step with `packages/browser-core`.
`apps/*` in the root workspaces ignores this folder (it has no package.json), so `npm install` is unaffected.

## First-run intro
On first launch DASH plays a short three-page welcome (welcome, theme and search engine, ready). The theme and search engine chosen there are saved to settings. It is shown once.

## Recently closed, bookmarks file, site permissions
- Menu > Recently closed reopens tabs you closed (normal tabs only).
- Bookmarks: the ... button in Bookmarks (or Settings > Your data) imports/exports a standard bookmarks HTML file.
- Websites can ask for camera, microphone and location (https only). Your answer is kept per site; manage it in Settings > Site settings or the padlock sheet.

## Encrypted backup
Settings > Your data > Save encrypted backup writes the same `.dashbackup` file as desktop DASH (JSON envelope, scrypt N=32768 r=8 p=1, AES-256-GCM), so it can be restored on either. It carries settings, bookmarks, hidden home sites and site permission choices. History is never included. Saved passwords, notes, custom shortcuts and page zoom from a desktop file are skipped on Android.

## Passwords
Settings > Passwords. DASH offers to save a login after you sign in and offers saved logins when you tap a login field. The vault is an AES-256-GCM file whose key never leaves the Android Keystore; showing or copying a password asks for your fingerprint or screen lock. Logins can travel inside the encrypted backup file (desktop and Android share the format). Not available in Incognito for saving. Fill happens only for the exact https site and only when you tap a saved login.

## More features
Bookmark folders, voice search and QR scanner (address bar), picture-in-picture for full-screen video, background audio that survives screen lock (media notification with play/pause and stop; the page is told it stays visible), reading mode, translate through Google Translate (asks first), cookie-popup hiding. Not available yet: tab groups, web push notifications, installable web apps, tablet layouts, app translations.
