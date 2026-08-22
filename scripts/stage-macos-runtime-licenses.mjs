import { createHash } from "node:crypto";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const components = [
  {
    packageName: "react",
    displayName: "React",
    version: "19.2.8",
    license: "MIT",
    copyrightNotice: "Copyright (c) Meta Platforms, Inc. and affiliates.",
    sourceURL: "https://registry.npmjs.org/react/-/react-19.2.8.tgz",
    licenseSource: "LICENSE",
    licenseFile: "React-19.2.8-MIT.txt",
    licenseSha256: "da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93",
  },
  {
    packageName: "react-dom",
    displayName: "React DOM",
    version: "19.2.8",
    license: "MIT",
    copyrightNotice: "Copyright (c) Meta Platforms, Inc. and affiliates.",
    sourceURL: "https://registry.npmjs.org/react-dom/-/react-dom-19.2.8.tgz",
    licenseSource: "LICENSE",
    licenseFile: "ReactDOM-19.2.8-MIT.txt",
    licenseSha256: "da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93",
  },
  {
    packageName: "scheduler",
    displayName: "Scheduler",
    version: "0.27.0",
    license: "MIT",
    copyrightNotice: "Copyright (c) Meta Platforms, Inc. and affiliates.",
    sourceURL: "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz",
    licenseSource: "LICENSE",
    licenseFile: "Scheduler-0.27.0-MIT.txt",
    licenseSha256: "da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93",
  },
  {
    packageName: "three",
    displayName: "Three.js",
    version: "0.185.1",
    license: "MIT",
    copyrightNotice: "Copyright 2010-2026 three.js authors.",
    sourceURL: "https://registry.npmjs.org/three/-/three-0.185.1.tgz",
    licenseSource: "LICENSE",
    licenseFile: "Three.js-0.185.1-MIT.txt",
    licenseSha256: "8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc",
  },
  {
    packageName: "mediabunny",
    displayName: "Mediabunny",
    version: "1.55.1",
    license: "MPL-2.0",
    copyrightNotice: "Copyright (c) 2026-present, Vanilagy and contributors.",
    sourceURL: "https://registry.npmjs.org/mediabunny/-/mediabunny-1.55.1.tgz",
    licenseSource: "LICENSE",
    licenseFile: "Mediabunny-1.55.1-MPL-2.0.txt",
    licenseSha256: "3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04",
  },
  {
    packageName: "fflate",
    displayName: "fflate",
    version: "0.8.3",
    license: "MIT",
    copyrightNotice: "Copyright (c) 2026 Arjun Barrett.",
    sourceURL: "https://registry.npmjs.org/fflate/-/fflate-0.8.3.tgz",
    licenseSource: "LICENSE",
    licenseFile: "fflate-0.8.3-MIT.txt",
    licenseSha256: "0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551",
  },
];

const mode = process.argv[2];
const destination = process.argv[3] ? resolve(process.argv[3]) : null;
if (!destination || !["stage", "verify"].includes(mode)) {
  throw new Error("usage: node scripts/stage-macos-runtime-licenses.mjs <stage|verify> <absolute-directory>");
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestComponents = components.map((component) => ({
  package: component.packageName,
  name: component.displayName,
  version: component.version,
  license: component.license,
  copyrightNotice: component.copyrightNotice,
  sourceURL: component.sourceURL,
  licenseFile: component.licenseFile,
  licenseSha256: component.licenseSha256,
}));
const manifest = {
  schemaVersion: 1,
  boundary: "standalone-macos-runtime",
  exactVersionsFrom: "package-lock.json",
  components: manifestComponents,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const markdownText = [
  "# Standalone macOS runtime components",
  "",
  "These are the third-party components compiled into Drift.app's signed Web runtime. Each exact upstream licence text is beside this file and hash-bound in `MANIFEST.json`.",
  "",
  "| Component | Version | Licence | Copyright notice | Exact source |",
  "| --- | --- | --- | --- | --- |",
  ...components.map((component) => (
    `| ${component.displayName} | ${component.version} | ${component.license} | ${component.copyrightNotice} | ${component.sourceURL} |`
  )),
  "",
  "Mediabunny is consumed unmodified from its published source package. Drift's macOS AAC adapter is project-authored AGPL software; the standalone app does not contain `@mediabunny/aac-encoder`, FFmpeg, or its WebAssembly binary.",
  "",
].join("\n");

function assertRegularFile(path, label) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be one regular non-symlink file: ${path}`);
  }
  return metadata;
}

function verifyLicense(path, component) {
  const metadata = assertRegularFile(path, component.displayName);
  if (metadata.size === 0) throw new Error(`${component.displayName} licence text is empty.`);
  const digest = sha256(readFileSync(path));
  if (digest !== component.licenseSha256) {
    throw new Error(`${component.displayName} licence hash changed: expected ${component.licenseSha256}, received ${digest}.`);
  }
}

if (mode === "stage") {
  mkdirSync(destination, { recursive: true });
  for (const component of components) {
    const packageRoot = join(root, "node_modules", component.packageName);
    const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    if (packageMetadata.version !== component.version || packageMetadata.license !== component.license) {
      throw new Error(`${component.displayName} package metadata differs from the audited runtime licence inventory.`);
    }
    const source = join(packageRoot, component.licenseSource);
    verifyLicense(source, component);
    copyFileSync(source, join(destination, component.licenseFile));
  }
  writeFileSync(join(destination, "MANIFEST.json"), manifestText, "utf8");
  writeFileSync(join(destination, "RUNTIME_COMPONENTS.md"), markdownText, "utf8");
}

const expectedNames = [
  "MANIFEST.json",
  "RUNTIME_COMPONENTS.md",
  ...components.map((component) => component.licenseFile),
].sort();
const actualNames = readdirSync(destination).sort();
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`runtime licence directory has an unexpected target set: ${JSON.stringify(actualNames)}`);
}
for (const component of components) verifyLicense(join(destination, component.licenseFile), component);
assertRegularFile(join(destination, "MANIFEST.json"), "runtime licence manifest");
assertRegularFile(join(destination, "RUNTIME_COMPONENTS.md"), "runtime component notice");
if (readFileSync(join(destination, "MANIFEST.json"), "utf8") !== manifestText) {
  throw new Error("runtime licence manifest differs from the exact audited inventory.");
}
if (readFileSync(join(destination, "RUNTIME_COMPONENTS.md"), "utf8") !== markdownText) {
  throw new Error("runtime component notice differs from the exact audited inventory.");
}

console.log(`${mode === "stage" ? "Staged and verified" : "Verified"} ${components.length} standalone macOS runtime licence texts.`);
