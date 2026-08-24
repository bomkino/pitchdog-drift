/**
 * Original living-pigment studies for Drift's Atelier family.
 *
 * The compositions borrow media principles from physical watercolour, ink,
 * fresco, and graphite: transparent glazing, pooled edges, dry marks, paper
 * tooth, and sparse constructed lines. They do not reproduce any reference
 * artwork. Every moving term is a closed integer harmonic of `uPhase`, so the
 * same shader remains deterministic and loop-safe in preview and export.
 */
export const atelierBackgroundBranch = /* glsl */ `
    } else {
      vec2 pigmentDrift = vec2(cos(uPhase), sin(uPhase)) * uMotion;
      vec2 pigmentDriftTwo = vec2(cos(uPhase * 2.0 + 1.1), sin(uPhase * 2.0 + 1.1)) * uMotion;
      float stockTooth = valueNoise(vec2(p.x * 118.0, p.y * 176.0) + variationKey * 0.43) - 0.5;
      float stockCloud = fbm(q * 3.1 + variationKey * 0.17) - 0.5;
      vec3 atelierStock = max(vec3(0.0), uColorA + vec3(stockTooth * 0.012 + stockCloud * 0.022) * uIntensity);

      // atelier-0 · Saffron anatomy
      if (atlasVariant < 0.5) {
        vec2 centre = seedOffset * 0.08 + pigmentDrift * 0.035;
        vec2 washPoint = rotate2d(seedAngle * 0.08) * (p - centre);
        float washNoise = fbm(washPoint * 4.1 + variationKey + pigmentDriftTwo * 0.32) - 0.5;
        float washDistance = length(washPoint / vec2(max(0.22, aspect * 0.31), 0.3)) + washNoise * 0.32;
        float wash = 1.0 - smoothstep(0.58, 1.16, washDistance);
        float pooledEdge = 1.0 - smoothstep(0.035, 0.13, abs(washDistance - 0.78));

        vec2 inkPoint = p - centre * 0.72;
        float inkRadius = length(inkPoint);
        float inkAngle = atan(inkPoint.y, inkPoint.x);
        float filamentWarp = (fbm(inkPoint * 6.0 + variationKey) - 0.5) * 2.2;
        float filaments = pow(abs(sin(inkAngle * 11.0 + filamentWarp + seedAngle)), 34.0)
          * smoothstep(0.045, 0.16, inkRadius)
          * (1.0 - smoothstep(0.2, max(0.48, aspect * 0.66), inkRadius));

        vec2 noteCell = fract((q + seedOffset * 0.07) * vec2(7.0, 11.0)) - 0.5;
        float noteKeep = step(0.83, hash12(floor((q + 2.0) * vec2(7.0, 11.0)) + variationKey));
        float notes = softBand(noteCell.y, 0.0, 0.005, 0.012)
          * (1.0 - smoothstep(0.12, 0.39, abs(noteCell.x))) * noteKeep;
        float dripColumn = 1.0 - smoothstep(0.475, 0.5, abs(fract((p.x + seedOffset.x) * 15.0) - 0.5));
        float dripKeep = step(0.88, hash12(vec2(floor((p.x + seedOffset.x) * 15.0), variation + 31.0)));
        float drips = dripColumn * dripKeep * smoothstep(-0.38, 0.18, p.y) * (1.0 - smoothstep(0.42, 0.52, p.y));

        color = mix(atelierStock, uColorB, wash * 0.46 * uIntensity);
        color = mix(color, uColorB, pooledEdge * wash * 0.13 * uIntensity);
        color = mix(color, uAccent, (filaments * 0.2 + notes * 0.1 + drips * 0.09) * uIntensity);

      // atelier-1 · Verdigris fresco
      } else if (atlasVariant < 1.5) {
        vec2 mineralPoint = rotate2d(-0.18 + seedAngle * 0.04) * (q + pigmentDrift * 0.04);
        float mineralA = fbm(mineralPoint * 1.8 + variationKey * 0.31);
        float mineralB = ridgedFbm(mineralPoint * 2.3 - pigmentDriftTwo * 0.14 + 19.0);
        float glaze = smoothstep(0.34, 0.78, mineralA + mineralB * 0.18);
        float sidePatina = softEllipse(
          p,
          vec2(aspect * 0.39, -0.22) + seedOffset * 0.045 + pigmentDrift * 0.018,
          vec2(max(0.22, aspect * 0.43), 0.38),
          0.68
        );
        float upperPatina = softEllipse(
          p,
          vec2(-aspect * 0.37, 0.34) - seedOffset * 0.035,
          vec2(max(0.18, aspect * 0.31), 0.22),
          0.72
        );
        vec2 archCentre = vec2(-aspect * 0.18, 0.12) + seedOffset * 0.08;
        float archRadius = length(p - archCentre);
        float arches = 1.0 - smoothstep(0.455, 0.5, abs(fract(archRadius * 6.5) - 0.5));
        arches *= 1.0 - smoothstep(0.12, max(0.54, aspect * 0.75), archRadius);
        float seam = softBand((rotate2d(0.34) * p).y, -0.07 + pigmentDrift.y * 0.02, 0.008, 0.022);
        float fleck = step(0.987, hash12(floor(gl_FragCoord.xy / 5.0) + variationKey));

        color = mix(atelierStock, uColorB, (glaze * 0.4 + sidePatina * 0.2 + upperPatina * 0.1) * uIntensity);
        color = mix(color, uAccent, (arches * 0.15 + seam * 0.09 + fleck * 0.18) * uIntensity);

      // atelier-2 · Ultramarine ledger
      } else if (atlasVariant < 2.5) {
        vec2 ledgerPoint = q + vec2(pigmentDrift.x * 0.05, pigmentDriftTwo.y * 0.035);
        float poolNoise = fbm(ledgerPoint * 3.7 + variationKey * 0.29) - 0.5;
        vec2 poolCentre = vec2(aspect * 0.3 + seedOffset.x * 0.08, -0.13 + seedOffset.y * 0.04);
        float poolDistance = length((p - poolCentre - pigmentDrift * 0.02) / vec2(max(0.34, aspect * 0.5), 0.46)) + poolNoise * 0.31;
        float pool = 1.0 - smoothstep(0.62, 1.18, poolDistance);
        float poolEdge = 1.0 - smoothstep(0.025, 0.095, abs(poolDistance - 0.83));
        float rules = gridLine(uv.y + seedOffset.y * 0.018, 13.0, 0.0045);
        float marginRule = softBand(p.x, -aspect * 0.27, 0.004, 0.011);
        vec2 dryPoint = rotate2d(-0.08) * q;
        float dryBrush = softBand(dryPoint.y, -0.22 + sin(dryPoint.x * 2.0 + seedAngle) * 0.035, 0.026, 0.09);
        dryBrush *= smoothstep(0.38, 0.72, valueNoise(vec2(dryPoint.x * 28.0, dryPoint.y * 7.0) + variationKey));

        color = mix(atelierStock, uColorB, pool * 0.54 * uIntensity);
        color = mix(color, uColorB, (poolEdge * pool * 0.18 + dryBrush * 0.24) * uIntensity);
        color = mix(color, uAccent, (rules * 0.085 + marginRule * 0.14) * uIntensity);

      // atelier-3 · Rose madder bloom
      } else if (atlasVariant < 3.5) {
        vec2 bloomCentre = vec2(aspect * 0.25, -0.13) + seedOffset * 0.055;
        vec2 bloomPoint = p - bloomCentre - pigmentDrift * 0.025;
        float bloomRadius = length(bloomPoint);
        float bloomAngle = atan(bloomPoint.y, bloomPoint.x);
        float petalEdge = 0.28 + cos(bloomAngle * 5.0 + seedAngle) * 0.055
          + (fbm(bloomPoint * 5.2 + variationKey + pigmentDriftTwo * 0.2) - 0.5) * 0.07;
        float petals = 1.0 - smoothstep(petalEdge - 0.11, petalEdge + 0.08, bloomRadius);
        float pooledPetal = 1.0 - smoothstep(0.02, 0.075, abs(bloomRadius - petalEdge));
        float heart = softBlob(bloomPoint, vec2(0.0), 0.13);
        float veins = pow(abs(sin(bloomAngle * 10.0 + seedAngle)), 40.0)
          * smoothstep(0.07, 0.16, bloomRadius)
          * (1.0 - smoothstep(0.16, 0.34, bloomRadius));
        float fadedWash = softEllipse(p, vec2(-aspect * 0.34, 0.31) + seedOffset * 0.045, vec2(max(0.2, aspect * 0.33), 0.2), 0.62);
        float petalGhost = softEllipse(p, vec2(-aspect * 0.29, -0.3) - seedOffset * 0.03, vec2(max(0.15, aspect * 0.22), 0.16), 0.7);

        color = mix(atelierStock, uColorB, (fadedWash * 0.15 + petalGhost * 0.09) * uIntensity);
        color = mix(color, uColorB, petals * 0.48 * uIntensity);
        color = mix(color, uAccent, (pooledPetal * 0.16 + heart * 0.18 + veins * 0.12) * uIntensity);

      // atelier-4 · Charcoal cartography
      } else if (atlasVariant < 4.5) {
        vec2 charcoalPoint = rotate2d(0.12 + seedAngle * 0.03)
          * (p - vec2(-aspect * 0.12, 0.12) + seedOffset * 0.04 + pigmentDrift * 0.025);
        float smearNoise = ridgedFbm(vec2(charcoalPoint.x * 1.3, charcoalPoint.y * 3.5) + variationKey * 0.19);
        float smear = softBand(charcoalPoint.y, sin(charcoalPoint.x * 1.4 + seedAngle) * 0.1, 0.11, 0.26)
          * smoothstep(0.24, 0.82, smearNoise);
        float terrain = fbm(charcoalPoint * 1.7 + variationKey * 0.37);
        float contourCell = abs(fract((terrain + charcoalPoint.y * 0.13) * 13.0) - 0.5);
        float contours = 1.0 - smoothstep(0.46, 0.5, contourCell);
        float gestureY = sin(charcoalPoint.x * 2.1 + seedAngle) * 0.16 + sin(charcoalPoint.x * 5.0) * 0.02;
        float gesture = 1.0 - smoothstep(0.008, 0.032, abs(charcoalPoint.y - gestureY));
        float centreReserve = smoothstep(0.15, 0.42, length(p));
        float edgeRub = softEllipse(
          p,
          vec2(-aspect * 0.43, 0.2) + seedOffset * 0.035,
          vec2(max(0.22, aspect * 0.38), 0.28),
          0.7
        ) * smoothstep(0.26, 0.78, smearNoise);

        color = mix(atelierStock, uColorB, (smear * 0.29 + edgeRub * 0.18) * uIntensity);
        color = mix(color, uAccent, (contours * centreReserve * 0.13 + gesture * 0.19) * uIntensity);

      // atelier-5 · Gilded palimpsest
      } else if (atlasVariant < 5.5) {
        vec2 scriptPoint = rotate2d(-0.11 + seedAngle * 0.025) * q;
        float fadedBlockA = softEllipse(p, vec2(-aspect * 0.2, 0.16) + seedOffset * 0.05, vec2(max(0.2, aspect * 0.24), 0.3), 0.46);
        float fadedBlockB = softEllipse(p, vec2(aspect * 0.25, -0.22) - seedOffset * 0.04, vec2(max(0.17, aspect * 0.2), 0.24), 0.52);
        float scriptBand = gridLine(scriptPoint.y + seedOffset.y * 0.025, 15.0, 0.004);
        float scriptKeep = step(0.44, valueNoise(vec2(floor((scriptPoint.x + 1.2) * 9.0), floor((scriptPoint.y + 1.0) * 15.0)) + variationKey));
        float script = scriptBand * scriptKeep * (1.0 - smoothstep(0.38, 0.78, abs(scriptPoint.x)));
        vec2 arcPoint = p - vec2(aspect * 0.18, 0.04) - pigmentDrift * 0.018;
        float arc = 1.0 - smoothstep(0.02, 0.055, abs(length(arcPoint / vec2(max(0.24, aspect * 0.35), 0.42)) - 1.0));
        arc *= smoothstep(-0.38, 0.34, arcPoint.x);

        color = mix(atelierStock, uColorB, (fadedBlockA * 0.29 + fadedBlockB * 0.19) * uIntensity);
        color = mix(color, uAccent, (script * 0.12 + arc * 0.17) * uIntensity);

      // atelier-6 · Indigo botanical
      } else if (atlasVariant < 6.5) {
        vec2 botanicalPoint = q + vec2(pigmentDrift.x * 0.045, 0.0);
        float nightWash = fbm(botanicalPoint * 1.8 + variationKey * 0.23 + pigmentDriftTwo * 0.09);
        float stemX = sin(botanicalPoint.y * 2.8 + seedAngle) * 0.09;
        float stem = 1.0 - smoothstep(0.007, 0.026, abs(botanicalPoint.x - stemX));
        float leaves = 0.0;
        float veins = 0.0;
        for (int leafIndex = 0; leafIndex < 6; leafIndex += 1) {
          float fi = float(leafIndex);
          float leafY = -0.42 + fi * 0.17;
          float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
          vec2 leafCentre = vec2(sin(leafY * 2.8 + seedAngle) * 0.09 + side * (0.09 + fi * 0.006), leafY);
          vec2 leafPoint = rotate2d(side * (0.62 - fi * 0.035)) * (botanicalPoint - leafCentre);
          leaves = max(leaves, softEllipse(leafPoint, vec2(0.0), vec2(0.105, 0.035), 0.26));
          veins = max(veins, (1.0 - smoothstep(0.003, 0.012, abs(leafPoint.y))) * (1.0 - smoothstep(0.02, 0.1, abs(leafPoint.x))));
        }
        float bloom = softRing(botanicalPoint, vec2(stemX, 0.43), vec2(0.11, 0.09), 0.12, 0.18);

        color = mix(atelierStock, uColorB, smoothstep(0.34, 0.76, nightWash) * 0.28 * uIntensity);
        color = mix(color, uAccent, (stem * 0.14 + leaves * 0.1 + veins * 0.15 + bloom * 0.08) * uIntensity);

      // atelier-7 · Oxide gesture
      } else {
        vec2 gesturePoint = rotate2d(-0.38 + seedAngle * 0.04) * (q + pigmentDrift * 0.03);
        float brushNoise = fbm(vec2(gesturePoint.x * 2.2, gesturePoint.y * 7.0) + variationKey * 0.21);
        float strokeA = softBand(gesturePoint.y, -0.18 + sin(gesturePoint.x * 1.7 + seedAngle) * 0.06, 0.055, 0.14);
        float strokeB = softBand(gesturePoint.y, 0.04 + sin(gesturePoint.x * 2.1 + 1.9) * 0.045, 0.035, 0.11);
        float strokeC = softBand(gesturePoint.y, 0.23 + sin(gesturePoint.x * 2.8 + 3.1) * 0.03, 0.022, 0.08);
        float dryMask = smoothstep(0.3, 0.72, brushNoise);
        vec2 orbitPoint = p - seedOffset * 0.08 - pigmentDriftTwo * 0.018;
        float orbit = 1.0 - smoothstep(0.016, 0.052, abs(length(orbitPoint / vec2(max(0.26, aspect * 0.34), 0.39)) - 1.0));
        float dripColumn = 1.0 - smoothstep(0.47, 0.5, abs(fract((p.x + seedOffset.x) * 19.0) - 0.5));
        float dripKeep = step(0.9, hash12(vec2(floor((p.x + seedOffset.x) * 19.0), variation + 73.0)));
        float drips = dripColumn * dripKeep * smoothstep(-0.42, 0.26, p.y);
        float oxideVeilA = softEllipse(
          p,
          vec2(-aspect * 0.38, 0.24) + seedOffset * 0.035 + pigmentDrift * 0.015,
          vec2(max(0.2, aspect * 0.4), 0.25),
          0.72
        );
        float oxideVeilB = softEllipse(
          p,
          vec2(aspect * 0.42, -0.3) - seedOffset * 0.025,
          vec2(max(0.17, aspect * 0.31), 0.2),
          0.74
        );

        color = mix(atelierStock, uColorB, (oxideVeilA * 0.15 + oxideVeilB * 0.1) * uIntensity);
        color = mix(color, uColorB, (strokeA * 0.42 + strokeB * 0.31 + strokeC * 0.21) * dryMask * uIntensity);
        color = mix(color, uAccent, (orbit * 0.16 + drips * 0.11) * uIntensity);
      }
    }
`;
