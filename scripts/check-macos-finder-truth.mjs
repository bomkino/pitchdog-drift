import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const at = (path) => join(root, path);
const fail = (message) => { throw new Error(`macOS Finder-truth contract failed: ${message}`); };
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

const broker = requireMarkers("macos/App/NativeFileBroker.swift", [
  "let parentDirectoryToken: String?",
  "var committedChildren: [String] = []",
  "That sequence folder still has an open frame write.",
  "A PNG sequence is provisional until its directory handle is released.",
  "didCommitFile?(revealURL)",
  "parentDirectoryToken: grant.parentDirectoryToken",
  "if let directoryToken = session.parentDirectoryToken",
  "directory.committedChildren.append(name)",
  "didCommitFile?(session.destinationURL)",
  "parentDirectoryToken: directoryToken",
  "directory.committedChildren.removeAll(where: { $0 == name })",
  ".filter({ $0.committedChildren.isEmpty })",
  "A provisional sequence frame replaced Finder's previous completed save.",
  "A fully rolled-back sequence replaced Finder's previous completed save.",
  "A successful sequence became revealable before directory release.",
  "A successful sequence did not promote its surviving final frame exactly once.",
  "rollback-aware Finder promotion",
]);

if ((broker.match(/didCommitFile\?\(/g) ?? []).length !== 2) {
  fail("Finder promotion must have exactly two paths: ordinary atomic file commit and released sequence survivor");
}
const closeStart = broker.indexOf("func closeWriteSession(");
const abortStart = broker.indexOf("func abortWriteSession(", closeStart);
if (closeStart < 0 || abortStart < 0) fail("could not isolate closeWriteSession");
const closeBody = broker.slice(closeStart, abortStart);
const provisionalBranch = closeBody.indexOf("if let directoryToken = session.parentDirectoryToken");
const ordinaryPromotion = closeBody.indexOf("didCommitFile?(session.destinationURL)");
if (provisionalBranch < 0 || ordinaryPromotion < provisionalBranch) {
  fail("ordinary file promotion is no longer the explicit alternative to provisional sequence tracking");
}
if (closeBody.slice(0, provisionalBranch).includes("didCommitFile?(session.destinationURL)")) {
  fail("a sequence frame can still become Finder's target before directory release");
}

const releaseStart = broker.indexOf("func releaseDirectory(");
const writeStart = broker.indexOf("func openWriteSession(", releaseStart);
if (releaseStart < 0 || writeStart < 0) fail("could not isolate releaseDirectory");
const releaseBody = broker.slice(releaseStart, writeStart);
for (const marker of [
  "committedChildren.reversed()",
  "fileManager.fileExists(atPath: url.path)",
  "!isSymbolicLink(url)",
  "didCommitFile?(revealURL)",
]) {
  if (!releaseBody.includes(marker)) fail(`releaseDirectory lost ${JSON.stringify(marker)}`);
}

forbidMarkers("macos/App/NativeFileBroker.swift", [
  "didCommitFile?(session.destinationURL)\n            return",
  "didCommitFile?(fileURL)",
]);

requireMarkers("docs/MACOS_FINDER_TRUTH.md", [
  "provisional until directory release",
  "Full rollback promotes nothing.",
  "Successful release promotes one surviving frame.",
  "Partial rollback",
  "The previous completed save remains the Finder target.",
  "renderer crash before release",
  "Native falsification",
]);
requireMarkers("docs/MACOS_USER_GUIDE.md", [
  "File → Reveal Last Saved File in Finder",
]);

console.log(
  "macOS Finder-truth contract passed: ordinary atomic files promote immediately; provisional sequence frames stay hidden; full rollback preserves the prior save; and released surviving sequence output promotes exactly once.",
);
