import * as THREE from "three";

/**
 * Procedural geometry for the hanami backdrop.
 *
 * Nothing in this feature is an imported model. Every shape is generated from
 * the numbers that describe the real thing, which means the arena costs a few
 * kilobytes of maths instead of a few megabytes of download, scales with the
 * tier, and can be re-proportioned by editing one object literal.
 *
 * The Colosseum is 188 x 156 m and 48 m tall, with three arcades of 80 bays
 * under a solid attic. Those numbers are the whole model.
 */

/** Real proportions, in scene units. 1 unit is roughly 1 metre. */
export const ARENA = {
  /** Centre of the ellipse, world space. */
  x: -14,
  /*
   * 246 m from the camera. At this distance a 188 m-wide building subtends
   * about 42 degrees of a 60-degree frame, so the whole ellipse fits with room
   * either side — the first cut put it 238 units away and it filled the frame
   * edge to edge, which reads as a wall rather than as a building.
   */
  z: -292,
  /** Semi-axes of the plan. */
  rx: 94,
  rz: 78,
  /** Wall thickness at the ground arcade. Massive travertine, not a facade. */
  thickness: 7.5,
} as const;

/** A distant range, as a flat silhouette. */
export function ridgeGeometry(peaks: [number, number][], width: number) {
  const shape = new THREE.Shape();
  const minX = Math.min(...peaks.map((p) => p[0]));
  const maxX = Math.max(...peaks.map((p) => p[0]));
  const shift = width / 2 - (maxX + minX) / 2;

  shape.moveTo(minX + shift, 0);
  for (const [x, y] of peaks) shape.lineTo(x + shift, y);
  shape.lineTo(maxX + shift, 0);
  shape.closePath();

  return new THREE.ShapeGeometry(shape);
}

/**
 * The three ranges behind the arena, near to far.
 *
 * Fuji first: a near-perfect cone with a flattened summit and one asymmetric
 * shoulder — the crater rim is what stops it reading as a party hat. The
 * nearest range is all shoulders, no cones: it is the foothill that makes the
 * two behind it read as distant.
 *
 * These sit just beyond the arena's far shore rather than at the horizon. Fog
 * is exponential and the ranges are 1.1 - 2.7 km out, so at 0.0011 density
 * they are 58 - 88 per cent fogged — which is what makes them read as ranges
 * instead of as grey cut-outs. Any further and they disappear entirely.
 */
export const RIDGES = {
  far: {
    z: -870,
    opacity: 0.5,
    width: 2000,
    snow: 66,
    peaks: [
      [-700, 0],
      [-430, 44],
      [-300, 74],
      [-150, 56],
      [40, 104],
      [96, 98],
      [124, 84],
      [360, 50],
      [700, 0],
    ] as [number, number][],
  },
  mid: {
    z: -1115,
    opacity: 0.62,
    width: 2200,
    snow: 999,
    peaks: [
      [-820, 0],
      [-620, 32],
      [-430, 60],
      [-240, 38],
      [-40, 72],
      [150, 42],
      [330, 76],
      [520, 34],
      [820, 0],
    ] as [number, number][],
  },
  near: {
    z: -875,
    opacity: 0.74,
    width: 2600,
    snow: 999,
    peaks: [
      [-900, 0],
      [-640, 20],
      [-520, 40],
      [-380, 24],
      [-140, 46],
      [80, 22],
      [280, 38],
      [520, 18],
      [900, 0],
    ] as [number, number][],
  },
} as const;

/**
 * The petal mesh.
 *
 * An InstancedBufferGeometry rather than an InstancedMesh on purpose: every
 * petal's transform is derived in the vertex shader from static attributes, so
 * there is no instanceMatrix to maintain and no way for the CPU and the GPU to
 * disagree about where a petal is. One draw call, zero per-frame JavaScript.
 *
 * The grid is subdivided so the flutter rotation in the vertex shader produces a
 * smooth bend. The petal's outline is not modelled — it is cut analytically in
 * the fragment shader, where it can be antialiased for free.
 */
export function petalGeometry(count: number, seed: () => number) {
  const base = new THREE.PlaneGeometry(1, 1, 10, 8);
  const geometry = new THREE.InstancedBufferGeometry();

  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));
  geometry.setAttribute("uv", base.getAttribute("uv"));

  const home = new Float32Array(count * 3);
  const petal = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    home[i * 3 + 0] = seed();
    home[i * 3 + 1] = seed();
    home[i * 3 + 2] = seed();

    petal[i * 4 + 0] = seed(); // fall phase
    petal[i * 4 + 1] = seed(); // fall speed
    petal[i * 4 + 2] = seed(); // size
    petal[i * 4 + 3] = seed(); // spin rate
  }

  geometry.setAttribute("aHome", new THREE.InstancedBufferAttribute(home, 3));
  geometry.setAttribute("aPetal", new THREE.InstancedBufferAttribute(petal, 4));
  geometry.instanceCount = count;
  // The field spans the whole frustum by construction and three cannot know
  // that from an instanced buffer; a wrong bounding sphere makes every petal
  // vanish on the first camera move.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, -60), 320);

  base.dispose();
  return geometry;
}

/** A soft-edged lump, for blossom canopies and lantern glows. */
export function blobGeometry(detail: number) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;

  // Push every vertex out by a deterministic pseudo-random amount. Without it a
  // sphere reads as a sphere, and a blossom canopy made of spheres reads as a
  // snowman. The hash is a pure function of position, so the canopy is the same
  // shape on every machine and every reload.
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const n = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
    v.multiplyScalar(1 + ((n - Math.floor(n)) - 0.5) * 0.4);
    position.setXYZ(i, v.x, v.y, v.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Deterministic PRNG (xorshift32).
 *
 * The scene must be identical on every machine and on every reload: a backdrop
 * that reshuffles itself on refresh is not a backdrop, it is a lottery.
 */
export function makeRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}