#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path.cwd()


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content.rstrip() + "\n", encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    require(count == 1, f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_app() -> None:
    path = "src/App.tsx"
    text = read(path)
    if 'from "./components/DirectorDock"' not in text:
        imports = list(re.finditer(r"^import[\s\S]*?;\n", text, flags=re.MULTILINE))
        require(bool(imports), "App.tsx: no imports found")
        at = imports[-1].end()
        text = text[:at] + 'import { DirectorDock } from "./components/DirectorDock";\n' + text[at:]

    if "<DirectorDock" not in text:
        assets_match = re.search(r"const\s+\[(\w+),\s*\w+\]\s*=\s*useState<StudioAsset\[\]>", text)
        assets_name = assets_match.group(1) if assets_match else "assets"
        control_match = re.search(r"<ControlPanel\b[\s\S]{0,7000}?onSettings=\{([^}\n]+)\}", text)
        on_settings = control_match.group(1).strip() if control_match else "setSettings"
        anchor = re.search(r"(?m)^(\s*)<ControlPanel\b", text)
        require(anchor is not None, "App.tsx: ControlPanel JSX not found")
        indent = anchor.group(1)
        dock = (
            f"{indent}<DirectorDock\n"
            f"{indent}  settings={{settings}}\n"
            f"{indent}  assets={{{assets_name}}}\n"
            f"{indent}  onSettings={{{on_settings}}}\n"
            f"{indent}/>`DOCK_END`\n"
        ).replace("`DOCK_END`", "")
        text = text[:anchor.start()] + dock + text[anchor.start():]
    write(path, text)


def patch_authored_pass() -> None:
    path = "src/engine/evaluate.ts"
    text = read(path)
    old_distance = (
        "export function distanceAtTime(settings: StudioSettings, time: number, slotCount: number, stride: number, exportMode: boolean): number {"
    )
    if old_distance in text:
        text = text.replace(
            old_distance,
            "export function distanceAtTime(\n"
            "  settings: StudioSettings,\n"
            "  time: number,\n"
            "  slotCount: number,\n"
            "  stride: number,\n"
            "  exportMode: boolean,\n"
            "  authoredSlideCount = slotCount,\n"
            "): number {",
            1,
        )
        text = replace_once(
            text,
            "    return direction * slotCount * stride * Math.max(1, Math.round(settings.motion.seamlessLoops)) * phase;\n",
            "    const authoredCycle = Math.max(1, Math.floor(authoredSlideCount));\n"
            "    return direction * authoredCycle * stride * Math.max(1, Math.round(settings.motion.seamlessLoops)) * phase;\n",
            "distance authored cycle",
        )

    old_velocity = (
        "export function velocityAtTime(\n"
        "  settings: StudioSettings,\n"
        "  slotCount: number,\n"
        "  stride: number,\n"
        "  exportMode: boolean,\n"
        "): number {"
    )
    if old_velocity in text:
        text = text.replace(
            old_velocity,
            "export function velocityAtTime(\n"
            "  settings: StudioSettings,\n"
            "  slotCount: number,\n"
            "  stride: number,\n"
            "  exportMode: boolean,\n"
            "  authoredSlideCount = slotCount,\n"
            "): number {",
            1,
        )
        text = replace_once(
            text,
            "      * slotCount\n      * stride\n",
            "      * Math.max(1, Math.floor(authoredSlideCount))\n      * stride\n",
            "velocity authored cycle",
        )
    require("authoredSlideCount" in text, "evaluate.ts authored pass patch failed")
    write(path, text)


def patch_engine() -> None:
    path = "src/engine/CinematicCarousel.ts"
    text = read(path)

    if "masterPreviewTime" not in text:
        text = replace_once(
            text,
            "  private presenterRequestGeneration = 0;\n",
            "  private presenterRequestGeneration = 0;\n"
            "  private masterPreviewTime: number | null = null;\n"
            "  private masterPreviewRequest = 0;\n",
            "engine preview fields",
        )
        text = replace_once(
            text,
            "  private readonly onContextRestoredBound = () => this.onContextRestored();\n",
            "  private readonly onContextRestoredBound = () => this.onContextRestored();\n"
            "  private readonly onMasterPreviewBound = (event: Event) => { void this.onMasterPreview(event); };\n"
            "  private readonly onMasterResumeBound = () => this.resumeLivePreview();\n"
            "  private readonly onMasterCaptureBound = (event: Event) => { void this.onMasterCapture(event); };\n",
            "engine preview handlers",
        )
        text = replace_once(
            text,
            '    document.addEventListener("visibilitychange", this.onVisibilityBound);\n',
            '    document.addEventListener("visibilitychange", this.onVisibilityBound);\n'
            '    window.addEventListener("drift:master-preview", this.onMasterPreviewBound);\n'
            '    window.addEventListener("drift:master-resume", this.onMasterResumeBound);\n'
            '    window.addEventListener("drift:capture-master-still", this.onMasterCaptureBound);\n',
            "engine preview listeners",
        )
        text = replace_once(
            text,
            "  setPaused(paused: boolean): void {\n    this.paused = paused;\n",
            "  setPaused(paused: boolean): void {\n"
            "    if (!paused) this.masterPreviewTime = null;\n"
            "    this.paused = paused;\n",
            "engine setPaused",
        )
        text = replace_once(
            text,
            "  stepSlides(amount: number): void {\n    const geometry = getSlideGeometry(this.settings);\n",
            "  stepSlides(amount: number): void {\n"
            "    this.masterPreviewTime = null;\n"
            "    const geometry = getSlideGeometry(this.settings);\n",
            "engine stepSlides",
        )
        text = replace_once(
            text,
            "  private renderPreview(): void {\n"
            "    if (this.contextLost || this.disposed || this.exportActive) return;\n"
            "    this.renderInternal(this.elapsed, this.motionPosition, this.motionVelocity, false);\n"
            "  }\n",
            "  private renderPreview(): void {\n"
            "    if (this.contextLost || this.disposed || this.exportActive) return;\n"
            "    if (this.masterPreviewTime !== null) {\n"
            "      this.renderAt(this.masterPreviewTime);\n"
            "      return;\n"
            "    }\n"
            "    this.renderInternal(this.elapsed, this.motionPosition, this.motionVelocity, false);\n"
            "  }\n",
            "engine renderPreview",
        )

        capture_anchor = "  async captureStill(width: number, height: number, time = 0): Promise<Blob> {\n"
        require(capture_anchor in text, "engine captureStill anchor missing")
        methods = '''  private async onMasterPreview(event: Event): Promise<void> {
    const detail = (event as CustomEvent<{ time?: number }>).detail;
    const time = THREE.MathUtils.clamp(
      Number(detail?.time ?? 0),
      0,
      Math.max(0, this.settings.output.duration),
    );
    const request = ++this.masterPreviewRequest;
    this.masterPreviewTime = time;
    this.paused = true;
    this.syncPresenterPlayback();
    try {
      await this.renderAtAsync(time);
      if (request !== this.masterPreviewRequest) return;
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error.message : "Master preview failed.");
    }
  }

  private resumeLivePreview(): void {
    this.masterPreviewRequest += 1;
    this.masterPreviewTime = null;
    this.setPaused(false);
    this.renderPreview();
  }

  private async onMasterCapture(event: Event): Promise<void> {
    const detail = (event as CustomEvent<{ time?: number; filename?: string }>).detail;
    const time = THREE.MathUtils.clamp(
      Number(detail?.time ?? this.masterPreviewTime ?? 0),
      0,
      Math.max(0, this.settings.output.duration),
    );
    try {
      const blob = await this.captureStill(
        this.settings.output.width,
        this.settings.output.height,
        time,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = detail?.filename || `drift-frame-${time.toFixed(2)}s.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      window.dispatchEvent(new CustomEvent("drift:capture-result", {
        detail: { ok: true, message: `Saved the exact frame at ${time.toFixed(2)} s.` },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Frame capture failed.";
      this.callbacks.onError?.(message);
      window.dispatchEvent(new CustomEvent("drift:capture-result", {
        detail: { ok: false, message },
      }));
    }
  }

'''
        text = text.replace(capture_anchor, methods + capture_anchor, 1)

        text, count = re.subn(
            r"(  private onPointerDown\(event: PointerEvent\): void \{\n)",
            r"\1    this.masterPreviewTime = null;\n",
            text,
            count=1,
        )
        require(count == 1, "engine onPointerDown anchor missing")
        text, count = re.subn(
            r"(  private onWheel\(event: WheelEvent\): void \{\n)",
            r"\1    this.masterPreviewTime = null;\n",
            text,
            count=1,
        )
        require(count == 1, "engine onWheel anchor missing")

        removal = '    document.removeEventListener("visibilitychange", this.onVisibilityBound);\n'
        require(removal in text, "engine dispose listener anchor missing")
        text = text.replace(
            removal,
            removal
            + '    window.removeEventListener("drift:master-preview", this.onMasterPreviewBound);\n'
            + '    window.removeEventListener("drift:master-resume", this.onMasterResumeBound);\n'
            + '    window.removeEventListener("drift:capture-master-still", this.onMasterCaptureBound);\n',
            1,
        )

    text = text.replace(
        "distanceAtTime(this.settings, time, slotCount, geometry.stride, true);",
        "distanceAtTime(this.settings, time, slotCount, geometry.stride, true, this.assets.length);",
    )
    text = text.replace(
        "velocityAtTime(this.settings, slotCount, geometry.stride, true);",
        "velocityAtTime(this.settings, slotCount, geometry.stride, true, this.assets.length);",
    )
    require(
        "distanceAtTime(this.settings, time, slotCount, geometry.stride, true, this.assets.length)" in text,
        "engine authored distance call missing",
    )
    require(
        "velocityAtTime(this.settings, slotCount, geometry.stride, true, this.assets.length)" in text,
        "engine authored velocity call missing",
    )
    write(path, text)


def patch_readme() -> None:
    path = "README.md"
    text = read(path)
    if "## Direct the master" not in text:
        anchor = "## Run it\n"
        require(anchor in text, "README run anchor missing")
        section = '''## Direct the master

The **Director’s Desk** gives the editor a legible first path before the deep inspector:

- pacing recipes expressed as reading time per slide
- an exact fixed-step master timeline with slide-arrival chapters
- bounded undo/redo and hold-to-compare
- presenter-duration and frame-rate preflight
- non-rendering centre/social caution guides
- deterministic still capture from the current master playhead
- a copyable master brief for handoff or review

One seamless loop means one pass through the uploaded deck. Renderer padding no longer leaks into the user-facing timing model.

'''
        text = text.replace(anchor, section + anchor, 1)
    write(path, text)


def main() -> None:
    require((ROOT / "package.json").exists(), "Run from repository root")
    patch_app()
    patch_authored_pass()
    patch_engine()
    patch_readme()
    print("Creator journey integrated")


if __name__ == "__main__":
    main()
