// Metal shading-language helpers shared by every shader library in the studio.
//
// Simplex noise 3D/4D is ported from "webgl-noise" by Ian McEwan and
// Stefan Gustavson (Ashima Arts), MIT licence. Everything else is original.

public enum ShaderPrelude {
    public static let source: String = #"""
#include <metal_stdlib>
using namespace metal;

// ───────────────────────────── constants
constant float PI  = 3.14159265358979;
constant float TAU = 6.28318530717959;

// ───────────────────────────── fullscreen triangle
struct FSOut {
    float4 position [[position]];
    float2 uv;
};

vertex FSOut fs_vertex(uint vid [[vertex_id]]) {
    float2 p = float2(float((vid << 1) & 2), float(vid & 2));
    FSOut o;
    o.position = float4(p * 2.0 - 1.0, 0.0, 1.0);
    o.uv = float2(p.x, 1.0 - p.y);
    return o;
}

// ───────────────────────────── hashing (PCG family, integer exact)
inline uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
inline uint3 pcg3d(uint3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    return v;
}
inline float u2f(uint v) { return float(v) * (1.0 / 4294967295.0); }
inline float hash1(int2 p, uint seed) { return u2f(pcg3d(uint3(uint(p.x), uint(p.y), seed)).x); }
inline float2 hash2(int2 p, uint seed) { uint3 h = pcg3d(uint3(uint(p.x), uint(p.y), seed)); return float2(u2f(h.x), u2f(h.y)); }
inline float3 hash3(int3 p) { uint3 h = pcg3d(uint3(p)); return float3(u2f(h.x), u2f(h.y), u2f(h.z)); }
inline float hashf(float2 p, float seed) {
    return hash1(int2(floor(p)), uint(seed * 7919.0) + 17u);
}

// ───────────────────────────── simplex noise (Ashima / Gustavson, MIT)
inline float3 mod289(float3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
inline float4 mod289(float4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
inline float  mod289(float x)  { return x - floor(x * (1.0 / 289.0)) * 289.0; }
inline float4 permute(float4 x) { return mod289(((x * 34.0) + 1.0) * x); }
inline float  permute(float x)  { return mod289(((x * 34.0) + 1.0) * x); }
inline float4 taylorInvSqrt(float4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
inline float  taylorInvSqrt(float r)  { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3(float3 v) {
    const float2 C = float2(1.0 / 6.0, 1.0 / 3.0);
    const float4 D = float4(0.0, 0.5, 1.0, 2.0);
    float3 i  = floor(v + dot(v, C.yyy));
    float3 x0 = v - i + dot(i, C.xxx);
    float3 g = step(x0.yzx, x0.xyz);
    float3 l = 1.0 - g;
    float3 i1 = min(g.xyz, l.zxy);
    float3 i2 = max(g.xyz, l.zxy);
    float3 x1 = x0 - i1 + C.xxx;
    float3 x2 = x0 - i2 + C.yyy;
    float3 x3 = x0 - D.yyy;
    i = mod289(i);
    float4 p = permute(permute(permute(
                 i.z + float4(0.0, i1.z, i2.z, 1.0))
               + i.y + float4(0.0, i1.y, i2.y, 1.0))
               + i.x + float4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    float3 ns = n_ * D.wyz - D.xzx;
    float4 j = p - 49.0 * floor(p * ns.z * ns.z);
    float4 x_ = floor(j * ns.z);
    float4 y_ = floor(j - 7.0 * x_);
    float4 x = x_ * ns.x + ns.yyyy;
    float4 y = y_ * ns.x + ns.yyyy;
    float4 h = 1.0 - abs(x) - abs(y);
    float4 b0 = float4(x.xy, y.xy);
    float4 b1 = float4(x.zw, y.zw);
    float4 s0 = floor(b0) * 2.0 + 1.0;
    float4 s1 = floor(b1) * 2.0 + 1.0;
    float4 sh = -step(h, float4(0.0));
    float4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    float4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    float3 p0 = float3(a0.xy, h.x);
    float3 p1 = float3(a0.zw, h.y);
    float3 p2 = float3(a1.xy, h.z);
    float3 p3 = float3(a1.zw, h.w);
    float4 norm = taylorInvSqrt(float4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    float4 m = max(0.6 - float4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, float4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

inline float4 grad4(float j, float4 ip) {
    const float4 ones = float4(1.0, 1.0, 1.0, -1.0);
    float4 p;
    p.xyz = floor(fract(float3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    float4 s = select(float4(0.0), float4(1.0), p < float4(0.0));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
    return p;
}

float snoise4(float4 v) {
    const float4 C = float4(0.138196601125011, 0.276393202250021, 0.414589803375032, -0.447213595499958);
    const float F4 = 0.309016994374947451;
    float4 i  = floor(v + dot(v, float4(F4)));
    float4 x0 = v - i + dot(i, C.xxxx);
    float4 i0;
    float3 isX  = step(x0.yzw, x0.xxx);
    float3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;
    float4 i3 = clamp(i0, 0.0, 1.0);
    float4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    float4 i1 = clamp(i0 - 2.0, 0.0, 1.0);
    float4 x1 = x0 - i1 + C.xxxx;
    float4 x2 = x0 - i2 + C.yyyy;
    float4 x3 = x0 - i3 + C.zzzz;
    float4 x4 = x0 + C.wwww;
    i = mod289(i);
    float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
    float4 j1 = permute(permute(permute(permute(
                 i.w + float4(i1.w, i2.w, i3.w, 1.0))
               + i.z + float4(i1.z, i2.z, i3.z, 1.0))
               + i.y + float4(i1.y, i2.y, i3.y, 1.0))
               + i.x + float4(i1.x, i2.x, i3.x, 1.0));
    float4 ip = float4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);
    float4 p0 = grad4(j0, ip);
    float4 p1 = grad4(j1.x, ip);
    float4 p2 = grad4(j1.y, ip);
    float4 p3 = grad4(j1.z, ip);
    float4 p4 = grad4(j1.w, ip);
    float4 norm = taylorInvSqrt(float4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4, p4));
    float3 m0 = max(0.6 - float3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
    float2 m1 = max(0.6 - float2(dot(x3, x3), dot(x4, x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;
    return 49.0 * (dot(m0 * m0, float3(dot(p0, x0), dot(p1, x1), dot(p2, x2)))
                 + dot(m1 * m1, float2(dot(p3, x3), dot(p4, x4))));
}

// Looping noise: evolve a 2D field over a closed circle in the 3rd/4th
// dimensions so frame 0 and frame N are identical by construction.
inline float4 loopCoord(float2 p, float phase, float radius, float seed) {
    float a = phase * TAU;
    return float4(p, radius * cos(a) + seed * 3.17, radius * sin(a) - seed * 1.93);
}
inline float lnoise(float2 p, float phase, float radius, float seed) {
    return snoise4(loopCoord(p, phase, radius, seed));
}

// Fractal sums. Octaves are rotated to hide lattice alignment.
constant float2x2 OCT_ROT = float2x2(float2(0.8, 0.6), float2(-0.6, 0.8));

float fbm_loop(float2 p, float phase, float radius, float seed, int octaves, float gain) {
    float sum = 0.0, amp = 0.5, norm = 0.0;
    for (int i = 0; i < octaves; i++) {
        sum += amp * lnoise(p, phase, radius, seed + float(i) * 13.1);
        norm += amp;
        p = OCT_ROT * p * 2.03 + float2(1.7, 9.2);
        amp *= gain;
    }
    return sum / max(norm, 1e-4);
}

float fbm3(float3 p, int octaves, float gain) {
    float sum = 0.0, amp = 0.5, norm = 0.0;
    for (int i = 0; i < octaves; i++) {
        sum += amp * snoise3(p);
        norm += amp;
        p = float3(OCT_ROT * p.xy, p.z) * 2.03 + float3(1.7, 9.2, 3.1);
        amp *= gain;
    }
    return sum / max(norm, 1e-4);
}

// Ridged fractal, 0..1.
float ridged_loop(float2 p, float phase, float radius, float seed, int octaves) {
    float sum = 0.0, amp = 0.5, norm = 0.0;
    for (int i = 0; i < octaves; i++) {
        float n = 1.0 - abs(lnoise(p, phase, radius, seed + float(i) * 7.7));
        sum += amp * n * n;
        norm += amp;
        p = OCT_ROT * p * 2.07 + float2(4.1, 2.3);
        amp *= 0.5;
    }
    return sum / max(norm, 1e-4);
}

// Worley / Voronoi. Returns (F1, F2, cell id hash).
float3 voronoi(float2 x, float jitter, float phase, uint seed) {
    int2 n = int2(floor(x));
    float2 f = fract(x);
    float F1 = 8.0, F2 = 8.0, id = 0.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            int2 g = int2(i, j);
            float2 h = hash2(n + g, seed);
            float a = phase * TAU + h.x * TAU;
            float2 o = 0.5 + jitter * 0.5 * float2(sin(a + h.y * 5.0), cos(a * 1.0 + h.x * 3.0));
            float2 r = float2(g) + o - f;
            float d = dot(r, r);
            if (d < F1) { F2 = F1; F1 = d; id = h.y; }
            else if (d < F2) { F2 = d; }
        }
    }
    return float3(sqrt(F1), sqrt(F2), id);
}

// Smooth minimum (polynomial), for soft unions.
inline float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// ───────────────────────────── colour
inline float3 srgb_to_linear(float3 c) {
    return select(pow((c + 0.055) / 1.055, float3(2.4)), c / 12.92, c <= 0.04045);
}
inline float3 linear_to_srgb(float3 c) {
    c = max(c, float3(0.0));
    return select(1.055 * pow(c, float3(1.0 / 2.4)) - 0.055, c * 12.92, c <= 0.0031308);
}
inline float luma(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }

inline float3 oklab_to_linear(float3 c) {
    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
    float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return float3( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                  -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                  -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
inline float3 cbrt3(float3 v) { return sign(v) * pow(abs(v), float3(1.0 / 3.0)); }
inline float3 linear_to_oklab(float3 c) {
    float3 lms = float3(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b,
                        0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b,
                        0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
    float3 q = cbrt3(lms);
    return float3(0.2104542553 * q.x + 0.7936177850 * q.y - 0.0040720468 * q.z,
                  1.9779984951 * q.x - 2.4285922050 * q.y + 0.4505937099 * q.z,
                  0.0259040371 * q.x + 0.7827717662 * q.y - 0.8086757660 * q.z);
}

// Palette buffer layout: [0..7] linear RGB, [8..15] OKLab (sorted dark → light).
#define PAL_LAB 8
inline float3 palColor(constant float4 *pal, uint i) { return pal[i].rgb; }
inline float3 palLab(constant float4 *pal, uint i) { return pal[PAL_LAB + i].rgb; }

// Perceptual ramp through the palette, dark → light.
float3 palRamp(constant float4 *pal, uint count, float t) {
    uint n = max(count, 2u);
    t = clamp(t, 0.0, 1.0) * float(n - 1);
    uint i = min(uint(floor(t)), n - 2);
    float f = t - float(i);
    f = f * f * (3.0 - 2.0 * f);
    return max(oklab_to_linear(mix(palLab(pal, i), palLab(pal, i + 1), f)), float3(0.0));
}
inline float3 mixLab(float3 a, float3 b, float t) {
    return max(oklab_to_linear(mix(linear_to_oklab(a), linear_to_oklab(b), t)), float3(0.0));
}

// ───────────────────────────── shaping
inline float sat(float x) { return clamp(x, 0.0, 1.0); }
inline float remap(float x, float a, float b, float c, float d) { return c + (d - c) * (x - a) / (b - a); }
inline float gain(float x, float k) {
    float a = 0.5 * pow(2.0 * ((x < 0.5) ? x : 1.0 - x), k);
    return (x < 0.5) ? a : 1.0 - a;
}
inline float2 rot2(float2 p, float a) { float c = cos(a), s = sin(a); return float2(c * p.x - s * p.y, s * p.x + c * p.y); }

// Signed distance to a rounded box centred at the origin.
inline float sdRoundBox(float2 p, float2 halfSize, float r) {
    float2 q = abs(p) - halfSize + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Triangular-distribution dither for 8-bit quantisation.
inline float3 ditherTri(uint2 pixel, uint frame) {
    uint3 h = pcg3d(uint3(pixel, frame * 3u + 11u));
    float3 a = float3(u2f(h.x), u2f(h.y), u2f(h.z));
    uint3 k = pcg3d(uint3(pixel.yx, frame * 5u + 7u));
    float3 b = float3(u2f(k.x), u2f(k.y), u2f(k.z));
    return (a + b - 1.0) / 255.0;
}
"""#
}
