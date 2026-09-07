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
