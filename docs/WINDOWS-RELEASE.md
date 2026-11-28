# DASH — Windows release guide

This describes how DASH's Windows installer and portable executable are built, what identity they carry, and how
Authenticode signing is prepared. **Today every build is unsigned.** Signing is wired up but dormant until an
approved signing provider is configured (see [Signing status](#signing-status)).

## 1. Publisher identity

| Field | Value |
|---|---|
| Product | DASH |
| Description | Privacy-first desktop browser. Built for you. |
| Developer | Bibek Bista — independent software developer, Nepal |
| Copyright | Copyright © 2026 Bibek Bista |
| Application ID | `com.bibekbista.dash` |
| Executable | `DASH.exe` |

DASH is not made by a company, and nothing here says otherwise. It is **not** Microsoft-verified, certified or
independently audited, and no SmartScreen reputation is claimed.

**Metadata publisher vs. certificate signer.** These can be different things:

* The *metadata publisher* is text inside the executable (Properties → Details: company, product, copyright). It is
  set from `apps/desktop/package.json` and anyone can write anything there; it proves nothing by itself.
* The *certificate signer* is the name inside the Authenticode certificate, which a certificate authority issued.
  If DASH is signed through SignPath Foundation, the signer shown by Windows will be **SignPath Foundation**
  (they are the certificate holder), while the metadata still says Bibek Bista / DASH. That is expected.

## 2. Where the metadata comes from

`apps/desktop/package.json`:

* `author.name` → Windows **CompanyName** (the individual developer identity, not a company)
* `productName` → ProductName, shortcut and install folder name
* `description` → FileDescription
* `build.copyright` → LegalCopyright
* `build.appId` → `com.bibekbista.dash` (also used as the Windows AppUserModelID; `main/index.ts` calls
  `app.setAppUserModelId` with the same value so taskbar grouping matches the installed shortcuts)
* `build.win.executableName` → `DASH`; OriginalFilename/InternalName are derived by electron-builder (`DASH.exe`)
* `build.win.requestedExecutionLevel` → `asInvoker` (no administrator rights needed)

NSIS (`build.nsis`): not one-click, user can choose the install folder, per-user install (`perMachine: false`, no
admin prompt), Start-menu and desktop shortcuts, and **user data is kept on uninstall** (`deleteAppDataOnUninstall:
false`). Artifact names are pinned to the existing ones: `DASH Setup <version>.exe` and `DASH <version>.exe`.

> **Upgrade note.** Changing `appId` from `com.dash.browser` to `com.bibekbista.dash` changes the installer's
> registry identity. A machine that has the old 0.1.0 build installed will treat the new installer as a *different*
> application (side by side) rather than an in-place upgrade; uninstall the old one first. User data lives in
> `%APPDATA%\DASH` (derived from the product name, unchanged) and is not affected. Since 0.1.0 is pre-release this
> was done now, before any wider distribution.

## 3. Local unsigned builds

```powershell
npm install
npm run dist:win        # NSIS installer + portable exe   -> apps\desktop\release\
npm run dist:portable   # portable only
```

`dist:win` builds the renderer and Electron bundles with Vite, fetches the Windows x64 `better-sqlite3` binary,
runs electron-builder with `--publish never`, and **always restores the local-dev native binary afterwards** (so
`npm run dev` keeps working). Outputs:

* `release\win-unpacked\DASH.exe`
* `release\DASH Setup 0.1.0.exe`
* `release\DASH 0.1.0.exe`

Check the outputs and their embedded metadata:

```powershell
npm run check:artifacts
```

It verifies existence/size and the version-resource strings (company, product, copyright, description). The check is
strict for `DASH.exe`; for the two wrappers a mismatch is only a warning because their template strings have not yet
been confirmed on a real Windows build. It does not check signatures.

## 4. Verifying signatures

```powershell
# Local unsigned build: report honestly, don't fail on "unsigned"
npm run verify:signatures -- -AllowUnsigned

# Specific files (relative to where you run npm); strict: they must be validly signed
npm run verify:signatures -- "signed\*.exe"

# Also require a specific signer text in the certificate subject
npm run verify:signatures -- -ExpectedSigner "SignPath Foundation" "signed\*.exe"
```

With no path it checks `apps\desktop\release\*.exe`. The npm command is a small wrapper that starts PowerShell with
`-ExecutionPolicy Bypass` **for that one process only** (it changes no system or user setting). Without it, Windows'
default policy refuses to run an unsigned `.ps1` that arrived in a zip or download:
*"verify-signatures.ps1 is not digitally signed. You cannot run this script on the current system."*
If you prefer to call the script yourself, either use
`powershell -NoProfile -ExecutionPolicy Bypass -File apps\desktop\scripts\verify-signatures.ps1 -AllowUnsigned <files>`
or run `Unblock-File apps\desktop\scripts\verify-signatures.ps1` once.

For each file it prints status, signer subject, issuer, validity dates, thumbprint and whether the signature is
timestamped, and classifies it as **SIGNED**, **UNSIGNED** (no signature) or **INVALID** (present but not valid).
Exit codes: `0` all good · `1` file missing · `2` unsigned · `3` invalid signature (highest wins).

## 5. Signing status

**Pending.** No certificate exists, nothing is signed, and no unsigned file is described as signed. Windows will show
the "unknown publisher" style warnings for these builds.

### Signing architecture

DASH uses **SignPath** as the signer; DASH's repository never holds a certificate or private key. The signing key
stays inside SignPath; the workflow only sends a build for signing and receives signed files back.

```
tag vX.Y.Z on main
   │
   ▼
build job   (read-only token, no secrets)   unsigned installer + portable → uploaded artifact
   │
   ▼
sign job    (environment "windows-signing" = manual approval; the only job with SIGNPATH_API_TOKEN)
   │         submits the artifact to SignPath, waits, downloads the signed files
   ▼
publish job (the only job with contents: write)  verify-signatures.ps1 must pass → GitHub release
```

If signing is not enabled, the run stops after `build` and publishes nothing.

### SignPath Foundation eligibility (read before applying)

> **Update:** DASH is source-available (see `LICENSE`) but not OSI-approved open source, so it does not qualify for SignPath Foundation. This section is kept for reference. Signing now needs a paid certificate or signing service.

Based on the SignPath Foundation terms (<https://signpath.org/terms>), which you should re-read before applying:

* **Open source:** all components must be under an **OSI-approved open-source license**, no proprietary parts.
  **DASH's repository currently declares no license, so it does not meet this today.** Choosing a license is your
  decision; this project has not picked one for you.
* The project must be actively maintained and **already released** in the form to be signed, with its
  functionality documented on the download/release page.
* A **code signing policy** must be linked from the home page and download page, include the line *"Free code signing
  provided by SignPath.io, certificate by SignPath Foundation."*, list the team roles (committers, reviewers,
  approvers), and include a **privacy statement**. DASH has no telemetry and no accounts; its only optional network
  feature of its own is the opt-in update check against an https address the user types — say so accurately.
* The certificate is issued to SignPath Foundation, not to you. Binaries' product name metadata should be the
  project name ("DASH") with a consistent product version.
* Acceptance is at SignPath Foundation's discretion. The application form is linked from <https://signpath.org/>.

### Steps to apply and activate

1. Add an OSI-approved `LICENSE` to the repository, publish a release, and add the code-signing-policy section.
2. Apply to SignPath Foundation via <https://signpath.org/>.
3. If approved, in SignPath: use the predefined **GitHub.com** trusted build system, add it to your organization and
   link it to the DASH project (<https://docs.signpath.io/trusted-build-systems/github>).
4. Create an **artifact configuration** from `signing/signpath/artifact-configuration.xml` (root `<zip-file>`; signs
   `*.exe`) and a **signing policy** (e.g. `release-signing`).
5. Create an API token for a user who has *submitter* permission on that project and policy.
6. In GitHub → Settings:
   * **Secret** (environment `windows-signing`): `SIGNPATH_API_TOKEN`
   * **Variables**: `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`
     (optional: `EXPECTED_SIGNER_SUBJECT`, e.g. `SignPath Foundation`)
   * **Environment** `windows-signing` with required reviewers
   * **Tag ruleset** protecting `v*` tags (only maintainers may create them)
   * Finally set the variable `SIGNPATH_SIGNING_ENABLED` = `true`
7. If your repository is private, default token permissions are read-only and the SignPath GitHub App is not
   installed, SignPath's page says to give the sign job `actions: read` and `contents: read` — the workflow already
   does.

The names above (`SIGNPATH_API_TOKEN`, the action inputs) come from SignPath's GitHub integration page
(<https://docs.signpath.io/trusted-build-systems/github>) and the action `signpath/github-action-submit-signing-request`.
Everything else (`SIGNPATH_SIGNING_ENABLED`, `EXPECTED_SIGNER_SUBJECT`, `windows-signing`) is DASH's own naming.

## 6. GitHub Actions workflow

`.github/workflows/windows-release.yml` triggers on pushed tags `vX.Y.Z` (and manual runs, which can only build).
It is never triggered by pull requests, so untrusted code never runs next to signing credentials.

Security properties:

* `permissions: {}` at workflow level; `build` has `contents: read`; `sign` has `actions: read`, `contents: read` and
  the environment secret; `publish` alone has `contents: write`.
* Tag must be on `main` and equal `v<package version>`.
* Reproducible install with `npm ci` (npm + `package-lock.json`), Node `22.16.0`, Windows x64 runner.
* Signing needs a human approval (environment reviewers); publishing needs a passing strict signature check.
* Only the signed files plus `SHA256SUMS.txt` are attached to the release. `latest.yml` is intentionally not published
  by this workflow (its hashes would describe the unsigned files).

**Action pinning — still to do.** Actions are referenced by version tag (`actions/checkout@v4`,
`actions/setup-node@v4`, `actions/download-artifact@v4`, `actions/upload-artifact@v7`,
`signpath/github-action-submit-signing-request@v3`; the last two tags are the ones SignPath's page shows). Commit-SHA
pinning is stricter, but SHAs could not be looked up from the environment this was prepared in, and none were
invented. Before the first real release, replace each tag with its verified commit SHA (keep the tag in a comment).

## 7. Release procedure

1. Bump `version` in `apps/desktop/package.json` (and the root, if you keep them aligned); commit to `main`.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The `build` job runs; with signing enabled, approve the `windows-signing` environment when asked.
4. `publish` verifies signatures and creates the release. Without signing enabled, download the
   `dash-windows-unsigned` artifact from the run if you need the files — and describe them as unsigned.
5. Download from the release and run `verify-signatures.ps1` once yourself.

## 8. Certificate security

* Never commit `.pfx`, `.p12`, keys or passwords (`.gitignore` blocks the common extensions). With SignPath the key
  never leaves SignPath; DASH holds only an API token, stored as an environment secret.
* The API token is scoped to submitting requests; rotate it if it may have leaked.
* Keep the approval environment and tag ruleset on; they are what stop a stolen push credential from producing a
  signed release.
* Never claim signing, SmartScreen reputation, certification or an audit that does not exist.

## 9. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `dist:win` fails fetching the SQLite binary | Network/proxy; run `npm run native:electron` later. The dev binary is restored automatically even on failure. |
| `npm run dev` crashes on SQLite after a failed dist | `npm run native:electron` |
| Tag build fails "not on main" | Tag the commit on `main`. |
| Tag build fails "does not match version" | Bump `apps/desktop/package.json` to the tag's version. |
| Sign job skipped | Not a tag run, or `SIGNPATH_SIGNING_ENABLED` is not `true`. |
| SignPath rejects the request | Check the trusted build system is linked to the project, the token user is a submitter, and the artifact configuration root is `<zip-file>`. |
| "verify-signatures.ps1 is not digitally signed" | PowerShell execution policy. Use `npm run verify:signatures -- ...` (see section 4). |
| `verify-signatures.ps1` exits 2 | The file is unsigned (expected for local builds; use `-AllowUnsigned`). |
| Exit 3 | Signature present but invalid: file modified after signing, untrusted chain, or wrong `-ExpectedSigner`. |
| Windows warns about an unknown publisher | Expected for unsigned builds. A signature alone does not guarantee SmartScreen reputation either. |
| Installer shows old and new DASH | The `appId` change; uninstall the old 0.1.0 build once. |
