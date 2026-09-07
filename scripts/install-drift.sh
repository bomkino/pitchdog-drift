#!/bin/bash
# Install a verified native Drift release without deleting projects or the old app.
set -euo pipefail
umask 077

fail() { printf 'Drift install: %s\n' "$*" >&2; return 1; }
json() { /usr/bin/plutil -extract "$2" raw -o - "$1"; }
sha() { /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'; }

verify_bundle() {
  local app="$1" receipt="$2" info="$1/Contents/Info.plist" identity="$1/Contents/Resources/BuildIdentity.json" signature
  [[ -d "$app" && ! -L "$app" && -x "$app/Contents/MacOS/Drift" ]] || fail 'Replacement is not a regular executable app bundle.'
  [[ "$(json "$info" CFBundleIdentifier)" == dog.pitch.drift ]] || fail 'Wrong bundle identifier.'
  [[ "$(json "$info" DriftRuntime)" == native && "$(json "$identity" runtime)" == native ]] || fail 'Only native Drift is supported.'
  [[ "$(json "$info" DriftSourceRevision)" == "$(json "$receipt" sourceRevision)" && "$(json "$identity" source)" == "$(json "$receipt" sourceRevision)" ]] || fail 'Bundle source does not match receipt.'
  [[ "$(json "$info" CFBundleShortVersionString)" == "$(json "$receipt" version)" && "$(json "$identity" version)" == "$(json "$receipt" version)" ]] || fail 'Bundle version does not match receipt.'
  [[ "$(json "$info" CFBundleVersion)" == "$(json "$receipt" buildNumber)" && "$(json "$identity" build)" == "$(json "$receipt" buildNumber)" ]] || fail 'Bundle build does not match receipt.'
  [[ "$(json "$info" LSMinimumSystemVersion)" == 13.3 && "$(json "$identity" architecture)" == arm64 ]] || fail 'Unsupported bundle architecture or minimum OS.'
  /usr/bin/file "$app/Contents/MacOS/Drift" | /usr/bin/grep -q 'Mach-O 64-bit executable arm64' || fail 'Executable is not arm64.'
  /usr/bin/codesign --verify --deep --strict "$app"
  signature=$(/usr/bin/codesign -dv --verbose=4 "$app" 2>&1)
  [[ "$(printf '%s\n' "$signature" | /usr/bin/sed -n 's/^CDHash=//p')" == "$(json "$receipt" codeDirectoryHash)" ]] || fail 'Signed bundle identity differs from the tested app.'
  case "$(json "$receipt" signing)" in
    ad-hoc) [[ "$signature" == *'Signature=adhoc'* && "$(json "$receipt" notarized)" == false ]] || fail 'Signing disclosure mismatch.' ;;
    'Developer ID') [[ "$signature" == *'Authority=Developer ID Application:'* && "$(json "$receipt" notarized)" == true ]] || fail 'Developer ID disclosure mismatch.'; /usr/sbin/spctl --assess --type execute "$app" ;;
    *) fail 'Unknown signing identity.' ;;
  esac
}

app_running() {
  local app="$1" pid executable
  for pid in $(/usr/bin/pgrep -x Drift || true); do
    executable=$(/bin/ps -p "$pid" -o comm= 2>/dev/null || true)
    [[ "$executable" != "$app/Contents/MacOS/Drift" ]] || return 0
  done
  return 1
}

normal_quit() {
  local app="$1" attempt
  app_running "$app" || return 0
  /usr/bin/osascript - "$app" <<'APPLESCRIPT'
on run argv
  tell application (item 1 of argv) to quit
end run
APPLESCRIPT
  for attempt in {1..100}; do
    app_running "$app" || return 0
    /bin/sleep 0.2
  done
  fail 'Quit was cancelled or Drift remains open. The installed app was not replaced.'
}

recover_interrupted() {
  local destination="$1" target="$1/Drift.app" work
  for work in "$destination"/.drift-install-*; do
    [[ -e "$work/state" ]] || continue
    [[ ! -L "$work" && -O "$work" && ! -L "$work/state" ]] || fail 'Unsafe installation recovery path.'
    [[ "$(cat "$work/state")" != replacing ]] || {
      if [[ ! -e "$target" && ! -L "$target" && -d "$work/Previous.app" && ! -L "$work/Previous.app" ]]; then
        mv "$work/Previous.app" "$target"
        printf 'restored\n' > "$work/state"
        printf 'Restored previous Drift after interrupted replacement.\n'
      else
        fail "Interrupted installation requires review: $work. Existing apps were preserved."
      fi
    }
  done
}

install_bundle() (
  set -euo pipefail
  local app="$1" receipt="$2" destination="$3" target work='' moved=0 installed=0 complete=0 lock
  [[ -d "$destination" && ! -L "$destination" && -w "$destination" ]] || fail 'Destination must be an existing writable folder. Choose --destination "$HOME/Applications" if needed.'
  destination=$(cd "$destination" && pwd -P)
  target="$destination/Drift.app"
  [[ ! -L "$target" ]] || fail 'Refusing a symlink installation target.'
  [[ ! -e "$target" || -d "$target" ]] || fail 'The installation target is not an app directory.'
  lock="$destination/.drift-install-lock"
  mkdir "$lock" 2>/dev/null || fail "Another installation or interrupted installer owns $lock. Existing apps were preserved; review that lock before retrying."
  cleanup() {
    local result=$?
    trap - EXIT HUP INT TERM
    if [[ "$complete" == 0 && -n "$work" ]]; then
      if [[ "$installed" == 1 && -d "$target" ]]; then mv "$target" "$work/Rejected.app" || true; fi
      if [[ "$moved" == 1 && ! -e "$target" && -d "$work/Previous.app" ]]; then
        mv "$work/Previous.app" "$target" || printf 'Rollback remains at %s/Previous.app\n' "$work" >&2
      fi
      printf 'aborted\n' > "$work/state"
      # Keep any rollback/rejected bundle for inspection; discard only our pre-copy scratch.
      if [[ "$moved" == 0 && "$installed" == 0 ]]; then rm -rf "$work"; fi
    fi
    rmdir "$lock" || true
    exit "$result"
  }
  trap cleanup EXIT
  trap 'exit 130' HUP INT TERM
  recover_interrupted "$destination"
  verify_bundle "$app" "$receipt"
  work=$(mktemp -d "$destination/.drift-install-XXXXXXXX")
  /usr/bin/ditto "$app" "$work/Replacement.app"
  verify_bundle "$work/Replacement.app" "$receipt"
  cp "$receipt" "$work/MacReleaseReceipt.json"
  normal_quit "$target"
  app_running "$target" && fail 'Drift restarted during installation.'
  # Durable marker precedes the first rename; a later invocation can recover it.
  printf 'replacing\n' > "$work/state"
  /bin/sync
  if [[ -d "$target" ]]; then moved=1; mv "$target" "$work/Previous.app"; fi
  installed=1; mv "$work/Replacement.app" "$target"
  verify_bundle "$target" "$receipt"
  printf 'complete\n' > "$work/state"
  /bin/sync
  complete=1
  printf 'Installed: %s\n' "$target"
  if [[ "$moved" == 1 ]]; then printf 'Rollback retained: %s/Previous.app\n' "$work"; fi
  printf 'Projects, originals and recovery files were not changed.\n'
)

main() (
  set -euo pipefail
  local destination=/Applications supplied='' work mounted=0 version tag receipt dmg expected source object_type
  while (($#)); do
    case "$1" in
      --destination) [[ $# -ge 2 ]] || fail 'Missing destination.'; destination="$2"; shift 2 ;;
      --release-directory) [[ $# -ge 2 ]] || fail 'Missing verified release directory.'; supplied="$2"; shift 2 ;;
      --help|-h) printf 'Install-Drift.command [--destination /absolute/folder] [--release-directory /verified/release]\n'; return 0 ;;
      *) fail "Unknown argument: $1" ;;
    esac
  done
  [[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || fail 'Drift requires Apple silicon macOS.'
  [[ "$destination" == /* ]] || fail 'Choose an absolute installation folder.'
  [[ $EUID != 0 ]] || fail 'Run as your normal user, never with sudo.'
  local os major minor
  os=$(/usr/bin/sw_vers -productVersion); major=${os%%.*}; minor=${os#*.}; minor=${minor%%.*}
  ((major > 13 || (major == 13 && minor >= 3))) || fail 'Drift requires macOS 13.3 or later.'
  work=$(mktemp -d "${TMPDIR:-/tmp}/drift-download-XXXXXXXX")
  cleanup_download() { local result=$?; trap - EXIT; if [[ "$mounted" == 1 ]]; then /usr/bin/hdiutil detach "$work/mounted" -quiet || true; fi; rm -rf "$work"; exit "$result"; }
  trap cleanup_download EXIT
  trap 'exit 130' HUP INT TERM
  fetch() { /usr/bin/curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --max-time 600 --output "$2" "$1"; }
  if [[ -z "$supplied" ]]; then
    fetch 'https://api.github.com/repos/bomkino/pitchdog-drift/releases/latest' "$work/release.json"
    [[ "$(json "$work/release.json" draft)" == false && "$(json "$work/release.json" prerelease)" == false ]] || fail 'No published stable release.'
    tag=$(json "$work/release.json" tag_name)
    [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Invalid release version.'
    fetch "https://github.com/bomkino/pitchdog-drift/releases/download/$tag/MacReleaseReceipt.json" "$work/MacReleaseReceipt.json"
    supplied="$work"
  fi
  receipt="$supplied/MacReleaseReceipt.json"
  [[ -f "$receipt" && ! -L "$receipt" ]] || fail 'A release identity receipt is required.'
  [[ "$(json "$receipt" schemaVersion)" == 2 && "$(json "$receipt" runtime)" == native && "$(json "$receipt" architecture)" == arm64 ]] || fail 'The current download is not a supported native release.'
  version=$(json "$receipt" version); source=$(json "$receipt" sourceRevision)
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$source" =~ ^[0-9a-f]{40}$ ]] || fail 'Invalid release identity.'
  [[ "$(json "$receipt" applicationJourney.result)" == passed && "$(json "$receipt" applicationJourney.source)" == "$source" ]] || fail 'Missing exact-source application proof.'
  dmg="Drift-$version-macOS-arm64.dmg"; expected=$(json "$receipt" installer.sha256)
  [[ "$(json "$receipt" installer.name)" == "$dmg" && "$expected" =~ ^[0-9a-f]{64}$ ]] || fail 'Invalid installer identity.'
  if [[ "$supplied" == "$work" ]]; then
    [[ "$tag" == "v$version" ]] || fail 'Release tag and receipt differ.'
    fetch "https://api.github.com/repos/bomkino/pitchdog-drift/git/ref/tags/$tag" "$work/tag.json"
    object_type=$(json "$work/tag.json" object.type)
    if [[ "$object_type" == tag ]]; then
      fetch "https://api.github.com/repos/bomkino/pitchdog-drift/git/tags/$(json "$work/tag.json" object.sha)" "$work/annotated-tag.json"
      cp "$work/annotated-tag.json" "$work/tag.json"
    fi
    [[ "$(json "$work/tag.json" object.type)" == commit && "$(json "$work/tag.json" object.sha)" == "$source" ]] || fail 'Immutable tag and tested source differ.'
    fetch "https://github.com/bomkino/pitchdog-drift/releases/download/$tag/$dmg" "$work/$dmg"
    fetch "https://github.com/bomkino/pitchdog-drift/releases/download/$tag/$dmg.sha256" "$work/$dmg.sha256"
  fi
  [[ -f "$supplied/$dmg" && ! -L "$supplied/$dmg" && -f "$supplied/$dmg.sha256" ]] || fail 'Installer or mandatory checksum missing.'
  [[ "$(sha "$supplied/$dmg")" == "$expected" && "$(/usr/bin/stat -f %z "$supplied/$dmg")" == "$(json "$receipt" installer.bytes)" ]] || fail 'Downloaded installer digest/length mismatch.'
  [[ "$(cat "$supplied/$dmg.sha256")" == "$expected  $dmg" ]] || fail 'Mandatory checksum and receipt differ.'
  mkdir "$work/mounted"
  /usr/bin/hdiutil verify "$supplied/$dmg"
  /usr/bin/hdiutil attach -readonly -nobrowse -mountpoint "$work/mounted" "$supplied/$dmg" >/dev/null
  mounted=1
  install_bundle "$work/mounted/Drift.app" "$receipt" "$destination"
  if [[ "$(json "$receipt" signing)" == ad-hoc ]]; then
    printf 'This build is ad-hoc signed, unnotarized. If blocked, verify this trusted download, then use System Settings > Privacy & Security > Open Anyway.\n'
  fi
)

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
