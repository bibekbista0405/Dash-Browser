# Security policy

## Supported versions

Only the latest release of DASH receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's private reporting instead:

<https://github.com/bibekbista0405/Dash-Browser/security/advisories/new>

(Private vulnerability reporting must be enabled in the repository's Security settings for this link to work.)

Include what you found, how to reproduce it, and the DASH version. DASH is maintained by one person, so replies can
take a few days; you will be told whether the report is accepted and, if so, when a fix is released. Please allow time
for a fix before disclosing publicly.

## Scope

In scope: DASH's own code — the Electron main process, preload bridge, IPC handlers, internal pages, storage and
packaging. Out of scope: vulnerabilities in websites you visit, and in Electron/Chromium themselves (report those
upstream; DASH picks up fixes by updating Electron).

## Design notes useful to researchers

Context isolation and sandboxed renderers are on; IPC calls are validated and only accepted from DASH's own windows and
bundled internal pages; saved passwords are encrypted with the operating system's secure storage; DASH has no
telemetry. See [PRIVACY.md](PRIVACY.md).
