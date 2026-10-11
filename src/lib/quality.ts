"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ADAPTIVE QUALITY MANAGER
 *
 * Tracks rolling frame times and steps quality up/down, with a cooldown so
 * quality never oscillates. Tiers affect visual polish only — never the
 * narrative or the layout.
 *
 * Based on the production pattern from award-site case studies.
 */

export const TIERS = ["low", "medium", "high", "ultra"] as const;
export type Tier = (typeof TIERS)[number];

export interface TierProfile {
  /** Clamped devicePixelRatio ceiling. */
  dpr: [number, number];
  /** Multisampling samples for the WebGL context. */
  samples: 0 | 2 | 4;
  /** Enable expensive post passes (bloom / DOF / refraction). */
  postprocessing: boolean;
  /** Enable real-time shadows. */
  shadows: boolean;
  shadowMapSize: number;
  /** Extra canvas-mask / frosted-glass effects. */
  glass: boolean;
  /** Anisotropy level for textures. */
  anisotropy: number;
}

export const PROFILES: Record<Tier, TierProfile> = {
  low: {
    dpr: [0.75, 1],
    samples: 0,
    postprocessing: false,
    shadows: false,
    shadowMapSize: 512,
    glass: false,
    anisotropy: 1,
  },
  medium: {
    dpr: [1, 1.5],
    samples: 0,
    postprocessing: true,
    shadows: true,
    shadowMapSize: 1024,
    glass: true,
    anisotropy: 4,
  },
  high: {
    dpr: [1, 2],
    samples: 2,
    postprocessing: true,
    shadows: true,
    shadowMapSize: 2048,
    glass: true,
    anisotropy: 8,
  },
  ultra: {
    dpr: [1, 2],
    samples: 4,
    postprocessing: true,
    shadows: true,
    shadowMapSize: 4096,
    glass: true,
    anisotropy: 16,
  },
};

const DOWNGRADE_MS = 22; // ~45fps
const UPGRADE_MS = 12; // ~83fps
const COOLDOWN_MS = 2000;

interface Options {
  initial?: Tier;
  /** Force a tier (e.g. reduced motion, or a QA override). */
  locked?: boolean;
}

function detectInitialTier(): Tier {
  if (typeof window === "undefined") return "high";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return "low";

  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024;

  if (mobile) return mem >= 6 && cores >= 6 ? "medium" : "low";
  if (mem >= 8 && cores >= 8) return "ultra";
  if (mem >= 8 || cores >= 8) return "high";
  return "medium";
}

export function useAdaptiveQuality(options: Options = {}) {
  const [tier, setTier] = useState<Tier>(options.initial ?? "medium");
  const [fps, setFps] = useState(60);
  const ready = useRef(false);

  useEffect(() => {
    if (options.locked && options.initial) {
      setTier(options.initial);
      return;
    }
    setTier(options.initial ?? detectInitialTier());

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const samples: number[] = [];
    let last = performance.now();
    let cooldownUntil = 0;
    let raf = 0;
    let fpsTick = 0;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (dt > 0 && dt < 500) samples.push(dt);

      if (samples.length > 120) samples.shift();

      if (++fpsTick % 30 === 0 && samples.length > 10) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        setFps(Math.round(1000 / avg));
      }

      if (now > cooldownUntil && samples.length >= 90) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        setTier((current) => {
          const idx = TIERS.indexOf(current);
          if (avg > DOWNGRADE_MS && idx > 0) {
            cooldownUntil = now + COOLDOWN_MS;
            samples.length = 0;
            return TIERS[idx - 1] as Tier;
          }
          if (avg < UPGRADE_MS && idx < TIERS.length - 1) {
            cooldownUntil = now + COOLDOWN_MS * 2;
            samples.length = 0;
            return TIERS[idx + 1] as Tier;
          }
          return current;
        });
      }

      raf = requestAnimationFrame(tick);
    };

    // Wait a beat so boot / preload does not poison the measurement.
    const boot = setTimeout(() => {
      ready.current = true;
      raf = requestAnimationFrame(tick);
    }, 600);

    return () => {
      clearTimeout(boot);
      cancelAnimationFrame(raf);
    };
  }, [options.initial, options.locked]);

  return { tier, profile: PROFILES[tier], fps, downgrade: tier !== "low" };
}