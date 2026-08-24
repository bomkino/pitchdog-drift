import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const projectRoot = resolve(import.meta.dirname, "..");
const baseUrl = process.env.DRIFT_ATELIER_URL ?? "http://127.0.0.1:4174";
const head = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: projectRoot, encoding: "utf8" });
if (head.status !== 0) throw new Error(head.stderr || "Could not resolve candidate SHA.");
const status = spawnSync("git", ["status", "--porcelain"], { cwd: projectRoot, encoding: "utf8" });
const diff = spawnSync("git", ["diff", "--binary", "HEAD"], { cwd: projectRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: projectRoot, encoding: "buffer" });
if (diff.status !== 0 || untracked.status !== 0) throw new Error("Could not fingerprint the candidate worktree.");
const fingerprint = createHash("sha256").update(diff.stdout).update(status.stdout);
for (const relativePath of untracked.stdout.toString().split("\0").filter(Boolean).sort()) {
  fingerprint.update(relativePath).update(await readFile(resolve(projectRoot, relativePath)));
}
const candidate = status.stdout.trim()
  ? `${head.stdout.trim()}-wt${fingerprint.digest("hex").slice(0, 12)}`
  : head.stdout.trim();
const outputRoot = resolve(projectRoot, "output", "qa", "atelier-backgrounds", candidate);

const studies = [
  ["saffron-anatomy-study", "Saffron Anatomy"],
  ["verdigris-fresco-study", "Verdigris Fresco"],
  ["ultramarine-ledger-study", "Ultramarine Ledger"],
  ["rose-madder-bloom-study", "Rose Madder Bloom"],
  ["charcoal-cartography-study", "Charcoal Cartography"],
  ["gilded-palimpsest-study", "Gilded Palimpsest"],
  ["indigo-botanical-study", "Indigo Botanical"],
  ["oxide-gesture-study", "Oxide Gesture"],
];
const ratios = ["9:16", "16:9"];
const records = [];
const consoleErrors = [];

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function command(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed.`);
  return result.stdout.trim();
}

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

async function workspace(name) {
  const button = page.getByRole("button", { name, exact: true });
  if (await button.getAttribute("aria-current") !== "page") await button.click();
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const canvas = page.locator("canvas[data-testid='webgl-stage']");
  await canvas.waitFor({ state: "visible" });
  await page.locator(".stage-frame").waitFor({ state: "visible" });
  const pause = page.getByRole("button", { name: "Pause preview", exact: true });
  if (await pause.isVisible()) await pause.click();

  for (const ratio of ratios) {
    await workspace("MASTER");
    await page.getByRole("radio", { name: ratio, exact: true }).check({ force: true });
    await workspace("WORLD");

    const atmosphere = page.locator("details.inspector-group").filter({
      has: page.locator("summary", { hasText: "Atmosphere" }),
    }).first();
    const backgroundBrowser = atmosphere.locator("details.background-browser");
    if (!(await backgroundBrowser.evaluate((element) => element.open))) {
      await backgroundBrowser.locator("summary").click();
    }
    await backgroundBrowser.getByRole("combobox", { name: "Family", exact: true }).selectOption("atelier");
    const picker = backgroundBrowser.getByRole("combobox", { name: "8 matching backgrounds" });

    for (const [studyId, studyName] of studies) {
      await picker.selectOption(studyId);
      await page.waitForTimeout(180);
      const destination = resolve(outputRoot, slug(ratio), `${studyId}.png`);
      await mkdir(resolve(destination, ".."), { recursive: true });
      await canvas.screenshot({ path: destination, animations: "disabled" });
      const bytes = await readFile(destination);
      records.push({
        ratio,
        studyId,
        studyName,
        file: destination.slice(outputRoot.length + 1),
        dimensions: command("magick", ["identify", "-format", "%wx%h", destination]),
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
} finally {
  await context.close();
  await browser.close();
}

const shaderErrors = consoleErrors.filter((message) => /shader|webgl|gl_invalid|three\.webglprogram/i.test(message));
if (shaderErrors.length > 0) throw new Error(`WebGL console errors:\n${shaderErrors.join("\n")}`);
if (records.length !== studies.length * ratios.length) throw new Error(`Expected 16 captures; received ${records.length}.`);

const manifest = {
  schemaVersion: 1,
  candidate,
  createdAt: new Date().toISOString(),
  baseUrl,
  source: "Drift WebGL canvas with bundled demo slides",
  referenceBoundary: "Original compositions informed by general watercolour, ink, fresco, and generative-painting techniques; no reference artwork or unlicensed sketch code is included.",
  captureCount: records.length,
  consoleErrorCount: consoleErrors.length,
  captures: records,
};
await mkdir(outputRoot, { recursive: true });
await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const capturePaths = records.map((record) => resolve(outputRoot, record.file));
const contactSheet = resolve(outputRoot, "contact-sheet.png");
command("magick", [
  "montage",
  ...capturePaths,
  "-set", "label", "%t",
  "-font", "/System/Library/Fonts/SFNS.ttf",
  "-pointsize", "11",
  "-thumbnail", "300x300",
  "-background", "#0d0c0b",
  "-fill", "#ddd5c8",
  "-geometry", "300x330+8+8",
  "-tile", "4x4",
  contactSheet,
]);

const checksumTargets = [resolve(outputRoot, "manifest.json"), contactSheet, ...capturePaths];
const checksums = checksumTargets.map((path) => {
  const bytes = spawnSync("shasum", ["-a", "256", path], { encoding: "utf8" });
  if (bytes.status !== 0) throw new Error(bytes.stderr || `Checksum failed: ${path}`);
  const [hash] = bytes.stdout.trim().split(/\s+/);
  return `${hash}  ${path.slice(outputRoot.length + 1)}`;
});
await writeFile(resolve(outputRoot, "SHA256SUMS"), `${checksums.join("\n")}\n`);
process.stdout.write(`${outputRoot}\n16 captures · two axes · manifest · contact sheet · SHA256SUMS\n`);
