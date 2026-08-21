import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dist");
const entry = resolve(root, "src/main.tsx");
const aacShim = resolve(root, "src/lib/macosAacEncoder.ts");

function posixRelative(from, to) {
  return relative(from, to).split(sep).join("/");
}

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

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// WKWebView reliably executes one classic signed application entry from file://.
// The ordinary browser build remains an ES-module graph; Drift.app deliberately
// bundles its complete boot-critical graph as one IIFE with no late chunks.
await build({
  root,
  configFile: false,
  base: "./",
  plugins: [react()],
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
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    lib: {
      entry,
      name: "DriftMacApplication",
      formats: ["iife"],
      fileName: () => "drift-app.js",
      cssFileName: "drift-app",
    },
    rolldownOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: "drift-app.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  logLevel: "info",
});

const generated = await collect(outDir);
if (generated.some((path) => path.endsWith(".html") || path.endsWith(".map") || path.endsWith(".wasm"))) {
  throw new Error("The Mac application bundle contains unexpected HTML, source maps, or WebAssembly before bootstrap assembly.");
}

const javascript = generated.filter((path) => path.endsWith(".js"));
if (javascript.length !== 1) {
  throw new Error(`The Mac application must have exactly one JavaScript entry; found ${javascript.length}.`);
}
const stylesheets = generated.filter((path) => path.endsWith(".css"));
if (stylesheets.length === 0) {
  throw new Error("The Mac application build produced no stylesheet.");
}

const applicationScript = javascript[0];
const applicationSource = await readFile(applicationScript, "utf8");
// Script performs a real classic-script parse. Unlike a text search, it cannot
// mistake dependency diagnostics or string literals containing `import.meta`
// for executable module syntax. The one-JavaScript-file invariant above proves
// there is no boot-critical split chunk left for file:// to discover later.
new Script(applicationSource, { filename: posixRelative(outDir, applicationScript) });

const scriptRelative = posixRelative(outDir, applicationScript);
const stylesheetRelatives = stylesheets.map((path) => posixRelative(outDir, path)).sort();
const styleLinks = stylesheetRelatives
  .map((path) => `    <link rel="stylesheet" href="./${path}" />`)
  .join("\n");

const html = `<!doctype html>
<html lang="en" data-drift-bootstrap="classic-iife-single-entry">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#11100f" />
    <meta name="description" content="A local-first cinematic pitch-slide studio by pitch.dog." />
    <meta name="drift-web-bootstrap" content="classic-iife-single-entry" />
${styleLinks}
    <title>Drift — pitch.dog</title>
  </head>
  <body>
    <div id="root"></div>
    <noscript>Drift needs JavaScript to render and export your local media.</noscript>
    <script src="./${scriptRelative}"></script>
  </body>
</html>
`;
const htmlPath = resolve(outDir, "index.html");
await writeFile(htmlPath, html, "utf8");

const files = (await collect(outDir)).sort();
const receipt = {
  schemaVersion: 1,
  topology: "classic-iife-single-entry",
  format: "iife",
  codeSplitting: false,
  entry: posixRelative(root, entry),
  html: posixRelative(outDir, htmlPath),
  script: scriptRelative,
  styles: stylesheetRelatives,
  files: await Promise.all(files.map(async (path) => {
    const bytes = await readFile(path);
    return {
      path: posixRelative(outDir, path),
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  })),
};
await writeFile(
  resolve(outDir, "MacWebBundleReceipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
  "utf8",
);

console.log(`Drift Mac web bundle built at ${outDir}`);
console.log(`Bootstrap: ${receipt.topology}`);
console.log(`Application entry: ${receipt.script}`);
console.log(`Stylesheets: ${receipt.styles.join(", ")}`);
