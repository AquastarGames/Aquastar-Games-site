"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import * as THREE from "three";
import { readToken } from "@/lib/tokens";
import { waterFragmentShader, waterVertexShader } from "./shaders";
import type { SceneBudget } from "./tiers";

/**
 * THE WATER.
 *
 * A flat mirror at y = 0 with a ripple field on top of it, reflecting the
 * arena, the trees, the torii and every petal in the air.
 *
 * WHY THREE.Reflector AND NOT MESHREFLECTORMATERIAL
 * -------------------------------------------------
 * drei's MeshReflectorMaterial is the right default — it is one line. It is
 * wrong here for one reason: it takes its distortion from a `distortionMap`
 * texture, and animating ripples means re-uploading that texture every frame. A
 * 512x512 DataTexture redrawn in JavaScript per frame costs more than the whole
 * rest of the frame and it is exactly the kind of CPU work that turns a
 * 60 fps page into a 30 fps page on a laptop.
 *
 * Reflector renders the scene a second time into a small target and hands the
 * shader that target. The ripple normal is then computed analytically in GLSL,
 * per pixel, for free. The price is a second scene render, which is why
 * `budget.reflection` exists: on the low tier there is no mirror at all and the
 * same shader falls back to a stand-in sky ramp (see waterFragmentShader).
 *
 * The arena is the only thing in this scene worth a reflection. Water that
 * mirrors nothing but sky is a gradient; water that mirrors a Colosseum is a
 * photograph.
 */

/**
 * Reflector's own shader slot names.
 *
 * `color`, `tDiffuse` and `textureMatrix` are the three uniforms THREE.Reflector
 * writes into its material after it builds it — the tint, the reflection target
 * and the projective texture matrix. They have to exist in this object or the
 * Reflector constructor throws on a missing slot.
 */
function waterUniforms(reflect: number): Record<string, THREE.IUniform> {
  return {
    color: { value: new THREE.Color(0xffffff) },
    tDiffuse: {
      value:
        reflect > 0
          ? null
          : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
    },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uGust: { value: 0 },
    fogColor: { value: new THREE.Color(readToken("--aq-mist")) },
    fogDensity: { value: 0.0011 },
    uDeep: { value: new THREE.Color(readToken("--aq-water-deep")) },
    uShallow: { value: new THREE.Color(readToken("--aq-water")) },
    uHorizon: { value: new THREE.Color(readToken("--aq-horizon")) },
    uZenith: { value: new THREE.Color(readToken("--aq-zenith")) },
    uReflect: { value: reflect },
  };
}

const reflectorShader = {
  name: "HanamiWater",
  uniforms: waterUniforms(1),
  vertexShader: waterVertexShader,
  fragmentShader: waterFragmentShader,
};

/** See the note on the reflector's position. */
const WATER_Z = -300;
const WATER_SIZE = 2600;

export function Water({
  budget,
  gust,
  reduced,
}: {
  budget: SceneBudget;
  /** Shared wind, 0..1. Read here so a gust lifts the water and the petals together. */
  gust: React.RefObject<number>;
  reduced: boolean;
}) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 220, 220), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  /**
   * Reflection plane.
   *
   * 220x220 segments is not decoration: the long swells in the vertex stage need
   * vertices to move along, and at 2400 units across a coarse grid turns the
   * near water into visible facets. It is 96k triangles, which is cheap next to
   * the second scene render it exists to support.
   *
   * Centred at z = -300, not at the origin. A quad centred under the camera
   * terminates in a point right where the camera is, and a point under a camera
   * at 5 m is where the horizon line lives — the near half of the lake becomes
   * a sliver of the far half's width and the water ends in a hard edge partway
   * up the frame. Centring the geometry on the scene's depth puts the horizon at
   * the far edge of the quad, which is where it belongs.
   */
  const reflector = useMemo(() => {
    if (budget.reflection === 0) return null;

    const instance = new Reflector(geometry, {
      shader: reflectorShader,
      textureWidth: budget.reflection,
      textureHeight: budget.reflection,
      clipBias: 0.006,
      multisample: 0,
      color: 0xffffff,
    });

    // Reflector builds a plain ShaderMaterial from the shader object above.
    // uReflect is the flag the fragment shader branches on: without a mirror
    // there is nothing to sample and the surface falls back to the sky ramp.
    const material = instance.material as THREE.ShaderMaterial;
    material.fog = false;
    material.uniforms.uReflect!.value = 1;
    instance.position.set(0, 0, WATER_Z);
    instance.rotation.x = -Math.PI / 2;
    return instance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, budget.reflection]);

  useEffect(() => () => reflector?.dispose(), [reflector]);

  /** No mirror on this tier: the same shader, pointed at the sky instead. */
  const flat = useMemo(() => {
    if (reflector) return null;

    const material = new THREE.ShaderMaterial({
      uniforms: waterUniforms(0),
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, WATER_Z);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }, [geometry, reflector]);

  useEffect(() => {
    const texture = flat?.material.uniforms.tDiffuse?.value as THREE.Texture | null;
    return () => {
      texture?.dispose();
      (flat?.material as THREE.Material | undefined)?.dispose();
    };
  }, [flat]);

  useFrame((state) => {
    const target = reflector ?? flat;
    const uniforms = target?.material as THREE.ShaderMaterial | undefined;
    if (!uniforms) return;

    // Reduced motion still renders the surface — a lake with no rings in it is
    // a different picture — it just does not advance. See lib/quality.ts: the
    // low tier IS the reduced-motion tier.
    uniforms.uniforms.uTime!.value = reduced ? 6.5 : state.clock.elapsedTime;
    uniforms.uniforms.uGust!.value = gust.current ?? 0;
  });

  return <primitive object={(reflector ?? flat)!} />;
}