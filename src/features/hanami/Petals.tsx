"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { readToken } from "@/lib/tokens";
import { makeRandom, petalGeometry } from "./geometry";
import { petalFragmentShader, petalVertexShader } from "./shaders";
import type { SceneBudget } from "./tiers";

/**
 * SAKURA.
 *
 * The single detail this whole scene is built around, so it gets 100% of the
 * effort and everything else gets 80%.
 *
 * Three things make a field of petals read as falling blossom rather than as
 * confetti:
 *
 *  1. NOTHING MOVES ON THE CPU. Every petal's position, tumble axis, flutter
 *     phase and spin rate comes from four static floats. 2600 petals cost one
 *     draw call and zero per-frame JavaScript. The moment this becomes 2600
 *     Matrix4 updates a frame, it is a slideshow on a phone.
 *
 *  2. THE TUMBLE AXIS ITSELF ROTATES. Spinning a petal around one fixed axis
 *     produces a propeller. A drifting axis produces a leaf: face, edge, back,
 *     at a rate nobody can predict. This is the difference between the effect
 *     working and not working, and it costs three lines.
 *
 *  3. THE NEAR PETALS ARE OUT OF FOCUS. Not by a depth-of-field pass — by
 *     widening the antialiasing window in the fragment shader as a function of
 *     distance, and washing the colour toward paper. An out-of-focus object
 *     loses saturation before it loses opacity, and that is what sells the blur.
 *     A real DOF pass would cost more than the entire scene; this costs one
 *     smoothstep.
 *
 * Three petals are placed metres from the lens on purpose. They are the
 * signature move: the viewer is not looking AT a scene with petals in it, they
 * are inside it.
 */

export function Petals({
  budget,
  gust,
  reduced,
}: {
  budget: SceneBudget;
  gust: React.RefObject<number>;
  reduced: boolean;
}) {
  const count = budget.petals;

  const geometry = useMemo(() => {
    const rand = makeRandom(20260410);

    /**
     * The field.
     *
     * UNITS. The scene is in metres — the arena is 48 m tall, the trees are 27 m
     * — so a petal is what a petal actually is: 4 to 14 cm. This is the whole
     * lesson of the first cut, which used 1-3 m petals and produced a pink
     * blizzard that buried the entire scene. Scale is not a taste call, it is
     * arithmetic: a 3 m petal 24 m from the lens is 179 px tall.
     *
     * Two populations, deliberately different:
     *  - the mass, spread through the whole depth of the scene at 4-14 cm;
     *  - a handful of heroes a metre or two from the lens, up to 50 cm across.
     *    Those are the ones the fake DOF eats. Being CLOSE is what makes them
     *    big — a big petal in the middle distance is just a big petal, and the
     *    viewer is looking at a floating rug.
     */
    const geometry = petalGeometry(count, rand);
    const home = geometry.getAttribute("aHome") as THREE.InstancedBufferAttribute;
    const petal = geometry.getAttribute("aPetal") as THREE.InstancedBufferAttribute;

    for (let i = 0; i < count; i++) {
      const hero = i % 23 === 0;

      let x: number;
      let z: number;
      let size: number;

      if (hero) {
        x = (rand() - 0.5) * 20;
        z = 40 - rand() * 20;
        size = 0.3 + rand() * 0.3;
      } else {
        /*
         * NON-DIAGNOSTIC distribution.
         *
         * The lesson of the four attempts before this: the field must be built
         * around the FRUSTUM, not around the world.
         *
         * A camera at 5 m looking down at a point 290 m away sees a wedge. At
         * 40 m that wedge is 17 m wide and 16 m tall; at 150 m it is 64 m wide.
         * Spreading 1600 petals over a 150 x 30 x 260 volume puts a fifth of
         * them in the wedge and the other four fifths somewhere nobody can see,
         * which is exactly why every earlier iteration read as "a few flecks"
         * rather than as a fall of blossom.
         *
         * So the field is a shallow slab between 12 m and 90 m, spanning the
         * full width of the wedge at each depth, and the size grows with
         * proximity so a near petal is a shape and a far petal is a spark.
         */
        const t = rand();
        z = 34 - t * 76; // 12 m to 88 m in front of the lens
        const depth = 46 - z; // distance from the camera plane
        const spread = 4 + depth * 0.42; // the frustum width at this depth
        x = (rand() - 0.5) * spread * 2;
        size = 0.18 + depth * 0.0075 + Math.cbrt(rand()) * 0.16;
      }

      home.setXYZ(i, x, rand(), z);
      petal.setXYZW(
        i,
        rand(),
        // Fall speed in metres per second, scaled by size: a big petal falls
        // slower than a small one, and a field where they all fall at the same
        // rate reads as one object repeated. Real blossom drops at roughly a
        // metre a second, slower in still air.
        (0.9 + rand() * 1.7) * (hero ? 1.25 : 1),
        size,
        (rand() - 0.5) * 3.4,
      );
    }

    home.needsUpdate = true;
    petal.needsUpdate = true;
    return geometry;
  }, [count]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uGust: { value: 0 },
      uTop: { value: 40 },
      uSpan: { value: 52 },
      uSway: { value: 1.6 },
      uBase: { value: new THREE.Color(readToken("--aq-sakura")) },
      uTip: { value: new THREE.Color(readToken("--aq-sakura-deep")) },
      uEdge: { value: new THREE.Color(readToken("--aq-petal-rim")) },
      uGlow: { value: new THREE.Color(readToken("--aq-sun")) },
      uOpacity: { value: 0.9 },
    }),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: petalVertexShader,
        fragmentShader: petalFragmentShader,
        uniforms,
        transparent: true,
        // Petals must be occluded by the arena and the water, so they test
        // depth — but they must not WRITE it, or a single petal between the
        // camera and the colosseum punches a transparent hole in it.
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [uniforms],
  );

  useEffect(() => () => material.dispose(), [material]);

  const mesh = useMemo(() => {
    const object = new THREE.Mesh(geometry, material);
    object.frustumCulled = false;
    object.renderOrder = 3;
    return object;
  }, [geometry, material]);

  useEffect(
    () => () => {
      mesh.removeFromParent();
    },
    [mesh],
  );

  useFrame((state) => {
    // Reduced motion: a composed still frame, not a running scene. The phase is
    // frozen at a value where petals are spread through the volume rather than
    // all bunched at the top.
    uniforms.uTime.value = reduced ? 11.3 : state.clock.elapsedTime;
    uniforms.uGust.value = gust.current ?? 0;
  });

  return <primitive object={mesh} />;
}