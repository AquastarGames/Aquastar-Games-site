"use client";

import { useEffect, useRef } from "react";

/**
 * ONE WIND FOR THE WHOLE SCENE.
 *
 * The lake, the mist and two thousand six hundred petals all read one number.
 * That is not tidiness, it is the effect: a gust that lifts the water at the
 * same instant it sweeps the petals across the frame is what convinces a viewer
 * that the air in this picture is a real thing with a direction. Three
 * independent animations would look like three animations.
 *
 * The studio already has a wind — features/hero drives the paper headline with
 * pointer-driven gusts. This is a second one, scoped to the backdrop, because
 * the two canvases are separate GL contexts with separate lifetimes and tying
 * them together would mean a cross-canvas singleton for no visible gain. When
 * the paper plane is folded into the one-canvas architecture in ARCHITECTURE §2,
 * this file is the one that should win.
 *
 * WHY THE LISTENER IS ON `window`
 * -------------------------------
 * The backdrop canvas is `pointer-events: none` — it must never intercept a
 * click, and it never will. Which means it also never sees a pointer event, so
 * the same document-level listener features/hero/PaperHeadline.tsx uses is the
 * only place this can live.
 */

export interface Wind {
  /** 0..1, how hard it is blowing right now. Read by water, mist and petals. */
  gust: React.RefObject<number>;
  /** -1..1 pointer position, for camera parallax. */
  aim: React.RefObject<{ x: number; y: number; active: boolean }>;
  /** Called once per frame, from exactly one place. */
  step: (delta: number, elapsed: number) => void;
}

const state = {
  gust: 0,
  /** Gust target: pointer speed plus a slow weather cycle. */
  target: 0,
  aimX: 0,
  aimY: 0,
  lastX: 0,
  lastY: 0,
  has: false,
  active: false,
};

let listeners = 0;

function onMove(event: PointerEvent) {
  if (!state.has) {
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.has = true;
    return;
  }

  const dx = event.clientX - state.lastX;
  const dy = event.clientY - state.lastY;
  state.lastX = event.clientX;
  state.lastY = event.clientY;

  // Pointer position, normalised to -1..1 and smoothed toward by step().
  state.aimX = (event.clientX / window.innerWidth) * 2 - 1;
  state.aimY = (event.clientY / window.innerHeight) * 2 - 1;
  state.active = true;

  // A gust is spawned on DISTANCE travelled, not on every event: a slow drag
  // lays an even trail instead of pinning the gust at maximum.
  const speed = Math.min(1, Math.hypot(dx, dy) / 42);
  if (speed > 0.06) state.target = Math.max(state.target, speed * 0.85);
}

function onLeave() {
  state.active = false;
  state.has = false;
  state.target = 0;
}

export function useWind(reduced: boolean): Wind {
  const gust = useRef(0);
  const aim = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    if (reduced) return;

    listeners += 1;
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      listeners -= 1;
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (listeners === 0) {
        // Last canvas gone: leave nothing behind holding a stale pointer
        // position. ARCHITECTURE §9, "no orphan listeners".
        state.gust = state.target = 0;
        state.has = state.active = false;
      }
    };
  }, [reduced]);

  useEffect(() => {
    if (reduced) {
      // A fixed, plausible breeze for the still frame. Static, not dead: the
      // scene should still look like weather, just not weather that moves.
      gust.current = 0.22;
      aim.current.x = 0;
      aim.current.y = 0;
      aim.current.active = false;
    }
  }, [reduced, gust, aim]);

  const step = (delta: number, elapsed: number) => {
    if (reduced) return;

    // The weather cycle underneath the pointer: a gust every ~11 seconds that
    // nobody has to move the mouse to see.
    const weather =
      0.22 +
      0.2 * Math.sin(elapsed * 0.57) +
      0.12 * Math.sin(elapsed * 0.19 + 1.7) +
      0.08 * Math.sin(elapsed * 1.13 + 0.4);

    const target = Math.max(0, Math.min(1, Math.max(state.target, weather)));

    // Attack fast, release slow — the same shape as the paper headline's puffs,
    // because wind arriving and leaving looks nothing like wind pulsing.
    const k = target > state.gust ? 0.14 : 0.035;
    state.gust += (target - state.gust) * k;
    state.target *= 0.94;

    aim.current.x += (state.aimX - aim.current.x) * 0.04;
    aim.current.y += (state.aimY - aim.current.y) * 0.04;
    aim.current.active = state.active;

    gust.current = state.gust;
  };

  return { gust, aim, step };
}