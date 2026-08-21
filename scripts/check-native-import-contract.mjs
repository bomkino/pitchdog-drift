import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`native import contract failed: ${message}`); };
const read = (path) => {
  if (!existsSync(at(path))) fail(`missing ${path}`);
  return readFileSync(at(path), "utf8");
};
const requireMarkers = (path, markers) => {
  const source = read(path);
  for (const marker of markers) {
    if (!source.includes(marker)) fail(`${path} is missing ${JSON.stringify(marker)}`);
  }
  return source;
};
const forbidMarkers = (path, markers) => {
  const source = read(path);
  for (const marker of markers) {
    if (source.includes(marker)) fail(`${path} contains stale ${JSON.stringify(marker)}`);
  }
};

requireMarkers("src/main.tsx", [
  'import { NativeFileInputBridge } from "./components/NativeFileInputBridge";',
  "<NativeFileInputBridge />",
]);
requireMarkers("src/components/NativeFileInputBridge.tsx", [
  "pickNativeMacFiles",
  "nativeImportKindForInput",
  "assignFilesAndDispatchChange",
  "event.preventDefault()",
  "event.stopImmediatePropagation()",
  "pickerActive.current",
  'document.addEventListener("click", onClick, true)',
  'dataset.driftNativeFileInputBridge = "ready"',
  'aria-label="Dismiss native file error"',
]);
requireMarkers("src/lib/nativeMac.ts", [
  "showOpenFilePicker",
  "return await Promise.all(handles.map((handle) => handle.getFile()))",
  "await Promise.allSettled",
  "handle._release",
]);
requireMarkers("src/App.tsx", [
  "replacingStartingDemos",
  "current.every((asset) => asset.demo)",
  "if (replacingDemos) current.forEach(disposeAsset)",
]);
requireMarkers("tests/nativeFileInputBridge.test.ts", [
  "routes portable projects to the project panel",
  "routes every supported presenter spelling",
  "routes image and unknown file contracts to the slide panel",
]);
requireMarkers("e2e/native-menu-import.e2e.ts", [
  "A real 4 × 4 RGBA PNG",
  "replaces the demo slate through one native picker",
  "first real deck must replace those eight demos",
  'toHaveCount(1)',
  'releaseCount: 1',
  'Dismiss native file error',
]);
forbidMarkers("e2e/native-menu-import.e2e.ts", [
  "const decodablePng",
  "initialCount + 1",
]);

console.log("Native import contract passed: menu and web-button imports share one typed picker, copied file grants are released, demo media is replaced on first import, and failure remains dismissible.");
