# Studio UI — explicit second-consumer pilot

This branch retains Drift's panels, Look/Motion/Slide modes, generated controls, source
preview, document journal, field ownership, audio and export implementation. It adds a
thin optional visual adapter; there is no second renderer or shared document state.

The source of the component pilot is Galileo's `native/Packages/PitchdogStudioUI`.
There is no copied library directory in Drift. Set `PITCHDOG_STUDIO_UI_PATH` to a clean
checkout of that exact package and `DRIFT_ALLOW_STUDIO_UI_PILOT=1` to build the pilot with
`scripts/build-native-app.sh`. The app records the component repository commit in its
BuildIdentity. Its notices retain the originating repository license and pilot README.
Unset the override to retain the existing system UI. Core-only package graphs never
resolve the UI package. This is a development bridge, not the final distribution model.

`package-native-app.sh` deliberately refuses a pilot build. The pilot workflow compiles
and exercises the actual app directly and records its source plus component revision;
it does not publish an installer, create a release or replace a user's installed app.
The ordinary no-override native and installer checks remain separate and unchanged.

Human visual approval, physical hardware, minimum macOS and assistive-technology acceptance
remain required. Shared package canonicalisation and exact published-version pinning must
replace this override before a visual-overhaul release. Do not call the pilot complete
because it compiles. Galileo's still-frame/schema work is not imported into Drift.

## 2026-09-08 continuation

The successful checkpoint remains run 34148708000, Drift 30689aaa6ae711e92bce53a11b102aeddbc7fc8a with component ac70858e11743ac40bbd7911e4010af2aa8e2527. Raw evidence is preserved locally before expiry. That success is not claimed for the new typography candidate.

The guarded candidate pins Galileo b946f486dcea597fdcc939ec7d6b39d66809c9b3 for richer near-black surfaces and canonical pitch.dog UI typography. Both apps preserve the existing type-system v13.0.0 pin 786b4a2b671182319320f922b8de8f927ea3a002. Three app-owned native variable TTF files and all 14 semantic roles have verified upstream provenance in macos/Resources/StudioFonts/SOURCE.json. The common package remains resource-free; fonts resolve once from exact files, avoiding the Eyebrow installed-name collision. Existing pilot distribution guards, audio, rendering, media, undo and app-owned state remain intact.

Local SDK15.4 / Swift6.4 arm64 app build passes with two build jobs on the M2/8 GB host. Font-file checks pass. Actual typography geometry and full repeated pilot acceptance are pending; ordinary system-only builds still preserve the optional-pilot boundary. Neither this candidate nor the type-system's upstream production-candidate status is a stable release claim.

The existing Look, Motion, Slide and Export dropdowns now use the same native menu trigger as World. All bindings, captured field commits, catalog exclusions and audio controls remain app-owned. Compact fields and selectors are 32 points tall; primary actions retain 40 points. Final candidate CI and active-window captures must be read back for this pin.
