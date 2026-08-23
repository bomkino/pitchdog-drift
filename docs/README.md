# Drift documentation

Drift’s documentation is evidence-shaped. Product intent, current status, dated test receipts, and release authority are different things; this map keeps them from collapsing into one impressive-looking but false story.

## Start here

| Question | Source of truth |
| --- | --- |
| What is Drift and how do I run it? | [`../README.md`](../README.md) |
| What is public, verified, or still unreleased? | [`STATUS.md`](STATUS.md) |
| How is the repository divided? | [`REPOSITORY_MAP.md`](REPOSITORY_MAP.md) |
| What must the product never fake? | [`PRODUCT_CONTRACT.md`](PRODUCT_CONTRACT.md) |
| How do I use the Mac app? | [`MACOS_USER_GUIDE.md`](MACOS_USER_GUIDE.md) |
| What work is genuinely next? | [`ROADMAP.md`](ROADMAP.md) |

## Understand the system

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — deterministic renderer, project, storage, and export boundaries.
- [`MACOS_APP.md`](MACOS_APP.md) — the narrow AppKit/WebKit shell and typed bridge.
- [`MACOS_PRODUCT_CONTRACT.md`](MACOS_PRODUCT_CONTRACT.md) — native behavior that must hold.
- [`MACOS_THREAT_MODEL.md`](MACOS_THREAT_MODEL.md) — assets, attackers, countermeasures, and residual risk.
- [`RESEARCH.md`](RESEARCH.md) — references and principles, not cloned compositions.
- [`CODEX_BUILD_STORY.md`](CODEX_BUILD_STORY.md) — how the project uses Codex without outsourcing taste or manufacturing proof.

## Build, test, and contribute

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — contribution contract and local checks.
- [`MACOS_QA.md`](MACOS_QA.md) — native/browser gauntlet and physical journeys.
- [`MACOS_CI_EVIDENCE_BUDGETS.md`](MACOS_CI_EVIDENCE_BUDGETS.md) — bounded public CI evidence.
- [`MACOS_RELEASE.md`](MACOS_RELEASE.md) — source-to-release state machine.
- [`MACOS_RELEASE_CHECKLIST.md`](MACOS_RELEASE_CHECKLIST.md) — exhaustive release checklist, not a current completion claim.
- [`../SECURITY.md`](../SECURITY.md) — private reporting and supported surfaces.

## Snapshot evidence and historical construction

[`QA_REPORT.md`](QA_REPORT.md), [`UNTIL_IT_HOLDS.md`](UNTIL_IT_HOLDS.md), and dated files under [`v2/`](v2/) are receipts for named commits, artifacts, or development identities. They do not automatically describe a later `main`.

The [`mega-main/`](mega-main/) documents preserve architecture decisions from the native consolidation. They remain useful provenance, but current behavior is governed by the root contracts and current source.

When a statement conflicts, prefer the narrowest current source: validated code and artifact evidence, then `STATUS.md` and product contracts, then dated receipts, then historical plans.
