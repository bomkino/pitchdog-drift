import { readFileSync, rmSync, writeFileSync } from "node:fs";

function replaceRequired(path, search, replacement) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(search)) {
    throw new Error(`Could not find required patch target in ${path}: ${search.slice(0, 120)}`);
  }
  writeFileSync(path, source.replace(search, replacement), "utf8");
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
  "      <input ref={imageInput} hidden tabIndex={-1} disabled={busy} type=\"file\" accept=\"image/png,image/jpeg,image/webp,image/avif\" multiple onChange={addImages} />\n      <input ref={replaceInput} hidden tabIndex={-1} disabled={busy} type=\"file\" accept=\"image/png,image/jpeg,image/webp,image/avif\" multiple onChange={replaceImages} />\n      <input ref={presenterInput}",
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
writeFileSync(
  styles,
  `${readFileSync(styles, "utf8")}\n.media-add-row .presenter-add { grid-column: 1 / -1; }\n`,
  "utf8",
);

const evaluator = "src/engine/evaluate.ts";
replaceRequired(
  evaluator,
  "export function velocityForPreview(\n  settings: StudioSettings,\n  sourceSlideCount: number,\n  stride: number,\n): number {\n  return settings.motion.direction\n    * slidesPerSecondForPreview(settings, sourceSlideCount)\n    * stride;\n}\n",
  "export function velocityForPreview(\n  settings: StudioSettings,\n  sourceSlideCount: number,\n  stride: number,\n): number {\n  const slidesPerSecond = slidesPerSecondForPreview(settings, sourceSlideCount);\n  if (slidesPerSecond === 0) return 0;\n  return settings.motion.direction * slidesPerSecond * stride;\n}\n",
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

rmSync("scripts/gauntlet-fix-generated.mjs", { force: true });
