import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "build/macos/export-probe");
const input = resolve(root, "tests/macos-export-probe.html");
const aacShim = resolve(root, "src/lib/macosAacEncoder.ts");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  root,
  configFile: false,
  base: "./",
  resolve: {
    alias: {
      "@mediabunny/aac-encoder": aacShim,
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    // Vite 8 no longer installs esbuild as an internal implementation detail.
    // Use its native Oxc minifier instead of asking the probe for an undeclared
    // package that the production application does not need.
    minify: "oxc",
    rollupOptions: {
      input,
    },
  },
  logLevel: "info",
});

async function collect(directory) {
  const output = [];
  for (const name of await readdir(directory)) {
    const path = resolve(directory, name);
    const metadata = await stat(path);
    if (metadata.isDirectory()) output.push(...await collect(path));
    else output.push(path);
  }
  return output;
}

const files = await collect(outDir);
const htmlFiles = files.filter((path) => path.endsWith(".html"));
if (htmlFiles.length !== 1) {
  throw new Error(`Expected one probe HTML file; found ${htmlFiles.length}.`);
}
if (files.some((path) => path.endsWith(".map") || path.endsWith(".wasm"))) {
  throw new Error("Mac export probe unexpectedly contains source maps or WebAssembly.");
}

const receipt = {
  schemaVersion: 1,
  input: relative(root, input),
  html: relative(outDir, htmlFiles[0]),
  files: await Promise.all(files.sort().map(async (path) => {
    const bytes = await readFile(path);
    return {
      path: relative(outDir, path),
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  })),
};
await writeFile(resolve(outDir, "ProbeBundleReceipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Mac export probe built at ${outDir}`);
console.log(`Entry: ${receipt.html}`);
