"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { readToken } from "@/lib/tokens";
import { RIDGES, makeRandom, ridgeGeometry } from "./geometry";
import type { SceneBudget } from "./tiers";
import {
  mistFragmentShader,
  mistVertexShader,
  ridgeFragmentShader,
  ridgeVertexShader,
  skyFragmentShader,
  skyVertexShader,
} from "./shaders";

/**
 * ATMOSPHERE: the dome, the ranges, and the mist.
 *
 * This layer is not decoration — it is doing the accessibility work. The DOM
 * headline is near-black ink sitting in the middle third of a photograph. The
 * only things keeping it readable are the value ceiling on the sky (nothing up
 * there is darker than paper) and the mist sheet that crosses the arena's lower
 * half (which lifts the contrast band the headline occupies and separates the
 * near water from the far building at the same time).
 *
 * Aerial perspective is the whole technique: distance is shown by washing
 * contrast out toward the fog colour, never by drawing detail smaller.
 */

export function Atmosphere({
  budget,
  reduced,
  gust,
}: {
  budget: SceneBudget;
  reduced: boolean;
  gust: React.RefObject<number>;
}) {
  /* ----------------------------------------------------------------- sky */
  const skyUniforms = useMemo(
    () => ({
      uHorizon: { value: new THREE.Color(readToken("--aq-horizon")) },
      uZenith: { value: new THREE.Color(readToken("--aq-zenith")) },
      uSunColor: { value: new THREE.Color(readToken("--aq-sun")) },
      uSunDir: { value: new THREE.Vector3(0.42, 0.3, -0.86) },
      uTime: { value: 0 },
    }),
    [],
  );

  const sky = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 20), material);
    mesh.renderOrder = -10;
    mesh.frustumCulled = false;
    return mesh;
  }, [skyUniforms]);

  useEffect(
    () => () => {
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
    },
    [sky],
  );

  /* -------------------------------------------------------------- ridges */
  const ridges = useMemo(() => {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];

    for (const layer of [RIDGES.far, RIDGES.mid, RIDGES.near]) {
      const geometry = ridgeGeometry(layer.peaks, layer.width);
      const material = new THREE.ShaderMaterial({
        vertexShader: ridgeVertexShader,
        fragmentShader: ridgeFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(readToken("--aq-fuji")) },
          uOpacity: { value: layer.opacity },
          uSnow: { value: layer.snow },
          fogColor: { value: new THREE.Color(readToken("--aq-mist")) },
          fogDensity: { value: 0.0011 },
        },
        transparent: true,
        depthWrite: false,
        // The ranges must sit BEHIND everything and still be sorted correctly
        // against each other; three sorts transparents back to front, so this
        // is the only ordering that works without per-layer renderOrder.
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = layer.z;
      // The ranges must sit BEHIND everything and still be sorted correctly
      // against each other; three sorts transparents back to front, so this
      // is the only ordering that works without per-layer renderOrder.
      mesh.renderOrder = -5;
      group.add(mesh);
      materials.push(material);
      geometries.push(geometry);
    }

    return { group, materials, geometries };
  }, []);

  useEffect(
    () => () => {
      ridges.materials.forEach((m) => m.dispose());
      ridges.geometries.forEach((g) => g.dispose());
    },
    [ridges],
  );

  /* ---------------------------------------------------------------- mist */
  const mist = useMemo(() => {
    const group = new THREE.Group();
    const rand = makeRandom(3141);
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    /** Resting opacity per sheet. The frame loop scales it by the gust, so the
        base value has to be kept somewhere — multiplying the live uniform
        instead would compound frame over frame and the mist would be opaque by
        the fourth second. */
    const bases: number[] = [];

    /**
     * Where the sheets sit, front to back.
     *
     * Heights are deliberately small. The first cut used 34-62 unit sheets at
     * 112-278 units' distance and they filled the lower half of the frame with
     * white — mist is a value tool here, not a weather system, and the moment it
     * becomes weather it stops doing its job of lifting the headline's contrast.
     */
    const sheets = [
      // A low sheet lying on the water between the camera and the arena: this
      // is the one that reads as "there is weather out here", and it is why the
      // arena's base dissolves instead of ending on a hard line.
      { z: -120, w: 320, h: 11, opacity: 0.4, scale: 2.4, drift: 0.5, y: 0.5 },
      { z: -186, w: 440, h: 17, opacity: 0.46, scale: 1.8, drift: 0.75, y: 2 },
      // Crosses the arena's lower third. The sheet that lifts the value band the
      // headline sits in.
      { z: -228, w: 560, h: 26, opacity: 0.42, scale: 1.5, drift: 1.0, y: 6 },
      // High and far, above the roofline: gives the sky a floor and stops the
      // top half of the frame reading as an empty gradient.
      { z: -385, w: 820, h: 30, opacity: 0.3, scale: 1.2, drift: 1.35, y: 22 },
    ].slice(0, budget.mist);

    for (const [i, sheet] of sheets.entries()) {
      const geometry = new THREE.PlaneGeometry(sheet.w, sheet.h, 1, 1);
      geometry.translate(sheet.w / 2, 0, 0);

      const material = new THREE.ShaderMaterial({
        vertexShader: mistVertexShader,
        fragmentShader: mistFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(readToken("--aq-mist")) },
          uOpacity: { value: sheet.opacity },
          uTime: { value: 0 },
          uDrift: { value: sheet.drift * (0.6 + rand() * 0.8) },
          uSpan: { value: sheet.w },
          uScale: { value: sheet.scale },
          fogColor: { value: new THREE.Color(readToken("--aq-mist")) },
          fogDensity: { value: 0.0011 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(-sheet.w, sheet.y, sheet.z);
      // Mist is the one thing in this scene that must never be frustum-culled
      // on a tight bound: its geometry is a quad, but its visible extent is not.
      mesh.frustumCulled = false;
      mesh.renderOrder = 1 + i;
      group.add(mesh);
      materials.push(material);
      geometries.push(geometry);
      bases.push(sheet.opacity);
    }

    return { group, materials, geometries, bases };
  }, [budget.mist]);

  useEffect(
    () => () => {
      mist.materials.forEach((m) => m.dispose());
      mist.geometries.forEach((g) => g.dispose());
    },
    [mist],
  );

  useFrame((state) => {
    const time = reduced ? 4.2 : state.clock.elapsedTime;
    skyUniforms.uTime.value = time;

    // The mist answers to the same gust as the petals and the water: one
    // weather system, three surfaces. A gust thickens it and pushes it along.
    for (const [i, material] of mist.materials.entries()) {
      const uniforms = (material as THREE.ShaderMaterial).uniforms;
      uniforms.uTime!.value = time;
      uniforms.uOpacity!.value = mist.bases[i]! * (1 + (gust.current ?? 0) * 0.22);
    }
  });

  return (
    <group>
      <primitive object={sky} />
      <primitive object={ridges.group} />
      <primitive object={mist.group} />
    </group>
  );
}