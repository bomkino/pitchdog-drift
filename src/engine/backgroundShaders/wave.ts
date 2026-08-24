export const waveBackgroundBranch = /* glsl */ `
    } else if (uMode < 7.5) {
      vec3 waveBase = mix(uColorA, uColorB, smoothstep(-0.82, 0.82, q.y) * 0.28);

      // wave-0 · Tidal horizon
      if (atlasVariant < 0.5) {
        float horizon = q.y + 0.12 + sin(q.x * 2.1 + seedAngle + sin(uPhase) * 0.22) * 0.11;
        float tide = smoothstep(-0.14, 0.16, horizon);
        float edge = 1.0 - smoothstep(0.0, 0.08, abs(horizon));
        color = mix(uColorA, uColorB, tide * 0.52 * uIntensity);
        color = mix(color, uAccent, edge * 0.16 * uIntensity);
      // wave-1 · Nested swell
      } else if (atlasVariant < 1.5) {
        float swellA = 1.0 - smoothstep(0.0, 0.09, abs(q.y + 0.3 + sin(q.x * 1.6 + uPhase * 0.35) * 0.12));
        float swellB = 1.0 - smoothstep(0.0, 0.08, abs(q.y + 0.02 + sin(q.x * 2.1 - uPhase * 0.28 + 1.4) * 0.1));
        float swellC = 1.0 - smoothstep(0.0, 0.075, abs(q.y - 0.27 + sin(q.x * 2.7 + uPhase * 0.22 + 2.2) * 0.075));
        color = waveBase;
        color = mix(color, uAccent, (swellA * 0.12 + swellB * 0.1 + swellC * 0.075) * uIntensity);
      // wave-2 · Interference bed
      } else if (atlasVariant < 2.5) {
        float systemA = sin(q.x * 4.8 + q.y * 2.2 + sin(uPhase) * 0.55);
        float systemB = sin(q.x * 3.1 - q.y * 4.0 - cos(uPhase) * 0.48 + seedAngle);
        float interference = 1.0 - smoothstep(0.06, 0.22, abs((systemA + systemB) * 0.5));
        float bed = 1.0 - smoothstep(0.46, 0.96, abs(q.y));
        color = waveBase;
        color = mix(color, uAccent, interference * bed * 0.11 * uIntensity);
      // wave-3 · Ribbon current
      } else if (atlasVariant < 3.5) {
        vec2 current = rotate2d(seedAngle * 0.08 + 0.2) * q;
        float centre = sin(current.x * 2.2 + uPhase * 0.26) * 0.17 + sin(current.x * 4.4 - uPhase * 0.18) * 0.035;
        float ribbon = softBand(current.y, centre, 0.13, 0.2);
        float inner = softBand(current.y, centre + 0.025, 0.025, 0.08);
        color = mix(waveBase, uColorB, ribbon * 0.2 * uIntensity);
        color = mix(color, uAccent, inner * 0.13 * uIntensity);
      // wave-4 · Standing wave
      } else if (atlasVariant < 4.5) {
        float breathingAmplitude = 0.08 + sin(uPhase) * 0.018 * uMotion;
        float standing = sin(q.x * 5.0 + seedAngle) * cos(q.y * 3.0) * breathingAmplitude;
        float centreLine = 1.0 - smoothstep(0.0, 0.07, abs(q.y - standing));
        float chamber = softEllipse(p, seedOffset * 0.08, vec2(max(0.34, aspect * 0.31), 0.58), 0.42);
        color = mix(waveBase, uColorB, chamber * 0.12 * uIntensity);
        color = mix(color, uAccent, centreLine * 0.14 * uIntensity);
      // wave-5 · Radial echo
      } else if (atlasVariant < 5.5) {
        vec2 echoPoint = p - seedOffset * 0.14 - closedDrift * 0.025;
        float radius = length(echoPoint);
        float echoes = 1.0 - smoothstep(0.43, 0.5, abs(fract(radius * 5.0 - sin(uPhase) * 0.035) - 0.5));
        float fade = 1.0 - smoothstep(0.18, 1.05, radius);
        color = waveBase;
        color = mix(color, uAccent, echoes * fade * 0.13 * uIntensity);
      // wave-6 · Contour current
      } else if (atlasVariant < 6.5) {
        vec2 obstacle = q - seedOffset * 0.12;
        float bend = 0.12 / max(0.16, dot(obstacle, obstacle));
        float stream = obstacle.y + bend * obstacle.y + sin(obstacle.x * 2.4 + uPhase * 0.2) * 0.04;
        float lines = 1.0 - smoothstep(0.44, 0.5, abs(fract(stream * 7.0) - 0.5));
        float protectedCentre = smoothstep(0.15, 0.42, length(obstacle));
        color = waveBase;
        color = mix(color, uAccent, lines * protectedCentre * 0.11 * uIntensity);
      // wave-7 · Undertow lines
      } else {
        float lowerField = 1.0 - smoothstep(-0.08, 0.62, q.y);
        float bandA = softBand(q.y, -0.34 + sin(q.x * 1.8 + uPhase * 0.22) * 0.06, 0.055, 0.12);
        float bandB = softBand(q.y, -0.08 + sin(q.x * 2.4 - uPhase * 0.18 + 1.7) * 0.045, 0.04, 0.1);
        float bandC = softBand(q.y, 0.18 + sin(q.x * 3.0 + uPhase * 0.15 + 2.8) * 0.035, 0.03, 0.08);
        color = mix(waveBase, uColorB, lowerField * 0.16 * uIntensity);
        color = mix(color, uAccent, (bandA * 0.1 + bandB * 0.075 + bandC * 0.05) * uIntensity);
      }
`;
