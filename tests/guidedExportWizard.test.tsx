import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuidedExportWizard } from "../src/components/GuidedExportWizard";
import { createExportIntent } from "../src/core/export/guidedExport";
import type { ExportCapabilityReport } from "../src/lib/exportStudio";

const RUNTIME: ExportCapabilityReport = {
  mp4: {
    supported: true,
    avc: true,
    aac: true,
    presenterAudioFpsSupported: true,
    maximumPresenterAudioFps: 30,
    nativeAacMaximumDurationSeconds: null,
    reasons: [],
  },
  png: { still: true, sequenceZip: true, sequenceDirectory: true },
  presenter: { videoDecoderApi: true, audioDecoderApi: true },
  futureStreamTarget: true,
};

describe("Guided Export wizard", () => {
  it("uses one direct export form with optional settings and no duplicate wizard", () => {
    const markup = renderToStaticMarkup(
      <GuidedExportWizard
        sourceIntent={createExportIntent({
          background: "opaque",
          settings: { width: 1080, height: 1920, fps: 30, duration: 8 },
          presenterAudio: true,
          soundDesignAudio: true,
        })}
        runtimeCapabilities={RUNTIME}
        exportSurfaceSupported
        applicationBlockers={[]}
        progress={null}
        busy={false}
        onRun={async () => null}
        onQuickStill={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Export"');
    expect(markup).toContain("Export PNG still");
    expect(markup).toContain("More export options");
    expect(markup).toContain("Use project background");
    expect(markup).not.toContain("Step 1 of 6");
    expect(markup).not.toContain("What are you making?");
    expect((markup.match(/aria-label="Output format"/gu) ?? [])).toHaveLength(1);
  });
});
