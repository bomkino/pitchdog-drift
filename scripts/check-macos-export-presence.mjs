import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`macOS export-presence contract failed: ${message}`); };
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
const sliceBetween = (source, start, end, label) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) fail(`could not isolate ${label}`);
  return source.slice(startIndex, endIndex);
};
const requireBefore = (source, first, second, label) => {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    fail(`${label} no longer keeps ${JSON.stringify(first)} before ${JSON.stringify(second)}`);
  }
};

const models = requireMarkers("macos/App/NativeModels.swift", [
  "import AppKit",
  'let driftExportDockBadge = "EXPORT"',
  "typealias DockBadgeWriter = (String?) -> Void",
  "private(set) var dockBadgeLabel: String?",
  "dockBadgeWriter: @escaping DockBadgeWriter",
  "setDockBadge(driftExportDockBadge)",
  "setDockBadge(nil)",
  "guard dockBadgeLabel != label else { return }",
  "NSApplication.shared.dockTile.badgeLabel = label",
  "Thread.isMainThread",
  "DispatchQueue.main.async(execute: apply)",
  "badgeWrites.count == 1",
  "badgeWrites.count == 2",
  "badgeWrites[0] == driftExportDockBadge",
  "badgeWrites[1] == nil",
  "Dock export badge survived completion",
  "Drift export power and Dock-presence self-test passed.",
]);

const badgeMatch = models.match(/let driftExportDockBadge = "([A-Z]{1,8})"/);
if (!badgeMatch || badgeMatch[1] !== "EXPORT") {
  fail("Dock badge must remain the short allow-listed literal EXPORT");
}

const guardStart = models.indexOf("final class ExportActivityGuard");
if (guardStart < 0) fail("ExportActivityGuard is missing");
const guardBody = models.slice(guardStart);
for (const forbidden of [
  "projectName",
  "fileName",
  "lastNotice",
  "absolute",
  "path",
  "progress",
  "percentage",
  "frameIndex",
]) {
  if (guardBody.includes(forbidden)) {
    fail(`ExportActivityGuard carries forbidden dynamic or identifying field ${JSON.stringify(forbidden)}`);
  }
}
if ((guardBody.match(/dockBadgeWriter\(/g) ?? []).length !== 1) {
  fail("Dock badge writer must be reached only through the deduplicating setter");
}
if ((guardBody.match(/setDockBadge\(nil\)/g) ?? []).length !== 1) {
  fail("Dock badge cleanup must have exactly one convergent implementation");
}

const host = requireMarkers("macos/App/NativeBridgeHost.swift", [
  "exportActivityGuard.update(isExporting: clientState.exportInProgress)",
  "func abortAllWrites()",
  "private func resetCapabilitiesForDocumentBoot()",
  "deinit",
]);
if ((host.match(/exportActivityGuard\.end\(\)/g) ?? []).length < 3) {
  fail("quit, document reset, and native abort must all clear export presence");
}

const app = read("src/App.tsx");
const mp4 = sliceBetween(
  app,
  "const exportVideo = useCallback(async () => {",
  "const exportStill = useCallback(async () => {",
  "the MP4 export path",
);
requireBefore(
  mp4,
  "fileHandle = await savePicker({",
  "session = beginExport();",
  "MP4 destination preflight",
);
const still = sliceBetween(
  app,
  "const exportStill = useCallback(async () => {",
  "const exportFrames = useCallback(async () => {",
  "the PNG-still export path",
);
requireBefore(
  still,
  "session = beginExport();",
  "await downloadBlob(result.blob",
  "PNG-still protected save lifecycle",
);
const sequence = sliceBetween(
  app,
  "const exportFrames = useCallback(async () => {",
  "const savePortableProjectNow = useCallback(async () => {",
  "the PNG-sequence export path",
);
requireBefore(
  sequence,
  "session = beginExport();",
  "const directory = await picker({",
  "PNG-sequence protected chooser lifecycle",
);

requireMarkers("macos/CI/probe-macos-packaged-webview.sh-ci", [
  "DRIFT_WEBVIEW_LOG_TIMEOUT",
  "subprocess.run([real_log, *arguments]",
  "timeout=timeout",
  "the bounded application receipt remains authoritative",
  "bash \"$ROOT/scripts/probe-macos-packaged-webview.sh\"",
]);
requireMarkers(".github/workflows/macos.yml", [
  'DRIFT_WEBVIEW_MATRIX_TIMEOUT: "100"',
  'DRIFT_WEBVIEW_LOG_TIMEOUT: "20"',
  "bash macos/CI/probe-macos-packaged-webview.sh-ci",
]);

requireMarkers("docs/MACOS_EXPORT_PRESENCE.md", [
  "The Dock badge reads **EXPORT** only while Drift reports an authoritative protected export lifecycle.",
  "MP4 asks for its destination first.",
  "PNG sequence enters protected export state before its directory chooser.",
  "PNG still renders before its native save panel.",
  "The badge is presence, not progress.",
  "No new renderer message, timer, DOM observer, polling loop, or high-frequency bridge event was added.",
  "Completion, cancellation, native abort, document reload, WebKit content-process termination, window teardown, and app termination",
  "EXPORT\nclear",
  "MP4 destination selection precedes `beginExport()`",
  "PNG still enters `beginExport()` before its native save",
  "PNG sequence enters `beginExport()` before its directory chooser",
  "Physical-Mac review",
  "is Drift still exporting?",
]);

console.log(
  "macOS export-presence contract passed: one privacy-safe EXPORT badge follows authoritative native export protection, deduplicates updates, clears through every shared terminal path, its MP4, still, and sequence timing claims are checked against App.tsx, and optional unified-log collection cannot consume the app-evidence budget.",
);
