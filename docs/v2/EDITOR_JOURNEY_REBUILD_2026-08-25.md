# Drift editor-journey rebuild

Date: 25 August 2026  
Implementation commit: `8efe4b92d2dac26276b22a23100ecfd32a82899a`  
Packaged candidate proved from that commit: Drift `0.1.0` build `332`, universal `arm64` + `x86_64`

This is a product decision record and a bounded verification receipt. It does not claim that the commit is merged, pushed, installed, notarised, published, or owner-approved.

## Outcome

The product foundation did not require replacement. The deterministic renderer, project model, and native shell remained valuable; the editor had allowed implementation domains to become its information architecture. Too many controls competed for first attention, presets mixed unrelated meanings, the Inspector changed shape and position while the user was reading it, and the timeline's authority was hard to see.

The repair was therefore structural, not a new coat of CSS:

- one journey: **Slides → Look → Motion → Export**;
- one persistent live Stage;
- one persistent visual Timeline;
- one stable Inspector whose four panes remain mounted and remember their own scroll positions;
- one prominent safe motion default;
- explicit source-artwork fidelity;
- outcome recipes that own a legible sequence instead of fighting hidden speed fields;
- truthful export phase, frame count, elapsed time, throughput, ETA, verification, finalisation, and cancellation.

Advanced capabilities remain. They are now downstream of a coherent first result.

## Information architecture

| Room | Question it answers | First useful decision |
| --- | --- | --- |
| **Slides · Deck** | What is moving, and what stays still? | Add/order slides; optionally pin one frame. |
| **Look · World** | What surrounds the deck, and must the artwork stay literal? | Choose a visual background; confirm source fidelity. |
| **Motion · Flow** | How should the deck move and read? | Apply Clean Carousel or another outcome recipe. |
| **Export · Output** | What exactly will be delivered? | Resolve preflight; choose output; export. |

The Media rail, Stage, Timeline, and Inspector preserve their geometry when the room changes. The inactive Inspector panes are `aria-hidden` and inert, but they are not unmounted. A tab click keeps focus. Every room restores its exact prior scroll position.

## The safe default

**Apply clean carousel** is the strongest recovery action and the intended first run:

- smooth, continuous cadence;
- one readable pass at 0.90 seconds per slide;
- shallow ribbon path with restrained physical response;
- entry and exit off;
- slide artwork switched to Literal source pixels;
- existing media, order, background, stage geometry, axis, direction, and pin placement preserved.

The action is deliberately narrower than a World preset. It makes movement and source fidelity safe without repainting the user's composition.

## Source-pixel truth

The Look room always exposes one of two states:

- **Protected artwork** blocks slide-face relighting. A chosen lens or local finish may still affect the result.
- **Literal source pixels** also removes lens, finish, border, and local slide treatment.

**Make literal** repairs the washed-out or strangely lit slide failure without flattening the surrounding WebGL world. Grain remains world-only. Imported slides and presenter pixels do not receive the animated grain plate.

## Motion and timeline authority

The app distinguishes four concepts that were previously easy to conflate:

1. **Cadence** — continuous glide or authored pose sampling such as 12 fps.
2. **Motion feel** — spring, inertia, depth, curvature, bend, and related physics.
3. **Sequence** — the ordered fast/read blocks and complete deck passes.
4. **Delivery length** — content-paced duration or an exact requested duration.

When a sequence owns timing, incompatible free-run speed and pass controls are hidden. The Timeline shows the active blocks and their proportional duration. The playhead is draggable and keyboard-operable; current and total time remain visible.

**Casino Reveal** is content-paced by default:

```text
FAST ×2 → READ ×1 → FAST ×1
```

Each fast pass uses 0.22 seconds per slide. The readable pass uses 0.90 seconds per slide. Drift multiplies those passes by the admitted moving-slide count, so the result always ends on a complete deck cut. Eight slides resolve to 11.952 seconds; seven to 10.458; six to 8.964. Exact Length remains available when a fixed delivery runtime should fit the authored sequence.

## Pinned frame

Pinning is optional and off by default. The first controls are safe placement: membership, overlay/in-scene behaviour, size, X/Y position, and safe inset. Crop, shape, focal point, matte, border, corners, and shadow sit under Advanced. Pinning after a custom Look no longer invalidates the visual timeline.

## Interaction and motion polish

- Touch targets use a 44 px minimum where repeated actions previously became tiny marks.
- Media filenames keep readable width; reorder, pin, and remove actions sit in a consistent row.
- Measured disclosures animate their real height over 240–420 ms, retarget correctly when interrupted, and do not snap to an arbitrary maximum height.
- Tooltips cap at 260 px, detect available edges, dismiss on pointer exit or click, and remain available from keyboard focus.
- The active room tab is disabled without being replaced, preserving focus and eliminating a real tab-click focus regression.
- Notices no longer displace the timeline.

These decisions reduce interface jerk without adding decorative motion. macOS Reduce Motion can suppress preview transitions; it does not silently rewrite the saved export motion.

## Export truth

The progress overlay no longer treats a percentage as sufficient evidence. It reports the current phase and, when available:

- `Frame N of M`;
- elapsed time from the start of work;
- measured throughput;
- ETA only after enough real samples exist;
- verification and native destination-finalisation phases after rendering;
- responsive cancellation and explicit cleanup.

The final few percent may take longer than one rendered frame because Drift reopens and verifies the MP4, then commits a staged native destination. The phase label and timers remain alive during that work; `3%` is no longer the only explanation on screen.

## Verified evidence for implementation commit `8efe4b9`

- `npm run check`: 69 test files, 495 unit/integration tests, TypeScript, native source contracts, hardening checks, and production Web build passed.
- Production browser bundle: 19 journeys passed; one screenshot-only case remained intentionally skipped.
- V2 UI matrix: 10/10 journeys passed across production and V2-development identities.
- Dedicated journeys passed for Clean Carousel source fidelity, Casino content pacing, source-proof rendering, animated world grain isolation, visual background browsing, disclosure interruption, tooltip placement, stable workspace geometry, and exact per-room scroll restoration.
- A direct 1440 × 900 visual review covered Slides, Look, Motion, and Export.
- Clean detached worktree `/tmp/drift-release-candidate.bDekwj` built the exact commit with a clean index and `npm ci` reporting zero vulnerabilities.
- The universal packaged app passed signature, manifest, native bridge, document, import, save, recovery, Finder, codec, sandbox, and normal LaunchServices-window checks.
- All three packaged WebKit matrix variants completed the product lifecycle: production sandboxed, unsandboxed diagnostic control, and self-signed sandbox control. Network probes observed zero accepted TCP requests and zero WebRTC/STUN token hits.
- The full headed-Chrome long-export lane passed in 3.8 minutes. It physically encoded, reopened, and verified 30-second/8-slide (720 frames), 60-second/40-slide (1,440 frames), and 180-second/200-slide (4,320 frames) H.264 cases at deliberately small dimensions. All were opaque BT.709, decoded three probe frames, retained one WebGL context, returned texture/decode state to zero, and stayed below the 32 MiB heap-return allowance. Cancellation at frame 12 returned no artifact. Receipt source fingerprint: `a407f013d00285a472c1228991c0aa3e6d97acdff05437330f3ab7c701154d0a`.

This long-export lane does not prove 1080p or 4K long-export throughput, physical Intel behaviour, encoder behaviour outside the tested headed-Chrome lane, or diverse source-image decode cost.

## Remaining gates

Before replacing the installed app or changing `main`:

1. finish current documentation and rebuild from the resulting exact commit;
2. verify the DMG and the rebuilt app's source revision, signature, architectures, and hashes;
3. preserve the known-good installed app, then install the candidate to `/Applications/Drift.app`;
4. verify direct-executable launch and LaunchServices/Finder launch independently;
5. read back the installed UI and an ordinary committed export;
6. fetch GitHub state, merge and push only if the exact final commit and CI gates hold.

Developer ID signing, notarisation, public binary publication, physical Intel testing, and owner taste approval remain separate states.
