import type { RefObject } from "react";
import type { ExportProgress, StudioAsset, StudioSettings } from "../model";

interface StageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  settings: StudioSettings;
  assets: StudioAsset[];
  webglError: string | null;
  contextState: "ready" | "lost" | "restored";
  fps: number;
  paused: boolean;
  focusMode: boolean;
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
  settings,
  assets,
  webglError,
  contextState,
  fps,
  paused,
  focusMode,
  exportProgress,
  onTogglePause,
  onStep,
  onToggleFocus,
  onDropImages,
  onCancelExport,
  busy,
}: StageProps) {
  const transparent = settings.stage.transparent || settings.background.style === "transparent";
  return (
    <section className="stage-column" aria-label="Cinematic preview" aria-busy={busy}>
      <div className="stage-topline">
        <span>{settings.themeId.replaceAll("-", " ")}</span>
        <span>{settings.motion.axis} · {settings.motion.flow} · {settings.optics.enabled ? settings.optics.profile : "clean bypass"}</span>
      </div>
      <div className="stage-well">
        <div
          ref={frameRef}
          className="stage-frame"
          data-transparent={transparent}
          data-context={contextState}
          style={{ aspectRatio: `${settings.stage.width} / ${settings.stage.height}` }}
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
              {exportProgress.phase === "complete"
                ? <span className="export-complete">Verified</span>
                : <button type="button" onClick={onCancelExport}>Cancel export</button>}
            </div>
          ) : null}

          <div className="stage-hud" aria-hidden="true">
            <span>{settings.stage.width} × {settings.stage.height}</span>
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
