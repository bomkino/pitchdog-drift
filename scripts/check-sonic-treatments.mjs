import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseJsonStrict } from "./strict-json.mjs";

const root = process.cwd();
const ledger = parseJsonStrict(
  readFileSync(resolve(root, "src/sonic/assets/treatments.json"), "utf8"),
  "Sonic treatment ledger",
);
const manifest = parseJsonStrict(
  readFileSync(resolve(root, "src/sonic/assets/manifest.json"), "utf8"),
  "Sonic asset manifest",
);

if (ledger.version !== 1 || !Array.isArray(ledger.assets)) {
  throw new Error("Tactile treatment ledger has an unsupported shape.");
}
if (ledger.assets.length !== 23) {
  throw new Error(`Expected 23 tactile treatments; found ${ledger.assets.length}.`);
}
if (!ledger.method || typeof ledger.method !== "object") {
  throw new Error("Tactile treatment ledger is missing its measurement method.");
}
for (const key of [
  "activeWindowMs",
  "activeHopMs",
  "activeRelativeFloorDb",
  "activeAbsoluteFloorDb",
  "onsetWindowMs",
  "onsetHopMs",
  "onsetRelativeFloorDb",
  "onsetAbsoluteFloorDb",
  "maximumActiveSpreadDb",
  "maximumOnsetMs",
  "maximumPreMixPeakDb",
]) {
  if (!Number.isFinite(ledger.method[key])) {
    throw new Error(`Tactile measurement method has invalid ${key}.`);
  }
}
if (!Array.isArray(manifest.recordings) || manifest.recordings.length !== 23) {
  throw new Error("Sonic manifest must declare exactly 23 recordings.");
}
const manifestNames = new Set(
  manifest.recordings.map((recording) => basename(recording.localPath)),
);

function parsePcmWave(path) {
  const bytes = readFileSync(path);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path} is not a RIFF/WAVE recording.`);
  }
  let cursor = 12;
  let format = null;
  let dataOffset = -1;
  let dataLength = -1;
  while (cursor + 8 <= bytes.length) {
    const id = bytes.toString("ascii", cursor, cursor + 4);
    const length = bytes.readUInt32LE(cursor + 4);
    const body = cursor + 8;
    if (body + length > bytes.length) throw new Error(`${path} contains a truncated ${id} chunk.`);
    if (id === "fmt ") {
      format = {
        audioFormat: bytes.readUInt16LE(body),
        channels: bytes.readUInt16LE(body + 2),
        sampleRate: bytes.readUInt32LE(body + 4),
        blockAlign: bytes.readUInt16LE(body + 12),
        bitsPerSample: bytes.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      dataOffset = body;
      dataLength = length;
    }
    cursor = body + length + (length % 2);
  }
  if (!format || dataOffset < 0 || dataLength < 0) throw new Error(`${path} is missing PCM format or data.`);
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels < 1) {
    throw new Error(`${path} must remain integer PCM16.`);
  }
  const frameCount = Math.floor(dataLength / format.blockAlign);
  const mono = new Float64Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    const frameOffset = dataOffset + frame * format.blockAlign;
    for (let channel = 0; channel < format.channels; channel += 1) {
      sum += bytes.readInt16LE(frameOffset + channel * 2) / 32768;
    }
    mono[frame] = sum / format.channels;
  }
  return { mono, sampleRate: format.sampleRate };
}

function rmsFrames(samples, frameSize, hopSize) {
  const paddedLength = Math.max(samples.length, frameSize);
  const frameCount = 1 + Math.floor((paddedLength - frameSize) / hopSize);
  const values = new Float64Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let energy = 0;
    for (let offset = 0; offset < frameSize; offset += 1) {
      const sample = samples[start + offset] ?? 0;
      energy += sample * sample;
    }
    values[frame] = Math.sqrt(energy / frameSize + 1e-18);
  }
  return values;
}

function db(value) {
  return 20 * Math.log10(value + 1e-12);
}

const names = new Set();
const receipts = [];
for (const treatment of ledger.assets) {
  if (names.has(treatment.name)) throw new Error(`Duplicate tactile treatment for ${treatment.name}.`);
  names.add(treatment.name);
  for (const key of ["trimStart", "trimEnd", "gainDb"]) {
    if (!Number.isFinite(treatment[key])) throw new Error(`${treatment.name} has invalid ${key}.`);
  }
  if (treatment.trimStart < 0 || treatment.trimEnd < 0) {
    throw new Error(`${treatment.name} has a destructive negative trim.`);
  }

  const { mono, sampleRate } = parsePcmWave(resolve(
    root,
    "src/sonic/assets/recordings",
    treatment.name,
  ));
  const start = Math.round(treatment.trimStart * sampleRate);
  const end = mono.length - Math.round(treatment.trimEnd * sampleRate);
  if (start >= end) throw new Error(`${treatment.name} trims away the entire recording.`);
  const gain = 10 ** (treatment.gainDb / 20);
  const treated = new Float64Array(end - start);
  let peak = 0;
  for (let index = start; index < end; index += 1) {
    const sample = mono[index] * gain;
    treated[index - start] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }

  const activeRms = rmsFrames(
    treated,
    Math.round(ledger.method.activeWindowMs / 1000 * sampleRate),
    Math.round(ledger.method.activeHopMs / 1000 * sampleRate),
  );
  const maximumRms = Math.max(...activeRms);
  const activeFloor = Math.max(
    maximumRms * 10 ** (ledger.method.activeRelativeFloorDb / 20),
    10 ** (ledger.method.activeAbsoluteFloorDb / 20),
  );
  let activeEnergy = 0;
  let activeCount = 0;
  for (const value of activeRms) {
    if (value < activeFloor) continue;
    activeEnergy += value * value;
    activeCount += 1;
  }
  if (activeCount === 0) throw new Error(`${treatment.name} has no measurable tactile event.`);
  const activeDb = db(Math.sqrt(activeEnergy / activeCount));

  const onsetRms = rmsFrames(
    treated,
    Math.round(ledger.method.onsetWindowMs / 1000 * sampleRate),
    Math.round(ledger.method.onsetHopMs / 1000 * sampleRate),
  );
  const onsetFloor = Math.max(
    Math.max(...onsetRms) * 10 ** (ledger.method.onsetRelativeFloorDb / 20),
    10 ** (ledger.method.onsetAbsoluteFloorDb / 20),
  );
  let onsetIndex = onsetRms.findIndex((value) => value >= onsetFloor);
  if (onsetIndex < 0) onsetIndex = onsetRms.length - 1;
  const onsetMs = onsetIndex * ledger.method.onsetHopMs;
  const durationMs = treated.length / sampleRate * 1000;
  const peakDb = db(peak);

  const compare = (field, actual, tolerance) => {
    if (Math.abs(actual - treatment[field]) > tolerance) {
      throw new Error(
        `${treatment.name} ${field} drifted: ledger ${treatment[field]}, measured ${actual.toFixed(2)}.`,
      );
    }
  };
  compare("measuredActiveRmsDb", activeDb, 0.16);
  compare("measuredPeakDb", peakDb, 0.16);
  compare("measuredOnsetMs", onsetMs, 2.1);
  compare("measuredDurationMs", durationMs, 1.1);

  if (onsetMs > ledger.method.maximumOnsetMs) {
    throw new Error(`${treatment.name} starts too late after treatment: ${onsetMs} ms.`);
  }
  if (peakDb > ledger.method.maximumPreMixPeakDb) {
    throw new Error(`${treatment.name} exceeds the pre-mix peak ceiling: ${peakDb.toFixed(1)} dBFS.`);
  }
  receipts.push({ name: treatment.name, activeDb, onsetMs, peakDb, durationMs });
}

if (names.size !== manifestNames.size) {
  throw new Error("Treatment and provenance ledgers do not address the same corpus size.");
}
for (const name of manifestNames) {
  if (!names.has(name)) throw new Error(`Missing tactile treatment for ${name}.`);
}
for (const name of names) {
  if (!manifestNames.has(name)) throw new Error(`Treatment references unknown recording ${name}.`);
}

const activeValues = receipts.map((receipt) => receipt.activeDb);
const spread = Math.max(...activeValues) - Math.min(...activeValues);
if (spread > ledger.method.maximumActiveSpreadDb) {
  throw new Error(`Tactile active-energy spread is ${spread.toFixed(1)} dB.`);
}

console.log(
  `Sonic treatment gate passed: ${receipts.length} untouched recordings, ${spread.toFixed(1)} dB active spread, ${Math.max(...receipts.map((receipt) => receipt.onsetMs)).toFixed(0)} ms maximum onset.`,
);
