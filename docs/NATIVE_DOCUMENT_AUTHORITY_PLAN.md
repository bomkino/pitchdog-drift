# Native Document Authority Plan

Status: design scratchpad for a stacked draft. This file is intentionally temporary until the implementation is proven.

## Problem

The app compiles `NativeDocumentSession.swift`, but the production bridge does not yet bind messages or native-panel completions to one local document generation. URL and main-frame validation remain necessary, but they do not distinguish a stale pre-reload document from the replacement document at the same trusted `file:` URL.

## Invariants

1. Each local document creates one cryptographically random canonical UUID nonce.
2. `runtime-info` claims that nonce exactly once and revokes all prior native capabilities.
3. Every later bridge message carries and validates the same nonce.
4. A replacement document invalidates the old nonce before it can obtain new grants.
5. Native-panel completion is accepted only for the document that opened the panel.
6. Reload, failed navigation, WebContent termination, window close, and quit invalidate document authority and abort staged writes.
7. The native gauntlet proves duplicate bootstrap rejection, stale-message rejection, stale-panel rejection, panel cancellation, and explicit invalidation.

## Delivery boundary

This work remains stacked on `feat/native-macos-studio`, draft-only, and unmerged. The temporary plan should be removed once the implementation and checks carry the contract themselves.
