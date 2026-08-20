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
  precision highp float;

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
  uniform float uPhase;

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

  vec4 sampleMedia(vec2 textureUv) {
    bool outsideTexture = textureUv.x < 0.0 || textureUv.x > 1.0 || textureUv.y < 0.0 || textureUv.y > 1.0;
    vec4 sampled = texture2D(uMap, clamp(textureUv, 0.0, 1.0));
    if (uFit > 0.5 && outsideTexture) {
      sampled.rgb *= 0.2;
      sampled.a = 1.0;
    }
    return sampled;
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
    vec2 crossAxis = vec2(-flowAxis.y, flowAxis.x);
    vec2 pixelUv = 1.0 / max(uSizePx, vec2(1.0));
    float signedVelocity = clamp(uVelocity, -1.0, 1.0);
    float speed = abs(signedVelocity);
    float flowSign = signedVelocity < 0.0 ? -1.0 : 1.0;
    float optical = speed * clamp(uDistortion, 0.0, 1.0);

    // The same velocity that bends geometry now gives the image optical weight.
    // At rest the focal frame returns crisp; peripheral frames retain a bounded
    // defocus inferred from the engine's existing edge-falloff envelope.
    float peripheral = smoothstep(0.02, 0.72, 1.0 - clamp(uOpacity, 0.0, 1.0));
    vec2 radial = vUv - 0.5;
    radial /= max(length(radial), 0.0001);
    float motionBlurPx = min(5.0, optical * 5.0);
    float defocusPx = min(3.5, peripheral * mix(1.45, 3.5, clamp(uDistortion, 0.0, 1.0)));
    vec2 along = flowAxis * pixelUv * flowSign * motionBlurPx
      + radial * pixelUv * defocusPx * 0.32;
    vec2 across = crossAxis * pixelUv * defocusPx;

    vec4 sampled = sampleMedia(textureUv);
    if (motionBlurPx + defocusPx > 0.05) {
      sampled = sampled * 0.30
        + sampleMedia(textureUv + along) * 0.18
        + sampleMedia(textureUv - along) * 0.18
        + sampleMedia(textureUv + along * 2.0) * 0.08
        + sampleMedia(textureUv - along * 2.0) * 0.08
        + sampleMedia(textureUv + across) * 0.09
        + sampleMedia(textureUv - across) * 0.09;
    }

    // Channel separation follows motion first and lens radius second. The
    // maximum displacement is intentionally small so deck typography survives.
    float chromaPx = min(2.8, (speed * 0.86 + peripheral * 0.34) * uDistortion * 3.0);
    if (chromaPx > 0.01) {
      vec2 chromaDirection = flowAxis * pixelUv * flowSign * 0.82 + radial * pixelUv * 0.34;
      vec2 chromaOffset = chromaDirection * chromaPx;
      vec4 redSample = sampleMedia(textureUv + chromaOffset);
      vec4 blueSample = sampleMedia(textureUv - chromaOffset);
      float chromaMix = smoothstep(0.01, 0.8, chromaPx);
      sampled.r = mix(sampled.r, redSample.r, chromaMix);
      sampled.b = mix(sampled.b, blueSample.b, chromaMix);
    }

    // Microtexture is fixed to the slide, not animated over it. This avoids
    // temporal noise, survives reduced motion, and closes seamless masters.
    vec2 grainCoordinate = vUv * uSizePx + vec2(uPhase * 47.0, uPhase * 83.0);
    float grain = (hash12(grainCoordinate) - 0.5) * 0.006;
    sampled.rgb += grain + abs(vWarp) * 0.022;

    vec3 color = mix(sampled.rgb, uBorderColor, borderMask * uBorderOpacity);
    float alpha = outerMask * sampled.a * uOpacity;
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
  uniform float uPhase;
  uniform float uSeed;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33 + uSeed * 0.0017);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 3; i += 1) {
      value += amplitude * valueNoise(p);
      p = turn * p * 2.03 + vec2(17.1, 9.2);
      amplitude *= 0.5;
    }
    return value;
  }

  float ridgedFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    mat2 turn = mat2(0.76, -0.65, 0.65, 0.76);
    for (int i = 0; i < 3; i += 1) {
      float ridge = 1.0 - abs(valueNoise(p) * 2.0 - 1.0);
      value += ridge * ridge * amplitude;
      p = turn * p * 2.11 + vec2(5.7, 13.4);
      amplitude *= 0.48;
    }
    return value;
  }

  float softBlob(vec2 uv, vec2 center, float radius) {
    return 1.0 - smoothstep(0.0, radius, length(uv - center));
  }

  float softLine(float value, float center, float width) {
    return exp(-abs(value - center) / max(0.0001, width));
  }

  float dustField(vec2 p, float threshold) {
    vec2 cell = floor(p);
    vec2 local = fract(p) - 0.5;
    float random = hash12(cell);
    float radius = mix(0.02, 0.11, hash12(cell + 11.7));
    float mote = 1.0 - smoothstep(radius, radius * 1.7, length(local));
    return mote * step(threshold, random);
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 p = uv - 0.5;
    p.x *= aspect;

    float cycle = uPhase;
    vec2 loopA = vec2(cos(cycle), sin(cycle));
    vec2 loopB = vec2(cos(cycle * 2.0 + 1.7), sin(cycle * 2.0 + 1.7));
    float variant = mod(floor(abs(uSeed)), 4.0);
    float breath = loopA.y * uMotion;
    vec2 seedOffset = vec2(
      hash12(vec2(uSeed, 7.0)) - 0.5,
      hash12(vec2(13.0, uSeed)) - 0.5
    ) * 3.0;
    vec3 color = uColorA;

    // SOLID FAMILY — four forms of restraint rather than one flat fill.
    if (uMode < 0.5) {
      if (variant < 0.5) {
        float centre = softBlob(p, vec2(0.0), 0.92);
        float cloth = fbm(p * 2.0 + seedOffset) - 0.5;
        color = mix(uColorA, uColorB, centre * 0.22 * uIntensity);
        color += cloth * 0.012 * uIntensity;
      } else if (variant < 1.5) {
        vec2 practical = vec2(-0.22 + loopA.x * 0.03, 0.18 + loopA.y * 0.04);
        float pool = softBlob(p, practical, 0.74);
        color = mix(uColorA, uColorB, pool * 0.48 * uIntensity);
        color = mix(color, uAccent, pool * pool * 0.11 * uIntensity);
      } else if (variant < 2.5) {
        float milk = fbm(p * 1.25 + loopA * 0.05 + seedOffset);
        float veil = smoothstep(0.22, 0.86, milk + (0.5 - length(p)) * 0.28);
        color = mix(uColorA, uColorB, veil * 0.34 * uIntensity);
        color = mix(color, uAccent, softBlob(p, vec2(0.2, -0.16), 1.0) * 0.12 * uIntensity);
      } else {
        float oil = ridgedFbm(p * 1.5 + loopA * 0.08 + seedOffset);
        color = mix(uColorA, uColorB, smoothstep(0.52, 1.25, oil) * 0.4 * uIntensity);
        color = mix(color, uAccent, smoothstep(0.86, 1.4, oil) * 0.12 * uIntensity);
      }
    }

    // GRADIENT FAMILY — horizon, dawn, rain, and mirage.
    else if (uMode < 1.5) {
      if (variant < 0.5) {
        float horizon = smoothstep(-0.38, 0.58, p.y + p.x * 0.16 + breath * 0.035);
        float sun = softBlob(p, vec2(0.34 + loopA.x * 0.025, -0.22), 0.52);
        color = mix(uColorB, uColorA, horizon);
        color = mix(color, uAccent, sun * 0.38 * uIntensity);
        color += (fbm(p * 3.0 + seedOffset) - 0.5) * 0.018 * uIntensity;
      } else if (variant < 1.5) {
        float cloud = fbm(vec2(p.x * 1.5, p.y * 2.4) + loopA * 0.055 + seedOffset);
        float dawn = smoothstep(-0.7, 0.72, p.y + cloud * 0.18);
        color = mix(uColorA, uColorB, dawn);
        float seam = softLine(p.y + cloud * 0.08, -0.18, 0.13);
        color = mix(color, uAccent, seam * 0.2 * uIntensity);
      } else if (variant < 2.5) {
        float field = smoothstep(-0.7, 0.72, p.y + p.x * 0.12);
        color = mix(uColorA, uColorB, field);
        vec2 rainUv = vec2(p.x * 95.0 + loopA.x * 0.35, p.y * 8.0 + loopA.y * 0.75);
        float lane = hash12(vec2(floor(rainUv.x), floor(rainUv.y * 0.35)));
        float streak = pow(max(0.0, 1.0 - abs(fract(rainUv.x) - 0.5) * 16.0), 3.0)
          * smoothstep(0.82, 1.0, lane);
        color = mix(color, uAccent, streak * 0.12 * uIntensity);
        color += (fbm(p * 2.5 + seedOffset) - 0.5) * 0.02;
      } else {
        float haze = fbm(vec2(p.x * 1.2, p.y * 5.0) + loopA * 0.065 + seedOffset);
        float horizon = smoothstep(-0.52, 0.48, p.y + (haze - 0.5) * 0.12);
        float mirage = sin((p.y + haze * 0.045) * 88.0) * exp(-abs(p.y + 0.08) * 8.0);
        color = mix(uColorA, uColorB, horizon);
        color = mix(color, uAccent, (0.18 + mirage * 0.08) * softBlob(p, vec2(0.3, -0.25), 0.9) * uIntensity);
      }
    }

    // AURA FAMILY — projector, chamber light, water refraction, and fog.
    else if (uMode < 2.5) {
      if (variant < 0.5) {
        vec2 beamP = p;
        beamP.x += loopA.x * 0.025;
        float cone = 1.0 - smoothstep(0.0, 0.62, abs(beamP.x) - (0.18 + (beamP.y + 0.5) * 0.25));
        cone *= 1.0 - smoothstep(-0.5, 0.72, beamP.y);
        float bloom = softBlob(p, vec2(0.0, -0.2), 0.88);
        float dust = dustField(p * 26.0 + loopA * 0.09 + seedOffset, 0.91);
        color = mix(uColorA, uColorB, bloom * 0.62 * uIntensity);
        color = mix(color, uAccent, (cone * 0.32 + dust * 0.28) * uIntensity);
      } else if (variant < 1.5) {
        vec2 centreA = vec2(loopA.x * 0.28, loopA.y * 0.19);
        vec2 centreB = vec2(loopB.x * 0.38, loopB.y * 0.26);
        float a = softBlob(p, centreA, 0.72);
        float b = softBlob(p, centreB, 0.62);
        color = mix(uColorA, uColorB, a * 0.72 * uIntensity);
        color = mix(color, uAccent, b * 0.48 * uIntensity);
      } else if (variant < 2.5) {
        vec2 waterP = p * 2.1 + seedOffset;
        waterP += vec2(loopA.y, loopB.x) * 0.12;
        float caustic = ridgedFbm(waterP * 1.8);
        float glow = smoothstep(0.72, 1.42, caustic);
        color = mix(uColorA, uColorB, softBlob(p, vec2(-0.08, 0.04), 0.98) * 0.55 * uIntensity);
        color = mix(color, uAccent, glow * 0.24 * uIntensity);
      } else {
        vec2 fogP = p * 1.45 + seedOffset + loopA * 0.045;
        float warp = fbm(fogP + vec2(valueNoise(fogP * 1.7)));
        float veil = smoothstep(0.28, 0.86, warp);
        color = mix(uColorA, uColorB, veil * 0.68 * uIntensity);
        color = mix(color, uAccent, softBlob(p, vec2(0.22, -0.14), 0.92) * 0.2 * uIntensity);
      }
    }

    // PAPER FAMILY — emulsion, stock, archive, and chemical burn.
    else if (uMode < 3.5) {
      if (variant < 0.5) {
        float emulsion = fbm(p * 3.0 + seedOffset);
        float fibres = sin((p.y + sin(p.x * 19.0) * 0.015) * 620.0) * 0.5 + 0.5;
        color = mix(uColorA, uColorB, smoothstep(0.2, 0.88, emulsion) * 0.54 * uIntensity);
        color += (fibres - 0.5) * 0.018 * uIntensity;
      } else if (variant < 1.5) {
        float stock = fbm(p * 4.5 + seedOffset);
        float moon = softBlob(p, vec2(0.12 + loopA.x * 0.02, -0.08), 0.72);
        color = mix(uColorA, uColorB, stock * 0.32 * uIntensity);
        color = mix(color, uAccent, moon * 0.22 * uIntensity);
      } else if (variant < 2.5) {
        float exposure = fbm(vec2(p.x * 1.2, p.y * 2.5) + seedOffset);
        float scratches = step(0.992, hash12(vec2(floor((p.x + 1.0) * 160.0), floor(uSeed))))
          * (0.3 + 0.7 * valueNoise(vec2(p.y * 18.0, uSeed)));
        float dust = dustField(p * 35.0 + seedOffset, 0.935);
        color = mix(uColorA, uColorB, exposure * 0.52 * uIntensity);
        color = mix(color, uAccent, dust * 0.2 * uIntensity);
        color += scratches * 0.055 * uIntensity;
      } else {
        float stock = fbm(p * 3.5 + seedOffset);
        float edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
        float burn = 1.0 - smoothstep(0.0, 0.28, edgeDistance + (stock - 0.5) * 0.08);
        float flare = softBlob(p, vec2(-0.34 + loopA.x * 0.03, 0.25), 0.56);
        color = mix(uColorA, uColorB, stock * 0.38 * uIntensity);
        color = mix(color, uAccent, (burn * 0.42 + flare * 0.18) * uIntensity);
      }
    }

    // VOID FAMILY — eclipse, smoke, abyss, and metallic ribbons.
    else {
      if (variant < 0.5) {
        vec2 centre = vec2(loopA.x * 0.035, loopA.y * 0.03);
        float radius = length(p - centre);
        float ring = exp(-abs(radius - 0.31) * 32.0);
        float occlusion = 1.0 - smoothstep(0.12, 0.34, radius);
        color = mix(uColorA, uColorB, occlusion * 0.24 * uIntensity);
        color = mix(color, uAccent, ring * 0.24 * uIntensity);
      } else if (variant < 1.5) {
        vec2 smokeP = p * 1.6 + seedOffset + loopA * 0.06;
        float smoke = fbm(smokeP + vec2(valueNoise(smokeP * 1.8)));
        float ember = smoothstep(0.58, 0.9, smoke) * softBlob(p, vec2(0.2, -0.28), 0.82);
        color = mix(uColorA, uColorB, smoke * 0.24 * uIntensity);
        color = mix(color, uAccent, ember * 0.36 * uIntensity);
      } else if (variant < 2.5) {
        float caustic = ridgedFbm(vec2(p.x * 2.2, p.y * 1.3) + loopA * 0.07 + seedOffset);
        float slit = exp(-abs(p.x + sin(p.y * 2.4 + loopA.y * 1.2) * 0.08) * 8.0);
        color = mix(uColorA, uColorB, smoothstep(-0.4, 0.5, p.y) * 0.3);
        color = mix(color, uAccent, (slit * 0.22 + smoothstep(0.9, 1.42, caustic) * 0.1) * uIntensity);
      } else {
        vec2 chromeP = p * 1.35;
        float chromeNoise = fbm(chromeP * 1.9 + seedOffset);
        float warpA = sin(chromeP.y * 4.0 + chromeNoise * 4.2 + loopA.x * 1.2 + loopB.y * 0.35);
        float warpB = sin(chromeP.x * 3.0 - chromeNoise * 3.8 - loopA.y * 1.1 + loopB.x * 0.3);
        float ribbon = exp(-abs(warpA + warpB * 0.55) * 4.5);
        color = mix(uColorA, uColorB, ribbon * 0.5 * uIntensity);
        color = mix(color, uAccent, pow(ribbon, 3.0) * 0.34 * uIntensity);
      }
    }

    float vignetteRadius = length((uv - 0.5) * vec2(aspect, 1.0));
    float vignetteMask = 1.0 - smoothstep(0.18, 0.92, vignetteRadius);
    color *= mix(1.0 - uVignette * 0.62, 1.0, vignetteMask);

    vec2 grainDrift = loopA * 97.0;
    float grain = (hash12(gl_FragCoord.xy + grainDrift) - 0.5) * uGrain * 0.13;
    color = max(vec3(0.0), color + grain);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
