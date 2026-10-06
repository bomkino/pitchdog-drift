#!/bin/bash
# Installs the latest Drift 2, Galileo 2 and Backdrop from their GitHub releases
# into /Applications, replacing any older copies, and moves the old v1 apps
# (Drift and Galileo Gallery) to the Trash.
#
#   bash install-latest.sh            install
#   DRY_RUN=1 bash install-latest.sh  download and check everything, install into a temporary folder
#
# Each app is fetched as its release ZIP (never a disk image, so macOS's
# "Install this app?" prompt never appears), checked against the release's
# SHA256SUMS.txt and its code signature, then copied into place. Files fetched
# with curl are not marked as downloaded, so the apps open without a trip to
# Privacy & Security. Nothing is deleted outright: replaced apps go to the Trash.
set -euo pipefail

DEST="/Applications"
TRASH="$HOME/.Trash"
if [ -n "${DRY_RUN:-}" ]; then
  DEST="$(mktemp -d)/Applications"; TRASH="$(dirname "$DEST")/Trash"; mkdir -p "$DEST" "$TRASH"
  echo "Dry run: installing into $DEST"
fi
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Stop if one of the apps is open: replacing a running app loses unsaved work.
for exe in Drift Galileo Backdrop; do
  if pgrep -x "$exe" >/dev/null; then
    echo "Please quit $exe (save your work first), then run this again."; exit 1
  fi
done

install_app() {
  local repo="$1" name="$2"
  local base="https://github.com/$repo/releases/latest/download"
  curl -fsSL "$base/SHA256SUMS.txt" -o "$WORK/sums.txt"
  local zip; zip="$(awk '/\.zip$/ { print $2 }' "$WORK/sums.txt")"
  [ -n "$zip" ] || { echo "$name: no ZIP listed in the latest release"; exit 1; }
  curl -fsSL "$base/$zip" -o "$WORK/$zip"
  (cd "$WORK" && grep " $zip\$" sums.txt | shasum -a 256 -c - >/dev/null) || { echo "$name: checksum mismatch, stopping"; exit 1; }
  rm -rf "$WORK/unzipped"; ditto -x -k "$WORK/$zip" "$WORK/unzipped"
  local app="$WORK/unzipped/$name.app"
  codesign -v --strict "$app" || { echo "$name: signature check failed, stopping"; exit 1; }
  local version; version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")"
  # Older copies of this app, wherever they were installed, go to the Trash.
  local olds=("$DEST/$name.app")
  if [ -z "${DRY_RUN:-}" ]; then olds+=("$HOME/Applications/$name.app"); fi
  for old in "${olds[@]}"; do
    if [ -d "$old" ]; then mv "$old" "$TRASH/$name $(date +%Y%m%d-%H%M%S).app"; fi
  done
  ditto "$app" "$DEST/$name.app"
  xattr -dr com.apple.quarantine "$DEST/$name.app" 2>/dev/null || true
  echo "$name $version installed in $DEST"
}

install_app bomkino/pitchdog-drift "Drift 2"
install_app bomkino/galileo-gallery "Galileo 2"
install_app bomkino/backdrop "Backdrop"

# The v1 apps, replaced by Drift 2 and Galileo 2. Their old project files stay
# where they are (they need v1 to open); the apps can be put back from the Trash.
if [ -z "${DRY_RUN:-}" ]; then
  for old in "/Applications/Drift.app" "/Applications/Galileo Gallery.app"; do
    if [ -d "$old" ]; then
      mv "$old" "$TRASH/$(basename "$old" .app) v1 $(date +%Y%m%d-%H%M%S).app"
      echo "Moved $(basename "$old") (v1) to the Trash"
    fi
  done
fi
echo "Done. Each app now updates itself: Check for Updates… is in its app menu."
