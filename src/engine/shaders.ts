export const slideVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWarp;
  varying vec3 vViewPosition;

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
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const slideFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vWarp;
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
  uniform float uPhase;
  uniform float uLightingEnabled;
  uniform vec3 uKeyDirection;
  uniform vec3 uKeyColor;
  uniform vec3 uFillColor;
  uniform float uKeyIntensity;
  uniform float uFillIntensity;
  uniform float uRimIntensity;
  uniform float uSheen;
  uniform float uRoughness;
  uniform float uLightPhase;
  uniform float uLightBreath;

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

    // Grain is locked to the slide surface and logical slot. It does not crawl
    // with wall-clock time, so preview, stills, loops, and frame sequences agree.
    float grain = (hash12(floor(vUv * uSizePx) + vec2(uPhase * 17.0, uPhase * 31.0)) - 0.5) * 0.018;
    sampled.rgb += (grain + abs(vWarp) * 0.018) * clamp(uLightingEnabled, 0.0, 1.0);
    vec3 surface = mix(sampled.rgb, uBorderColor, borderMask * uBorderOpacity);

    // Derivatives recover the true normal of the vertex-deformed card in view
    // space. Built-in shadow maps would require a matching custom depth shader;
    // this analytical rig stays faithful to the actual warped surface instead.
    vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    if (!gl_FrontFacing) normal *= -1.0;
    vec3 viewDirection = normalize(-vViewPosition);
    vec3 lightDirection = normalize(uKeyDirection);
    float wrappedDiffuse = smoothstep(-0.22, 0.92, dot(normal, lightDirection));
    float fillLevel = 0.26 + clamp(uFillIntensity, 0.0, 1.0) * 0.74;
    vec3 fillTint = mix(vec3(1.0), uFillColor, 0.32);
    vec3 keyTint = mix(vec3(1.0), uKeyColor, 0.46);
    vec3 multiplier = fillTint * fillLevel + keyTint * wrappedDiffuse * uKeyIntensity * 0.62;
    multiplier = clamp(multiplier, vec3(0.16), vec3(1.42));

    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float specularPower = mix(96.0, 10.0, clamp(uRoughness, 0.0, 1.0));
    float specular = pow(max(dot(normal, halfDirection), 0.0), specularPower)
      * uSheen * (0.4 + wrappedDiffuse * 0.6);
    float rimPower = mix(8.0, 2.4, clamp(uRimIntensity, 0.0, 1.0));
    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), rimPower) * uRimIntensity;
    float breath = 1.0 + sin(uLightPhase + vUv.x * 1.4 - vUv.y * 0.9) * uLightBreath * 0.035;
    vec3 lit = surface * multiplier * breath
      + keyTint * specular * 0.28
      + mix(uFillColor, uKeyColor, 0.5) * rim * 0.16;
    vec3 color = mix(surface, lit, clamp(uLightingEnabled, 0.0, 1.0));

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
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uCanvasSizePx;
  uniform vec2 uShapeSizePx;
  uniform vec2 uShadowOffsetPx;
  uniform vec3 uShadowColor;
  uniform float uRadiusPx;
  uniform float uSmoothing;
  uniform float uSoftnessPx;
  uniform float uContactStrength;
  uniform float uOpacity;

  float shapeDistance(vec2 p, vec2 halfSize, float radius, float smoothing) {
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

  void main() {
    vec2 pixel = (vUv - 0.5) * uCanvasSizePx;
    vec2 castOffset = uShadowOffsetPx;
    float softness = max(1.0, uSoftnessPx);

    float castDistance = shapeDistance(
      pixel - castOffset,
      uShapeSizePx * 0.5,
      uRadiusPx,
      uSmoothing
    );
    float penumbra = 1.0 - smoothstep(-softness * 0.32, softness * 1.15, castDistance);

    // A second, much tighter lobe remains close to the card. This provides the
    // contact-hardening depth cue of area-light shadows without another render
    // target, blur pass, or alpha-hostile depth map.
    float contactSoftness = max(1.25, softness * 0.12);
    float contactDistance = shapeDistance(
      pixel - castOffset * 0.08,
      uShapeSizePx * 0.5,
      uRadiusPx,
      uSmoothing
    );
    float contact = 1.0 - smoothstep(-contactSoftness * 0.35, contactSoftness, contactDistance);
    float contactStrength = clamp(uContactStrength, 0.0, 1.0);
    float castLayer = penumbra * (1.0 - contactStrength * 0.18);
    float contactLayer = contact * contactStrength * 0.72;
    float alpha = (1.0 - (1.0 - castLayer) * (1.0 - contactLayer)) * uOpacity;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(uShadowColor, alpha);
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
  uniform float uLightingEnabled;
  uniform vec3 uLightColor;
  uniform vec2 uLightDirection;
  uniform float uLightSpill;
  uniform float uLightFocus;
  uniform float uLightGobo;
  uniform float uLightPhase;
  uniform float uLightBreath;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33 + uSeed);
    return fract((p3.x + p3.y) * p3.z);
  }

  float softBlob(vec2 uv, vec2 center, float radius) {
    return 1.0 - smoothstep(0.0, radius, length(uv - center));
  }

  mat2 rotate2(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  float authoredLightField(vec2 p) {
    float angle = atan(uLightDirection.y, uLightDirection.x);
    vec2 wobble = vec2(cos(uLightPhase), sin(uLightPhase * 2.0))
      * uLightBreath * 0.035;
    vec2 center = uLightDirection * 0.18 + wobble;
    vec2 q = rotate2(-angle) * (p - center);
    float focus = clamp(uLightFocus, 0.15, 1.5);

    float softbox = 1.0 - smoothstep(focus * 0.28, focus, length(q / vec2(1.0, 0.72)));

    float windowBase = 1.0 - smoothstep(focus * 0.34, focus, length(q / vec2(1.0, 0.82)));
    float verticalBar = 1.0 - smoothstep(0.018, 0.055, abs(q.x));
    float horizontalBar = 1.0 - smoothstep(0.018, 0.055, abs(q.y));
    float window = windowBase * (1.0 - max(verticalBar, horizontalBar) * 0.42);

    float radial = length(q);
    float projector = 1.0 - smoothstep(focus * 0.48, focus * 0.82, radial);
    projector += exp(-abs(radial - focus * 0.68) * 42.0) * 0.06;

    float slit = (1.0 - smoothstep(focus * 0.06, focus * 0.24, abs(q.y)))
      * (1.0 - smoothstep(focus * 0.65, focus * 1.35, abs(q.x)));

    float sunset = (1.0 - smoothstep(focus * 0.14, focus * 0.72, abs(q.y + q.x * 0.16)))
      * (1.0 - smoothstep(focus * 0.52, focus * 1.5, abs(q.x)));

    float edge = (1.0 - smoothstep(-focus * 0.5, focus * 0.85, q.x))
      * (1.0 - smoothstep(focus * 0.65, focus * 1.6, abs(q.y)));

    if (uLightGobo < 0.5) return softbox;
    if (uLightGobo < 1.5) return window;
    if (uLightGobo < 2.5) return clamp(projector, 0.0, 1.0);
    if (uLightGobo < 3.5) return slit;
    if (uLightGobo < 4.5) return sunset;
    return edge;
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

    float lightField = authoredLightField(p) * uLightSpill * clamp(uLightingEnabled, 0.0, 1.0);
    color += uLightColor * lightField * (0.08 + uIntensity * 0.22);

    float vignette = 1.0 - smoothstep(0.18, 0.88, dot(p, p));
    color *= mix(1.0 - uVignette * 0.62, 1.0, vignette);
    // Grain is spatial, not wall-clock driven. Paused and reduced-motion frames
    // therefore remain stable and seamless masters close without a noise pop.
    float grain = (hash12(gl_FragCoord.xy) - 0.5) * uGrain * 0.16;
    color += grain;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
