import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const distRoot = resolve(process.cwd(), "dist");
const assetsRoot = join(distRoot, "assets");
const files = readdirSync(assetsRoot);
const javascript = files.filter((file) => file.endsWith(".js"));
const waveFiles = files.filter((file) => file.endsWith(".wav"));

if (javascript.length === 0) {
  throw new Error("No production JavaScript bundle was emitted.");
}

for (const file of javascript) {
  const source = readFileSync(join(assetsRoot, file), "utf8");
  if (/data:audio\/(?:wav|x-wav);base64/i.test(source)) {
    throw new Error(`${file} still embeds WAV bytes in JavaScript.`);
  }
}

if (waveFiles.length < 20) {
  throw new Error(
    `Expected at least 20 emitted tactile WAV assets; found ${waveFiles.length}.`,
  );
}

const totalWaveBytes = waveFiles.reduce(
  (sum, file) => sum + statSync(join(assetsRoot, file)).size,
  0,
);
if (totalWaveBytes < 500_000) {
  throw new Error("The emitted tactile corpus is unexpectedly small.");
}

console.log(
  `Sonic bundle gate passed: ${waveFiles.length} hashed WAV assets, ${totalWaveBytes} bytes, no inlined audio.`,
);
