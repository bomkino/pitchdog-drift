export const voidBackgroundBranch = /* glsl */ `
    } else if (uMode < 4.5) {
      // void-0 · Breathing slit / legacy void
      if (atlasVariant < 0.5) {
        float slit = exp(-abs(p.x + sin(p.y * 2.4 + uPhase) * 0.08) * 8.0);
        float pulse = 0.82 + 0.18 * sin(uPhase);
        color = mix(uColorA, uColorB, smoothstep(-0.4, 0.5, p.y) * 0.36);
        color = mix(color, uAccent, slit * pulse * 0.28 * uIntensity);
      // void-1 · Eclipse
      } else if (atlasVariant < 1.5) {
        vec2 center = seedOffset * 0.18 + closedDrift * 0.035;
        float radius = length(p - center);
        float body = 1.0 - smoothstep(0.34, 0.37, radius);
        float corona = 1.0 - smoothstep(0.0, 0.1, abs(radius - 0.39));
        float distantGlow = 1.0 - smoothstep(0.2, 0.86, radius);
        color = mix(uColorA, uColorB, distantGlow * 0.22 * uIntensity);
        color = mix(color, uAccent, corona * 0.42 * uIntensity);
        color = mix(color, uColorA, body * 0.94);
      // void-2 · Ember smoke
      } else if (atlasVariant < 2.5) {
        float smoke = fbm(q * 1.74 + closedDrift * 0.16);
        float plume = smoothstep(0.38, 0.78, smoke - q.y * 0.14);
        vec2 emberCell = floor((q + 1.8) * vec2(36.0, 28.0));
        float emberSeed = hash12(emberCell + variationKey);
        float embers = step(0.992, emberSeed) * (0.78 + 0.22 * sin(uPhase * 2.0 + emberSeed * TAU));
        color = mix(uColorA, uColorB, plume * 0.46 * uIntensity);
        color = mix(color, uAccent, embers * 0.76 * uIntensity);
      // void-3 · Abyssal rays
      } else if (atlasVariant < 3.5) {
        vec2 source = vec2(-aspect * 0.72, 0.72) + seedOffset * 0.12;
        vec2 ray = p - source;
        float angle = atan(ray.y, ray.x);
        float beams = pow(max(0.0, sin(angle * 12.0 + seedAngle + sin(uPhase) * 0.25) * 0.5 + 0.5), 7.0);
        float falloff = 1.0 - smoothstep(0.2, 1.8, length(ray));
        float depthFog = smoothstep(-0.72, 0.54, p.y);
        color = mix(uColorA, uColorB, depthFog * 0.22);
        color = mix(color, uAccent, beams * falloff * 0.36 * uIntensity);
      // void-4 · Mineral fog
      } else if (atlasVariant < 4.5) {
        float strata = ridgedFbm(vec2(q.x * 1.7, q.y * 2.5) + closedDrift * 0.12);
        float fog = fbm(q * 1.18 - closedDriftTwo * 0.08);
        float mineral = smoothstep(0.52, 0.88, strata) * smoothstep(0.28, 0.82, fog);
        color = mix(uColorA, uColorB, fog * 0.38 * uIntensity);
        color = mix(color, uAccent, mineral * 0.24 * uIntensity);
      // void-5 · Rain negative
      } else if (atlasVariant < 5.5) {
        vec2 rainUv = rotate2d(-0.34 + seedAngle * 0.03) * q;
        float lane = abs(fract((rainUv.x + seedOffset.x) * 84.0) - 0.5);
        float streak = 1.0 - smoothstep(0.012, 0.045, lane);
        float segment = sin(rainUv.y * 38.0 + sin(uPhase) * 2.2 + hash12(vec2(floor(rainUv.x * 84.0), variation)) * TAU) * 0.5 + 0.5;
        segment = smoothstep(0.7, 0.94, segment);
        float haze = fbm(q * 1.2 + closedDrift * 0.05);
        color = mix(uColorA, uColorB, haze * 0.24 * uIntensity);
        color = mix(color, uAccent, streak * segment * 0.38 * uIntensity);
      // void-6 · Chemical burn
      } else if (atlasVariant < 6.5) {
        vec2 center = seedOffset * 0.2 + closedDrift * 0.035;
        float reaction = fbm(q * 2.34 + closedDriftTwo * 0.08);
        float field = length(p - center) + (reaction - 0.5) * 0.34;
        float inside = 1.0 - smoothstep(0.42, 0.58, field);
        float edge = 1.0 - smoothstep(0.0, 0.075, abs(field - 0.5));
        color = mix(uColorA, uColorB, inside * 0.52 * uIntensity);
        color = mix(color, uAccent, edge * 0.56 * uIntensity);
      // void-7 · Black tide
      } else {
        float tideA = smoothstep(-0.12, 0.12, p.y + 0.34 + sin(p.x * 2.0 + sin(uPhase) * 0.4 + seedAngle) * 0.08);
        float tideB = smoothstep(-0.1, 0.14, p.y + 0.08 + sin(p.x * 2.8 - sin(uPhase * 2.0) * 0.32 + seedAngle * 0.7) * 0.07);
        float tideC = smoothstep(-0.1, 0.16, p.y - 0.18 + sin(p.x * 3.7 + sin(uPhase) * 0.25 + seedAngle * 1.2) * 0.05);
        float edgeA = 1.0 - smoothstep(0.0, 0.08, abs(p.y + 0.34 + sin(p.x * 2.0 + sin(uPhase) * 0.4 + seedAngle) * 0.08));
        color = mix(uColorA, uColorB, (tideA * 0.14 + tideB * 0.18 + tideC * 0.22) * uIntensity);
        color = mix(color, uAccent, edgeA * 0.18 * uIntensity);
      }
`;
