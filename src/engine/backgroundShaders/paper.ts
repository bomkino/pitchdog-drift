export const paperBackgroundBranch = /* glsl */ `
    } else if (uMode < 3.5) {
      // paper-0 · Long fibres / legacy paper
      if (atlasVariant < 0.5) {
        float fibres = sin((p.y + sin(p.x * 19.0) * 0.015) * 620.0) * 0.5 + 0.5;
        color = mix(uColorA, uColorB, smoothstep(-0.45, 0.65, p.y));
        color += (fibres - 0.5) * 0.018 * uIntensity;
      // paper-1 · Contact sheet
      } else if (atlasVariant < 1.5) {
        float grid = max(gridLine(q.x + seedOffset.x, 4.0, 0.018), gridLine(q.y + seedOffset.y, 6.0, 0.014));
        float emulsion = fbm(q * 4.2 + closedDrift * 0.03);
        color = mix(uColorA, uColorB, smoothstep(-0.6, 0.62, q.y) * 0.42);
        color = mix(color, uAccent, grid * 0.2 * uIntensity);
        color += (emulsion - 0.5) * 0.055 * uIntensity;
      // paper-2 · Risograph cloud
      } else if (atlasVariant < 2.5) {
        float cloudA = fbm(q * 1.62 + closedDrift * 0.08);
        float cloudB = fbm(q * 1.58 - closedDriftTwo * 0.06 + vec2(7.4, 2.1));
        vec2 screenUv = rotate2d(0.28) * q;
        float dots = sin(screenUv.x * 118.0) * sin(screenUv.y * 118.0) * 0.5 + 0.5;
        float screen = smoothstep(0.42, 0.78, dots);
        color = mix(uColorA, uColorB, smoothstep(0.36, 0.72, cloudA) * 0.6 * uIntensity);
        color = mix(color, uAccent, smoothstep(0.42, 0.76, cloudB) * screen * 0.42 * uIntensity);
      // paper-3 · Linen drift
      } else if (atlasVariant < 3.5) {
        float vertical = sin((q.y + sin(q.x * 11.0) * 0.012) * 690.0) * 0.5 + 0.5;
        float horizontal = sin((q.x + sin(q.y * 9.0) * 0.012) * 510.0) * 0.5 + 0.5;
        float exposure = smoothstep(-0.7, 0.7, q.x * 0.28 + q.y);
        color = mix(uColorA, uColorB, exposure * 0.34);
        color += (vertical - 0.5) * 0.022 * uIntensity;
        color += (horizontal - 0.5) * 0.016 * uIntensity;
      // paper-4 · Newsprint
      } else if (atlasVariant < 4.5) {
        vec2 printUv = rotate2d(0.42 + seedAngle * 0.04) * q;
        float dotScreen = sin(printUv.x * 154.0) * sin(printUv.y * 154.0) * 0.5 + 0.5;
        float ink = smoothstep(0.34, 0.78, dotScreen + (fbm(q * 2.0) - 0.5) * 0.24);
        float fold = 1.0 - smoothstep(0.0, 0.07, abs(q.x + seedOffset.x * 0.22));
        color = mix(uColorA, uColorB, ink * 0.38 * uIntensity);
        color = mix(color, uAccent, fold * 0.1 * uIntensity);
      // paper-5 · Silver emulsion
      } else if (atlasVariant < 5.5) {
        float emulsion = fbm(q * 4.8 + closedDrift * 0.035);
        float clump = smoothstep(0.54, 0.82, emulsion);
        float leak = softEllipse(p, vec2(aspect * 0.46, -0.28) + seedOffset * 0.1, vec2(0.7, 0.8), 0.42);
        float dust = step(0.988, hash12(floor(gl_FragCoord.xy / 3.0) + variationKey));
        color = mix(uColorA, uColorB, clump * 0.48 * uIntensity);
        color = mix(color, uAccent, leak * 0.2 * uIntensity + dust * 0.34 * uIntensity);
      // paper-6 · Halftone field
      } else if (atlasVariant < 6.5) {
        vec2 halfUv = rotate2d(0.24 + seedAngle * 0.05) * q * 30.0;
        vec2 cell = fract(halfUv) - 0.5;
        float field = smoothstep(-0.72, 0.72, q.y + q.x * 0.18);
        float dotRadius = mix(0.12, 0.42, field);
        float dotMask = 1.0 - smoothstep(dotRadius, dotRadius + 0.07, length(cell));
        color = mix(uColorA, uColorB, field * 0.5);
        color = mix(color, uAccent, dotMask * 0.38 * uIntensity);
      // paper-7 · Dust archive
      } else {
        float column = floor((q.x + 1.7) * 92.0);
        float scratchSeed = hash12(vec2(column, variation + 17.0));
        float scratchCoordinate = abs(fract((q.x + seedOffset.x) * 92.0) - 0.5);
        float scratch = (1.0 - smoothstep(0.0, 0.025, scratchCoordinate)) * step(0.9, scratchSeed);
        float dust = step(0.982, hash12(floor(gl_FragCoord.xy / 4.0) + variationKey));
        float exposure = fbm(q * 1.35 + closedDrift * 0.025);
        color = mix(uColorA, uColorB, exposure * 0.34 * uIntensity);
        color = mix(color, uAccent, (scratch * 0.22 + dust * 0.32) * uIntensity);
      }

`;
