import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fontRoot = join(root, "src", "assets", "fonts", "pitchdog", "v13");
const expected = new Map([
  ["pd-body-alt-italic.woff2", [179020, "9f59a7f058ba824e0b3e2760204c0c70b7cfb2f61956a460b730e486b1209285"]],
  ["pd-body-alt-roman.woff2", [169540, "4ae6044273de9010d1a9660001319c34a4a8ece764279bb7f1e0f81f01dca85b"]],
  ["pd-body-italic.woff2", [218976, "6bd35c9ad364e585ca5667c1df74f892eebbe32237005ba926b54ffa61df8a78"]],
  ["pd-body-roman.woff2", [171820, "433a1b69a8e8a903478b978c198b879824541dc9eb62db959058ae37a250819f"]],
  ["pd-eyebrow-site.woff2", [916908, "24aeaf1bfb45a874fe807c8138fc0d815b499b1834e8291c2dc46bb5fc32b7a3"]],
  ["pd-head-alt.woff2", [276308, "bf4db03493580a52e3e01cb6aec2fe791da8e7293d6083e2c567c3bb3f0b927a"]],
  ["pd-head.woff2", [270176, "528dd6d9d5d79265f4e3589523a250cd652110d1380e87a0252bca9489da50e9"]],
]);

for (const [name, [expectedBytes, expectedDigest]] of expected) {
  const path = join(fontRoot, name);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${name} must be a regular file.`);
  if (metadata.size !== expectedBytes) throw new Error(`${name} byte count changed.`);
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (digest !== expectedDigest) throw new Error(`${name} SHA-256 changed.`);
}

const css = readFileSync(join(root, "src", "fonts.css"), "utf8");
for (const name of expected.keys()) {
  if (!css.includes(name)) throw new Error(`src/fonts.css does not register ${name}.`);
}
if (!css.includes("786b4a2b671182319320f922b8de8f927ea3a002")) {
  throw new Error("src/fonts.css is not pinned to the audited type-system commit.");
}

console.log(`Verified ${expected.size} CC0 pitch.dog v13 font binaries.`);
