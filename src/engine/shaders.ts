export const slideVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWarp;

  uniform float uVelocity;
  uniform float uDistortion;
  uniform float uAxis;
  uniform float uPhase;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float along = uAxis < 0.5 ? uv.x - 0.5 : uv.y - 0.5;
    float across = uAxis < 0.5 ? uv.y - 0.5 : uv.x - 0.5;
    float velocity = clamp(uVelocity, -1.0, 1.0);
    float envelope = sin(uv.x * 3.14159265) * sin(uv.y * 3.14159265);
    float warp = sin(along * 3.14159265 + uPhase * 0.15) * envelope * velocity * uDistortion;
    transformed.z += warp * 72.0;
    transformed.z += across * velocity * uDistortion * 18.0;
    vWarp = warp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

export const slideFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWarp;

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
  uniform float uOpacity;
  uniform float uVelocity;
  uniform float uDistortion;
  uniform float uAxis;
  uniform float uTime;

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

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
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
      sampled.rgb *= 0.2;
      sampled.a = 1.0;
    }

    float grain = (hash12(gl_FragCoord.xy + fract(uTime) * 113.0) - 0.5) * 0.018;
    sampled.rgb += grain + abs(vWarp) * 0.025;
    vec3 color = mix(sampled.rgb, uBorderColor, borderMask * uBorderOpacity);
    float alpha = outerMask * sampled.a * uOpacity;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(color, alpha);
    // ShaderMaterial does not append Three's output transfer automatically.
    // Everything above is linear; encode once for the active renderer target.
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
  uniform vec2 uSizePx;
  uniform float uRadiusPx;
  uniform float uSmoothing;
  uniform float uSoftnessPx;
  uniform float uOpacity;

  float shapeDistance(vec2 p, vec2 halfSize, float radius, float smoothing) {
    radius = max(0.5, min(radius, min(halfSize.x, halfSize.y)));
    vec2 q = abs(p) - (halfSize - vec2(radius));
    vec2 outside = max(q, 0.0);
    float exponent = mix(2.0, 5.5, clamp(smoothing, 0.0, 1.0));
    float lp = pow(pow(outside.x, exponent) + pow(outside.y, exponent), 1.0 / exponent);
    return lp + min(max(q.x, q.y), 0.0) - radius;
  }

  void main() {
    vec2 pixel = (vUv - 0.5) * uSizePx;
    float distanceToEdge = shapeDistance(pixel, uSizePx * 0.5, uRadiusPx, uSmoothing);
    float blur = max(1.0, uSoftnessPx);
    float alpha = (1.0 - smoothstep(-blur * 0.36, blur, distanceToEdge)) * uOpacity;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
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

export const backgroundFragmentShader = /* glsl */ `
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
  uniform float uVignette;
  uniform float uScale;
  uniform float uSoftness;
  uniform float uComplexity;
  uniform float uParallax;
  uniform float uPhase;
  uniform float uSeed;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33 + uSeed * 0.0137);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(cell);
    float b = hash12(cell + vec2(1.0, 0.0));
    float c = hash12(cell + vec2(0.0, 1.0));
    float d = hash12(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 rotation = mat2(0.82, -0.57, 0.57, 0.82);
    for (int octave = 0; octave < 5; octave += 1) {
      value += amplitude * valueNoise(p);
      p = rotation * p * mix(1.86, 2.18, uComplexity) + 13.7;
      amplitude *= mix(0.42, 0.56, uComplexity);
    }
    return value;
  }

  float softBlob(vec2 uv, vec2 center, float radius) {
    float feather = mix(0.018, radius * 0.72, uSoftness);
    return 1.0 - smoothstep(max(0.0, radius - feather), radius, length(uv - center));
  }

  float lineGlow(float distanceToLine, float width) {
    return exp(-abs(distanceToLine) / max(0.0001, width));
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    p.x *= uResolution.x / max(1.0, uResolution.y);
    p /= max(0.25, uScale);
    vec2 orbit = vec2(cos(uPhase), sin(uPhase));
    vec2 orbit2 = vec2(cos(uPhase * 2.0 + 1.3), sin(uPhase * 2.0 + 1.3));
    vec2 drift = mix(orbit, orbit2, 0.34) * uMotion * uParallax * 0.16;
    vec2 q = p + drift;
    float wave = sin(uPhase) * uMotion;
    vec3 color = uColorA;

    if (uMode < 0.5) {
      color = uColorA;
    } else if (uMode < 1.5) {
      float gradient = smoothstep(-0.65, 0.72, p.y + p.x * 0.42 + wave * 0.08);
      color = mix(uColorA, uColorB, gradient);
      color = mix(color, uAccent, softBlob(p, vec2(0.35 + cos(uPhase) * 0.08, -0.3), 0.7) * 0.32 * uIntensity);
    } else if (uMode < 2.5) {
      vec2 centerA = vec2(cos(uPhase) * 0.34, sin(uPhase) * 0.22);
      vec2 centerB = vec2(cos(uPhase + 2.1) * 0.42, sin(uPhase + 1.4) * 0.3);
      float a = softBlob(p, centerA, 0.72);
      float b = softBlob(p, centerB, 0.62);
      float haze = fbm(q * 1.7 + 3.0) * uComplexity;
      color = mix(uColorA, uColorB, clamp(a * 0.72 + haze * 0.12, 0.0, 1.0) * uIntensity);
      color = mix(color, uAccent, b * 0.48 * uIntensity);
    } else if (uMode < 3.5) {
      float fibers = sin((p.y + sin(p.x * 19.0) * 0.015) * 620.0) * 0.5 + 0.5;
      float tooth = fbm(q * 8.0) - 0.5;
      color = mix(uColorA, uColorB, smoothstep(-0.45, 0.65, p.y));
      color += (fibers - 0.5) * 0.018 * uIntensity + tooth * 0.035 * uComplexity;
    } else if (uMode < 4.5) {
      float slit = exp(-abs(p.x + sin(p.y * 2.4 + uPhase) * 0.08) * 8.0);
      float pulse = 0.82 + 0.18 * sin(uPhase);
      float shadowCloud = fbm(q * 2.2 + vec2(0.0, orbit2.y * 0.48));
      color = mix(uColorA, uColorB, smoothstep(-0.4, 0.5, p.y) * 0.36);
      color *= mix(0.7, 1.08, shadowCloud);
      color = mix(color, uAccent, slit * pulse * 0.28 * uIntensity);
    } else if (uMode < 5.5) {
      float horizon = p.y + 0.12 + sin(p.x * 2.6 + uPhase) * 0.025 * uMotion;
      float sky = smoothstep(-0.42, 0.48, horizon);
      color = mix(uColorB, uColorA, sky);
      float band = lineGlow(horizon, mix(0.025, 0.13, uSoftness));
      vec2 sunCenter = vec2(0.26 + orbit.x * 0.08, 0.08 + orbit.y * 0.035);
      float sun = softBlob(p, sunCenter, 0.22);
      float heat = (fbm(vec2(p.x * 3.0, p.y * 12.0 + orbit2.y * 0.82)) - 0.5) * 0.14 * uComplexity;
      color = mix(color, uAccent, clamp(band * 0.56 + sun * 0.74 + heat * band, 0.0, 1.0) * uIntensity);
    } else if (uMode < 6.5) {
      float fogA = fbm(q * vec2(1.35, 2.8) + orbit * 0.34);
      float fogB = fbm(q * vec2(2.4, 1.2) - orbit2 * 0.22);
      float fog = smoothstep(mix(0.26, 0.58, uSoftness), 0.92, mix(fogA, fogB, 0.44));
      float lift = smoothstep(-0.72, 0.6, p.y);
      color = mix(uColorA, uColorB, lift * 0.54 + fog * 0.28 * uIntensity);
      color = mix(color, uAccent, fog * 0.34 * uIntensity);
    } else if (uMode < 7.5) {
      float angle = atan(p.y, p.x);
      float radius = length(p);
      float spectral = sin(angle * mix(2.0, 5.0, uComplexity) + radius * 8.0 - uPhase);
      float pane = 1.0 - smoothstep(0.0, 0.16, abs(sin((p.x + p.y * 0.62) * 2.8 + spectral * 0.18)));
      float caustic = pow(max(0.0, 1.0 - abs(spectral)), mix(3.0, 9.0, 1.0 - uSoftness));
      color = mix(uColorA, uColorB, smoothstep(-0.52, 0.58, p.y + spectral * 0.08));
      color = mix(color, uAccent, clamp(caustic * 0.58 + pane * 0.18, 0.0, 1.0) * uIntensity);
    } else if (uMode < 8.5) {
      float foldNoise = (fbm(q * 1.8) - 0.5) * 1.2 * uComplexity;
      float folds = sin((p.x + foldNoise * 0.16) * mix(5.0, 10.0, uComplexity) + uPhase);
      float velvet = pow(0.5 + 0.5 * folds, mix(1.4, 4.0, 1.0 - uSoftness));
      float shade = smoothstep(-0.72, 0.7, p.y + foldNoise * 0.12);
      color = mix(uColorA, uColorB, shade * 0.58 + velvet * 0.22);
      color = mix(color, uAccent, pow(velvet, 5.0) * 0.3 * uIntensity);
    } else if (uMode < 9.5) {
      float clouds = fbm(q * 2.7 + vec2(0.0, orbit.y * 0.34));
      float stains = smoothstep(0.42, 0.82, fbm(q * 7.0 + 17.0));
      vec2 scratchCell = floor((uv + vec2(orbit.x * 0.003, 0.0)) * vec2(180.0, 1.0));
      float scratch = step(0.994, hash12(scratchCell)) * (0.4 + 0.6 * sin(uv.y * 780.0));
      float dust = step(0.987, hash12(floor(uv * uResolution / 7.0 + orbit * 13.0)));
      color = mix(uColorA, uColorB, clouds * 0.56);
      color = mix(color, uAccent, stains * 0.2 * uIntensity);
      color += (scratch * 0.08 + dust * 0.045) * uIntensity;
    } else if (uMode < 10.5) {
      float horizon = p.y + 0.24;
      float road = 1.0 - smoothstep(-0.48, 0.72, horizon);
      color = mix(uColorA, uColorB, smoothstep(-0.64, 0.52, horizon) * 0.5);
      color *= mix(0.62, 1.0, road);
      vec2 streakUv = vec2(p.x * mix(7.0, 14.0, uComplexity) + orbit.x * 3.2, p.y * 28.0 + orbit.y * 1.6);
      vec2 cell = floor(streakUv);
      vec2 local = fract(streakUv) - 0.5;
      float chance = step(0.72, hash12(cell));
      float streak = chance * exp(-abs(local.y) * 18.0) * (1.0 - smoothstep(0.06, 0.5, abs(local.x)));
      float lane = lineGlow(abs(p.x) - 0.2 - max(0.0, -horizon) * 0.18, 0.012) * road;
      color = mix(color, uAccent, clamp(streak * 0.72 + lane * 0.3, 0.0, 1.0) * uIntensity);
    } else if (uMode < 11.5) {
      float swellA = sin((p.y + fbm(q * 1.4) * 0.18) * 11.0 - uPhase);
      float swellB = sin((p.y * 1.6 - p.x * 0.38) * 8.0 + uPhase * 2.0);
      float water = 0.5 + 0.25 * swellA + 0.18 * swellB;
      float caustic = pow(max(0.0, water), mix(2.0, 6.0, 1.0 - uSoftness));
      color = mix(uColorA, uColorB, smoothstep(-0.5, 0.62, p.y) * 0.5 + water * 0.16);
      color = mix(color, uAccent, caustic * 0.24 * uIntensity);
    } else if (uMode < 12.5) {
      float smoke = fbm(q * 2.0 + vec2(0.0, -orbit.y * 0.35));
      float plume = smoothstep(0.34, 0.86, smoke + (0.28 - abs(p.x)) * 0.4);
      vec2 sparkGrid = floor((p + vec2(orbit.x * 0.025, orbit.y * 0.08)) * vec2(18.0, 26.0));
      vec2 sparkLocal = fract((p + vec2(orbit.x * 0.025, orbit.y * 0.08)) * vec2(18.0, 26.0)) - 0.5;
      float sparkChance = step(0.91, hash12(sparkGrid));
      float spark = sparkChance * exp(-dot(sparkLocal, sparkLocal) * 92.0);
      color = mix(uColorA, uColorB, plume * 0.44);
      color = mix(color, uAccent, clamp(plume * 0.24 + spark, 0.0, 1.0) * uIntensity);
    } else {
      float cone = 1.0 - smoothstep(0.0, 0.58, abs(p.x) - (0.08 + (0.56 - p.y) * 0.34));
      cone *= smoothstep(-0.74, 0.46, p.y);
      float flicker = 0.9 + 0.1 * sin(uPhase * 3.0 + sin(uPhase) * 2.0);
      vec2 moteOffset = orbit * vec2(0.012, -0.018);
      vec2 moteGrid = floor((uv + moteOffset) * vec2(42.0, 58.0));
      vec2 moteLocal = fract((uv + moteOffset) * vec2(42.0, 58.0)) - 0.5;
      float mote = step(0.965, hash12(moteGrid)) * exp(-dot(moteLocal, moteLocal) * 130.0);
      float gate = 1.0 - smoothstep(0.12, 0.94, length(p * vec2(0.72, 1.0)));
      color = mix(uColorA, uColorB, gate * 0.36);
      color = mix(color, uAccent, (cone * 0.42 * flicker + mote * 0.5) * uIntensity);
    }

    vec2 vignettePoint = (uv - 0.5) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
    float vignette = 1.0 - smoothstep(0.16, 0.92, dot(vignettePoint, vignettePoint));
    color *= mix(1.0 - uVignette * 0.68, 1.0, vignette);
    float grain = (hash12(gl_FragCoord.xy + vec2(cos(uPhase), sin(uPhase)) * 97.0) - 0.5) * uGrain * 0.16;
    color += grain;
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <colorspace_fragment>
  }
`;

export const opticalVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const opticalFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uScene;
  uniform vec2 uResolution;
  uniform float uPhase;
  uniform float uVelocity;
  uniform float uAxis;
  uniform float uSoftFocus;
  uniform float uEdgeSoftness;
  uniform float uMotionBlur;
  uniform float uChromaticAberration;
  uniform float uBloom;
  uniform float uHalation;
  uniform float uFlare;
  uniform float uBarrelDistortion;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uGateWeave;
  uniform float uBreathing;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec4 sceneSample(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
    return texture2D(uScene, uv);
  }

  float straightLuma(vec4 premultiplied) {
    vec3 straight = premultiplied.rgb / max(0.001, premultiplied.a);
    return dot(straight, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec2 pixel = 1.0 / max(uResolution, vec2(1.0));
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 p = vUv - 0.5;
    p.x *= aspect;
    float radius = length(p);

    float breath = 1.0 + sin(uPhase + 0.4) * uBreathing * 0.007;
    p /= max(0.97, breath);
    p *= 1.0 + uBarrelDistortion * dot(p, p) * 0.18;
    p.x /= aspect;
    vec2 weave = vec2(
      sin(uPhase * 2.0 + 2.4),
      cos(uPhase * 3.0 + 0.7)
    ) * uGateWeave * pixel * 3.2;
    vec2 uv = 0.5 + p + weave;

    vec4 base = sceneSample(uv);
    float edge = smoothstep(0.16, 0.76, radius);
    float glowReach = max(uBloom, uHalation) * 10.0 + uFlare * 2.0;
    float blurRadius = uSoftFocus * 5.5 + uEdgeSoftness * edge * edge * 10.0 + glowReach;
    vec2 blurPixel = pixel * blurRadius;

    vec4 soft = base * 0.28;
    soft += sceneSample(uv + vec2( 0.9239,  0.3827) * blurPixel) * 0.09;
    soft += sceneSample(uv + vec2( 0.3827,  0.9239) * blurPixel) * 0.09;
    soft += sceneSample(uv + vec2(-0.3827,  0.9239) * blurPixel) * 0.09;
    soft += sceneSample(uv + vec2(-0.9239,  0.3827) * blurPixel) * 0.09;
    soft += sceneSample(uv + vec2(-0.9239, -0.3827) * blurPixel) * 0.09;
    soft += sceneSample(uv + vec2(-0.3827, -0.9239) * blurPixel) * 0.09;
    soft += sceneSample(uv + vec2( 0.3827, -0.9239) * blurPixel) * 0.09;
    soft += sceneSample(uv + vec2( 0.9239, -0.3827) * blurPixel) * 0.09;

    float softMix = clamp(uSoftFocus * 0.72 + uEdgeSoftness * edge * 0.84, 0.0, 0.92);
    vec4 color = mix(base, soft, softMix);

    float moving = abs(uVelocity) * uMotionBlur;
    if (moving > 0.001) {
      vec2 flow = uAxis < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      flow *= sign(uVelocity);
      vec2 smear = flow * pixel * (4.0 + moving * 22.0);
      vec4 motion = color * 0.44;
      motion += sceneSample(uv - smear) * 0.12;
      motion += sceneSample(uv - smear * 0.48) * 0.16;
      motion += sceneSample(uv + smear * 0.48) * 0.16;
      motion += sceneSample(uv + smear) * 0.12;
      color = mix(color, motion, clamp(moving * 0.78, 0.0, 0.82));
    }

    if (uChromaticAberration > 0.001) {
      vec2 radial = radius > 0.0001 ? normalize(p) : vec2(0.0);
      vec2 flow = uAxis < 0.5 ? vec2(sign(uVelocity), 0.0) : vec2(0.0, sign(uVelocity));
      vec2 split = (radial * (0.35 + edge * 1.4) + flow * abs(uVelocity) * 0.72)
        * pixel * (1.0 + uChromaticAberration * 10.0) * uChromaticAberration;
      vec4 redTap = sceneSample(uv + split);
      vec4 blueTap = sceneSample(uv - split);
      color.r = mix(color.r, redTap.r, 0.84);
      color.b = mix(color.b, blueTap.b, 0.84);
      color.a = max(color.a, max(redTap.a, blueTap.a) * uChromaticAberration * 0.24);
    }

    float highlight = smoothstep(0.48, 1.04, straightLuma(soft));
    float glowAlpha = soft.a * highlight;
    color.rgb += soft.rgb * highlight * uBloom * 0.46;
    color.a = max(color.a, glowAlpha * uBloom * 0.38);
    color.rgb += soft.rgb * highlight * vec3(1.0, 0.22, 0.08) * uHalation * 0.34;
    color.a = max(color.a, glowAlpha * uHalation * 0.2);

    if (uFlare > 0.001) {
      vec2 flareStep = vec2(pixel.x * (18.0 + uFlare * 46.0), 0.0);
      vec4 flareA = sceneSample(uv - flareStep);
      vec4 flareB = sceneSample(uv + flareStep);
      vec4 flareC = sceneSample(uv - flareStep * 2.2);
      vec4 flareD = sceneSample(uv + flareStep * 2.2);
      vec4 flareField = (flareA + flareB) * 0.36 + (flareC + flareD) * 0.14;
      float flareHighlight = smoothstep(0.56, 1.05, straightLuma(flareField));
      color.rgb += flareField.rgb * flareHighlight * vec3(0.34, 0.58, 1.0) * uFlare * 0.36;
      color.a = max(color.a, flareField.a * flareHighlight * uFlare * 0.18);
    }

    float lensVignette = 1.0 - smoothstep(0.18, 0.82, radius * radius);
    color.rgb *= mix(1.0 - uVignette * 0.72, 1.0, lensVignette);

    float grain = hash12(gl_FragCoord.xy + vec2(cos(uPhase), sin(uPhase)) * 173.0) - 0.5;
    float luma = straightLuma(color);
    color.rgb += grain * uGrain * (0.075 + (1.0 - luma) * 0.055) * color.a;

    if (color.a <= 0.0001) {
      gl_FragColor = vec4(0.0);
    } else {
      // The scene target is a premultiplied composite. Work in that form for
      // blur, then return straight RGB so normal WebGL blending premultiplies
      // exactly once into the browser canvas.
      vec3 straight = max(vec3(0.0), color.rgb / max(0.0001, color.a));
      gl_FragColor = vec4(straight, clamp(color.a, 0.0, 1.0));
    }
    #include <colorspace_fragment>
  }
`;
