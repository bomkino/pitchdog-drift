export const slideVertexShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vWarp;
  varying float vSurfaceEnergy;
  varying vec3 vViewPosition;

  uniform vec2 uSizePx;
  uniform float uVelocity;
  uniform float uAcceleration;
  uniform float uDistortion;
  uniform float uAxis;
  uniform float uPhase;
  uniform float uSurface;
  uniform float uSlideSeed;
  uniform float uTravelPhase;
  uniform float uPathBend;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float along = uAxis < 0.5 ? uv.x - 0.5 : uv.y - 0.5;
    float across = uAxis < 0.5 ? uv.y - 0.5 : uv.x - 0.5;
    float velocity = clamp(uVelocity, -1.0, 1.0);
    float acceleration = clamp(uAcceleration, -1.0, 1.0);
    float direction = abs(acceleration) > 0.025 ? sign(acceleration) : sign(velocity + 0.0001);
    float envelope = sin(uv.x * 3.14159265) * sin(uv.y * 3.14159265);
    float phase = uTravelPhase + fract(uSlideSeed) * 6.28318530718 + uPhase * 0.0001;
    float materialScale = clamp(min(uSizePx.x, uSizePx.y), 96.0, 4096.0);
    float energy = clamp(abs(velocity) * 0.34 + abs(acceleration) * 0.78 + clamp(uPathBend, 0.0, 1.0) * 0.26, 0.0, 1.0) * clamp(uDistortion, 0.0, 1.0);
    float warp = 0.0;
    float shear = 0.0;

    if (uSurface < 0.5) {
      float cardEnergy = energy * (0.16 + abs(acceleration) * 0.42);
      warp = ((1.0 - across * across * 4.0) * (1.0 - along * along * 3.4) * 0.027
        + across * along * direction * 0.046) * materialScale * cardEnergy;
      shear = across * direction * cardEnergy * 0.0035;
    } else if (uSurface < 1.5) {
      float curl = direction * along * abs(along) * (0.08 + abs(acceleration) * 0.072) * materialScale;
      float buckle = sin(along * 7.2 + phase + across * 1.6) * envelope * materialScale * 0.038;
      float pathCurl = along * along * clamp(uPathBend, 0.0, 1.0) * materialScale * 0.059;
      warp = (curl + buckle + pathCurl) * energy * (0.7 + sin(uv.y * 3.14159265) * 0.3);
      shear = sin(across * 4.0 + phase) * envelope * energy * 0.006;
    } else if (uSurface < 2.5) {
      float foldA = sin(along * 8.8 - phase + across * 2.4);
      float foldB = sin(along * 4.1 + phase * 1.7 - across * 6.4) * 0.46;
      float diagonal = sin((along + across) * 5.2 - phase * 0.62) * 0.24;
      warp = (foldA + foldB + diagonal) * envelope * energy * materialScale * 0.103;
      shear = (foldB + diagonal) * envelope * energy * 0.011;
    } else {
      vec2 gelPoint = vec2(along - direction * abs(acceleration) * 0.08, across);
      float radius = length(vec2(gelPoint.x * 1.16, gelPoint.y));
      float bulge = cos(radius * 7.0 - phase) * (1.0 - smoothstep(0.0, 0.72, radius));
      float lag = (acceleration * along * 0.072 + velocity * along * 0.025) * materialScale;
      warp = (bulge * materialScale * 0.089 + lag + clamp(uPathBend, 0.0, 1.0) * materialScale * 0.034) * energy * envelope;
      shear = (acceleration * across * 0.009 + velocity * across * 0.004) * energy;
    }

    float edgeConstraint = smoothstep(0.0, 0.18, sin(uv.x * 3.14159265))
      * smoothstep(0.0, 0.18, sin(uv.y * 3.14159265));
    warp *= edgeConstraint;
    shear *= edgeConstraint;
    if (uAxis > 0.5) transformed.x += shear;
    else transformed.y += shear;
    transformed.z += warp;
    vWarp = warp;
    vSurfaceEnergy = energy;
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const slideFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWarp;
  varying float vSurfaceEnergy;
  varying vec3 vViewPosition;

  uniform sampler2D uMap;
  uniform float uTextureAspect;
  uniform float uPlaneAspect;
  uniform float uFit;
  uniform vec2 uFocal;
  uniform vec2 uSizePx;
  uniform float uRadiusPx;
  uniform float uSmoothing;
  uniform float uBorderPx;
  uniform vec3 uBorderColor;
  uniform float uBorderOpacity;
  uniform float uLegacyContainMatte;
  uniform vec3 uMatteColor;
  uniform float uMatteOpacity;
  uniform float uOpacity;
  uniform float uVelocity;
  uniform float uDistortion;
  uniform float uAxis;
  uniform float uSurface;
  uniform float uSlideSeed;
  uniform float uRoughness;
  uniform float uSheen;
  uniform float uMicrotexture;
  uniform float uLightingEnabled;
  uniform vec3 uKeyColor;
  uniform vec3 uFillColor;
  uniform vec3 uLightDirection;
  uniform float uKeyIntensity;
  uniform float uFillIntensity;
  uniform float uRimIntensity;
  uniform float uArtworkProtection;

  float materialHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031 + uSlideSeed * 0.013);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float roundedSuperellipseDistance(vec2 p, vec2 halfSize, float radius, float smoothing) {
    if (radius < 0.5) {
      vec2 q = abs(p) - halfSize;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    }
    radius = min(radius, min(halfSize.x, halfSize.y));
    vec2 q = abs(p) - (halfSize - vec2(radius));
    vec2 outside = max(q, 0.0);
    float exponent = mix(2.0, 5.5, clamp(smoothing, 0.0, 1.0));
    float lp = pow(pow(outside.x, exponent) + pow(outside.y, exponent), 1.0 / exponent);
    return lp + min(max(q.x, q.y), 0.0) - radius;
  }

  vec2 coverUv(vec2 uv, float planeAspect, float imageAspect, vec2 focal) {
    vec2 scale = vec2(1.0);
    if (imageAspect > planeAspect) scale.x = planeAspect / imageAspect;
    else scale.y = imageAspect / planeAspect;
    // A covered image samples only a sub-rectangle of the source. Move that
    // rectangle through the complete crop slack so 0/1 can reach either edge.
    // Texture UV origin is bottom-left; the director's Y origin is top-left.
    vec2 objectPosition = clamp(vec2(focal.x, 1.0 - focal.y), 0.0, 1.0);
    return uv * scale + objectPosition * (1.0 - scale);
  }

  vec2 containUv(vec2 uv, float planeAspect, float imageAspect, vec2 focal) {
    vec2 scale = vec2(1.0);
    // scale is the fraction of the plane occupied by the contained image.
    // Divide by that fraction so the unused axis lands outside 0..1 and can
    // become a letterbox. Focal position aligns the intact image within that
    // free space, matching object-position semantics without cropping it.
    if (imageAspect > planeAspect) scale.y = planeAspect / imageAspect;
    else scale.x = imageAspect / planeAspect;
    vec2 objectPosition = clamp(vec2(focal.x, 1.0 - focal.y), 0.0, 1.0);
    vec2 origin = objectPosition * (1.0 - scale);
    return (uv - origin) / max(scale, vec2(0.0001));
  }

  void main() {
    vec2 pixel = (vUv - 0.5) * uSizePx;
    float distanceToEdge = roundedSuperellipseDistance(pixel, uSizePx * 0.5, uRadiusPx, uSmoothing);
    float feather = max(fwidth(distanceToEdge), 0.72);
    float outerMask = 1.0 - smoothstep(-feather, feather, distanceToEdge);
    float innerMask = 1.0 - smoothstep(-feather, feather, distanceToEdge + max(0.0, uBorderPx));
    float borderMask = max(0.0, outerMask - innerMask);

    vec2 textureUv = uFit < 0.5
      ? coverUv(vUv, uPlaneAspect, uTextureAspect, uFocal)
      : containUv(vUv, uPlaneAspect, uTextureAspect, uFocal);

    vec2 flowAxis = uAxis < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    float optical = clamp(uVelocity, -1.0, 1.0) * uDistortion;
    textureUv += flowAxis * sin((uAxis < 0.5 ? vUv.y : vUv.x) * 3.14159265) * optical * 0.022;
    bool outsideTexture = textureUv.x < 0.0 || textureUv.x > 1.0 || textureUv.y < 0.0 || textureUv.y > 1.0;
    vec4 sampled = texture2D(uMap, clamp(textureUv, 0.0, 1.0));
    if (uFit > 0.5 && outsideTexture) {
      if (uLegacyContainMatte > 0.5) {
        sampled.rgb *= 0.2;
        sampled.a = 1.0;
      } else {
        sampled = vec4(uMatteColor, uMatteOpacity);
      }
    }

    // Imported artwork stays proof-safe. Motion may bend its geometry, but
    // atmospheric texture belongs to the surrounding world, never its pixels.
    sampled.rgb += abs(vWarp) * 0.025;
    vec3 faceNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    if (!gl_FrontFacing) faceNormal *= -1.0;
    vec3 lightDirection = normalize(uLightDirection);
    float key = max(0.0, dot(faceNormal, lightDirection));
    float fill = 0.42 + 0.58 * max(0.0, dot(faceNormal, -lightDirection));
    float rim = pow(1.0 - max(0.0, dot(faceNormal, vec3(0.0, 0.0, 1.0))), mix(5.0, 1.6, clamp(uSheen, 0.0, 1.0)));
    vec3 lit = sampled.rgb
      * (vec3(0.72) + uFillColor * fill * uFillIntensity * 0.28)
      + uKeyColor * key * uKeyIntensity * (0.05 + uSheen * 0.12)
      + uKeyColor * rim * uRimIntensity * (0.025 + (1.0 - uRoughness) * 0.08);
    float lightAuthority = uLightingEnabled * (1.0 - clamp(uArtworkProtection, 0.0, 1.0));
    sampled.rgb = mix(sampled.rgb, lit, lightAuthority);
    float tooth = materialHash(floor(vUv * uSizePx / mix(5.0, 1.5, uSurface / 3.0))) - 0.5;
    sampled.rgb += tooth * uMicrotexture * 0.022 * (0.35 + vSurfaceEnergy * 0.65);
    float borderAlpha = borderMask * uBorderOpacity;
    float combinedAlpha = borderAlpha + sampled.a * (1.0 - borderAlpha);
    vec3 combinedPremultiplied = uBorderColor * borderAlpha + sampled.rgb * sampled.a * (1.0 - borderAlpha);
    vec3 color = combinedPremultiplied / max(combinedAlpha, 0.0001);
    float alpha = outerMask * combinedAlpha * uOpacity;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(color, alpha);
    // ShaderMaterial does not append Three's output transfer automatically.
    // Everything above is linear; encode once for the renderer's sRGB target.
    #include <colorspace_fragment>
  }
`;

export const shadowVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const shadowFragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform vec2 uCanvasSizePx;
  uniform vec2 uCardSizePx;
  uniform float uRadiusPx;
  uniform float uSmoothing;
  uniform float uSoftnessPx;
  uniform float uOpacity;
  uniform vec3 uColor;

  float shapeDistance(vec2 p, vec2 halfSize, float radius, float smoothing) {
    radius = max(0.5, min(radius, min(halfSize.x, halfSize.y)));
    vec2 q = abs(p) - (halfSize - vec2(radius));
    vec2 outside = max(q, 0.0);
    float exponent = mix(2.0, 5.5, clamp(smoothing, 0.0, 1.0));
    float lp = pow(pow(outside.x, exponent) + pow(outside.y, exponent), 1.0 / exponent);
    return lp + min(max(q.x, q.y), 0.0) - radius;
  }

  void main() {
    // The plane includes room for blur, but the caster is always the original
    // card. Treating the expanded plane as the caster creates a dark glass box.
    vec2 pixel = (vUv - 0.5) * uCanvasSizePx;
    float distanceToEdge = shapeDistance(pixel, uCardSizePx * 0.5, uRadiusPx, uSmoothing);
    float sigma = max(1.0, uSoftnessPx * 0.34);
    float outside = max(0.0, distanceToEdge);
    float alpha = exp(-0.5 * outside * outside / (sigma * sigma)) * uOpacity;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

export const backgroundVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const backgroundFragmentShaderLegacy = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uResolution;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uAccent;
  uniform float uMode;
  uniform float uIntensity;
  uniform float uMotion;
  uniform float uGrain;
  uniform float uGrainFrame;
  uniform float uVignette;
  uniform float uPhase;
  uniform float uSeed;
  uniform float uOpacity;

  float hash12(vec2 p) {
    // uSeed arrives folded into a small, exactly representable float range.
    // Use it as a coordinate shift; adding a large seed inside the hash dot
    // destroys fractional entropy under float32 precision.
    vec2 seedShift = vec2(uSeed * 0.754877666, uSeed * 0.569840296);
    vec2 seeded = p + seedShift;
    vec3 p3 = fract(vec3(seeded.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p, float frame) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 ease = local * local * (3.0 - 2.0 * local);
    vec2 frameOffset = vec2(frame * 19.19, frame * 73.73);
    float a = hash12(cell + frameOffset);
    float b = hash12(cell + vec2(1.0, 0.0) + frameOffset);
    float c = hash12(cell + vec2(0.0, 1.0) + frameOffset);
    float d = hash12(cell + vec2(1.0, 1.0) + frameOffset);
    return mix(mix(a, b, ease.x), mix(c, d, ease.x), ease.y);
  }

  float filmGrain(vec2 pixel, float frame) {
    // Two restrained, monochrome scales avoid single-pixel TV static. The
    // larger layer supplies organic clumps; the fine layer keeps the result crisp.
    float fine = valueNoise(pixel / 1.35, frame);
    float clump = valueNoise(pixel / 3.4 + 41.0, frame + 17.0);
    return ((fine - 0.5) * 0.76 + (clump - 0.5) * 0.24) * 2.0;
  }

  float softBlob(vec2 uv, vec2 center, float radius) {
    return 1.0 - smoothstep(0.0, radius, length(uv - center));
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    p.x *= uResolution.x / max(1.0, uResolution.y);
    float wave = sin(uPhase) * uMotion;
    vec3 color = uColorA;

    if (uMode < 0.5) {
      color = uColorA;
    } else if (uMode < 1.5) {
      float gradient = smoothstep(-0.65, 0.72, p.y + p.x * 0.42 + wave * 0.08);
      color = mix(uColorA, uColorB, gradient);
      color = mix(color, uAccent, softBlob(p, vec2(0.35 + cos(uPhase) * 0.08, -0.3), 0.7) * 0.32 * uIntensity);
    } else if (uMode < 2.5) {
      vec2 centerA = vec2(cos(uPhase) * 0.34, sin(uPhase * 1.0) * 0.22);
      vec2 centerB = vec2(cos(uPhase + 2.1) * 0.42, sin(uPhase + 1.4) * 0.3);
      float a = softBlob(p, centerA, 0.72);
      float b = softBlob(p, centerB, 0.62);
      color = mix(uColorA, uColorB, a * 0.72 * uIntensity);
      color = mix(color, uAccent, b * 0.48 * uIntensity);
    } else if (uMode < 3.5) {
      // Long fibres belong to the room, so they stay seeded and spatially
      // stable. Only the broad exposure breath moves; grain remains a separate
      // finishing plate. This avoids moire and crawling-paper cosplay.
      float longFiber = valueNoise(vec2(p.x * 3.2, p.y * 118.0) + 17.0, 0.0);
      float crossTooth = valueNoise(vec2(p.x * 46.0, p.y * 7.0) + 53.0, 0.0);
      float paperCloud = valueNoise(p * 3.4 + 91.0, 0.0);
      float exposure = smoothstep(-0.58, 0.72, p.y + p.x * 0.08);
      float breathingWash = softBlob(
        p,
        vec2(-0.22 + cos(uPhase) * 0.06, 0.16 + sin(uPhase * 0.73) * 0.04),
        0.82
      );
      color = mix(uColorA, uColorB, exposure * 0.54 + paperCloud * 0.08 * uIntensity);
      color = mix(color, uAccent, breathingWash * 0.035 * uIntensity);
      color *= 1.0
        + (longFiber - 0.5) * 0.024 * uIntensity
        + (crossTooth - 0.5) * 0.009 * uIntensity;
    } else {
      float slit = exp(-abs(p.x + sin(p.y * 2.4 + uPhase) * 0.08) * 8.0);
      float pulse = 0.82 + 0.18 * sin(uPhase);
      color = mix(uColorA, uColorB, smoothstep(-0.4, 0.5, p.y) * 0.36);
      color = mix(color, uAccent, slit * pulse * 0.28 * uIntensity);
    }

    float vignette = smoothstep(0.88, 0.18, dot(p, p));
    color *= mix(1.0 - uVignette * 0.62, 1.0, vignette);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>

    // Calibrate the finishing plate in display space, where it survives 8-bit
    // export even in Drift's dark worlds. The toe preserves true black; the
    // saturating amount keeps a 60% control setting expressive, never snowy.
    float displayLuminance = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float grainControl = clamp(uGrain, 0.0, 0.6);
    float grainAmount = 0.035 * (1.0 - exp(-8.0 * grainControl)) / (1.0 - exp(-4.8));
    float grainToe = smoothstep(0.004, 0.040, displayLuminance);
    float grainResponse = mix(1.0, 1.0 - sqrt(clamp(displayLuminance, 0.0, 1.0)), 0.75);
    float grain = filmGrain(vUv * uResolution, uGrainFrame) * grainAmount * grainResponse * grainToe;
    gl_FragColor.rgb = clamp(gl_FragColor.rgb + vec3(grain), 0.0, 1.0);
    gl_FragColor.a = clamp(uOpacity, 0.0, 1.0);
    if (gl_FragColor.a <= 0.001) discard;
  }
`;

export { backgroundFragmentShader } from "./backgroundShader";
