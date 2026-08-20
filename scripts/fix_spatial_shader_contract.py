#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SHADERS = r'''export const slideVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWarp;
  varying float vSurfaceLight;

  uniform float uVelocity;
  uniform float uDistortion;
  uniform float uAxis;
  uniform float uPhase;
  uniform float uTime;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float along = uAxis < 0.5 ? uv.x - 0.5 : uv.y - 0.5;
    float across = uAxis < 0.5 ? uv.y - 0.5 : uv.x - 0.5;
    float velocity = clamp(uVelocity, -1.0, 1.0);
    float direction = sign(velocity + 0.0001);
    float edgeAlong = sin(uv.x * 3.14159265);
    float edgeAcross = sin(uv.y * 3.14159265);
    float envelope = max(0.0, edgeAlong * edgeAcross);
    float surface = floor(max(0.0, uPhase));
    float slidePhase = fract(uPhase) * 6.28318530718;
    float phase = uTime + slidePhase;
    float energy = clamp(abs(velocity) * 0.82 + 0.12, 0.0, 1.0) * uDistortion;
    float warp = 0.0;
    float shear = 0.0;

    if (surface < 0.5) {
      // Card: mostly rigid, with a restrained bow and a crisp torsional edge.
      float bow = (1.0 - across * across * 4.0) * (1.0 - along * along * 3.4);
      warp = bow * energy * 19.0 + across * along * direction * energy * 14.0;
      shear = across * direction * energy * 0.004;
    } else if (surface < 1.5) {
      // Paper: cylindrical curl, slight buckle, no rubbery high-frequency wobble.
      float curl = along * along * direction * 74.0;
      float buckle = sin(along * 8.4 + phase) * envelope * 14.0;
      warp = (curl + buckle) * energy * (0.68 + edgeAcross * 0.32);
      shear = sin(across * 4.2 + phase) * envelope * energy * 0.006;
    } else if (surface < 2.5) {
      // Silk: broad travelling folds with pinned, quiet edges.
      float foldA = sin(along * 10.0 - phase + across * 2.2);
      float foldB = sin(along * 4.4 + phase * 2.0 - across * 7.0) * 0.48;
      float bias = sin(across * 5.0 + phase) * 0.24;
      warp = (foldA + foldB + bias) * envelope * energy * 48.0;
      shear = (foldB + bias) * envelope * energy * 0.012;
    } else {
      // Gel: one coherent elastic mass, with a delayed velocity bulge.
      float radius = length(vec2(along * 1.15, across));
      float bulge = cos(radius * 7.4 - phase) * (1.0 - smoothstep(0.0, 0.72, radius));
      float lag = velocity * along * 26.0;
      warp = (bulge * 42.0 + lag) * energy * envelope;
      shear = velocity * across * energy * 0.008;
    }

    if (uAxis > 0.5) transformed.x += shear;
    else transformed.y += shear;
    transformed.z += warp;
    vWarp = warp;
    vSurfaceLight = clamp(0.5 + warp * 0.0065 + across * direction * energy * 0.18, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

export const slideFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying float vWarp;
  varying float vSurfaceLight;

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

    float fabricShade = mix(0.955, 1.055, vSurfaceLight);
    float grazing = smoothstep(10.0, 54.0, abs(vWarp)) * 0.035;
    sampled.rgb = sampled.rgb * fabricShade + grazing;

    // Slide-locked grain: tactile, stable at rest, and closed at seamless cuts.
    vec2 grainCell = floor(vUv * max(uSizePx, vec2(1.0)));
    float grain = hash12(grainCell + vec2(fract(uPhase) * 41.0, fract(uPhase) * 73.0)) - 0.5;
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

    float vignette = 1.0 - smoothstep(0.18, 0.88, dot(p, p));
    color *= mix(1.0 - uVignette * 0.62, 1.0, vignette);
    float grain = (hash12(gl_FragCoord.xy + vec2(cos(uPhase), sin(uPhase)) * 97.0) - 0.5) * uGrain * 0.16;
    color += grain;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
'''


def main() -> None:
    (ROOT / "src/engine/shaders.ts").write_text(SHADERS, encoding="utf-8")


if __name__ == "__main__":
    main()
