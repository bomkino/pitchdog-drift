# In-app updates with Sparkle

How pitch.dog's Mac apps update themselves from GitHub releases, and how to add the same thing to another app. Drift 2, Galileo 2 and Backdrop work this way from Drift 2.5.0, Galileo 2 3.5.0 and Backdrop 2.2.0.

No Apple Developer account is needed. The apps are signed ad hoc. Updates are trusted because they carry a signature that only pitch.dog's private key can make, and every app has the matching public key built in.

## How it works

1. Every GitHub release carries four files: the disk image (for people), a ZIP of the app (for the updater), `appcast.xml` and `SHA256SUMS.txt`.
2. `appcast.xml` describes the newest version: its version number, its release notes, the address of the ZIP, and an EdDSA signature of the ZIP.
3. Each app's `Info.plist` names a feed: `https://github.com/<owner>/<repo>/releases/latest/download/appcast.xml`. GitHub always redirects that address to the `appcast.xml` of the release marked **Latest**.
4. Once a day, and whenever someone chooses **Check for Updates…**, Sparkle reads the feed. If the version there is newer, Sparkle shows the release notes and an Install button.
5. Sparkle downloads the ZIP and checks its signature against the public key in `Info.plist` (`SUPublicEDKey`). It refuses an archive that doesn't match. A tampered ZIP was tested and refused.
6. Sparkle swaps the app in place and relaunches it, which takes a few seconds. The update isn't marked as downloaded from the web, so macOS doesn't ask for **Open Anyway** again.

```
app ──reads──▶ releases/latest/download/appcast.xml ──points to──▶ App-x.y.z-macOS-arm64.zip
     ◀──checks the EdDSA signature against SUPublicEDKey, installs, relaunches──
```

## The key

One EdDSA (Ed25519) key signs updates for every pitch.dog app.

| | Where |
|---|---|
| Public key (goes in every app's `Info.plist`) | `P43E8I+FgVyAW3QkS4J9bnDRRhAnsS4y3dT2WDce1lQ=` |
| Private key (signs releases) | `~/Library/Application Support/pitch.dog/Release Keys/sparkle-ed25519-private.key`, owner-only (`chmod 600`) |
| Backup | In the team's password manager, as a secure note holding the file's one line |

Rules:

- **Never commit the private key, paste it into chat, or put it in a GitHub secret** unless CI is meant to sign releases (it isn't today).
- **If it is lost:** installed apps can no longer update themselves. Make a new key, build the next version with the new public key, and install that version by hand once on each Mac. Updates work again from then on.
- **If it leaks:** someone could sign a fake update, but they would also need to publish it as the Latest release of one of the repositories. Rotate anyway: release a version signed with the old key that carries the new public key. After that, sign only with the new key, and keep GitHub accounts secured with two-factor authentication.

The key was made with Apple's CryptoKit rather than Sparkle's `generate_keys`, so no Keychain prompt is needed. The file holds the base64 32-byte private seed, which is the format Sparkle's `--ed-key-file` reads. To make a fresh one (for a lost key, or a separate organisation):

```swift
import CryptoKit
let key = Curve25519.Signing.PrivateKey()
print(key.rawRepresentation.base64EncodedString())          // private: into the key file
print(key.publicKey.rawRepresentation.base64EncodedString()) // public: SUPublicEDKey
```

## Setting up a Mac to make releases (once)

1. Download Sparkle's tools from its official release and check the checksum against the one GitHub publishes:
   ```bash
   gh release download 2.10.0 -R sparkle-project/Sparkle -p "Sparkle-2.10.0.tar.xz"
   shasum -a 256 Sparkle-2.10.0.tar.xz   # c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c
   mkdir -p ~/Library/Application\ Support/pitch.dog/Sparkle/2.10.0
   mkdir -p /tmp/sparkle && tar -xf Sparkle-2.10.0.tar.xz -C /tmp/sparkle && ditto /tmp/sparkle/bin ~/Library/Application\ Support/pitch.dog/Sparkle/2.10.0/bin
   ```
2. Put the private key file in `~/Library/Application Support/pitch.dog/Release Keys/`, taken from the password manager. Then run `chmod 700` on the folder and `chmod 600` on the file.

## Making a release

From the studio repository:

```bash
# 1. Bump VERSION for the app in scripts/build-apps.sh (always upwards).
bash scripts/build-apps.sh release Drift
bash scripts/make-release.sh Drift ../release/drift notes.md
#    → Drift-2.5.0-macOS-arm64.dmg, Drift-2.5.0-macOS-arm64.zip, appcast.xml, SHA256SUMS.txt
# 2. Publish all four files on the release tagged v2.5.0, marked Latest:
gh release create v2.5.0 -R bomkino/pitchdog-drift --target <main sha> --latest \
  --title "Drift 2.5.0 — Apple silicon Mac" --notes-file release-notes.md ../release/drift/*
# 3. Check the feed now points at it:
curl -sL https://github.com/bomkino/pitchdog-drift/releases/latest/download/appcast.xml | grep shortVersionString
```

`notes.md` is the short Markdown shown in the app's update window. Keep it to a few lines. The full notes go on the GitHub release.

Things that break updates:

- **The asset must be called exactly `appcast.xml`**, and the release must be the **Latest** one. Drafts and pre-releases don't count, and GitHub's `latest` skips them.
- **Versions only go up.** Sparkle compares `CFBundleVersion`, which `build-apps.sh` derives from the version: 2.5.0 → 20500. Never reuse or lower a version.
- **Upload the ZIP that was signed.** If the ZIP is rebuilt, run `make-release.sh` again: a ZIP with a stale signature is refused, as it should be.
- Don't delete the newest release, or its `appcast.xml`, while people may still be updating.

## Testing an update before releasing

This builds a copy of the app under another name and identifier, so the real app and its settings are never touched. A local web server stands in for GitHub.

```bash
export BUNDLE_NAME_OVERRIDE="Drift Update Test" BUNDLE_ID_OVERRIDE="dog.pitch.drift2.updatetest"
VERSION_OVERRIDE=9.0.0 bash scripts/build-apps.sh release Drift
mkdir -p /tmp/upd/install /tmp/upd/feed && ditto "../dist/Drift Update Test.app" "/tmp/upd/install/Drift Update Test.app"
VERSION_OVERRIDE=9.0.1 bash scripts/build-apps.sh release Drift
DOWNLOAD_URL="http://127.0.0.1:8765/" bash scripts/make-release.sh Drift /tmp/upd/feed
(cd /tmp/upd/feed && python3 -m http.server 8765 --bind 127.0.0.1 &)
STUDIO_UPDATE_TEST=1 STUDIO_UPDATE_FEED=http://127.0.0.1:8765/appcast.xml \
  "/tmp/upd/install/Drift Update Test.app/Contents/MacOS/Drift" &
# Within about 10 s the copy reports 9.0.1:
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "/tmp/upd/install/Drift Update Test.app/Contents/Info.plist"
```

`STUDIO_UPDATE_TEST` makes the app check at once and install as soon as the update is ready. `STUDIO_UPDATE_FEED` swaps in the test feed. Both are read only from the environment, and a feed can't install anything unless it's signed with the key. To check that a tampered update is refused, change one byte of the served ZIP after `make-release.sh` and run the test again. The version must stay at 9.0.0.

## Adding updates to another app

For an app built with Swift Package Manager and the Command Line Tools, as these are:

1. **Package.swift.** Add the dependency and an `Updates` target, and give each app target the rpath:
   ```swift
   dependencies: [.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.0")],
   // targets:
   .target(name: "Updates", dependencies: [.product(name: "Sparkle", package: "Sparkle")]),
   .executableTarget(name: "MyApp", dependencies: ["Updates"],
                     linkerSettings: [.unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"])]),
   ```
2. **Copy `Sources/Updates/AppUpdates.swift`.** It's self-contained. In the `App`:
   ```swift
   @StateObject private var updates = AppUpdates(start: true)   // false for headless or command-line runs
   // in body:
   .commands { CheckForUpdatesCommand(updates: updates) }
   ```
3. **The build script, after the binary is copied into the bundle:**
   - Copy the framework, keeping its symlinks and signature: `ditto "$(dirname "$BIN")/Sparkle.framework" "$APP/Contents/Frameworks/Sparkle.framework"`.
   - Add to `Info.plist`: `SUFeedURL` (the repository's `releases/latest/download/appcast.xml`), `SUPublicEDKey` (the public key above), `SUEnableAutomaticChecks` = true.
   - Set `CFBundleVersion` from the version (major × 10000 + minor × 100 + patch).
   - Sign with `codesign --force --sign - App.app`, **without `--deep`**. `--deep` re-signs Sparkle and strips its helpers' entitlements.
4. **Licence.** Ship Sparkle's LICENSE inside the app (`Contents/Resources/Licenses/`) and mention it in NOTICES.
5. **Release script.** Copy `scripts/make-release.sh` and change the app names, file stems and repository.
6. **Test** with the recipe above, then release. The first version with Sparkle has to be installed by hand once on each Mac. Every version after that arrives by itself.

For an Xcode project, add the same package in Xcode (File › Add Package Dependencies…). Sparkle is then embedded automatically. The `Info.plist` keys, the key file and the release steps are the same.

## What we learned

- **macOS now offers to "install" apps from disk images.** When any disk image with an app is opened or mounted, newer macOS asks "Install this app?". For apps not notarized by Apple, that fails with "Could not install"; dragging to Applications still works. So updates use a ZIP, which is never mounted, and release checks unzip the ZIP rather than mounting the disk image.
- **Control-click › Open is gone** from macOS Sequoia on. The first launch of a downloaded app needs System Settings › Privacy & Security › **Open Anyway**. Apps fetched with `curl` or `gh` aren't marked as downloaded, so they open directly. That's the easiest way to install for someone happy to use Terminal, or to let Codex do it.
- **Keychain prompts block unattended releases.** Sparkle's tools read the key from the Keychain by default, and macOS asks permission. A key file with `--ed-key-file` avoids the prompt.
- **Command-line and headless runs of an app must not start the updater**, or a test run could install an update. `AppUpdates(start:)` takes a flag for that.
- **Release-only checks:** before publishing, look at `appcast.xml`. Its `url` must be the ZIP on the new release, `sparkle:shortVersionString` the new version, and it must contain an `edSignature`. After publishing, check that `releases/latest/download/appcast.xml` serves it.
