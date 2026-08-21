import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`macOS native-presentation contract failed: ${message}`); };
const read = (path) => {
  if (!existsSync(at(path))) fail(`missing ${path}`);
  return readFileSync(at(path), "utf8");
};

const presentation = read("macos/App/NativePresentation.swift");
for (const marker of [
  "textView.maxSize = NSSize(",
  "width: CGFloat.greatestFiniteMagnitude",
  "height: CGFloat.greatestFiniteMagnitude",
  "textView.textContainer?.containerSize = NSSize(",
]) {
  if (!presentation.includes(marker)) {
    fail(`NativePresentation.swift is missing ${JSON.stringify(marker)}`);
  }
}

if ((presentation.match(/CGFloat\.greatestFiniteMagnitude/g) ?? []).length !== 3) {
  fail("User Guide sizing must use exactly three explicit CGFloat greatest-finite bounds");
}
for (const forbidden of [
  "width: .greatestFiniteMagnitude",
  "height: .greatestFiniteMagnitude",
]) {
  if (presentation.includes(forbidden)) {
    fail(`NativePresentation.swift contains ambiguous Swift numeric inference ${JSON.stringify(forbidden)}`);
  }
}

const packageJson = read("package.json");
if (!packageJson.includes("node scripts/check-macos-native-presentation.mjs")) {
  fail("check:mac-source does not execute the native-presentation checker");
}
const workflow = read(".github/workflows/macos.yml");
if (!workflow.includes('"scripts/check-macos-native-presentation.mjs"')) {
  fail("macOS workflow path filters do not cover the native-presentation checker");
}

console.log(
  "macOS native-presentation contract passed: AppKit User Guide dimensions use explicit CGFloat bounds, avoiding Swift compiler ambiguity while retaining unbounded vertical layout.",
);
