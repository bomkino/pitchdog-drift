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
    float speed = abs(velocity);
    float envelope = sin(uv.x * 3.14159265) * sin(uv.y * 3.14159265);
    float warp = sin(along * 3.14159265 + uPhase * 0.15) * envelope * velocity * uDistortion;
    float flutter = sin(along * 6.2831853 + uPhase * 0.71)
      * envelope
      * speed
      * uDistortion
      * 0.075;
    transformed.z += (warp + flutter) * 72.0;
    transformed.z += across * velocity * uDistortion * 18.0;
    transformed.x += (uAxis < 0.5 ? across : along) * flutter * 3.5;
    transformed.y += (uAxis < 0.5 ? along : across) * flutter * 3.5;
    vWarp = warp + flutter;
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

  vec4 sampleSource(vec2 uv) {
    bool outsideTexture = uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0;
    vec4 sampled = texture2D(uMap, clamp(uv, 0.0, 1.0));
    if (uFit > 0.5 && outsideTexture) {
      sampled.rgb *= 0.2;
      sampled.a = 1.0;
    }
    return sampled;
  }

  vec3 setSaturation(vec3 color, float saturation) {
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luminance), color, saturation);
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
    vec2 texel = 1.0 / max(uSizePx, vec2(1.0));
    float signedSpeed = clamp(uVelocity, -1.0, 1.0);
    float speed = abs(signedSpeed);
    float optical = signedSpeed * uDistortion;

    // The geometry bends and the emulsion lags behind it. All dynamic optics
    // collapse to zero with velocity, while a sub-pixel softness remains for
    // the higher-lens-response worlds.
    textureUv += flowAxis
      * sin((uAxis < 0.5 ? vUv.y : vUv.x) * 3.14159265)
      * optical
      * 0.022;
    vec2 weave = vec2(
      sin(uPhase * 1.91),
      cos(uPhase * 1.37)
    ) * texel * speed * uDistortion * 0.72;
    textureUv += weave;

    float motionBlurPx = speed * uDistortion * 12.0;
    vec2 trailDirection = -sign(signedSpeed) * flowAxis;
    vec2 trail = trailDirection * texel * motionBlurPx;
    vec4 centerSample = sampleSource(textureUv);
    vec3 motionColor = centerSample.rgb * 0.28;
    motionColor += sampleSource(textureUv + trail * 0.25).rgb * 0.18;
    motionColor += sampleSource(textureUv + trail * 0.52).rgb * 0.16;
    motionColor += sampleSource(textureUv + trail * 0.82).rgb * 0.13;
    motionColor += sampleSource(textureUv + trail * 1.12).rgb * 0.10;
    motionColor += sampleSource(textureUv + trail * 1.43).rgb * 0.08;
    motionColor += sampleSource(textureUv + trail * 1.76).rgb * 0.07;

    float chromaPx = uDistortion * (0.24 + speed * 5.2);
    vec2 chromaOffset = (flowAxis + crossAxis * 0.16) * texel * chromaPx * sign(signedSpeed + 0.0001);
    vec3 chromaticColor = vec3(
      sampleSource(textureUv + chromaOffset).r,
      centerSample.g,
      sampleSource(textureUv - chromaOffset).b
    );
    float chromaMix = clamp(uDistortion * (0.1 + speed * 0.46), 0.0, 0.48);
    vec3 color = mix(motionColor, chromaticColor, chromaMix);

    float softFocusPx = uDistortion * (0.72 + speed * 2.6);
    vec2 softX = crossAxis * texel * softFocusPx;
    vec2 softY = flowAxis * texel * softFocusPx * 0.62;
    vec3 softColor = (
      sampleSource(textureUv + softX + softY).rgb
      + sampleSource(textureUv - softX + softY).rgb
      + sampleSource(textureUv + softX - softY).rgb
      + sampleSource(textureUv - softX - softY).rgb
    ) * 0.25;
    float softMix = clamp(uDistortion * (0.16 + speed * 0.2), 0.0, 0.32);
    color = mix(color, softColor, softMix);

    // Warm highlight spread reads as halation, not digital bloom. Saturation
    // relaxes slightly under speed, mirroring the reference filmstrip logic.
    float highlight = max(0.0, dot(softColor, vec3(0.2126, 0.7152, 0.0722)) - 0.66);
    color += vec3(1.0, 0.31, 0.12) * highlight * uDistortion * (0.08 + speed * 0.14);
    color = setSaturation(color, 1.0 - speed * uDistortion * 0.24);
    color += abs(vWarp) * vec3(0.018, 0.013, 0.009);

    vec2 grainCoordinate = floor(vUv * uSizePx * 0.58) + vec2(uPhase * 17.0, uPhase * 29.0);
    float grain = (hash12(grainCoordinate) - 0.5)
      * (0.006 + speed * uDistortion * 0.006);
    color += grain;
    color = mix(color, uBorderColor, borderMask * uBorderOpacity);

    float alpha = outerMask * centerSample.a * uOpacity;
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
    p3 += dot(p3, p3.yzx + 33.33 + uSeed * 0.017);
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
    float amplitude = 0.52;
    mat2 turn = mat2(0.82, -0.57, 0.57, 0.82);
    for (int octave = 0; octave < 3; octave += 1) {
      value += valueNoise(p) * amplitude;
      p = turn * p * 2.03 + vec2(11.7, 7.9);
      amplitude *= 0.5;
    }
    return value;
  }

  float softBlob(vec2 uv, vec2 center, float radius) {
    return 1.0 - smoothstep(0.0, radius, length(uv - center));
  }

  float lineGlow(float distanceFromLine, float width) {
    return exp(-abs(distanceFromLine) / max(0.0001, width));
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    p.x *= uResolution.x / max(1.0, uResolution.y);
    float variant = mod(floor(uSeed + 0.5), 4.0);
    float seedPhase = uSeed * 0.0137;
    float phase = uPhase + seedPhase;
    float motionAmount = clamp(uMotion, 0.0, 1.0);
    float sinPhase = mix(sin(seedPhase), sin(phase), motionAmount);
    float cosPhase = mix(cos(seedPhase), cos(phase), motionAmount);
    float sinDoublePhase = mix(sin(seedPhase * 2.0), sin(phase * 2.0), motionAmount);
    float cosDoublePhase = mix(cos(seedPhase * 2.0), cos(phase * 2.0), motionAmount);
    float cosPhasePlusTwo = mix(cos(seedPhase + 2.1), cos(phase + 2.1), motionAmount);
    float sinPhasePlusOne = mix(sin(seedPhase + 1.4), sin(phase + 1.4), motionAmount);
    float wave = sin(phase) * motionAmount;
    vec3 color = uColorA;

    if (uMode < 0.5) {
      if (variant < 0.5) {
        float centre = softBlob(p, vec2(0.0), 0.92);
        float cloth = fbm(p * 2.0 + vec2(uSeed * 0.017, uSeed * 0.011)) - 0.5;
        color = mix(uColorA, uColorB, centre * 0.22 * uIntensity);
        color += cloth * 0.012 * uIntensity;
      } else if (variant < 1.5) {
        vec2 practical = vec2(-0.22 + cosPhase * 0.03, 0.18 + sinDoublePhase * 0.025);
        float pool = softBlob(p, practical, 0.74);
        color = mix(uColorA, uColorB, pool * 0.48 * uIntensity);
        color = mix(color, uAccent, pool * pool * 0.11 * uIntensity);
      } else if (variant < 2.5) {
        vec2 milkDrift = vec2(cosPhase, -sinPhase) * 0.035;
        float milk = fbm(p * 1.25 + milkDrift + vec2(uSeed * 0.009));
        float veil = smoothstep(0.22, 0.86, milk + (0.5 - length(p)) * 0.28);
        color = mix(uColorA, uColorB, veil * 0.34 * uIntensity);
        color = mix(color, uAccent, softBlob(p, vec2(0.2, -0.16), 1.0) * 0.12 * uIntensity);
      } else {
        vec2 oilDrift = vec2(cosDoublePhase, sinDoublePhase) * 0.05;
        float oil = fbm(p * 2.2 + oilDrift + vec2(uSeed * 0.013));
        float ribbon = smoothstep(0.5, 0.82, oil + sin(p.y * 4.0 + seedPhase) * 0.08);
        color = mix(uColorA, uColorB, ribbon * 0.4 * uIntensity);
        color = mix(color, uAccent, smoothstep(0.72, 0.92, oil) * 0.12 * uIntensity);
      }
    } else if (uMode < 1.5) {
      float gradient = smoothstep(-0.72, 0.72, p.y + p.x * 0.4 + wave * 0.07);
      color = mix(uColorA, uColorB, gradient);

      if (variant < 0.5) {
        float projector = softBlob(p, vec2(0.36 + cosPhase * 0.08, -0.28), 0.72);
        float flare = lineGlow(p.x + p.y * 0.28 - sinDoublePhase * 0.08, 0.18);
        color = mix(color, uAccent, (projector * 0.28 + flare * 0.08) * uIntensity);
      } else if (variant < 1.5) {
        float horizonWave = mix(
          sin(p.x * 2.1 + seedPhase),
          sin(p.x * 2.1 + phase),
          motionAmount
        );
        float horizon = lineGlow(p.y + horizonWave * 0.05, 0.12);
        float burn = softBlob(p, vec2(-0.44 + cosDoublePhase * 0.1, 0.2), 0.58);
        color = mix(color, uAccent, (horizon * 0.18 + burn * 0.24) * uIntensity);
      } else if (variant < 2.5) {
        float prismA = lineGlow(p.x * 0.7 - p.y + sinPhase * 0.12, 0.2);
        float prismB = lineGlow(p.x * 0.7 - p.y - 0.26 + cosDoublePhase * 0.08, 0.08);
        color = mix(color, uAccent, (prismA * 0.16 + prismB * 0.12) * uIntensity);
      } else {
        vec2 fieldDrift = vec2(cosPhase, sinPhase) * 0.08
          + vec2(cosDoublePhase, -sinDoublePhase) * 0.035;
        float field = fbm(p * 1.65 + fieldDrift);
        float wash = smoothstep(0.38, 0.78, field + p.y * 0.18);
        color = mix(color, uAccent, wash * 0.25 * uIntensity);
      }
    } else if (uMode < 2.5) {
      vec2 drift = vec2(cosPhase, sinDoublePhase) * 0.12;
      float warp = fbm(p * 1.8 + drift + variant * 3.7);
      vec2 warped = p + vec2(warp - 0.5, valueNoise(p * 2.9 - drift * 1.7 + vec2(8.3)) - 0.5) * 0.14 * uIntensity;
      vec2 centerA = vec2(cosPhase * 0.34, sinDoublePhase * 0.22);
      vec2 centerB = vec2(cosPhasePlusTwo * 0.42, sinPhasePlusOne * 0.3);

      if (variant < 0.5) {
        centerA += vec2(-0.16, 0.05);
        centerB += vec2(0.22, -0.1);
      } else if (variant < 1.5) {
        centerA = vec2(-0.38 + cosPhase * 0.08, -0.28);
        centerB = vec2(0.32, 0.26 + sinDoublePhase * 0.08);
      } else if (variant < 2.5) {
        centerA = vec2(sinDoublePhase * 0.18, -0.38);
        centerB = vec2(cosDoublePhase * 0.24, 0.34);
      } else {
        centerA = vec2(-0.44, sinDoublePhase * 0.2);
        centerB = vec2(0.46, cosDoublePhase * 0.18);
      }

      float a = softBlob(warped, centerA, mix(0.64, 0.84, warp));
      float b = softBlob(warped, centerB, mix(0.52, 0.72, 1.0 - warp));
      vec2 veilDrift = vec2(cosDoublePhase, sinDoublePhase) * 0.06;
      float veil = smoothstep(0.34, 0.74, fbm(warped * 2.35 + veilDrift));
      color = mix(uColorA, uColorB, a * 0.74 * uIntensity);
      color = mix(color, uAccent, (b * 0.44 + veil * 0.09) * uIntensity);
    } else if (uMode < 3.5) {
      float fibers = sin((p.y + sin(p.x * 18.0 + seedPhase) * 0.014) * 610.0) * 0.5 + 0.5;
      float pulp = fbm(p * vec2(9.0, 5.0) + variant * 19.0);
      vec2 cloudDrift = vec2(cosPhase, -sinPhase) * 0.045;
      float cloud = fbm(p * 1.65 + cloudDrift);
      color = mix(uColorA, uColorB, smoothstep(-0.48, 0.62, p.y + (cloud - 0.5) * 0.16));
      color += (fibers - 0.5) * 0.018 * uIntensity;
      color += (pulp - 0.5) * 0.045 * uIntensity;

      if (variant < 0.5) {
        float fold = lineGlow(p.x + p.y * 0.08 - 0.12, 0.028);
        color = mix(color, uAccent, fold * 0.06 * uIntensity);
      } else if (variant < 1.5) {
        float stain = softBlob(p, vec2(-0.34, 0.26), 0.5) * (0.6 + 0.4 * cloud);
        color = mix(color, uAccent, stain * 0.1 * uIntensity);
      } else if (variant < 2.5) {
        float bars = smoothstep(0.78, 1.0, sin((p.x + p.y * 0.18) * 42.0 + seedPhase) * 0.5 + 0.5);
        color = mix(color, uAccent, bars * 0.035 * uIntensity);
      } else {
        vec2 emulsionDrift = vec2(cosDoublePhase, sinDoublePhase) * 0.04;
        float emulsion = smoothstep(0.42, 0.74, fbm(p * 3.1 + emulsionDrift));
        color = mix(color, uAccent, emulsion * 0.09 * uIntensity);
      }
    } else {
      float baseGradient = smoothstep(-0.46, 0.58, p.y + wave * 0.03) * 0.34;
      color = mix(uColorA, uColorB, baseGradient);

      if (variant < 0.5) {
        float coneWidth = mix(0.05, 0.5, smoothstep(-0.72, 0.64, p.y));
        float coneWave = mix(
          sin(p.y * 2.1 + seedPhase),
          sin(p.y * 2.1 + phase),
          motionAmount
        );
        float cone = 1.0 - smoothstep(coneWidth, coneWidth + 0.08, abs(p.x + coneWave * 0.05));
        float source = softBlob(p, vec2(0.0, -0.62), 0.22);
        color = mix(color, uAccent, (cone * 0.16 + source * 0.22) * uIntensity);
      } else if (variant < 1.5) {
        float slitWave = mix(
          sin(p.y * 2.4 + seedPhase),
          sin(p.y * 2.4 + phase),
          motionAmount
        );
        float slit = lineGlow(p.x + slitWave * 0.08, 0.11);
        float pulse = 0.8 + 0.2 * sinPhase;
        color = mix(color, uAccent, slit * pulse * 0.27 * uIntensity);
      } else if (variant < 2.5) {
        vec2 eclipseCenter = vec2(cosPhase * 0.08, sinDoublePhase * 0.06);
        float radius = length(p - eclipseCenter);
        float ring = lineGlow(radius - 0.26, 0.025);
        float corona = lineGlow(radius - 0.26, 0.12);
        color = mix(color, uAccent, (ring * 0.24 + corona * 0.08) * uIntensity);
        color *= 1.0 - softBlob(p, eclipseCenter, 0.24) * 0.22;
      } else {
        float streakBase = (p.y + p.x * 0.12) * 34.0;
        float streakWave = mix(
          sin(streakBase + seedPhase * 2.0),
          sin(streakBase + phase * 2.0),
          motionAmount
        );
        float streaks = pow(max(0.0, streakWave), 18.0);
        float road = (1.0 - smoothstep(0.05, 0.72, abs(p.x))) * smoothstep(-0.55, 0.4, -p.y);
        color = mix(color, uAccent, streaks * road * 0.24 * uIntensity);
      }
    }

    // Sparse dust and breathing grain keep the field alive without becoming a
    // noisy overlay. Seed changes composition; motion amount interpolates from
    // a fixed seed pose to the closed analytic orbit.
    vec2 dustDrift = vec2(cosPhase, -sinPhase) * 0.018;
    vec2 dustUv = (p + vec2(0.93, 0.71) + dustDrift) * vec2(48.0, 72.0);
    vec2 dustCell = fract(dustUv) - 0.5;
    vec2 dustId = floor(dustUv);
    float dust = step(0.986, hash12(dustId)) * (1.0 - smoothstep(0.0, 0.075, length(dustCell)));
    color += uAccent * dust * uGrain * 0.12;

    vec2 vignettePoint = p * vec2(0.86, 1.0);
    float vignette = 1.0 - smoothstep(0.18, 0.9, dot(vignettePoint, vignettePoint));
    color *= mix(1.0 - uVignette * 0.64, 1.0, vignette);
    float grain = (hash12(gl_FragCoord.xy * 0.57 + vec2(uSeed * 0.37, uSeed * 0.19)) - 0.5)
      * uGrain
      * 0.11;
    color += grain;
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <colorspace_fragment>
  }
`;
