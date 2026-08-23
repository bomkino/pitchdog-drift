import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const projectRoot = resolve(import.meta.dirname, "..");
const baseUrl = process.env.DRIFT_ATLAS_URL ?? "http://127.0.0.1:4174";
const git = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: projectRoot, encoding: "utf8" });
if (git.status !== 0) throw new Error(git.stderr || "Could not resolve candidate SHA.");
const status = spawnSync("git", ["status", "--porcelain"], { cwd: projectRoot, encoding: "utf8" });
const diff = spawnSync("git", ["diff", "--binary", "HEAD"], { cwd: projectRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
if (diff.status !== 0) throw new Error(diff.stderr.toString() || "Could not fingerprint tracked worktree changes.");
const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: projectRoot, encoding: "buffer" });
if (untracked.status !== 0) throw new Error(untracked.stderr.toString() || "Could not fingerprint untracked worktree changes.");
const worktreeHash = createHash("sha256").update(diff.stdout).update(status.stdout);
for (const relativePath of untracked.stdout.toString().split("\0").filter(Boolean).sort()) {
  worktreeHash.update(relativePath).update(await readFile(resolve(projectRoot, relativePath)));
}
const candidate = status.stdout.trim()
  ? `${git.stdout.trim()}-wt${worktreeHash.digest("hex").slice(0, 12)}`
  : git.stdout.trim();
const outputRoot = resolve(projectRoot, "output", "qa", "v2-optical-atlas", candidate);

const records = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function workspace(name) {
  await page.getByRole("button", { name, exact: true }).click();
}

async function openGroup(title) {
  const group = page.locator("details.inspector-group").filter({ has: page.locator("summary", { hasText: title }) }).first();
  if (await group.count() === 0) throw new Error(`Inspector group not found: ${title}`);
  if (!(await group.evaluate((node) => node.open))) await group.locator("summary").click();
  return group;
}

async function capture(category, fixture, treatment, notes = {}) {
  await workspace("MASTER");
  const destination = resolve(outputRoot, slug(category), slug(fixture), `${slug(treatment)}.png`);
  await mkdir(resolve(destination, ".."), { recursive: true });
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: "Save transparent-safe PNG", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(destination);
  const bytes = await readFile(destination);
  const decode = spawnSync("magick", ["identify", destination], { encoding: "utf8" });
  if (decode.status !== 0) throw new Error(`Atlas PNG did not decode: ${destination}\n${decode.stderr}`);
  records.push({
    category,
    fixture,
    treatment,
    file: destination.slice(outputRoot.length + 1),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...notes,
  });
  process.stdout.write(`captured ${category}/${fixture}/${treatment}\n`);
}

async function setRange(groupTitle, label, value) {
  const group = await openGroup(groupTitle);
  const slider = group.getByRole("slider", { name: label, exact: true });
  await slider.fill(String(value));
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("canvas[data-testid='webgl-stage']").waitFor({ state: "visible" });
  await page.waitForTimeout(900);

  const ratios = ["9:16", "4:5", "1:1", "16:9"];
  for (const ratio of ratios) {
    await workspace("MASTER");
    await page.getByRole("radio", { name: ratio, exact: true }).check({ force: true });
    await capture("ratios", "demo-deck", ratio, { state: "clean-rest" });
  }

  await workspace("MASTER");
  await page.getByRole("radio", { name: "9:16", exact: true }).check({ force: true });
  await workspace("WORLD");
  const worlds = [
    "Editorial Drift", "Noir Contact", "Sunstruck Atlas", "Dread",
    "Tender Light", "Velvet Fever", "Celluloid Archive", "Night Run",
  ];
  for (const world of worlds) {
    await page.getByRole("button", { name: new RegExp(`^${world}`) }).click();
    await capture("worlds", "demo-deck-9x16", world, { state: "authored-world-default" });
    await workspace("WORLD");
  }

  const addedBackgroundFamilies = [
    ["cutting-map", "Contour Notes"],
    ["grid", "Modular Field"],
    ["wave", "Tidal Horizon"],
  ];
  for (const ratio of ["9:16", "16:9"]) {
    await workspace("MASTER");
    await page.getByRole("radio", { name: ratio, exact: true }).check({ force: true });
    await workspace("WORLD");
    for (const [family, composition] of addedBackgroundFamilies) {
      const atmosphere = await openGroup("Atmosphere");
      await atmosphere.getByLabel("Background", { exact: true }).selectOption(family);
      await atmosphere.getByLabel("Composition", { exact: true }).selectOption("0");
      await capture("background-families", `demo-deck-${slug(ratio)}`, `${family}-${composition}`, {
        state: "subtle-authored-default",
        orientation: ratio === "9:16" ? "vertical" : "horizontal",
      });
      await workspace("WORLD");
    }
  }

  await workspace("MASTER");
  await page.getByRole("radio", { name: "9:16", exact: true }).check({ force: true });

  await workspace("DIRECT");
  const lensGroup = await openGroup("Lens");
  const lenses = [
    ["clean-gate", "Clean Gate"], ["soft-print", "Soft Print"],
    ["dream-glass", "Dream Glass"], ["anamorphic-night", "Anamorphic Night"],
    ["bleach-bypass", "Bleach Bypass"], ["night-terror", "Night Terror"],
    ["panic-lens", "Panic Lens"], ["ghost-focus", "Ghost Focus"],
  ];
  for (const [id, label] of lenses) {
    await lensGroup.getByLabel("Lens", { exact: true }).selectOption(id);
    await capture("lenses", "demo-deck-9x16", label, { comparison: "clean-gate" });
    await workspace("DIRECT");
  }

  const materialGroup = await openGroup("Material");
  const finishes = [
    ["clean-glass", "Clean Glass"], ["16mm-breath", "16mm Breath"],
    ["dream-glass", "Dream Glass"], ["panic-lens", "Panic Lens"],
    ["ghost-focus", "Ghost Focus"],
  ];
  for (const [id, label] of finishes) {
    await materialGroup.getByLabel("Local finish", { exact: true }).selectOption(id);
    await capture("finishes", "demo-deck-9x16", label, { comparison: "clean-glass" });
    await workspace("DIRECT");
  }

  await workspace("WORLD");
  await setRange("Atmosphere", "Grain", 40);
  await workspace("DIRECT");
  await setRange("Material", "Microtexture", 0);
  await setRange("Lens", "Camera grain", 0);
  await capture("grain", "demo-deck-9x16", "background-only-40", { layer: "background" });

  await workspace("WORLD");
  await setRange("Atmosphere", "Grain", 0);
  await workspace("DIRECT");
  await setRange("Material", "Microtexture", 40);
  await capture("grain", "demo-deck-9x16", "material-only-40", { layer: "material" });

  await workspace("DIRECT");
  await setRange("Material", "Microtexture", 0);
  await setRange("Lens", "Camera grain", 40);
  await capture("grain", "demo-deck-9x16", "camera-only-40", { layer: "camera" });

  await workspace("WORLD");
  await page.getByRole("button", { name: /^Editorial Drift/ }).click();
  await capture("grain", "demo-deck-9x16", "authored-combined-default", { layer: "combined-world-default" });
} finally {
  await context.close();
  await browser.close();
}

const manifest = {
  schemaVersion: 1,
  candidate,
  createdAt: new Date().toISOString(),
  baseUrl,
  source: "native-resolution Drift PNG still export",
  fixtureBoundary: "Bundled demo deck; pixel-content semantics are not inferred.",
  captureCount: records.length,
  captures: records,
};
await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const capturePaths = records.map((record) => resolve(outputRoot, record.file));
const contactSheet = resolve(outputRoot, "contact-sheet.png");
const montage = spawnSync("magick", [
  "montage",
  "-font", "/System/Library/Fonts/SFNS.ttf",
  "-pointsize", "11",
  ...capturePaths,
  "-thumbnail", "240x240",
  "-background", "#0d0c0b",
  "-fill", "#d7cfc3",
  "-geometry", "240x240+8+8",
  "-tile", "5x",
  contactSheet,
], { encoding: "utf8" });
if (montage.status !== 0) throw new Error(montage.stderr || "Contact sheet generation failed.");

const checksumTargets = [resolve(outputRoot, "manifest.json"), contactSheet, ...capturePaths];
const checksums = checksumTargets.map((path) => {
  const result = spawnSync("shasum", ["-a", "256", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Checksum failed: ${path}`);
  const [hash] = result.stdout.trim().split(/\s+/);
  return `${hash}  ${path.slice(outputRoot.length + 1)}`;
});
await writeFile(resolve(outputRoot, "SHA256SUMS"), `${checksums.join("\n")}\n`);
process.stdout.write(`${outputRoot}\n${records.length} captures · manifest · contact sheet · SHA256SUMS\n`);
