import * as THREE from "three";

export const SHELL_SEGMENTS_PER_CORNER = 10;

interface ContourPoint {
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function superellipseComponent(value: number, exponent: number): number {
  if (Math.abs(value) < 0.000_001) return 0;
  return Math.sign(value) * Math.pow(Math.abs(value), 2 / exponent);
}

function pushUnique(points: ContourPoint[], point: ContourPoint): void {
  const previous = points.at(-1);
  if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 0.000_001) return;
  points.push(point);
}

/**
 * Samples the same continuous-corner family used by the slide mask. Coordinates
 * stay in the unit plane because the shell inherits the front plane's scale.
 */
export function sampleRoundedRectContour(
  width: number,
  height: number,
  radiusPx: number,
  smoothing: number,
  segmentsPerCorner = SHELL_SEGMENTS_PER_CORNER,
): readonly ContourPoint[] {
  const safeWidth = Math.max(1, Math.abs(Number.isFinite(width) ? width : 1));
  const safeHeight = Math.max(1, Math.abs(Number.isFinite(height) ? height : 1));
  const radius = clamp(
    Number.isFinite(radiusPx) ? radiusPx : 0,
    0,
    Math.min(safeWidth, safeHeight) / 2,
  );

  if (radius < 0.5) {
    return [
      { x: 0.5, y: 0.5 },
      { x: -0.5, y: 0.5 },
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
    ];
  }

  const exponent = 2 + clamp(smoothing, 0, 1) * 3.5;
  const radiusX = radius / safeWidth;
  const radiusY = radius / safeHeight;
  const centerX = 0.5 - radiusX;
  const centerY = 0.5 - radiusY;
  const segments = Math.round(clamp(segmentsPerCorner, 3, 24));
  const corners = [
    { centerX, centerY, start: 0 },
    { centerX: -centerX, centerY, start: Math.PI / 2 },
    { centerX: -centerX, centerY: -centerY, start: Math.PI },
    { centerX, centerY: -centerY, start: Math.PI * 1.5 },
  ];
  const points: ContourPoint[] = [];

  for (const corner of corners) {
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = corner.start + (Math.PI / 2) * (segment / segments);
      pushUnique(points, {
        x: corner.centerX + radiusX * superellipseComponent(Math.cos(angle), exponent),
        y: corner.centerY + radiusY * superellipseComponent(Math.sin(angle), exponent),
      });
    }
  }

  const first = points[0];
  const last = points.at(-1);
  if (first && last && Math.hypot(first.x - last.x, first.y - last.y) < 0.000_001) {
    points.pop();
  }
  return points;
}

function finalizeGeometry(
  positions: number[],
  indices: number[],
  name: string,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSquareShellGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const corners: ContourPoint[] = [
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 },
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
  ];

  for (let edge = 0; edge < corners.length; edge += 1) {
    const next = (edge + 1) % corners.length;
    const a = corners[edge]!;
    const b = corners[next]!;
    const offset = positions.length / 3;
    positions.push(
      a.x, a.y, 0,
      a.x, a.y, -1,
      b.x, b.y, 0,
      b.x, b.y, -1,
    );
    indices.push(offset, offset + 1, offset + 2, offset + 2, offset + 1, offset + 3);
  }

  const backOffset = positions.length / 3;
  for (const point of corners) positions.push(point.x, point.y, -1);
  const center = positions.length / 3;
  positions.push(0, 0, -1);
  for (let edge = 0; edge < corners.length; edge += 1) {
    const next = (edge + 1) % corners.length;
    indices.push(center, backOffset + next, backOffset + edge);
  }

  return finalizeGeometry(positions, indices, "SquareSlideShell");
}

/**
 * Builds a sidewall and back plate only. The shader-deformed image plane stays
 * the front face, so slide content remains crisp while banking reveals depth.
 */
export function createRoundedSlideShellGeometry(
  width: number,
  height: number,
  radiusPx: number,
  smoothing: number,
  segmentsPerCorner = SHELL_SEGMENTS_PER_CORNER,
): THREE.BufferGeometry {
  const contour = sampleRoundedRectContour(width, height, radiusPx, smoothing, segmentsPerCorner);
  if (contour.length === 4 && Math.max(0, radiusPx) < 0.5) return createSquareShellGeometry();

  const positions: number[] = [];
  const indices: number[] = [];
  const count = contour.length;

  // Shared side rings create smooth normals around the continuous corner.
  for (const point of contour) positions.push(point.x, point.y, 0);
  for (const point of contour) positions.push(point.x, point.y, -1);

  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const front = index;
    const back = count + index;
    const nextFront = next;
    const nextBack = count + next;
    indices.push(front, back, nextFront, nextFront, back, nextBack);
  }

  // Duplicate the rear ring so the back plate stays flat instead of averaging
  // its normal into the sidewall.
  const backFaceOffset = positions.length / 3;
  for (const point of contour) positions.push(point.x, point.y, -1);
  const backCenter = positions.length / 3;
  positions.push(0, 0, -1);
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(backCenter, backFaceOffset + next, backFaceOffset + index);
  }

  return finalizeGeometry(positions, indices, "RoundedSlideShell");
}
