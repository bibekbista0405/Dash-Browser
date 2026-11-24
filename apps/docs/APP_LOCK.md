# DASH App Lock — plan and design

## Goal
Let a person lock the **whole browser** with one password, so someone who walks up to the computer cannot read
their open tabs, history, bookmarks or saved logins inside DASH. (Website Lock is separate: it protects single
websites, each with its own password.)

## What it does
- **Turn on** in Settings → Security: choose a password (8+ characters) and an auto-lock time.
- **Locks** when DASH starts, when you choose *Lock DASH now* (toolbar lock menu, or Ctrl+Alt+L), and after
  the idle time you chose (off / 1 / 5 / 15 / 30 / 60 minutes with no mouse or keyboard use).
- **While locked** every page view is hidden, sound is muted, browser shortcuts are ignored, and a full-window
  lock screen covers the toolbar. Unlocking restores everything exactly as it was (tabs keep loading in the
  background; nothing is reloaded).
- **Wrong passwords**: 5 wrong tries in a row start a wait of 30 s that doubles each time up to 15 min. The wait
  survives restarting DASH.
- **Change / turn off** needs the current password.
- **Forgot the password?** There is no back door. The only way back in is **Erase and reset**: it permanently
  deletes history, bookmarks, saved passwords, cookies, cache, downloads list and sessions, then removes the
  lock. Someone who does not know the password can therefore open DASH again, but never read what was in it.

## Design
- `services/app-lock/engine.ts` — pure logic over a small key-value store (SQLite in the app, memory in tests).
  Password check: scrypt (N=2^15), salted, timing-safe. Only a verifier is stored, never the password.
  Locked/unlocked is a plain in-memory flag: it is **never** saved, so a restart always starts locked.
- `ipc/app-lock-ipc.ts` — validated calls from DASH's own windows only (same trust check as Website Lock).
- `TabManager.setAppLocked()` — hides all views (`setVisible(false)`), mutes audio and remembers the old mute
  state; new views created while locked start hidden.
- Renderer: `AppLockScreen` covers the window while locked; an idle timer (mouse/keyboard activity in the
  toolbar, and `before-input-event` for pages) asks main to lock.

## Honest limits
This is a screen lock for casual access. It does **not** encrypt the profile folder: a person with full access
to your Windows account and files can read them with other tools, and it cannot stop someone who can edit DASH
itself. For that, use Windows account sign-in and disk encryption (BitLocker).

## Tests
`npm test` covers: enabling, wrong/right password, lockout growth and persistence, restart-always-locked,
change/disable need the password, idle setting validation, and the erase-and-reset path.
