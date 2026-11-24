# Signing in to websites from DASH

DASH has no account of its own. Signing in to Google, Facebook, GitHub and so on is done on those sites, and DASH keeps
the session cookies on this device (separate cookie jars per container).

## What DASH does so sign-in keeps working
- Presents as plain Chromium (no "Electron" or app-name token in the browser identity string).
- Real pop-up windows for `window.open` sign-in flows, sharing the tab's session, so the result can be passed back.
- Sign-in and CAPTCHA providers (Google, Facebook, GitHub, Microsoft, Apple, X, Discord, Auth0, Okta, Cloudflare,
  hCaptcha, ...) are never treated as third-party: cookies are not stripped from their requests even with
  "Block third-party cookies" on, and private tabs do not strip their client hints.
- `connect.facebook.net` and other login SDKs are not in the blocklist.

## Honest limits (not verifiable from the build machine)
- Google may still refuse sign-in in browsers it cannot recognise as Chrome ("This browser or app may not be secure").
- Passkeys / Windows Hello support in Electron is partial.

## Manual checklist (run on a real machine)
1. Sign in to accounts.google.com, then open youtube.com: should be signed in.
2. "Continue with Google" on a third-party site (pop-up flow).
3. facebook.com login, then "Log in with Facebook" on a third-party site.
4. github.com login (incl. 2FA), then "Sign in with GitHub" on a third-party site.
5. login.live.com / office.com.
6. Restart DASH: still signed in. With App Lock on: unlock, still signed in.
7. Turn on "Block third-party cookies" in Settings and repeat 2-4.
