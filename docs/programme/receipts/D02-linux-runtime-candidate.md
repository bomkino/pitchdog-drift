# D02 evidence receipt — integrated Linux x64 runtime candidate

Date: 28 August 2026

Repository: `bomkino/pitchdog-drift`

Runtime source commit: `8837aa99ea153f8baa975c1b797b575ff9fe55c9`

CI admission commit: `8837aa99ea153f8baa975c1b797b575ff9fe55c9`

Workflow parent `af7c342902bceca4f06c20df007ff8343be9bf5b`
serializes SwiftShader-heavy journeys after the two-worker experiment caused
resource-starvation timeouts. The admitted commit adds only the final
violet/touch-target CSS pass and corrects one icon-generator comment; product
authority, Linux host, package, and test source are otherwise identical.

## Ticket boundary

- Destination: the existing D02 Electron Linux x64 tracer behind
  `DesktopPlatform`, with no Linux branch leaking into Project, creative
  evaluation, rendering, export, audio, or automation authority.
- Toolchain: official `electron-v44.0.0-linux-x64.zip`, exact SHA-256
  `d65286d812719f2b4c1a1b806a80f288a1058c89c7b058dae1e03ab25e499446`.
- Runtime: ordinary non-root user, strict `drift://app` origin, context
  isolation, renderer Node denial, bounded preload/IPC, opaque grants, canonical
  Project import/save/relaunch/reopen, and default-deny navigation/network.
- Sandbox: `chrome-sandbox` must be UID 0, GID 0, exact mode `04755`; the app
  itself never runs as root and never uses `--no-sandbox`.

## Admitted Ubuntu run

- Workflow run: `33137610179`.
- URL: `https://github.com/bomkino/pitchdog-drift/actions/runs/33137610179`.
- Head: `8837aa99ea153f8baa975c1b797b575ff9fe55c9`.
- Trigger: push to the isolated `codex/drift-runtime-candidate` branch.
- Permissions: `contents: read`; no secrets; runner `ubuntu-24.04`; Node
  22.12.0; bounded 75-minute job; retained evidence only; no Release.

The final conclusion and downloaded artifact identity are appended after the
run finishes and the remote evidence is read back. A queued or running job is
not a CI-passed claim.

## Prior exact runtime falsification evidence

Run `33132162792` at product commit
`627b3061ef5bc1cac45e8d0d12b83b528b352a11` already established the current
D02 host implementation under Ubuntu before the later workflow-only admission
fix:

- Ubuntu 24 image `20260823.283.1`, x86_64 Linux
  `6.17.0-1022-azure`, Node 22.12.0, npm 10.9.0, Chrome 151.0.7922.173.
- `chrome-sandbox` was root:root `04755`; Electron was ordinary runner
  1001:1001 mode `0755`.
- Runtime receipt `ok: true`: `drift://app`, sandbox enabled, context isolation,
  Node unreachable, guessed grant rejected as `grant_expired`, no raw path,
  and no renderer network authority.
- A 7,507-byte Project was imported, saved, read back, relaunched, and reopened
  with identical SHA-256
  `1734c04c`-prefixed identity through opaque grant authority.
- The broad 51-test browser/hostile-authority stage passed in 34 minutes 49
  seconds. The run failed later only because the presenter encoder test carried
  an obsolete in-test 120-second timeout; that causal defect was removed at the
  current runtime source commit.

This prior run is narrow evidence for its own commit. It is included to explain
the causal CI repair history, not to substitute for the admitted run above.

## Boundaries

Ubuntu CI can prove automated Linux x64 host, sandbox, Project authority,
browser, software-rendered H.264/PNG, controller, and hostile IPC behavior. It
cannot prove exact Garuda/KDE identity, desktop portals, physical GPU/WebGL,
colour/performance, physical audio hardware, system accessibility, or human
visual/audio acceptance.
