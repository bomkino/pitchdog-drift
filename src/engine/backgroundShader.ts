import { auraBackgroundBranch } from "./backgroundShaders/aura";
import { gradientBackgroundBranch } from "./backgroundShaders/gradient";
import { paperBackgroundBranch } from "./backgroundShaders/paper";
import { solidBackgroundBranch } from "./backgroundShaders/solid";
import { voidBackgroundBranch } from "./backgroundShaders/void";

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
  uniform float uGrainFrame;
  uniform float uGrainSeed;
  uniform float uVignette;
  uniform float uPhase;
  uniform float uSeed;
  uniform float uOpacity;

  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;
  const float BACKGROUND_VARIANT_COUNT = 8.0;
  const float BACKGROUND_ATLAS_SEED_BASE = 10000.0;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash12(cell);
    float b = hash12(cell + vec2(1.0, 0.0));
    float c = hash12(cell + vec2(0.0, 1.0));
    float d = hash12(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float grainHash12(vec2 p) {
    vec2 seedShift = vec2(uGrainSeed * 0.754877666, uGrainSeed * 0.569840296);
    vec3 p3 = fract(vec3((p + seedShift).xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float grainValueNoise(vec2 p, float frame) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 ease = local * local * (3.0 - 2.0 * local);
    vec2 frameOffset = vec2(frame * 19.19, frame * 73.73);
    float a = grainHash12(cell + frameOffset);
    float b = grainHash12(cell + vec2(1.0, 0.0) + frameOffset);
    float c = grainHash12(cell + vec2(0.0, 1.0) + frameOffset);
    float d = grainHash12(cell + vec2(1.0, 1.0) + frameOffset);
    return mix(mix(a, b, ease.x), mix(c, d, ease.x), ease.y);
  }

  float filmGrain(vec2 pixel, float frame) {
    float fine = grainValueNoise(pixel / 1.35, frame);
    float clump = grainValueNoise(pixel / 3.4 + 41.0, frame + 17.0);
    return ((fine - 0.5) * 0.76 + (clump - 0.5) * 0.24) * 2.0;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 4; octave += 1) {
      value += valueNoise(p) * amplitude;
      p = turn * p * 2.03 + vec2(17.17, 9.23);
      amplitude *= 0.5;
    }
    return value;
  }

  float ridgedFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    mat2 turn = mat2(0.86, -0.51, 0.51, 0.86);
    for (int octave = 0; octave < 4; octave += 1) {
      float ridge = 1.0 - abs(valueNoise(p) * 2.0 - 1.0);
      value += ridge * ridge * amplitude;
      p = turn * p * 2.07 + vec2(11.03, 23.61);
      amplitude *= 0.48;
    }
    return value;
  }

  mat2 rotate2d(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
  }

  float softBlob(vec2 p, vec2 center, float radius) {
    return 1.0 - smoothstep(0.0, radius, length(p - center));
  }

  float softEllipse(vec2 p, vec2 center, vec2 radius, float feather) {
    float distanceToCenter = length((p - center) / max(radius, vec2(0.0001)));
    return 1.0 - smoothstep(1.0 - feather, 1.0 + feather, distanceToCenter);
  }

  float softRing(vec2 p, vec2 center, vec2 radius, float width, float feather) {
    float distanceToRing = abs(length((p - center) / max(radius, vec2(0.0001))) - 1.0);
    return 1.0 - smoothstep(width, width + feather, distanceToRing);
  }

  float softBand(float coordinate, float center, float halfWidth, float feather) {
    return 1.0 - smoothstep(halfWidth, halfWidth + feather, abs(coordinate - center));
  }

  float gridLine(float coordinate, float frequency, float width) {
    float cell = abs(fract(coordinate * frequency) - 0.5);
    return smoothstep(0.5 - width, 0.5, cell);
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    float aspect = uResolution.x / max(1.0, uResolution.y);
    p.x *= aspect;

    // Seeds below 10,000 keep the old background grammar. Atlas studies live
    // in a reserved range, so schema-v1 project files remain readable and old
    // theme seeds still resolve to their original composition (variant zero).
    float normalizedSeed = max(0.0, floor(uSeed + 0.5));
    float atlasEnabled = step(BACKGROUND_ATLAS_SEED_BASE, normalizedSeed);
    float atlasAddress = max(0.0, normalizedSeed - BACKGROUND_ATLAS_SEED_BASE);
    float atlasVariant = mix(0.0, mod(atlasAddress, BACKGROUND_VARIANT_COUNT), atlasEnabled);
    float variation = mix(normalizedSeed, floor(atlasAddress / BACKGROUND_VARIANT_COUNT), atlasEnabled);

    vec2 variationKey = vec2(variation * 0.071 + 3.17, variation * 0.113 + 9.41);
    vec2 seedOffset = vec2(hash12(variationKey), hash12(variationKey + 31.7)) - 0.5;
    float seedAngle = (hash12(variationKey + 67.3) - 0.5) * TAU;
    float seedScale = mix(0.82, 1.24, hash12(variationKey + 97.1));
    vec2 closedDrift = vec2(cos(uPhase), sin(uPhase)) * uMotion;
    vec2 closedDriftTwo = vec2(cos(uPhase * 2.0 + 1.7), sin(uPhase * 2.0 + 1.7)) * uMotion;
    vec2 q = rotate2d(seedAngle * 0.24) * p * seedScale + seedOffset * 0.34;
    float wave = sin(uPhase) * uMotion;
    vec3 color = uColorA;

${solidBackgroundBranch}
${gradientBackgroundBranch}
${auraBackgroundBranch}
${paperBackgroundBranch}
${voidBackgroundBranch}

    // Shared treatment: aspect-correct vignette. Grain remains a distinct
    // finishing plate so paper texture, atmosphere and camera stock never blur
    // into one generic noise control.
    float centerMask = 1.0 - smoothstep(0.18, 0.92, dot(p, p));
    color *= mix(1.0 - uVignette * 0.62, 1.0, centerMask);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>

    // Held 12 fps, two-scale monochrome grain: visible in dark rooms without
    // devolving into single-pixel television snow.
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
