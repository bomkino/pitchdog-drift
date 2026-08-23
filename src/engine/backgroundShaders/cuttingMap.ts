export const cuttingMapBackgroundBranch = /* glsl */ `
    } else if (uMode < 5.5) {
      vec3 mapBase = mix(uColorA, uColorB, smoothstep(-0.9, 0.9, q.y) * 0.24);

      // cutting-map-0 · Contour notes
      if (atlasVariant < 0.5) {
        float terrain = fbm(q * 1.55 + closedDrift * 0.055);
        float contourCell = abs(fract((terrain + q.y * 0.16) * 11.0) - 0.5);
        float contours = 1.0 - smoothstep(0.455, 0.5, contourCell);
        float quietCentre = smoothstep(0.12, 0.5, abs(q.x)) + smoothstep(0.16, 0.64, abs(q.y));
        color = mapBase;
        color = mix(color, uAccent, contours * min(1.0, quietCentre) * 0.14 * uIntensity);
      // cutting-map-1 · Folded atlas
      } else if (atlasVariant < 1.5) {
        vec2 foldUv = rotate2d(seedAngle * 0.08) * q;
        float spine = 1.0 - smoothstep(0.0, 0.065, abs(foldUv.x + closedDrift.x * 0.025));
        float crease = 1.0 - smoothstep(0.0, 0.18, abs(foldUv.y - 0.1));
        float region = smoothstep(-0.08, 0.08, foldUv.x + sin(foldUv.y * 3.1) * 0.045);
        color = mix(mapBase, uColorB, region * 0.22 * uIntensity);
        color = mix(color, uAccent, (spine * 0.16 + crease * 0.055) * uIntensity);
      // cutting-map-2 · Route thread
      } else if (atlasVariant < 2.5) {
        float routeY = sin(q.x * 2.35 + seedAngle) * 0.16 + sin(q.x * 5.1 - uPhase) * 0.025;
        float route = 1.0 - smoothstep(0.012, 0.035, abs(q.y - routeY));
        float localA = gridLine(q.x + seedOffset.x * 0.04, 4.0, 0.012);
        float localB = gridLine(q.y + seedOffset.y * 0.04, 5.0, 0.01);
        color = mapBase;
        color = mix(color, uColorB, max(localA, localB) * 0.065 * uIntensity);
        color = mix(color, uAccent, route * 0.24 * uIntensity);
      // cutting-map-3 · Parcel lines
      } else if (atlasVariant < 3.5) {
        vec2 parcels = q + vec2(sin(q.y * 2.2), sin(q.x * 1.8)) * 0.045 + closedDrift * 0.02;
        float rules = max(gridLine(parcels.x, 3.0, 0.014), gridLine(parcels.y, 4.0, 0.012));
        float subdivision = max(gridLine(parcels.x + 0.08, 7.0, 0.006), gridLine(parcels.y - 0.05, 9.0, 0.005));
        color = mapBase;
        color = mix(color, uAccent, (rules * 0.13 + subdivision * 0.045) * uIntensity);
      // cutting-map-4 · Registration field
      } else if (atlasVariant < 4.5) {
        vec2 registerCell = fract((q + seedOffset * 0.05) * 3.2) - 0.5;
        float horizontal = softBand(registerCell.y, 0.0, 0.009, 0.018) * (1.0 - smoothstep(0.1, 0.34, abs(registerCell.x)));
        float vertical = softBand(registerCell.x, 0.0, 0.009, 0.018) * (1.0 - smoothstep(0.1, 0.34, abs(registerCell.y)));
        float crosses = max(horizontal, vertical);
        float trim = max(softBand(abs(p.x), aspect * 0.42, 0.008, 0.018), softBand(abs(p.y), 0.42, 0.008, 0.018));
        color = mapBase;
        color = mix(color, uAccent, (crosses * 0.13 + trim * 0.08) * uIntensity);
      // cutting-map-5 · Coastline proof
      } else if (atlasVariant < 5.5) {
        float erosion = fbm(vec2(q.y * 1.8, q.x * 1.2) + closedDriftTwo * 0.05) - 0.5;
        float coastCoordinate = q.x + erosion * 0.32 + sin(q.y * 2.0 + seedAngle) * 0.08;
        float coast = 1.0 - smoothstep(0.012, 0.045, abs(coastCoordinate));
        float shelfA = 1.0 - smoothstep(0.012, 0.038, abs(coastCoordinate - 0.13));
        float shelfB = 1.0 - smoothstep(0.012, 0.038, abs(coastCoordinate - 0.26));
        color = mix(mapBase, uColorB, smoothstep(-0.1, 0.12, coastCoordinate) * 0.2 * uIntensity);
        color = mix(color, uAccent, (coast * 0.2 + shelfA * 0.065 + shelfB * 0.04) * uIntensity);
      // cutting-map-6 · Crop window
      } else if (atlasVariant < 6.5) {
        vec2 windowCenter = seedOffset * 0.12 + closedDrift * 0.018;
        vec2 crop = abs(p - windowCenter) - vec2(min(0.42, aspect * 0.34), 0.32);
        float horizontal = (1.0 - smoothstep(0.0, 0.018, abs(crop.y))) * (1.0 - smoothstep(0.04, 0.16, abs(crop.x)));
        float vertical = (1.0 - smoothstep(0.0, 0.018, abs(crop.x))) * (1.0 - smoothstep(0.04, 0.16, abs(crop.y)));
        float proof = softEllipse(p, windowCenter, vec2(max(0.28, aspect * 0.32), 0.44), 0.38);
        color = mix(mapBase, uColorB, proof * 0.12 * uIntensity);
        color = mix(color, uAccent, max(horizontal, vertical) * 0.19 * uIntensity);
      // cutting-map-7 · Survey drift
      } else {
        vec2 surveyPoint = q + closedDrift * 0.035;
        float bearing = atan(surveyPoint.y, surveyPoint.x) + seedAngle;
        float radius = length(surveyPoint);
        float arcs = 1.0 - smoothstep(0.012, 0.04, abs(fract(radius * 4.4) - 0.5));
        float spokes = pow(abs(cos(bearing * 6.0)), 28.0) * (1.0 - smoothstep(0.12, 0.92, radius));
        color = mapBase;
        color = mix(color, uAccent, (arcs * 0.1 + spokes * 0.12) * uIntensity);
      }

`;
