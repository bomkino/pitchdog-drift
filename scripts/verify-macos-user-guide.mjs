import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [buildChannel, rawPath] = process.argv.slice(2);
const fail = (message) => {
  throw new Error(`macOS user-guide verification failed: ${message}`);
};

if (!rawPath || !["release", "v2-dev"].includes(buildChannel)) {
  fail("usage: node scripts/verify-macos-user-guide.mjs <release|v2-dev> <guide-path>");
}

const guidePath = resolve(rawPath);
const metadata = lstatSync(guidePath);
if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size === 0) {
  fail(`guide must be one non-empty regular file: ${guidePath}`);
}

const guide = readFileSync(guidePath, "utf8");
const requireMarkers = (markers) => {
  for (const marker of markers) {
    if (!guide.includes(marker)) fail(`${buildChannel} guide is missing ${JSON.stringify(marker)}`);
  }
};
const forbidMarkers = (markers) => {
  for (const marker of markers) {
    if (guide.includes(marker)) fail(`${buildChannel} guide contains forbidden ${JSON.stringify(marker)}`);
  }
};

if (buildChannel === "release") {
  requireMarkers([
    "# Drift for macOS — user guide",
    "Use **File → Save Project** or **Command–S**",
    "Use **File → Save Project As…**",
    "Open it through **File → Open Project…**",
    "**Command–O:** Open `.pitched` project",
    "**Command–S:** Save project",
  ]);
  forbidMarkers([
    "Drift V2 Dev does **not** open, save, register, or own `.pitched` documents.",
    "npm run build:mac:v2-dev",
  ]);
} else {
  requireMarkers([
    "# Drift V2 Dev for macOS — user guide",
    "Drift V2 Dev can open, save, save as, and revert user-selected `.pitched` documents.",
    "It does **not** register or own the `.pitched` Finder document type",
    "npm run build:mac:v2-dev",
    "npm run verify:mac:v2-dev",
    "build/macos/v2-dev/Drift V2 Dev.app",
    "Use **File → Open Project…** or **Command–O**",
    "Use **File → Save Project**, **Command–S**, or **File → Save Project As…**",
    "Finder document ownership remains with `Drift.app`",
    "Help → View Complete Source",
  ]);
  forbidMarkers([
    "Use **File → Save Portable Project…**",
    "Portable-project Open and Save commands stay disabled.",
    "does **not** open, save, register, or own",
    "Open With Drift",
    "Drag `Drift.app` from the disk image to Applications.",
  ]);
}

console.log(`Verified ${buildChannel} macOS user guide: ${guidePath}`);
