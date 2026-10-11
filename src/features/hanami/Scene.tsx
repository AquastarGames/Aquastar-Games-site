"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { readToken } from "@/lib/tokens";
import { useSiteStore } from "@/store/site";
import { ARENA } from "./geometry";
import { aboutProgress } from "../about/aboutProgress";
import { cameraDepth, diveK } from "./dive";
import { Arena } from "./Arena";
import { Atmosphere } from "./Atmosphere";
import { HanamiLens } from "./lens";
import { Petals } from "./Petals";
import { Shore } from "./Shore";
import { Water } from "./Water";
import { BUDGETS, DESIGN_FOV } from "./tiers";
import type { Tier } from "@/lib/quality";
import { useWind } from "./wind";

/**
 * THE COMPOSITION.
 *
 * ─── Where everything is, and why ───────────────────────────────────────────
 *
 * The camera is 280 m from the building, at 5 m — a person standing at the
 * edge of a flooded arena. It looks slightly DOWN at the arena's base, which
 * puts the horizon across the lower third of the frame.
 *
 * The aim is the single most important number here. Tilt UP past the roof and
 * you get a wall at the bottom of a sea of paper. Tilt DOWN and the arena
 * fills the frame and the headline has nothing to sit on. The composition that
 * works is the one where:
 *
 *      0% .. 66%   sky, mist, the upper storeys
 *    66% .. 100%  the arena's lower half, and the water
 *
 * so the DOM headline sits entirely on sky and mist — the lightest, quietest
 * band in the picture — and the darkest thing in the frame is the type. The
 * fish-eye then bows the horizon downward at the edges, which is the one thing
 * a wide lens does that a rectilinear one cannot.
 *
 * ─── Why the camera drifts ─────────────────────────────────────────────────
 *
 * A locked camera over an animated scene looks like a video. Two motions fix
 * it, both tiny: a breathing drift on a ~27 s cycle (below the threshold where
 * anyone consciously notices motion, above the threshold where the frame feels
 * frozen) and a pointer parallax capped at 3.2 m. The parallax is damped to 4%
 * per frame so it lags the pointer like a heavy head rather than snapping to
 * it — a camera that tracks your mouse exactly looks like a screensaver.
 */

const CAMERA = {
  position: new THREE.Vector3(0, 5, 46),
  /*
   * Aimed at the arena's base, keeping the whole building and its reflection in
   * frame with the horizon at the bottom third. The first cut aimed at the top
   * cornice (y = 43.3) and at 5 m altitude that pitched us under the building,
   * filling the frame with the ground arcade.
   */
  target: new THREE.Vector3(-10, 9, -292),
  /** Metres of travel at the far plane for a full pointer sweep. */
  parallax: 3.2,
  breath: 0.85,
} as const;

/**
 * Waypoints for the journey.
 *
 * The torii stands at (44, 0.4, -104), scale 1.35 — see Shore.tsx `torii()`.
 * Support parks SOUTH of the gate looking north, so the red arch is centred
 * with the arena behind it. Testers parks the same distance NORTH looking
 * south, so the same arch frames open water instead. The support→testers leg
 * is a ~40 m swing around the gate — the "turn to the other side" beat.
 * About is the orbit entry (ABOUT_ENTRY_POS/LOOK, computed below).
 */
/**
 * The About orbit: a high ring around the arena centre, entered at progress 0
 * and swept ~140° by the time the visitor reaches the section's end, easing
 * down 20 m on the way. Scroll OWNS this camera — every scroll tick rotates
 * the view; between the three beat windows there is deliberately no copy,
 * only the Colosseum turning below.
 */
const ABOUT_ORBIT = {
  radius: 150,
  height: 115,
  descend: 20,
  start: -0.6,
  sweep: 2.45,
  lookY: 12,
} as const;

function aboutPose(p: number, pos: THREE.Vector3, look: THREE.Vector3) {
  const t = THREE.MathUtils.clamp(p, 0, 1);
  const az = ABOUT_ORBIT.start + t * ABOUT_ORBIT.sweep;
  pos.set(
    ARENA.x + Math.cos(az) * ABOUT_ORBIT.radius,
    ABOUT_ORBIT.height - t * ABOUT_ORBIT.descend,
    ARENA.z + Math.sin(az) * ABOUT_ORBIT.radius,
  );
  look.set(ARENA.x, ABOUT_ORBIT.lookY, ARENA.z);
}

// Orbit entry, computed once — the flight leg hands off to scroll exactly
// here, so there is no cut between flying in and orbiting. Read-only after
// this: the rig never mutates a waypoint.
const ABOUT_ENTRY_POS = new THREE.Vector3();
const ABOUT_ENTRY_LOOK = new THREE.Vector3();
aboutPose(0, ABOUT_ENTRY_POS, ABOUT_ENTRY_LOOK);

const WAYPOINTS = {
  index: { position: CAMERA.position, target: CAMERA.target },
  /**
   * UNDERWATER, directly below the index camera: a vertical shaft down from
   * (0, 5, 46) to (0, -6, 46) — no forward travel at all — gazing north under
   * the surface toward the gate's drowned silhouette. Reached by a pure
   * vertical plunge; left by cruising below to under the destination and
   * ascending there, so the murk flips exactly on the arrival point.
   */
  games: {
    position: new THREE.Vector3(0, -6, 46),
    target: new THREE.Vector3(0, 1, -110),
  },
  support: {
    position: new THREE.Vector3(44, 4.2, -82),
    target: new THREE.Vector3(44, 5.0, -104),
  },
  testers: {
    position: new THREE.Vector3(44, 4.2, -126),
    target: new THREE.Vector3(44, 5.0, -104),
  },
  /**
   * HIGH above the bowl, looking down: the settled About view is a slow
   * orbit, not a parked camera (see ABOUT_ORBIT). This waypoint is the
   * orbit's ENTRY (progress 0).
   */
  about: {
    position: ABOUT_ENTRY_POS,
    target: ABOUT_ENTRY_LOOK,
  },
} as const;

const FLIGHT_DURATION = 2.2;

/**
 * Arc lift for a leg, in metres.
 *
 * Surface↔dive legs fly phased (capture below) and never come here — except
 * to/from the high orbit, which keeps its sky swoop. Everything else: gate
 * hops get a small hop, the rest a breath.
 */
function flightLift(from: string, to: string): number {
  if (from === to) return 0;
  if (from === "about" || to === "about") return 60;
  if (
    (from === "support" && to === "testers") ||
    (from === "testers" && to === "support")
  ) {
    return 8;
  }
  return 6;
}

/**
 * Scene fog, matched to the world's actual scale.
 *
 * THREE.FogExp2 is exponential: the factor at distance d is
 * `1 - exp(-(d * density)^2)`. At the density this scene was first given
 * (0.0016) the arena 284 m away was 21% fogged, the ranges 272 m further on
 * were 88% fogged, and the whole top half of the frame was flat paper. The
 * values below were chosen backwards from the picture that is wanted:
 *
 *    284 m  arena       10%   the building keeps its travertine
 *    500 m  far shore    25%   the trees are a step closer to the mist
 *    900 m  mid range    51%   "miles away"
 *   1300 m  far range   64%   the last readable thing in the frame
 *
 * The same number has to be duplicated into every custom shader that also
 * covers distance (water, mist, ridges) — they do not read THREE.FogExp2's
 * uniform. shaders.ts uses the same density through FOG_PARS.
 */
const FOG_DENSITY = 0.0011;

/** Sun direction, shared by the sky, the water's specular and the key light. */
const SUN = new THREE.Vector3(0.42, 0.3, -0.86).normalize();

/**
 * UNDERWATER DRESSING.
 *
 * Two props that exist only for the games dive, both one draw call:
 *
 *  - the ceiling: the water mirror is FrontSide-up, so from below it is
 *    simply gone and the camera would stare at sky. A down-facing plane 15 cm
 *    under the surface closes the world with murk. From above it hides under
 *    the opaque mirror (depth-tested, 15 cm down).
 *  - the bubbles: ~240 points rising in a box around the dive site. Opacity
 *    is driven in useFrame from the store — no React state at 60 fps.
 */
const BUBBLES = 240;

function Bubbles({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const built = useMemo(() => {
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const positions = new Float32Array(BUBBLES * 3);
    const speeds = new Float32Array(BUBBLES);
    for (let i = 0; i < BUBBLES; i++) {
      positions[i * 3 + 0] = rand(-42, 42);
      positions[i * 3 + 1] = rand(-14, -0.5);
      positions[i * 3 + 2] = rand(-70, 90);
      speeds[i] = rand(0.5, 2.2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: new THREE.Color("#d7ece7"),
      size: 0.45,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    return { geometry, material, speeds };
  }, []);

  useEffect(
    () => () => {
      built.geometry.dispose();
      built.material.dispose();
    },
    [built],
  );

  useFrame((_, delta) => {
    const points = ref.current;
    if (!points) return;
    const dt = Math.min(delta, 1 / 20);
    // Depth-driven: bubbles thicken while sinking, thin out on ascent.
    const target = diveK(cameraDepth.y) * 0.85;
    const mat = points.material as THREE.PointsMaterial;
    mat.opacity += (target - mat.opacity) * (reduced ? 1 : Math.min(1, dt * 2));

    if (mat.opacity < 0.01) {
      points.visible = false;
      return;
    }
    points.visible = true;
    if (!reduced) {
      const attr = built.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < BUBBLES; i++) {
        let y = arr[i * 3 + 1]! + built.speeds[i]! * dt;
        if (y > -0.4) y = -14;
        arr[i * 3 + 1] = y;
      }
      attr.needsUpdate = true;
    }
  });

  return <points ref={ref} geometry={built.geometry} material={built.material} frustumCulled={false} />;
}

/**
 * The surface seen from below, faded — never popped.
 *
 * A conditional mount would blink into existence overhead at the arrival
 * frame. Instead the plane is always in the graph and only its opacity is
 * driven (from depth, like everything else down here): 0 on the surface,
 * murk once submerged. Unlit on purpose — underwater owns its colours.
 */
function DiveCeiling() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const target = diveK(cameraDepth.y) * 0.94;
    mat.opacity += (target - mat.opacity) * Math.min(1, delta * 2);
    mesh.visible = mat.opacity > 0.01;
  });

  return (
    <mesh ref={ref} position={[0, -0.15, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
      <planeGeometry args={[1200, 1200]} />
      <meshBasicMaterial color={new THREE.Color("#11414d")} transparent opacity={0} />
    </mesh>
  );
}

/** Deep-teal murk, deliberately off-token: this realm is not paper. */
const DIVE_FOG = "#0e3540";
const DIVE_FOG_DENSITY = 0.011;

/**
 * The underwater realm switch — depth-driven, imperative, zero re-renders.
 *
 * Hard rule: the dive adds NO scene-wide effects. No background assignment
 * (it leaks into the water mirror and turned the surface white), no light
 * changes. Underwater owns only its own objects — backdrop, ceiling, bubbles
 * — all opacity-driven from depth and exactly invisible at the surface.
 *
 * Ordering inside the crossing matters: the land hides FIRST (k > 0.08,
 * while the fog has barely moved), and only then does the fog ramp to murk.
 * The other order flash-fogs the arena mid-plunge. Runs after CameraRig
 * (mount order) to read the fresh depth.
 */
function DiveBlend({ land }: { land: React.RefObject<THREE.Group | null> }) {
  const scene = useThree((s) => s.scene);
  const blend = useMemo(
    () => ({
      mist: new THREE.Color(readToken("--aq-mist")),
      dive: new THREE.Color(DIVE_FOG),
    }),
    [],
  );

  useFrame(() => {
    const k = diveK(cameraDepth.y);
    if (land.current) land.current.visible = k < 0.08;
    // Fog ramps only once the land is already gone (fk = 0 above that).
    const fk = THREE.MathUtils.smoothstep(k, 0.08, 1);
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.lerpColors(blend.mist, blend.dive, fk);
      fog.density = FOG_DENSITY + (DIVE_FOG_DENSITY - FOG_DENSITY) * fk;
    }
    // Submersion flip for the DOM dressing (veil, header theme): fires only
    // on crossing, so the veil clears while surfacing instead of lingering
    // over dry land until the next arrival.
    const store = useSiteStore.getState();
    const sub = k > 0.5;
    if (store.submerged !== sub) store.setSubmerged(sub);
  });

  return null;
}

/**
 * Water's own background: a gradient dome around the dive site, unlit and
 * unfogged, opacity-driven from depth. At the surface it is exactly
 * invisible — zero effect on the paper world above.
 */
function DiveBackdrop() {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#175062");
    gradient.addColorStop(0.45, "#0e3540");
    gradient.addColorStop(1, "#06161d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    // Same gate as the fog ramp: only once the land is gone.
    const target = THREE.MathUtils.smoothstep(diveK(cameraDepth.y), 0.08, 1);
    mat.opacity += (target - mat.opacity) * Math.min(1, delta * 2);
    mesh.visible = mat.opacity > 0.01;
  });

  return (
    <mesh ref={ref} position={[0, 0, 40]} visible={false}>
      <sphereGeometry args={[800, 32, 24]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} fog={false} transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function CameraRig({ reduced, aim }: { reduced: boolean; aim: React.RefObject<{ x: number; y: number; active: boolean }> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const look = useRef(CAMERA.target.clone());
  const parallax = useRef(new THREE.Vector2());
  // Damped flight state. The section lives in zustand and is read via getState
  // inside useFrame — never subscribed here, so section changes never
  // re-render the canvas; they only retarget this lerp.
  const base = useRef(CAMERA.position.clone());
  const baseLook = useRef(CAMERA.target.clone());
  // Cinematic leg: on every section change the start pose is captured and the
  // flight runs on a smootherstep clock with an altitude arc (flightLift),
  // then hands back to exponential settling. `t === 1` means "leg done".
  // Dive legs are phased instead (see capture): vertical shaft first or last.
  const prevSection = useRef("index");
  const flight = useRef({
    t: 1,
    lift: 0,
    from: CAMERA.position.clone(),
    fromLook: CAMERA.target.clone(),
    phased: false,
    toGames: false,
    split: 0.5,
    mid: new THREE.Vector3(),
    midLook: new THREE.Vector3(),
  });

  /** Smootherstep: still at both ends, so phase junctions read as intent. */
  const smoother = (x: number) => {
    const t = THREE.MathUtils.clamp(x, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };

  // Scratch vectors, allocated once. Everything below runs 60 times a second;
  // building five Vector3s per frame is five allocations the collector has to
  // chase during the one moment the page cannot afford to stutter.
  const right = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    camera.fov = DESIGN_FOV;
    camera.near = 0.5;
    camera.far = 1600;
    camera.position.copy(CAMERA.position);
    camera.lookAt(CAMERA.target);
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((state, delta) => {
    const t = reduced ? 11.3 : state.clock.elapsedTime;

    // Section flight. Reduced motion snaps instantly; otherwise the leg flies
    // an altitude arc (never through the wall) and settles exponentially.
    const store = useSiteStore.getState();
    const section = store.section;
    const waypoint = WAYPOINTS[section] ?? WAYPOINTS.index;
    const fl = flight.current;
    if (prevSection.current !== section) {
      const from = prevSection.current;
      fl.from.copy(base.current);
      fl.fromLook.copy(baseLook.current);
      fl.t = 0;
      // Dive phasing: exactly one end below the surface, and neither end the
      // high orbit (the orbit keeps its sky swoop in both directions).
      //  - TO games: a shaft STRAIGHT DOWN at the departure x/z — from the
      //    index camera that is sinking on the spot, zero forward travel —
      //    gaze dropping into the depth, then swinging up to the site.
      //    (The site sits directly below index, so phase B is a near
      //    stand-still; from the gate tabs it is a short deep cruise.)
      //  - FROM games: cruise below first, then a vertical ascent under the
      //    destination. The surface is crossed at the leg's end, so the murk
      //    (flipped only by the arrival gate below) changes on the point —
      //    never halfway out of the water.
      if ((from === "games") !== (section === "games") && from !== "about" && section !== "about") {
        fl.phased = true;
        fl.toGames = section === "games";
        fl.lift = 0;
        if (fl.toGames) {
          fl.split = 0.45;
          fl.mid.set(base.current.x, waypoint.position.y, base.current.z);
          fl.midLook.set(fl.from.x, fl.from.y - 25, fl.from.z);
        } else {
          fl.split = 0.55;
          fl.mid.set(waypoint.position.x, base.current.y, waypoint.position.z);
        }
      } else {
        fl.phased = false;
        fl.toGames = false;
        fl.lift = flightLift(from, section);
      }
      prevSection.current = section;
    }
    if (reduced) {
      // Reduced motion: the orbit still follows scroll (user-initiated, not
      // ambient), but the flight snaps and the breathing is frozen by t=11.3.
      if (section === "about") aboutPose(aboutProgress.p, base.current, baseLook.current);
      else {
        base.current.copy(waypoint.position);
        baseLook.current.copy(waypoint.target);
      }
      fl.t = 1;
      if (store.cameraAt !== section) store.setCameraAt(section);
    } else if (section === "about" && fl.t >= 1) {
      // The orbit: scroll owns the camera outright. Every scroll tick rotates
      // the high view around the bowl — no damping here, or the rotation
      // would lag the text beats it is synchronised with.
      aboutPose(aboutProgress.p, base.current, baseLook.current);
      if (store.cameraAt !== section) store.setCameraAt(section);
    } else {
      const dt = Math.min(delta, 1 / 20);
      if (fl.t < 1) {
        fl.t = Math.min(1, fl.t + dt / FLIGHT_DURATION);
        if (fl.phased) {
          // Two shafts with a hover at the corner: down-then-cruise in,
          // cruise-then-up out. Diving in, the gaze drops into the depth
          // first and only swings up to the site once below — the view never
          // swings toward the arch while still in daylight.
          const s = fl.split;
          if (fl.t < s) {
            base.current.lerpVectors(fl.from, fl.mid, smoother(fl.t / s));
            if (fl.toGames) baseLook.current.lerpVectors(fl.fromLook, fl.midLook, smoother(fl.t / s));
            else baseLook.current.lerpVectors(fl.fromLook, waypoint.target, smoother(fl.t));
          } else {
            base.current.lerpVectors(fl.mid, waypoint.position, smoother((fl.t - s) / (1 - s)));
            if (fl.toGames) baseLook.current.lerpVectors(fl.midLook, waypoint.target, smoother((fl.t - s) / (1 - s)));
            else baseLook.current.lerpVectors(fl.fromLook, waypoint.target, smoother(fl.t));
          }
        } else {
          // Smootherstep arc: still at both ends, so departures and arrivals
          // read as intent rather than as a cut or a crash.
          const e = smoother(fl.t);
          const arc = Math.sin(Math.PI * e);
          base.current.lerpVectors(fl.from, waypoint.position, e);
          base.current.y += arc * fl.lift;
          baseLook.current.lerpVectors(fl.fromLook, waypoint.target, e);
          baseLook.current.y += arc * fl.lift * 0.25;
        }
      } else {
        const k = 1 - Math.exp(-dt * 1.8);
        base.current.lerp(waypoint.position, k);
        baseLook.current.lerp(waypoint.target, k);
      }
      // Arrival gate: the DOM listens to `cameraAt`, so copy fades in only
      // once the leg AND the settle are done — never mid-flight.
      // setCameraAt is a no-op when unchanged, so this costs nothing after.
      if (store.cameraAt !== section && fl.t >= 1) {
        const posD = base.current.distanceTo(waypoint.position);
        const tgtD = baseLook.current.distanceTo(waypoint.target);
        if (posD < 0.25 && tgtD < 0.25) store.setCameraAt(section);
      }
    }

    // Breathing. Two incommensurable periods so the loop is never visible —
    // frozen during phased dive legs, where even a metre of lateral drift
    // would read as the shaft leaning.
    const still = fl.phased && fl.t < 1 ? 0 : 1;
    const breathX = (Math.sin(t * 0.232) * CAMERA.breath + Math.sin(t * 0.081) * CAMERA.breath * 0.5) * still;
    const breathY = Math.sin(t * 0.187 + 1.3) * CAMERA.breath * 0.55 * still;

    // Pointer parallax only on the hero view. Near the gate it would slide the
    // arch out of the centred composition the form sits on.
    const target = parallax.current;
    if (!reduced && section === "index" && aim.current.active) {
      target.x += (aim.current.x - target.x) * 0.04;
      target.y += (aim.current.y - target.y) * 0.04;
    } else {
      target.multiplyScalar(0.96);
    }

    // Parallax is applied along the camera's own axes, not to world x/z. Moving
    // in world space while the camera looks at an off-centre target produces a
    // sideways slide; moving in camera space produces a look-around.
    right.setFromMatrixColumn(camera.matrixWorld, 0);

    camera.position
      .copy(base.current)
      .addScaledVector(right, -target.x * CAMERA.parallax)
      .add(offset.set(breathX, breathY - target.y * CAMERA.parallax * 0.45, 0));

    look.current
      .copy(baseLook.current)
      .addScaledVector(right, -target.x * CAMERA.parallax * 1.6)
      .add(offset.set(0, -target.y * CAMERA.parallax * 0.7, 0));

    camera.lookAt(look.current);

    // Depth feed for the dive environment (fog blend, ceiling, bubbles,
    // land visibility). A plain mutable — never React state at 60 fps.
    cameraDepth.y = base.current.y;
  });

  return null;
}

export function Scene({ tier }: { tier: Tier }) {
  const budget = BUDGETS[tier];
  // prefers-reduced-motion locks the tier to `low` (lib/quality.ts), so this
  // is one condition and not two: the tier IS the motion preference.
  const reduced = tier === "low";
  const wind = useWind(reduced);
  const stepRef = useRef(wind.step);
  stepRef.current = wind.step;
  const landRef = useRef<THREE.Group>(null);

  const gl = useThree((s) => s.gl);

  /**
   * Renderer.
   *
   * Deliberately NOT <Experience />: that component dispatches `aq:scene-ready`
   * on mount, which is the preloader's "scene is up" signal, and firing it a
   * second time from a canvas that mounts after the intro would tell the
   * preloader a scene it is no longer waiting for is ready. R3F already
   * defaults to ACES + sRGB, which is all Experience would have set.
   *
   * Tone mapping is forced off here because EffectComposer takes the scene
   * render over and does its own; the composer puts ACES back as an effect.
   */
  useEffect(() => {
    const previous = gl.toneMapping;
    gl.toneMapping = budget.lens ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    return () => {
      gl.toneMapping = previous;
    };
  }, [gl, budget.lens]);

  // One clock: the wind decays here, in the same frame callback as the camera,
  // so the gust that moves the camera is the gust that moves the water.
  //
  // The delta comes from the FRAME ARGUMENT. state.clock.getDelta() would
  // return a near-zero value and, worse, reset the clock's internal timestamp —
  // which would corrupt the delta every other subscriber in the frame receives.
  useFrame((state, delta) => {
    stepRef.current(Math.min(delta, 1 / 20), state.clock.elapsedTime);
  }, -1);

  /**
   * Scene tokens, read once per mount.
   *
   * readToken calls getComputedStyle, which forces a style recalculation. That
   * is fine here and catastrophic inside useFrame — see lib/tokens.ts.
   */
  const palette = useMemo(
    () => ({
      mist: readToken("--aq-mist"),
      paper: readToken("--aq-paper"),
      horizon: readToken("--aq-horizon"),
      water: readToken("--aq-water-deep"),
      ink: readToken("--aq-ink"),
    }),
    [],
  );

return (
    <>
      {/*
        Fog base. The dive blend (below) mutates this same object with depth,
        so the JSX only declares the surface state — underwater is owned
        entirely by DiveBlend and never touches these values.
      */}
      <fogExp2 attach="fog" args={[palette.mist, FOG_DENSITY]} />

      {/*
        Lighting.

        One hemisphere light for the sky bounce, one directional key, one weak
        fill from the opposite side. No shadows anywhere: this is a background at
        246 units with mist across half of it, and a shadow map at that distance
        costs a full extra scene pass to produce a difference nobody can see.

        The fill is what keeps the shadowed faces of the arcades from going flat,
        and it is deliberately weak — the first cut used 0.7 plus a 2.4 hemisphere
        and every surface in the scene lifted into the same value, which is the
        one failure a backdrop cannot recover from. If it looks flat, the answer
        is more contrast in the tokens, never more light.

        Deliberately NOT tab-driven: underwater everything visible is unlit
        (basic materials, points, DOM veil), so the surface lights stay exactly
        as the paper world needs them.
      */}
      <hemisphereLight args={[palette.horizon, palette.water, 1.9]} position={[0, 60, 0]} />
      <directionalLight position={[SUN.x * 240, SUN.y * 240, SUN.z * 240]} intensity={3.1} />
      <directionalLight
        position={[-SUN.x * 240, SUN.y * 160, -SUN.z * 240]}
        intensity={0.45}
      />
      <DiveCeiling />

      <CameraRig reduced={reduced} aim={wind.aim} />
      <DiveBlend land={landRef} />
      <DiveBackdrop />

      {/*
        The land: sky, mirror, arena, shore, petals. Hidden outright while
        submerged (see DiveBlend) — from below, none of it exists.
      */}
      <group ref={landRef}>
        <Atmosphere budget={budget} reduced={reduced} gust={wind.gust} />
        <Water budget={budget} gust={wind.gust} reduced={reduced} />
        <Arena budget={budget} />
        <Shore budget={budget} />
        <Petals budget={budget} gust={wind.gust} reduced={reduced} />
      </group>
      <Bubbles reduced={reduced} />

      {budget.lens && (
        <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
          {/*
            ACES lives HERE, not on the renderer, whenever the composer is
            mounted — EffectComposer forces renderer.toneMapping to
            NoToneMapping, so without this the backdrop would come out a stop
            brighter than every other canvas on the site.
          */}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <HanamiLens ink={palette.ink} paper={palette.paper} />
        </EffectComposer>
      )}
    </>
  );
}