import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "build/macos/export-probe");
const input = resolve(root, "tests/macosExportProbe.ts");
const aacShim = resolve(root, "src/lib/macosAacEncoder.ts");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// The shipped application already has a separate packaged-WebView test for its
// exact Vite ES-module graph. This probe owns a different claim: can the real
// deterministic exporter render, encode, reopen, and verify media in WKWebView?
// Build that source graph as one classic IIFE so the result is not confounded by
// file:// module loading or a late dynamic chunk. Rolldown's disabled code
// splitting inlines the native AAC adapter's dynamic registration path too.
await build({
  root,
  configFile: false,
  resolve: {
    alias: {
      "@mediabunny/aac-encoder": aacShim,
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    minify: "oxc",
    lib: {
      entry: input,
      name: "DriftExportProbe",
      formats: ["iife"],
      fileName: () => "probe.js",
    },
    rolldownOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: "probe.js",
      },
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

function posixRelative(from, to) {
  return relative(from, to).split(sep).join("/");
}

const generatedFiles = await collect(outDir);
const javascriptFiles = generatedFiles.filter((path) => path.endsWith(".js"));
if (javascriptFiles.length !== 1) {
  throw new Error(`Expected one inlined classic probe script; found ${javascriptFiles.length}.`);
}
if (generatedFiles.some((path) => path.endsWith(".html") || path.endsWith(".map") || path.endsWith(".wasm"))) {
  throw new Error("Classic Mac export probe unexpectedly contains HTML, source maps, or WebAssembly before receipt assembly.");
}

const scriptPath = javascriptFiles[0];
const scriptSource = await readFile(scriptPath, "utf8");
new Script(scriptSource, { filename: posixRelative(outDir, scriptPath) });
const scriptRelative = posixRelative(outDir, scriptPath);
if (scriptRelative.startsWith("../") || scriptRelative.includes("/../")) {
  throw new Error("Classic probe script escaped its output root.");
}

const rootHtmlPath = resolve(outDir, "index.html");
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Drift WKWebView Export Probe</title>
  </head>
  <body style="margin:0;background:#080808;overflow:hidden">
    <canvas id="probe" width="320" height="568" aria-label="Deterministic export probe"></canvas>
    <script src="./${scriptRelative}"></script>
  </body>
</html>
`;
await writeFile(rootHtmlPath, html, "utf8");

const files = await collect(outDir);
if (files.filter((path) => path.endsWith(".html")).length !== 1) {
  throw new Error("Expected exactly one root-level export-probe index.html.");
}
if (files.some((path) => path.endsWith(".map") || path.endsWith(".wasm"))) {
  throw new Error("Mac export probe unexpectedly contains source maps or WebAssembly.");
}

const receipt = {
  schemaVersion: 1,
  format: "iife",
  codeSplitting: false,
  input: posixRelative(root, input),
  html: posixRelative(outDir, rootHtmlPath),
  script: scriptRelative,
  files: await Promise.all(files.sort().map(async (path) => {
    const bytes = await readFile(path);
    return {
      path: posixRelative(outDir, path),
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  })),
};
await writeFile(resolve(outDir, "ProbeBundleReceipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Mac export probe built at ${outDir}`);
console.log(`Entry: ${receipt.html}`);
console.log(`Classic script: ${receipt.script}`);
