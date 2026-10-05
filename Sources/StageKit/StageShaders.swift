import RenderCore

/// Card, shadow and accumulation shaders.
///
/// Cards are subdivided planes deformed in the vertex stage (curl, folds) and
/// shaded in the fragment stage with a continuous-corner mask, fill/fit media
/// mapping, optional light response and per-card defocus. Shadows are Gaussian
/// falloffs of the distance outside the true card shape, projected along the
/// light onto the receiving surface.
enum StageShaders {
    static let source: String = #"""
struct FrameU {
    float4x4 viewProj;
    float4 eye;        // xyz eye, w: time phase (for sweeps)
    float4 viewport;   // w, h, 1/w, 1/h
    float4 dof;        // focus distance, CoC px per unit defocus, max CoC px, pixels per world unit at focus
    float4 light;      // xyz direction towards light (world), w: shadow strength
    float4 shadowP;    // softness, ground z, key share, ambient share
};

struct CardU {
    float4x4 model;
    float4 sizeCorner;  // width, height, corner radius (world), opacity
    float4 deform;      // curl, fold, fold phase, bend kind (0 rigid, 1 card, 2 paper, 3 silk)
    float4 media;       // fit (0 fill, 1 fit), focal x, focal y, media aspect
    float4 fx;          // glow, extra blur px, shadow multiplier, surface (0 original, 1 print, 2 gloss, 3 foil)
    float4 mirror;      // enabled, floor y, strength, fade
    float4 color;       // linear rgb multiplier, alpha multiplier
    float4 extra;       // reveal, edge pass (1), thickness (world), surface for the edge
    float4 crop;        // the slice of the whole card this card shows: u0, v0, u1, v1 (v down)
    float4 band;        // loose thread: core, amount, side shade, core glint
};

// Distance from a band's centre line to its edge, 0…1, across its shorter side.
inline float bandRim(float2 uv, constant CardU &c) {
    return c.sizeCorner.x >= c.sizeCorner.y ? abs(uv.y - 0.5) * 2.0 : abs(uv.x - 0.5) * 2.0;
}

// The whole card's size, when this card is a slice of it.
inline float2 parentSize(constant CardU &c) {
    return c.sizeCorner.xy / max(c.crop.zw - c.crop.xy, float2(1e-5));
}

// Signed distance to this card's shape: the whole card's rounded outline,
// cut to the slice. `uv` is this card's 0…1 coordinate (v down).
inline float sliceDistance(float2 uv, constant CardU &c, thread float2 &parentUV);

struct CardVOut {
    float4 position [[position]];
    float2 uv;
    float3 worldPos;
    float3 normal;
    float3 tangent;     // along the card's width, in world space
    float cavity;       // 0 flat … 1 deep in a fold facing the camera
    float viewDist;
};

// Card-local deformation. p is in world units on the flat card (y up);
// g is the 0…1 grid coordinate (y down).
float3 deformCard(float3 p, float2 g, constant CardU &c) {
    float w = c.sizeCorner.x, h = c.sizeCorner.y;
    int kind = int(c.deform.w + 0.5);
    if (kind == 0) return p;
    float curl = c.deform.x;
    float fold = c.deform.y;
    float ph = c.deform.z;
    float3 q = p;
    float env = sin(PI * g.x) * sin(PI * g.y);
    float pin = smoothstep(0.0, 0.18, sin(PI * g.x)) * smoothstep(0.0, 0.18, sin(PI * g.y));
    float scale = min(w, h);

    if (kind == 1) {
        // Card stock: a restrained bow, curl only.
        curl *= 0.35;
        fold *= 0.0;
    }
    // Cylindrical curl around the vertical axis (exact arc length).
    if (abs(curl) > 0.002) {
        float halfW = 0.5 * w;
        float theta = curl * 1.35;                 // radians at the edge
        float R = halfW / theta;                   // signed radius
        float a = q.x / R;
        q.x = R * sin(a);
        q.z += R * (1.0 - cos(a));
    }
    if (kind == 2) {
        // Paper: one broad travelling buckle.
        q.z += fold * 0.045 * scale * sin(7.2 * (g.y - 0.5) + ph + 1.6 * (g.x - 0.5)) * pin;
    } else if (kind == 3) {
        // Silk: three travelling folds with a diagonal bias. The phase advances
        // by whole turns over a loop, so each fold moves at a whole multiple of
        // it and the folds close with the loop.
        float y = g.y - 0.5, x = g.x - 0.5;
        float f = sin(8.8 * y - ph + 2.4 * x)
                + 0.46 * sin(4.1 * y + 2.0 * ph - 6.4 * x)
                + 0.32 * sin(5.3 * (x + y) + 1.0 * ph);
        q.z += fold * 0.06 * scale * f * env;
    } else if (kind == 1) {
        float x = g.x - 0.5, y = g.y - 0.5;
        q.z += c.deform.x * 0.02 * scale * (1.0 - 4.0 * x * x) * (1.0 - 3.4 * y * y);
    }
    return q;
}

vertex CardVOut card_vertex(uint vid [[vertex_id]],
                            constant float2 *grid [[buffer(0)]],
                            constant FrameU &f [[buffer(1)]],
                            constant CardU &c [[buffer(2)]]) {
    float2 g = grid[vid];
    float w = c.sizeCorner.x, h = c.sizeCorner.y;
    float3 p = float3((g.x - 0.5) * w, (0.5 - g.y) * h, 0.0);
    float3 d = deformCard(p, g, c);
    const float e = 0.01;
    // Central differences: the surface's slope both ways, and from the same four
    // points its curvature, which darkens the valleys of a fold.
    float3 xp = deformCard(p + float3(e * w, 0, 0), g + float2(e, 0), c);
    float3 xm = deformCard(p - float3(e * w, 0, 0), g - float2(e, 0), c);
    float3 yp = deformCard(p + float3(0, -e * h, 0), g + float2(0, e), c);
    float3 ym = deformCard(p - float3(0, -e * h, 0), g - float2(0, e), c);
    float3 n = normalize(cross(xp - xm, ym - yp));
    float lap = (xp.z + xm.z - 2.0 * d.z) / ((e * w) * (e * w)) + (yp.z + ym.z - 2.0 * d.z) / ((e * h) * (e * h));
    float4 world = c.model * float4(d, 1.0);
    float3 wn = normalize((c.model * float4(n, 0.0)).xyz);
    // The edge pass draws the card's back shell, pushed back by its thickness:
    // hidden behind the face when square-on, a lit edge when the card turns.
    if (c.extra.y > 0.5) world.xyz -= wn * c.extra.z;
    float3 wt = normalize((c.model * float4(xp - xm, 0.0)).xyz);
    if (c.mirror.x > 0.5) {
        world.y = 2.0 * c.mirror.y - world.y;
        wn.y = -wn.y;
        wt.y = -wt.y;
    }
    CardVOut o;
    o.position = f.viewProj * world;
    o.uv = g;
    o.worldPos = world.xyz;
    o.normal = wn;
    o.tangent = wt;
    // Paper's buckle is pinned near the edge, where its curvature gathers;
    // the shade follows only where the surface is free to fold.
    float pin = smoothstep(0.0, 0.18, sin(PI * g.x)) * smoothstep(0.0, 0.18, sin(PI * g.y));
    o.cavity = clamp(lap * min(w, h) * 0.15, 0.0, 1.0) * pin;
    o.viewDist = length(world.xyz - f.eye.xyz);
    return o;
}

// Maps the whole card's uv (0…1, y down) to media uv. Returns false outside fitted media.
inline float2 mediaUV(float2 uv, constant CardU &c, thread float &inside) {
    float2 ps = parentSize(c);
    float ca = ps.x / max(ps.y, 1e-5);
    float ma = max(c.media.w, 1e-4);
    float2 focal = c.media.yz;
    inside = 1.0;
    if (c.media.x < 0.5) {
        if (ma > ca) {
            float frac = ca / ma;
            float cx = clamp(focal.x, 0.5 * frac, 1.0 - 0.5 * frac);
            return float2((uv.x - 0.5) * frac + cx, uv.y);
        } else {
            float frac = ma / ca;
            float cy = clamp(focal.y, 0.5 * frac, 1.0 - 0.5 * frac);
            return float2(uv.x, (uv.y - 0.5) * frac + cy);
        }
    } else {
        float2 m;
        if (ma > ca) {
            m = float2(uv.x, (uv.y - 0.5) * (ma / ca) + 0.5);
        } else {
            m = float2((uv.x - 0.5) * (ca / ma) + 0.5, uv.y);
        }
        float2 ok = step(float2(0.0), m) * step(m, float2(1.0));
        inside = ok.x * ok.y;
        return m;
    }
}

// Superellipse-flavoured rounded box: blends a circular corner towards a
// continuous (squircle-like) curvature.
inline float sdCard(float2 p, float2 halfSize, float r) {
    r = min(r, min(halfSize.x, halfSize.y));
    float2 q = abs(p) - halfSize + r;
    float2 m = max(q, 0.0);
    float k = 2.6;
    float len = pow(pow(m.x, k) + pow(m.y, k), 1.0 / k);
    return len + min(max(q.x, q.y), 0.0) - r;
}

inline float sliceDistance(float2 uv, constant CardU &c, thread float2 &parentUV) {
    float2 ps = parentSize(c);
    parentUV = mix(c.crop.xy, c.crop.zw, uv);
    // Only the whole card's outline is antialiased. A slice's own cuts are the
    // edges of its quad: slices that touch share them exactly, so a card cut
    // into pieces stays watertight; a loose band softens itself by narrowing.
    return sdCard((parentUV - 0.5) * ps, ps * 0.5, c.sizeCorner.z);
}

// Disc sample for defocus. radius in uv units.
// Defocus by a disc of taps. Every tap is filtered with the card's own
// screen-space gradients (widened with the defocus), so a card seen at a
// slant keeps its type sharp along the slant instead of blurring both ways.
inline float4 sampleDefocus(texture2d<float> t, sampler s, float2 uv, float2 radius, float2 gx, float2 gy) {
    if (radius.x < 1e-6 && radius.y < 1e-6) return t.sample(s, uv, gradient2d(gx, gy));
    const float2 taps[8] = {
        float2( 0.7071,  0.7071), float2(-0.7071,  0.7071), float2( 0.7071, -0.7071), float2(-0.7071, -0.7071),
        float2( 1.0,     0.0   ), float2(-1.0,     0.0   ), float2( 0.0,     1.0   ), float2( 0.0,    -1.0   )
    };
    float4 acc = t.sample(s, uv, gradient2d(gx, gy)) * 2.0;
    for (int i = 0; i < 8; i++) {
        float r = (i < 4) ? 0.55 : 1.0;
        acc += t.sample(s, uv + taps[i] * radius * r, gradient2d(gx, gy));
    }
    return acc / 10.0;
}

inline float3 spectral(float x) {
    // Smooth rainbow for foil sheen.
    return clamp(float3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0);
}

fragment float4 card_fragment(CardVOut in [[stage_in]], bool facing [[front_facing]],
                              constant FrameU &f [[buffer(1)]],
                              constant CardU &c [[buffer(2)]],
                              texture2d<float> tex [[texture(0)]],
                              sampler s [[sampler(0)]]) {
    // A reflection is drawn mirrored, which reverses its winding: its front
    // arrives as a back face.
    bool front = c.mirror.x > 0.5 ? !facing : facing;
    float w = c.sizeCorner.x, h = c.sizeCorner.y;
    float2 puv;
    float d = sliceDistance(in.uv, c, puv);
    float2 ps = parentSize(c);
    float2 local = (puv - 0.5) * ps;
    float pxWorld = max(fwidth(d), 1e-6);

    // Defocus from depth, plus any per-card blur.
    float coc = 0.0;
    if (f.dof.y > 0.0) {
        float defocus = abs(in.viewDist - f.dof.x) / max(in.viewDist, 1e-3);
        coc = min(defocus * f.dof.y, f.dof.z);
    }
    coc += c.fx.y;
    float feather = pxWorld * (0.85 + coc * 0.9);
    float mask = 1.0 - smoothstep(-feather, feather, d);
    float rim = bandRim(in.uv, c);
    if (c.band.y > 0.0) {
        float core = c.band.x;
        float bandA = 1.0 - smoothstep(core - 0.10, core + 0.06, rim);
        mask *= mix(1.0, bandA, c.band.y);
    }
    if (c.extra.x < 0.9999) {
        float edge = (puv.x - c.extra.x) * ps.x;
        mask *= 1.0 - smoothstep(-pxWorld, pxWorld, edge);
    }
    if (mask <= 0.0) discard_fragment();

    if (c.extra.y > 0.5) {
        // Card thickness: stock, photo core, foil or a dark neutral for slides.
        float3 N = normalize(in.normal);
        if (!front) N = -N;
        float3 L = normalize(f.light.xyz);
        float shade = 0.6 + 0.4 * clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        float kind = c.extra.w;
        float3 edge = kind < 0.5 ? float3(0.13, 0.13, 0.14)
                    : (kind < 1.5 ? float3(0.78, 0.75, 0.70)
                    : (kind < 2.5 ? float3(0.88, 0.88, 0.86)
                    : (kind < 3.5 ? float3(0.52, 0.52, 0.56) : float3(0.80, 0.78, 0.74))));
        float ea = mask * c.sizeCorner.w * c.color.a;
        return float4(edge * shade * c.color.rgb * ea, ea);
    }

    float inside;
    float2 muv = mediaUV(puv, c, inside);
    float2 duv = fwidth(muv);
    float widen = 1.0 + coc * 0.35;
    float2 radius = duv * coc * 0.55;
    // In focus, the footprint keeps the card's slant (sharp type along it);
    // defocused, it rounds out to the wider axis, as the old filtering did.
    float2 gx = dfdx(muv), gy = dfdy(muv);
    float lx = length(gx), ly = length(gy), lw = max(lx, ly);
    float rounding = smoothstep(0.5, 5.0, coc);
    gx *= mix(1.0, lw / max(lx, 1e-8), rounding);
    gy *= mix(1.0, lw / max(ly, 1e-8), rounding);
    float4 m = sampleDefocus(tex, s, muv, radius, gx * widen, gy * widen);
    m *= inside;

    int surface = int(c.fx.w + 0.5);
    float3 rgb = m.a > 1e-5 ? m.rgb / m.a : float3(0.0);
    float alpha = m.a;

    float3 N = normalize(in.normal);
    float3 V = normalize(f.eye.xyz - in.worldPos);
    if (!front) N = -N;
    float3 L = normalize(f.light.xyz);

    if (!front) {
        // The back of a card: stock with a whisper of the artwork through it.
        float3 stock = float3(0.045, 0.043, 0.047);
        rgb = mix(stock, rgb * 0.25, 0.18);
        alpha = 1.0;
    } else if (surface >= 1) {
        float ndl = dot(N, L);
        float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
        float shade = mix(0.80, 1.06, wrap);
        rgb *= shade;
        if (surface == 1) {
            float tooth = hash1(int2(floor(puv * ps * 900.0)), 5u) - 0.5;
            rgb *= 1.0 + tooth * 0.03;
        }
        float3 H = normalize(L + V);
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
        if (surface == 2) {
            // A broad lobe, like a large softbox: a tight one zips across the card
            // as a glint whenever the card turns a few degrees.
            float spec = pow(max(dot(N, H), 0.0), 30.0) * 0.16;
            float3 R = reflect(-V, N);
            float softbox = smoothstep(0.55, 0.9, R.y) * smoothstep(-0.2, 0.25, R.z) * 0.10;
            rgb += spec + softbox + fres * 0.08;
        } else if (surface == 3) {
            // Foil: a thin film over the print. Its colour comes from light
            // interfering in a film a few hundred nanometres thick, so it shifts
            // as the card tilts, and it shows only where the print is light:
            // ink covers foil, so type stays solid.
            float c1 = clamp(dot(N, V), 0.0, 1.0);
            const float nf = 1.38;
            float c2 = sqrt(max(1.0 - (1.0 - c1 * c1) / (nf * nf), 0.0));
            float thick = 0.5 + 0.5 * snoise3(float3(puv * 2.2, 3.7));
            float dn = 400.0 + 260.0 * (thick - 0.5);
            float3 film = 0.5 - 0.5 * cos(2.0 * PI * 2.0 * nf * dn * c2 / float3(650.0, 532.0, 450.0));
            float cover = smoothstep(0.5, 0.92, dot(rgb, float3(0.2126, 0.7152, 0.0722)));
            // Restrained square-on, richer as the card tilts away.
            float3 tint = mix(float3(0.92), film, 0.55);
            float amount = cover * (0.18 + 0.42 * (1.0 - c1));
            rgb = mix(rgb, rgb * tint * 1.08, amount);
            rgb += cover * pow(max(dot(N, H), 0.0), 120.0) * 0.1 * film;
        } else if (surface == 4) {
            // Satin: a woven sheen. A band of light runs across the weave, a soft
            // sheen gathers where the cloth turns from the eye, and the valleys
            // of folds fall into shade, all within what keeps type readable.
            float3 T = normalize(in.tangent - N * dot(N, in.tangent));
            float3 Tw = normalize(T + cross(N, T));
            // How far this point turns from the card's own plane: the sheen lives
            // in the folds and curls, and stays light on a flat card.
            float3 Nc = normalize((c.model * float4(0.0, 0.0, 1.0, 0.0)).xyz);
            if (c.mirror.x > 0.5) Nc.y = -Nc.y;
            float bent = smoothstep(0.0, 0.12, 1.0 - abs(dot(N, Nc)));
            float lum = dot(rgb, float3(0.2126, 0.7152, 0.0722));
            float NL = clamp(dot(N, L), 0.0, 1.0), NV = clamp(dot(N, V), 0.0, 1.0), NH = clamp(dot(N, H), 0.0, 1.0);
            float TH = dot(Tw, H);
            float band = pow(sqrt(max(1.0 - TH * TH, 0.0)), 32.0) * NL;
            const float a = 0.45 * 0.45;
            float charlie = (2.0 + 1.0 / a) * pow(max(1.0 - NH * NH, 0.0078125), 0.5 / a) / (2.0 * PI);
            float vis = clamp(1.0 / (4.0 * (NL + NV - NL * NV)), 0.0, 1.0);
            // Dark artwork keeps its depth: the sheen is held back where the print is dark.
            float keep = (0.3 + 0.7 * bent) * mix(0.35, 1.0, smoothstep(0.02, 0.4, lum));
            rgb *= (1.0 - 0.28 * in.cavity) * 0.96;
            rgb += keep * (0.09 * band + 0.75 * float3(1.0, 0.97, 0.94) * charlie * vis * NL);
        }
        // Edge catch light: a hairline along the rim facing the light.
        float edge = (1.0 - smoothstep(0.0, pxWorld * 2.2, abs(d + pxWorld * 1.2)));
        float facing = clamp(dot(normalize(float3(local, 0.0)), float3(L.xy, 0.0)) * 0.5 + 0.5, 0.0, 1.0);
        rgb += edge * facing * 0.10;
    }

    if (c.band.y > 0.0) {
        // A loose thread's sides turn away from the light; its core catches it,
        // both as far as the thread has come loose.
        rgb *= 1.0 - c.band.y * c.band.z * rim * rim;
        rgb += c.band.y * c.band.w * (1.0 - smoothstep(0.0, 0.45, rim));
    }
    rgb *= c.color.rgb;
    rgb *= 1.0 + c.fx.x;
    float a = alpha * mask * c.sizeCorner.w * c.color.a;
    if (c.mirror.x > 0.5) {
        float below = max(c.mirror.y - in.worldPos.y, 0.0);
        a *= c.mirror.z * exp(-below * c.mirror.w);
    }
    return float4(rgb * a, a);
}

// ───────────────────────────── shadows

struct ShadowVOut {
    float4 position [[position]];
    float2 local;      // card-local position, world units
    float sigma;
    float strength;
};

vertex ShadowVOut shadow_vertex(uint vid [[vertex_id]],
                                constant FrameU &f [[buffer(1)]],
                                constant CardU &c [[buffer(2)]],
                                constant float4 &mode [[buffer(3)]]) {
    // mode: x = layer (0 key, 1 ambient), y = margin (world), z = sigma base, w = sigma per unit height
    const float2 corners[6] = { float2(0, 0), float2(1, 0), float2(0, 1), float2(1, 0), float2(1, 1), float2(0, 1) };
    float2 g = corners[vid];
    float w = c.sizeCorner.x, h = c.sizeCorner.y;
    float groundZ = f.shadowP.y;
    // The quad must contain the whole Gaussian, or the shadow is clipped into a box.
    float centreHeight = max((c.model * float4(0.0, 0.0, 0.0, 1.0)).z - groundZ, 0.0);
    float reach = max(w, h) * 0.5;
    float sigmaMax = mode.z + mode.w * (centreHeight + reach);
    float margin = max(mode.y, sigmaMax * 3.2);
    float2 local = float2((g.x - 0.5) * (w + 2.0 * margin), (0.5 - g.y) * (h + 2.0 * margin));
    float4 world = c.model * float4(local, 0.0, 1.0);
    float height = max(world.z - groundZ, 0.0);
    float3 L = (mode.x < 0.5) ? normalize(f.light.xyz) : float3(0.0, 0.0, 1.0);
    float3 P = world.xyz - L * (height / max(L.z, 0.2));
    P.z = groundZ;
    ShadowVOut o;
    o.position = f.viewProj * float4(P, 1.0);
    o.local = float2(local.x, -local.y);
    o.sigma = mode.z + mode.w * centreHeight;
    o.strength = 1.0 / (1.0 + centreHeight * 2.2);
    return o;
}

fragment float4 shadow_fragment(ShadowVOut in [[stage_in]],
                                constant FrameU &f [[buffer(1)]],
                                constant CardU &c [[buffer(2)]],
                                constant float4 &mode [[buffer(3)]]) {
    float w = c.sizeCorner.x, h = c.sizeCorner.y;
    // The slice's shape within the whole card, as for its face.
    float2 ps = parentSize(c);
    float2 centre = ((c.crop.xy + c.crop.zw) * 0.5 - 0.5) * ps;
    float d = sdCard(in.local + centre, ps * 0.5, c.sizeCorner.z);
    float2 b = abs(in.local) - float2(w, h) * 0.5;
    d = max(d, max(b.x, b.y));
    float sigma = max(in.sigma, 1e-4);
    float outside = max(d, 0.0);
    float a = exp(-outside * outside / (2.0 * sigma * sigma));
    // Soften the inside slightly so thin shadows do not look cut out.
    a *= smoothstep(-sigma * 2.5, sigma * 0.5, -d) * 0.35 + 0.65;
    float share = (mode.x < 0.5) ? f.shadowP.z : f.shadowP.w;
    a *= f.light.w * share * c.fx.z * c.sizeCorner.w * in.strength;
    return float4(0.0, 0.0, 0.0, clamp(a, 0.0, 0.95));
}

// ───────────────────────────── accumulation (motion blur)

fragment float4 accumulate_fragment(FSOut in [[stage_in]], constant float4 &weight [[buffer(0)]],
                                    texture2d<float> src [[texture(0)]], sampler s [[sampler(0)]]) {
    return src.sample(s, in.uv) * weight.x;
}

fragment float4 copy_fragment(FSOut in [[stage_in]], texture2d<float> src [[texture(0)]], sampler s [[sampler(0)]]) {
    return src.sample(s, in.uv);
}
"""#

    static var library: String { ShaderPrelude.source + source }
}
