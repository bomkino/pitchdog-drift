export const slideVertexShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying float vWarp;
  varying float vSurfaceEnergy;
  varying vec3 vViewPosition;

  uniform float uVelocity;
  uniform float uAcceleration;
  uniform float uDistortion;
  uniform float uAxis;
  uniform float uSurface;
  uniform float uSlideSeed;
  uniform float uTravelPhase;
  uniform float uPathBend;

  const float PI = 3.14159265359;
  const float TAU = 6.28318530718;

  void main() {
    vUv = uv;
    vec3 transformed = position;

    float along = uAxis < 0.5 ? uv.x - 0.5 : uv.y - 0.5;
    float across = uAxis < 0.5 ? uv.y - 0.5 : uv.x - 0.5;
    float velocity = clamp(uVelocity, -1.0, 1.0);
    float acceleration = clamp(uAcceleration, -1.0, 1.0);
    float direction = abs(acceleration) > 0.025
      ? sign(acceleration)
      : sign(velocity + 0.0001);
    float airflow = abs(velocity);
    float impulse = abs(acceleration);
    float pathBend = clamp(uPathBend, 0.0, 1.0);
    float edgeAlong = sin(uv.x * PI);
    float edgeAcross = sin(uv.y * PI);
    float envelope = max(0.0, edgeAlong * edgeAcross);
    float phase = uTravelPhase + fract(uSlideSeed) * TAU;
    float energy = clamp(
      airflow * 0.34 + impulse * 0.78 + pathBend * 0.26,
      0.0,
      1.0
    ) * clamp(uDistortion, 0.0, 1.0);
    float warp = 0.0;
    float shear = 0.0;

    if (uSurface < 0.5) {
      // Card: rigid stock. Acceleration yields a restrained bow and torsion.
      float cardEnergy = energy * (0.16 + impulse * 0.42);
      float bow = (1.0 - across * across * 4.0) * (1.0 - along * along * 3.4);
      warp = (bow * 13.0 + across * along * direction * 22.0) * cardEnergy;
      shear = across * direction * cardEnergy * 0.0035;
    } else if (uSurface < 1.5) {
      // Paper: cylindrical curl, one broad buckle, and curvature memory.
      float curl = direction * along * abs(along) * (38.0 + impulse * 34.0);
      float buckle = sin(along * 7.2 + phase + across * 1.6) * envelope * 18.0;
      float pathCurl = along * along * pathBend * 28.0;
      warp = (curl + buckle + pathCurl) * energy * (0.7 + edgeAcross * 0.3);
      shear = sin(across * 4.0 + phase) * envelope * energy * 0.006;
    } else if (uSurface < 2.5) {
      // Silk: broad travelling folds, diagonal bias, and quiet pinned edges.
      float foldA = sin(along * 8.8 - phase + across * 2.4);
      float foldB = sin(along * 4.1 + phase * 1.7 - across * 6.4) * 0.46;
      float diagonal = sin((along + across) * 5.2 - phase * 0.62) * 0.24;
      warp = (foldA + foldB + diagonal) * envelope * energy * 49.0;
      shear = (foldB + diagonal) * envelope * energy * 0.011;
    } else {
      // Gel: coherent elastic mass. Impulse shifts the bulge behind the hand.
      vec2 gelPoint = vec2(along - direction * impulse * 0.08, across);
      float radius = length(vec2(gelPoint.x * 1.16, gelPoint.y));
      float bulge = cos(radius * 7.0 - phase) * (1.0 - smoothstep(0.0, 0.72, radius));
      float lag = acceleration * along * 34.0 + velocity * along * 12.0;
      warp = (bulge * 42.0 + lag + pathBend * 16.0) * energy * envelope;
      shear = (acceleration * across * 0.009 + velocity * across * 0.004) * energy;
    }

    // The boundary stays attached to the rounded sidewall. Motion lives in
    // the interior, preventing light leaks between the deformed face and shell.
    float edgeConstraint = smoothstep(0.0, 0.18, edgeAlong)
      * smoothstep(0.0, 0.18, edgeAcross);
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
  precision highp float;

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
  uniform float uOpacity;
  uniform float uVelocity;
  uniform float uDistortion;
  uniform float uAxis;
  uniform float uSurface;
  uniform float uSlideSeed;

  float roundedSuperellipseDistance(vec2 p, vec2 halfSize, float radius, float smoothing) {
    if (radius < 0.5) {
      vec2 q = abs(p) - halfSize;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    }
    radius = min(radius, min(halfSize.x, halfSize.y));
    vec2 q = abs(p) - (halfSize - vec2(radius));
    vec2 outside = max(q, 0.0);
    float exponent = mix(2.0, 5.5, clamp(smoothing, 0.0, 1.0));
    float lp = pow(
      pow(outside.x, exponent) + pow(outside.y, exponent),
      1.0 / exponent
    );
    return lp + min(max(q.x, q.y), 0.0) - radius;
  }

  vec2 coverUv(vec2 uv, float planeAspect, float imageAspect, vec2 focal) {
    vec2 scale = vec2(1.0);
    if (imageAspect > planeAspect) scale.x = planeAspect / imageAspect;
    else scale.y = imageAspect / planeAspect;
    vec2 objectPosition = clamp(vec2(focal.x, 1.0 - focal.y), 0.0, 1.0);
    return uv * scale + objectPosition * (1.0 - scale);
  }

  vec2 containUv(vec2 uv, float planeAspect, float imageAspect, vec2 focal) {
    vec2 scale = vec2(1.0);
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
    float distanceToEdge = roundedSuperellipseDistance(
      pixel,
      uSizePx * 0.5,
      uRadiusPx,
      uSmoothing
    );
    float feather = max(fwidth(distanceToEdge), 0.72);
    float outerMask = 1.0 - smoothstep(-feather, feather, distanceToEdge);
    float innerMask = 1.0 - smoothstep(
      -feather,
      feather,
      distanceToEdge + max(0.0, uBorderPx)
    );
    float borderMask = max(0.0, outerMask - innerMask);

    vec2 textureUv = uFit < 0.5
      ? coverUv(vUv, uPlaneAspect, uTextureAspect, uFocal)
      : containUv(vUv, uPlaneAspect, uTextureAspect, uFocal);

    vec2 flowAxis = uAxis < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    float optical = clamp(uVelocity, -1.0, 1.0) * uDistortion;
    textureUv += flowAxis
      * sin((uAxis < 0.5 ? vUv.y : vUv.x) * 3.14159265359)
      * optical
      * 0.022;

    bool outsideTexture = textureUv.x < 0.0
      || textureUv.x > 1.0
      || textureUv.y < 0.0
      || textureUv.y > 1.0;
    vec4 sampled = texture2D(uMap, clamp(textureUv, 0.0, 1.0));
    if (uFit > 0.5 && outsideTexture) {
      sampled.rgb *= 0.2;
      sampled.a = 1.0;
    }

    // The normal comes from the actually deformed view-space surface, not a
    // decorative brightness proxy. Lighting remains deliberately restrained.
    vec3 surfaceNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    if (!gl_FrontFacing) surfaceNormal *= -1.0;
    vec3 viewDirection = normalize(-vViewPosition);
    vec3 keyDirection = normalize(vec3(-0.42, 0.58, 0.7));
    float diffuse = clamp(dot(surfaceNormal, keyDirection) * 0.5 + 0.5, 0.0, 1.0);
    float facing = clamp(dot(surfaceNormal, viewDirection), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.2);
    float halfSpecular = pow(
      max(dot(surfaceNormal, normalize(keyDirection + viewDirection)), 0.0),
      mix(22.0, 7.0, clamp(uSurface / 3.0, 0.0, 1.0))
    );

    float shadeRange = 0.022;
    float highlight = 0.0;
    if (uSurface < 0.5) {
      shadeRange = 0.018;
      highlight = halfSpecular * 0.006;
    } else if (uSurface < 1.5) {
      shadeRange = 0.024;
      highlight = rim * 0.004;
    } else if (uSurface < 2.5) {
      shadeRange = 0.028;
      highlight = rim * 0.018 + halfSpecular * 0.006;
    } else {
      shadeRange = 0.034;
      highlight = halfSpecular * 0.026 + rim * 0.008;
    }

    float deformationGate = clamp(vSurfaceEnergy * 1.3 + abs(vWarp) / 90.0, 0.0, 1.0);
    sampled.rgb *= 1.0 + (diffuse - 0.5) * shadeRange * deformationGate;
    sampled.rgb += highlight * deformationGate;

    // Slide-locked grain: tactile, stable at rest, and closed at loop cuts.
    vec2 grainCell = floor(vUv * max(uSizePx, vec2(1.0)));
    float grain = hash12(
      grainCell + vec2(fract(uSlideSeed) * 41.0, fract(uSlideSeed) * 73.0)
    ) - 0.5;
    sampled.rgb += grain * 0.012;

    vec3 color = mix(sampled.rgb, uBorderColor, borderMask * uBorderOpacity);
    float alpha = outerMask * sampled.a * uOpacity;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(color, alpha);
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
    float lp = pow(
      pow(outside.x, exponent) + pow(outside.y, exponent),
      1.0 / exponent
    );
    return lp + min(max(q.x, q.y), 0.0) - radius;
  }

  void main() {
    vec2 pixel = (vUv - 0.5) * uSizePx;
    float distanceToEdge = shapeDistance(
      pixel,
      uSizePx * 0.5,
      uRadiusPx,
      uSmoothing
    );
    float blur = max(1.0, uSoftnessPx);
    float alpha = (
      1.0 - smoothstep(-blur * 0.36, blur, distanceToEdge)
    ) * uOpacity;
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
    p3 += dot(p3, p3.yzx + 33.33 + uSeed);
    return fract((p3.x + p3.y) * p3.z);
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
      color = mix(
        color,
        uAccent,
        softBlob(p, vec2(0.35 + cos(uPhase) * 0.08, -0.3), 0.7)
          * 0.32
          * uIntensity
      );
    } else if (uMode < 2.5) {
      vec2 centerA = vec2(cos(uPhase) * 0.34, sin(uPhase) * 0.22);
      vec2 centerB = vec2(cos(uPhase + 2.1) * 0.42, sin(uPhase + 1.4) * 0.3);
      float a = softBlob(p, centerA, 0.72);
      float b = softBlob(p, centerB, 0.62);
      color = mix(uColorA, uColorB, a * 0.72 * uIntensity);
      color = mix(color, uAccent, b * 0.48 * uIntensity);
    } else if (uMode < 3.5) {
      float fibers = sin((p.y + sin(p.x * 19.0) * 0.015) * 620.0) * 0.5 + 0.5;
      color = mix(uColorA, uColorB, smoothstep(-0.45, 0.65, p.y));
      color += (fibers - 0.5) * 0.018 * uIntensity;
    } else {
      float slit = exp(-abs(p.x + sin(p.y * 2.4 + uPhase) * 0.08) * 8.0);
      float pulse = 0.82 + 0.18 * sin(uPhase);
      color = mix(uColorA, uColorB, smoothstep(-0.4, 0.5, p.y) * 0.36);
      color = mix(color, uAccent, slit * pulse * 0.28 * uIntensity);
    }

    float vignette = 1.0 - smoothstep(0.18, 0.88, dot(p, p));
    color *= mix(1.0 - uVignette * 0.62, 1.0, vignette);
    float grain = (
      hash12(gl_FragCoord.xy + vec2(cos(uPhase), sin(uPhase)) * 97.0) - 0.5
    ) * uGrain * 0.16;
    color += grain;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
