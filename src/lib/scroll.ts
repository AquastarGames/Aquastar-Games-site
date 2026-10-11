"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { getLenis } from "./loop";

/**
 * Declarative ScrollTrigger factories.
 *
 * Every scroll animation in the app goes through here so timing, pinning and
 * cleanup stay consistent — and so nothing forgets `invalidateOnRefresh`.
 *
 * GSAP passes the ScrollTrigger *instance* to onUpdate, not a number. Callers
 * read `self.progress`; this module does not paper over that.
 */

gsap.registerPlugin(ScrollTrigger);

type Common = {
  trigger: string | HTMLElement;
  start?: string;
  end?: string;
  pin?: boolean | HTMLElement | string;
  /** Seconds of catch-up smoothing. 1 is the cinematic default. */
  scrub?: number | true;
  onUpdate?: (self: ScrollTrigger) => void;
  onEnter?: (self: ScrollTrigger) => void;
  onLeave?: (self: ScrollTrigger) => void;
  onEnterBack?: (self: ScrollTrigger) => void;
  onLeaveBack?: (self: ScrollTrigger) => void;
};

/** Timeline scrubbed against scroll progress. */
export function scrubTimeline(vars: Common) {
  const { trigger, start = "top top", end = "+=100%", pin = true, scrub = 1, ...rest } = vars;

  return gsap.timeline({
    scrollTrigger: {
      trigger,
      start,
      end,
      pin,
      scrub,
      invalidateOnRefresh: true,
      // Smooth the mobile 100vh / address-bar pin jump.
      anticipatePin: 1,
      ...rest,
    } as ScrollTrigger.Vars,
  });
}

/**
 * Drive a value from scroll progress WITHOUT allocating a tween.
 * Preferred for camera and uniform updates — nothing is tweened, so there is
 * no per-frame GSAP object churn. Returns a disposer.
 */
export function bindScrollValue(vars: Common) {
  const {
    trigger,
    start = "top bottom",
    end = "bottom top",
    scrub = 1,
    onUpdate,
    ...rest
  } = vars;

  const instance = ScrollTrigger.create({
    trigger,
    start,
    end,
    scrub,
    invalidateOnRefresh: true,
    onUpdate,
    ...rest,
  } as ScrollTrigger.Vars);

  return () => instance.kill();
}

/**
 * Transit window after a programmatic tab navigation.
 *
 * scrollTo is the single choke point for tab-driven jumps; every guard and
 * the spy consult this so they never fight a smooth scroll mid-transit
 * (which would otherwise retarget the camera back mid-flight).
 */
let navUntil = 0;

export function isProgrammaticNav(): boolean {
  return Date.now() < navUntil;
}

/** Scroll-to for nav and anchors — routed through Lenis so it stays smooth. */
export function scrollTo(target: string | HTMLElement, offset = 0) {
  // Lenis runs 1.4 s, native smooth ~0.5 s — 1.8 s covers both with margin.
  navUntil = Date.now() + 1800;
  const lenis = getLenis();
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.4 });
    return;
  }
  const el = typeof target === "string" ? document.querySelector(target) : target;
  el?.scrollIntoView({ behavior: "smooth" });
}

export { ScrollTrigger };