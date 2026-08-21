import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`macOS document-identity contract failed: ${message}`); };
const read = (path) => {
  if (!existsSync(at(path))) fail(`missing ${path}`);
  return readFileSync(at(path), "utf8");
};
const requireMarkers = (path, markers) => {
  const text = read(path);
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`${path} is missing ${JSON.stringify(marker)}`);
  }
  return text;
};
const forbidMarkers = (path, markers) => {
  const text = read(path);
  for (const marker of markers) {
    if (text.includes(marker)) fail(`${path} contains forbidden ${JSON.stringify(marker)}`);
  }
};

const generator = requireMarkers("scripts/generate-macos-document-icon.py", [
  "Generate DriftDocument.iconset using only Python's standard library.",
  "def draw_document_body",
  "def draw_fold",
  "def draw_panel",
  "def draw_rotated_frame",
  "def draw_metadata",
  '"icon_16x16.png": 16',
  '"icon_512x512@2x.png": 1024',
  'sys.argv[1] == "--smoke"',
  "png_chunk",
  "zlib.compress(scanlines, 9)",
]);
forbidMarkers("scripts/generate-macos-document-icon.py", [
  "PIL",
  "ImageMagick",
  "cairosvg",
  "requests",
  "urllib",
  "socket",
  "subprocess",
  "http://",
  "https://",
]);
if ((generator.match(/^import [^\n]+/gm) ?? []).some((entry) => ![
  "import math",
  "import shutil",
  "import struct",
  "import sys",
  "import zlib",
].includes(entry))) {
  fail("document icon generator imports an unreviewed top-level dependency");
}

const info = requireMarkers("macos/Info.plist", [
  "<key>CFBundleTypeIconFile</key>",
  "<string>DriftDocument</string>",
  "<key>UTTypeIconFile</key>",
  "<string>dog.pitch.pitched-project</string>",
]);
if ((info.match(/<string>DriftDocument<\/string>/g) ?? []).length !== 2) {
  fail("DriftDocument must be bound once by the document declaration and once by the exported UTI");
}

requireMarkers("scripts/build-macos-app.sh", [
  'DOCUMENT_ICONSET_DIR="${TEMP_DIR}/${APP_NAME}Document.iconset"',
  "python3 scripts/generate-macos-document-icon.py",
  'iconutil -c icns "${DOCUMENT_ICONSET_DIR}" -o "${RESOURCES_DIR}/${APP_NAME}Document.icns"',
  "document_icon=DriftDocument.icns",
]);
requireMarkers("scripts/verify-macos-app.sh", [
  '"${RESOURCES}/DriftDocument.icns"',
  'CFBundleTypeIconFile") != "DriftDocument"',
  'UTTypeIconFile") != "DriftDocument"',
  'iconutil -c iconset "${RESOURCES}/DriftDocument.icns"',
  "document_icon=DriftDocument.icns",
  "Document identity: DriftDocument.icns is bound to dog.pitch.pitched-project",
]);
requireMarkers("scripts/verify-macos-dmg.sh", [
  '"$ROOT/scripts/verify-macos-app.sh" "$MOUNT_ROOT/Drift.app"',
]);
requireMarkers("package.json", [
  "node scripts/check-macos-document-identity.mjs",
  "python3 -m py_compile scripts/generate-macos-icon.py scripts/generate-macos-document-icon.py",
]);
requireMarkers(".github/workflows/macos.yml", [
  '"scripts/generate-macos-document-icon.py"',
  '"scripts/check-macos-document-identity.mjs"',
]);
requireMarkers("docs/MACOS_DOCUMENT_IDENTITY.md", [
  "# Drift for macOS — `.pitched` document identity",
  "standard upper-right folded corner",
  "iconset from repository source",
  "CFBundleTypeIconFile",
  "UTTypeIconFile",
  "16 px",
  "Quick Look",
  "physical Mac",
]);

for (const forbiddenPath of [
  "macos/DriftDocument.icns",
  "docs/drift_document_icon_prototype.png",
  "docs/DriftDocument.png",
  "assets/DriftDocument.png",
]) {
  if (existsSync(at(forbiddenPath))) {
    fail(`generated or prototype binary must not be committed at ${forbiddenPath}`);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function decodeUnfilteredRgbaPng(path) {
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) fail(`${path} is not a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const compressed = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 6) {
    fail(`${path} must be an 8-bit RGBA PNG`);
  }
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const rgba = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const source = row * (stride + 1);
    if (raw[source] !== 0) fail(`${path} uses an unexpected PNG row filter`);
    raw.copy(rgba, row * stride, source + 1, source + 1 + stride);
  }
  return { width, height, rgba };
}

function pixel(image, x, y) {
  const index = (y * image.width + x) * 4;
  return [...image.rgba.subarray(index, index + 4)];
}

const first = mkdtempSync(join(tmpdir(), "drift-document-icon-a-"));
const second = mkdtempSync(join(tmpdir(), "drift-document-icon-b-"));
try {
  for (const output of [first, second]) {
    const run = spawnSync(
      "python3",
      [at("scripts/generate-macos-document-icon.py"), "--smoke", output],
      { cwd: root, encoding: "utf8", timeout: 30_000 },
    );
    if (run.status !== 0) {
      fail(`smoke generation failed: ${run.stderr || run.stdout || `status ${run.status}`}`);
    }
  }

  const expected = ["icon_16x16.png", "icon_32x32@2x.png"];
  if (JSON.stringify(readdirSync(first).sort()) !== JSON.stringify(expected)) {
    fail("smoke generator emitted an unexpected file set");
  }
  for (const name of expected) {
    if (sha256(join(first, name)) !== sha256(join(second, name))) {
      fail(`${name} is not deterministic across clean generations`);
    }
  }

  const small = decodeUnfilteredRgbaPng(join(first, "icon_16x16.png"));
  const medium = decodeUnfilteredRgbaPng(join(first, "icon_32x32@2x.png"));
  if (small.width !== 16 || small.height !== 16 || medium.width !== 64 || medium.height !== 64) {
    fail("smoke icon dimensions changed");
  }
  for (const image of [small, medium]) {
    if (pixel(image, 0, 0)[3] > 12 || pixel(image, image.width - 1, image.height - 1)[3] > 12) {
      fail(`${image.width}px icon lost its transparent outer corners`);
    }
    if (pixel(image, Math.floor(image.width / 2), Math.floor(image.height / 2))[3] < 240) {
      fail(`${image.width}px icon lost its opaque document body`);
    }
  }

  let cyan = false;
  let magenta = false;
  let paper = false;
  for (let index = 0; index < medium.rgba.length; index += 4) {
    const [red, green, blue, alpha] = medium.rgba.subarray(index, index + 4);
    if (alpha < 220) continue;
    cyan ||= green > red + 45 && blue > red + 35;
    magenta ||= red > green + 45 && red > blue + 15;
    paper ||= red > 220 && green > 215 && blue > 195;
  }
  if (!cyan || !magenta || !paper) {
    fail("64px document identity lost its cyan, magenta, or paper visual anchors");
  }
} finally {
  rmSync(first, { recursive: true, force: true });
  rmSync(second, { recursive: true, force: true });
}

console.log(
  "macOS document-identity contract passed: .pitched owns a deterministic multi-resolution source-generated icon, plist bindings agree, packaged verification expands the ICNS, and small-size visual anchors hold.",
);
