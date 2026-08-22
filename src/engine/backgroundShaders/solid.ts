export const solidBackgroundBranch = /* glsl */ `
    if (uMode < 0.5) {
      // solid-0 · Pure field / legacy solid
      if (atlasVariant < 0.5) {
        color = uColorA;
      // solid-1 · Projector wash
      } else if (atlasVariant < 1.5) {
        vec2 center = vec2(aspect * 0.42, -0.24) + seedOffset * 0.18 + closedDrift * 0.06;
        float wash = softEllipse(p, center, vec2(0.94, 0.82), 0.34);
        float floorLight = smoothstep(-0.62, 0.48, p.y + wave * 0.04);
        color = mix(uColorA, uColorB, floorLight * 0.24);
        color = mix(color, uAccent, wash * 0.44 * uIntensity);
      // solid-2 · Edge light
      } else if (atlasVariant < 2.5) {
        float side = step(0.5, hash12(variationKey + 12.0));
        float edgeCoordinate = mix(p.x + aspect * 0.56, aspect * 0.56 - p.x, side);
        float edge = 1.0 - smoothstep(0.0, 0.78, max(0.0, edgeCoordinate));
        float verticalFade = 1.0 - smoothstep(0.42, 0.92, abs(p.y + seedOffset.y * 0.2));
        color = mix(uColorA, uColorB, edge * 0.2 * uIntensity);
        color = mix(color, uAccent, edge * verticalFade * 0.52 * uIntensity);
      // solid-3 · Duotone floor
      } else if (atlasVariant < 3.5) {
        float horizonCoordinate = p.y + 0.2 + sin(p.x * 1.7 + seedAngle) * 0.035 + wave * 0.05;
        float floorMask = smoothstep(-0.18, 0.24, horizonCoordinate);
        float seam = 1.0 - smoothstep(0.0, 0.18, abs(horizonCoordinate));
        color = mix(uColorA, uColorB, floorMask * 0.72 * uIntensity);
        color = mix(color, uAccent, seam * 0.14 * uIntensity);
      // solid-4 · Soft burn
      } else if (atlasVariant < 4.5) {
        float reaction = fbm(q * 2.15 + closedDrift * 0.18);
        float burnBody = softEllipse(q, seedOffset * 0.22 + closedDriftTwo * 0.05, vec2(0.58, 0.76), 0.3);
        float burn = smoothstep(0.28, 0.78, burnBody + (reaction - 0.5) * 0.46);
        float reactionEdge = 1.0 - smoothstep(0.0, 0.12, abs(burnBody + (reaction - 0.5) * 0.46 - 0.52));
        color = mix(uColorA, uColorB, burn * 0.58 * uIntensity);
        color = mix(color, uAccent, reactionEdge * 0.42 * uIntensity);
      // solid-5 · Paper tooth
      } else if (atlasVariant < 5.5) {
        float longFibre = sin((q.y + sin(q.x * 13.0) * 0.014) * 720.0) * 0.5 + 0.5;
        float crossFibre = sin((q.x + sin(q.y * 9.0) * 0.01) * 430.0) * 0.5 + 0.5;
        float exposure = smoothstep(-0.52, 0.58, q.y + seedOffset.x * 0.12);
        color = mix(uColorA, uColorB, exposure * 0.2 * uIntensity);
        color += (longFibre - 0.5) * 0.026 * uIntensity;
        color += (crossFibre - 0.5) * 0.012 * uIntensity;
      // solid-6 · Low halo
      } else if (atlasVariant < 6.5) {
        vec2 center = vec2(seedOffset.x * 0.22, -0.38 + seedOffset.y * 0.08) + closedDrift * 0.035;
        float body = softEllipse(p, center, vec2(0.72, 0.38), 0.36);
        float ring = softRing(p, center, vec2(0.66, 0.34), 0.1, 0.18);
        color = mix(uColorA, uColorB, body * 0.34 * uIntensity);
        color = mix(color, uAccent, ring * 0.26 * uIntensity);
      // solid-7 · Night exposure
      } else {
        float exposure = smoothstep(-0.72, 0.72, p.y + p.x * 0.08);
        float longBand = softBand(p.y + sin(p.x * 1.5 + seedAngle) * 0.035, -0.18 + wave * 0.05, 0.12, 0.3);
        color = mix(uColorA, uColorB, exposure * 0.36 * uIntensity);
        color = mix(color, uAccent, longBand * 0.34 * uIntensity);
      }

`;
