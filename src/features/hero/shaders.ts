/**
 * Paper-in-the-wind shader for the index headline.
 *
 * The headline is drawn once into a canvas texture (see textTexture.ts) and
 * mapped onto a subdivided plane. This shader turns that flat plane into a
 * thin sheet that folds, stretches and catches the light.
 *
 * Design notes
 * ------------
 * - The height field is sampled THREE times per vertex so we can build a
 *   finite-difference normal. Without it the sheet reads as a flat decal; the
 *   whole point of "paper" is that the surface has a facing you can see.
 * - Wind is a ring of puffs, not a global lean. Each puff is an expanding
 *   Gaussian ring, stretched along the direction of travel, which is what
 *   gives the gust a leading edge instead of a soft blob.
 * - Displacement is analytic in the vertex shader on purpose. A cloth solver
 *   would be prettier in the abstract and wrong here: this is one non-
 *   interactive sheet, and analytic displacement is ~40x cheaper and cannot
 *   explode.
 *
 * All colours arrive as uniforms so the studio palette stays in one place
 * (globals.css) and the shader never hard-codes a hex value.
 */

/** Fixed puff budget. Matches MAX_PUFFS in paperText.tsx — keep in sync. */
export const MAX_PUFFS = 8;

export const paperVertexShader = /* glsl */ `
uniform float uTime;
uniform float uAmp;       // peak displacement, world units
uniform float uStretch;   // horizontal elongation where the sheet is pulled
uniform float uFold;      // resting fold depth
uniform float uRadius;    // how far a puff's ring travels
uniform float uGain;      // vertical lift per unit of gust
uniform vec2 uHalfSize;   // plane half-extent, world units
uniform vec2 uSize;       // plane full extent, world units

/**
 * The geometry is a unit quad (position.xy in [-0.5, 0.5]) and the mesh is
 * scaled by uSize. Every term below works in WORLD units, so the local
 * position has to be converted first — mixing the two scales is how puffs end
 * up flying twelve times too far from the glyphs and the sheet never reacts.
 */

// xy = centre (world), z = age 0..1, w = strength
uniform vec4 uPuffs[${MAX_PUFFS}];
// xy = unit travel direction, z = width, w = unused
uniform vec4 uPuffShape[${MAX_PUFFS}];

varying vec2 vUv;
varying float vShade;
varying float vWind;

/**
 * Height contributed by one puff at world-space point p.
 * Kept as a function so main() can re-sample it for the normal.
 */
float puffAt(vec2 p, int i) {
  vec4 g = uPuffs[i];
  if (g.w <= 0.0001) return 0.0;

  vec4 shape = uPuffShape[i];
  vec2 dir = shape.xy;
  vec2 rel = p - g.xy;

  // Elongate the gust along travel: a hand moving fast makes a streak, not a dot.
  float along = dot(rel, dir);
  float across = dot(rel, vec2(-dir.y, dir.x));
  float d = length(vec2(along * 0.55, across));

  // The ring expands with age — this is what "wind travels" looks like.
  float r = g.z * uRadius;
  float band = (d - r) / shape.z;
  float ring = exp(-band * band);

  // Fast attack, long decay. A gust arrives and leaves; it does not fade in.
  float age = g.z;
  float life = age < 0.12 ? age / 0.12 : 1.0 - (age - 0.12) / 0.88;
  life = clamp(life, 0.0, 1.0);

  return ring * g.w * life;
}

/** Total wind displacement vector at p, including the resting fold. */
vec2 sheetAt(vec2 p) {
  // Resting folds: soft vertical ridges with a very slow breath, so the
  // sheet never looks like a flat plate even when nobody is touching it.
  float fold = sin(p.x * 1.9 + 0.6) * 0.35 + sin(p.x * 4.3 - 1.1) * 0.15;
  fold *= 0.55 + 0.45 * sin(uTime * 0.23);

  float gust = 0.0;
  vec2 push = vec2(0.0);
  for (int i = 0; i < ${MAX_PUFFS}; i++) {
    float h = puffAt(p, i);
    gust += h;
    // A gust also shoves the sheet along its travel direction.
    push += uPuffShape[i].xy * h;
  }

  return vec2(fold * uFold + gust * uAmp, push * uGain * gust);
}

void main() {
  vUv = uv;

  // Local -> world. See the note on uSize.
  vec2 p = position.xy * uSize;
  // Finite differences step in world units, so they must scale with the plane
  // or the derived normal becomes resolution-dependent.
  float eps = max(uSize.y, uSize.x) * 0.0015;

  vec2 here = sheetAt(p);
  // Finite-difference normal. Three extra field samples is the entire budget.
  float dx = sheetAt(p + vec2(eps, 0.0)).x - here.x;
  float dy = sheetAt(p + vec2(0.0, eps)).x - here.x;

  // The normal comes from the world-space gradient, so it has to be divided back
  // out by the sample step — otherwise the shading silently depends on the size
  // of the plane rather than on the shape of the sheet.
  float gradY = dy / eps;
  vShade = 0.86 + 0.14 * clamp(-gradY * 20.0, -1.0, 1.0);
  vWind = clamp(here.x / max(uAmp, 0.0001) * 2.0, 0.0, 1.0);

  vec3 pos = position;
  // z is unscaled (mesh.scale.z === 1), so world units pass straight through.
  pos.z = here.x;
  // x/y ARE scaled by the mesh, so a world-unit push has to be divided back
  // down or it lands uSize times too far away.
  pos.xy += here.y / uSize;

  // Thin material elongates where it is pulled. Anchored at the edges so the
  // headline keeps its measure instead of creeping outward.
  float edge = smoothstep(1.0, 0.25, abs(p.x) / max(uHalfSize.x, 0.0001));
  pos.x *= 1.0 + clamp(here.x / max(uAmp, 0.0001), 0.0, 1.0) * uStretch * edge;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const paperFragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;
varying float vShade;
varying float vWind;

void main() {
  // The texture is a coverage mask: white glyphs on transparent. Sample the
  // alpha and re-anti-alias it with fwidth so the text stays crisp when the
  // plane is scaled up — a raw texture() fetch aliases visibly at 1.14x.
  float a = texture2D(uMap, vUv).a;

  float w = fwidth(a) * 0.7 + 0.0008;
  a = smoothstep(0.5 - w, 0.5 + w, a);

  if (a < 0.004) discard;

  // Wind slightly lifts the sheet toward the light — dust catching the sun.
  vec3 tint = mix(uColor, uColor * 1.16, vWind * 0.5);
  gl_FragColor = vec4(tint * vShade, a * uOpacity);
}
`;