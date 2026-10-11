"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Observer } from "gsap/Observer";
import Lenis from "lenis";
import { markScrollReady } from "@/lib/telemetry";

/**
 * SINGLE CLOCK FOR THE ENTIRE SITE.
 *
 * The #1 cause of janky award-site scroll is three independent
 * requestAnimationFrame loops (Lenis / GSAP / WebGL) fighting over frames.
 * Everything below is pinned to gsap.ticker — one time source, one frame.
 *
 * Ownership:
 *   lib/loop.ts            -> the clock + input + scroll normalisation
 *   lib/scroll.ts          -> declarative ScrollTrigger factories
 *   features/canvas/*      -> R3F useFrame (already ticker-bound) + invalidate()
 *
 * DO NOT add a bare requestAnimationFrame anywhere in the app.
 */

type ScrollMode = "native" | "virtual";

let lenis: Lenis | null = null;
let rafRegistered = false;

let virtualTarget = 0;
let virtualCurrent = 0;
let mode: ScrollMode = "native";

const listeners = new Set<(progress: number, velocity: number) => void>();

export function getLenis(): Lenis | null {
  return lenis;
}

export function getScrollProgress(): number {
  if (mode === "virtual") {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, virtualCurrent / max)) : 0;
  }
  return 0;
}

export function getScrollVelocity(): number {
  return lenis?.velocity ?? 0;
}

export function isVirtualScroll(): boolean {
  return mode === "virtual";
}

export function subscribeScroll(fn: (progress: number, velocity: number) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Switch the whole site between native (Lenis) and virtual scroll.
 * Segmented cinematic sequences use virtual; content sections use native.
 * This is the state machine that keeps both from fighting each other.
 */
export function setScrollMode(next: ScrollMode) {
  if (mode === next) return;
  mode = next;

  if (next === "virtual") {
    const current =
      window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    virtualTarget = virtualCurrent = current * (document.documentElement.scrollHeight - window.innerHeight);
    lenis?.stop();
    document.body.style.position = "fixed";
    document.body.style.top = `-${window.scrollY}px`;
    document.body.style.width = "100%";
  } else {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    lenis?.start();
  }

  ScrollTrigger.refresh();
}

/**
 * Progress of a section in the current mode, normalised 0..1.
 * Returns the same shape in both modes so segments stay mode-agnostic.
 */
export function sectionProgress(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;

  if (mode === "virtual") {
    const virtualY = window.scrollY + rect.top;
    const start = virtualY - vh;
    const end = virtualY + rect.height;
    return end > start ? Math.min(1, Math.max(0, virtualCurrent - start) / (end - start)) : 0;
  }

  const total = rect.height + vh;
  const travelled = vh - rect.top;
  return Math.min(1, Math.max(0, travelled / total));
}

function emit() {
  const progress = getScrollProgress();
  const velocity = getScrollVelocity();
  for (const fn of listeners) fn(progress, velocity);
}

export function initLoop(): () => void {
  gsap.registerPlugin(ScrollTrigger, Observer);

  lenis = new Lenis({
    duration: 1.1,
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    // Native scroll position stays authoritative for SEO / anchors / a11y.
    autoRaf: false,
  });

  // lenis -> ScrollTrigger
  lenis.on("scroll", () => {
    ScrollTrigger.update();
    emit();
  });

  // Unify wheel/touch/trackpad into one input stream (GSAP Observer).
  Observer.create({
    type: "wheel,touch,pointer",
    preventDefault: false,
    tolerance: 0,
    onChangeY: (self) => {
      if (mode === "virtual") {
        virtualTarget += self.deltaY * 1.0;
      }
    },
  });

  // THE clock. gsap.ticker is now the only RAF driver on the site.
  gsap.ticker.add((time) => {
    if (mode === "virtual") {
      virtualCurrent += (virtualTarget - virtualCurrent) * 0.09;
    } else {
      lenis?.raf(time * 1000);
    }
    emit();
  });
  gsap.ticker.lagSmoothing(0);

  rafRegistered = true;
  markScrollReady();

  ScrollTrigger.refresh();

  return () => {
    if (!rafRegistered) return;
    gsap.ticker.lagSmoothing(500, 33);
    lenis?.destroy();
    lenis = null;
    rafRegistered = false;
  };
}