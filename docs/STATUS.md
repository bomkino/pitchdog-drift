# Project status

Drift is **pre-1.0** and source-first. This tree identifies the `v0.2.1` source-release line, dated 30 August 2026. A version string, changelog entry, build, CI artifact, pull request, local app, or disk image does not by itself make that release public.

This is the durable status source. Dated QA documents remain exact-snapshot receipts and should not be stretched to cover later commits.

## Current publication state

| Surface | Status | Boundary |
| --- | --- | --- |
| Default `main` branch | Public source of record | Only commits reachable from the public default branch are merged source. A local checkout, pushed branch, or pull request is candidate work. |
| `v0.2.1` source line | Versioned by this tree | It is public only when the matching tag and GitHub Release exist. It contains no downloadable Mac binary. |
| `v0.2.0` source release | Public source record | It contains no downloadable Mac binary and remains historical evidence after a newer release is published. |
| Historical `v0.1.0` release | Public, superseded source/download record | Its Apple-Silicon DMG is ad-hoc signed and unnotarized. It is historical test material, not a supported or Gatekeeper-ready binary. |
| Browser studio | Public source with a commit-bound Chrome QA receipt | [`QA_REPORT.md`](QA_REPORT.md) records the exact source fingerprints, browser, checks, and decoded outputs it covered. Later changes need fresh evidence. |
| Standalone macOS app | Local and CI candidate lanes exist | A locally built `Drift.app` or DMG is normally ad-hoc signed and is for development or testing. Its exact build receipt decides what was verified. |
| Developer ID / notarized download | Not published | No signed-and-notarized Drift binary is offered for download. See the separate [`MACOS_RELEASE.md`](MACOS_RELEASE.md) gates. |
| npm package | Not published | `package.json` is private; the repository does not claim an npm distribution. |

## `v0.2.x` interface system

- FontBlind v13 is the default interface type, using seven locally bundled CC0 WOFF2 binaries from [`bomkino/pitchdog-type-system`](https://github.com/bomkino/pitchdog-type-system) release `v13.0.0`, exact commit `786b4a2b671182319320f922b8de8f927ea3a002`.
- Phosphor Icons for React is pinned at `2.1.10` for interface iconography.
- Shared spacing, panel-padding, control-height, and gap rules were audited across Media, Stage, Timeline, Director, notices, menus, disclosures, and high-scale reflow.
- The `v0.2.1` fit-and-motion pass aligns carets, icons, labels, and button contents; stabilizes compact/high-scale overflow; and gives measured disclosures shorter direction-aware motion with keyboard and reduced-motion fallbacks.

## Verified and unverified boundaries

Verified claims must name the exact source revision or source fingerprint and the surface that was inspected. In particular:

- the checked-in browser QA receipt proves its frozen Chrome run and decoded artifacts, not every later commit or browser;
- the macOS build and verification scripts define repeatable gates, but their presence does not prove that an app or DMG from the current checkout passed them;
- an ad-hoc signature proves local bundle integrity at its narrow boundary, not developer identity, notarization, Gatekeeper acceptance, or publication;
- Brave, other browsers, full accessibility review, long-form exports, removable-volume failures, and a clean-machine notarized Apple Silicon install remain unverified unless an exact receipt says otherwise. Intel Macs and Windows are outside the maintained Mac target.

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
