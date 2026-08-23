export const gridBackgroundBranch = /* glsl */ `
    } else if (uMode < 6.5) {
      vec3 gridBase = mix(uColorA, uColorB, smoothstep(-0.72, 0.72, p.y) * 0.2);

      // grid-0 · Modular field
      if (atlasVariant < 0.5) {
        float fine = max(gridLine(q.x + closedDrift.x * 0.02, 5.0, 0.009), gridLine(q.y + closedDrift.y * 0.02, 5.0, 0.009));
        float major = max(gridLine(q.x + 0.1, 1.0, 0.016), gridLine(q.y - 0.1, 1.0, 0.016));
        color = gridBase;
        color = mix(color, uAccent, (fine * 0.075 + major * 0.12) * uIntensity);
      // grid-1 · Offset ledger
      } else if (atlasVariant < 1.5) {
        float first = max(gridLine(q.x, 4.0, 0.01), gridLine(q.y, 6.0, 0.008));
        vec2 offset = seedOffset * 0.07 + closedDrift * 0.025;
        float second = max(gridLine(q.x + offset.x, 4.0, 0.007), gridLine(q.y + offset.y, 6.0, 0.006));
        color = gridBase;
        color = mix(color, uColorB, first * 0.09 * uIntensity);
        color = mix(color, uAccent, second * 0.11 * uIntensity);
      // grid-2 · Quiet thirds
      } else if (atlasVariant < 2.5) {
        float thirdsX = gridLine(uv.x, 3.0, 0.013);
        float thirdsY = gridLine(uv.y, 3.0, 0.013);
        float subdivisions = max(gridLine(uv.x, 9.0, 0.004), gridLine(uv.y, 9.0, 0.004));
        color = gridBase;
        color = mix(color, uAccent, (max(thirdsX, thirdsY) * 0.13 + subdivisions * 0.035) * uIntensity);
      // grid-3 · Baseline rhythm
      } else if (atlasVariant < 3.5) {
        float baselines = gridLine(q.y + closedDrift.y * 0.018, 13.0, 0.006);
        float measures = gridLine(q.x + seedOffset.x * 0.05, 3.0, 0.009);
        float readingBand = 1.0 - smoothstep(0.22, 0.68, abs(q.x));
        color = gridBase;
        color = mix(color, uAccent, (baselines * 0.075 + measures * readingBand * 0.09) * uIntensity);
      // grid-4 · Coordinate crosses
      } else if (atlasVariant < 4.5) {
        vec2 cell = fract((q + seedOffset * 0.04 + closedDrift * 0.018) * 4.0) - 0.5;
        float h = softBand(cell.y, 0.0, 0.008, 0.018) * (1.0 - smoothstep(0.08, 0.22, abs(cell.x)));
        float v = softBand(cell.x, 0.0, 0.008, 0.018) * (1.0 - smoothstep(0.08, 0.22, abs(cell.y)));
        float localGlow = 1.0 - smoothstep(0.0, 0.22, length(cell));
        color = gridBase;
        color = mix(color, uAccent, (max(h, v) * 0.15 + localGlow * 0.025) * uIntensity);
      // grid-5 · Broken matrix
      } else if (atlasVariant < 5.5) {
        vec2 matrixCell = floor((q + 2.0) * 6.0);
        float keep = step(0.26, hash12(matrixCell + variationKey));
        float matrix = max(gridLine(q.x, 6.0, 0.008), gridLine(q.y, 6.0, 0.008)) * keep;
        float chamber = softEllipse(p, seedOffset * 0.1, vec2(max(0.32, aspect * 0.26), 0.5), 0.42);
        color = mix(gridBase, uColorB, chamber * 0.1 * uIntensity);
        color = mix(color, uAccent, matrix * 0.1 * uIntensity);
      // grid-6 · Contact columns
      } else if (atlasVariant < 6.5) {
        float columns = gridLine(q.x + closedDrift.x * 0.015, 6.0, 0.012);
        float rows = gridLine(q.y + seedOffset.y * 0.02, 2.0, 0.008);
        float exposure = smoothstep(-0.66, 0.68, q.y + sin(q.x * 1.7) * 0.04);
        color = mix(gridBase, uColorB, exposure * 0.16 * uIntensity);
        color = mix(color, uAccent, (columns * 0.1 + rows * 0.055) * uIntensity);
      // grid-7 · Perspective register
      } else {
        float depth = max(0.12, q.y + 0.92);
        float recedingX = gridLine(q.x / depth + closedDrift.x * 0.012, 3.0, 0.008);
        float recedingY = gridLine(log(depth) + closedDrift.y * 0.018, 4.0, 0.009);
        float distanceFade = 1.0 - smoothstep(-0.62, 0.58, q.y);
        color = gridBase;
        color = mix(color, uAccent, max(recedingX, recedingY) * (0.055 + distanceFade * 0.06) * uIntensity);
      }

`;
