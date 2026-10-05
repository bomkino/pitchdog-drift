// Backdrop looks. Every look is an analytic function of (position, loop phase,
// seed, controls), so any frame can be rendered in any order and the last frame
// of a loop meets the first exactly. Colours are linear, premultiplied.

import RenderCore

enum BackdropShaders {
    static let source: String = #"""
struct BDU {
    float width, height, aspect, phase;
    float time, seed, scale, motion;
    float detail, softness, accent, loopSeconds;
    float colorCount, transparent, vignette, brightness;
};

#define BD_ARGS float2 uv, constant BDU &u, constant float4 *pal
inline uint ncol(constant BDU &u) { return uint(u.colorCount); }
inline float2 ctr(float2 uv, constant BDU &u) { return (uv - 0.5) * float2(u.aspect, 1.0); }
inline float3 pc(constant float4 *pal, constant BDU &u, uint i) { return palColor(pal, min(i, ncol(u) - 1u)); }
inline float3 pr(constant float4 *pal, constant BDU &u, float t) { return palRamp(pal, ncol(u), t); }

// Soft blob field shared by several looks (mesh-like colour pools).
float3 blobField(float2 p, constant BDU &u, constant float4 *pal, float sigma, float wander, float sharp, float groundT) {
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float3 ground = mix(palLab(pal, 0), palLab(pal, n - 1u), groundT);
    float3 acc = ground * 0.12;
    float wsum = 0.12;
    for (uint i = 0; i < 8u; i++) {
        if (i >= n) break;
        float2 h = hash2(int2(int(i) * 17 + 3, int(u.seed) * 7 + 11), 91u);
        float2 base = (h - 0.5) * float2(u.aspect * 0.95, 0.95);
        float k1 = (i % 2u == 0u) ? 1.0 : 2.0;
        float k2 = (i % 3u == 0u) ? 2.0 : 1.0;
        float2 orbit = float2(sin(ph * k1 + h.x * TAU), cos(ph * k2 + h.y * TAU)) * wander * float2(u.aspect * 0.55, 0.55);
        float2 d = p - (base + orbit);
        float wi = exp(-dot(d, d) / (2.0 * sigma * sigma));
        wi = pow(wi, sharp);
        acc += palLab(pal, i) * wi;
        wsum += wi;
    }
    return max(oklab_to_linear(acc / wsum), float3(0.0));
}

// ─────────────────────────────────────────────── GROUND

float4 bd_mesh(BD_ARGS) {
    float2 p = ctr(uv, u);
    float r = mix(0.15, 0.9, u.motion);
    float2 w = float2(lnoise(p * 1.4, u.phase, r * 0.7, u.seed), lnoise(p * 1.4 + 7.3, u.phase, r * 0.7, u.seed + 3.0));
    p += w * (0.03 + 0.18 * u.detail);
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float3 acc = float3(0.0);
    float wsum = 0.0;
    float pw = mix(3.2, 1.4, u.softness);
    float spread = mix(0.55, 1.15, u.scale);
    for (uint i = 0; i < 8u; i++) {
        if (i >= n) break;
        float2 h = hash2(int2(int(i) * 17 + 3, int(u.seed) * 7 + 11), 91u);
        float2 base = (h - 0.5) * float2(u.aspect, 1.0) * spread;
        float k1 = (i % 2u == 0u) ? 1.0 : 2.0;
        float k2 = (i % 3u == 0u) ? 2.0 : 1.0;
        float2 orbit = float2(sin(ph * k1 + h.x * TAU), cos(ph * k2 + h.y * TAU)) * mix(0.03, 0.28, u.motion) * float2(u.aspect * 0.5, 0.5);
        float2 d = p - (base + orbit);
        float wi = 1.0 / pow(dot(d, d) + 0.004, pw * 0.5);
        float3 lab = palLab(pal, i);
        lab.x = mix(lab.x, max(lab.x, 0.35), u.accent * 0.6);
        acc += lab * wi;
        wsum += wi;
    }
    float3 c = max(oklab_to_linear(acc / wsum), float3(0.0));
    return float4(c, 1.0);
}

float4 bd_studio(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float h = mix(0.26, -0.10, u.scale);
    float3 top = pc(pal, u, 0);
    float3 mid = pc(pal, u, 1);
    float3 lit = pc(pal, u, n > 3u ? n - 2u : n - 1u);
    float3 glowC = pc(pal, u, n - 1u);
    float t = sat((p.y + 0.5) / (h + 0.5 + 1e-3));
    float3 wall = mixLab(top, mid, smoothstep(0.0, 1.0, t));
    float fb = sat((p.y - h) / (0.5 - h + 1e-3));
    float3 flo = mixLab(mixLab(mid, lit, 0.35), top, pow(fb, 0.75) * 0.8);
    float band = mix(0.03, 0.22, u.softness);
    float3 c = mix(wall, flo, smoothstep(h - band, h + band, p.y));
    float glow = exp(-pow((p.y - h) / (0.05 + 0.22 * u.softness), 2.0));
    c += glowC * glow * (0.04 + 0.22 * u.accent);
    float2 lp = float2(sin(ph) * 0.10 * u.motion * u.aspect, h - 0.28 + cos(ph) * 0.04 * u.motion);
    float2 d = (p - lp) * float2(0.75, 1.15);
    float pool = exp(-dot(d, d) * mix(10.0, 1.6, u.detail));
    c = c * (0.50 + 0.75 * pool) + lit * pool * 0.05;
    float m = fbm3(float3(p * 2.4, u.seed * 0.13), 3, 0.5);
    c *= 1.0 + m * 0.04;
    return float4(max(c, 0.0), 1.0);
}

float4 bd_fade(BD_ARGS) {
    float2 p = ctr(uv, u);
    float ph = u.phase * TAU;
    float ang = mix(-0.6, 0.6, u.accent) * PI + sin(ph) * 0.12 * u.motion;
    float2 dir = float2(sin(ang), cos(ang));
    float t = dot(p, dir) / (0.5 * (abs(dir.x) * u.aspect + abs(dir.y)) + 1e-3) * 0.5 + 0.5;
    float r = mix(0.1, 0.7, u.motion);
    t += lnoise(p * mix(0.6, 2.4, u.scale), u.phase, r, u.seed) * (0.04 + 0.22 * u.detail);
    t = mix(t, smoothstep(0.0, 1.0, t), 1.0 - u.softness);
    return float4(pr(pal, u, t), 1.0);
}

// ─────────────────────────────────────────────── PAPER

float4 bd_paper(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float3 base = pr(pal, u, mix(0.55, 1.0, 1.0 - u.accent));
    float mott = fbm3(float3(p * mix(1.2, 4.0, u.scale), u.seed * 0.37), 4, 0.55);
    float fib = 0.0;
    for (int k = 0; k < 4; k++) {
        float a = hash1(int2(k, 3), uint(u.seed) + 41u) * PI;
        float2 q = rot2(p, a) * float2(3.0, 70.0) * mix(0.6, 1.4, u.scale);
        fib += snoise3(float3(q, float(k) * 7.1 + u.seed));
    }
    fib = fib * 0.25;
    float fine = snoise3(float3(p * 420.0, u.seed));
    float ph = u.phase * TAU;
    float2 lp = float2(cos(ph), sin(ph)) * 0.35 * u.motion;
    float light = 1.0 + 0.10 * u.motion * (1.0 - length(p - lp) * 0.9);
    float3 c = base * (1.0 + mott * (0.03 + 0.07 * u.softness)) * light;
    c *= 1.0 - max(fib, 0.0) * (0.02 + 0.08 * u.detail);
    c *= 1.0 + fine * 0.012;
    (void)n;
    return float4(max(c, 0.0), 1.0);
}

float4 bd_riso(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float3 paper = pc(pal, u, n - 1u);
    float3 inkA = pc(pal, u, n > 2u ? n - 3u : 0u);
    float3 inkB = pc(pal, u, n > 3u ? 1u : 0u);
    float r = mix(0.1, 0.8, u.motion);
    float sc = mix(0.5, 2.0, u.scale);
    float fa = smoothstep(-0.35, 0.55, lnoise(p * sc, u.phase, r, u.seed));
    float fb = smoothstep(-0.25, 0.65, lnoise(p * sc * 0.8 + 4.1, u.phase, r, u.seed + 9.0));
    float px = max(u.height / 540.0, 1.0) * mix(1.0, 3.0, u.detail);
    int2 cell = int2(floor(uv * float2(u.width, u.height) / px));
    float ta = hash1(cell, uint(u.seed) + 3u), tb = hash1(cell + int2(3, 1), uint(u.seed) + 8u);
    float softA = mix(step(ta, fa), fa, u.softness * 0.6);
    float softB = mix(step(tb, fb), fb, u.softness * 0.6);
    float3 c = paper;
    c *= mix(float3(1.0), inkA / max(paper, float3(0.02)), softA * 0.92);
    c *= mix(float3(1.0), inkB / max(paper, float3(0.02)), softB * 0.85);
    return float4(max(c, 0.0), 1.0);
}

// ─────────────────────────────────────────────── INK & WASH

float4 bd_wash(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float3 paper = pc(pal, u, n - 1u);
    float r = mix(0.08, 0.6, u.motion);
    float sc = mix(0.35, 1.3, u.scale);
    float3 c = paper;
    for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float2 q = p * sc + float2(fk * 3.1, fk * 1.7);
        float2 wq = float2(fbm_loop(q, u.phase, r, u.seed + fk, 3, 0.5), fbm_loop(q + 5.2, u.phase, r, u.seed + fk + 2.0, 3, 0.5));
        float d = fbm_loop(q + wq * (0.8 + 1.2 * u.detail), u.phase, r, u.seed + 10.0 + fk, 5, 0.55);
        if (k == 2 && u.detail < 0.5) break;
        float thr = mix(0.20, -0.15, u.accent) + fk * 0.10;
        float w = mix(0.015, 0.20, u.softness);
        float cov = smoothstep(thr, thr + w, d);
        float ring = smoothstep(thr, thr + w * 0.25, d) * (1.0 - smoothstep(thr + w * 0.25, thr + w * 1.6, d));
        float inner = 0.5 + 0.5 * fbm3(float3(q * 2.3, fk * 3.1 + u.seed), 3, 0.5);
        float gran = 0.9 + 0.2 * snoise3(float3(p * 300.0, fk + u.seed));
        float3 pig = pc(pal, u, uint(k));
        float dens = (cov * (0.30 + 0.35 * inner) + ring * 0.45) * gran;
        float3 tint = mix(float3(1.0), pig / max(paper, float3(0.03)), sat(dens));
        c *= tint;
    }
    return float4(max(c, 0.0), 1.0);
}

float4 bd_ink(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float r = mix(0.1, 0.6, u.motion);
    float sc = mix(0.35, 1.2, u.scale);
    float2 q = p * sc;
    float2 a = float2(fbm_loop(q, u.phase, r, u.seed, 3, 0.5), fbm_loop(q + float2(5.2, 1.3), u.phase, r, u.seed + 1.0, 3, 0.5));
    float2 b = float2(fbm_loop(q + 1.8 * a + float2(1.7, 9.2), u.phase, r, u.seed + 2.0, 3, 0.5),
                      fbm_loop(q + 1.8 * a + float2(8.3, 2.8), u.phase, r, u.seed + 3.0, 3, 0.5));
    float f = fbm_loop(q + (1.4 + 1.6 * u.detail) * b, u.phase, r, u.seed + 4.0, 4, 0.5);
    // Where the ink has spread: leaves open paper around it.
    float reach = fbm_loop(p * 1.3 + 11.0, u.phase, r * 0.5, u.seed + 9.0, 3, 0.5);
    float spread = smoothstep(mix(0.05, -0.45, u.accent), mix(0.3, -0.15, u.accent), reach);
    float tendril = pow(sat(1.0 - abs(f) * mix(5.0, 2.2, u.softness)), 3.0);
    float pool = smoothstep(0.05, 0.55, f) * 0.55;
    float density = sat(tendril * 0.95 + pool) * spread;
    float3 paper = pc(pal, u, n - 1u);
    float3 ink = pr(pal, u, 0.08);
    float3 c = mixLab(paper, ink, density * 0.92);
    float grainN = snoise3(float3(p * 220.0, u.seed)) * 0.015;
    c *= 1.0 + grainN;
    return float4(max(c, 0.0), 1.0);
}

// ─────────────────────────────────────────────── LIGHT

float4 bd_bloom(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float3 c = pc(pal, u, 0) * 0.9;
    float haze = 0.5 + 0.5 * lnoise(p * 1.1, u.phase, 0.4 * u.motion + 0.1, u.seed + 50.0);
    c += pc(pal, u, 1) * haze * 0.10;
    int count = int(mix(3.0, 7.0, u.detail));
    for (int i = 0; i < 7; i++) {
        if (i >= count) break;
        float2 h = hash2(int2(i * 13 + 5, int(u.seed) + 29), 7u);
        float2 base = (h - 0.5) * float2(u.aspect * 0.85, 0.8);
        float k = (i % 2 == 0) ? 1.0 : 2.0;
        float2 orbit = float2(sin(ph * k + h.y * TAU), cos(ph + h.x * TAU)) * mix(0.02, 0.22, u.motion) * float2(u.aspect * 0.6, 0.6);
        float rad = mix(0.10, 0.36, u.scale) * (0.6 + 0.8 * hash1(int2(i, 77), uint(u.seed)));
        float2 d = p - (base + orbit);
        float dd = length(d) / rad;
        float core = exp(-dd * dd * mix(2.6, 1.0, u.softness));
        float halo = 0.10 / (1.0 + dd * dd * 1.8);
        float3 lc = pc(pal, u, n - 1u - uint(i) % max(n - 1u, 1u));
        float breathe = 0.85 + 0.15 * sin(ph * (i % 3 == 0 ? 2.0 : 1.0) + h.x * TAU);
        c += lc * (core * mix(0.7, 2.2, u.accent) + halo) * breathe;
    }
    return float4(max(c, 0.0), 1.0);
}

float4 bd_leak(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float3 c = pc(pal, u, 0) * 0.8;
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float2 h = hash2(int2(i * 31 + 7, int(u.seed) + 3), 13u);
        float side = (h.x < 0.5) ? -1.0 : 1.0;
        float2 center = float2(side * u.aspect * (0.45 + 0.1 * h.y), mix(-0.4, 0.4, h.y));
        center += float2(sin(ph + fi * 2.1) * 0.18 * u.motion * u.aspect, cos(ph * (fi + 1.0) + h.x * TAU) * 0.2 * u.motion);
        float2 d = (p - center) * float2(mix(1.6, 0.7, u.scale), mix(0.9, 0.5, u.scale));
        float f = exp(-dot(d, d) * mix(9.0, 2.5, u.softness));
        float3 col = pr(pal, u, 0.55 + 0.45 * sat(1.0 - length(d) * 1.2));
        float flick = 0.8 + 0.2 * lnoise(float2(fi * 3.0, 0.5), u.phase, 1.2, u.seed);
        c += col * f * mix(0.8, 2.4, u.accent) * flick;
    }
    float streak = exp(-pow(p.y * mix(14.0, 5.0, u.detail), 2.0)) * 0.06 * u.detail;
    c += pc(pal, u, n - 1u) * streak;
    return float4(max(c, 0.0), 1.0);
}

float4 bd_bokeh(BD_ARGS) {
    // Each light lives a whole number of lives per cycle: it fades in low in its
    // cell, drifts up, and fades out before it wraps, so the loop closes exactly.
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float3 c = mixLab(pc(pal, u, 0), pc(pal, u, 1), sat(0.5 + p.y)) * 0.85;
    float lives = floor(mix(1.0, 3.0, u.motion) + 0.5);
    for (int layer = 0; layer < 3; layer++) {
        float fl = float(layer);
        float cellSize = mix(0.10, 0.26, u.scale) * (1.0 + fl * 0.55);
        float2 q = p / cellSize;
        q.x += fl * 17.3;
        int2 id = int2(floor(q));
        float2 f = fract(q) - 0.5;
        for (int j = -2; j <= 2; j++) {
            for (int i = -1; i <= 1; i++) {
                int2 g = id + int2(i, j);
                float2 h = hash2(g, uint(u.seed) * 3u + uint(layer) + 1u);
                if (h.x > mix(0.25, 0.65, u.detail)) continue;
                float h3 = hash1(g, 211u + uint(layer));
                float life = fract(u.phase * lives + h3);
                float rise = (life - 0.5) * mix(0.6, 1.3, u.motion) * (1.0 - fl * 0.2);
                float glow = smoothstep(0.0, 0.3, life) * (1.0 - smoothstep(0.62, 1.0, life));
                float2 o = float2(i, j) + (h - 0.5) * float2(0.8, 0.5) + float2(0.0, rise) - f;
                float rad = mix(0.18, 0.46, hash1(g, 99u + uint(layer)));
                float dist = length(o);
                float disc = 1.0 - smoothstep(rad * (0.88 - 0.25 * u.softness), rad, dist);
                float rim = smoothstep(rad * 0.7, rad * 0.97, dist) * disc;
                float3 col = pc(pal, u, 2u + (uint(h.y * 97.0) % max(n - 2u, 1u)));
                float bright = (0.10 + 0.55 * h.y) * (1.0 - fl * 0.22) * mix(0.6, 1.6, u.accent) * glow;
                c += col * (disc * 0.8 + rim * 0.5) * bright;
            }
        }
    }
    return float4(max(c, 0.0), 1.0);
}

float4 bd_rays(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float2 src = float2(mix(-0.4, 0.4, u.accent) * u.aspect + sin(ph) * 0.05 * u.motion, -0.62);
    float2 d = p - src;
    float ang = atan2(d.x, d.y);
    float dist = length(d);
    float r = mix(0.2, 1.0, u.motion);
    float rays = 0.5 + 0.5 * lnoise(float2(ang * mix(4.0, 14.0, u.detail), 0.3), u.phase, r, u.seed);
    rays = pow(rays, mix(3.5, 1.2, u.softness));
    float fall = exp(-dist * mix(2.8, 0.9, u.scale));
    float3 bg = mixLab(pc(pal, u, 0), pc(pal, u, 1), sat(0.3 + p.y));
    float3 lc = pr(pal, u, 0.85);
    float3 c = bg + lc * rays * fall * 1.1 + lc * exp(-dist * 7.0) * 0.6;
    // Dust: a mote in some cells, drifting up and fading over whole lives, so
    // it moves smoothly and the loop closes.
    float2 g = p * 60.0;
    float2 cell = floor(g);
    float2 hm = hash2(int2(cell), uint(u.seed) + 4u);
    float aa = fwidth(g.x);
    float dust = 0.0;
    if (hm.x > 0.86) {
        float life = fract(u.phase * 2.0 + hm.y * 7.0);
        float2 pos = cell + 0.5 + (hash2(int2(cell) + int2(17, 3), uint(u.seed) + 5u) - 0.5) * 0.45 + float2(0.0, (0.5 - life) * 0.4);
        float dd = length(g - pos);
        dust = (1.0 - smoothstep(0.07 - aa, 0.07 + aa, dd)) * smoothstep(0.0, 0.25, life) * (1.0 - smoothstep(0.75, 1.0, life));
    }
    c += lc * dust * rays * fall * 1.5;
    (void)n;
    return float4(max(c, 0.0), 1.0);
}

// ─────────────────────────────────────────────── GLASS

float4 bd_fluted(BD_ARGS) {
    float2 p = ctr(uv, u);
    float flutes = mix(10.0, 44.0, 1.0 - u.scale);
    float w = u.aspect / flutes;
    float xl = fract(p.x / w + 0.5) - 0.5;
    float refr = mix(0.3, 1.6, u.detail);
    float2 sp = p + float2(-xl * w * refr * 2.2, 0.0);
    float3 c = blobField(sp * 0.9, u, pal, mix(0.16, 0.30, u.softness) + 0.04, mix(0.05, 0.3, u.motion), 1.0, u.accent * 0.5);
    float lens = 1.0 - xl * xl * 4.0;
    c *= 0.82 + 0.26 * lens;
    float edge = exp(-pow((0.5 - abs(xl)) * 26.0, 2.0));
    float hi = exp(-pow((xl + 0.28) * 14.0, 2.0));
    float3 lightC = pr(pal, u, 1.0);
    c += lightC * (hi * 0.10 + edge * 0.05);
    c *= 1.0 - edge * 0.10;
    return float4(max(c, 0.0), 1.0);
}

float4 bd_frost(BD_ARGS) {
    float2 p = ctr(uv, u);
    float ph = u.phase * TAU;
    float nx = snoise3(float3(p * 90.0, 1.0 + u.seed));
    float ny = snoise3(float3(p * 90.0 + 13.0, 2.0 + u.seed));
    float2 jitter = float2(nx, ny) * mix(0.002, 0.012, u.detail);
    float3 back = blobField((p + jitter) * 0.95, u, pal, mix(0.12, 0.28, u.scale), mix(0.05, 0.35, u.motion), mix(1.4, 0.8, u.softness), u.accent);
    float3 c = back;
    float drops = 0.0;
    if (u.detail > 0.02) {
        // Two sets of drops sliding down the pane, each faded out before it
        // starts again, so the loop never shows a drop jumping back.
        float inside = 0.0, glint = 0.0;
        for (int layer = 0; layer < 2; layer++) {
            float life = fract(u.phase + 0.5 * float(layer));
            float wl = sin(PI * life);
            wl *= wl;
            float2 dp = p * mix(10.0, 26.0, u.scale);
            dp.y -= life * 2.0;
            float3 v = voronoi(dp, 0.9, 0.0, uint(u.seed) + 9u + uint(layer) * 31u);
            float size = hash1(int2(floor(v.z * 991.0), 1), 3u);
            float rr = mix(0.10, 0.34, size) * u.detail;
            float inl = 1.0 - smoothstep(rr * 0.8, rr, v.x);
            inside += inl * wl;
            glint += smoothstep(rr * 0.35, 0.0, length(float2(v.x - rr * 0.35, 0.0))) * inl * wl;
        }
        drops = inside;
        float2 dir = float2(nx, ny);
        float3 refr = blobField((p - dir * 0.03) * 0.9, u, pal, mix(0.12, 0.28, u.scale), mix(0.05, 0.35, u.motion), 1.0, u.accent);
        c = mix(c, refr * 1.08, inside);
        c += pr(pal, u, 1.0) * glint * 0.10;
    }
    c *= 1.0 + 0.03 * nx;
    (void)ph;
    return float4(max(c, 0.0), 1.0);
}

// ─────────────────────────────────────────────── LINES & WAVES

float4 bd_contours(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float r = mix(0.1, 0.7, u.motion);
    float h = fbm_loop(p * mix(0.45, 1.6, u.scale), u.phase, r, u.seed, 4, 0.5);
    float levels = mix(5.0, 20.0, u.detail);
    float v = h * levels;
    float fw = max(fwidth(v), 1e-4);
    float d = abs(fract(v + 0.5) - 0.5) / fw;
    float line = 1.0 - smoothstep(0.0, 1.2 + 1.5 * u.softness, d);
    float major = step(0.5, fract((floor(v + 0.5)) / 5.0 + 0.01) < 0.2 ? 1.0 : 0.0);
    float3 base = mixLab(pc(pal, u, 0), pc(pal, u, 1), sat(0.5 + 0.8 * h) * u.accent);
    float3 lc = pc(pal, u, n - 1u);
    float3 c = base + lc * line * (0.35 + 0.45 * major);
    return float4(max(c, 0.0), 1.0);
}

float4 bd_silk(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float3 c = mixLab(pc(pal, u, 0), pc(pal, u, 1), sat(0.5 - p.y) * 0.8);
    int lines = int(mix(12.0, 48.0, u.detail));
    float amp = mix(0.06, 0.24, u.scale);
    float thick = mix(0.0012, 0.004, u.softness) * (u.height > 0.0 ? 1.0 : 1.0);
    for (int i = 0; i < 48; i++) {
        if (i >= lines) break;
        float fi = float(i) / float(max(lines - 1, 1));
        float x = p.x / u.aspect * 2.0;
        float y0 = mix(-0.28, 0.28, fi);
        float y = y0 + amp * (sin(x * 2.2 + ph + fi * 2.4 + u.seed) * 0.6
                           + sin(x * 3.7 - ph * 2.0 + fi * 5.1) * 0.25 * u.motion
                           + sin(x * 1.3 + ph + fi * 1.3) * 0.4);
        float d = abs(p.y - y);
        float glow = exp(-d * d / (thick * thick)) + 0.12 * exp(-d * mix(90.0, 30.0, u.softness));
        float3 col = pr(pal, u, 0.45 + 0.55 * fi);
        c += col * glow * mix(0.5, 1.4, u.accent) * 0.35;
    }
    (void)n;
    return float4(max(c, 0.0), 1.0);
}

float4 bd_dunes(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float ph = u.phase * TAU;
    int layers = int(mix(4.0, 9.0, u.detail));
    float3 c = pr(pal, u, 1.0);
    float x = p.x / u.aspect;
    for (int i = 0; i < 9; i++) {
        if (i >= layers) break;
        float fi = float(i) / float(max(layers - 1, 1));
        float base = mix(-0.30, 0.42, fi);
        float amp = mix(0.03, 0.10, u.scale) * (1.0 - 0.4 * fi);
        float h = base + amp * sin(x * (3.0 + fi * 2.0) + ph * (i % 2 == 0 ? 1.0 : -1.0) + fi * 7.0 + u.seed)
                       + amp * 0.5 * sin(x * (7.0 + fi * 3.0) - ph + fi * 3.0);
        float edge = mix(0.002, 0.03, u.softness);
        float inside = smoothstep(h - edge, h + edge, p.y);
        float shade = exp(-max(p.y - h, 0.0) * 18.0) * 0.18;
        float3 col = pr(pal, u, 1.0 - fi * 0.95);
        c = mix(c, col * (1.0 + shade * 0.6), inside);
        float shadow = smoothstep(h - 0.05, h, p.y) * (1.0 - inside) * 0.18 * u.accent;
        c *= 1.0 - shadow;
    }
    (void)n;
    return float4(max(c, 0.0), 1.0);
}

// ─────────────────────────────────────────────── FLOW

float4 bd_marble(BD_ARGS) {
    float2 p = ctr(uv, u) * mix(0.35, 1.3, u.scale);
    float r = mix(0.08, 0.5, u.motion);
    float2 q = float2(fbm_loop(p, u.phase, r, u.seed, 3, 0.5), fbm_loop(p + float2(5.2, 1.3), u.phase, r, u.seed + 1.0, 3, 0.5));
    float k = mix(1.0, 3.2, u.detail);
    float2 s = float2(fbm_loop(p + k * q + float2(1.7, 9.2), u.phase, r, u.seed + 2.0, 3, 0.5),
                      fbm_loop(p + k * q + float2(8.3, 2.8), u.phase, r, u.seed + 3.0, 3, 0.5));
    float f = fbm_loop(p + k * s, u.phase, r, u.seed + 4.0, 4, 0.5);
    float t = sat(0.5 + 0.9 * f);
    t = mix(t, smoothstep(0.0, 1.0, t), 1.0 - u.softness);
    float3 c = pr(pal, u, t);
    c = mixLab(c, pr(pal, u, 0.15), sat(length(q)) * 0.35);
    c = mixLab(c, pr(pal, u, 0.95), sat(s.x * s.x * 1.8) * mix(0.1, 0.6, u.accent));
    return float4(max(c, 0.0), 1.0);
}

float4 bd_chrome(BD_ARGS) {
    float2 p = ctr(uv, u) * mix(0.35, 1.25, u.scale);
    float r = mix(0.08, 0.5, u.motion);
    float e = 0.012;
    float2 w = float2(fbm_loop(p, u.phase, r, u.seed, 2, 0.5), fbm_loop(p + 3.3, u.phase, r, u.seed + 1.0, 2, 0.5)) * mix(0.3, 1.2, u.detail);
    float h0 = fbm_loop(p + w, u.phase, r, u.seed + 2.0, 3, 0.45);
    float hx = fbm_loop(p + w + float2(e, 0.0), u.phase, r, u.seed + 2.0, 3, 0.45);
    float hy = fbm_loop(p + w + float2(0.0, e), u.phase, r, u.seed + 2.0, 3, 0.45);
    float3 nrm = normalize(float3((h0 - hx) / e, (h0 - hy) / e, mix(3.0, 1.2, u.softness)));
    float3 v = float3(0.0, 0.0, 1.0);
    float3 rf = reflect(-v, nrm);
    float env = rf.y * 0.5 + 0.5;
    float horizon = smoothstep(0.46, 0.54, env);
    float3 sky = pr(pal, u, mix(0.55, 1.0, env));
    float3 ground = pr(pal, u, mix(0.0, 0.35, env));
    float3 c = mix(ground, sky, horizon);
    float spec = pow(max(dot(rf, normalize(float3(0.4, 0.5, 0.75))), 0.0), 60.0);
    c += pr(pal, u, 1.0) * spec * mix(0.5, 2.0, u.accent);
    return float4(max(c, 0.0), 1.0);
}

float4 bd_lava(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float field = 0.0;
    float colorT = 0.0;
    int count = int(mix(5.0, 12.0, u.detail));
    for (int i = 0; i < 12; i++) {
        if (i >= count) break;
        float2 h = hash2(int2(i * 7 + 1, int(u.seed) + 5), 17u);
        float k = (i % 3 == 0) ? 2.0 : 1.0;
        float2 c = (h - 0.5) * float2(u.aspect * 0.8, 0.8)
                 + float2(sin(ph * k + h.x * TAU), cos(ph + h.y * TAU)) * mix(0.05, 0.3, u.motion) * float2(u.aspect * 0.5, 0.5);
        float rad = mix(0.06, 0.2, u.scale) * (0.6 + 0.8 * h.y);
        float d = length(p - c);
        float m = rad * rad / (d * d + 1e-4);
        field += m;
        colorT += m * h.x;
    }
    colorT /= max(field, 1e-4);
    float edge = mix(0.05, 0.6, u.softness);
    float inside = smoothstep(1.0 - edge, 1.0 + edge, field);
    float3 bg = mixLab(pc(pal, u, 0), pc(pal, u, 1), sat(0.5 + p.y) * 0.7);
    float3 blob = pr(pal, u, 0.45 + 0.45 * colorT);
    float depth = sat((field - 1.0) * 0.5);
    blob = mixLab(blob, pr(pal, u, 0.97), depth * 0.30);
    float rim = inside * (1.0 - depth) * 0.06;
    float glow = sat(field * 0.30) * (1.0 - inside) * u.accent;
    float3 c = mix(bg, blob, inside) + blob * (glow * 0.35 + rim);
    (void)n;
    return float4(max(c, 0.0), 1.0);
}

// ─────────────────────────────────────────────── CELLS & DOTS

float4 bd_cells(BD_ARGS) {
    float2 p = ctr(uv, u) * mix(1.8, 5.0, 1.0 - u.scale);
    uint n = ncol(u);
    float3 v = voronoi(p, mix(0.35, 0.9, u.motion), u.phase, uint(u.seed) + 1u);
    float gap = v.y - v.x;
    float border = mix(0.02, 0.14, u.softness);
    float inner = smoothstep(border, border + 0.06 + 0.1 * u.softness, gap);
    float3 bg = pc(pal, u, 0) * 0.9;
    float3 cell = pr(pal, u, 0.35 + 0.6 * v.z);
    float dome = 1.0 - sat(v.x * mix(0.6, 1.3, u.detail));
    cell *= 0.6 + 0.55 * dome;
    float3 c = mix(bg, cell, inner);
    // A thin light where panes meet, like leading catching light.
    float seam = exp(-gap * mix(90.0, 30.0, u.softness)) * u.accent;
    c += pr(pal, u, 0.9) * seam * 0.25;
    (void)n;
    return float4(max(c, 0.0), 1.0);
}

float4 bd_halftone(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float r = mix(0.1, 0.7, u.motion);
    float field = 0.5 + 0.5 * fbm_loop(p * mix(0.6, 1.8, u.scale), u.phase, r, u.seed, 3, 0.5);
    field = mix(field, smoothstep(0.2, 0.8, field), 0.6);
    float cells = mix(40.0, 140.0, u.detail);
    float2 q = rot2(p, 0.2618) * cells;
    float2 f = fract(q) - 0.5;
    float rad = sqrt(field) * 0.62;
    float d = length(f);
    float aa = fwidth(d) * 1.2 + u.softness * 0.08;
    float dotv = 1.0 - smoothstep(rad - aa, rad + aa, d);
    float3 paper = pc(pal, u, n - 1u);
    float3 ink = pr(pal, u, mix(0.0, 0.5, u.accent));
    float3 c = mix(paper, ink, dotv);
    return float4(max(c, 0.0), 1.0);
}

float4 bd_matrix(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float cells = mix(28.0, 90.0, u.detail);
    float2 q = p * cells;
    float2 id = floor(q);
    float2 f = fract(q) - 0.5;
    float2 cp = id / cells;
    float ph = u.phase * TAU;
    float r = mix(0.15, 0.8, u.motion);
    float wave = 0.5 + 0.5 * sin(length(cp - float2(0.3 * u.aspect, 0.1)) * mix(6.0, 20.0, u.scale) - ph * 2.0);
    float nse = 0.5 + 0.5 * lnoise(cp * 2.0, u.phase, r, u.seed);
    float v = sat(mix(wave, nse, 0.55));
    v = pow(v, mix(3.0, 1.2, u.softness));
    float d = length(f);
    float dotv = 1.0 - smoothstep(0.26, 0.36, d);
    float3 c = pc(pal, u, 0) * 0.9;
    float3 lc = pr(pal, u, 0.5 + 0.5 * v);
    c += lc * dotv * (0.05 + v * mix(0.9, 2.0, u.accent));
    c += lc * exp(-d * d * 18.0) * v * 0.15;
    (void)n;
    return float4(max(c, 0.0), 1.0);
}

// ─────────────────────────────────────────────── research-ranked additions

inline float3 rampLab(constant float4 *pal, uint count, float t) {
    uint n = max(count, 2u);
    t = clamp(t, 0.0, 1.0) * float(n - 1);
    uint i = min(uint(floor(t)), n - 2);
    float f = t - float(i);
    f = f * f * (3.0 - 2.0 * f);
    return mix(palLab(pal, i), palLab(pal, i + 1), f);
}
inline float isoline(float v, float halfWidthPx) {
    float d = abs(fract(v + 0.5) - 0.5) / max(fwidth(v), 1e-5);
    return 1.0 - smoothstep(halfWidthPx - 0.5, halfWidthPx + 0.5, d);
}
inline float fbm01(float2 p, float phase, float radius, float seed, int oct) {
    return 0.5 + 0.5 * fbm_loop(p, phase, radius, seed, oct, 0.5);
}

// Soft Bloom — five drifting colour pools painted over a calm ground.
// Region structure and distributions after LUMEN "bloom" (MIT © 2026 Leonxlnx),
// re-authored: OKLab over-paint, exact integer orbits, no static warp.
float4 bd_softbloom(BD_ARGS) {
    float2 p = ctr(uv, u) * (3.0 / mix(0.7, 1.7, u.scale));
    uint n = ncol(u);
    float soft = mix(0.75, 1.5, u.softness);
    float travel = mix(0.1, 1.25, u.motion);
    float3 lab = mix(palLab(pal, 0), palLab(pal, n - 1u), u.accent);
    int count = int(mix(3.0, 6.0, u.detail) + 0.5);
    float wide = max(u.aspect / 1.78, 0.62);
    for (int j = 0; j < 6; j++) {
        if (j >= count) break;
        uint sd = uint(u.seed);
        float2 h = hash2(int2(j * 3 + 1, 7), sd + 21u);
        float orbitR = (0.18 + 0.40 * hash1(int2(j, 3), sd + 37u)) * travel;
        float phase0 = hash1(int2(j, 5), sd + 41u);
        float dir = hash1(int2(j, 9), sd + 3u) > 0.5 ? 1.0 : -1.0;
        float rad = (0.45 + 0.60 * hash1(int2(j, 17), sd + 5u)) * soft;
        float2 centre = (h - 0.5) * float2(2.2 * wide, 1.6);
        float a = TAU * dir * (u.phase + phase0);
        float2 d = p - (centre + orbitR * float2(cos(a), sin(a)));
        float g = exp(-dot(d, d) / (rad * rad));
        float colT = fract(float(j) * 0.249 + hash1(int2(j, 29), sd + 11u) * 0.18);
        // Keep pools visible against the ground: lift them away from it.
        colT = (u.accent < 0.5) ? mix(0.38, 1.0, colT) : mix(0.0, 0.7, colT);
        lab = mix(lab, rampLab(pal, n, colT), 0.92 * g);
    }
    return float4(max(oklab_to_linear(lab), 0.0), 1.0);
}

// Aurora Veil — curtains with vertical rays over deep night.
float4 bd_aurora(BD_ARGS) {
    float x = uv.x * max(u.aspect / 1.78, 0.56) ;
    float y = 1.0 - uv.y;
    uint n = ncol(u);
    float ph = u.phase * TAU;
    float3 c = mixLab(pc(pal, u, 0), pc(pal, u, 1), sat(1.0 - y) * 0.9);
    float amp = mix(0.35, 1.3, u.accent);
    float r = mix(0.2, 0.9, u.motion);
    float h0 = mix(0.46, 0.80, u.scale);
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float cy = h0 - 0.11 * fi + 0.10 * sin(4.0 * x + ph + 2.3 * fi) + 0.05 * sin(9.0 * x - ph + 4.1 * fi)
                 + 0.40 * (fbm01(float2(3.0 * x + 7.0 * fi, 0.0), u.phase, r, u.seed + fi, 3) - 0.5);
        float th = mix(0.025, 0.08, u.softness) + 0.012 * fi;
        float rays = 0.30 + 0.95 * fbm01(float2(24.0 * x + 13.0 * fi, 0.5 * fi), u.phase, r * 1.2, u.seed + 20.0 + fi, 3);
        rays = mix(0.9, rays, u.detail);
        float band = exp(-(y - cy) * (y - cy) / (th * th)) * rays * smoothstep(0.0, 0.3, y);
        // Taller fade above the curtain, like real aurora.
        band += exp(-max(y - cy, 0.0) * 9.0) * smoothstep(cy - 0.01, cy + 0.04, y) * 0.35 * rays * rays * smoothstep(0.0, 0.3, y);
        float3 col = mixLab(pc(pal, u, 2), pc(pal, u, 3), fi / 2.0);
        c += col * band * 0.9 * amp;
    }
    return float4(max(c, 0.0), 1.0);
}

// Keynote Halo — a luminous concentric aura behind the subject.
float4 bd_halo(BD_ARGS) {
    float2 p = ctr(uv, u) * (3.0 / mix(0.8, 2.0, u.scale));
    uint n = ncol(u);
    float2 cc = (hash2(int2(3, 8), uint(u.seed) + 1u) - 0.5) * float2(0.5, 0.6) * 0.6;
    float2 dv = p - cc;
    float d = length(dv);
    float th = atan2(dv.y, dv.x);
    float warp = mix(0.1, 1.0, u.detail);
    float wob = fbm_loop(float2(1.2 * cos(th), 1.2 * sin(th)) + float2(1.4 * d, 0.0), u.phase, 0.5 * mix(0.2, 1.0, u.motion), u.seed, 3, 0.5);
    d += (0.06 + 0.08 * warp) * (wob * 0.5 + 0.5) * smoothstep(0.0, 0.3, d) - 0.05;
    d += 0.045 * mix(0.2, 1.2, u.motion) * sin(u.phase * TAU);
    float soft = mix(0.6, 1.6, u.softness);
    float t = pow(max(0.66 * d, 0.0), mix(1.55, 0.8, sat(0.65 * soft)));
    float3 bg = pc(pal, u, 0);
    float3 col = pr(pal, u, 1.0 - smoothstep(0.04, 0.96, t));
    col = mix(col, bg, smoothstep(0.68, 1.18, t));
    col = mix(col, mix(bg, float3(1.0), 0.5), smoothstep(0.26, 0.0, t) * 0.45);
    float ring = exp(-pow((t - 0.46) * 4.6, 2.0));
    col = mix(col, col * 1.18 + 0.06, 0.5 * ring * mix(0.2, 1.4, u.accent));
    (void)n;
    return float4(max(col, 0.0), 1.0);
}

// Line Field — a swell of fine parallel lines that frames content.
float4 bd_linefield(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float ang = mix(-40.0, -10.0, u.accent) * PI / 180.0;
    float2 q = rot2(p, ang);
    float ph = u.phase * TAU;
    float env = 1.0 - 0.55 * smoothstep(0.25, 1.0, abs(q.x) / (0.5 * u.aspect));
    float A = mix(0.08, 0.45, u.scale);
    float g = A * env * (0.6 * sin(TAU * 0.7 * q.x + ph + 0.8 * q.y) + 0.4 * sin(TAU * 1.3 * q.x - 2.0 * ph + 1.7))
            + 0.35 * (fbm01(0.6 * q, u.phase, mix(0.1, 0.5, u.motion), u.seed, 3) - 0.5);
    float spacing = mix(0.085, 0.022, u.detail);
    float v = (q.y + g) / spacing;
    float px = u.height / 1080.0;
    float w = mix(0.55, 2.4, u.softness) * max(px, 0.4) * mix(0.55, 1.0, env);
    float line = isoline(v, w);
    float3 ground = mixLab(pc(pal, u, 0), pc(pal, u, 1), sat(0.5 - p.y) * 0.35);
    float3 lc = mixLab(pc(pal, u, n - 2u), pc(pal, u, n - 1u), sat(0.5 + q.x / u.aspect));
    return float4(max(mix(ground, lc, line * 0.9), 0.0), 1.0);
}

// Smoke Silk — low-contrast domain warp for quiet luxury.
float4 bd_smoke(BD_ARGS) {
    float2 p = ctr(uv, u) * mix(0.3, 1.2, u.scale);
    uint n = ncol(u);
    float r = mix(0.1, 0.45, u.motion);
    float2 q = float2(fbm_loop(p, u.phase, r, u.seed, 3, 0.5), fbm_loop(p + float2(5.2, 1.3), u.phase, r, u.seed + 1.0, 3, 0.5));
    float k = mix(0.8, 2.2, u.detail);
    float2 rr = float2(fbm_loop(p + k * q + float2(1.7, 9.2), u.phase, r, u.seed + 2.0, 3, 0.5),
                       fbm_loop(p + k * q + float2(8.3, 2.8), u.phase, r, u.seed + 3.0, 3, 0.5));
    float f = 0.5 + 0.5 * fbm_loop(p + k * rr, u.phase, r, u.seed + 4.0, 4, 0.5);
    float lo = mix(0.05, 0.25, u.accent);
    float span = mix(0.35, 0.8, u.softness);
    float3 lab = rampLab(pal, n, lo + f * span);
    lab = mix(lab, palLab(pal, n - 1u), 0.25 * sat(dot(q, q)));
    return float4(max(oklab_to_linear(lab), 0.0), 1.0);
}

// Ridgelines — stacked landscape profiles, front to back.
float4 bd_ridgelines(BD_ARGS) {
    float2 yuv = float2(uv.x, 1.0 - uv.y);
    uint n = ncol(u);
    float x = (yuv.x - 0.5) * u.aspect;
    int lines = int(mix(18.0, 56.0, u.detail));
    float spacing = 0.72 / float(lines);
    float env = exp(-x * x / pow(mix(0.25, 0.6, u.scale) * max(u.aspect, 1.0), 2.0));
    float fw = max(fwidth(yuv.y), 1e-5);
    float3 ground = pc(pal, u, 0);
    float3 lineC = pc(pal, u, n - 1u);
    float3 c = ground;
    float cyc = floor(mix(1.0, 3.0, u.motion) + 0.5);
    float height = mix(0.06, 0.24, u.accent);
    for (int k = 0; k < 56; k++) {
        if (k >= lines) break;
        float fk = float(k);
        float b = 0.12 + spacing * fk;
        // Five sines per line with seeded phases; whole cycles per loop keep the seam exact.
        float th = u.phase * TAU;
        float sd = u.seed * 0.137 + fk * 1.618;
        float nz = 0.5
            + 0.26 * sin(2.3 * x + 6.28 * fract(sd * 0.71) + th * cyc)
            + 0.14 * sin(5.1 * x + 6.28 * fract(sd * 1.37) - th * cyc * 2.0)
            + 0.08 * sin(9.7 * x + 6.28 * fract(sd * 2.11) + th * cyc * 3.0)
            + 0.05 * sin(17.3 * x + 6.28 * fract(sd * 3.07) - th * cyc * 2.0)
            + 0.03 * sin(31.1 * x + 6.28 * fract(sd * 4.19) + th * cyc * 3.0);
        float yk = b + height * env * pow(sat((nz - 0.25) / 0.75), 1.6);
        float dpx = (yuv.y - yk) / fw;
        float w = mix(0.6, 1.6, u.softness) * max(u.height / 1080.0, 0.5);
        if (abs(dpx) < w + 1.0) {
            float a = 1.0 - smoothstep(w - 0.5, w + 0.5, abs(dpx));
            float depth = 1.0 - fk / float(lines) * 0.45;
            c = mix(ground, lineC * depth, a);
            break;
        }
        if (dpx < 0.0) { c = ground; break; }
    }
    return float4(max(c, 0.0), 1.0);
}

// Dot Grid Sweep — engineering-paper dots with a slow light passing over.
float4 bd_dotgrid(BD_ARGS) {
    float2 p = ctr(uv, u);
    uint n = ncol(u);
    float density = mix(8.0, 26.0, u.detail);
    float2 g = p * density;
    float2 f = fract(g) - 0.5;
    float d = length(f);
    float ang = mix(0.0, 60.0, u.accent) * PI / 180.0;
    float2 dir = float2(cos(ang), sin(ang));
    float width = mix(0.18, 0.55, u.softness);
    float S = 0.5 * (u.aspect * abs(cos(ang)) + abs(sin(ang))) + 3.0 * width;
    float s = -S + 2.0 * S * u.phase;
    float L = exp(-pow((dot(p, dir) - s) / width, 2.0));
    float rad = mix(0.05, 0.10, u.scale) + mix(0.04, 0.14, u.scale) * L;
    float aa = fwidth(d);
    float dotv = 1.0 - smoothstep(rad - aa, rad + aa, d);
    float3 ground = pc(pal, u, 0);
    float3 dim = mixLab(pc(pal, u, 1), pc(pal, u, 3), 0.55);
    float3 lit = pc(pal, u, n - 1u);
    float3 c = mix(ground, mixLab(dim, lit, L), dotv);
    c += lit * L * 0.035;
    return float4(max(c, 0.0), 1.0);
}

// ─────────────────────────────────────────────── NEW IN 2.0

// Caustics — sunlight through moving water, dancing on a pool floor. Two
// layers of cells whose points circle on whole turns per loop, warped by
// looping noise like a swell; light gathers along the cell edges (the gap
// between nearest and second-nearest point), brightest where both layers'
// lines cross, as real caustic networks do.
float4 bd_caustics(BD_ARGS) {
    float2 q = ctr(uv, u);
    float2 p = q * mix(9.0, 3.8, u.scale);
    float r = mix(0.12, 0.55, u.motion);
    float2 w = float2(lnoise(p * 0.32, u.phase, r, u.seed), lnoise(p * 0.32 + 5.1, u.phase, r, u.seed + 2.0)) * mix(0.15, 0.5, u.motion);
    // A finer ripple bends the cell edges into the curves of real caustics.
    w += float2(lnoise(p * 1.1 + 9.7, u.phase, r, u.seed + 4.0), lnoise(p * 1.1 + 2.3, u.phase, r, u.seed + 6.0)) * 0.13;
    float3 v1 = voronoi(p + w, 0.95, u.phase, uint(u.seed) + 21u);
    float3 v2 = voronoi(p * 1.65 + w * 1.4 + 3.1, 0.95, u.phase * 2.0, uint(u.seed) + 47u);
    float width = mix(0.035, 0.12, u.softness);
    float l1 = exp(-(v1.y - v1.x) / width);
    float l2 = exp(-(v2.y - v2.x) / (width * 0.85));
    float light = l1 * 0.7 + l2 * 0.4 + l1 * l2 * 0.9;
    light *= mix(0.6, 1.4, u.accent);
    uint n = ncol(u);
    // A pool floor sloping deeper towards the top: darker there, and the light
    // brightest in the shallows.
    float depth = sat(0.5 + q.y * 0.85);
    float3 ground = mixLab(pc(pal, u, min(2u, n - 1u)), pc(pal, u, 0), depth);
    float3 lit = mixLab(pc(pal, u, n > 1u ? n - 2u : 0u), pc(pal, u, n - 1u), sat(light - 0.3));
    float3 col = ground + lit * light * mix(0.35, 0.9, u.detail) * (0.6 + 0.4 * (1.0 - depth));
    return float4(max(col, 0.0), 1.0);
}

// Iridescence — a thin film on a slowly folding sheet, like the inside of a
// shell. Colour comes from light interfering in the film, so it shifts as the
// sheet turns; it stays a pearl sheen over the palette's lightest colours
// rather than a rainbow.
float4 bd_iris(BD_ARGS) {
    float2 p = ctr(uv, u) * mix(0.45, 1.3, u.scale);
    float r = mix(0.06, 0.4, u.motion);
    float e = 0.008;
    float h0 = fbm_loop(p, u.phase, r, u.seed, 2, 0.5);
    float hx = fbm_loop(p + float2(e, 0.0), u.phase, r, u.seed, 2, 0.5);
    float hy = fbm_loop(p + float2(0.0, e), u.phase, r, u.seed, 2, 0.5);
    float3 nrm = normalize(float3((h0 - hx) / e, (h0 - hy) / e, mix(0.8, 2.2, u.softness)));
    float c1 = sat(nrm.z);
    const float nf = 1.33;
    float c2 = sqrt(max(1.0 - (1.0 - c1 * c1) / (nf * nf), 0.0));
    float d = 330.0 + mix(150.0, 450.0, u.detail) * (0.5 + 0.5 * h0);
    float3 film = 0.5 - 0.5 * cos(TAU * 2.0 * nf * d * c2 / float3(650.0, 532.0, 450.0));
    uint n = ncol(u);
    float3 pearl = mixLab(pc(pal, u, n - 1u), pc(pal, u, n > 2u ? n - 3u : 0u), sat(0.3 - 0.6 * h0));
    // The film tints the pearl; its chroma is held to a sheen.
    float3 tinted = pearl * (0.55 + 0.6 * film);
    float3 lab = linear_to_oklab(max(tinted, float3(1e-5)));
    float3 base = linear_to_oklab(max(pearl, float3(1e-5)));
    float2 ab = lab.yz - base.yz;
    float cap = mix(0.03, 0.09, u.accent);
    ab *= min(1.0, cap / max(length(ab), 1e-5));
    lab.yz = base.yz + ab;
    float3 col = max(oklab_to_linear(lab), float3(0.0));
    float3 L = normalize(float3(-0.4, 0.6, 0.7));
    float3 H = normalize(L + float3(0.0, 0.0, 1.0));
    col += pearl * pow(max(dot(nrm, H), 0.0), 60.0) * 0.25;
    return float4(max(col, 0.0), 1.0);
}

// Gradients. A stippled grain in logical pixels (the same size at any
// resolution) breaks up banding on slow ramps; sway eases the gradient back
// and forth within the loop.
inline float bd_stipple(float2 uv, constant BDU &u, float amount) {
    float2 lp = floor(uv * float2(u.width, u.height) * (1080.0 / max(min(u.width, u.height), 1.0)) / 1.6);
    return amount * (hash1(int2(lp), 71u) + hash1(int2(lp) + int2(5, 9), 73u) - 1.0);
}

// Solid — one colour from the palette, with a slow breath of light.
float4 bd_solid(BD_ARGS) {
    float2 p = ctr(uv, u);
    float ph = u.phase * TAU;
    float3 c = pr(pal, u, u.accent);
    float2 lp = float2(sin(ph) * 0.22, cos(ph) * 0.1) * u.motion;
    float pool = exp(-dot(p - lp, p - lp) * 2.2);
    // The pool of light drifts and swells, and is home again at the loop.
    c *= 1.0 + (pool - 0.4) * 0.3 * u.motion * (0.75 + 0.25 * cos(ph));
    c *= 1.0 + bd_stipple(uv, u, 0.03 * u.detail);
    return float4(max(c, 0.0), 1.0);
}

// Linear — a straight gradient across the palette, at any angle.
float4 bd_linear(BD_ARGS) {
    float2 p = ctr(uv, u);
    float ph = u.phase * TAU;
    float ang = u.accent * TAU + sin(ph) * 0.2 * u.motion;
    float2 dir = float2(sin(ang), -cos(ang));
    float t = dot(p, dir) / (0.5 * (abs(dir.x) * u.aspect + abs(dir.y)) + 1e-3);
    // Spread: a tight band across the middle at 0, the whole palette edge to edge at 1.
    t = t * 0.5 / mix(0.3, 1.0, u.scale) + 0.5;
    t = mix(t, smoothstep(0.0, 1.0, t), 1.0 - u.softness);
    t += bd_stipple(uv, u, 0.06 * u.detail);
    return float4(pr(pal, u, sat(t)), 1.0);
}

// Radial — light spreading from a point that drifts on a small orbit.
float4 bd_radial(BD_ARGS) {
    float2 p = ctr(uv, u);
    float ph = u.phase * TAU;
    float2 c = float2(0.0, mix(-0.32, 0.32, u.accent)) + float2(cos(ph), sin(ph)) * 0.07 * u.motion;
    float2 d = (p - c) / float2(1.0, 1.0);
    float t = 1.0 - length(d) / mix(0.35, 1.1, u.scale);
    t = mix(t, smoothstep(0.0, 1.0, t), 1.0 - u.softness);
    t += bd_stipple(uv, u, 0.06 * u.detail);
    return float4(pr(pal, u, sat(t)), 1.0);
}

// Conic — colour swept round a point, rising and falling back so there is no
// seam, swaying slowly within the loop.
float4 bd_conic(BD_ARGS) {
    float2 p = ctr(uv, u);
    float ph = u.phase * TAU;
    float2 c = float2(0.0, mix(-0.3, 0.3, u.accent));
    float2 d = p - c;
    // It sways back and forth, up to half a turn each way, and is home again at the loop.
    float a = atan2(d.x, d.y + 1e-6) - sin(ph) * PI * u.motion;
    float lobes = floor(mix(1.0, 3.99, u.scale));
    float t = 0.5 + 0.5 * cos(a * lobes);
    t = mix(t, smoothstep(0.0, 1.0, t), 1.0 - u.softness);
    // Near the point every colour meets; it eases to the middle of the ramp.
    t = mix(0.5, t, smoothstep(0.0, 0.18, length(d)));
    t += bd_stipple(uv, u, 0.06 * u.detail);
    return float4(pr(pal, u, sat(t)), 1.0);
}
"""#

    /// Style ids with a fragment entry point generated for each.
    static let styleIds: [String] = [
        "mesh", "studio", "fade",
        "paper", "riso",
        "wash", "ink",
        "bloom", "leak", "bokeh", "rays",
        "fluted", "frost",
        "contours", "silk", "dunes",
        "marble", "chrome", "lava",
        "cells", "halftone", "matrix",
        "softbloom", "aurora", "halo", "linefield", "smoke", "ridgelines", "dotgrid",
        "caustics", "iris", "solid", "linear", "radial", "conic",
    ]

    static var entryPoints: String {
        styleIds.map { id in
            """
            fragment float4 bdf_\(id)(FSOut in [[stage_in]], constant BDU &u [[buffer(0)]], constant float4 *pal [[buffer(1)]]) {
                float4 c = bd_\(id)(in.uv, u, pal);
                c.rgb *= u.brightness;
                if (u.vignette > 0.001) {
                    float2 d = (in.uv - 0.5) * float2(u.aspect, 1.0);
                    float r = length(d) / length(float2(u.aspect, 1.0) * 0.5);
                    c.rgb *= 1.0 - u.vignette * 0.8 * smoothstep(0.2, 1.1, r);
                }
                return c;
            }
            """
        }.joined(separator: "\n")
    }

    static var library: String { ShaderPrelude.source + source + entryPoints }
}
