export const auraBackgroundBranch = /* glsl */ `
    } else if (uMode < 2.5) {
      // aura-0 · Orbiting bloom / legacy aura
      if (atlasVariant < 0.5) {
        vec2 centerA = vec2(cos(uPhase) * 0.34, sin(uPhase) * 0.22);
        vec2 centerB = vec2(cos(uPhase + 2.1) * 0.42, sin(uPhase + 1.4) * 0.3);
        float a = softBlob(p, centerA, 0.72);
        float b = softBlob(p, centerB, 0.62);
        color = mix(uColorA, uColorB, a * 0.72 * uIntensity);
        color = mix(color, uAccent, b * 0.48 * uIntensity);
      // aura-1 · Projector halo
      } else if (atlasVariant < 1.5) {
        vec2 center = seedOffset * 0.16 + closedDrift * 0.045;
        float body = softEllipse(p, center, vec2(0.78, 0.7), 0.4);
        float halo = softRing(p, center, vec2(0.62, 0.56), 0.13, 0.22);
        color = mix(uColorA, uColorB, body * 0.34 * uIntensity);
        color = mix(color, uAccent, halo * 0.44 * uIntensity);
      // aura-2 · Aurora veil
      } else if (atlasVariant < 2.5) {
        float weather = fbm(vec2(q.x * 1.2, q.y * 0.72) + closedDrift * 0.16);
        float veilA = sin((q.x + weather * 0.42) * 7.2 + sin(uPhase) * 0.7) * 0.5 + 0.5;
        float veilB = sin((q.x - weather * 0.28) * 10.4 - sin(uPhase * 2.0) * 0.45 + 1.8) * 0.5 + 0.5;
        veilA = smoothstep(0.48, 0.86, veilA) * (1.0 - smoothstep(0.36, 0.96, abs(q.y)));
        veilB = smoothstep(0.58, 0.9, veilB) * (1.0 - smoothstep(0.28, 0.9, abs(q.y + 0.12)));
        color = mix(uColorA, uColorB, veilA * 0.62 * uIntensity);
        color = mix(color, uAccent, veilB * 0.44 * uIntensity);
      // aura-3 · Stained light
      } else if (atlasVariant < 3.5) {
        float irregularity = fbm(q * 1.8 + closedDriftTwo * 0.12) - 0.5;
        float paneA = softEllipse(p, vec2(-aspect * 0.26, -0.12) + seedOffset * 0.14, vec2(0.5, 0.68), 0.32);
        float paneB = softEllipse(p, vec2(aspect * 0.2, 0.18) - seedOffset * 0.12, vec2(0.52, 0.56), 0.34);
        float paneC = softEllipse(p, vec2(0.06, -0.34) + closedDrift * 0.035, vec2(0.4, 0.38), 0.38);
        paneA = smoothstep(0.12, 0.88, paneA + irregularity * 0.38);
        paneB = smoothstep(0.12, 0.88, paneB - irregularity * 0.28);
        color = mix(uColorA, uColorB, paneA * 0.62 * uIntensity);
        color = mix(color, uAccent, max(paneB * 0.48, paneC * 0.3) * uIntensity);
      // aura-4 · Liquid caustic
      } else if (atlasVariant < 4.5) {
        float liquid = ridgedFbm(q * 2.75 + closedDrift * 0.24);
        float undertow = fbm(q * 1.05 - closedDriftTwo * 0.1);
        float caustic = smoothstep(0.58, 0.92, liquid);
        color = mix(uColorA, uColorB, undertow * 0.54 * uIntensity);
        color = mix(color, uAccent, caustic * 0.42 * uIntensity);
      // aura-5 · Rose chamber
      } else if (atlasVariant < 5.5) {
        float approach = sin(uPhase) * 0.035 * uMotion;
        vec2 leftCenter = vec2(-aspect * 0.22 + approach, -0.02) + seedOffset * 0.08;
        vec2 rightCenter = vec2(aspect * 0.22 - approach, 0.04) - seedOffset * 0.08;
        float left = softEllipse(p, leftCenter, vec2(0.5, 0.72), 0.42);
        float right = softEllipse(p, rightCenter, vec2(0.5, 0.68), 0.42);
        color = mix(uColorA, uColorB, left * 0.56 * uIntensity);
        color = mix(color, uAccent, right * 0.46 * uIntensity);
      // aura-6 · Ice bloom
      } else if (atlasVariant < 6.5) {
        vec2 bloomPoint = q + closedDrift * 0.04;
        float radius = length(bloomPoint);
        float angle = atan(bloomPoint.y, bloomPoint.x);
        float petals = cos(angle * 6.0 + sin(uPhase) * 0.3 + seedAngle) * 0.5 + 0.5;
        float bloom = 1.0 - smoothstep(0.18, 0.9, radius + petals * 0.22);
        float crystal = smoothstep(0.52, 0.9, ridgedFbm(bloomPoint * 3.1));
        color = mix(uColorA, uColorB, bloom * 0.58 * uIntensity);
        color = mix(color, uAccent, bloom * crystal * 0.38 * uIntensity);
      // aura-7 · Mandorla
      } else {
        float opening = 0.18 + sin(uPhase) * 0.025 * uMotion;
        float left = softEllipse(p, vec2(-opening, 0.0) + seedOffset * 0.05, vec2(0.62, 0.82), 0.24);
        float right = softEllipse(p, vec2(opening, 0.0) - seedOffset * 0.05, vec2(0.62, 0.82), 0.24);
        float overlap = left * right;
        float outer = max(left, right);
        color = mix(uColorA, uColorB, outer * 0.36 * uIntensity);
        color = mix(color, uAccent, overlap * 0.58 * uIntensity);
      }

`;
