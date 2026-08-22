import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { StagePresentation } from "../core/project/appPresentation";
import type { ExportProgress, StudioAsset } from "../model";
import { fitStagePreview, type StagePreviewSize } from "./stageGeometry";

interface StageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  presentation: StagePresentation;
  assets: StudioAsset[];
  pinnedAsset: StudioAsset | null;
  webglError: string | null;
  contextState: "ready" | "lost" | "restored";
  fps: number;
  paused: boolean;
  focusMode: boolean;
  activeSlideIndex: number;
  exportProgress: ExportProgress | null;
  onTogglePause: () => void;
  onStep: (amount: number) => void;
  onToggleFocus: () => void;
  onDropImages: (files: File[]) => void;
  onCancelExport: () => void;
  busy: boolean;
}

export function Stage({
  canvasRef,
  frameRef,
  presentation,
  assets,
  pinnedAsset,
  webglError,
  contextState,
  fps,
  paused,
  focusMode,
  activeSlideIndex,
  exportProgress,
  onTogglePause,
  onStep,
  onToggleFocus,
  onDropImages,
  onCancelExport,
  busy,
}: StageProps) {
  const wellRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<StagePreviewSize | null>(null);
  const transparent = presentation.transparent;
  const activeAsset = activeSlideIndex >= 0 ? assets[activeSlideIndex] : undefined;
  const pinDescription = presentation.pinEnabled && pinnedAsset
    ? ` Protected still frame: ${pinnedAsset.name}.`
    : "";
  const previewDescription = assets.length === 0
    ? `Cinematic preview. No slides. ${presentation.directionLabel}. ${presentation.axis} ${presentation.pathLabel} flow.${pinDescription} Preview ${paused ? "paused" : "playing"}. Stage ${presentation.width} by ${presentation.height}. Drag or add images to begin.`
    : `Cinematic preview. ${assets.length} slides. Centered slide ${Math.max(0, activeSlideIndex) + 1}: ${activeAsset?.name ?? assets[0]?.name ?? "loading"}. ${presentation.directionLabel}. ${presentation.axis} ${presentation.pathLabel} flow.${pinDescription} Preview ${paused ? "paused" : "playing"}. Stage ${presentation.width} by ${presentation.height}. Use the previous and next controls, drag, wheel, or Space to navigate.`;

  useLayoutEffect(() => {
    const well = wellRef.current;
    if (!well) return;
    let active = true;

    const updateSize = (width: number, height: number) => {
      if (!active) return;
      const next = fitStagePreview(
        width,
        height,
        presentation.width,
        presentation.height,
      );
      setPreviewSize((current) => {
        if (current === null || next === null) return next;
        return Math.abs(current.width - next.width) < 0.25
          && Math.abs(current.height - next.height) < 0.25
          ? current
          : next;
      });
    };

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) updateSize(box.width, box.height);
    });
    observer.observe(well);
    const initial = well.getBoundingClientRect();
    const style = window.getComputedStyle(well);
    updateSize(
      initial.width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
      initial.height - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom),
    );

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [presentation.height, presentation.width]);

  return (
    <section className="stage-column" aria-label="Cinematic preview" aria-describedby="stage-preview-description" aria-busy={busy}>
      <p id="stage-preview-description" className="visually-hidden">{previewDescription}</p>
      <div className="stage-topline">
        <span>{presentation.directionLabel}</span>
        <span>{presentation.axis} · {presentation.pathLabel}</span>
      </div>
      <div ref={wellRef} className="stage-well">
        <div
          ref={frameRef}
          className="stage-frame"
          data-transparent={transparent}
          data-context={contextState}
          style={{
            aspectRatio: `${presentation.width} / ${presentation.height}`,
            width: previewSize ? `${previewSize.width}px` : undefined,
            height: previewSize ? `${previewSize.height}px` : undefined,
          }}
          onDragOver={(event) => {
            if (!busy && event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            if (busy) return;
            const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
            if (files.length) {
              event.preventDefault();
              onDropImages(files);
            }
          }}
        >
          <canvas ref={canvasRef} aria-hidden="true" data-testid="webgl-stage" />
          {transparent ? <div className="transparency-grid" aria-hidden="true" /> : null}
          <div className="stage-guide top-left" aria-hidden="true" />
          <div className="stage-guide top-right" aria-hidden="true" />
          <div className="stage-guide bottom-left" aria-hidden="true" />
          <div className="stage-guide bottom-right" aria-hidden="true" />

          {!webglError && assets.length === 0 ? (
            <div className="empty-stage">
              <span>DROP SLIDES</span>
              <strong>A film needs frames.</strong>
              <small>PNG · JPEG · WebP · AVIF</small>
            </div>
          ) : null}

          {webglError ? (
            <div className="fallback-stage" role="status">
              <span>DOM FALLBACK</span>
              <strong>Cinematic renderer unavailable.</strong>
              <p>{webglError}</p>
              <div className="fallback-strip">
                {assets.map((asset) => <figure key={asset.id}><img src={asset.objectUrl} alt={asset.name} /><figcaption>{asset.name}</figcaption></figure>)}
              </div>
              <small>Media and project controls remain usable. Cinematic export is blocked, never silently downgraded.</small>
            </div>
          ) : null}

          {contextState === "lost" ? <div className="context-lost" role="alert">GPU context lost · waiting for recovery</div> : null}
          {exportProgress ? (
            <div className="export-overlay" role="status" aria-live="polite">
              <span>{exportProgress.phase}</span>
              <strong>{exportProgress.message}</strong>
              <progress value={exportProgress.completed} max={Math.max(1, exportProgress.total)} />
              <small>{Math.round((exportProgress.completed / Math.max(1, exportProgress.total)) * 100)}%</small>
              <button type="button" onClick={onCancelExport}>Cancel export</button>
            </div>
          ) : null}

          <div className="stage-hud" aria-hidden="true">
            <span>{presentation.width} × {presentation.height}</span>
            <span>{fps > 0 ? `${fps} FPS` : "GPU"}</span>
          </div>
        </div>
      </div>

      <div className="transport" aria-label="Playback controls">
        <button type="button" disabled={busy} onClick={() => onStep(-1)} aria-label="Previous slide">←</button>
        <button type="button" disabled={busy} className="play-button" onClick={onTogglePause} aria-label={paused ? "Play preview" : "Pause preview"} aria-pressed={!paused}>
          {paused ? "PLAY" : "PAUSE"}
        </button>
        <button type="button" disabled={busy} onClick={() => onStep(1)} aria-label="Next slide">→</button>
        <span className="transport-divider" />
        <span className="transport-copy">Drag · wheel · space</span>
        <button type="button" disabled={busy} className="focus-button" onClick={onToggleFocus}>{focusMode ? "Exit full frame" : "Full frame"}</button>
      </div>
    </section>
  );
}
