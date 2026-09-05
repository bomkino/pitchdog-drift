import type { ExportProgress } from "../model";
import type { ExportCapabilityReport } from "../lib/exportStudio";
import type { ExportIntent, GuidedExportCompletion, GuidedExportRunRequest } from "../core/export/guidedExport";
import { QuickExport } from "./QuickExport";

export interface GuidedExportWizardProps {
  readonly sourceIntent: ExportIntent;
  readonly sourceIdentity?: string;
  readonly runtimeCapabilities: ExportCapabilityReport | null;
  readonly exportSurfaceSupported: boolean;
  readonly applicationBlockers: readonly string[];
  readonly progress: ExportProgress | null;
  readonly busy: boolean;
  readonly onRun: (request: GuidedExportRunRequest) => Promise<GuidedExportCompletion | null>;
  readonly onQuickStill: (background?: "opaque" | "transparent") => void;
}

/** Kept as an import-compatible facade; there is no second wizard/draft. */
export function GuidedExportWizard(props: GuidedExportWizardProps) {
  return <QuickExport sourceIntent={props.sourceIntent} sourceIdentity={props.sourceIdentity}
    runtime={props.runtimeCapabilities} available={props.exportSurfaceSupported}
    busy={props.busy} blockers={props.applicationBlockers} onRun={props.onRun} onStill={props.onQuickStill} />;
}
