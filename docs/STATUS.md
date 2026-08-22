# Project status

Drift is **pre-1.0**. The public repository is source-first: a build, CI artifact, pull request, local app, or disk image is evidence about one candidate, not a public release.

This is the durable status source. Dated QA documents remain exact-snapshot receipts and should not be stretched to cover later commits.

## Current publication state

| Surface | Status | Boundary |
| --- | --- | --- |
| Default `main` branch | Public source of record | Only commits reachable from the public default branch are merged source. A local checkout, pushed branch, or pull request is candidate work. |
| Browser studio | Public source with a commit-bound Chrome QA receipt | [`QA_REPORT.md`](QA_REPORT.md) records the exact source fingerprints, browser, checks, and decoded outputs it covered. Later changes need fresh evidence. |
| Standalone macOS app | Local and CI candidate lanes exist | A locally built `Drift.app` or DMG is normally ad-hoc signed and is for development or testing. Its exact build receipt decides what was verified. |
| Git tag or GitHub Release | Not published | The project currently has no public tag or GitHub Release. |
| Developer ID / notarized download | Not published | No signed-and-notarized Drift binary is offered for download. See the separate [`MACOS_RELEASE.md`](MACOS_RELEASE.md) gates. |
| npm package | Not published | `package.json` is private; the repository does not claim an npm distribution. |

## Verified and unverified boundaries

Verified claims must name the exact source revision or source fingerprint and the surface that was inspected. In particular:

- the checked-in browser QA receipt proves its frozen Chrome run and decoded artifacts, not every later commit or browser;
- the macOS build and verification scripts define repeatable gates, but their presence does not prove that an app or DMG from the current checkout passed them;
- an ad-hoc signature proves local bundle integrity at its narrow boundary, not developer identity, notarization, Gatekeeper acceptance, or publication;
- Brave, other browsers, physical Intel hardware, full accessibility review, long-form exports, removable-volume failures, and a clean-machine notarized install remain unverified unless an exact receipt says otherwise.

## Status vocabulary

- **edited**: files differ from a commit.
- **built**: a command produced an artifact.
- **verified**: current evidence supports the named claim for the exact source and artifact.
- **merged**: the public target branch contains the commit.
- **tagged**: a Git tag points to the commit.
- **released**: the public release surface has a release record.
- **artifact published**: the intended download is present on that surface.
- **notarized**: Apple accepted the exact submitted artifact and its ticket was stapled and validated.

These states do not imply one another. Update this page in the same reviewed change that alters Drift's public maturity or distribution state.
