import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { parseJsonStrict } from "./strict-json.mjs";

const root = process.cwd();
const distRoot = resolve(root, "dist");
const assetsRoot = join(distRoot, "assets");
const files = readdirSync(assetsRoot);
const javascript = files.filter((file) => file.endsWith(".js"));
const waveFiles = files.filter((file) => file.endsWith(".wav"));
const manifest = parseJsonStrict(
  readFileSync(resolve(root, "src/sonic/assets/manifest.json"), "utf8"),
  "Sonic asset manifest",
);

if (!Array.isArray(manifest.recordings) || manifest.recordings.length !== 23) {
  throw new Error("Sonic manifest must declare exactly 23 recordings.");
}
if (javascript.length === 0) {
  throw new Error("No production JavaScript bundle was emitted.");
}
for (const file of javascript) {
  const source = readFileSync(join(assetsRoot, file), "utf8");
  if (/data:audio\/(?:wav|x-wav);base64/i.test(source)) {
    throw new Error(`${file} still embeds WAV bytes in JavaScript.`);
  }
}
if (waveFiles.length !== manifest.recordings.length) {
  throw new Error(
    `Expected ${manifest.recordings.length} emitted tactile WAV assets; found ${waveFiles.length}.`,
  );
}

const claimedOutputs = new Set();
for (const recording of manifest.recordings) {
  const sourceName = basename(recording.localPath);
  if (extname(sourceName).toLowerCase() !== ".wav") {
    throw new Error(`${recording.localPath} is not a WAV manifest entry.`);
  }
  const stem = sourceName.slice(0, -4);
  const matches = waveFiles.filter((file) => (
    file.startsWith(`${stem}-`) && file.endsWith(".wav")
  ));
  if (matches.length !== 1) {
    throw new Error(
      `${sourceName} must map to exactly one hashed production asset; found ${matches.length}.`,
    );
  }
  const output = matches[0];
  const hash = output.slice(stem.length + 1, -4);
  if (!/^[A-Za-z0-9_-]{8,}$/.test(hash)) {
    throw new Error(`${output} does not contain a credible build hash.`);
  }
  if (claimedOutputs.has(output)) {
    throw new Error(`${output} was claimed by more than one source recording.`);
  }
  claimedOutputs.add(output);
  const outputBytes = statSync(join(assetsRoot, output)).size;
  if (outputBytes !== recording.bytes) {
    throw new Error(
      `${output} changed byte length: manifest ${recording.bytes}, output ${outputBytes}.`,
    );
  }
}

const totalWaveBytes = waveFiles.reduce(
  (sum, file) => sum + statSync(join(assetsRoot, file)).size,
  0,
);
const expectedBytes = manifest.recordings.reduce(
  (sum, recording) => sum + recording.bytes,
  0,
);
if (totalWaveBytes !== expectedBytes) {
  throw new Error(
    `Emitted tactile corpus is ${totalWaveBytes} bytes; manifest expects ${expectedBytes}.`,
  );
}

console.log(
  `Sonic bundle gate passed: ${waveFiles.length} one-to-one hashed WAV assets, ${totalWaveBytes} bytes, no inlined audio.`,
);
