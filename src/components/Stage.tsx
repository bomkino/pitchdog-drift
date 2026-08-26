import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { StagePresentation } from "../core/project/appPresentation";
import type { ExportProgress, StudioAsset } from "../model";
import { fitStagePreview, type StagePreviewSize } from "./stageGeometry";
import type { PlatformGuideProfile } from "../core/platformGuides";
import type { VisualTimelineModel } from "../core/timeline/visualTimelineModel";
import { TimelineDock } from "./TimelineDock";

function formatExportTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

function exportCount(progress: ExportProgress): string {
  if (progress.unit === "frames") {
    const frameNumber = progress.frameIndex === null
      ? Math.round(progress.completed)
      : progress.frameIndex + 1;
    return `Frame ${frameNumber} of ${Math.round(progress.total)}`;
  }
  if (progress.unit === "seconds") {
    return `${progress.completed.toFixed(1)} of ${progress.total.toFixed(1)} seconds`;
  }
  return progress.determinate
    ? `${Math.round(progress.completed)} of ${Math.round(progress.total)}`
    : "Preparing";
}

interface StageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  presentation: StagePresentation;
  assets: StudioAsset[];
  pinnedAsset: StudioAsset | null;
  webglError: string | null;
  contextState: "ready" | "lost" | "restored";
  fps: number;
  outputFps: number;
  paused: boolean;
  reducedMotionPreview: boolean;
  focusMode: boolean;
  activeSlideIndex: number;
  platformGuide: PlatformGuideProfile;
  exportProgress: ExportProgress | null;
  timeline: VisualTimelineModel;
  previewTime: number;
  onPausedChange: (paused: boolean) => void;
  onSeekPreview: (time: number) => void;
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
  outputFps,
  paused,
  reducedMotionPreview,
  focusMode,
  activeSlideIndex,
  platformGuide,
  exportProgress,
  timeline,
  previewTime,
  onPausedChange,
  onSeekPreview,
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
    ? `Cinematic preview. No slides. ${presentation.directionLabel}. ${presentation.axis} ${presentation.pathLabel} flow.${pinDescription} Preview ${reducedMotionPreview ? "held by the Mac Reduce Motion setting" : paused ? "paused" : "playing"}. Stage ${presentation.width} by ${presentation.height}. Drag or add images to begin.`
    : `Cinematic preview. ${assets.length} slides. Centered slide ${Math.max(0, activeSlideIndex) + 1}: ${activeAsset?.name ?? assets[0]?.name ?? "loading"}. ${presentation.directionLabel}. ${presentation.axis} ${presentation.pathLabel} flow.${pinDescription} Preview ${reducedMotionPreview ? "held by the Mac Reduce Motion setting" : paused ? "paused" : "playing"}. Stage ${presentation.width} by ${presentation.height}. Use the timeline, drag, wheel, or Space to navigate.`;

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
          {platformGuide.id !== "none" ? (
            <div className="platform-guide-overlay" data-profile={platformGuide.id} aria-hidden="true">
              {platformGuide.obstructions.map((rect, index) => (
                <div
                  className="platform-obstruction"
                  key={`${rect.x}:${rect.y}:${rect.width}:${rect.height}`}
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                  }}
                >
                  {index === 0 ? <span>{platformGuide.label}</span> : null}
                </div>
              ))}
              {platformGuide.safeInsets ? (
                <div
                  className="platform-safe-frame"
                  style={{
                    inset: `${platformGuide.safeInsets.top * 100}% ${platformGuide.safeInsets.right * 100}% ${platformGuide.safeInsets.bottom * 100}% ${platformGuide.safeInsets.left * 100}%`,
                  }}
                />
              ) : null}
              {platformGuide.id.startsWith("instagram") ? (
                <>
                  <div className="instagram-header-silhouette"><i /><i /><i /></div>
                  <div className="instagram-reply-silhouette"><i /><i /></div>
                  {platformGuide.id !== "instagram-story" ? <div className="instagram-action-rail"><i /><i /><i /><i /></div> : null}
                </>
              ) : null}
            </div>
          ) : null}

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
              {exportProgress.determinate ? (
                <progress value={exportProgress.ratio} max={1} />
              ) : <div className="export-progress-indeterminate" aria-hidden="true"><i /></div>}
              <small className="export-progress-facts">
                <span>{exportCount(exportProgress)}</span>
                <span>Elapsed {formatExportTime(exportProgress.elapsedSeconds)}</span>
                <span>{exportProgress.etaSeconds === null ? "Estimating…" : `ETA ${formatExportTime(exportProgress.etaSeconds)}`}</span>
                {exportProgress.ratePerSecond !== null ? (
                  <span>{exportProgress.ratePerSecond.toFixed(1)} {exportProgress.unit === "frames" ? "frames/s" : exportProgress.unit === "seconds" ? "seconds/s" : "steps/s"}</span>
                ) : null}
              </small>
              {exportProgress.stallKind ? (
                <p className="export-stall" role="alert">
                  {exportProgress.stallKind === "first-frame"
                    ? "Presenter video has not delivered a frame. Cancel, use H.264 MP4 or WebM, or try a shorter source."
                    : exportProgress.phase === "finalize" || exportProgress.phase === "verify" || exportProgress.phase === "commit"
                      ? "Closing and checking the MP4 is taking unusually long. Drift is still working; Cancel remains safe."
                      : "This export step is taking unusually long. Drift is still working; Cancel remains safe."}
                </p>
              ) : null}
              <button type="button" onClick={onCancelExport}>Cancel export</button>
            </div>
          ) : null}

          <div className="stage-hud" aria-hidden="true">
            <span>{presentation.width} × {presentation.height}</span>
            <span>{fps > 0 ? `${fps} FPS` : "GPU"}</span>
          </div>
        </div>
      </div>

      <TimelineDock
        model={timeline}
        currentTime={previewTime}
        outputFps={outputFps}
        paused={paused}
        reducedMotionPreview={reducedMotionPreview}
        focusMode={focusMode}
        busy={busy}
        onPausedChange={onPausedChange}
        onSeek={onSeekPreview}
        onToggleFocus={onToggleFocus}
      />
    </section>
  );
}
