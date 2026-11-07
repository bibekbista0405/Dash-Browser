# DASH — Android (not started)

This folder is a placeholder, not a scaffolded app. No Android code exists
yet. When Android work begins, it should:

- Depend on `@dash/browser-core` for domain types, settings defaults,
  search-engine config, blocklist classification, and the address-bar
  resolver — none of that logic should be reimplemented here.
- Implement `packages/browser-core`'s repository interfaces
  (`HistoryRepository`, `BookmarkRepository`, `DownloadRepository`,
  `SettingsRepository`, `SessionRepository`) against whatever Android
  storage engine is chosen (likely SQLite via a different binding than
  better-sqlite3, since that's a Node native module desktop-only).
- Host tabs via Android `WebView`, translating its navigation callbacks
  into the shared `TabState` shape the same way apps/desktop's TabManager
  translates Electron's `WebContentsView` events today.
- Implement ad/tracker blocking via `WebViewClient.shouldInterceptRequest`,
  calling the same `classifyHost()` from `@dash/browser-core` so blocking
  behavior never drifts from desktop.

Do not start this by copying apps/desktop's Electron code — start from the
browser-core contracts and build a native Android implementation against them.
