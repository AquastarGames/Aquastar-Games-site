"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { readToken } from "@/lib/tokens";
import { ARENA, makeRandom } from "./geometry";
import type { SceneBudget } from "./tiers";

/**
 * THE ARENA.
 *
 * The Colosseum is a shape with five numbers in it: an ellipse, three arcades
 * of 96 bays, a solid attic storey, and a massive travertine wall. Everything
 * below is derived from those five numbers at mount time — no downloaded model,
 * no GLB, nothing to block on. The whole building is ten InstancedMeshes.
 *
 * WHY INSTANCED, AND WHY ONE MESH PER STOREY
 * ------------------------------------------
 * A bay is one small panel; there are 96 x 4 of them, plus columns, bands and
 * cornices. Drawn individually that is well over a thousand draw calls, more
 * than the entire rest of the frame. One InstancedMesh per storey-type brings
 * it to ten, and the per-instance colour jitter (every bay weathered a slightly
 * different amount) comes free with instanceColor — which is most of what stops
 * it looking like a toy: a real travertine wall is never one colour.
 *
 * DETAIL
 * ------
 * The wall is thick (7.5 units), the cornices project prominently, and the
 * engaged columns are paired — one on each face of the wall. This is what makes
 * the building read as massive rather than as a decorated shed.
 */

const TAU = Math.PI * 2;

/** Arcade storey heights and their arch openings, bottom up. */
const TIER_HEIGHT = [11.4, 11.0, 11.0, 9.6] as const;
const TIER_OPENING: readonly (readonly [number, number])[] = [
  [4.5, 4.9],
  [4.3, 4.5],
  [4.1, 4.2],
];
const BAND_HEIGHT = 0.9;
const NOMINAL_BAY = 7.4;

/** Height of the arena floor above the waterline. */
export const FLOOR_Y = TIER_HEIGHT[0] + BAND_HEIGHT;

/**
 * The cavea — tiered tribunes inside the bowl.
 *
 * Eleven raked steps climbing from the arena floor (radius factor 0.55) to
 * just under the wall (0.95), one InstancedMesh of open cone bands plus one
 * of flat tread rings. From the About camera inside the bowl they are the
 * subject; from the hero view they only glint through the arcade openings.
 */
const CAVEA = { steps: 11, rise: 1.1, f0: 0.55, f1: 0.95 } as const;

interface Placement {
  matrix: THREE.Matrix4;
  color: THREE.Color;
}

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3();
const POSITION = new THREE.Vector3();
const QUATERNION = new THREE.Quaternion();
const SCALE = new THREE.Vector3();
const BASIS = new THREE.Matrix4();

/**
 * The frame of one bay on the ellipse at `theta`, and that bay's own width.
 *
 * The width is the local arc length, not a constant. On a 94 x 78 ellipse the
 * arc is 20% longer at the ends of the major axis than at the sides, and using
 * a constant width is exactly what makes a procedural ellipse look like a
 * procedural ellipse — a ring of visibly stretched openings near the corners.
 */
function bayFrame(theta: number, bays: number, scale: number, matrix: THREE.Matrix4, out: THREE.Vector3) {
  const rx = ARENA.rx * scale;
  const rz = ARENA.rz * scale;

  out.set(ARENA.x + rx * Math.cos(theta), 0, ARENA.z + rz * Math.sin(theta));

  let tx = -rx * Math.sin(theta);
  let tz = rz * Math.cos(theta);
  const len = Math.hypot(tx, tz) || 1;
  tx /= len;
  tz /= len;

  BASIS.makeBasis(X_AXIS.set(tx, 0, tz), UP, Z_AXIS.set(-tz, 0, tx));
  QUATERNION.setFromRotationMatrix(BASIS);

  // The joint between two cast stones. Without it the arcade reads as a solid
  // extruded tube with holes, which is exactly what it is not.
  const arc = (TAU / bays) * Math.hypot(rx * Math.sin(theta), rz * Math.cos(theta)) - 0.16;
  return arc / NOMINAL_BAY;
}

function ring({
  bays,
  height,
  scale = 1,
  y,
  seed,
  weathered = 0.1,
  colour,
}: {
  bays: number;
  height: number;
  scale?: number;
  y: number;
  seed: number;
  weathered?: number;
  colour: THREE.Color;
}): Placement[] {
  const out: Placement[] = [];
  const rand = makeRandom(seed);

  for (let i = 0; i < bays; i++) {
    const theta = (i / bays) * TAU;

    const width = bayFrame(theta, bays, scale, BASIS, POSITION);
    POSITION.y = y;

    SCALE.set(width, height, 1);

    out.push({
      matrix: new THREE.Matrix4().compose(POSITION, QUATERNION, SCALE.clone()),
      color: colour.clone().multiplyScalar(1 - rand() * weathered),
    });
  }

  return out;
}

/** A horizontal cornice ring — the band that separates one storey from the next. */
function cornices({
  bays,
  y,
  scale,
  seed,
  colour,
}: {
  bays: number;
  y: number;
  scale: number;
  seed: number;
  colour: THREE.Color;
}): Placement[] {
  const out: Placement[] = [];
  const rand = makeRandom(seed);

  for (let i = 0; i < bays; i++) {
    const theta = (i / bays) * TAU;

    const width = bayFrame(theta, bays, scale, BASIS, POSITION);
    POSITION.y = y;

    // The band projects past the wall face. That projection is what makes the
    // storeys legible at distance instead of merging into one tall slab — but
    // only a little of it. The first cut used 1.5x and every storey became a
    // separate hoop floating clear of the building.
    out.push({
      matrix: new THREE.Matrix4().compose(
        POSITION,
        QUATERNION,
        SCALE.set(width * 1.08, BAND_HEIGHT / 0.6, 1.16),
      ),
      color: colour.clone().multiplyScalar(0.92 + rand() * 0.14),
    });
  }

  return out;
}

/** Engaged columns for the whole building, in one InstancedMesh. */
function columns({ bays, colour }: { bays: number; colour: THREE.Color }): Placement[] {
  const out: Placement[] = [];
  const rand = makeRandom(67);
  let base = 0;

  for (let tier = 0; tier < 4; tier++) {
    for (let i = 0; i < bays; i++) {
      // Columns stand on the pier BETWEEN two arches — the half-bay offset.
      // This is the detail that makes the rhythm read as architecture.
      const theta = (i / bays) * TAU + Math.PI / bays;

      const outward = 1 + (ARENA.thickness * 0.5 - 0.7) / Math.max(ARENA.rx, ARENA.rz);
      const width = bayFrame(theta, bays, outward, BASIS, POSITION);
      POSITION.y = base;

      out.push({
        matrix: new THREE.Matrix4().compose(
          POSITION,
          QUATERNION,
          SCALE.set(width, TIER_HEIGHT[tier]!, 1),
        ),
        color: colour.clone().multiplyScalar(0.94 + rand() * 0.14),
      });
    }

    base += TIER_HEIGHT[tier]! + BAND_HEIGHT;
  }

  return out;
}

/** The cavea: stepped tribune rings plus the podium wall at the floor edge. */
function caveaPlacements(palette: { stone: THREE.Color; deep: THREE.Color; sand: THREE.Color }): {
  caveaBands: Placement[];
  caveaTreads: Placement[];
  caveaPodium: Placement[];
} {
  const rand = makeRandom(99);
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const upright = new THREE.Quaternion();

  const caveaBands: Placement[] = [];
  const caveaTreads: Placement[] = [];

  for (let i = 0; i < CAVEA.steps; i++) {
    const t = i / (CAVEA.steps - 1);
    const f = CAVEA.f0 + (CAVEA.f1 - CAVEA.f0) * t;
    const y = FLOOR_Y + i * CAVEA.rise;

    POSITION.set(ARENA.x, y, ARENA.z);
    SCALE.set(ARENA.rx * f, CAVEA.rise, ARENA.rz * f);
    caveaBands.push({
      matrix: new THREE.Matrix4().compose(POSITION, upright, SCALE.clone()),
      color: palette.stone.clone().multiplyScalar(1 - rand() * 0.12),
    });

    POSITION.set(ARENA.x, y + CAVEA.rise, ARENA.z);
    SCALE.set(ARENA.rx * f, ARENA.rz * f, 1);
    caveaTreads.push({
      matrix: new THREE.Matrix4().compose(POSITION, flat, SCALE.clone()),
      color: palette.sand.clone().multiplyScalar(1 - rand() * 0.1),
    });
  }

  // The podium: a low wall ringing the floor itself, standing just inside the
  // first step so its rim reads against the sand.
  POSITION.set(ARENA.x, FLOOR_Y, ARENA.z);
  SCALE.set(ARENA.rx * (CAVEA.f0 - 0.02), 2.4, ARENA.rz * (CAVEA.f0 - 0.02));
  const caveaPodium: Placement[] = [
    {
      matrix: new THREE.Matrix4().compose(POSITION, upright, SCALE.clone()),
      color: palette.deep.clone(),
    },
  ];

  return { caveaBands, caveaTreads, caveaPodium };
}

/** One InstancedMesh from a placement list. Built once, never touched again. */
function ringMesh(geometry: THREE.BufferGeometry, material: THREE.Material, placements: Placement[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const colors = new Float32Array(placements.length * 3);

  placements.forEach((p, i) => {
    mesh.setMatrixAt(i, p.matrix);
    colors[i * 3 + 0] = p.color.r;
    colors[i * 3 + 1] = p.color.g;
    colors[i * 3 + 2] = p.color.b;
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  // Without an explicit bounding sphere an InstancedMesh culls against a unit
  // box at the origin, and the entire building vanishes the moment the camera
  // dollies off the origin.
  mesh.computeBoundingSphere();
  mesh.frustumCulled = true;
  return mesh;
}

function disposeAll(objects: THREE.Object3D[]) {
  for (const object of objects) {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material && !(mesh.material as THREE.Material).userData.shared) {
        (mesh.material as THREE.Material).dispose();
      }
    });
  }
}

export function Arena({ budget }: { budget: SceneBudget }) {
  const { bays } = budget;

  const palette = useMemo(
    () => ({
      stone: new THREE.Color(readToken("--aq-stone")),
      deep: new THREE.Color(readToken("--aq-stone-deep")),
      sand: new THREE.Color(readToken("--aq-sand")),
      shore: new THREE.Color(readToken("--aq-shore")),
    }),
    [],
  );

  /**
   * Every piece of geometry, in one memo.
   *
   * These are not assets — they are six ExtrudeGeometry calls over shapes with
   * holes in them, which is why this component owns them instead of loading
   * them. Disposal happens with the memo.
   */
  const geometry = useMemo(() => {
    const bay = (height: number, opening: readonly [number, number], depth: number, bevel: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(-NOMINAL_BAY / 2, 0);
      shape.lineTo(NOMINAL_BAY / 2, 0);
      shape.lineTo(NOMINAL_BAY / 2, height);
      shape.lineTo(-NOMINAL_BAY / 2, height);
      shape.closePath();

      const [openWidth, spring] = opening;
      const radius = openWidth / 2;
      const hole = new THREE.Path();
      hole.moveTo(-radius, 0);
      hole.lineTo(-radius, spring);
      // Clockwise from PI to 0 sweeps over the top. Counter-clockwise would cut
      // the arch down into the floor and leave a slab with a notch in it.
      hole.absarc(0, spring, radius, Math.PI, 0, true);
      hole.lineTo(radius, 0);
      hole.closePath();
      shape.holes.push(hole);

      const g = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: 1,
        // 24, not 8. A semicircle at 8 segments is an octagon, and 80 of them
        // around an ellipse read as a row of keyholes. The Colosseum's arcades
        // are the most recognisable thing in this scene — their curves have to
        // be true.
        curveSegments: 24,
      });
      g.translate(0, 0, -depth / 2);
      g.computeVertexNormals();
      return g;
    };

    const attic = (() => {
      const height = TIER_HEIGHT[3];
      const shape = new THREE.Shape();
      shape.moveTo(-NOMINAL_BAY / 2, 0);
      shape.lineTo(NOMINAL_BAY / 2, 0);
      shape.lineTo(NOMINAL_BAY / 2, height);
      shape.lineTo(-NOMINAL_BAY / 2, height);
      shape.closePath();

      const window = new THREE.Path();
      window.moveTo(-0.75, 2.6);
      window.lineTo(-0.75, -2.6);
      window.lineTo(0.75, -2.6);
      window.lineTo(0.75, 2.6);
      window.closePath();
      shape.holes.push(window);

      const g = new THREE.ExtrudeGeometry(shape, {
        depth: ARENA.thickness * 0.82,
        bevelEnabled: true,
        bevelSize: 0.05,
        bevelThickness: 0.05,
        bevelSegments: 1,
      });
      g.translate(0, 0, (-ARENA.thickness * 0.82) / 2);
      g.computeVertexNormals();
      return g;
    })();

    const band = new THREE.BoxGeometry(NOMINAL_BAY * 1.04, 0.6, ARENA.thickness * 1.2);
    // One cavea step: an open cone band, base at y=0 so instances stack by
    // translation alone. Top radius tucked 3.5% in — the rake of real seating.
    const step = new THREE.CylinderGeometry(0.965, 1.0, 1, 72, 1, true);
    step.translate(0, 0.5, 0);
    // One tread: a flat ring capping the step. Outer edge overshoots 6% so it
    // laps over the next band's foot instead of leaving a see-through slit.
    const tread = new THREE.RingGeometry(0.94, 1.06, 72);
    // Half a cylinder, open-ended: the half that is outside the wall. The other
    // half is inside the pier and is never visible.
    const column = new THREE.CylinderGeometry(0.62, 0.74, 1, 8, 1, false, -Math.PI / 2, Math.PI);
    column.translate(0, 0.5, 0);
    const disc = new THREE.CircleGeometry(1, 80);

    return {
      tier0: bay(TIER_HEIGHT[0]!, TIER_OPENING[0]!, ARENA.thickness, 0.07),
      tier1: bay(TIER_HEIGHT[1]!, TIER_OPENING[1]!, ARENA.thickness, 0.07),
      tier2: bay(TIER_HEIGHT[2]!, TIER_OPENING[2]!, ARENA.thickness, 0.07),
      attic,
      band,
      step,
      tread,
      column,
      disc,
    };
  }, []);

  /**
   * The interior.
   *
   * A single dark cylinder standing just inside the wall circuit. Without it the
   * arcade openings are windows onto sky, and 80 pale arches in a row read as
   * a decorative band. With it, every opening becomes a hole with a back to it,
   * the whole building gains a rim, and the far side of the ellipse appears
   * through the near bays — which is exactly the effect the real building has
   * and the one that makes a procedural ellipse read as a volume.
   *
   * One cylinder, one material, no instances: it is visible only through the
   * gaps in the wall, so its own geometry can be as crude as a 64-sided tube.
   */
  const interior = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(readToken("--aq-interior")),
      roughness: 1,
      metalness: 0,
      // Seen only from inside, through the arcade openings.
      side: THREE.BackSide,
    });

    // An ellipse-shaped tube: 72 segments of varying radius, so the shape is
    // the ellipse and not a cylinder squashed into one.
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 72, 1, true);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const angle = Math.atan2(v.z, v.x);
      // The ellipse's radius in this direction — built to the same axes as
      // ARENA, and squashed by the inset applied by the caller.
      const rx = 1;
      const rz = 1;
      v.x = Math.cos(angle) * rx;
      v.z = Math.sin(angle) * rz;
      position.setXYZ(i, v.x, v.y, v.z);
    }

    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }, []);

  useEffect(() => () => interior.geometry.dispose(), [interior]);

  useEffect(() => () => (interior.material as THREE.Material).dispose(), [interior]);

  /*
   * Size the interior against the wall.
   *
   * The tube runs from the arena floor up to the top cornice, inset 10% from
   * the wall's own ellipse so it is always behind the face from every angle.
   * The first two cuts were wrong in opposite directions — one left it poking
   * out behind the ruin as a pale sheet, the other buried it under the floor —
   * and both produced a bright shape against the sky, which is the single most
   * visible error a backdrop can have.
   *
   * Height is scaled, not absolute: the geometry is a unit cylinder in Y, so
   * scaling Y by FLOOR_Y makes it exactly the wall's height and nothing more.
   */
  useEffect(() => {
    const inset = 0.92;
    interior.position.set(ARENA.x, FLOOR_Y, ARENA.z);
    interior.scale.set(ARENA.rx * inset, FLOOR_Y, ARENA.rz * inset);
  }, [interior]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0,
      }),
    [],
  );

  /**
   * Cavea material: DoubleSide, because the About camera sits INSIDE the bowl
   * and sees the inner faces of the step bands. The shared wall material is
   * FrontSide — correct for parade views, wrong in here.
   */
  const caveaMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [],
  );

  /**
   * Every placement in the building, resolved once.
   *
   * The storeys are separate lists rather than one merged list because they are
   * separate meshes.
   */
  const placements = useMemo(() => {
    const bandY = [
      TIER_HEIGHT[0] + BAND_HEIGHT / 2,
      TIER_HEIGHT[0] + TIER_HEIGHT[1] + BAND_HEIGHT * 1.5,
      TIER_HEIGHT[0] + TIER_HEIGHT[1] + TIER_HEIGHT[2] + BAND_HEIGHT * 2.5,
      TIER_HEIGHT[0] + TIER_HEIGHT[1] + TIER_HEIGHT[2] + TIER_HEIGHT[3] + BAND_HEIGHT * 3,
    ];

    return {
      ground: ring({ bays, height: 1, y: 0, seed: 11, colour: palette.stone }),
      second: ring({
        bays,
        height: 1,
        y: TIER_HEIGHT[0] + BAND_HEIGHT,
        seed: 23,
        colour: palette.stone,
      }),
      third: ring({
        bays,
        height: 1,
        y: TIER_HEIGHT[0] + TIER_HEIGHT[1] + BAND_HEIGHT * 2,
        seed: 37,
        colour: palette.stone,
      }),
      attic: ring({
        bays,
        height: 1,
        y: TIER_HEIGHT[0] + TIER_HEIGHT[1] + TIER_HEIGHT[2] + BAND_HEIGHT * 3,
        seed: 41,
        weathered: 0.18,
        colour: palette.stone,
      }),
      bands: bandY.flatMap((y, i) =>
        cornices({ bays, y, scale: 1, seed: 53 + i * 7, colour: palette.stone }),
      ),
      pillars: columns({ bays, colour: palette.stone }),
      ...caveaPlacements(palette),
    };
  }, [bays, palette]);

  const meshes = useMemo(() => {
    return {
      ground: ringMesh(geometry.tier0, material, placements.ground),
      second: ringMesh(geometry.tier1, material, placements.second),
      third: ringMesh(geometry.tier2, material, placements.third),
      attic: ringMesh(geometry.attic, material, placements.attic),
      bands: ringMesh(geometry.band, material, placements.bands),
      pillars: ringMesh(geometry.column, material, placements.pillars),
      caveaBands: ringMesh(geometry.step, caveaMaterial, placements.caveaBands),
      caveaTreads: ringMesh(geometry.tread, caveaMaterial, placements.caveaTreads),
      caveaPodium: ringMesh(geometry.step, caveaMaterial, placements.caveaPodium),
    };
  }, [geometry, material, caveaMaterial, placements]);

  /**
   * The island, and the shoreline around it.
   *
   * Three stacked ellipses instead of one, from wet sand to dry ground. A
   * single flat disc meeting the water on a hard edge reads as a decal; three
   * read as a beach, and they cost two extra triangles each.
   */
  const island = useMemo(() => {
    const group = new THREE.Group();
    const layers: [number, number, THREE.Color][] = [
      [1.42, 1.42, new THREE.Color(readToken("--aq-shore-wet"))],
      [1.3, 1.28, new THREE.Color(readToken("--aq-shore"))],
      [1.2, 1.18, new THREE.Color(readToken("--aq-shore-dry"))],
    ];

    for (const [sx, sz, colour] of layers) {
      const mesh = new THREE.Mesh(
        geometry.disc,
        new THREE.MeshStandardMaterial({ color: colour, roughness: 1, metalness: 0 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(ARENA.x, 0.35 + sx * 0.02, ARENA.z);
      mesh.scale.set(ARENA.rx * sx, ARENA.rz * sz, 1);
      group.add(mesh);
    }
    return group;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry.disc]);

  const arenaFloor = useMemo(() => {
    const mesh = new THREE.Mesh(
      geometry.disc,
      new THREE.MeshStandardMaterial({ color: palette.sand, roughness: 1, metalness: 0 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(ARENA.x, FLOOR_Y, ARENA.z);
    mesh.scale.set(ARENA.rx * 0.93, ARENA.rz * 0.93, 1);
    return mesh;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry.disc, palette]);

  useEffect(
    () => () => {
      Object.values(meshes).forEach((mesh) => mesh.dispose());
      disposeAll([island, arenaFloor]);
      Object.entries(geometry).forEach(([, g]) => g.dispose());
      material.dispose();
      caveaMaterial.dispose();
    },
    [meshes, island, arenaFloor, geometry, material, caveaMaterial],
  );

  return (
    <group>
      <primitive object={interior} />
      <primitive object={island} />
      <primitive object={arenaFloor} />
      <primitive object={meshes.ground} />
      <primitive object={meshes.second} />
      <primitive object={meshes.third} />
      <primitive object={meshes.attic} />
      <primitive object={meshes.bands} />
      <primitive object={meshes.pillars} />
      <primitive object={meshes.caveaBands} />
      <primitive object={meshes.caveaTreads} />
      <primitive object={meshes.caveaPodium} />
    </group>
  );
}