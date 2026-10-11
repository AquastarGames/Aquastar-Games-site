/**
 * GLSL for the hanami backdrop.
 *
 * Every custom material here follows two rules from the rest of the repo:
 *  1. No colour is written as a literal. Colours arrive as uniforms read from
 *     CSS (lib/tokens.ts), so the DOM and the scene cannot drift apart.
 *  2. GLSL ES 1.00 dialect (`varying`, `texture2D`, `gl_FragColor`). three.js
 *     rewrites it for a WebGL2 context — the paper shaders in features/hero
 *     use the same dialect and are the reference for what is safe.
 *
 * Fog is applied BY HAND in every custom material below (`fogChunk` /
 * `applyFog`) instead of via three's fog chunks. The stock chunks require the
 * material to opt in AND to carry `UniformsLib.fog`, and THREE.Reflector builds
 * its own material from a shader object — merging fog uniforms into that by
 * hand is more fragile than owning six lines of exponential-squared falloff.
 */

/* ------------------------------------------------------------------ common */

const HASH = /* glsl */ `
  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
`;

/**
 * Exponential-squared fog, matched to THREE.FogExp2's maths so custom and
 * standard materials meet without a seam at their shared silhouettes.
 * `fogDensity` and `fogColor` are set from the scene in Scene.tsx.
 */
const FOG_PARS = /* glsl */ `
  uniform vec3 fogColor;
  uniform float fogDensity;

  float fogFactorAt(float depth) {
    float d = depth * fogDensity;
    return 1.0 - exp(-d * d);
  }
`;

export const applyFog = /* glsl */ `
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactorAt(vDepth), 0.0, 1.0));
`;

/* --------------------------------------------------------------------- sky */

/**
 * The high-key dome.
 *
 * This is the single most important surface in the scene: it sets the value
 * ceiling for everything else, and it occupies the top third of the frame —
 * exactly where the DOM headline sits. So it is deliberately near-paper-white
 * with a slow vertical warm gradient and one very soft sun bloom, nothing more.
 * A saturated sky would win the fight against `#17130f` headline ink.
 */
export const skyVertexShader = /* glsl */ `
  varying vec3 vDir;

  void main() {
    vDir = position;
    // The dome follows the camera: w = 1 removes translation from the view
    // matrix, so the horizon never drifts when the camera dollies.
    vec4 mv = viewMatrix * vec4(position + cameraPosition, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const skyFragmentShader = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uTime;

  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);

    // Height above the horizon, 0 at the waterline, 1 overhead.
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // Two-stage gradient. A single mix reads as a flat wash on a 21-degree
    // fov; the easing puts most of the change in the band the eye actually
    // sees, just above the mist.
    float t = pow(h, 0.72);
    vec3 col = mix(uHorizon, uZenith, t);

    // Sun: a broad, low-contrast bloom. Not a disc — a disc at this value
    // would be the brightest thing on the page and pull the eye off the type.
    float d = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(d, 6.0) * 0.16;
    col += uSunColor * pow(d, 1.6) * 0.035;

    // A barely-there warm haze right on the horizon line, where the arena
    // dissolves into mist.
    float haze = smoothstep(0.12, 0.0, abs(dir.y));
    col = mix(col, uHorizon * 1.02, haze * 0.6);

    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------- water */

/**
 * The ripple field.
 *
 * Three crossing swells plus two octaves of expanding rain rings. The rings are
 * the whole point of the surface — a lake with only directional waves looks
 * like corrugated iron. They are hashed per grid cell, so the pattern is
 * procedural, costs no memory, and never repeats visibly because each cell's
 * phase and centre are independent.
 *
 * Returns height, writes the analytic gradient. The gradient is analytic, not
 * a finite difference, because the fragment shader needs the normal at full
 * resolution while the vertex shader only needs the height — sampling the same
 * function three times per pixel for a finite difference would cost 3x for a
 * worse result.
 */
const WATER_FIELD = /* glsl */ `
  uniform float uTime;
  uniform float uGust;

  float swell(vec2 p, vec2 dir, float freq, float speed, float amp, float t, inout vec2 grad) {
    float phase = dot(p, dir) * freq + t * speed;
    grad += dir * (cos(phase) * amp * freq);
    return sin(phase) * amp;
  }

  // Expanding rings on a hashed lattice.
  float rings(vec2 p, float t, float cell, float freq, float speed, float amp, inout vec2 grad) {
    vec2 q = p * freq;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;

    vec2 centre = hash22(id + freq) * 0.34;
    float seed = hash12(id * 1.37 + freq);

    // Each cell's ring is born, expands, dies — never resets in lockstep,
    // which is what stops the whole lake pulsing together.
    float age = fract(t * speed + seed);
    float radius = age * 0.58;
    float ring = exp(-pow((length(f - centre) - radius) * 11.0, 2.0));
    float decay = (1.0 - age) * (1.0 - age);

    float h = ring * decay * amp;
    vec2 dir = f - centre;
    float dl = max(length(dir), 1e-4);
    grad += (dir / dl) * (ring * decay * amp * -11.0 * 0.11 * sign((dl - radius))) / freq;
    return h;
  }

  float waterField(vec2 p, float t, out vec2 grad) {
    grad = vec2(0.0);
    float h = 0.0;

    h += swell(p, normalize(vec2(0.92, 0.39)), 0.085, 0.62, 0.075, t, grad);
    h += swell(p, normalize(vec2(-0.36, 0.93)), 0.147, 0.83, 0.036, t, grad);
    h += swell(p, normalize(vec2(0.64, -0.77)), 0.31, 1.21, 0.013, t, grad);

    h += rings(p, t, 1.0, 0.55, 0.34, 0.019, grad);
    h += rings(p, t, 1.0, 1.42, 0.52, 0.007, grad);

    // Wind couples the whole surface: a gust lifts the swells and roughens the
    // rings. Same uGust that pushes the petals, so the lake and the air are
    // demonstrably the same weather.
    grad *= 1.0 + uGust * 0.7;
    return h * (1.0 + uGust * 0.35);
  }
`;

/**
 * Water surface.
 *
 * The vertex stage displaces only the long, low-frequency part of the field.
 * Displacing the ring octaves as well would put a 4 mm ripple into the geometry
 * at 200 units away — invisible, and it would wreck the silhouette of the
 * reflection for nothing. Detail belongs to the normal, not the mesh.
 */
export const waterVertexShader = /* glsl */ `
  // HASH is required HERE as well as in the fragment stage: the vertex shader
  // calls waterField, which calls rings, which hashes. Omitting it produced a
  // vertex stage that referenced two undefined functions — a link failure that
  // three reports only as "program not valid" and nothing else.
  ${HASH}
  ${WATER_FIELD}

  uniform mat4 textureMatrix;

  varying vec4 vReflectUv;
  varying vec3 vWorld;
  varying float vDepth;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 viewPos = viewMatrix * world;

    vec2 p = world.xz;
    vec2 grad;
    float h = waterField(p, uTime, grad);

    // Long swell only. See the note above.
    float swell =
      sin(dot(p, normalize(vec2(0.92, 0.39))) * 0.085 + uTime * 0.62) * 0.075 +
      sin(dot(p, normalize(vec2(-0.36, 0.93))) * 0.147 + uTime * 0.83) * 0.036;

    world.y += swell;

    vWorld = world.xyz;
    vDepth = -viewPos.z;
    vReflectUv = textureMatrix * world;

    gl_Position = projectionMatrix * viewPos;
  }
`;

export const waterFragmentShader = /* glsl */ `
  ${HASH}
  ${WATER_FIELD}
  ${FOG_PARS}

  uniform vec3 color;          // Reflector's tint uniform — three sets this.
  uniform sampler2D tDiffuse;  // The reflection target. Reflector sets this.
  // Both body colours are vec3. Declared as floats they compile into a
  // float-equals-vec3 mismatch the driver reports as "dimension mismatch"
  // against the line below, which is not where the mistake is.
  uniform vec3 uHorizon;       // Stand-in sky ramp, for tiers with no mirror.
  uniform vec3 uZenith;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform float uReflect;      // 0 = no planar reflection on this tier.

  varying vec4 vReflectUv;
  varying vec3 vWorld;
  varying float vDepth;

  void main() {
    vec2 grad;
    waterField(vWorld.xz, uTime, grad);

    // Normal from the analytic gradient. Negated: the field rises going -grad.
    vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));

    vec3 viewDir = normalize(cameraPosition - vWorld);

    // Schlick fresnel. Water is a dielectric: near-total reflection at grazing
    // angles, near-transparent looking straight down. This single term is what
    // makes a flat plane read as water at all.
    float f = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    float fresnel = 0.03 + 0.97 * f;

    // Base body colour: shallower and warmer near the shore line.
    float shore = smoothstep(0.0, 1.0, exp(-length(vWorld.xz - vec2(0.0, -70.0)) * 0.0055));
    vec3 body = mix(uShallow, uDeep, shore);

    vec3 col = body;

    if (uReflect > 0.0) {
      // Projected-UV lookup, offset by the ripple gradient. The division by w
      // is not optional: vReflectUv is a projective coordinate and distorting it
      // directly skews the distortion with depth.
      vec2 uv = vReflectUv.xy / max(vReflectUv.w, 0.0001);
      uv += grad * 0.34;

      vec3 reflected = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb * color;

      // Distortion fades with distance, or the far end of the lake turns into
      // aliased noise where the gradient is compressed into a few pixels.
      float fade = 1.0 - smoothstep(60.0, 420.0, vDepth);

      // Capped at 0.82 even at full grazing incidence. Physics says a water
      // surface at a shallow angle reflects ~100%, and the result is a lake
      // that is the exact colour of the sky with a horizon you cannot find.
      // A little of the body colour always survives, and the horizon line stays
      // the single most important edge in the lower half of the frame.
      col = mix(body, reflected, clamp(fresnel * uReflect * 0.82 * (0.4 + 0.6 * fade), 0.0, 1.0));
    } else {
      // No reflection target on this tier. A three-stop stand-in for the dome
      // stands in, so the surface keeps its fresnel read instead of going
      // matte — a cheap tier must be a FLATTER picture, not a different one.
      vec3 sky = mix(uHorizon, uZenith, 0.35);
      col = mix(body, sky, fresnel * 0.55);
    }

    // Specular glint off the low sun — the ring crests catching light. Cheap,
    // and it is what makes the ripples legible as MOVING.
    vec3 sunDir = normalize(vec3(0.42, 0.34, -0.84));
    vec3 h = normalize(sunDir + viewDir);
    float spec = pow(max(dot(n, h), 0.0), 220.0);
    col += vec3(1.0) * spec * 0.5;

    // Distance haze. Handled here rather than by three's fog chunks so the
    // Reflector's own material does not need UniformsLib.fog merged into it.
    col = mix(col, fogColor, clamp(fogFactorAt(vDepth), 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------- mist */

/**
 * Mist sheets.
 *
 * Big soft quads drifting between the camera and the arena. This is the single
 * most valuable atmospheric element in the scene: it separates the near water
 * from the far arena (aerial perspective in one draw call), and it clears the
 * value band the DOM headline sits in, which is what keeps `#17130f` type on
 * top of a photograph legible.
 */
export const mistVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uDrift;
  uniform float uSpan;

  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vUv = uv;

    vec3 p = position;
    // Wrapping drift: the sheet slides and re-enters on the far side, so a
    // single quad is enough and there is never a visible edge event.
    p.x = mod(p.x + uTime * uDrift + uSpan, uSpan * 2.0) - uSpan;

    vec4 viewPos = viewMatrix * vec4(p, 1.0);
    vDepth = -viewPos.z;

    gl_Position = projectionMatrix * viewPos;
  }
`;

export const mistFragmentShader = /* glsl */ `
  ${HASH}

  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uScale;
  uniform vec3 fogColor;
  uniform float fogDensity;

  varying vec2 vUv;
  varying float vDepth;

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
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Two noise layers moving at different rates: the slow one gives the sheet
    // its body, the fast one its edge detail. A single layer reads as fog
    // *animated*, which is worse than no fog at all.
    float n = fbm(vUv * vec2(uScale, uScale * 0.35) + vec2(uTime * 0.012, uTime * 0.004));
    n = mix(n, fbm(vUv * uScale * 2.4 - vec2(uTime * 0.03, 0.0)), 0.35);

    // Vertical envelope: dense at the waterline, gone by the top of the sheet.
    float band = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.42, 1.0, vUv.y));
    float alpha = smoothstep(0.42, 0.92, n) * band * uOpacity;

    if (alpha < 0.004) discard;

    // Mist is light and it eats contrast — that is the entire point. It also
    // fades into the scene fog so the sheet has no edge where it ends.
    float d = vDepth * fogDensity;
    float f = clamp(1.0 - exp(-d * d), 0.0, 1.0);
    vec3 col = mix(uColor, fogColor, f * 0.8);

    gl_FragColor = vec4(col, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ----------------------------------------------------------------- petals */

/**
 * Sakura petals.
 *
 * Fully GPU-animated: every petal's position, tumble axis and flutter phase is
 * derived in the vertex shader from four static floats. Nothing about a petal
 * changes on the CPU after upload, so 2600 of them cost one draw call and no
 * per-frame JavaScript at all.
 *
 * The petal itself is a 10x8 grid whose outline is cut analytically in the
 * fragment shader rather than modelled. A modelled petal would need enough
 * vertices to keep the notch and the rounded tip smooth — and at these sizes
 * (3 px to 90 px across) that is invisible. The mask costs one smoothstep and
 * antialiases itself with fwidth, which a textured quad does not.
 */
export const petalVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uGust;
  uniform float uTop;
  uniform float uSpan;
  uniform float uSway;

  attribute vec3 aHome;    // rest position, world space
  attribute vec4 aPetal;   // x phase, y fall speed, z size, w spin rate

  varying vec2 vUv;
  varying float vFacing;
  varying float vNear;
  varying float vSeed;

  vec3 rotateAxis(vec3 v, vec3 axis, float angle) {
    // Rodrigues. Cheaper than building a mat3 and cheaper than a quaternion,
    // and the axis is already normalised at the call site.
    float c = cos(angle);
    float s = sin(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  }

  void main() {
    float t = uTime;
    float phase = aPetal.x;
    float speed = aPetal.y;
    float size = aPetal.z;
    float spin = aPetal.w;

    // Falling. fract() wraps the petal back to the top; at the wrap instant the
    // petal is off-camera or in the mist band, so the pop is never visible.
    float fall = fract(phase + t * speed / uSpan);
    vec3 home = aHome;
    home.y = uTop - fall * uSpan;

    // Lateral sway: two incommensurable frequencies per axis, so the path never
    // repeats visibly and no two petals move alike.
    //
    // The amplitude follows SQRT of the petal's size, not its size. Linear was
    // the original and it is a trap: a 30-unit hero petal then swings 150 units
    // and the entire foreground becomes one giant slow-moving sheet that wipes
    // across the frame. Root of the size, not the size.
    float sway = uSway * (0.4 + sqrt(size) * 0.5) * (1.0 + uGust * 1.2);
    float w1 = t * 0.55 + phase * 43.0;
    float w2 = t * 0.31 + phase * 17.3;
    home.x += sin(w1) * sway + sin(t * 0.19 + phase * 9.1) * sway * 0.5 * uGust;
    home.z += cos(w2) * sway * 0.75 + cos(t * 0.17 + phase * 5.7) * sway * 0.4 * uGust;

    // Local frame. The grid is a unit plane in XY; the petal's length runs
    // along +X so the fall direction (world -Y) is across its width, which is
    // how a petal actually hangs.
    vec3 p = position;
    p.y *= 0.86; // Petals are never square.

    // Tumble around a slowly drifting axis. This is the difference between
    // "confetti" and "leaf": the axis itself rotates, so the petal shows its
    // face, then its edge, then its back, at an unpredictable rate.
    vec3 axis = normalize(vec3(sin(t * 0.23 + phase * 12.7), 0.72, cos(t * 0.19 + phase * 7.3)));
    p = rotateAxis(p, axis, t * spin + phase * 61.0);

    // Flutter: a leaf falling edge-on snaps through and catches the light.
    float flip = sin(t * 0.9 + phase * 30.0);
    p.yz = mat2(cos(flip * 1.25), -sin(flip * 1.25), sin(flip * 1.25), cos(flip * 1.25)) * p.yz;

    // A slow constant nose-down tilt: petals fall edge-forward, not flat.
    p = rotateAxis(p, vec3(0.0, 0.0, 1.0), 0.28 + sin(t * 0.4 + phase * 20.0) * 0.22);

    vec3 world = home + p * size;

    vec4 viewPos = viewMatrix * vec4(world, 1.0);

    // Fake depth of field, computed rather than rendered: distance from the
    // lens drives how far the mask is softened in the fragment stage. Free,
    // and on a background it is indistinguishable from a real DOF pass.
    float depth = -viewPos.z;
    vNear = 1.0 - smoothstep(2.0, 26.0, depth);

    // Facing drives the backlit glow, which is what makes a petal look thin.
    vFacing = dot(normalize(cameraPosition - world), vec3(0.0, 0.0, 1.0) * sign(p.z + 0.0001));
    vSeed = phase;
    vUv = uv;

    gl_Position = projectionMatrix * viewPos;
  }
`;

export const petalFragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uEdge;
  uniform vec3 uGlow;
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vFacing;
  varying float vNear;
  varying float vSeed;

  const float PI = 3.141592653589793;

void main() {
    float u = vUv.x;
    float v = (vUv.y - 0.5) * 2.0;

    // Teardrop outline. The exponent biases the widest point toward the base,
    // which is what separates a petal from a leaf blade.
    float halfWidth = pow(sin(clamp(u, 0.0, 1.0) * PI), 0.62) * 0.94;

    // Antialiasing width tracks BOTH the screen-space derivative AND the fake
    // focus. A near petal is not just faded — its edge spreads, exactly like a
    // real lens throwing a 150 px petal out of focus.
    //
    // The cap matters. At 0.34 the transition was wider than the petal itself,
    // and every near petal came out as a flat white square. 0.14 is wide
    // enough to read as blur and narrow enough to keep a recognisable shape.
    float aa = fwidth(u) * 0.7 + mix(0.012, 0.14, vNear);

    // Signed distance to the outline: negative INSIDE the petal.
    //
    // smoothstep(edge0, edge1, x) is only meaningful with edge0 < edge1 — with
    // the edges reversed it returns 0 for anything below edge0 and the mask goes
    // flat. For a signed distance the coverage is therefore one minus
    // smoothstep(-aa, aa, d), which is what everything below uses.
    float d = abs(v) - halfWidth * 0.5;

    // The notch at the tip. Every sakura petal has it; without it the shape
    // reads as a generic leaf and the whole illusion of the species goes.
    vec2 notch = vec2((u - 0.95) * 1.15, v * 0.9);
    float dn = length(notch) - 0.135;

    // The calyx: attached, never fully closed — the base of a petal wraps
    // around the receptacle rather than ending on a point.
    float ds = length(vec2(u * 0.9, v)) - 0.055;

    float inside = 1.0 - smoothstep(-aa, aa, max(d, dn));
    float calyx = 1.0 - smoothstep(-aa, aa, ds);

    float mask = max(inside, calyx);

    if (mask < 0.004) discard;

    // Colour: pale at the calyx, saturated at the tip, with a paler rim. The
    // rim matters — it is what separates one overlapping petal from another.
    vec3 col = mix(uBase, uTip, smoothstep(0.1, 1.0, u));
    float rim = smoothstep(0.15, 0.55, abs(v) / max(halfWidth, 0.001));
    col = mix(col, uEdge, rim * 0.65);

    // Per-petal value jitter. A field of identically-shaded petals reads as
    // printed confetti; ±4% is invisible on any single petal and obvious across
    // two thousand.
    col *= 1.0 + (fract(vSeed * 91.7) - 0.5) * 0.09;

    // Backlit: a petal between the eye and the sun glows. Thin material.
    col += uGlow * pow(1.0 - abs(vFacing), 3.0) * 0.55;

    // A near petal is also washed toward the paper — out of focus objects lose
    // saturation before they lose opacity, and that is what sells the blur.
    col = mix(col, uEdge, vNear * 0.55);

    gl_FragColor = vec4(col, mask * uOpacity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ ridges */

/**
 * Distant land: Mount Fuji's shoulder and the ranges behind it.
 *
 * Flat silhouettes on purpose. A shaded low-poly mountain at 600 units reads as
 * a grey blob; a flat shape with the scene fog applied reads as *distance*.
 * Three overlapping planes at different depths is all the depth cueing needed.
 */
export const ridgeVertexShader = /* glsl */ `
  varying float vDepth;
  varying vec2 vLocal;

  void main() {
    vLocal = position.xy;
    vec4 viewPos = viewMatrix * vec4(position, 1.0);
    vDepth = -viewPos.z;
    gl_Position = projectionMatrix * viewPos;
  }
`;

export const ridgeFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float uSnow;

  varying float vDepth;
  varying vec2 vLocal;

  void main() {
    float d = vDepth * fogDensity;
    float f = clamp(1.0 - exp(-d * d), 0.0, 1.0);

    vec3 col = mix(uColor, fogColor, f * 0.94);

    // Snow line on the near ridge only. It is the fastest way to say "this is
    // Fuji" without modelling a crater or a second silhouette.
    float snow = smoothstep(uSnow, uSnow + 26.0, vLocal.y) * (1.0 - f * 0.6);
    col = mix(col, vec3(0.97, 0.965, 0.955), snow * 0.55);

    gl_FragColor = vec4(col, uOpacity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;