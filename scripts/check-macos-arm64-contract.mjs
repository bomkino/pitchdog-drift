import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`macOS arm64 source contract failed: ${message}`);
  process.exitCode = 1;
};
const requireText = (path, expected) => {
  if (!read(path).includes(expected)) fail(`${path} is missing ${JSON.stringify(expected)}`);
};
const requireCount = (path, pattern, expected) => {
  const actual = [...read(path).matchAll(pattern)].length;
  if (actual !== expected) fail(`${path} has ${actual} matches for ${pattern}; expected ${expected}`);
};

const maintainedArchitecturePaths = [
  ".github/workflows/macos.yml",
  ".github/workflows/macos-release.yml",
  ".github/workflows/macos-runtime.yml",
  "macos/App/NativeModels.swift",
  "scripts/build-macos-app.sh",
  "scripts/package-macos-dmg.sh",
  "scripts/release-macos-app.sh",
  "scripts/verify-macos-app.sh",
  "scripts/verify-macos-dmg.sh",
  "scripts/verify-macos-release.sh",
];

for (const path of maintainedArchitecturePaths) {
  const source = read(path);
  if (/x86_64|macOS-universal|universal signed app|universal V2 development app/u.test(source)) {
    fail(`${path} retains an Intel/universal package assumption`);
  }
}

requireText("scripts/build-macos-app.sh", 'ARCHITECTURES="${DRIFT_MACOS_ARCHS:-arm64}"');
requireText("scripts/build-macos-app.sh", 'DRIFT_MACOS_ARCHS must be exactly arm64');
requireText("scripts/build-macos-app.sh", 'MINIMUM_MACOS="${DRIFT_MACOS_DEPLOYMENT_TARGET:-13.3}"');
requireText("scripts/verify-macos-app.sh", 'expected_archs="${DRIFT_EXPECT_ARCHS:-arm64}"');
requireText("scripts/verify-macos-app.sh", 'DRIFT_EXPECT_ARCHS must be exactly arm64');
requireText("scripts/verify-macos-release.sh", '[[ "$ARCHS" == "arm64" ]]');
requireText("scripts/verify-macos-release.sh", "manifest.architectures.length !== 1");
requireText("scripts/verify-macos-release.sh", "manifest.architectures[0] !== 'arm64'");
requireText("scripts/package-macos-dmg.sh", "macOS-arm64.dmg");
requireText("scripts/verify-macos-dmg.sh", "macOS-arm64.dmg");
requireText("macos/App/NativeModels.swift", '#if arch(arm64)');
requireText("macos/App/NativeModels.swift", 'return "unsupported"');

for (const path of [
  ".github/workflows/macos.yml",
  ".github/workflows/macos-release.yml",
  ".github/workflows/macos-runtime.yml",
]) {
  requireText(path, '[[ "$(uname -m)" == "arm64" ]]');
}
requireCount(".github/workflows/macos.yml", /^\s+runs-on: macos-15$/gmu, 3);
requireCount(".github/workflows/macos.yml", /^\s+- name: Require Apple Silicon runner$/gmu, 3);
requireCount(".github/workflows/macos-release.yml", /^\s+runs-on: macos-15$/gmu, 1);
requireCount(".github/workflows/macos-runtime.yml", /^\s+runs-on: macos-15$/gmu, 1);

requireText("README.md", "Apple-Silicon-only `arm64` application");
requireText("README.md", "Intel Macs and Windows are unsupported");
requireText("docs/MACOS_APP.md", "deployment floor remains macOS 13.3");
requireText("docs/MACOS_PRODUCT_CONTRACT.md", "Apple-Silicon-only `arm64` compilation");
requireText("docs/MACOS_RELEASE.md", "Apple-Silicon-only `arm64` application");
requireText("docs/MACOS_RELEASE_CHECKLIST.md", "`lipo -archs` reports exactly `arm64`");
requireText("docs/MACOS_QA.md", "Intel Macs and Windows are outside the supported Product boundary");
requireText("docs/MACOS_THREAT_MODEL.md", "Exact arm64-only architecture readback");

if (process.exitCode) process.exit();
console.log("macOS arm64 source contract passed: maintained build, CI, verification, package names, runtime identity, deployment floor, and current support docs are Apple-Silicon-only.");
