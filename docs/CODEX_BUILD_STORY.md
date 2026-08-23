# Building Drift with Codex—without outsourcing taste

Drift is an AGPL-licensed, local-first motion studio. It turns private pitch-deck slides into deterministic WebGL compositions and verified media without requiring an account or uploading the work. Codex helped build it, but “AI-built” is not the product claim. The claim is narrower and more useful: a human can hold art direction while agents carry a large proof burden across React, Three.js, GLSL, WebCodecs, AppKit, WebKit, AudioToolbox, packaging, and documentation.

## The division of labour

The maintainer owns the reason for the tool, the taste bar, protected material, product defaults, scope, and every merge or publication decision. Codex can inspect, research, implement, run adversarial checks, compare independent audits, and keep evidence tied to exact source.

That division matters. An agent is good at finding that a command palette collects no parameter, a native callback can race persistence, or an encoder ignores a saved field. It cannot decide whether a carousel has longing, whether grain feels dead, or whether a border turns a slide into cheap UI chrome. Those are human judgments, tested on the actual image rather than translated into fake numerical “quality” scores.

## What agentic development made possible

Drift crosses surfaces that usually drift apart:

1. A Project V4 document is validated and migrated without silently flattening authored direction.
2. Preview and export evaluate the same scene at explicit time; frame `n` is rendered at `n / fps`.
3. Browser output is reopened and decoded before success.
4. The native shell grants bounded Finder access, stages replacement on the destination volume, and commits only after verification.
5. The Mac build substitutes Apple’s AudioToolbox AAC path and proves the shipped bundle contains no browser codec WebAssembly.
6. CI records the exact checkout identity and keeps local build, tested candidate, merge, notarization, and public release as separate states.

Codex was useful because it could follow one causal thread through all six layers, then add a regression at the layer that owns the truth. The resulting tests are not a scoreboard: they are executable explanations of failure boundaries.

## The gauntlet

A candidate is challenged in progressively more expensive lanes:

- schema, timeline, geometry, projection, persistence, export, and security unit tests;
- TypeScript and source-contract checks;
- real Chromium journeys for imports, recovery, WebGL context loss, portability, alpha, cancellation, and encoded output;
- Swift compilation and native broker self-tests;
- packaged WKWebView probes for WebGL, H.264, AudioToolbox AAC, and deterministic MP4/PNG output;
- bundle, entitlement, manifest, licence, architecture, and signature readback;
- human visual and journey review.

Each lane can disprove a specific claim. None can promote source, install an app, notarize a binary, or manufacture visual approval by itself.

## What we learned

- Configuration is not honesty. If the encoder is fixed at 16 Mbit/s, accepting 44 Mbit/s in a project is a bug even if every export test passes.
- A status label and the pixels must share authority. Restoring UI state after export without restoring WebGL state creates a polished lie.
- Privacy includes boring logs. A sandboxed app can still leak a client filename through `localizedDescription`.
- Accessibility should explain the medium, not abolish it. macOS Reduce Motion may hold the live preview, while the saved Master setting remains the explicit export decision.
- Visual defaults need authorship. Drift’s slides are borderless by default; grain belongs to the world, not the client’s artwork; shadows follow the rounded card instead of drawing a translucent rectangle.

## Open-source value

Drift is young and does not claim a mature downstream ecosystem. Its present value is as working public infrastructure and a falsifiable reference: local-first creative tooling, deterministic browser video, portable media projects, narrow native capability bridges, and an evidence-led Mac release path can coexist in one readable codebase.

The project is open so other people can fork the engine, inspect the security boundary, challenge the tests, contribute worlds or failure cases, and reuse the hard-won patterns without surrendering their private media to a service. See the [`ROADMAP.md`](ROADMAP.md), [`CONTRIBUTING.md`](../CONTRIBUTING.md), and [`SECURITY.md`](../SECURITY.md) for the work and its boundaries.
