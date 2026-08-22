export const lensVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const lensFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uScene;
  uniform vec2 uResolution;
  uniform vec2 uVelocity;
  uniform float uPresence;
  uniform float uFocus;
  uniform float uSmear;
  uniform float uChromatic;
  uniform float uBloom;
  uniform float uHalation;
  uniform float uFlare;
  uniform float uCurvature;
  uniform float uGateWeave;
  uniform float uCameraGrain;
  uniform float uVignette;
  uniform float uPhase;
  uniform float uGrainFrame;
  uniform float uSeed;

  float hash12(vec2 p) {
    vec2 seedShift = vec2(uSeed * 0.754877666, uSeed * 0.569840296);
    vec3 p3 = fract(vec3((p + seedShift).xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p, float frame) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 ease = local * local * (3.0 - 2.0 * local);
    vec2 offset = vec2(frame * 19.19, frame * 73.73);
    float a = hash12(cell + offset);
    float b = hash12(cell + vec2(1.0, 0.0) + offset);
    float c = hash12(cell + vec2(0.0, 1.0) + offset);
    float d = hash12(cell + vec2(1.0, 1.0) + offset);
    return mix(mix(a, b, ease.x), mix(c, d, ease.x), ease.y);
  }

  vec4 scene(vec2 uv) {
    return texture2D(uScene, clamp(uv, 0.0, 1.0));
  }

  void main() {
    vec2 pixel = 1.0 / max(uResolution, vec2(1.0));
    vec2 p = vUv - 0.5;
    p.x *= uResolution.x / max(1.0, uResolution.y);
    float radiusSquared = dot(p, p);
    float presence = clamp(uPresence, 0.0, 1.0);

    // Gate motion is deterministic, closed and bounded. At zero the scene is
    // sampled at its exact authored coordinates.
    vec2 weave = vec2(
      sin(uPhase * 2.0 + uSeed * 0.07),
      cos(uPhase * 3.0 + uSeed * 0.11)
    ) * pixel * uGateWeave * presence * 2.2;
    vec2 curved = p * (1.0 + uCurvature * presence * radiusSquared * 0.16);
    curved.x /= uResolution.x / max(1.0, uResolution.y);
    vec2 uv = curved + 0.5 + weave;

    float edge = smoothstep(0.02, 0.78, radiusSquared);
    vec2 focusOffset = pixel * (0.4 + edge * 2.6) * uFocus * presence;
    vec2 smearOffset = uVelocity * pixel * uSmear * presence * 9.0;
    vec4 center = scene(uv);
    vec4 softA = scene(uv + focusOffset + smearOffset);
    vec4 softB = scene(uv - focusOffset - smearOffset);
    vec4 softC = scene(uv + vec2(focusOffset.x, -focusOffset.y));
    vec4 softD = scene(uv + vec2(-focusOffset.x, focusOffset.y));
    vec4 softened = (center * 4.0 + softA + softB + softC + softD) / 8.0;

    // Radial split has an exact zero at the optical centre. Smear has an exact
    // zero whenever canonical velocity is zero.
    vec2 radial = normalize(p + vec2(0.0000001)) * length(p);
    vec2 chromaOffset = radial * pixel * uChromatic * presence * 5.0;
    float red = scene(uv + chromaOffset).r;
    float blue = scene(uv - chromaOffset).b;
    vec3 colour = vec3(red, softened.g, blue);

    vec4 glowA = scene(uv + pixel * vec2(3.0, 0.0));
    vec4 glowB = scene(uv - pixel * vec2(3.0, 0.0));
    vec4 glowC = scene(uv + pixel * vec2(0.0, 3.0));
    vec4 glowD = scene(uv - pixel * vec2(0.0, 3.0));
    vec3 glow = (glowA.rgb + glowB.rgb + glowC.rgb + glowD.rgb) * 0.25;
    float glowLuma = dot(glow, vec3(0.2126, 0.7152, 0.0722));
    float highlight = smoothstep(0.56, 0.94, glowLuma);
    colour += glow * highlight * uBloom * presence * 0.26;
    colour += vec3(glow.r, glow.g * 0.22, 0.0) * highlight * uHalation * presence * 0.2;

    float flareLine = exp(-abs(p.y + sin(uPhase) * 0.035) * 72.0);
    float flareGate = smoothstep(0.58, 0.98, glowLuma);
    colour += vec3(0.92, 0.68, 0.42) * flareLine * flareGate * uFlare * presence * 0.24;

    float vignette = smoothstep(0.94, 0.12, radiusSquared);
    colour *= mix(1.0 - uVignette * presence * 0.62, 1.0, vignette);

    float fine = valueNoise(vUv * uResolution / 1.35, uGrainFrame);
    float clump = valueNoise(vUv * uResolution / 3.4 + 41.0, uGrainFrame + 17.0);
    float grain = ((fine - 0.5) * 0.76 + (clump - 0.5) * 0.24) * 2.0;
    float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    float grainToe = smoothstep(0.004, 0.04, luma);
    colour += grain * uCameraGrain * presence * 0.055 * grainToe;

    float alpha = max(center.a, max(max(softA.a, softB.a), max(softC.a, softD.a)));
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(clamp(colour, 0.0, 1.0), alpha);
    #include <colorspace_fragment>
  }
`;
