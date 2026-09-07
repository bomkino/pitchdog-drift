#!/bin/bash
# Public SDKs do not provide archive.h. Build the reviewed ZIP64 implementation,
# rather than relying on private Apple headers or an installed Homebrew library.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${DRIFT_CODEC_SDK:-$ROOT/build/native-codecs}"
WORK="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/drift-archive-build"
SHA=27cbc7827172698143e440801fc0ba39ccb4f1f5
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]]
mkdir -p "$DEST/lib" "$DEST/include" "$DEST/licenses/libarchive" "$WORK"
if [[ ! -d "$WORK/source/.git" ]]; then git init -q "$WORK/source"; git -C "$WORK/source" remote add origin https://github.com/libarchive/libarchive.git; fi
git -C "$WORK/source" fetch --depth 1 origin "$SHA"
git -C "$WORK/source" checkout --detach "$SHA"
[[ "$(git -C "$WORK/source" rev-parse HEAD)" == "$SHA" ]]
cmake -S "$WORK/source" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=13.3 \
 -DCMAKE_OSX_SYSROOT="$(xcrun --sdk macosx --show-sdk-path)" -DBUILD_SHARED_LIBS=OFF -DENABLE_TEST=OFF \
 -DENABLE_TAR=OFF -DENABLE_CPIO=OFF -DENABLE_CAT=OFF -DENABLE_UNZIP=OFF -DENABLE_INSTALL=OFF \
 -DENABLE_OPENSSL=OFF -DENABLE_MBEDTLS=OFF -DENABLE_NETTLE=OFF -DENABLE_LIBB2=OFF -DENABLE_LZMA=OFF \
 -DENABLE_ZSTD=OFF -DENABLE_BZip2=OFF -DENABLE_LZ4=OFF -DENABLE_LIBXML2=OFF -DENABLE_EXPAT=OFF \
 -DENABLE_PCRE2POSIX=OFF -DENABLE_PCREPOSIX=OFF -DENABLE_ICONV=OFF -DENABLE_ZLIB=ON
cmake --build "$WORK/build" --target archive_static --parallel 3
cp "$WORK/build/libarchive/libarchive.a" "$DEST/lib/"
cp "$WORK/source/libarchive/archive.h" "$WORK/source/libarchive/archive_entry.h" "$DEST/include/"
cp "$WORK/source/COPYING" "$DEST/licenses/libarchive/"
printf '%s\n' "$SHA" > "$DEST/licenses/libarchive/SOURCE_SHA.txt"
[[ "$(lipo -archs "$DEST/lib/libarchive.a")" == arm64 ]]
(cd "$DEST"; shasum -a 256 lib/libarchive.a > ARCHIVE_SHA256.txt)
