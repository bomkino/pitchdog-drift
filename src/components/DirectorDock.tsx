import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioAsset, StudioSettings } from "../model";
import { cloneSettings } from "../model";
import {
  PACING_RECIPES,
  applyPacingRecipe,
  buildMasterBrief,
  getDirectorPreflight,
  getJourneySteps,
  getMasterChapters,
  getMasterMetrics,
  getMovingSlides,
  type PacingRecipeId,
} from "../lib/directorJourney";
import "../directorDock.css";

interface DirectorDockProps {
  settings: StudioSettings;
  assets: StudioAsset[];
  onSettings: (settings: StudioSettings) => void;
}

type GuideId = "none" | "centre" | "social";

const HISTORY_LIMIT = 48;
const HISTORY_BURST_MS = 420;

function signature(settings: StudioSettings): string {
  return JSON.stringify(settings);
}

function useDirectionHistory(
  settings: StudioSettings,
  onSettings: (settings: StudioSettings) => void,
) {
  const past = useRef<StudioSettings[]>([]);
  const future = useRef<StudioSettings[]>([]);
  const last = useRef(cloneSettings(settings));
  const burstOpen = useRef(false);
  const burstTimer = useRef<number | null>(null);
  const skippedSignature = useRef<string | null>(null);
  const compareReference = useRef(cloneSettings(settings));
  const compareLive = useRef<StudioSettings | null>(null);
  const [, setRevision] = useState(0);

  const closeBurst = useCallback(() => {
    burstOpen.current = false;
    if (burstTimer.current !== null) {
      window.clearTimeout(burstTimer.current);
      burstTimer.current = null;
    }
  }, []);

  const applyWithoutHistory = useCallback((next: StudioSettings) => {
    closeBurst();
    const clone = cloneSettings(next);
    skippedSignature.current = signature(clone);
    last.current = clone;
    onSettings(clone);
  }, [closeBurst, onSettings]);

  useEffect(() => {
    const nextSignature = signature(settings);
    if (skippedSignature.current === nextSignature) {
      skippedSignature.current = null;
      last.current = cloneSettings(settings);
      setRevision((value) => value + 1);
      return;
    }
    if (signature(last.current) === nextSignature) return;
    if (!burstOpen.current) {
      past.current.push(cloneSettings(last.current));
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      burstOpen.current = true;
    }
    future.current = [];
    last.current = cloneSettings(settings);
    if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
    burstTimer.current = window.setTimeout(closeBurst, HISTORY_BURST_MS);
    setRevision((value) => value + 1);
  }, [closeBurst, settings]);

  useEffect(() => () => {
    if (burstTimer.current !== null) window.clearTimeout(burstTimer.current);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(cloneSettings(settings));
    applyWithoutHistory(previous);
    setRevision((value) => value + 1);
  }, [applyWithoutHistory, settings]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(cloneSettings(settings));
    applyWithoutHistory(next);
    setRevision((value) => value + 1);
  }, [applyWithoutHistory, settings]);

  const captureCompare = useCallback(() => {
    compareReference.current = cloneSettings(settings);
    setRevision((value) => value + 1);
  }, [settings]);

  const beginCompare = useCallback(() => {
    if (compareLive.current) return;
    compareLive.current = cloneSettings(settings);
    applyWithoutHistory(compareReference.current);
    setRevision((value) => value + 1);
  }, [applyWithoutHistory, settings]);

  const endCompare = useCallback(() => {
    const live = compareLive.current;
    if (!live) return;
    compareLive.current = null;
    applyWithoutHistory(live);
    setRevision((value) => value + 1);
  }, [applyWithoutHistory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (!command || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    const onBlur = () => endCompare();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [endCompare, redo, undo]);

  return {
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    comparing: compareLive.current !== null,
    undo,
    redo,
    captureCompare,
    beginCompare,
    endCompare,
  };
}

function storeBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // The studio remains usable when storage is unavailable.
  }
}

function loadBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

export function DirectorDock({ settings, assets, onSettings }: DirectorDockProps) {
  const slides = useMemo(() => getMovingSlides(assets), [assets]);
  const metrics = useMemo(() => getMasterMetrics(settings, slides.length), [settings, slides.length]);
  const chapters = useMemo(() => getMasterChapters(settings, slides.length), [settings, slides.length]);
  const preflight = useMemo(() => getDirectorPreflight(settings, assets), [assets, settings]);
  const history = useDirectionHistory(settings, onSettings);
  const [open, setOpen] = useState(() => loadBoolean("drift.directorDock.open", true));
  const [introDismissed, setIntroDismissed] = useState(() => loadBoolean("drift.directorDock.intro", false));
  const [timelineTime, setTimelineTime] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [guide, setGuide] = useState<GuideId>("none");
  const [status, setStatus] = useState("");
  const steps = useMemo(() => getJourneySteps(settings, assets, reviewed), [assets, reviewed, settings]);
  const demoOnly = assets.length > 0 && assets.every((asset) => asset.demo);
  const blockers = preflight.filter((item) => item.severity === "blocker").length;
  const warnings = preflight.filter((item) => item.severity === "warning").length;

  useEffect(() => {
    if (timelineTime <= settings.output.duration) return;
    setTimelineTime(settings.output.duration);
  }, [settings.output.duration, timelineTime]);

  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas");
    const frame = canvas?.parentElement;
    if (!frame) return;
    if (guide === "none") delete frame.dataset.driftGuide;
    else frame.dataset.driftGuide = guide;
    return () => {
      if (frame.dataset.driftGuide === guide) delete frame.dataset.driftGuide;
    };
  }, [guide]);

  useEffect(() => {
    const onCaptureResult = (event: Event) => {
      const detail = (event as CustomEvent<{ ok: boolean; message: string }>).detail;
      setStatus(detail?.message ?? "");
    };
    window.addEventListener("drift:capture-result", onCaptureResult);
    return () => window.removeEventListener("drift:capture-result", onCaptureResult);
  }, []);

  const previewAt = useCallback((time: number) => {
    const clamped = Math.min(settings.output.duration, Math.max(0, time));
    setTimelineTime(clamped);
    setReviewed(true);
    window.dispatchEvent(new CustomEvent("drift:master-preview", { detail: { time: clamped } }));
  }, [settings.output.duration]);

  const resumeLive = useCallback(() => {
    window.dispatchEvent(new CustomEvent("drift:master-resume"));
    setStatus("Live preview resumed.");
  }, []);

  const captureCurrentFrame = useCallback(() => {
    setStatus("Rendering this exact master frame…");
    window.dispatchEvent(new CustomEvent("drift:capture-master-still", {
      detail: { time: timelineTime, filename: `drift-frame-${timelineTime.toFixed(2)}s.png` },
    }));
  }, [timelineTime]);

  const applyPace = useCallback((recipeId: PacingRecipeId) => {
    onSettings(applyPacingRecipe(settings, slides.length, recipeId));
    setStatus("Pacing recipe applied. Scrub the master before export.");
  }, [onSettings, settings, slides.length]);

  const copyBrief = useCallback(async () => {
    const brief = buildMasterBrief(settings, assets);
    try {
      await navigator.clipboard.writeText(brief);
      setStatus("Master brief copied.");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = brief;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setStatus("Master brief copied.");
    }
  }, [assets, settings]);

  return (
    <details
      className="director-dock"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        storeBoolean("drift.directorDock.open", next);
      }}
    >
      <summary>
        <span>
          <strong>DIRECTOR’S DESK</strong>
          <small>{slides.length} slides · {metrics.duration.toFixed(1)} s · {metrics.slidesPerSecond.toFixed(2)} slides/s</small>
        </span>
        <span className="director-readiness" data-state={blockers > 0 ? "blocked" : warnings > 0 ? "caution" : "ready"}>
          {blockers > 0 ? `${blockers} blocked` : warnings > 0 ? `${warnings} checks` : "ready"}
        </span>
      </summary>

      <div className="director-dock-body">
        {!introDismissed && demoOnly ? (
          <section className="director-intro" aria-label="First-use guide">
            <span className="director-kicker">START HERE</span>
            <h3>Replace the studies. Direct one complete pass. Then export.</h3>
            <p>
              Import three or more deck slides, choose a film world, set a reading pace,
              and scrub the exact master before touching the deep controls.
            </p>
            <button
              type="button"
              onClick={() => {
                setIntroDismissed(true);
                storeBoolean("drift.directorDock.intro", true);
              }}
            >
              Use the demo first
            </button>
          </section>
        ) : null}

        <ol className="journey-steps" aria-label="Master journey">
          {steps.map((step, index) => (
            <li key={step.id} data-complete={step.complete}>
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </li>
          ))}
        </ol>

        <div className="director-grid">
          <section className="director-card pacing-card" aria-labelledby="pacing-title">
            <div className="director-card-heading">
              <div>
                <span className="director-kicker">PACE</span>
                <h3 id="pacing-title">Choose the reading breath.</h3>
              </div>
              <span>{Number.isFinite(metrics.secondsPerSlide) ? `${metrics.secondsPerSlide.toFixed(2)} s/slide` : "still"}</span>
            </div>
            <div className="pacing-recipes">
              {PACING_RECIPES.map((recipe) => (
                <button type="button" key={recipe.id} onClick={() => applyPace(recipe.id)}>
                  <strong>{recipe.name}</strong>
                  <small>{recipe.eyebrow}</small>
                  <span>{recipe.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="director-card timeline-card" aria-labelledby="timeline-title">
            <div className="director-card-heading">
              <div>
                <span className="director-kicker">EXACT MASTER</span>
                <h3 id="timeline-title">Scrub what will actually export.</h3>
              </div>
              <output>{timelineTime.toFixed(2)} s</output>
            </div>
            <div className="timeline-track">
              <input
                aria-label="Master timeline"
                type="range"
                min={0}
                max={settings.output.duration}
                step={1 / settings.output.fps}
                value={timelineTime}
                onChange={(event) => previewAt(Number(event.currentTarget.value))}
              />
              <div className="timeline-chapters" aria-hidden="true">
                {chapters.map((chapter) => (
                  <i
                    key={chapter.key}
                    title={chapter.label}
                    style={{ left: `${chapter.progress * 100}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="director-actions">
              <button type="button" onClick={resumeLive}>Return live</button>
              <button type="button" onClick={captureCurrentFrame}>Save this frame</button>
            </div>
          </section>

          <section className="director-card compare-card" aria-labelledby="compare-title">
            <div className="director-card-heading">
              <div>
                <span className="director-kicker">REVERSIBLE</span>
                <h3 id="compare-title">Explore without losing the good version.</h3>
              </div>
              <span>⌘Z / ⇧⌘Z</span>
            </div>
            <div className="director-actions">
              <button type="button" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
              <button type="button" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
              <button type="button" onClick={history.captureCompare}>Set A</button>
              <button
                type="button"
                className="compare-hold"
                data-active={history.comparing}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  history.beginCompare();
                }}
                onPointerUp={history.endCompare}
                onPointerCancel={history.endCompare}
                onPointerLeave={history.endCompare}
              >
                Hold for A
              </button>
            </div>
            <p>“Set A” stores a reference. Hold to see it; release to return to the live direction.</p>
          </section>

          <section className="director-card delivery-card" aria-labelledby="delivery-title">
            <div className="director-card-heading">
              <div>
                <span className="director-kicker">DELIVERY</span>
                <h3 id="delivery-title">Check the frame before the platform crops it.</h3>
              </div>
            </div>
            <label className="guide-picker">
              <span>Editing guide</span>
              <select
                aria-label="Platform guide"
                value={guide}
                onChange={(event) => setGuide(event.currentTarget.value as GuideId)}
              >
                <option value="none">Clean frame</option>
                <option value="centre">Centre-safe guide</option>
                <option value="social">Social UI caution guide</option>
              </select>
            </label>
            <p className="guide-note">
              Guides are conservative editing aids, not promises about any platform’s current interface.
            </p>
            <button type="button" onClick={copyBrief}>Copy master brief</button>
          </section>
        </div>

        <section className="director-preflight" aria-labelledby="preflight-title">
          <div className="director-card-heading">
            <div>
              <span className="director-kicker">PREFLIGHT</span>
              <h3 id="preflight-title">Truth before render.</h3>
            </div>
            <span>{metrics.frames} frames</span>
          </div>
          <ul>
            {preflight.map((item) => (
              <li key={item.id} data-severity={item.severity}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="director-status" role="status" aria-live="polite">{status}</p>
      </div>
    </details>
  );
}
