#!/bin/bash
# Proves the live update feed with a real copy of the app, as the release
# workflow runs it after publishing: downloads the newest release before the
# Latest one, opens it against the real feed with STUDIO_UPDATE_TEST=1 (check
# at once, install as soon as ready), and waits for it to become the Latest
# version. This is what every installed copy will do within a day.
#
#   bash scripts/test-live-update.sh <Drift|Galileo|Backdrop>
#
# Needs the GitHub CLI (GH_TOKEN in CI). A release before the first one with
# the updater has no ZIP and can't update itself, so it is skipped.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  Drift)    BUNDLE="Drift 2";   STEM="Drift";     REPO="bomkino/pitchdog-drift" ;;
  Galileo)  BUNDLE="Galileo 2"; STEM="Galileo-2"; REPO="bomkino/galileo-gallery" ;;
  Backdrop) BUNDLE="Backdrop";  STEM="Backdrop";  REPO="bomkino/backdrop" ;;
  *) echo "usage: test-live-update.sh <Drift|Galileo|Backdrop>"; exit 2 ;;
esac
EXE="$1"
WORK="$(mktemp -d)"
APP_PID=""
cleanup() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  pkill -f "$WORK/install/$BUNDLE.app/Contents/MacOS/$EXE" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

LATEST="$(gh release list -R "$REPO" --exclude-drafts --exclude-pre-releases --json tagName,isLatest --jq '.[] | select(.isLatest) | .tagName')"
WANT="${LATEST#v}"
[ -n "$WANT" ] || { echo "live update: no Latest release"; exit 1; }
offers() { grep -Eq "shortVersionString(>|=\")${WANT}[<\"]" <<< "$(curl -fsSL "https://github.com/$REPO/releases/latest/download/appcast.xml" || true)"; }
for _ in $(seq 24); do
  offers && break
  sleep 5
done
offers || { echo "live update: the feed doesn't offer $WANT"; exit 1; }
echo "live update: the feed offers $WANT"

FROM=""
for tag in $(gh release list -R "$REPO" --exclude-drafts --exclude-pre-releases --limit 10 --json tagName --jq '.[].tagName'); do
  [ "$tag" = "$LATEST" ] && continue
  FROM="$tag"; break
done
[ -n "$FROM" ] || { echo "live update: skipped, $LATEST is the only release"; exit 0; }
ZIP="$STEM-${FROM#v}-macOS-arm64.zip"
if ! gh release download "$FROM" -R "$REPO" -p "$ZIP" -D "$WORK" 2>/dev/null; then
  echo "live update: skipped, $FROM has no $ZIP (it came before the updater)"; exit 0
fi
mkdir -p "$WORK/install" && ditto -x -k "$WORK/$ZIP" "$WORK/install"
APP="$WORK/install/$BUNDLE.app"
version() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist"; }
echo "live update: opening $BUNDLE $(version) against the live feed"
STUDIO_UPDATE_TEST=1 "$APP/Contents/MacOS/$EXE" > "$WORK/app.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 180); do
  [ "$(version)" = "$WANT" ] && break
  sleep 1
done
got="$(version)"
if [ "$got" != "$WANT" ]; then
  echo "live update: FAILED, $FROM is still $got"; cat "$WORK/app.log"; exit 1
fi
codesign -v --strict "$APP"
echo "live update: $FROM updated itself to $WANT from the live feed"
