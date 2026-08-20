# Contributing

Drift welcomes bug reports, tests, accessibility work, performance repairs, shader experiments, and new motion worlds that keep slides legible.

## Before opening work

1. Search existing issues.
2. For a large feature, open a short proposal describing the user outcome, failure boundary, and verification plan.
3. Never attach a confidential pitch deck, client video, portable project, browser profile, or rendered client master to a public issue.

## Local checks

```bash
npm ci
npm run check
npm run test:e2e
```

Pull requests should explain what changed, what was directly checked, and what remains uncertain. Visual work should include before/after evidence using non-confidential media. Export changes need decoded artifact evidence, not only unit mocks.

## Design constraints

- Preserve the pure time-based evaluator and fixed-step output.
- Keep missing capabilities visible. Do not silently fall back to a lower-fidelity export.
- Keep user media local and remove any network dependency from the core path.
- Treat themes as coherent motion/palette/surface bundles, not colour swaps.
- Bound distortion and preserve deck readability.
- Add controls only when they affect the rendered or exported artifact.

By contributing, you agree that your contribution is licensed under GNU AGPL-3.0-or-later; contributed original demo artwork is CC BY-SA 4.0.
