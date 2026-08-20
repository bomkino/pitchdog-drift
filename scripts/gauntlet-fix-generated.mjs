import { readFileSync, rmSync, writeFileSync } from "node:fs";

function replaceRequired(path, search, replacement) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(search)) {
    throw new Error(`Could not find required patch target in ${path}: ${search.slice(0, 120)}`);
  }
  writeFileSync(path, source.replace(search, replacement), "utf8");
}

function replaceAllRequired(path, search, replacement) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(search)) {
    throw new Error(`Could not find required repeated target in ${path}: ${search.slice(0, 120)}`);
  }
  writeFileSync(path, source.replaceAll(search, replacement), "utf8");
}

const media = "src/components/MediaLibrary.tsx";

replaceRequired(
  media,
  "  onAddImages: (files: File[]) => void;\n",
  "  onAddImages: (files: File[]) => void;\n  onReplaceImages: (files: File[]) => void;\n",
);
replaceRequired(
  media,
  "  onAddImages,\n  onPresenter,\n",
  "  onAddImages,\n  onReplaceImages,\n  onPresenter,\n",
);
replaceRequired(
  media,
  "  const imageInput = useRef<HTMLInputElement>(null);\n  const presenterInput = useRef<HTMLInputElement>(null);\n",
  "  const imageInput = useRef<HTMLInputElement>(null);\n  const replaceInput = useRef<HTMLInputElement>(null);\n  const presenterInput = useRef<HTMLInputElement>(null);\n",
);
replaceRequired(
  media,
  "  const addPresenter = (event: ChangeEvent<HTMLInputElement>) => {\n",
  "  const replaceImages = (event: ChangeEvent<HTMLInputElement>) => {\n    const files = orderImportedImageFiles(Array.from(event.currentTarget.files ?? []));\n    if (files.length) onReplaceImages(files);\n    event.currentTarget.value = \"\";\n  };\n  const addPresenter = (event: ChangeEvent<HTMLInputElement>) => {\n",
);
replaceRequired(
  media,
  "      <input ref={imageInput} hidden tabIndex={-1} disabled={busy} type=\"file\" accept=\"image/png,image/jpeg,image/webp,image/avif\" multiple onChange={addImages} />\n      <input ref={presenterInput}",
  "      <input ref={imageInput} data-testid=\"add-slides-input\" hidden tabIndex={-1} disabled={busy} type=\"file\" accept=\"image/png,image/jpeg,image/webp,image/avif\" multiple onChange={addImages} />\n      <input ref={replaceInput} data-testid=\"replace-slides-input\" hidden tabIndex={-1} disabled={busy} type=\"file\" accept=\"image/jpeg,image/png,image/webp,image/avif\" multiple onChange={replaceImages} />\n      <input ref={presenterInput} data-testid=\"presenter-input\"",
);
replaceRequired(
  media,
  "        <button type=\"button\" className=\"media-add subtle\" disabled={busy} onClick={() => presenterInput.current?.click()}>\n          Presenter\n        </button>\n",
  "        <button type=\"button\" className=\"media-add subtle\" disabled={busy} onClick={() => replaceInput.current?.click()}>\n          Replace deck\n        </button>\n        <button type=\"button\" className=\"media-add subtle presenter-add\" disabled={busy} onClick={() => presenterInput.current?.click()}>\n          Presenter\n        </button>\n",
);
replaceRequired(
  media,
  "      <p className=\"media-note\">Batch imports use natural filename order. Drag to resequence; Alt + ↑/↓ also works. One image or video can stay pinned. Files remain local.</p>\n",
  "      <p className=\"media-note\"><strong>Add</strong> extends the sequence. <strong>Replace</strong> commits only after every new image decodes. Drag to resequence; Alt + ↑/↓ also works. Files remain local.</p>\n",
);

const styles = "src/styles.css";
replaceRequired(
  styles,
  "  grid-template-columns: 1.3fr 1fr;\n",
  "  grid-template-columns: repeat(2, minmax(0, 1fr));\n",
);
replaceRequired(
  styles,
  ".media-library {\n  display: flex;\n",
  ".media-library {\n  display: flex;\n  overflow-y: hidden;\n",
);
replaceRequired(
  styles,
  ".asset-list {\n  min-height: 0;\n  flex: 1 1 auto;\n",
  ".asset-list {\n  min-height: 0;\n  flex: 1 1 auto;\n  overflow-x: hidden;\n  overflow-y: auto;\n  scrollbar-width: thin;\n  scrollbar-color: #49443d transparent;\n",
);
replaceRequired(
  styles,
  ".presenter-slot {\n  flex: 0 0 auto;\n  padding-top: 20px;\n}\n",
  ".presenter-slot {\n  position: relative;\n  z-index: 3;\n  flex: 0 0 auto;\n  margin-top: 12px;\n  padding-top: 12px;\n  border-top: 1px solid var(--line);\n  background: rgba(20, 19, 17, 0.99);\n}\n",
);
writeFileSync(
  styles,
  `${readFileSync(styles, "utf8")}\n.media-add-row .presenter-add { grid-column: 1 / -1; }\n`,
  "utf8",
);

const controls = "src/components/ControlPanel.tsx";
replaceRequired(
  controls,
  "              aria-pressed={settings.themeId === theme.id}\n              title={theme.description}\n",
  "              aria-pressed={settings.themeId === theme.id}\n              aria-label={`${theme.name}. ${theme.description}`}\n              title={theme.description}\n",
);
replaceRequired(
  controls,
  "        <SwitchField label=\"Autoplay\" checked={settings.motion.autoplay} hint=\"Drag, wheel, arrows, and pause remain available.\" onChange={(autoplay) => patch(\"motion\", { autoplay })} />\n",
  "        <SwitchField label=\"Master motion\" checked={settings.motion.autoplay} hint=\"Off creates a still master. Preview pause is temporary and never rewrites this saved delivery intent.\" onChange={(autoplay) => patch(\"motion\", { autoplay })} />\n",
);

const stage = "src/components/Stage.tsx";
replaceRequired(
  stage,
  "  const masterFrames = Math.round(settings.output.duration * settings.output.fps);\n",
  "  const masterFrames = Math.round(settings.output.duration * settings.output.fps);\n  const masterStill = !settings.motion.autoplay;\n",
);
replaceRequired(
  stage,
  "            <span>{settings.motion.seamless ? `${settings.motion.seamlessLoops}× CLOSED` : \"FREE RUN\"}</span>\n",
  "            <span>{masterStill ? \"STILL MASTER\" : settings.motion.seamless ? `${settings.motion.seamlessLoops}× CLOSED` : \"FREE RUN\"}</span>\n",
);
replaceRequired(
  stage,
  "        <button type=\"button\" disabled={busy} className=\"play-button\" onClick={onTogglePause} aria-label={paused ? \"Play preview\" : \"Pause preview\"} aria-pressed={!paused}>\n          {paused ? \"PLAY\" : \"PAUSE\"}\n        </button>\n",
  "        <button\n          type=\"button\"\n          disabled={busy || masterStill}\n          className=\"play-button\"\n          onClick={onTogglePause}\n          aria-label={masterStill ? \"Still master. Enable Master motion in Director to animate.\" : paused ? \"Play preview\" : \"Pause preview\"}\n          aria-pressed={masterStill ? undefined : !paused}\n        >\n          {masterStill ? \"STILL\" : paused ? \"PLAY\" : \"PAUSE\"}\n        </button>\n",
);
replaceRequired(
  stage,
  "        <span className=\"transport-copy\">{settings.output.fps} fps · {masterFrames} exact frames</span>\n",
  "        <span className=\"transport-copy\">{masterStill ? `still master · ${masterFrames} exact frames` : `${settings.output.fps} fps · ${masterFrames} exact frames`}</span>\n",
);

const app = "src/App.tsx";
replaceRequired(
  app,
  "      if (event.code === \"Space\") {\n        event.preventDefault();\n        const isPaused = engineRef.current?.togglePaused() ?? paused;\n",
  "      if (event.code === \"Space\") {\n        if (!settingsRef.current.motion.autoplay) return;\n        event.preventDefault();\n        const isPaused = engineRef.current?.togglePaused() ?? paused;\n",
);
replaceRequired(
  app,
  "  const togglePause = useCallback(() => {\n    const next = engineRef.current?.togglePaused() ?? !paused;\n",
  "  const togglePause = useCallback(() => {\n    if (!settingsRef.current.motion.autoplay) return;\n    const next = engineRef.current?.togglePaused() ?? !paused;\n",
);

const evaluator = "src/engine/evaluate.ts";
replaceRequired(
  evaluator,
  "export function positiveModulo(value: number, modulus: number): number {\n  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;\n  return ((value % modulus) + modulus) % modulus;\n}\n",
  "export function positiveModulo(value: number, modulus: number): number {\n  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;\n  return ((value % modulus) + modulus) % modulus;\n}\n\nexport function authoredSlideIndex(logicalIndex: number, sourceSlideCount: number): number {\n  if (!Number.isSafeInteger(logicalIndex) || !Number.isSafeInteger(sourceSlideCount) || sourceSlideCount <= 0) return 0;\n  return positiveModulo(logicalIndex, sourceSlideCount);\n}\n",
);
replaceRequired(
  evaluator,
  "export function velocityForPreview(\n  settings: StudioSettings,\n  sourceSlideCount: number,\n  stride: number,\n): number {\n  return settings.motion.direction\n    * slidesPerSecondForPreview(settings, sourceSlideCount)\n    * stride;\n}\n",
  "export function velocityForPreview(\n  settings: StudioSettings,\n  sourceSlideCount: number,\n  stride: number,\n): number {\n  const slidesPerSecond = slidesPerSecondForPreview(settings, sourceSlideCount);\n  if (slidesPerSecond === 0) return 0;\n  return settings.motion.direction * slidesPerSecond * stride;\n}\n",
);

const carousel = "src/engine/CinematicCarousel.ts";
replaceRequired(
  carousel,
  "  distanceAtTime,\n",
  "  authoredSlideIndex,\n  distanceAtTime,\n",
);
replaceRequired(
  carousel,
  "  setSettings(settings: StudioSettings): void {\n    this.settings = settings;\n",
  "  setSettings(settings: StudioSettings): void {\n    const stoppedMasterMotion = this.settings.motion.autoplay && !settings.motion.autoplay;\n    this.settings = settings;\n    if (stoppedMasterMotion) this.motionVelocity = 0;\n",
);
replaceRequired(
  carousel,
  "    uniforms.uPhase!.value = logicalIndex;\n",
  "    uniforms.uPhase!.value = authoredSlideIndex(logicalIndex, this.assets.length);\n",
);

const evaluateTest = "tests/evaluate.test.ts";
replaceRequired(
  evaluateTest,
  "  distanceAtTime,\n",
  "  authoredSlideIndex,\n  distanceAtTime,\n",
);
replaceRequired(
  evaluateTest,
  "  it(\"evaluates the same frame identically\", () => {\n",
  "  it(\"maps virtual padding copies back to stable authored slide identity\", () => {\n    expect(authoredSlideIndex(0, 3)).toBe(0);\n    expect(authoredSlideIndex(3, 3)).toBe(0);\n    expect(authoredSlideIndex(8, 3)).toBe(2);\n    expect(authoredSlideIndex(-1, 3)).toBe(2);\n    expect(authoredSlideIndex(2, 0)).toBe(0);\n  });\n\n  it(\"evaluates the same frame identically\", () => {\n",
);

const naming = "src/lib/naming.ts";
replaceRequired(
  naming,
  "  const leaf = name.replace(/\\\\/gu, \"/\").split(\"/\").at(-1) ?? name;\n",
  "  // File.name is already a leaf. Treat slashes as unsafe punctuation rather\n  // than silently discarding the human project name before them.\n  const leaf = name;\n",
);
replaceRequired(
  naming,
  "    .replace(/[\\u0300-\\u036f]/gu, \"\")\n    .replace(/[^a-zA-Z0-9]+/gu, \"-\")\n",
  "    .replace(/[\\u0300-\\u036f]/gu, \"\")\n    .replace(/['’`]/gu, \"\")\n    .replace(/[^a-zA-Z0-9]+/gu, \"-\")\n",
);

const studioE2e = "e2e/studio.e2e.ts";
replaceRequired(
  studioE2e,
  "  await expect(fileInputs).toHaveCount(3);\n",
  "  await expect(fileInputs).toHaveCount(4);\n",
);
replaceRequired(
  studioE2e,
  "  await slideChooser.setFiles([]);\n\n  const presenterChooserPromise",
  "  await slideChooser.setFiles([]);\n\n  const replaceChooserPromise = page.waitForEvent(\"filechooser\");\n  await page.getByRole(\"button\", { name: \"Replace deck\" }).click();\n  const replaceChooser = await replaceChooserPromise;\n  expect(replaceChooser.isMultiple()).toBe(true);\n  await replaceChooser.setFiles([]);\n\n  const presenterChooserPromise",
);

const cinematicE2e = "e2e/cinematic.e2e.ts";
replaceRequired(
  cinematicE2e,
  "  await expect(page.getByRole(\"switch\", { name: \"Autoplay\" })).toHaveCount(0);\n  const atmosphere = page.locator(\"details\").filter({ has: page.locator(\"summary\", { hasText: \"Atmosphere\" }) });\n  await atmosphere.locator(\"summary\").click();\n  const variation = page.getByLabel(\"World variation\");\n  await variation.fill(\"9876\");\n  await variation.blur();\n  await expect(variation).toHaveValue(\"9876\");\n\n  const lensResponse = page.getByRole(\"slider\", { name: \"Lens response\" });\n",
  "  const masterMotion = page.getByRole(\"switch\", { name: \"Master motion\" });\n  await expect(masterMotion).toBeChecked();\n  await masterMotion.click();\n  await expect(page.getByRole(\"button\", { name: /Still master/ })).toBeDisabled();\n  await masterMotion.click();\n  await expect(page.getByRole(\"button\", { name: \"Pause preview\" })).toBeEnabled();\n\n  const atmosphere = page.locator(\"details\").filter({ has: page.locator(\"summary\", { hasText: \"Atmosphere\" }) });\n  await atmosphere.locator(\"summary\").click();\n  const authoredScene = page.getByRole(\"combobox\", { name: \"Authored scene\" });\n  const sceneBeforeRecut = await authoredScene.inputValue();\n  await page.getByRole(\"button\", { name: \"Recut atmosphere\" }).click();\n  await expect(authoredScene).toHaveValue(sceneBeforeRecut);\n\n  const lensResponse = page.getByRole(\"slider\", { name: \"Lens energy\" });\n",
);

writeFileSync(
  "e2e/mediaJourney.e2e.ts",
  `import { expect, test } from "@playwright/test";\nimport { readFile } from "node:fs/promises";\nimport path from "node:path";\n\nconst fixturePath = path.resolve("e2e/fixtures/slide.png");\n\nasync function waitForStudio(page: import("@playwright/test").Page): Promise<void> {\n  await page.goto("/");\n  await expect(page.locator(".asset-list li").first()).toBeVisible({ timeout: 30_000 });\n  await expect(page.locator(".stage-frame")).toHaveAttribute("data-context", /ready|restored/);\n}\n\ntest("deck replacement is explicit, atomic, and naturally ordered", async ({ page }) => {\n  const errors: string[] = [];\n  page.on("pageerror", (error) => errors.push(error.message));\n  page.on("console", (message) => {\n    if (message.type() === "error") errors.push(message.text());\n  });\n\n  await waitForStudio(page);\n  const addInput = page.getByTestId("add-slides-input");\n  const replaceInput = page.getByTestId("replace-slides-input");\n  await expect(addInput).toHaveCount(1);\n  await expect(replaceInput).toHaveCount(1);\n\n  await addInput.setInputFiles(fixturePath);\n  await expect(page.locator(".asset-list li")).toHaveCount(1);\n  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");\n\n  const bytes = await readFile(fixturePath);\n  let abortedConfirmation = "";\n  page.once("dialog", (dialog) => {\n    abortedConfirmation = dialog.message();\n    void dialog.accept();\n  });\n  await replaceInput.setInputFiles([\n    { name: "02-good.png", mimeType: "image/png", buffer: bytes },\n    { name: "03-broken.png", mimeType: "image/png", buffer: Buffer.from("not a png") },\n  ]);\n  await expect(page.getByRole("alert")).toContainText("Replacement aborted");\n  expect(abortedConfirmation).toContain("removed only after every replacement image decodes successfully");\n  await expect(page.locator(".asset-list li")).toHaveCount(1);\n  await expect(page.locator(".asset-list li").first()).toContainText("slide.png");\n\n  let committedConfirmation = "";\n  page.once("dialog", (dialog) => {\n    committedConfirmation = dialog.message();\n    void dialog.accept();\n  });\n  await replaceInput.setInputFiles([\n    { name: "10-ten.png", mimeType: "image/png", buffer: bytes },\n    { name: "2-two.png", mimeType: "image/png", buffer: bytes },\n  ]);\n  expect(committedConfirmation).toContain("Replace 1 moving slide with 2?");\n  await expect(page.locator(".asset-list li")).toHaveCount(2);\n  await expect(page.locator(".asset-list li").nth(0)).toContainText("2-two.png");\n  await expect(page.locator(".asset-list li").nth(1)).toContainText("10-ten.png");\n  await expect(page.getByText("2 replacement slides decoded, committed, and queued for local save.")).toBeVisible();\n  expect(errors).toEqual([]);\n});\n`,
  "utf8",
);

const journeyDoc = "docs/USER_JOURNEY_GAUNTLET.md";
replaceAllRequired(journeyDoc, "Autoplay", "Master motion");
replaceAllRequired(journeyDoc, "autoplay", "master motion");

rmSync("scripts/gauntlet-fix-generated.mjs", { force: true });
