#!/bin/bash
# Build-only dependencies; the installed app never downloads codecs or invokes
# Homebrew/ffmpeg. Every upstream source is an immutable reviewed commit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${DRIFT_CODEC_SDK:-$ROOT/build/native-codecs}"
WORK="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/drift-codecs-build"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo "Native codec SDK requires an arm64 Mac build host." >&2; exit 1; }
mkdir -p "$DEST/lib" "$DEST/include" "$DEST/licenses" "$WORK"
WEBP=4fa21912338357f89e4fd51cf2368325b59e9bd9
WEBM=f2a982d748b80586ae53b89a2e6ebbc305848b8c
VPX=6df3ec34557879fff673706f4a1d9fbd0f3a6f0e
fetch() {
  local name="$1" sha="$2" dir="$WORK/$1"
  if [[ ! -d "$dir/.git" ]]; then git init -q "$dir"; git -C "$dir" remote add origin "https://github.com/webmproject/$name.git"; fi
  git -C "$dir" fetch --depth 1 origin "$sha"
  git -C "$dir" checkout --detach "$sha"
  [[ "$(git -C "$dir" rev-parse HEAD)" == "$sha" ]]
}
fetch libwebp "$WEBP"; fetch libwebm "$WEBM"; fetch libvpx "$VPX"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
export MACOSX_DEPLOYMENT_TARGET=13.3
cmake -S "$WORK/libwebp" -B "$WORK/webp-build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=13.3 -DCMAKE_OSX_SYSROOT="$SDK" -DBUILD_SHARED_LIBS=OFF \
  -DWEBP_BUILD_ANIM_UTILS=OFF -DWEBP_BUILD_CWEBP=OFF -DWEBP_BUILD_DWEBP=OFF -DWEBP_BUILD_GIF2WEBP=OFF \
  -DWEBP_BUILD_IMG2WEBP=OFF -DWEBP_BUILD_VWEBP=OFF -DWEBP_BUILD_WEBPINFO=OFF -DWEBP_BUILD_EXTRAS=OFF
cmake --build "$WORK/webp-build" --target webp webpdemux --parallel 3
cmake -S "$WORK/libwebm" -B "$WORK/webm-build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=13.3 -DCMAKE_OSX_SYSROOT="$SDK" -DBUILD_SHARED_LIBS=OFF -DENABLE_TESTS=OFF
cmake --build "$WORK/webm-build" --target webm --parallel 3
mkdir -p "$WORK/vpx-build"
(cd "$WORK/vpx-build"
  CC="$(xcrun -f clang)" CXX="$(xcrun -f clang++)" \
  CFLAGS="-arch arm64 -isysroot $SDK -mmacosx-version-min=13.3" \
  CXXFLAGS="-arch arm64 -isysroot $SDK -mmacosx-version-min=13.3" \
  "$WORK/libvpx/configure" --target=arm64-darwin20-gcc --enable-static --disable-shared \
    --disable-examples --disable-tools --disable-docs --disable-unit-tests --disable-vp8-encoder --disable-vp9-encoder --disable-webm-io
  make -j3
)
find "$WORK/webp-build" -name 'libwebp.a' -exec cp '{}' "$DEST/lib/" \;
find "$WORK/webp-build" -name 'libwebpdemux.a' -exec cp '{}' "$DEST/lib/" \;
find "$WORK/webp-build" -name 'libsharpyuv.a' -exec cp '{}' "$DEST/lib/" \;
find "$WORK/webm-build" -name 'libwebm.a' -exec cp '{}' "$DEST/lib/" \;
cp "$WORK/vpx-build/libvpx.a" "$DEST/lib/"
cp -R "$WORK/libwebp/src/webp" "$DEST/include/"
cp -R "$WORK/libwebm/mkvparser" "$DEST/include/"
cp -R "$WORK/libvpx/vpx" "$DEST/include/"
for name in libwebp libwebm libvpx; do
  mkdir -p "$DEST/licenses/$name"
  for notice in LICENSE COPYING PATENTS AUTHORS; do [[ ! -f "$WORK/$name/$notice" ]] || cp "$WORK/$name/$notice" "$DEST/licenses/$name/"; done
  git -C "$WORK/$name" rev-parse HEAD > "$DEST/licenses/$name/SOURCE_SHA.txt"
done
for lib in libwebp.a libwebpdemux.a libwebm.a libvpx.a; do
  [[ "$(lipo -archs "$DEST/lib/$lib")" == arm64 ]] || { echo "$lib has the wrong architecture." >&2; exit 1; }
done
(cd "$DEST"; find lib -name '*.a' -type f -exec shasum -a 256 '{}' \; > SDK_SHA256.txt)
printf 'Pinned native codec SDK: %s\n' "$DEST"
