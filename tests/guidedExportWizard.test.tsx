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
  /**
   * Promise: Export opens as a stable six-step outcome journey, not three unexplained sink buttons.
   * Failure: the initial application surface omits step identity, purpose choices, or background consequence.
   * Public seam: rendered GuidedExportWizard.
   * Cheapest loop: static semantic render; visual acceptance remains human-gated.
   */
  it("renders the first stable step with outcome and canvas choices", () => {
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

    expect(markup).toContain('aria-label="Guided Export"');
    expect(markup).toContain("Step 1 of 6");
    expect(markup).toContain("What are you making?");
    expect(markup).toContain("Social / delivery");
    expect(markup).toContain("Editing master");
    expect(markup).toContain("Transparent overlay");
    expect(markup).toContain("Frame sequence");
    expect(markup).toContain("Opaque background");
    expect(markup).toContain("Transparent background");
    expect((markup.match(/role="radio"/gu) ?? [])).toHaveLength(5);
    expect((markup.match(/<li/g) ?? [])).toHaveLength(6);
  });
});
