"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import "./cursor.css";

/**
 * A ring that trails the native cursor and stretches along the direction of
 * travel.
 *
 * The native cursor is deliberately NOT hidden — the ring is an accent around
 * it, not a replacement. That keeps the precise OS pointer for clicking and
 * text carets, which a custom arrow always does worse.
 *
 * Writes happen on the shared gsap.ticker so the trailing ring and the rest of
 * the site stay on one clock (ARCHITECTURE.md). Pointer events only update
 * state; they never touch the DOM.
 *
 * Stretch is velocity-based, and decays when the pointer stops — otherwise the
 * last recorded speed would freeze the ellipse forever, since no further
 * pointermove events arrive once the cursor is still.
 */

const INTERACTIVE = 'a, button, input, textarea, select, [role="button"], [data-cursor]';

/** Ring smoothing per tick — lower is laggier. */
const FOLLOW = 0.18;
/** Velocity smoothing. */
const SMOOTH = 0.2;
/** px/frame at which stretch reaches maximum. */
const SPEED_REF = 26;
/** Max horizontal gain / vertical loss at full speed. */
const STRETCH = 0.8;
const SQUASH = 0.32;
/** ms without a move before velocity starts decaying. */
const IDLE_MS = 48;
const DECAY = 0.88;

export function CustomCursor() {
  const root = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rootEl = root.current;
    const ringEl = ring.current;
    if (!rootEl || !ringEl) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (coarse || reduced) return;

    const p = { x: 0, y: 0, rx: 0, ry: 0, vx: 0, vy: 0, t: 0, seen: false };

    const onMove = (e: PointerEvent) => {
      if (!p.seen) {
        p.seen = true;
        p.x = p.rx = e.clientX;
        p.y = p.ry = e.clientY;
        rootEl.classList.add("aq-cursor--on");
      }
      const now = e.timeStamp || performance.now();

      if (p.t) {
        const dt = Math.max(1, now - p.t);
        // Normalise to px per 16ms frame so the effect is frame-rate independent.
        const ivx = ((e.clientX - p.x) / dt) * 16;
        const ivy = ((e.clientY - p.y) / dt) * 16;
        p.vx += (ivx - p.vx) * SMOOTH;
        p.vy += (ivy - p.vy) * SMOOTH;
      }

      p.x = e.clientX;
      p.y = e.clientY;
      p.t = now;
    };

    const setExpanded = (on: boolean) => {
      rootEl.classList.toggle("aq-cursor--expand", on);
    };

    const onOver = (e: Event) => {
      const t = e.target as Element | null;
      setExpanded(!!t?.closest?.(INTERACTIVE));
    };

    const onDown = () => rootEl.classList.add("aq-cursor--down");
    const onUp = () => rootEl.classList.remove("aq-cursor--down");
    const onLeaveWindow = () => rootEl.classList.remove("aq-cursor--on");

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("mouseleave", onLeaveWindow);

    const tick = () => {
      if (!p.seen) return;

      // Ring trails the pointer.
      p.rx += (p.x - p.rx) * FOLLOW;
      p.ry += (p.y - p.ry) * FOLLOW;

      // Relax to a circle once the pointer has been still for a moment.
      if (performance.now() - p.t > IDLE_MS) {
        p.vx *= DECAY;
        p.vy *= DECAY;
      }

      const speed = Math.hypot(p.vx, p.vy);
      const k = Math.min(1, speed / SPEED_REF);

      if (k < 0.004) {
        ringEl.style.transform = `translate3d(${p.rx}px, ${p.ry}px, 0) translate(-50%, -50%)`;
      } else {
        const deg = (Math.atan2(p.vy, p.vx) * 180) / Math.PI;
        const sx = 1 + k * STRETCH;
        const sy = 1 - k * SQUASH;
        ringEl.style.transform =
          `translate3d(${p.rx}px, ${p.ry}px, 0) translate(-50%, -50%) ` +
          `rotate(${deg.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      }
    };

    gsap.ticker.add(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("mouseleave", onLeaveWindow);
      gsap.ticker.remove(tick);
    };
  }, []);

  return (
    <div className="aq-cursor" ref={root} aria-hidden="true">
      <div className="aq-cursor__ring" ref={ring}>
        <span className="aq-cursor__ring-inner" />
      </div>
    </div>
  );
}