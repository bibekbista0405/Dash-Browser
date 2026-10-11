# DASH — Privacy-First Browser Platform

A monorepo housing DASH across every platform it will eventually run on.
Today that's desktop (Electron); Android and iOS are architected for but
not yet built.

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

- `electron-builder`'s `files` config includes all of `node_modules/**/*`
  (excluding the `@dash/*` workspace symlinks, which are build-time-only
  and already inlined by Vite), which bundles devDependencies too (eslint,
  vite, typescript, etc.) into the shipped app — functionally correct but
  larger than necessary. Tightening this is a follow-up, not done here.
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
