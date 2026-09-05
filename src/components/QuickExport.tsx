import { useEffect, useMemo, useRef, useState } from "react";
import {
  createGuidedExportDraft, deriveExportFormatCapabilities, preflightGuidedExport,
  type ExportIntent, type GuidedExportRunRequest, type GuidedExportCompletion,
} from "../core/export/guidedExport";
import type { ExportCapabilityReport } from "../lib/exportStudio";

type Format = "h264-mp4" | "png-frames";
type Background = "opaque" | "transparent";

/** One draft and one completion state for every visible export control. */
export function QuickExport({ sourceIntent, sourceIdentity, runtime, available, busy, blockers, onRun, onStill }: {
  sourceIntent: ExportIntent;
  sourceIdentity?: string;
  runtime: ExportCapabilityReport | null;
  available: boolean;
  busy: boolean;
  blockers: readonly string[];
  onRun: (request: GuidedExportRunRequest) => Promise<GuidedExportCompletion | null>;
  onStill: (background?: Background) => void;
}) {
  const [choice, setChoice] = useState<{ background: Background; format: Format } | null>(null);
  const [backgroundChoice, setBackgroundChoice] = useState<"project" | Background>("project");
  const [destinationChoice, setDestinationChoice] = useState<"directory" | "zip" | null>(null);
  const [silentAccepted, setSilentAccepted] = useState(false);
  const [running, setRunning] = useState(false);
  const [completion, setCompletion] = useState<GuidedExportCompletion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runGeneration = useRef(0);
  const alive = useRef(true);
  const background = backgroundChoice === "project" ? sourceIntent.background : backgroundChoice;
  const format = choice?.background === background ? choice.format : background === "transparent" ? "png-frames" : "h264-mp4";
  const directory = runtime?.png.sequenceDirectory === true;
  const destination = directory ? destinationChoice ?? "directory" : "zip";
  const context = `${sourceIdentity ?? ""}:${JSON.stringify(sourceIntent)}:${background}:${format}:${destination}`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; runGeneration.current++; }; }, []);
  useEffect(() => {
    runGeneration.current++;
    setCompletion(null);
    setError(null);
    setSilentAccepted(false);
  }, [context]);
  const draft = useMemo(() => ({
    ...createGuidedExportDraft({
      ...sourceIntent, background, preferredFormat: format,
      destinationClass: format === "png-frames" ? "directory" as const : "file" as const,
    }),
    pngDestination: destination,
    audioConsequenceAcknowledged: silentAccepted,
    destinationSelected: true,
  }), [sourceIntent, background, format, destination, silentAccepted]);
  const capabilities = deriveExportFormatCapabilities({ runtime, pngDestination: destination, exportSurfaceSupported: available, intent: draft.intent });
  const preflight = preflightGuidedExport(draft, capabilities);
  const failures = [...new Set([...blockers, ...preflight.blockers.map((issue) => issue.message)])];
  const run = async () => {
    if (running || busy || failures.length) return;
    const generation = ++runGeneration.current;
    setRunning(true); setCompletion(null); setError(null);
    try {
      const result = await onRun({ intent: draft.intent, pngDestination: destination, audioConsequenceAcknowledged: silentAccepted });
      if (alive.current && generation === runGeneration.current) setCompletion(result);
    } catch (cause) {
      if (alive.current && generation === runGeneration.current) setError(cause instanceof Error ? cause.message : "Export failed. Your project is unchanged.");
    } finally { if (alive.current) setRunning(false); }
  };
  return <section className="quick-export" aria-label="Export">
    <label>Format
      <select aria-label="Output format" value={format} disabled={busy || running}
        onChange={(event) => setChoice({ background, format: event.target.value as Format })}>
        <option value="h264-mp4">MP4 · H.264</option>
        <option value="png-frames">PNG sequence</option>
      </select>
    </label>
    <p className="quick-export-spec">{sourceIntent.dimensions.width} × {sourceIntent.dimensions.height} · {sourceIntent.fps.numerator} fps · {sourceIntent.finiteTimeline.frameCount} frames</p>
    <details className="advanced-export-options">
      <summary>More export options</summary>
      <label>Background
        <select aria-label="Export background" value={backgroundChoice} disabled={busy || running} onChange={(event) => setBackgroundChoice(event.target.value as typeof backgroundChoice)}>
          <option value="project">Use project background</option>
          <option value="opaque">Opaque</option>
          <option value="transparent">Transparent</option>
        </select>
      </label>
      {format === "png-frames" && directory ? <label>Save frames to
        <select aria-label="Frame destination" value={destination} disabled={busy || running} onChange={(event) => setDestinationChoice(event.target.value as "directory" | "zip")}>
          <option value="directory">Folder</option><option value="zip">ZIP archive</option>
        </select>
      </label> : null}
      <p>Export settings do not change your project. Original files stay untouched.</p>
    </details>
    {format === "png-frames" && sourceIntent.audio.enabled ? <label className="quick-export-audio">
      <input type="checkbox" checked={silentAccepted} onChange={(event) => setSilentAccepted(event.target.checked)} disabled={busy || running} />
      Export silent frames; audio remains in my project.
    </label> : null}
    {failures.length ? <p className="quick-export-problem" role="status">{failures.join(" ")}</p> : null}
    <div className="quick-export-actions">
      <button type="button" disabled={busy || running || !available} onClick={() => onStill(background)}>Export PNG still</button>
      <button type="button" className="primary-action" disabled={busy || running || failures.length > 0} onClick={() => void run()}>{running ? "Exporting…" : "Export…"}</button>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {completion ? <p role="status">{completion.artifact} · {completion.frameCount} verified frames. Use File → Reveal Last Saved File in Finder.</p> : null}
  </section>;
}
