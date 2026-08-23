export const gradientBackgroundBranch = /* glsl */ `
    } else if (uMode < 1.5) {
      // gradient-0 · Legacy horizon
      if (atlasVariant < 0.5) {
        float gradient = smoothstep(-0.65, 0.72, p.y + p.x * 0.42 + wave * 0.08);
        color = mix(uColorA, uColorB, gradient);
        color = mix(color, uAccent, softBlob(p, vec2(0.35 + cos(uPhase) * 0.08, -0.3), 0.7) * 0.32 * uIntensity);
      // gradient-1 · Horizon melt
      } else if (atlasVariant < 1.5) {
        float weather = fbm(q * 1.72 + closedDrift * 0.14);
        float horizonCoordinate = p.y + (weather - 0.5) * 0.38 + sin(p.x * 2.1 + seedAngle) * 0.055;
        float horizon = smoothstep(-0.2, 0.22, horizonCoordinate);
        float seam = 1.0 - smoothstep(0.0, 0.16, abs(horizonCoordinate));
        color = mix(uColorA, uColorB, horizon);
        color = mix(color, uAccent, seam * 0.26 * uIntensity);
      // gradient-2 · Diagonal weather
      } else if (atlasVariant < 2.5) {
        vec2 diagonal = rotate2d(seedAngle * 0.22 + 0.62) * p;
        float pressure = fbm(q * 1.34 + closedDriftTwo * 0.12);
        float front = smoothstep(-0.66, 0.66, diagonal.y + (pressure - 0.5) * 0.58);
        float cloudEdge = smoothstep(0.48, 0.78, pressure);
        color = mix(uColorA, uColorB, front);
        color = mix(color, uAccent, cloudEdge * 0.24 * uIntensity);
      // gradient-3 · Radial dusk
      } else if (atlasVariant < 3.5) {
        vec2 center = seedOffset * 0.24 + closedDrift * 0.055;
        float radius = length(p - center);
        float dusk = smoothstep(0.06, 1.05, radius);
        float afterglow = 1.0 - smoothstep(0.0, 0.68, radius);
        color = mix(uColorB, uColorA, dusk);
        color = mix(color, uAccent, afterglow * 0.48 * uIntensity);
      // gradient-4 · Prism bands
      } else if (atlasVariant < 4.5) {
        vec2 prism = rotate2d(seedAngle * 0.18 + 0.32) * p;
        float drift = sin(uPhase + seedAngle) * 0.08 * uMotion;
        float bandA = softBand(prism.x, -0.34 + drift, 0.18, 0.24);
        float bandB = softBand(prism.x, 0.02 - drift * 0.5, 0.16, 0.22);
        float bandC = softBand(prism.x, 0.38 + drift * 0.3, 0.18, 0.24);
        float baseGradient = smoothstep(-0.7, 0.7, prism.y);
        color = mix(uColorA, uColorB, baseGradient * 0.72);
        color = mix(color, uColorB, bandA * 0.32 * uIntensity);
        color = mix(color, uAccent, bandB * 0.46 * uIntensity);
        color += uAccent * bandC * 0.08 * uIntensity;
      // gradient-5 · Twin suns
      } else if (atlasVariant < 5.5) {
        float horizon = smoothstep(-0.62, 0.68, p.y + p.x * 0.12);
        vec2 sunA = vec2(-aspect * 0.25, -0.12) + seedOffset * 0.12 + closedDrift * 0.045;
        vec2 sunB = vec2(aspect * 0.3, 0.06) - seedOffset * 0.1 + closedDriftTwo * 0.04;
        float a = softEllipse(p, sunA, vec2(0.46, 0.46), 0.38);
        float b = softEllipse(p, sunB, vec2(0.34, 0.34), 0.42);
        color = mix(uColorA, uColorB, horizon);
        color = mix(color, uAccent, max(a * 0.44, b * 0.34) * uIntensity);
      // gradient-6 · Split signal
      } else if (atlasVariant < 6.5) {
        vec2 signal = rotate2d(seedAngle * 0.16 + 0.78) * p;
        float interference = fbm(q * 2.0 + closedDrift * 0.12) - 0.5;
        float splitCoordinate = signal.x + interference * 0.17;
        float split = smoothstep(-0.08, 0.08, splitCoordinate);
        float seam = 1.0 - smoothstep(0.0, 0.1, abs(splitCoordinate));
        color = mix(uColorA, uColorB, split);
        color = mix(color, uAccent, seam * 0.48 * uIntensity);
      // gradient-7 · Road mirage
      } else {
        float horizonCoordinate = p.y + 0.12 + sin(p.x * 1.8 + seedAngle) * 0.025;
        float horizon = smoothstep(-0.16, 0.2, horizonCoordinate);
        float mirageWindow = smoothstep(-0.34, -0.08, p.y) * (1.0 - smoothstep(0.08, 0.32, p.y));
        float ripples = sin((p.y + 0.22) * 92.0 + sin(p.x * 5.0) * 2.0 + sin(uPhase) * 2.4) * 0.5 + 0.5;
        color = mix(uColorA, uColorB, horizon);
        color = mix(color, uAccent, ripples * mirageWindow * 0.25 * uIntensity);
      }

`;
