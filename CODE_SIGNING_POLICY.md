# DASH code signing policy

**Status: not signed yet.** DASH's Windows installer and portable executable are currently **unsigned**. This page
describes the policy that will apply once code signing is in place. Nothing below is a claim that signing already
exists.

## Signing provider

DASH is source-available but not open source as the Open Source Initiative defines it, so the free SignPath Foundation
programme, which is for open-source projects, is not available. Signing now needs a paid certificate or a paid signing service. No provider has been chosen and no release
is described as signed. When one is chosen, this section names it and the certificate holder.

## What gets signed

Only artifacts built from this repository's source by the public GitHub Actions workflow
`.github/workflows/windows-release.yml`:

* `DASH Setup <version>.exe` (installer)
* `DASH <version>.exe` (portable)

Nothing built on a developer's own machine is submitted for signing. Pull requests never run the signing workflow.

## Roles

DASH currently has one maintainer, who holds all roles:

| Role | Person |
|---|---|
| Committer and reviewer | Bibek Bista (<https://github.com/bibekbista0405>) |
| Approver of each signing request | Bibek Bista |

Each signing request needs manual approval in the `windows-signing` GitHub environment. If more maintainers join, this
table is updated.

## Rules for signed releases

* Releases are built from a version tag (`vX.Y.Z`) that points at a commit on `main`; the tag must match the app
  version.
* The signing key is never in the repository or on the developer's computer; signing happens at the provider.
* After signing, the workflow verifies the Authenticode signatures and only then publishes the release.
* DASH is source-available and free to use. It does not contain malware or
  telemetry, and it does not change system settings beyond installing itself.

## Privacy

See [PRIVACY.md](PRIVACY.md). DASH collects no data; the only network connections it makes by itself are listed there.

## Reporting a problem with a signed build

Open an issue at <https://github.com/bibekbista0405/Dash-Browser/issues>, or follow [SECURITY.md](SECURITY.md) for a
security problem.
