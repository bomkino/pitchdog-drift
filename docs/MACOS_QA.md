# Native Mac QA

`npm run check` validates authored source regressions and publisher contracts. `npm run test:mac` runs the actual DriftCore/DriftNative integration on a full-Xcode Apple silicon host. Native codec and archive libraries are built from pinned sources.

`run-native-ui-proof.py` drives the exact archived bundle through external XCUITest. It exercises actual NSDocument open, Save/Save As, dirty Cancel/Don't Save/Revert, private recovery, stale completion rejection, independent-document export ownership, latest scrub, Metal preview, source-loop output, transparent wide PNG, PNG sequence and decoded AAC alignment. Light/Dark screenshots capture the actual Metal window while scene pixels and document state must remain unchanged. The returned receipt binds source, version, build and code-directory hash.

`test-native-release.py` exercises immutable release IDs/drafts/public retries, missing/corrupt assets, source/tag disagreement, cancelled Quit, staged verification failure, restart, rollback, symlink targets, concurrent locks and interrupted replacement. Installer transaction tests use disposable directories and injected boundary failures; the separate mounted-DMG check validates the real signed bundle.

CI `verify` requires source, complete native integration and the application/installer lane. The signed optional release lane has additional Developer ID/notary/stapler/Gatekeeper checks and cannot skip tests.

Before delivery, inspect synthetic frames and real running-window screenshots, open a native project on a Mac with older Drift registrations, play/pause/scrub, export and reopen, and verify downloaded public bytes. Never infer visual success from a green build or `NSView.cacheDisplay`, which can omit Metal content.

Physical M2/M1 Pro, macOS 13.3, memory pressure, long mixed-media sessions, battery/thermal behavior, sleep/wake, external displays, Retina changes, VoiceOver and keyboard-only coverage require explicit observations. A hosted runner does not certify them. Record actual results and outstanding limits in the single `STATUS.md` ledger; do not turn missing hardware into a waiver for a known code or output failure.

## Retained creative consumers

| Authored class | Native consumer and decisive acceptance |
| --- | --- |
| Worlds, arrangements, pressure, Recut | `DriftProject.applyWorld` preserves canvas/locked domains; all 72 World frames rendered distinctly on the physical M2. |
| Path, cadence, performance, character, directing | `BaseTimeline`, `AuthoredMotion`, `FramePlan`: analytical travel, held poses and finite cue schedule; path/performance changes produce different rendered pixels. Explicit body/pass/reading duration owns speed. |
| Card, material, finish, lighting | `FramePlan.styled/movingPoses`, `NativeRenderer.card`: fitting, source crop, corner/border/shadow, flex/depth shell, surface, roughness, sheen, microtexture and lighting uniforms. Asymmetric quadrant/crop pixels guard orientation. Import maps authored cover/contain to native Fill/Fit. |
| Atmosphere and optics | `NativeRenderer.background/lens`, translated authored shaders: composition/color/intensity/motion/grain/vignette and lens focus/smear/chromatic/bloom/halation/flare/curvature/weave. Controlled comparisons alter pixels; protected Pin remains unchanged. All 67 reflected uniforms have assignments. |
| Recorded sound | `SoundTrack` schedules licensed source PCM from the native plan; preview and output share the mixer. Decoded AAC and actual AVAudioEngine pause/resume/seek/Look-edit checks are separate acceptance boundaries. |

Catalog labels and historically unconsumed placeholders remain serialized but are not presented as functional native sliders. This includes finish registration/local-softness/local-smear; unused lighting attachment/spill/gobo/breath fields; atmosphere treatment/presence metadata; and interface-sound level. They have no retained renderer consumer. Recipe selection still applies its implemented values. New effects for those placeholders are deferred expansion, not claimed parity. Frame timing, World/Recut, background studies and recipe menus own their respective operations.
