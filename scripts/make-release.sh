#!/bin/bash
# Packs a built app into a release: a disk image for people, a ZIP for the
# in-app updater, the signed Sparkle appcast, and checksums. The signature is
# checked with the public key inside the app, as Sparkle will check it.
#
#   bash scripts/make-release.sh <Drift|Galileo|Backdrop> <out-dir> [release-notes.md]
#
# Run after `bash scripts/build-apps.sh release <App>`. The release workflow
# runs both, with the key from its secret, and publishes everything in
# <out-dir> on the GitHub release tagged v<version>; installed apps read the
# appcast.xml on the latest release and install the ZIP it points to.
# See docs/UPDATES.md.
#
# Environment:
#   SPARKLE_BIN   Sparkle's tools (default ~/Library/Application Support/pitch.dog/Sparkle/2.10.0/bin)
#   SPARKLE_KEY   the private EdDSA key file (default …/pitch.dog/Release Keys/sparkle-ed25519-private.key)
#   DOWNLOAD_URL  where the disk image will be served (default: the GitHub release for this version)
set -euo pipefail
cd "$(dirname "$0")/.."
APP="$1"; OUT="$2"; NOTES="${3:-}"
SUPPORT="$HOME/Library/Application Support/pitch.dog"
SPARKLE_BIN="${SPARKLE_BIN:-$SUPPORT/Sparkle/2.10.0/bin}"
SPARKLE_KEY="${SPARKLE_KEY:-$SUPPORT/Release Keys/sparkle-ed25519-private.key}"
case "$APP" in
  Drift)    BUNDLE="Drift 2";   STEM="Drift";     REPO="bomkino/pitchdog-drift" ;;
  Galileo)  BUNDLE="Galileo 2"; STEM="Galileo-2"; REPO="bomkino/galileo-gallery" ;;
  Backdrop) BUNDLE="Backdrop";  STEM="Backdrop";  REPO="bomkino/backdrop" ;;
  *) echo "unknown app $APP"; exit 2 ;;
esac
BUNDLE="${BUNDLE_NAME_OVERRIDE:-$BUNDLE}"
SRC="../dist/$BUNDLE.app"
[ -d "$SRC" ] || { echo "build $SRC first"; exit 1; }
[ -x "$SPARKLE_BIN/generate_appcast" ] || { echo "Sparkle tools missing at $SPARKLE_BIN"; exit 1; }
[ -f "$SPARKLE_KEY" ] || { echo "signing key missing at $SPARKLE_KEY"; exit 1; }
VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$SRC/Contents/Info.plist")"
DMG="$STEM-$VERSION-macOS-arm64.dmg"
ZIP="$STEM-$VERSION-macOS-arm64.zip"
DOWNLOAD_URL="${DOWNLOAD_URL:-https://github.com/$REPO/releases/download/v$VERSION/}"

mkdir -p "$OUT"
rm -f "$OUT/$DMG" "$OUT/$ZIP" "$OUT/appcast.xml"
stage="$(mktemp -d)"
ditto "$SRC" "$stage/$BUNDLE.app"
ln -s /Applications "$stage/Applications"
# hdiutil sometimes finds the volume busy on a fresh machine, as on CI's
# runners; it gets three tries.
for try in 1 2 3; do
  hdiutil create -quiet -volname "$BUNDLE" -srcfolder "$stage" -ov -format UDZO -fs HFS+ "$OUT/$DMG" && break
  [ "$try" = 3 ] && { echo "hdiutil couldn't make $DMG"; exit 1; }
  echo "hdiutil: try $try failed, trying again"
  sleep 5
done
rm -rf "$stage"
# The updater takes a ZIP: nothing is mounted, so macOS never offers to
# "install" a disk image in the middle of an update.
ditto -c -k --sequesterRsrc --keepParent "$SRC" "$OUT/$ZIP"
# generate_appcast signs every archive in its folder, so it works in its own.
cast="$(mktemp -d)"
cp "$OUT/$ZIP" "$cast/"
# Release notes shown in the update window: a Markdown file named like the archive.
if [ -n "$NOTES" ]; then cp "$NOTES" "$cast/${ZIP%.zip}.md"; fi
feed="$(mktemp -d)"
"$SPARKLE_BIN/generate_appcast" --ed-key-file "$SPARKLE_KEY" --download-url-prefix "$DOWNLOAD_URL" \
  --link "https://github.com/$REPO/releases" --embed-release-notes --maximum-versions 1 -o "$feed/appcast.xml" "$cast" >/dev/null
rm -rf "$cast"
grep -Eq "shortVersionString(>|=\")${VERSION}[<\"]" "$feed/appcast.xml" || { echo "appcast.xml doesn't name $VERSION"; exit 1; }
grep -q "url=\"$DOWNLOAD_URL$ZIP\"" "$feed/appcast.xml" || { echo "appcast.xml doesn't point at $DOWNLOAD_URL$ZIP"; exit 1; }
SIG="$(grep -o 'sparkle:edSignature="[^"]*"' "$feed/appcast.xml" | head -1 | cut -d'"' -f2)"
[ -n "$SIG" ] || { echo "appcast.xml has no signature"; exit 1; }
# The check Sparkle makes: the signature against the public key inside the app.
# A key the app doesn't trust stops here, before any feed is written.
PUBLIC="$(/usr/libexec/PlistBuddy -c "Print :SUPublicEDKey" "$SRC/Contents/Info.plist")"
cat > "$feed/verify.swift" <<'SWIFT'
import CryptoKit
import Foundation
let a = CommandLine.arguments
guard let key = Data(base64Encoded: a[1]), let sig = Data(base64Encoded: a[2]),
      let file = FileManager.default.contents(atPath: a[3]),
      let pub = try? Curve25519.Signing.PublicKey(rawRepresentation: key) else { exit(2) }
exit(pub.isValidSignature(sig, for: file) ? 0 : 1)
SWIFT
swift "$feed/verify.swift" "$PUBLIC" "$SIG" "$OUT/$ZIP" \
  || { echo "the app wouldn't accept this signature: is the key the one whose public half is $PUBLIC?"; exit 1; }
mv "$feed/appcast.xml" "$OUT/appcast.xml"
rm -rf "$feed"
(cd "$OUT" && shasum -a 256 "$DMG" "$ZIP" > SHA256SUMS.txt)
echo "$OUT/$DMG"
echo "$OUT/$ZIP"
echo "$OUT/appcast.xml"
grep -o 'sparkle:version="[^"]*"\|sparkle:shortVersionString="[^"]*"\|url="[^"]*"\|sparkle:edSignature="[^"]\{12\}' "$OUT/appcast.xml" | head -4
