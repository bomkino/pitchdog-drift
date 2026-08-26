import { useEffect, useMemo, useReducer, useState } from "react";
import type { ExportProgress } from "../model";
import type { ExportCapabilityReport } from "../lib/exportStudio";
import {
  createGuidedExportDraft,
  deriveExportFormatCapabilities,
  EXPORT_FORMATS,
  preflightGuidedExport,
  reduceGuidedExport,
  type ExportIntent,
  type ExportPurpose,
  type GuidedExportCompletion,
  type GuidedExportRunRequest,
} from "../core/export/guidedExport";

export interface GuidedExportWizardProps {
  readonly sourceIntent: ExportIntent;
  readonly runtimeCapabilities: ExportCapabilityReport | null;
  readonly exportSurfaceSupported: boolean;
  readonly applicationBlockers: readonly string[];
  readonly progress: ExportProgress | null;
  readonly busy: boolean;
  readonly onRun: (request: GuidedExportRunRequest) => Promise<GuidedExportCompletion | null>;
  readonly onQuickStill: () => void;
}

const PURPOSES: readonly Readonly<{ id: ExportPurpose; label: string; detail: string }>[] = Object.freeze([
  { id: "social", label: "Social / delivery", detail: "A compact, ordinary opaque master." },
  { id: "editing-master", label: "Editing master", detail: "A reliable file for the edit; native alpha arrives separately." },
  { id: "transparent-overlay", label: "Transparent overlay", detail: "Alpha-preserving frames for compositing." },
  { id: "frame-sequence", label: "Frame sequence", detail: "Exact numbered frames with no embedded audio." },
  { id: "custom", label: "Custom", detail: "Choose the background and format directly." },
]);

const STEP_NUMBER = Object.freeze({
  "purpose-background": 1,
  format: 2,
  "film-audio": 3,
  "destination-preflight": 4,
  "render-verify": 5,
  complete: 6,
} as const);

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(3)} s`;
}

function formatEta(progress: ExportProgress | null): string {
  if (!progress) return "Waiting for a scoped destination";
  if (progress.etaSeconds === null) return "ETA stabilizes after enough real samples";
  return `About ${Math.max(1, Math.ceil(progress.etaSeconds))} s remaining`;
}

export function GuidedExportWizard({
  sourceIntent,
  runtimeCapabilities,
  exportSurfaceSupported,
  applicationBlockers,
  progress,
  busy,
  onRun,
  onQuickStill,
}: GuidedExportWizardProps) {
  const [draft, dispatch] = useReducer(reduceGuidedExport, sourceIntent, createGuidedExportDraft);
  const [completion, setCompletion] = useState<GuidedExportCompletion | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    dispatch({ type: "sync-source", intent: sourceIntent });
  }, [sourceIntent]);

  const capabilities = useMemo(() => deriveExportFormatCapabilities({
    runtime: runtimeCapabilities,
    pngDestination: draft.pngDestination,
    exportSurfaceSupported,
    intent: draft.intent,
  }), [draft.intent, draft.pngDestination, exportSurfaceSupported, runtimeCapabilities]);
  const preflight = useMemo(
    () => preflightGuidedExport(draft, capabilities),
    [capabilities, draft],
  );
  const combinationBlockers = preflight.blockers.filter(({ id }) => id !== "destination-required");
  const canRequestDestination = combinationBlockers.length === 0 && applicationBlockers.length === 0;
  const selectedFormat = EXPORT_FORMATS.find(({ id }) => id === draft.intent.preferredFormat)!;
  const selectedCapability = capabilities.find(({ id }) => id === selectedFormat.id)!;
  const audioSources = [
    draft.intent.audio.presenter ? "presenter" : null,
    draft.intent.audio.soundDesign ? "tactile sound" : null,
  ].filter(Boolean).join(" + ") || "none";

  const goNext = () => dispatch({ type: "next" });
  const goBack = () => dispatch({ type: "back" });
  const start = async () => {
    const prepared = reduceGuidedExport(draft, { type: "mark-destination-selected", selected: true });
    const finalPreflight = preflightGuidedExport(prepared, capabilities);
    if (!finalPreflight.canStart || applicationBlockers.length > 0) return;

    setCompletion(null);
    setStarting(true);
    dispatch({ type: "mark-destination-selected", selected: true });
    dispatch({ type: "begin-render" });
    try {
      const result = await onRun({
        intent: prepared.intent,
        pngDestination: prepared.pngDestination,
        audioConsequenceAcknowledged: prepared.audioConsequenceAcknowledged,
      });
      if (result) {
        setCompletion(result);
        dispatch({ type: "complete" });
      } else {
        dispatch({ type: "back" });
        dispatch({ type: "mark-destination-selected", selected: false });
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="guided-export" aria-label="Guided Export" data-step={draft.step}>
      <header className="guided-export-header">
        <div>
          <span>GUIDED EXPORT</span>
          <strong>Step {STEP_NUMBER[draft.step]} of 6</strong>
        </div>
        <ol aria-label="Export progress">
          {Object.values(STEP_NUMBER).map((number) => (
            <li key={number} aria-current={number === STEP_NUMBER[draft.step] ? "step" : undefined}>{number}</li>
          ))}
        </ol>
      </header>

      {draft.step === "purpose-background" ? (
        <div className="guided-export-step">
          <div className="guided-export-copy">
            <span>1 · PURPOSE + BACKGROUND</span>
            <h3>What are you making?</h3>
            <p>The outcome sets a safe starting point. You can still edit every choice.</p>
          </div>
          <div className="guided-purpose-grid" role="radiogroup" aria-label="Export purpose">
            {PURPOSES.map((purpose) => (
              <button
                type="button"
                role="radio"
                aria-checked={draft.intent.purpose === purpose.id}
                key={purpose.id}
                onClick={() => dispatch({ type: "choose-purpose", purpose: purpose.id })}
              >
                <strong>{purpose.label}</strong>
                <small>{purpose.detail}</small>
              </button>
            ))}
          </div>
          <fieldset className="guided-background-choice">
            <legend>Canvas consequence</legend>
            {(["opaque", "transparent"] as const).map((background) => (
              <label key={background}>
                <input
                  type="radio"
                  name="guided-export-background"
                  checked={draft.intent.background === background}
                  onChange={() => dispatch({ type: "choose-background", background })}
                />
                <span>{background === "opaque" ? "Opaque background" : "Transparent background"}</span>
              </label>
            ))}
          </fieldset>
          <div className="guided-export-actions"><button type="button" className="primary-action" onClick={goNext}>Choose format</button></div>
        </div>
      ) : null}

      {draft.step === "format" ? (
        <div className="guided-export-step">
          <div className="guided-export-copy">
            <span>2 · FORMAT</span>
            <h3>Pick the artifact.</h3>
            <p>Cards report this exact runtime. Unavailable formats stay visible, with the real gate.</p>
          </div>
          <div className="guided-format-grid" role="radiogroup" aria-label="Export format">
            {EXPORT_FORMATS.map((format) => {
              const capability = capabilities.find(({ id }) => id === format.id)!;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.intent.preferredFormat === format.id}
                  disabled={capability.state === "unavailable"}
                  data-state={capability.state}
                  key={format.id}
                  onClick={() => dispatch({ type: "choose-format", format: format.id })}
                >
                  <span>{format.id === "h264-mp4" ? "DELIVERY" : format.id === "png-frames" ? "UNIVERSAL ALPHA" : "NATIVE MAC"}</span>
                  <strong>{format.label}</strong>
                  <small>{format.summary} · {format.embedsAudio ? "audio" : "no embedded audio"}</small>
                  {capability.reason ? <em>{capability.reason.message} {capability.reason.recovery}</em> : <em>Available in this runtime.</em>}
                </button>
              );
            })}
          </div>
          {draft.intent.preferredFormat === "png-frames" ? (
            <fieldset className="guided-background-choice">
              <legend>Frame destination</legend>
              {(["directory", "zip"] as const).map((destination) => (
                <label key={destination}>
                  <input
                    type="radio"
                    name="guided-export-png-destination"
                    checked={draft.pngDestination === destination}
                    onChange={() => dispatch({ type: "choose-png-destination", destination })}
                  />
                  <span>{destination === "directory" ? "Numbered directory" : "Bounded ZIP"}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="guided-export-actions"><button type="button" onClick={goBack}>Back</button><button type="button" className="primary-action" onClick={goNext}>Review film + audio</button></div>
        </div>
      ) : null}

      {draft.step === "film-audio" ? (
        <div className="guided-export-step">
          <div className="guided-export-copy">
            <span>3 · FILM + AUDIO</span>
            <h3>Read the consequence.</h3>
            <p>This review comes from the same finite frame plan the renderer will use.</p>
          </div>
          <dl className="guided-export-facts">
            <div><dt>Film</dt><dd>{draft.intent.dimensions.width} × {draft.intent.dimensions.height} · {draft.intent.fps.numerator} fps</dd></div>
            <div><dt>Timeline</dt><dd>{draft.intent.finiteTimeline.frameCount.toLocaleString()} frames · {formatDuration(draft.intent.finiteTimeline.durationSeconds)}</dd></div>
            <div><dt>Background</dt><dd>{draft.intent.background}</dd></div>
            <div><dt>Requested sound</dt><dd>{audioSources}</dd></div>
            <div><dt>Artifact sound</dt><dd>{selectedFormat.embedsAudio ? "Embedded when source preflight passes" : "None — image sequences cannot embed sound"}</dd></div>
          </dl>
          {draft.intent.preferredFormat === "png-frames" && draft.intent.audio.enabled ? (
            <label className="guided-export-acknowledgement">
              <input
                type="checkbox"
                checked={draft.audioConsequenceAcknowledged}
                onChange={(event) => dispatch({ type: "acknowledge-audio-consequence", acknowledged: event.currentTarget.checked })}
              />
              <span>I understand this PNG sequence contains no embedded audio. Drift will not pretend otherwise.</span>
            </label>
          ) : null}
          {combinationBlockers.map((issue) => <p className="guided-export-blocker" role="alert" key={issue.id}>{issue.message}</p>)}
          <div className="guided-export-actions"><button type="button" onClick={goBack}>Back</button><button type="button" className="primary-action" onClick={goNext} disabled={combinationBlockers.length > 0}>Preflight destination</button></div>
        </div>
      ) : null}

      {draft.step === "destination-preflight" ? (
        <div className="guided-export-step">
          <div className="guided-export-copy">
            <span>4 · DESTINATION + PREFLIGHT</span>
            <h3>Nothing renders before this holds.</h3>
            <p>The system picker grants one file or directory. Drift stages and verifies before publication.</p>
          </div>
          <div className="guided-preflight" data-ready={canRequestDestination} role="status">
            <div><span>FORMAT</span><strong>{selectedFormat.label}</strong><small>{selectedCapability.state}</small></div>
            <div><span>DESTINATION</span><strong>{draft.intent.preferredFormat === "png-frames" ? draft.pngDestination : "file"}</strong><small>requested on start</small></div>
            <div><span>RUNTIME</span><strong>{canRequestDestination ? "READY" : "BLOCKED"}</strong><small>{canRequestDestination ? "Exact capability holds" : "Resolve every blocker first"}</small></div>
          </div>
          {[...combinationBlockers.map(({ message }) => message), ...applicationBlockers].map((message) => (
            <p className="guided-export-blocker" role="alert" key={message}>{message}</p>
          ))}
          <div className="guided-export-actions"><button type="button" onClick={goBack}>Back</button><button type="button" className="primary-action" disabled={!canRequestDestination || busy || starting} onClick={() => void start()}>Choose destination + render</button></div>
        </div>
      ) : null}

      {draft.step === "render-verify" ? (
        <div className="guided-export-step guided-export-running">
          <div className="guided-export-copy">
            <span>5 · RENDER + VERIFY</span>
            <h3>{progress?.message ?? "Waiting for destination authority"}</h3>
            <p>{formatEta(progress)}</p>
          </div>
          {progress?.determinate ? <progress value={progress.ratio} max={1} /> : <div className="guided-export-pulse" aria-hidden="true"><i /></div>}
          <dl className="guided-export-facts compact">
            <div><dt>Phase</dt><dd>{progress?.phase ?? "preparing"}</dd></div>
            <div><dt>Work</dt><dd>{progress ? `${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()} ${progress.unit}` : "Not started"}</dd></div>
            <div><dt>Elapsed</dt><dd>{progress ? `${progress.elapsedSeconds.toFixed(1)} s` : "0.0 s"}</dd></div>
          </dl>
        </div>
      ) : null}

      {draft.step === "complete" && completion ? (
        <div className="guided-export-step">
          <div className="guided-export-copy">
            <span>6 · COMPLETE</span>
            <h3>Artifact verified.</h3>
            <p>{completion.artifact}</p>
          </div>
          <dl className="guided-export-facts">
            <div><dt>Receipt</dt><dd>{completion.snapshotId}</dd></div>
            <div><dt>Artifact</dt><dd>{completion.width} × {completion.height} · {completion.fps} fps</dd></div>
            <div><dt>Timeline</dt><dd>{completion.frameCount.toLocaleString()} frames · {formatDuration(completion.duration)}</dd></div>
            <div><dt>Readback</dt><dd>passed before publication</dd></div>
            <div><dt>Publication</dt><dd>{completion.publication.replaceAll("-", " ")}</dd></div>
          </dl>
          <div className="guided-export-actions"><button type="button" onClick={() => { setCompletion(null); dispatch({ type: "edit" }); }}>Edit choices</button><button type="button" onClick={onQuickStill}>Save one PNG still</button></div>
        </div>
      ) : null}
    </section>
  );
}
