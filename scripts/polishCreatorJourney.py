#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()


def patch(path: str, old: str, new: str, label: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


engine = (ROOT / "src/engine/CinematicCarousel.ts").read_text(encoding="utf-8")
if "masterPreviewTime" not in engine or "drift:capture-master-still" not in engine:
    raise RuntimeError("Core creator-journey integration is not present; refusing to polish a partial branch")

patch(
    "src/components/DirectorDock.tsx",
    '<button type="button" key={recipe.id} onClick={() => applyPace(recipe.id)}>',
    '<button type="button" key={recipe.id} aria-label={`Pace: ${recipe.name}`} onClick={() => applyPace(recipe.id)}>',
    "unambiguous pacing controls",
)

patch(
    "src/lib/directorJourney.ts",
    "  if (settings.output.width < 1080 && settings.output.height < 1080) {",
    "  if (Math.min(settings.output.width, settings.output.height) < 1080) {",
    "small output preflight",
)

path = ROOT / "e2e/directorJourney.e2e.ts"
text = path.read_text(encoding="utf-8")
text = text.replace('page.getByRole("button", { name: /Editorial/ })', 'page.getByRole("button", { name: "Pace: Editorial" })')
text = text.replace('page.getByRole("button", { name: /Kinetic/ })', 'page.getByRole("button", { name: "Pace: Kinetic" })')
text = text.replace('page.getByRole("status")', 'page.locator(".director-status")')
path.write_text(text, encoding="utf-8")

print("Creator journey polish applied")
