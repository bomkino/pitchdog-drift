import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createRoundedSlideShellGeometry,
  sampleRoundedRectContour,
  SHELL_SEGMENTS_PER_CORNER,
} from "../src/engine/slideShell";

function finiteAttribute(attribute: THREE.BufferAttribute): boolean {
  return Array.from(attribute.array).every(Number.isFinite);
}

const DIMENSIONS: ReadonlyArray<readonly [number, number]> = [
  [1600, 900],
  [900, 1600],
  [1080, 1080],
  [256, 8192],
];

describe("continuous-corner slide shell", () => {
  it("builds finite indexed geometry with a bounded vertex budget", () => {
    for (const [width, height] of DIMENSIONS) {
      for (const smoothing of [0, 0.6, 1]) {
        const geometry = createRoundedSlideShellGeometry(
          width,
          height,
          Math.min(width, height) * 0.18,
          smoothing,
        );
        const position = geometry.getAttribute("position") as THREE.BufferAttribute;
        const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
        expect(geometry.index).not.toBeNull();
        expect(position.count).toBeLessThan(200);
        expect(position.count).toBeGreaterThan(20);
        expect(finiteAttribute(position)).toBe(true);
        expect(finiteAttribute(normal)).toBe(true);
        expect(geometry.boundingBox).not.toBeNull();
        expect(geometry.boundingSphere).not.toBeNull();
        expect(geometry.boundingBox!.min.x).toBeCloseTo(-0.5, 6);
        expect(geometry.boundingBox!.max.x).toBeCloseTo(0.5, 6);
        expect(geometry.boundingBox!.min.y).toBeCloseTo(-0.5, 6);
        expect(geometry.boundingBox!.max.y).toBeCloseTo(0.5, 6);
        expect(geometry.boundingBox!.min.z).toBeCloseTo(-1, 6);
        expect(geometry.boundingBox!.max.z).toBeCloseTo(0, 6);
        geometry.dispose();
      }
    }
  });

  it("matches a pixel radius after non-uniform slide scaling", () => {
    const width = 1600;
    const height = 900;
    const radius = 90;
    const contour = sampleRoundedRectContour(width, height, radius, 0.6);
    const top = contour.reduce((best, point) => point.y > best.y ? point : best);
    const right = contour.reduce((best, point) => point.x > best.x ? point : best);
    expect(top.y * height).toBeCloseTo(height / 2, 5);
    expect(right.x * width).toBeCloseTo(width / 2, 5);
    expect((0.5 - top.x) * width).toBeGreaterThanOrEqual(radius - 0.01);
    expect((0.5 - right.y) * height).toBeGreaterThanOrEqual(radius - 0.01);
  });

  it("gives smoothing a real contour effect rather than a label-only preset", () => {
    const circular = sampleRoundedRectContour(1600, 900, 120, 0);
    const continuous = sampleRoundedRectContour(1600, 900, 120, 1);
    const circularSignature = circular
      .map((point) => `${point.x.toFixed(6)}:${point.y.toFixed(6)}`)
      .join("|");
    const continuousSignature = continuous
      .map((point) => `${point.x.toFixed(6)}:${point.y.toFixed(6)}`)
      .join("|");
    expect(continuousSignature).not.toBe(circularSignature);
    expect(circular.length).toBe(4 * (SHELL_SEGMENTS_PER_CORNER + 1));
    expect(continuous.length).toBe(circular.length);
  });

  it("keeps zero-radius cards square and finite", () => {
    const contour = sampleRoundedRectContour(1600, 900, 0, 0);
    expect(contour).toEqual([
      { x: 0.5, y: 0.5 },
      { x: -0.5, y: 0.5 },
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
    ]);
    const geometry = createRoundedSlideShellGeometry(1600, 900, 0, 0);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
    expect(position.count).toBe(20);
    expect(finiteAttribute(position)).toBe(true);
    expect(finiteAttribute(normal)).toBe(true);
    geometry.dispose();
  });
});
