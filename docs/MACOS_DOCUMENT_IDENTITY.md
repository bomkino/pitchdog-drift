# Drift for macOS — `.pitched` document identity

A portable Drift project should look like a Drift project before it opens. The standalone app therefore gives `dog.pitch.pitched-project` its own document icon instead of borrowing the application icon or falling back to a generic ZIP sheet.

## Visual contract

The icon uses a conventional macOS document silhouette with a **standard upper-right folded corner**. Inside that sheet, Drift’s cinematic frame mark carries restrained cyan and magenta registration echoes, an off-white exposure frame, and a dark preview plate. Project metadata is represented by quiet structural bars rather than fake text.

The document icon is deliberately distinct from the application icon:

- the app icon represents the directing instrument;
- the document icon represents one portable project produced by that instrument;
- both share the same chromatic frame language;
- neither uses a filename, project title, client name, or other private content.

The 16 px version removes perforation and metadata detail so the folded sheet and framed image survive at Finder list size. Detail increases progressively through 32, 64, 128, 256, 512, and 1024 px.

## Source and packaging

`scripts/generate-macos-document-icon.py` creates every PNG in `DriftDocument.iconset` using only Python’s standard library. No generated PNG or `.icns` binary is committed. The app build performs this sequence:

1. generate the complete iconset from repository source;
2. convert it to `DriftDocument.icns` with Apple’s `iconutil`;
3. place it in `Drift.app/Contents/Resources` before the resource manifest is calculated;
4. bind it to the `.pitched` document declaration through `CFBundleTypeIconFile`;
5. bind the exported UTI to the same resource through `UTTypeIconFile`;
6. seal the icon, plist, and manifest together with the app signature.

This keeps the visual identity reproducible and reviewable. A modified generator changes signed bundle bytes and therefore cannot hide outside the resource receipt.

## Automated falsification

`npm run check:mac-source` runs `scripts/check-macos-document-identity.mjs`. The checker:

- rejects downloaded-image, Pillow, Cairo, ImageMagick, subprocess, network, or runtime-fetch dependencies;
- runs two clean smoke generations and requires byte-identical 16 px and 64 px outputs;
- parses the generated PNGs and checks dimensions, RGBA encoding, transparent outer corners, and an opaque document body;
- proves the 64 px icon still contains its paper, cyan, and magenta visual anchors;
- requires both plist bindings to name `DriftDocument`;
- requires the builder, verifier, package script, workflow paths, and documentation to agree;
- rejects committed prototype or generated icon binaries.

On macOS, `scripts/verify-macos-app.sh` expands the packaged `.icns` back into an iconset with `iconutil`. It verifies all ten required representations from 16 px through 1024 px, their exact dimensions, and their 8-bit RGBA structure. The mounted-DMG verifier reruns the same app-bundle check, so disk-image packaging cannot silently omit or replace the document icon.

## Physical-Mac review

Hosted CI can prove source generation, plist structure, ICNS contents, bundle sealing, and mounted-DMG preservation. Before integration, review on a physical Mac:

1. build and open `Drift.app`, then restart Finder or log out/in if Launch Services caches an older declaration;
2. save a new `.pitched` project and confirm Finder shows the dedicated document icon at 16 px list size, 32–64 px icon size, and large Gallery view;
3. confirm the icon remains distinct from `Drift.app` in Applications, the Dock, Spotlight, Open panels, Save panels, Recent Items, and the Finder Get Info window;
4. use **Open With Drift** and double-click the project to confirm the icon association and document ownership agree;
5. inspect light appearance, dark appearance, increased contrast, and several desktop accent colours;
6. verify Retina and non-Retina scaling, including an external display if available;
7. inspect Quick Look and Finder Gallery view; the static document icon must remain a safe fallback when no content preview exists;
8. copy the file to another folder, rename it with spaces and Unicode, duplicate it, AirDrop it, and archive/unarchive it; identity must follow the `.pitched` type rather than a particular path;
9. install an older local build and then the new build to check Launch Services refresh and cache behaviour;
10. remove Drift and confirm Finder falls back safely rather than presenting the icon as proof that the application remains installed.

## Deliberate limits

This pass does not add a Quick Look extension, thumbnail project contents, recent-document history, Finder badges, file metadata indexing, or persistent project previews. A Quick Look thumbnail would expose and render project content, require a new extension target, and introduce a separate privacy and lifecycle surface. The static source-generated icon solves the stronger first problem: a `.pitched` file has a recognisable, private, deterministic identity everywhere macOS needs a document icon.
