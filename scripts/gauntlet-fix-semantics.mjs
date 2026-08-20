import { readFileSync, rmSync, writeFileSync } from "node:fs";

function replaceRequired(path, search, replacement) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(search)) {
    throw new Error(`Could not find semantics patch target in ${path}: ${search.slice(0, 120)}`);
  }
  writeFileSync(path, source.replace(search, replacement), "utf8");
}

const controls = "src/components/ControlPanel.tsx";
replaceRequired(
  controls,
  "        <SwitchField label=\"Master motion\" checked={settings.motion.autoplay} hint=\"Off creates a still master. Preview pause is temporary and never rewrites this saved delivery intent.\" onChange={(autoplay) => patch(\"motion\", { autoplay })} />\n",
  "        <SwitchField label=\"Slide motion\" checked={settings.motion.autoplay} hint=\"Saved delivery intent. Off holds the moving deck on its opening composition; atmosphere and pinned video can still move.\" onChange={(autoplay) => patch(\"motion\", { autoplay })} />\n",
);

const stage = "src/components/Stage.tsx";
replaceRequired(
  stage,
  "  const masterStill = !settings.motion.autoplay;\n",
  "  const slidesHeld = !settings.motion.autoplay;\n",
);
replaceRequired(
  stage,
  "            <span>{masterStill ? \"STILL MASTER\" : settings.motion.seamless ? `${settings.motion.seamlessLoops}× CLOSED` : \"FREE RUN\"}</span>\n",
  "            <span>{slidesHeld ? \"SLIDES HELD\" : settings.motion.seamless ? `${settings.motion.seamlessLoops}× CLOSED` : \"FREE RUN\"}</span>\n",
);
replaceRequired(
  stage,
  "        <button\n          type=\"button\"\n          disabled={busy || masterStill}\n          className=\"play-button\"\n          onClick={onTogglePause}\n          aria-label={masterStill ? \"Still master. Enable Master motion in Director to animate.\" : paused ? \"Play preview\" : \"Pause preview\"}\n          aria-pressed={masterStill ? undefined : !paused}\n        >\n          {masterStill ? \"STILL\" : paused ? \"PLAY\" : \"PAUSE\"}\n        </button>\n",
  "        <button type=\"button\" disabled={busy} className=\"play-button\" onClick={onTogglePause} aria-label={paused ? \"Play preview\" : \"Pause preview\"} aria-pressed={!paused}>\n          {paused ? \"PLAY\" : \"PAUSE\"}\n        </button>\n",
);
replaceRequired(
  stage,
  "        <span className=\"transport-copy\">{masterStill ? `still master · ${masterFrames} exact frames` : `${settings.output.fps} fps · ${masterFrames} exact frames`}</span>\n",
  "        <span className=\"transport-copy\">{slidesHeld ? `slides held · ${settings.output.fps} fps · ${masterFrames} exact frames` : `${settings.output.fps} fps · ${masterFrames} exact frames`}</span>\n",
);

const app = "src/App.tsx";
replaceRequired(
  app,
  "      if (event.code === \"Space\") {\n        if (!settingsRef.current.motion.autoplay) return;\n        event.preventDefault();\n",
  "      if (event.code === \"Space\") {\n        event.preventDefault();\n",
);
replaceRequired(
  app,
  "  const togglePause = useCallback(() => {\n    if (!settingsRef.current.motion.autoplay) return;\n    const next = engineRef.current?.togglePaused() ?? !paused;\n",
  "  const togglePause = useCallback(() => {\n    const next = engineRef.current?.togglePaused() ?? !paused;\n",
);

const carousel = "src/engine/CinematicCarousel.ts";
replaceRequired(
  carousel,
  "  setPaused(paused: boolean): void {\n    this.paused = paused;\n    if (paused) this.motionVelocity *= 0.7;\n",
  "  setPaused(paused: boolean): void {\n    this.paused = paused;\n    if (paused) this.motionVelocity = 0;\n",
);
replaceRequired(
  carousel,
  "      this.elapsed += delta;\n      this.advanceMotion(delta);\n",
  "      if (!this.paused) this.elapsed += delta;\n      this.advanceMotion(delta);\n",
);

const cinematic = "e2e/cinematic.e2e.ts";
replaceRequired(
  cinematic,
  "  const masterMotion = page.getByRole(\"switch\", { name: \"Master motion\" });\n  await expect(masterMotion).toBeChecked();\n  await masterMotion.click();\n  await expect(page.getByRole(\"button\", { name: /Still master/ })).toBeDisabled();\n  await masterMotion.click();\n  await expect(page.getByRole(\"button\", { name: \"Pause preview\" })).toBeEnabled();\n",
  "  const slideMotion = page.getByRole(\"switch\", { name: \"Slide motion\" });\n  await expect(slideMotion).toBeChecked();\n  await slideMotion.click();\n  await expect(page.locator(\".stage-hud\")).toContainText(\"SLIDES HELD\");\n  await expect(page.getByRole(\"button\", { name: \"Pause preview\" })).toBeEnabled();\n  await slideMotion.click();\n",
);
replaceRequired(
  cinematic,
  "  const lensResponse = page.getByRole(\"slider\", { name: \"Lens energy\" });\n  await lensResponse.evaluate((input) => {\n    const range = input as HTMLInputElement;\n    range.value = \"78\";\n    range.dispatchEvent(new Event(\"input\", { bubbles: true }));\n    range.dispatchEvent(new Event(\"change\", { bubbles: true }));\n  });\n  await expect(lensResponse).toHaveValue(\"78\");\n",
  "  const lensResponse = page.getByRole(\"slider\", { name: \"Lens energy\" });\n  await lensResponse.fill(\"78\");\n  await expect(lensResponse).toHaveValue(\"78\");\n",
);

const journeyDoc = "docs/USER_JOURNEY_GAUNTLET.md";
const source = readFileSync(journeyDoc, "utf8");
writeFileSync(
  journeyDoc,
  source.replaceAll("Master motion", "Slide motion").replaceAll("master motion", "slide motion"),
  "utf8",
);

rmSync("scripts/gauntlet-fix-semantics.mjs", { force: true });
