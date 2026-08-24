import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const evaluateV2Source = readFileSync(
  new URL("../src/core/timeline/evaluateV2Frame.ts", import.meta.url),
  "utf8",
);
const carouselSource = readFileSync(
  new URL("../src/engine/CinematicCarousel.ts", import.meta.url),
  "utf8",
);
const sequenceCompilerSource = readFileSync(
  new URL("../src/core/timeline/sequenceCompiler.ts", import.meta.url),
  "utf8",
);
const deliveryReceiptSource = readFileSync(
  new URL("../src/core/timeline/deliveryReceipt.ts", import.meta.url),
  "utf8",
);

describe("V2 evaluator authority contract", () => {
  it("never fabricates a V3 project inside the Project V4 render path", () => {
    expect(evaluateV2Source).not.toContain("DriftProjectV3");
    expect(evaluateV2Source).not.toContain("formatVersion: 3");
    expect(evaluateV2Source).not.toContain("creativeProject");
    expect(evaluateV2Source).toContain("const project = projectInput;");
  });

  it("passes the caller-owned moving source order into spatial evaluation", () => {
    expect(evaluateV2Source).toContain(
      "evaluateSpatialFrame(project, sourceCount, base, sourceOrder)",
    );
  });

  it("keeps legacy creative state and implicit project mutation out of the V2 renderer", () => {
    expect(carouselSource).not.toContain("StudioSettings");
    expect(carouselSource).not.toContain("studioSettingsFromDriftProject");
    expect(carouselSource).not.toContain("this.settings");
    expect(carouselSource).not.toContain("setProjectState");
    expect(carouselSource).toContain('authority.kind === "project-v4"');
    expect(carouselSource).toContain("drawGraphStateFromProject(project)");
    expect(carouselSource).toContain("deriveSlideGeometry(project, sourceCount)");
  });

  it("keeps sampled velocity diagnostics out of compilation and frame evaluation", () => {
    expect(sequenceCompilerSource).not.toContain("measureSequenceVelocityEnvelope");
    expect(sequenceCompilerSource).not.toContain("VELOCITY_SAMPLES_PER_PASS");
    expect(evaluateV2Source).not.toContain("sequenceDiagnostics");
    expect(deliveryReceiptSource).toContain("measureSequenceVelocityEnvelope(sequence)");
  });
});
