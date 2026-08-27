import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ELECTRON_VERSION = "44.0.0";
const ELECTRON_ARCHIVE_SHA256 = "d65286d812719f2b4c1a1b806a80f288a1058c89c7b058dae1e03ab25e499446";
const root = resolve(new URL("..", import.meta.url).pathname);
const archive = process.env.DRIFT_ELECTRON_ARCHIVE;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", stdio: "pipe", ...options });
  if (result.status !== 0) {
    fail(`${program} ${args.join(" ")} failed:\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return (result.stdout ?? "").trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function filesUnder(directory) {
  const output = [];
  const visit = async (current) => {
    for (const name of (await readdir(current)).sort()) {
      const pathname = join(current, name);
      const metadata = await stat(pathname);
      if (metadata.isDirectory()) await visit(pathname);
      else if (metadata.isFile()) output.push(pathname);
    }
  };
  await visit(directory);
  return output;
}

if (!archive) fail("Set DRIFT_ELECTRON_ARCHIVE to the pinned Electron Linux x64 ZIP.");
const archivePath = resolve(archive);
if (basename(archivePath) !== `electron-v${ELECTRON_VERSION}-linux-x64.zip`) {
  fail(`Electron archive must be electron-v${ELECTRON_VERSION}-linux-x64.zip.`);
}
const archiveBytes = await readFile(archivePath).catch(() => fail("Electron archive is unavailable."));
if (sha256(archiveBytes) !== ELECTRON_ARCHIVE_SHA256) fail("Electron archive SHA-256 did not match the pinned toolchain.");

const status = command("git", ["status", "--porcelain=v1"]);
if (status) fail("Linux tracer package requires a clean committed source tree.");
const sourceCommit = command("git", ["rev-parse", "HEAD"]);
const sourceTree = command("git", ["rev-parse", "HEAD^{tree}"]);
const output = join(root, "build", "linux-tracer", `drift-linux-tracer-${sourceCommit.slice(0, 12)}-electron-${ELECTRON_VERSION}`);
const web = join(root, "build", "linux-web", sourceTree);
const fixtureTool = join(root, "build", "linux-fixture-tool", sourceTree);

try {
  await stat(output);
  fail(`Refusing to replace existing Linux tracer artifact: ${output}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

command(join(root, "node_modules", ".bin", "tsc"), ["-b", "--pretty", "false"]);
command(join(root, "node_modules", ".bin", "vite"), ["build", "--mode", "linux", "--outDir", web, "--emptyOutDir"]);
command(join(root, "node_modules", ".bin", "vite"), [
  "build",
  "--mode",
  "linux-fixture",
  "--ssr",
  "scripts/linux-tracer-fixture.ts",
  "--outDir",
  fixtureTool,
  "--emptyOutDir",
]);
await mkdir(output, { recursive: true, mode: 0o755 });
command("unzip", ["-q", archivePath, "-d", output]);
const runtimeVersion = (await readFile(join(output, "version"), "utf8")).trim();
if (runtimeVersion !== ELECTRON_VERSION) fail("Extracted Electron runtime version did not match its pin.");
await chmod(join(output, "electron"), 0o755);
await chmod(join(output, "chrome-sandbox"), 0o4755);

const appRoot = join(output, "resources", "app");
await mkdir(join(appRoot, "linux"), { recursive: true, mode: 0o755 });
await cp(web, join(appRoot, "web"), { recursive: true, errorOnExist: true });
for (const name of ["main.cjs", "preload.cjs", "documentAuthority.cjs", "ipcContract.cjs"]) {
  await cp(join(root, "linux", name), join(appRoot, "linux", name), { errorOnExist: true });
}
const fixtureEntry = (await filesUnder(fixtureTool)).find((pathname) => pathname.endsWith(".js"));
if (!fixtureEntry) fail("Linux canonical fixture generator build produced no entry module.");
await cp(fixtureEntry, join(appRoot, "linux", "fixtureGenerator.mjs"), { errorOnExist: true });
await writeFile(join(appRoot, "package.json"), `${JSON.stringify({
  name: "pitchdog-drift-linux-tracer",
  version: "0.1.0",
  private: true,
  main: "linux/main.cjs",
  productName: "Drift Linux Tracer",
  license: "AGPL-3.0-or-later",
}, null, 2)}\n`, { mode: 0o644, flag: "wx" });

const appFiles = [];
for (const pathname of await filesUnder(appRoot)) {
  const bytes = await readFile(pathname);
  appFiles.push(Object.freeze({
    path: relative(appRoot, pathname).split("\\").join("/"),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  }));
}
const receipt = {
  schema: "dog.pitch.drift/linux-tracer-build-receipt/1",
  product: "dog.pitch.drift",
  state: "packaged-directory-internal-tracer",
  sourceCommit,
  sourceTree,
  electron: {
    version: ELECTRON_VERSION,
    platform: "linux-x64",
    archiveSha256: ELECTRON_ARCHIVE_SHA256,
    licence: "MIT",
    acquisition: "externally supplied pinned archive; no package installation or postinstall",
  },
  build: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    appOrigin: "drift://app",
    rendererProfile: "vite mode linux; shared product ESM bundle",
  },
  appFiles,
};
await writeFile(join(appRoot, "BuildReceipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, {
  mode: 0o644,
  flag: "wx",
});
console.log(output);
