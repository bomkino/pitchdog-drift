# Drift V2 installed checkpoint receipt

Evidence captured: 22 August 2026

Verified implementation source: `b7bb5a520a23755306bf2f07656f604fd90b7b65`

Installed application: `/Applications/Drift V2 Dev.app`

Bundle identifier: `dog.pitch.drift.v2.dev`

## What holds

The isolated V2 development application was built from the exact implementation source above, packaged, copied into `/Applications`, compared byte-for-byte with the candidate bundle, and verified again in place.

| Gate | Evidence | Verdict |
| --- | --- | --- |
| Unit suite | `245/245` | HOLD |
| TypeScript | typecheck passed | HOLD |
| Mac source contracts | passed | HOLD |
| Native authority gauntlet | freshly compiled and passed | HOLD |
| Targeted browser repair rerun | Project V4 first-pin, export lifecycle, and straight-alpha transparent PNG passed (`3/3`) | HOLD |
| Packaged WKWebView matrix | `3/3` | HOLD |
| Candidate → installed bundle | exact byte comparison passed | HOLD |
| Installed WKWebView matrix | `3/3` | HOLD |
| V1 coexistence | `/Applications/Drift.app` remained running as PID `75493` and was not modified | HOLD at capture time |

The previously installed V2 candidate at source `6a55d6598315b15742615ae2ae60ac1ff6b0db72` was preserved at:

```text
/Applications/.drift-v2-backups/20260822-202409/Drift V2 Dev.app
```

## Failures that changed the candidate

### Exact Save-panel authority

A real installed transparent-PNG attempt initially failed with:

```text
Drift could not anchor the selected folder: Operation not permitted.
```

The native broker had treated an exact file granted by `NSSavePanel` as authority over its parent folder. Source `b7bb5a5` adds a separate exact-file write lane, preserves the directory-authority lane, stages replacement material on the destination volume, and keeps collision and identity checks fail-closed. The source contracts and freshly compiled native gauntlet pass.

This is not yet normal-UI export proof. The Mac screen locked before a real installed Save panel could verify the repaired path. A transparent PNG and a short MP4 must still be saved through the ordinary installed interface, then decoded and inspected.

### First-use pin composition

The visual critic broke the inherited portrait-crop result: a landscape pinned source was rendered through the project's remembered 9:16 custom aspect and visibly amputated the artwork. Source `15fdd78` makes the first pin use `source` aspect and `safe-overlay` composition. Remembered and deliberately positioned pins remain untouched.

The repair is unit-verified but still needs a post-fix installed visual check in both motion axes. It is not recorded as visual HOLD yet.

### Initial packaged timeout

The first packaged matrix timed out because an older running V2 process had the same development bundle identity. Only the V2 process was quit; V1 remained running. The clean packaged rerun then passed `3/3`. The passing rerun—not the timed-out attempt—is the package evidence for this candidate.

## Boundary of this receipt

This receipt proves source checks, native authority checks, exact packaging, exact installation, isolated identity, and packaged/installed self-test matrices for `b7bb5a5`.

It does **not** prove the pending normal-UI PNG and MP4 saves, the repaired installed pin composition, complete donor integration, a canonical V2 renderer, production document ownership, push, merge, signing, notarisation, release, publication, or owner approval.
