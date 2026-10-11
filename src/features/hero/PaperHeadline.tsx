"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { drawHeadline } from "./textTexture";
import { readToken } from "@/lib/tokens";
import { MAX_PUFFS, paperFragmentShader, paperVertexShader } from "./shaders";

/**
 * A headline that behaves like a sheet of thin paper.
 *
 * The wind is a small pool of "puffs". Each puff is born when the pointer
 * moves fast enough to be worth noticing, then travels outward and dies. The
 * pool is a fixed size and dead puffs are recycled — no allocation per frame,
 * which is what keeps this inside the frame budget.
 *
 * Pointer input is read from the document, not from the canvas: the canvas sits
 * behind the DOM and has `pointer-events: none`, so it would never see a move.
 */

/** Segments per axis. 96x96 = ~18k triangles — smooth, and half the cost of 128. */
const SEGMENTS = 96;

/** How long a single puff lives, in seconds. */
const PUFF_LIFE = 1.05;

/** Pointer travel (px per event) below which we do not spawn a puff. */
const MIN_SPEED = 1.6;

/** Pointer travel that maps to a full-strength puff. */
const MAX_SPEED = 34;

/** Distance between spawns, in px. Stops a slow drag piling up in one spot. */
const SPAWN_STEP = 26;

/**
 * Frame on which the sheet reports itself live.
 *
 * What this deliberately does NOT do: read the framebuffer back and count
 * pixels. With the default `preserveDrawingBuffer: false` the drawing buffer is
 * cleared once the frame has been presented, so a readback at the top of the
 * next frame comes back empty — the probe reports "nothing painted" forever,
 * the DOM headline never steps aside, and the wind animation never plays. That
 * is worse than no probe at all, and it is exactly what shipped for one commit.
 *
 * The honest cheap signal is liveness: a non-zero drawing buffer plus a frame
 * the renderer has actually presented. A shader that fails to link is a real
 * bug and should be loud in the console, not silently papered over here.
 */
const PROBE_FRAME = 3;
const PROBE_RETRY = 10;

/**
 * Does the canvas actually have pixels on it?
 *
 * This must use drawImage and NOT readPixels. With the default
 * preserveDrawingBuffer:false the drawing buffer is cleared once the frame has
 * been presented, so readPixels at the top of the next frame returns zeros
 * forever: the probe reports "nothing drawn", the DOM headline never steps
 * aside, and the wind never plays. drawImage reads the composited front
 * buffer, which the browser is required to keep for display.
 *
 * The probe canvas is tiny — it only has to tell empty from not-empty.
 */
function canvasHasPixels(gl: THREE.WebGLRenderer): boolean {
  const src = gl.domElement;
  if (src.width < 2 || src.height < 2) return false;

  const probe = document.createElement("canvas");
  probe.width = 64;
  probe.height = 64;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(src, 0, 0, 64, 64);

  const data = ctx.getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 0) > 8) return true;
  }
  return false;
}

/** Aspect used until the real text has been measured. */
const FALLBACK_ASPECT = 3.2;

interface Puff {
  x: number;
  y: number;
  dx: number;
  dy: number;
  strength: number;
  age: number;
  width: number;
}

function makePool(): Puff[] {
  return Array.from({ length: MAX_PUFFS }, () => ({
    x: 0,
    y: 0,
    dx: 1,
    dy: 0,
    strength: 0,
    age: 1,
    width: 0.18,
  }));
}

export function PaperHeadline({
  lines,
  /** Design token to paint the sheet with. Read from CSS so it cannot drift. */
  colorToken = "--aq-ink",
  reduced = false,
  /** Fired once the mesh has actually been through a render frame. */
  onReady,
}: {
  lines: string[];
  colorToken?: string;
  /** Reduced motion: render the sheet flat and simulate no wind at all. */
  reduced?: boolean;
  onReady?: () => void;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const gl = useThree((s) => s.gl);

  // Readiness is one-way: reported once, from inside the render loop, and only
  // after the sheet has audited its own output.
  const announced = useRef(false);
  const frames = useRef(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  /**
   * The canvas' bounding rect, cached.
   *
   * Puffs arrive in client pixels and must be converted into plane units. That
   * needs the host element's box, and reading it inside useFrame would force a
   * layout flush every frame — measured against the rest of the frame, that is
   * the single most expensive line in this component.
   */
  const hostRect = useRef({ left: 0, top: 0, width: 1, height: 1 });

  // The pool lives in a ref. Writing 8 objects into React state 60x/sec would
  // re-render the tree for values only the GPU ever reads.
  const pool = useRef<Puff[]>(makePool());
  const cursor = useRef({ x: 0, y: 0, has: false });
  const lastSpawn = useRef({ x: 0, y: 0, has: false });

  useEffect(() => {
    const measure = () => {
      const r = gl.domElement.getBoundingClientRect();
      hostRect.current = {
        left: r.left,
        top: r.top,
        width: r.width || 1,
        height: r.height || 1,
      };
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [gl]);

  /**
   * The headline is measured once the display font is actually available —
   * measuring a fallback and keeping it would ship a headline that is subtly
   * letterboxed on every machine but one.
   */
  const [drawn, setDrawn] = useState<ReturnType<typeof drawHeadline> | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive) return;
      setDrawn(drawHeadline(lines, 1600, readToken("--aq-display")));
    };
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(run).catch(run);
    } else {
      run();
    }
    return () => {
      alive = false;
    };
  }, [lines]);

  const texture = useMemo(() => {
    if (!drawn) return null;
    const tex = new THREE.CanvasTexture(drawn.texture);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [drawn]);

  // Texture is uploaded once; dispose it when the headline changes.
  useEffect(() => () => texture?.dispose(), [texture]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0.09 },
      uStretch: { value: 0.055 },
      uFold: { value: 0.012 },
      uRadius: { value: 0.42 },
      uGain: { value: 0.03 },
      uHalfSize: { value: new THREE.Vector2(1, 1) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uMap: { value: null as THREE.Texture | null },
      uColor: { value: new THREE.Color(readToken(colorToken)) },
      uOpacity: { value: 1 },
      uPuffs: { value: Array.from({ length: MAX_PUFFS }, () => new THREE.Vector4()) },
      uPuffShape: {
        value: Array.from({ length: MAX_PUFFS }, () => new THREE.Vector4(1, 0, 0.18, 0)),
      },
    }),
    [],
  );

  // Re-read on token change only. Never inside useFrame: getComputedStyle forces
  // a style recalculation, and the DOM already agrees with this value.
  useEffect(() => {
    uniforms.uColor.value.set(readToken(colorToken));
  }, [colorToken, uniforms]);

  useEffect(() => {
    uniforms.uMap.value = texture;
  }, [texture, uniforms]);

  /* ------------------------------------------------------------- geometry */
  // The plane is sized every frame from the camera frustum rather than once on
  // mount. A fixed world height would make the headline occupy a fixed
  // *fraction* of the canvas, which changes with the viewport — the text has
  // to keep its measure against its container, not against the screen.
  const aspect = drawn?.aspect ?? FALLBACK_ASPECT;

  /* ----------------------------------------------------------------- wind */
  useEffect(() => {
    if (reduced) return;

    const spawn = (x: number, y: number, speed: number, dx: number, dy: number) => {
      const strength = Math.min(1, speed / MAX_SPEED);
      // Take a dead puff, else recycle the oldest one.
      let slot = pool.current.find((p) => p.strength <= 0 && p.age >= 1);
      if (!slot) slot = pool.current.reduce((a, b) => (a.age > b.age ? a : b));
      slot.x = x;
      slot.y = y;
      slot.dx = dx;
      slot.dy = dy;
      slot.strength = strength;
      slot.age = 0;
      // Faster wind is a broader gust, not a sharper one.
      slot.width = 0.12 + strength * 0.16;
    };

    const onMove = (e: PointerEvent) => {
      const c = cursor.current;
      if (!c.has) {
        c.x = e.clientX;
        c.y = e.clientY;
        c.has = true;
        return;
      }
      const dx = e.clientX - c.x;
      const dy = e.clientY - c.y;
      const dist = Math.hypot(dx, dy);
      c.x = e.clientX;
      c.y = e.clientY;

      if (dist < MIN_SPEED) return;

      // Spawn on distance travelled, so a slow drag lays an even trail
      // instead of a dense pile-up at a single point.
      const last = lastSpawn.current;
      if (last.has && Math.hypot(e.clientX - last.x, e.clientY - last.y) < SPAWN_STEP) return;

      const len = Math.max(dist, 0.001);
      spawn(e.clientX, e.clientY, dist / 2, dx / len, dy / len);
      last.x = e.clientX;
      last.y = e.clientY;
      last.has = true;
    };

    const onLeave = () => {
      cursor.current.has = false;
      lastSpawn.current.has = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  /* ---------------------------------------------------------------- frame */
  useFrame((state, delta) => {
    const mat = materialRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;

    // Clamp the delta: a tab returning from the background hands us one huge
    // frame, which would otherwise kill every puff in a single step.
    const dt = Math.min(delta, 1 / 30);
    uniforms.uTime.value = state.clock.elapsedTime;

    const cam = state.camera as THREE.PerspectiveCamera;

    // Frustum at z=0, in the units the plane is expressed in.
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.position.z;
    const halfW = halfH * cam.aspect;

    // Contain-fit the text into the canvas box, with a little breathing room.
    const MARGIN = 0.94;
    let pw = halfW * 2 * MARGIN;
    let ph = pw / aspect;
    if (ph > halfH * 2 * MARGIN) {
      ph = halfH * 2 * MARGIN;
      pw = ph * aspect;
    }
    mesh.scale.set(pw, ph, 1);

    // Wind constants scale with the sheet so the effect is identical at any size.
    uniforms.uSize.value.set(pw, ph);
    uniforms.uHalfSize.value.set(pw / 2, ph / 2);
    uniforms.uAmp.value = ph * 0.085;
    uniforms.uRadius.value = Math.max(pw, ph) * 0.55;

    // Puffs are recorded in client pixels. Convert to the plane's world units
    // using the canvas's own rect — NOT the window, because the canvas only
    // covers the hero, not the viewport. Cached and refreshed on scroll/resize
    // so the frame loop never forces a layout read.
    const rect = hostRect.current;
    const poolArr = uniforms.uPuffs.value as THREE.Vector4[];
    const shapeArr = uniforms.uPuffShape.value as THREE.Vector4[];
    const puffs = pool.current;
    const viewW = halfW * 2;
    const viewH = halfH * 2;

    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = puffs[i]!;
      if (reduced) {
        p.strength = 0;
        p.age = 1;
      } else if (p.strength > 0) {
        p.age += dt / PUFF_LIFE;
        if (p.age >= 1) {
          p.age = 1;
          p.strength = 0;
        }
      }

      // Client px -> plane space (origin centred, y flipped).
      const sx = ((p.x - rect.left) / rect.width - 0.5) * viewW;
      const sy = (0.5 - (p.y - rect.top) / rect.height) * viewH;

      poolArr[i]!.set(sx, sy, p.age, p.strength);
      shapeArr[i]!.set(p.dx, p.dy, p.width, 0);
    }

    mat.uniformsNeedUpdate = true;
    // Hand over to the canvas once it is demonstrably live, so the DOM copy
    // does not sit on top of a working scene and freeze the wind dead.
    frames.current += 1;
    if (frames.current >= PROBE_FRAME && !announced.current) {
      if (canvasHasPixels(gl)) {
        announced.current = true;
        onReadyRef.current?.();
      } else if (frames.current === PROBE_FRAME) {
        // Not a failure verdict: the shader may still have been compiling on
        // the first frames. Look again a few frames later.
        frames.current = PROBE_FRAME + PROBE_RETRY - 1;
      }
    }
  });

  if (!drawn) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1, SEGMENTS, SEGMENTS]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={paperVertexShader}
        fragmentShader={paperFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export { MAX_PUFFS };
