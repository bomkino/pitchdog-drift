# Mega Main architecture decisions

## ADR-001 — Native-first product boundary

**Decision:** Drift 1.0 is a Mac document application containing a shared TypeScript/Three.js creative engine. The browser build remains supported but does not dictate storage, codec or lifecycle architecture.

**Reason:** document identity, atomic Save, Finder permissions, recovery, sandboxing, codec policy and app lifecycle affect the whole system and cannot be safely bolted on after visual feature integration.

## ADR-002 — One classic boot-critical Mac entry

**Decision:** the signed Mac bundle contains one classic IIFE application script with code splitting disabled. Large non-boot assets may remain separate and lazy.

**Reason:** the deterministic WKWebView export probe already succeeds with this topology while the production ES-module graph fails to mount reliably from the packaged `file:` runtime. The exact production app must not evade this test.

## ADR-003 — One project truth

**Decision:** one validated immutable Project V3 object is authoritative. Session UI, preview quality, file capabilities, audio unlock and native lifecycle state remain outside it.

## ADR-004 — One explicit frame evaluator

**Decision:** project + ordered assets + exact time produces one `FrameEvaluation`. Preview supplies a preview time. Export supplies `frameIndex / fps`. Lighting, atmosphere, lens, presenter and sound consume that evaluation rather than inventing clocks.

## ADR-005 — One semantic event spine

**Decision:** focus hand-off, impact, passage, grab, release, settle, loop and master-boundary events are emitted from the canonical evaluator. Sound and diagnostics consume these events; they do not reconstruct crossings independently.

## ADR-006 — One render graph

**Decision:** path owns placement; material owns deformation and physical response; lighting owns illumination and shadows; atmosphere owns the stage field; lens owns scene-wide camera response; output owns the single colour transform. Duplicate owners are removed.

## ADR-007 — Preview physics and export performance are separate implementations

**Decision:** the same creative motion character configures a stateful fixed-substep interaction solver and a pure analytical output envelope. Preview history can never alter an export.

## ADR-008 — Real Mac documents

**Decision:** `.pitched` files retain associated Finder identity, native dirty state, Save, Save As, Revert and external-change protection. Recovery never marks the document clean.

## ADR-009 — Streaming project and audio paths

**Decision:** serious projects and audio are processed in bounded chunks. Whole-project ZIP duplication and whole-master PCM accumulation are transitional constraints, not Drift 1.0 architecture.

## ADR-010 — Evidence before merge

**Decision:** donor branches remain immutable references. Capabilities are ported with source SHA, accepted semantics, reworked boundaries, rejected debris and parity evidence recorded per commit.
