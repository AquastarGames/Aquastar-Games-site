"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { readToken } from "@/lib/tokens";
import { ARENA, blobGeometry, makeRandom } from "./geometry";
import type { SceneBudget } from "./tiers";

/**
 * THE SHORE.
 *
 * Everything here is Japan rather than Rome: the cherry trees, the torii
 * standing in the flood water, the stone lanterns along the near shore.
 *
 * The composition is doing something specific. The arena is the subject and it
 * sits in the middle third of the frame; the trees and the torii exist to frame
 * it and to prove its scale — a 48 m building reads as a 12 m building until
 * there is a 20 m cherry tree beside it, and a torii is the only object in the
 * scene whose size everybody already knows.
 *
 * Two trees sit deliberately CLOSE to the camera, one at each edge, half
 * cropped by the frame. They are the depth cue a single vanishing-point
 * composition cannot give: without them the arena is floating in a void.
 */

const TRUNK_PARTS = 5;

interface Build {
  trunkMatrices: THREE.Matrix4[];
  blossomMatrices: THREE.Matrix4[];
  lanternMatrices: THREE.Matrix4[];
}

/** One cherry tree: a leaning trunk with branches, and a canopy of blossom lumps. */
function tree(build: Build, rand: () => number, x: number, z: number, height: number) {
  const base = new THREE.Vector3(x, 0, z);
  const lean = (rand() - 0.5) * 0.24;

  for (let i = 0; i < TRUNK_PARTS; i++) {
    const t = i / (TRUNK_PARTS - 1);
    const partHeight = (height * 0.5) / TRUNK_PARTS + 0.2;
    // Tapered: a cherry trunk is thick at the base and thin at the first branch.
    const radius = (1 - t * 0.72) * 0.62;
    const angle = lean * (t + 0.2) + (rand() - 0.5) * 0.16;
    const dir = new THREE.Vector3(Math.sin(angle), 1, Math.cos(angle)).normalize();

    build.trunkMatrices.push(
      new THREE.Matrix4().compose(
        base.clone().add(new THREE.Vector3(dir.x * height * 0.5 * t, height * 0.5 * t, dir.z * height * 0.5 * t)),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
        new THREE.Vector3(radius, partHeight, radius),
      ),
    );
  }

  // The canopy: roughly spherical, flattened below, broken into lumps. One
  // smooth dome reads as a lollipop, and a lollipop is not a four-hundred-year
  // old cherry tree.
  const lumps = 7;
  for (let i = 0; i < lumps; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * height * 0.3;

    build.blossomMatrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(
          x + Math.cos(a) * r + lean * height * 0.5,
          height * (0.62 + rand() * 0.34) + Math.cos(a) * r * 0.24,
          z + Math.sin(a) * r * 0.9,
        ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(), rand() * 6, rand() * 0.4)),
        new THREE.Vector3(
          height * (0.2 + rand() * 0.16),
          height * (0.14 + rand() * 0.12),
          height * (0.2 + rand() * 0.16),
        ),
      ),
    );
  }
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(matrices.length, 1));
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = matrices.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * A stone lantern, merged into a single geometry so a row of them is one draw
 * call. mergeGeometries requires every input to be indexed or none of them; all
 * of three's primitives here are indexed, which is why this works and why a
 * hand-rolled version of this function did not.
 */
function lanternGeometry() {
  const [plinth, post, light, roof, finial] = [
    new THREE.CylinderGeometry(0.55, 0.75, 0.5, 6),
    new THREE.CylinderGeometry(0.22, 0.26, 1.5, 6),
    new THREE.CylinderGeometry(0.52, 0.46, 0.62, 6),
    new THREE.ConeGeometry(0.82, 0.5, 6),
    new THREE.SphereGeometry(0.14, 6, 5),
  ];

  post.translate(0, 1.0, 0);
  light.translate(0, 2.06, 0);
  roof.translate(0, 2.62, 0);
  finial.translate(0, 2.94, 0);

  const parts = [plinth, post, light, roof, finial];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * A torii: two tapered pillars, the nuki crossbeam, the gakuzuka post, and the
 * kasagi on top.
 *
 * The kasagi is CURVED, and that curve is the entire reason the object is in
 * this scene: its silhouette is the one piece of Japanese architecture every
 * viewer can identify at a glance, at any size, in fog. It is built from four
 * straight beams tilted against each other — cheap, and from any distance over
 * about 30 m the eye cannot tell. A flat beam on top of a torii reads as a
 * goalpost.
 */
function torii() {
  const span = 4.4;
  const height = 7.2;
  const material = new THREE.MeshStandardMaterial({
    // The studio's own warm accent. The scene hangs off the same tokens as the
    // DOM, which is why a vermilion gate here still reads as this brand.
    color: readToken("--aq-ember"),
    roughness: 0.8,
    metalness: 0,
  });

  const parts: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();

  const pillar = new THREE.CylinderGeometry(0.28, 0.4, height, 10);
  parts.push(pillar);
  for (const sign of [-1, 1]) {
    const mesh = new THREE.Mesh(pillar, material);
    mesh.position.set(sign * span, height / 2, 0);
    group.add(mesh);
  }

  const nuki = new THREE.BoxGeometry(span * 2 + 1.5, 0.3, 0.36);
  nuki.translate(0, height * 0.78, 0);
  parts.push(nuki);
  group.add(new THREE.Mesh(nuki, material));

  const gakuzuka = new THREE.BoxGeometry(0.3, 1.1, 0.3);
  gakuzuka.translate(0, height * 0.88, 0);
  parts.push(gakuzuka);
  group.add(new THREE.Mesh(gakuzuka, material));

  const beamLength = span * 2 + 2.4;
  for (const [width, depth, y, tilt, thickness] of [
    [span * 2 + 1.9, 0.44, height - 0.3, 0.045, 0.26],
    [beamLength, 0.56, height + 0.06, 0.085, 0.34],
  ] as const) {
    const beam = new THREE.BoxGeometry(width, thickness, depth);
    parts.push(beam);
    for (const sign of [-1, 1]) {
      const mesh = new THREE.Mesh(beam, material);
      mesh.position.set((sign * width) / 4, y, 0);
      mesh.rotation.z = sign * tilt;
      group.add(mesh);
    }
  }

  // Standing in the flood, off axis, sized against the arena so the eye can
  // measure the building against something known. Pushed back from the first
  // placement at z=-46, where it sat in the foreground as a red fence rather
  // than as a gate in the middle distance.
  group.position.set(44, 0.4, -104);
  group.rotation.y = -0.34;
  group.scale.setScalar(1.35);

  return { group, parts, material };
}

export function Shore({ budget }: { budget: SceneBudget }) {
  const built = useMemo(() => {
    const rand = makeRandom(90210);

    const build: Build = { trunkMatrices: [], blossomMatrices: [], lanternMatrices: [] };

    // Two heroes at the frame edges, half cropped. See the file note.
    tree(build, rand, -58, 2, 27);
    tree(build, rand, 62, -14, 21);

    // A row along the far shore, behind and beside the arena.
    const far = budget.trees;
    for (let i = 0; i < far; i++) {
      const t = far === 1 ? 0.5 : i / (far - 1);
      tree(
        build,
        rand,
        -210 + t * 370 + (rand() - 0.5) * 26,
        -392 - rand() * 46,
        13 + rand() * 8,
      );
    }

    // And a handful on the arena's own island, which is what ties the trees to
    // the building instead of leaving them as a separate layer of scenery.
    for (let i = 0; i < Math.max(3, Math.round(budget.trees / 3)); i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 0.86 + rand() * 0.16;
      tree(
        build,
        rand,
        ARENA.x + Math.cos(angle) * ARENA.rx * radius,
        ARENA.z + Math.sin(angle) * ARENA.rz * radius,
        11 + rand() * 6,
      );
    }

    // Lanterns: a far row that draws a line along the shore toward the arena, and
    // a near pair standing on the islets at the frame edges. The near row used
    // to be a straight line across open water, which read as posts in a lake.
    for (let i = 0; i < budget.lanterns; i++) {
      const t = budget.lanterns === 1 ? 0.5 : i / (budget.lanterns - 1);
      const near = i < budget.lanterns / 2;
      build.lanternMatrices.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(
            near ? (i % 2 === 0 ? -54 : 58) : -80 + t * 210,
            near ? 0.95 : 0.85,
            near ? (i % 2 === 0 ? 4 : -12) : -404 - rand() * 24,
          ),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6),
          new THREE.Vector3(1.5, 1.5, 1.5),
        ),
      );
    }

    const disc = new THREE.CircleGeometry(1, 64);
    const trunkGeometry = new THREE.CylinderGeometry(0.55, 1, 1, 7);
    trunkGeometry.translate(0, 0.5, 0);
    const blossomGeometry = blobGeometry(1);
    const lanternGeo = lanternGeometry();

    const bark = new THREE.MeshStandardMaterial({
      color: readToken("--aq-bark"),
      roughness: 1,
      metalness: 0,
    });
    const blossom = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      // A little self-illumination stands in for the translucency a blossom
      // canopy actually has — light comes THROUGH it, and a purely diffuse
      // surface in shadow goes flat and dead.
      emissive: new THREE.Color(readToken("--aq-sakura")),
      emissiveIntensity: 0.24,
    });
    const stone = new THREE.MeshStandardMaterial({
      color: readToken("--aq-stone-deep"),
      roughness: 1,
      metalness: 0,
    });
    const shoreDry = new THREE.MeshStandardMaterial({
      color: readToken("--aq-shore-dry"),
      roughness: 1,
    });

    const islet = (x: number, z: number, rx: number, rz: number, y: number) => {
      const mesh = new THREE.Mesh(disc, shoreDry);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.scale.set(rx, rz, 1);
      return mesh;
    };

    const gate = torii();

    return {
      trunks: instanced(trunkGeometry, bark, build.trunkMatrices),
      blossoms: instanced(blossomGeometry, blossom, build.blossomMatrices),
      lanterns: instanced(lanternGeo, stone, build.lanternMatrices),
      torii: gate.group,
      toriiParts: gate.parts,
      // Under the foreground trees and under the torii, so nothing in the frame
      // floats above nothing.
      islets: [islet(-58, 2, 24, 18, 0.5), islet(62, -14, 19, 15, 0.5), islet(44, -104, 15, 12, 0.42)],
      geometries: [disc, trunkGeometry, blossomGeometry, lanternGeo, ...gate.parts],
      materials: [bark, blossom, stone, shoreDry, gate.material],
    };
  }, [budget.trees, budget.lanterns]);

  useEffect(
    () => () => {
      built.trunks.dispose();
      built.blossoms.dispose();
      built.lanterns.dispose();
      built.geometries.forEach((g) => g.dispose());
      built.materials.forEach((m) => m.dispose());
    },
    [built],
  );

  return (
    <group>
      {built.islets.map((islet, i) => (
        <primitive key={i} object={islet} />
      ))}
      <primitive object={built.torii} />
      <primitive object={built.lanterns} />
      <primitive object={built.trunks} />
      <primitive object={built.blossoms} />
    </group>
  );
}