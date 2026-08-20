import { useEffect, useState, type RefObject } from "react";
import { orderImportedImageFiles } from "../lib/importOrder";
import type { ExportProgress, StudioAsset, StudioSettings } from "../model";

type GuideMode = "off" | "edge" | "copy" | "reels";

const GUIDE_MODES: GuideMode[] = ["off", "edge", "copy", "reels"];

function initialGuideMode(): GuideMode {
  try {
    const saved = window.localStorage.getItem("pitchdog-drift-guide-mode");
    return GUIDE_MODES.includes(saved as GuideMode) ? saved as GuideMode : "off";
  } catch {
    return "off";
  }
}

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
  const [guideMode, setGuideMode] = useState<GuideMode>(initialGuideMode);
  const [dropActive, setDropActive] = useState(false);
  const transparent = settings.stage.transparent || settings.background.style === "transparent";
  const demoMode = assets.length > 0 && assets.every((asset) => asset.demo);
  const masterFrames = Math.round(settings.output.duration * settings.output.fps);

  useEffect(() => {
    try {
      window.localStorage.setItem("pitchdog-drift-guide-mode", guideMode);
    } catch {
      // Guide preference is a convenience. Storage denial never blocks the studio.
    }
  }, [guideMode]);

  const cycleGuides = () => {
    const index = GUIDE_MODES.indexOf(guideMode);
    setGuideMode(GUIDE_MODES[(index + 1) % GUIDE_MODES.length]!);
  };

  const acceptDroppedFiles = (files: FileList) => {
    const images = orderImportedImageFiles(Array.from(files));
    if (images.length) onDropImages(images);
  };

  return (
    <section className="stage-column" aria-label="Cinematic preview" aria-busy={busy} data-drop-active={dropActive}>
      <div className="stage-topline">
        <span>{settings.themeId.replaceAll("-", " ")}</span>
        <span>{settings.output.duration} s · {masterFrames} frames</span>
        <span>{settings.motion.axis} · {settings.motion.flow}</span>
      </div>
      <div className="stage-well">
        <div
          ref={frameRef}
          className="stage-frame"
          data-transparent={transparent}
          data-context={contextState}
          data-guide={guideMode}
          style={{ aspectRatio: `${settings.stage.width} / ${settings.stage.height}` }}
          onDragEnter={(event) => {
            if (!busy && event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
              setDropActive(true);
            }
          }}
          onDragOver={(event) => {
            if (!busy && event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDropActive(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
          }}
          onDrop={(event) => {
            setDropActive(false);
            if (busy) return;
            const files = event.dataTransfer.files;
            if (files.length) {
              event.preventDefault();
              acceptDroppedFiles(files);
            }
          }}
        >
          <canvas ref={canvasRef} aria-hidden="true" data-testid="webgl-stage" />
          {transparent ? <div className="transparency-grid" aria-hidden="true" /> : null}
          <div className="stage-guide top-left" aria-hidden="true" />
          <div className="stage-guide top-right" aria-hidden="true" />
          <div className="stage-guide bottom-left" aria-hidden="true" />
          <div className="stage-guide bottom-right" aria-hidden="true" />

          {guideMode !== "off" ? (
            <div className="safe-guides" data-mode={guideMode} aria-hidden="true">
              <div className="safe-outline safe-edge" />
              {guideMode === "copy" || guideMode === "reels" ? <div className="safe-outline safe-copy" /> : null}
              {guideMode === "reels" ? (
                <>
                  <div className="reels-risk reels-top" />
                  <div className="reels-risk reels-bottom" />
                  <div className="reels-risk reels-right" />
                </>
              ) : null}
              <span>{guideMode === "edge" ? "EDGE SAFE" : guideMode === "copy" ? "COPY SAFE" : "REELS WORKING SAFE"} · NOT EXPORTED</span>
            </div>
          ) : null}

          {demoMode && !webglError ? (
            <div className="demo-ribbon" role="note">
              <span>LIVE STUDY</span>
              <strong>Drop your deck anywhere on the frame to replace all demo slides.</strong>
            </div>
          ) : null}

          {dropActive ? (
            <div className="stage-drop-target" aria-hidden="true">
              <span>{demoMode ? "REPLACE THE STUDY" : "ADD TO THE SEQUENCE"}</span>
              <strong>Drop your deck.</strong>
              <small>Images are decoded locally, natural-sorted by filename, and copied into the project.</small>
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
              <progress value={exportProgress.completed} max={Math.max(1, exportProgress.total)} />
              <small>{Math.round((exportProgress.completed / Math.max(1, exportProgress.total)) * 100)}%</small>
              <button type="button" onClick={onCancelExport}>Cancel export</button>
            </div>
          ) : null}

          <div className="stage-hud" aria-hidden="true">
            <span>{settings.stage.width} × {settings.stage.height}</span>
            <span>{settings.motion.seamless ? `${settings.motion.seamlessLoops}× CLOSED` : "FREE RUN"}</span>
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
        <span className="transport-copy">{settings.output.fps} fps · {masterFrames} exact frames</span>
        <button
          type="button"
          disabled={busy}
          className="guide-button"
          onClick={cycleGuides}
          aria-label={`Guides: ${guideMode}`}
          aria-pressed={guideMode !== "off"}
        >
          Guides · {guideMode}
        </button>
        <button type="button" disabled={busy} className="focus-button" onClick={onToggleFocus}>{focusMode ? "Exit full frame" : "Full frame"}</button>
      </div>
    </section>
  );
}
