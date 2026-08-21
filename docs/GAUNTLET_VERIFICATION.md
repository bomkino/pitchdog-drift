# Director’s Cut verification

This file pins the final verification pass to the draft pull-request branch. It is not an approval to merge.

## Exact-head checks

- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- `npm run test:e2e`
- all authored film worlds reachable through the interface
- a single healthy WebGL canvas after repeated world changes
- accessible names on interactive controls
- phone-width containment
- reduced-motion usability
- 18 portrait world captures at 1080×1920 composition
- six representative landscape captures at 1920×1080 composition
- non-blank render and pairwise-distinction checks
- delivery workflows and payload scaffolding absent from the feature head

## Merge gate

Keep the pull request in draft. Do not merge until repository CI passes against the commit containing this document and the visual evidence has been reviewed by a human.
