# Contributing to DASH

Thanks for helping. DASH is a privacy-first browser; changes must keep that true.

## Ground rules

* **No telemetry or tracking**, ever, and no new network connection unless the user starts it. If a feature needs one,
  document it in `PRIVACY.md` in the same change.
* **Real features only** — no placeholder UI or invented data. If something is limited, say so in the UI and docs.
* **Secure Electron defaults** — context isolation on, no Node in renderers, every IPC channel validated in
  `apps/desktop/src/main/ipc/register-ipc.ts`.
* By contributing you agree your work is licensed under **GPL-3.0-only** (see `LICENSE`).

## Setup

```bash
npm install
npm run dev          # development
npm run typecheck    # strict TypeScript
npm run lint
npm run build
```

Windows packaging: see [docs/WINDOWS-RELEASE.md](docs/WINDOWS-RELEASE.md). The desktop app lives in `apps/desktop`;
platform-independent logic in `packages/browser-core`.

## Pull requests

1. Keep a PR focused; describe what changed and how you tested it (UI changes: say which screens/themes).
2. `npm run typecheck`, `npm run lint` and `npm run build` must pass; for UI changes also run
   `npm run ui-check --workspace=apps/desktop`.
3. Update `CHANGELOG.md` under *Unreleased*.

Security problems: do not open a public issue — see [SECURITY.md](SECURITY.md).
