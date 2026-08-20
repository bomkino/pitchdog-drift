import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const UPSTREAM_REPOSITORY = "romainsimon/uisfx";
const UPSTREAM_REVISION = "2001f3dac2d1cf86ad99cbad5cef222c3a8b9082";
const CUES = ["drag-start", "drop", "error", "press", "snap", "success", "swipe"];
const PACKS = [
  ["studio", "studio"],
  ["cinematic", "cinematic"],
  ["zen", "zen"],
];

function absolute(relative) {
  return path.join(ROOT, relative);
}

async function text(relative) {
  return await readFile(absolute(relative), "utf8");
}

async function write(relative, content) {
  await mkdir(path.dirname(absolute(relative)), { recursive: true });
  await writeFile(absolute(relative), content);
}

async function replaceOnce(relative, before, after) {
  const current = await text(relative);
  const count = current.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${relative}: expected one exact patch target, found ${count}.`);
  }
  await write(relative, current.replace(before, after));
}

async function appendOnce(relative, marker, addition) {
  const current = await text(relative);
  if (current.includes(marker)) return;
  await write(relative, `${current.trimEnd()}\n\n${addition.trim()}\n`);
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function vendorAssets() {
  const manifest = [];
  for (const [upstreamPack, localPack] of PACKS) {
    for (const cue of CUES) {
      const upstreamPath = `packages/uisfx/sounds/${upstreamPack}/${cue}.ogg`;
      const url = `https://raw.githubusercontent.com/${UPSTREAM_REPOSITORY}/${UPSTREAM_REVISION}/${upstreamPath}`;
      const bytes = await fetchBytes(url);
      if (new TextDecoder().decode(bytes.subarray(0, 4)) !== "OggS") {
        throw new Error(`${upstreamPath} is not an OGG container.`);
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const localPath = `src/sonic/assets/${localPack}/${cue}.ogg`;
      await write(localPath, bytes);
      manifest.push({
        localPath,
        upstreamRepository: UPSTREAM_REPOSITORY,
        upstreamRevision: UPSTREAM_REVISION,
        upstreamPath,
        license: "CC0-1.0",
        sha256,
        bytes: bytes.byteLength,
      });
    }
  }

  const licenceUrl = `https://raw.githubusercontent.com/${UPSTREAM_REPOSITORY}/${UPSTREAM_REVISION}/LICENSE-AUDIO`;
  const licence = new TextDecoder().decode(await fetchBytes(licenceUrl));
  if (!/CC0/i.test(licence)) throw new Error("Pinned audio licence does not identify CC0.");
  await write("src/sonic/assets/LICENSE-CC0-1.0.txt", licence.trimEnd() + "\n");
  await write("src/sonic/assets/manifest.json", JSON.stringify({
    generatedAt: "2026-08-20",
    upstreamRepository: UPSTREAM_REPOSITORY,
    upstreamRevision: UPSTREAM_REVISION,
    license: "CC0-1.0",
    files: manifest,
  }, null, 2) + "\n");
}

async function patchModel() {
  await replaceOnce("src/model.ts", "export const SCHEMA_VERSION = 1 as const;", "export const SCHEMA_VERSION = 2 as const;");
  await replaceOnce(
    "src/model.ts",
    "export type ThemeId = \"editorial-drift\" | \"road-memory\" | \"dread\" | \"noir-contact\" | \"tender-light\" | \"chrome-dream\";\n",
    "export type ThemeId = \"editorial-drift\" | \"road-memory\" | \"dread\" | \"noir-contact\" | \"tender-light\" | \"chrome-dream\";\nexport type SonicPalette = \"studio\" | \"cinematic\" | \"paper\";\n",
  );
  await replaceOnce(
    "src/model.ts",
    "export interface PresenterSettings {\n",
    `export interface SonicSettings {
  previewEnabled: boolean;
  exportEnabled: boolean;
  palette: SonicPalette;
  masterGain: number;
  motionGain: number;
  interfaceGain: number;
  density: number;
  variation: number;
  duckUnderPresenter: number;
}

export interface PresenterSettings {
`,
  );
  await replaceOnce(
    "src/model.ts",
    "  background: BackgroundSettings;\n  presenter: PresenterSettings;\n",
    "  background: BackgroundSettings;\n  sound: SonicSettings;\n  presenter: PresenterSettings;\n",
  );
  await replaceOnce(
    "src/model.ts",
    "export const DEFAULT_SETTINGS: StudioSettings = {\n",
    `export const DEFAULT_SONIC_SETTINGS: SonicSettings = {
  previewEnabled: true,
  exportEnabled: true,
  palette: "studio",
  masterGain: 0.62,
  motionGain: 0.74,
  interfaceGain: 0.3,
  density: 0.82,
  variation: 0.16,
  duckUnderPresenter: 0.5,
};

export const DEFAULT_SETTINGS: StudioSettings = {
`,
  );
  await replaceOnce(
    "src/model.ts",
    "  presenter: {\n",
    "  sound: { ...DEFAULT_SONIC_SETTINGS },\n  presenter: {\n",
  );
}

async function patchValidation() {
  await replaceOnce(
    "src/lib/settingsValidation.ts",
    `import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  SHADER_VERSION,
  type StudioSettings,
} from "../model";`,
    `import {
  DEFAULT_SONIC_SETTINGS,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  SHADER_VERSION,
  type StudioSettings,
} from "../model";`,
  );
  await replaceOnce(
    "src/lib/settingsValidation.ts",
    "const OUTPUT_FPS = [24, 25, 30, 50, 60] as const;\n",
    "const OUTPUT_FPS = [24, 25, 30, 50, 60] as const;\nconst SONIC_PALETTES = [\"studio\", \"cinematic\", \"paper\"] as const;\n",
  );
  await replaceOnce(
    "src/lib/settingsValidation.ts",
    `  literal(source.schemaVersion, "settings.schemaVersion", SCHEMA_VERSION);
  literal(source.engineVersion, "settings.engineVersion", ENGINE_VERSION);`,
    `  const sourceSchemaVersion = oneOf(
    source.schemaVersion,
    "settings.schemaVersion",
    [1, SCHEMA_VERSION] as const,
  );
  literal(source.engineVersion, "settings.engineVersion", ENGINE_VERSION);`,
  );
  await replaceOnce(
    "src/lib/settingsValidation.ts",
    `  const background = record(source.background, "settings.background");
  const presenter = record(source.presenter, "settings.presenter");`,
    `  const background = record(source.background, "settings.background");
  const sound = sourceSchemaVersion === 1 && source.sound === undefined
    ? record(DEFAULT_SONIC_SETTINGS, "settings.sound")
    : record(source.sound, "settings.sound");
  const presenter = record(source.presenter, "settings.presenter");`,
  );
  await replaceOnce(
    "src/lib/settingsValidation.ts",
    `    background: {
      style: backgroundStyle,
      colorA: hexColour(background.colorA, "settings.background.colorA"),
      colorB: hexColour(background.colorB, "settings.background.colorB"),
      accent: hexColour(background.accent, "settings.background.accent"),
      intensity: number(background.intensity, "settings.background.intensity", { min: 0, max: 1 }),
      motion: number(background.motion, "settings.background.motion", { min: 0, max: 1 }),
      grain: number(background.grain, "settings.background.grain", { min: 0, max: 0.6 }),
      vignette: number(background.vignette, "settings.background.vignette", { min: 0, max: 1 }),
      seed: number(background.seed, "settings.background.seed", { min: 0, max: 1_000_000, integer: true }),
    },
    presenter: {`,
    `    background: {
      style: backgroundStyle,
      colorA: hexColour(background.colorA, "settings.background.colorA"),
      colorB: hexColour(background.colorB, "settings.background.colorB"),
      accent: hexColour(background.accent, "settings.background.accent"),
      intensity: number(background.intensity, "settings.background.intensity", { min: 0, max: 1 }),
      motion: number(background.motion, "settings.background.motion", { min: 0, max: 1 }),
      grain: number(background.grain, "settings.background.grain", { min: 0, max: 0.6 }),
      vignette: number(background.vignette, "settings.background.vignette", { min: 0, max: 1 }),
      seed: number(background.seed, "settings.background.seed", { min: 0, max: 1_000_000, integer: true }),
    },
    sound: {
      previewEnabled: boolean(sound.previewEnabled, "settings.sound.previewEnabled"),
      exportEnabled: boolean(sound.exportEnabled, "settings.sound.exportEnabled"),
      palette: oneOf(sound.palette, "settings.sound.palette", SONIC_PALETTES),
      masterGain: number(sound.masterGain, "settings.sound.masterGain", { min: 0, max: 1 }),
      motionGain: number(sound.motionGain, "settings.sound.motionGain", { min: 0, max: 1 }),
      interfaceGain: number(sound.interfaceGain, "settings.sound.interfaceGain", { min: 0, max: 1 }),
      density: number(sound.density, "settings.sound.density", { min: 0, max: 1 }),
      variation: number(sound.variation, "settings.sound.variation", { min: 0, max: 1 }),
      duckUnderPresenter: number(
        sound.duckUnderPresenter,
        "settings.sound.duckUnderPresenter",
        { min: 0, max: 1 },
      ),
    },
    presenter: {`,
  );
}

async function patchThemes() {
  await replaceOnce(
    "src/themes.ts",
    "    output: { ...current.output },\n    presenter: { ...current.presenter },\n",
    "    output: { ...current.output },\n    sound: { ...current.sound },\n    presenter: { ...current.presenter },\n",
  );
}

async function patchCarousel() {
  await replaceOnce(
    "src/engine/CinematicCarousel.ts",
    `interface EngineCallbacks {
  onError?: (message: string) => void;
  onContextState?: (state: "ready" | "lost" | "restored") => void;
  onFrame?: (fps: number) => void;
}`,
    `export type CarouselSonicEvent = Readonly<{
  type: "passage" | "grab" | "release";
  intensity: number;
  pan: number;
}>;

interface EngineCallbacks {
  onError?: (message: string) => void;
  onContextState?: (state: "ready" | "lost" | "restored") => void;
  onFrame?: (fps: number) => void;
  onSonicEvent?: (event: CarouselSonicEvent) => void;
}`,
  );
  await replaceOnce(
    "src/engine/CinematicCarousel.ts",
    "  private presenterRequestGeneration = 0;\n",
    "  private presenterRequestGeneration = 0;\n  private lastSonicStep: number | null = null;\n",
  );
  await replaceOnce(
    "src/engine/CinematicCarousel.ts",
    `  setSettings(settings: StudioSettings): void {
    this.settings = settings;`,
    `  setSettings(settings: StudioSettings): void {
    this.settings = settings;
    this.lastSonicStep = null;`,
  );
  await replaceOnce(
    "src/engine/CinematicCarousel.ts",
    `    this.assets = assets.filter((asset) => asset.kind === "image");
    this.pruneInactiveTextures();`,
    `    this.assets = assets.filter((asset) => asset.kind === "image");
    this.lastSonicStep = null;
    this.pruneInactiveTextures();`,
  );
  await replaceOnce(
    "src/engine/CinematicCarousel.ts",
    `        this.updateCamera();
        this.setPresenterExportFrame(null);
        this.renderPreview();`,
    `        this.updateCamera();
        this.setPresenterExportFrame(null);
        this.lastSonicStep = null;
        this.renderPreview();`,
  );
  await replaceOnce(
    "src/engine/CinematicCarousel.ts",
    `  private renderPreview(): void {
    if (this.contextLost || this.disposed || this.exportActive) return;
    this.renderInternal(this.elapsed, this.motionPosition, this.motionVelocity, false);
  }

  private renderInternal`,
    `  private renderPreview(): void {
    if (this.contextLost || this.disposed || this.exportActive) return;
    const geometry = getSlideGeometry(this.settings);
    this.emitPassageCue(geometry.stride);
    this.renderInternal(this.elapsed, this.motionPosition, this.motionVelocity, false);
  }

  private emitPassageCue(stride: number): void {
    if (!this.callbacks.onSonicEvent || stride <= 0 || this.assets.length === 0) return;
    const step = Math.round(this.motionPosition / stride);
    if (this.lastSonicStep === null) {
      this.lastSonicStep = step;
      return;
    }
    if (step === this.lastSonicStep) return;
    const delta = step - this.lastSonicStep;
    this.lastSonicStep = step;
    const intensity = THREE.MathUtils.clamp(Math.abs(this.motionVelocity) / Math.max(1, stride * 0.72), 0.32, 1);
    const pan = this.settings.motion.axis === "horizontal"
      ? THREE.MathUtils.clamp(-Math.sign(delta) * (0.32 + intensity * 0.2), -0.72, 0.72)
      : 0;
    this.callbacks.onSonicEvent({ type: "passage", intensity, pan });
  }

  private renderInternal`,
  );
  await replaceOnce(
    "src/engine/CinematicCarousel.ts",
    `    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.dataset.dragging = "true";
  }`,
    `    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.dataset.dragging = "true";
    this.callbacks.onSonicEvent?.({ type: "grab", intensity: 0.46, pan: 0 });
  }`,
  );
  await replaceOnce(
    "src/engine/CinematicCarousel.ts",
    `    this.canvas.dataset.dragging = "false";
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }`,
    `    this.canvas.dataset.dragging = "false";
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    const geometry = getSlideGeometry(this.settings);
    const intensity = THREE.MathUtils.clamp(Math.abs(this.motionVelocity) / Math.max(1, geometry.stride), 0.34, 1);
    const pan = this.settings.motion.axis === "horizontal"
      ? THREE.MathUtils.clamp(-Math.sign(this.motionVelocity) * 0.38, -0.62, 0.62)
      : 0;
    this.callbacks.onSonicEvent?.({ type: "release", intensity, pan });
  }`,
  );
}

async function patchStage() {
  await replaceOnce(
    "src/components/Stage.tsx",
    `import type { RefObject } from "react";
import type { ExportProgress, StudioAsset, StudioSettings } from "../model";`,
    `import type { RefObject } from "react";
import type { ExportProgress, SonicSettings, StudioAsset, StudioSettings } from "../model";
import { SonicDock } from "./SonicDock";
import type { SonicRuntimeState } from "../sonic/SonicEngine";`,
  );
  await replaceOnce(
    "src/components/Stage.tsx",
    `  onCancelExport: () => void;
  busy: boolean;
}`,
    `  onCancelExport: () => void;
  sound: SonicSettings;
  sonicState: SonicRuntimeState;
  onSound: (patch: Partial<SonicSettings>) => void;
  onAuditionSound: () => void;
  busy: boolean;
}`,
  );
  await replaceOnce(
    "src/components/Stage.tsx",
    `  onDropImages,
  onCancelExport,
  busy,`,
    `  onDropImages,
  onCancelExport,
  sound,
  sonicState,
  onSound,
  onAuditionSound,
  busy,`,
  );
  await replaceOnce(
    "src/components/Stage.tsx",
    `        <span className="transport-divider" />
        <span className="transport-copy">Drag · wheel · space</span>
        <button type="button" disabled={busy} className="focus-button"`,
    `        <span className="transport-divider" />
        <span className="transport-copy">Drag · wheel · space</span>
        <SonicDock
          settings={sound}
          state={sonicState}
          disabled={busy}
          onSettings={onSound}
          onAudition={onAuditionSound}
        />
        <button type="button" disabled={busy} className="focus-button"`,
  );
}

async function patchStyles() {
  await replaceOnce(
    "src/styles.css",
    `.transport {
  display: flex;`,
    `.transport {
  position: relative;
  display: flex;`,
  );
  await appendOnce(
    "src/styles.css",
    ".sonic-dock {",
    `.sonic-dock {
  position: relative;
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: 8px;
}

.transport .sonic-mute,
.sonic-dock summary {
  min-width: auto;
  height: 27px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: #7e786f;
  background: transparent;
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 8px;
  letter-spacing: 0.1em;
}

.transport .sonic-mute {
  padding: 0 7px;
}

.sonic-dock[data-state="ready"] .sonic-mute,
.sonic-dock[data-state="ready"] summary span {
  color: #d9c2a7;
}

.sonic-dock[data-state="unavailable"] {
  opacity: 0.48;
}

.sonic-dock details {
  position: static;
}

.sonic-dock summary {
  gap: 6px;
  padding: 0 5px;
  cursor: pointer;
  list-style: none;
}

.sonic-dock summary::-webkit-details-marker {
  display: none;
}

.sonic-dock summary i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.025);
}

.sonic-dock[data-state="ready"] summary i {
  box-shadow: 0 0 10px rgba(216, 170, 124, 0.52);
}

.sonic-popover {
  position: absolute;
  right: 54px;
  bottom: 39px;
  z-index: 60;
  width: min(370px, calc(100vw - 28px));
  max-height: min(620px, calc(100vh - 105px));
  display: grid;
  gap: 15px;
  padding: 18px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.13);
  background:
    radial-gradient(circle at 85% 0, rgba(165, 93, 53, 0.12), transparent 38%),
    rgba(16, 15, 14, 0.985);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(20px);
}

.sonic-popover header {
  display: grid;
  gap: 5px;
}

.sonic-popover header > span,
.sonic-palettes legend {
  color: var(--rust-light);
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 8px;
  letter-spacing: 0.14em;
}

.sonic-popover header strong {
  color: #d8d0c4;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 17px;
  font-weight: 400;
}

.sonic-popover header p {
  margin: 0;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.5;
}

.sonic-palettes {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.sonic-palettes legend {
  margin-bottom: 8px;
}

.sonic-palettes > div {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}

.sonic-palettes label {
  position: relative;
}

.sonic-palettes input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.sonic-palettes span {
  min-height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  color: #787269;
  font-size: 9px;
  cursor: pointer;
}

.sonic-palettes input:checked + span {
  border-color: rgba(197, 126, 80, 0.72);
  color: #ead6c0;
  background: rgba(164, 84, 43, 0.12);
}

.sonic-palettes input:focus-visible + span {
  outline: 2px solid var(--rust-light);
  outline-offset: 2px;
}

.sonic-ranges {
  display: grid;
  gap: 9px;
}

.sonic-range {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) 26px;
  align-items: center;
  gap: 8px;
  color: #9b948a;
  font-size: 9px;
}

.sonic-range input {
  width: 100%;
  accent-color: var(--rust-light);
}

.sonic-range output {
  color: #6f6961;
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  text-align: right;
}

.sonic-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.sonic-switch > span {
  display: grid;
  gap: 4px;
}

.sonic-switch strong {
  color: #bbb3a8;
  font-size: 10px;
  font-weight: 500;
}

.sonic-switch small {
  color: var(--faint);
  font-size: 8px;
}

.sonic-switch input {
  width: 30px;
  accent-color: var(--rust-light);
}

.transport .sonic-audition {
  width: 100%;
  height: 34px;
  border-radius: 0;
  border-color: rgba(197, 126, 80, 0.42);
  color: #d7c1aa;
  font-size: 9px;
}

.sonic-popover footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #5d5851;
  font-size: 8px;
  line-height: 1.45;
}

@media (max-width: 760px) {
  .transport-copy {
    display: none;
  }

  .sonic-dock {
    margin-left: 3px;
  }

  .sonic-popover {
    right: 8px;
    bottom: 42px;
    width: min(360px, calc(100vw - 16px));
  }
}

@media (max-width: 390px) {
  .sonic-dock summary span {
    display: none;
  }

  .transport .sonic-mute {
    padding-inline: 4px;
  }

  .sonic-popover {
    right: 4px;
    width: calc(100vw - 8px);
  }
}`,
  );
}

async function patchTests() {
  await replaceOnce(
    "tests/settingsValidation.test.ts",
    `  DEFAULT_SETTINGS,
  ENGINE_VERSION,`,
    `  DEFAULT_SETTINGS,
  DEFAULT_SONIC_SETTINGS,
  ENGINE_VERSION,`,
  );
  await appendOnce(
    "tests/settingsValidation.test.ts",
    'describe("sound settings schema"',
    `describe("sound settings schema", () => {
  it("migrates a complete v1 project to authored v2 sound defaults", () => {
    const source = settings();
    source.schemaVersion = 1;
    delete source.sound;

    const migrated = validateStudioSettings(source);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.sound).toEqual(DEFAULT_SONIC_SETTINGS);
    expect(migrated.sound).not.toBe(DEFAULT_SONIC_SETTINGS);
  });

  it("accepts every palette and bounded sound control", () => {
    for (const palette of ["studio", "cinematic", "paper"]) {
      const source = settings();
      source.sound.palette = palette;
      Object.assign(source.sound, {
        masterGain: palette === "studio" ? 0 : 1,
        motionGain: 1,
        interfaceGain: 0,
        density: 1,
        variation: 0,
        duckUnderPresenter: 1,
      });
      expect(validateStudioSettings(source).sound.palette).toBe(palette);
    }
  });

  it("rejects missing v2 sound state, malformed booleans, palettes, and gains", () => {
    const missing = settings();
    delete missing.sound;
    expectInvalid(missing, "sound");

    for (const [path, value] of [
      ["sound.previewEnabled", "yes"],
      ["sound.exportEnabled", 1],
      ["sound.palette", "plastic"],
      ["sound.masterGain", -0.001],
      ["sound.motionGain", 1.001],
      ["sound.interfaceGain", Number.NaN],
      ["sound.density", Number.POSITIVE_INFINITY],
      ["sound.variation", -1],
      ["sound.duckUnderPresenter", 2],
    ] as const) {
      const source = settings();
      setPath(source, path, value);
      expectInvalid(source, path);
    }
  });

  it("returns an independent sound object", () => {
    const source = cloneSettings(DEFAULT_SETTINGS);
    const validated = validateStudioSettings(source);
    expect(validated.sound).not.toBe(source.sound);
    validated.sound.masterGain = 0;
    expect(source.sound.masterGain).toBe(DEFAULT_SETTINGS.sound.masterGain);
  });
});`,
  );

  await appendOnce(
    "e2e/studio.e2e.ts",
    'test("tactile sound direction persists locally without external requests"',
    `test("tactile sound direction persists locally without external requests", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") externalRequests.push(request.url());
  });

  await waitForStudio(page);
  await page.getByLabel("Open sound direction controls").click();
  await expect(page.getByRole("group", { name: "Sound direction" })).toBeVisible();
  await page.getByLabel("Cinema").check();
  await page.getByLabel("Master").fill("0.41");
  await page.getByRole("switch", { name: /Include in MP4/ }).uncheck();
  await page.getByRole("button", { name: "Audition gesture" }).click();
  await expect(page.getByText("armed", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Mute tactile preview sound" }).click();
  await expect(page.getByText("muted", { exact: true })).toBeVisible();
  await expect(page.locator(".header-status")).toContainText("saved locally", { timeout: 10_000 });

  await page.reload();
  await expect(page.getByText("Local project reopened with verified media.")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Open sound direction controls").click();
  await expect(page.getByLabel("Cinema")).toBeChecked();
  await expect(page.getByLabel("Master")).toHaveValue("0.41");
  await expect(page.getByRole("switch", { name: /Include in MP4/ })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Enable tactile preview sound" })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("sound-design-only MP4 produces one verified AAC track", async ({ page }) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const { exportMp4 } = await import("/src/lib/exportStudio.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    const duration = 3;
    const soundtrack = new AudioBuffer({
      length: duration * 48_000,
      numberOfChannels: 2,
      sampleRate: 48_000,
    });
    for (let channel = 0; channel < soundtrack.numberOfChannels; channel += 1) {
      const data = soundtrack.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        const phase = (index % 12_000) / 12_000;
        data[index] = phase < 0.03 ? Math.sin(phase * Math.PI / 0.03) * 0.12 : 0;
      }
    }

    const result = await exportMp4({
      canvas,
      settings: { width: 256, height: 256, fps: 24, duration },
      soundtrack,
      renderAt(time) {
        context.fillStyle = "#11100f";
        context.fillRect(0, 0, 256, 256);
        context.fillStyle = "#c26d3f";
        context.fillRect(24 + Math.round(time * 20), 90, 80, 80);
      },
    });
    return {
      size: result.blob?.size ?? 0,
      audio: result.audio,
      verificationAudio: result.verification.audio,
    };
  });

  expect(receipt.size).toBeGreaterThan(0);
  expect(receipt.audio).toMatchObject({
    codec: "aac",
    sampleRate: 48_000,
    channels: 2,
    source: "sound-design",
  });
  expect(receipt.verificationAudio).toMatchObject({ codec: "aac", decoded: true });
});`,
  );
}

async function patchDocs() {
  await replaceOnce(
    "README.md",
    "- AAC presenter audio at 48 kHz stereo with an explicit A/V-sync gate.\n",
    "- Tactile CC0 passage, grab, release, settle, control, success, and failure cues—bundled locally, never music.\n- One verified AAC track at 48 kHz stereo: presenter speech, authored sound design, or a sample-aligned mix of both.\n",
  );
  await replaceOnce(
    "README.md",
    "The default master is 1080 × 1920, 30 fps, 8 seconds, SDR sRGB/Rec.709, opaque H.264 at 16 Mbit/s. When the pinned video has audio, Drift uses AAC at 48 kHz stereo and 192 kbit/s.\n",
    "The default master is 1080 × 1920, 30 fps, 8 seconds, SDR sRGB/Rec.709, opaque H.264 at 16 Mbit/s. Authored tactile effects are on by default; when effects or presenter speech are present, Drift writes one AAC track at 48 kHz stereo and 192 kbit/s.\n",
  );
  await replaceOnce(
    "README.md",
    "- Presenter audio is allowed at 24, 25, or 30 fps. At 50/60 fps, mute presenter audio or export fails visibly. This is an honest guard around current browser AAC priming behaviour, not an arbitrary UI limit.\n",
    "- Audio-bearing output is allowed at 24, 25, or 30 fps. At 50/60 fps, disable exported effects and mute presenter audio or export fails visibly. This is an honest guard around current browser AAC priming behaviour, not an arbitrary UI limit.\n",
  );
  await replaceOnce(
    "ASSET-LICENSE.md",
    "No third-party image, font, video, or audio asset is included in the repository.\n",
    `No third-party image, font, or video asset is included in the repository.

## UI SFX audio cues

Drift vendors 21 short OGG cues from [UI SFX](https://github.com/romainsimon/uisfx) at exact revision \`${UPSTREAM_REVISION}\`. The selected \`studio\`, \`cinematic\`, and \`zen\` pack files are dedicated to the public domain under **CC0-1.0**.

Exact upstream paths, SHA-256 digests, and byte lengths are recorded in \`src/sonic/assets/manifest.json\`. The upstream audio licence text is preserved at \`src/sonic/assets/LICENSE-CC0-1.0.txt\`.`,
  );
  await replaceOnce(
    "THIRD_PARTY_NOTICES.md",
    "| fflate | 0.8.3 | MIT | Portable project and PNG-sequence ZIPs |\n",
    `| fflate | 0.8.3 | MIT | Portable project and PNG-sequence ZIPs |
| UI SFX audio corpus | \`${UPSTREAM_REVISION.slice(0, 12)}\` | CC0-1.0 | Local tactile interaction and passage cues |\n`,
  );
  await replaceOnce(
    "THIRD_PARTY_NOTICES.md",
    "No third-party font, stock photograph, presenter clip, or proprietary shader is bundled.\n",
    "No third-party font, stock photograph, presenter clip, or proprietary shader is bundled. Twenty-one short UI SFX OGG files are bundled under CC0-1.0 with a per-file hash ledger.\n",
  );
  await appendOnce(
    "docs/ARCHITECTURE.md",
    "## Sonic path",
    `## Sonic path

Sound follows the same state-first rule as the renderer. \`src/sonic/plan.ts\` derives semantic passage times from saved motion settings, asset count, slide geometry, and the pure distance evaluator. It does not inspect animation frames or record real-time preview.

Preview uses a lazy, user-gesture-unlocked \`AudioContext\` with a bounded voice pool. Export uses \`OfflineAudioContext\` to render the same passage vocabulary into an exact 48 kHz stereo bed. Editor-only grab, release, control, success, and failure cues are excluded from the master.

MP4 contains at most one AAC track. When presenter speech and sound design coexist, decoded presenter PCM is mixed sample-by-sample with the effects bed before AAC encoding. The mixer owns timestamp mapping, interpolation, channel mapping, gain, and clipping. Completed output passes the existing codec, duration, sync, and decoded-probe readback gates.

All cue bytes are local, pinned, and hash-ledgered. Vite compiles OGG assets inline; production sound has no runtime network path. See [Sonic design](SONIC_DESIGN.md).`,
  );
  await appendOnce(
    "docs/PRODUCT_CONTRACT.md",
    "## Sonic extension",
    `## Sonic extension

- Motion receives short tactile cues, never music or an ambient loop.
- Sound is visible, mutable project state with one-action preview mute and independent MP4 inclusion.
- Preview never autoplays before a trusted gesture and sound is never the only carrier of meaning.
- Export cue times derive from the same deterministic carousel geometry as picture.
- Presenter speech and effects share one sample-aligned AAC track; speech remains primary through an explicit under-voice gain.
- The bundled corpus is licence-safe, local, pinned to an exact revision, and verified by SHA-256.
- Reduced-motion output is silent; seamless output has no doubled sonic seam.
- Audio-bearing 50/60 fps masters fail visibly rather than dropping audio.
- Sound-only and mixed output must pass MP4 audio readback and decode probes.`,
  );
}

await vendorAssets();
await patchModel();
await patchValidation();
await patchThemes();
await patchCarousel();
await patchStage();
await patchStyles();
await patchTests();
await patchDocs();
console.log("Pinned sonic assets and core integration applied.");
