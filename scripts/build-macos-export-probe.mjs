import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
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

function posixRelative(from, to) {
  return relative(from, to).split(sep).join("/");
}

function relativeInside(directory, candidate, label) {
  const result = relative(directory, candidate);
  if (result === "" || result.startsWith(`..${sep}`) || result === ".." || isAbsolute(result)) {
    throw new Error(`${label} escaped the export-probe bundle root.`);
  }
  return result;
}

// Vite deliberately preserves an HTML entry's source-relative path. The probe
// source lives under tests/, which would make its production module climb into
// sibling assets/ through ../assets. Drift.app's real entry instead sits beside
// its assets directory. Flatten the generated HTML to the bundle root so this
// falsification exercises the same local-file topology as the shipped app.
const generatedFiles = await collect(outDir);
const generatedHtmlFiles = generatedFiles.filter((path) => path.endsWith(".html"));
if (generatedHtmlFiles.length !== 1) {
  throw new Error(`Expected one generated probe HTML file; found ${generatedHtmlFiles.length}.`);
}

const generatedHtmlPath = generatedHtmlFiles[0];
const rootHtmlPath = resolve(outDir, "index.html");
if (generatedHtmlPath !== rootHtmlPath) {
  if (generatedFiles.includes(rootHtmlPath)) {
    throw new Error("Export probe unexpectedly generated a conflicting root index.html.");
  }

  const generatedSet = new Set(generatedFiles.map((path) => posixRelative(outDir, path)));
  const sourceDirectory = dirname(generatedHtmlPath);
  const sourceHtml = await readFile(generatedHtmlPath, "utf8");
  let localReferenceCount = 0;
  const rewrittenHtml = sourceHtml.replace(
    /\b(src|href)=(['"])([^'"]+)\2/g,
    (match, attribute, quote, reference) => {
      if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|#|\/\/)/.test(reference)) return match;
      const suffixIndex = reference.search(/[?#]/);
      const pathname = suffixIndex < 0 ? reference : reference.slice(0, suffixIndex);
      const suffix = suffixIndex < 0 ? "" : reference.slice(suffixIndex);
      if (!pathname || pathname.startsWith("/") || isAbsolute(pathname)) {
        throw new Error(`Probe HTML contains an unsafe local reference: ${reference}`);
      }

      const target = resolve(sourceDirectory, pathname);
      const targetRelative = posixRelative(
        outDir,
        resolve(outDir, relativeInside(outDir, target, `Probe HTML reference ${reference}`)),
      );
      if (!generatedSet.has(targetRelative)) {
        throw new Error(`Probe HTML references an unreceipted file: ${reference}`);
      }
      localReferenceCount += 1;
      return `${attribute}=${quote}./${targetRelative}${suffix}${quote}`;
    },
  );

  if (localReferenceCount === 0 || !rewrittenHtml.includes('type="module"')) {
    throw new Error("Probe HTML contains no executable local module reference.");
  }
  await writeFile(rootHtmlPath, rewrittenHtml, "utf8");
  await rm(generatedHtmlPath);
}

const files = await collect(outDir);
const htmlFiles = files.filter((path) => path.endsWith(".html"));
if (htmlFiles.length !== 1 || htmlFiles[0] !== rootHtmlPath) {
  throw new Error("Expected exactly one root-level export-probe index.html.");
}
if (files.some((path) => path.endsWith(".map") || path.endsWith(".wasm"))) {
  throw new Error("Mac export probe unexpectedly contains source maps or WebAssembly.");
}

const receipt = {
  schemaVersion: 1,
  input: posixRelative(root, input),
  html: posixRelative(outDir, rootHtmlPath),
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
