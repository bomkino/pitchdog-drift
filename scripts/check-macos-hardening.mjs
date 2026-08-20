import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`macOS hardening contract failed: ${message}`); };
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

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const requireValidPngFixture = (source) => {
  const match = source.match(/const validPng = "([A-Za-z0-9+/=]+)";/);
  if (!match) fail("native-menu import test has no bounded validPng base64 fixture");
  const png = Buffer.from(match[1], "base64");
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 45 || !png.subarray(0, 8).equals(signature)) {
    fail("native-menu import fixture is not a complete PNG");
  }

  let offset = 8;
  const chunkTypes = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > png.length) fail("native-menu import PNG has a truncated chunk");
    const type = png.subarray(offset + 4, offset + 8);
    const payload = png.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = png.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([type, payload]));
    const typeName = type.toString("ascii");
    if (actualCrc !== expectedCrc) {
      fail(`native-menu import PNG has a bad ${typeName} checksum`);
    }
    chunkTypes.push(typeName);
    offset = chunkEnd;
    if (typeName === "IEND") break;
  }
  if (offset !== png.length || chunkTypes[0] !== "IHDR" || !chunkTypes.includes("IDAT") || chunkTypes.at(-1) !== "IEND") {
    fail("native-menu import PNG is missing its canonical IHDR/IDAT/IEND structure");
  }
};

const broker = requireMarkers("macos/App/NativeFileBroker.swift", [
  "private let driftRenameExclusiveFlag: UInt32 = 0x00000004",
  "enum WriteDisposition",
  "case createOnly",
  "writeDisposition: .createOnly",
  "Darwin.renamex_np(sourcePath, destinationPath, driftRenameExclusiveFlag)",
  "guard !exists else { throw frameCollision(name) }",
  "Existing PNG sequence files are never overwritten.",
  "create:true leaked an empty sequence frame before commit",
  "Commit-time frame collision unexpectedly overwrote a file",
  "Aborted sequence write left a final frame behind",
  "fileGrants.removeAll()",
  "directoryGrants.removeAll()",
  "abortAll left a stale file capability usable",
]);
if ((broker.match(/Darwin\.renamex_np/g) ?? []).length !== 1) {
  fail("create-only sequence commit must have exactly one exclusive rename path");
}
forbidMarkers("macos/App/NativeFileBroker.swift", [
  "if !exists && create && !fileManager.createFile(atPath: fileURL.path",
  "return try registerFile(fileURL, mode: .readWrite)\n    }\n\n    func removeDirectoryEntry",
]);

const host = requireMarkers("macos/App/NativeBridgeHost.swift", [
  "case \"runtime-info\":\n            resetCapabilitiesForDocumentBoot()",
  "private func resetCapabilitiesForDocumentBoot()",
  "broker.abortAll()",
  "aacBroker.closeAll()",
  "inputIntent = nil",
  "clientState = ClientState()",
  "clientStateDidChange?(clientState)",
  "This covers manual reload",
]);
const resetStart = host.indexOf("private func resetCapabilitiesForDocumentBoot()");
const resetEnd = host.indexOf("private func runtimeInfo()", resetStart);
const resetBody = host.slice(resetStart, resetEnd);
for (const marker of ["exportActivityGuard.end()", "broker.abortAll()", "aacBroker.closeAll()", "inputIntent = nil", "clientState = ClientState()"]) {
  if (!resetBody.includes(marker)) fail(`document-boot reset lost ${JSON.stringify(marker)}`);
}

const bridge = read("macos/NativeBridge.js");
const runtimeBootCalls = bridge.match(/callNative\("runtime-info"\)/g) ?? [];
if (runtimeBootCalls.length !== 1) {
  fail(`NativeBridge.js must make exactly one runtime-info call per document; found ${runtimeBootCalls.length}`);
}
requireMarkers("macos/NativeBridge.js", [
  "const boot = () => {",
  "document.addEventListener(\"DOMContentLoaded\", boot, { once: true })",
]);

requireMarkers("src/components/NativeFileInputBridge.tsx", [
  "nativeImportKindForInput",
  "assignFilesAndDispatchChange",
  "document.documentElement.dataset.driftNativeFileInputBridge = \"ready\"",
  "document.addEventListener(\"click\", onClick, true)",
  "event.preventDefault()",
  "event.stopImmediatePropagation()",
  "pickNativeMacFiles(kind, input.multiple)",
  "Finish or cancel the open file chooser",
  "role=\"alert\"",
  "aria-live=\"assertive\"",
]);
requireMarkers("src/main.tsx", [
  "import { NativeFileInputBridge }",
  "<NativeFileInputBridge />",
]);
requireMarkers("tests/nativeFileInputBridge.test.ts", [
  "routes portable projects",
  "routes every supported presenter spelling",
  "routes image and unknown file contracts",
]);
const nativeMenuImport = requireMarkers("e2e/native-menu-import.e2e.ts", [
  "File-menu Add Slides replaces the demo slate through one native picker and releases its grant",
  "data-drift-native-file-input-bridge",
  "await state.appBridge.command(\"add-slides\")",
  "expect(initialCount).toBeGreaterThan(1)",
  "toHaveCount(1)",
  "first real deck must replace those eight demos rather than becoming slide 9",
  "callCount: 1",
  "releaseCount: 1",
  "File-menu picker failure remains visible and operable",
  "Dismiss native file error",
]);
forbidMarkers("e2e/native-menu-import.e2e.ts", [
  "initialCount + 1",
  "onePixelPng",
]);
requireValidPngFixture(nativeMenuImport);

console.log(
  "macOS hardening contract passed: PNG sequence commits are exclusive and crash-clean; document boots revoke stale capabilities; and File-menu imports prove a checksum-valid image replaces the demo slate through one picker with one released grant.",
);
