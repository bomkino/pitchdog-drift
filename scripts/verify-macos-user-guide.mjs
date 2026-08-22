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
    "Use **File → Save Portable Project…**",
    "Open it through **File → Open Project…**",
    "**Command–O:** Open `.pitched` project",
    "**Command–S:** Save portable project",
  ]);
  forbidMarkers([
    "Drift V2 Dev does **not** open, save, register, or own `.pitched` documents.",
    "npm run build:mac:v2-dev",
  ]);
} else {
  requireMarkers([
    "# Drift V2 Dev for macOS — user guide",
    "Drift V2 Dev does **not** open, save, register, or own `.pitched` documents.",
    "Use `/Applications/Drift.app` for real projects and portable `.pitched` backups.",
    "npm run build:mac:v2-dev",
    "npm run verify:mac:v2-dev",
    "build/macos/v2-dev/Drift V2 Dev.app",
    "Portable-project Open and Save commands stay disabled.",
    "Help → View Complete Source",
  ]);
  forbidMarkers([
    "Use **File → Save Portable Project…**",
    "Use **File → Open Project…**",
    "Open With Drift",
    "**Command–O:** Open `.pitched` project",
    "**Command–S:** Save portable project",
    "Drag `Drift.app` from the disk image to Applications.",
  ]);
  const unsafePitchedLine = guide
    .split(/\r?\n/)
    .find((line) => line.includes(".pitched") && ![
      "does **not**",
      "Use `/Applications/Drift.app`",
      "ownership remains with `Drift.app`",
    ].some((safeMarker) => line.includes(safeMarker)));
  if (unsafePitchedLine) {
    fail(`v2-dev guide contains an ownership-ambiguous .pitched line: ${JSON.stringify(unsafePitchedLine)}`);
  }
}

console.log(`Verified ${buildChannel} macOS user guide: ${guidePath}`);
