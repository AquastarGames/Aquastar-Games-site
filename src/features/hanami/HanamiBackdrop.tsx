"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useAdaptiveQuality } from "@/lib/quality";
import { useSiteStore } from "@/store/site";
import { BUDGETS } from "./tiers";
import { Scene } from "./Scene";
import "./hanami.css";

/**
 * THE BACKDROP.
 *
 * A fixed, viewport-pinned canvas behind the whole index page: a flooded
 * Colosseum under cherry blossom, shot through a fisheye.
 *
 * Four rules, all of them load-bearing:
 *
 *  - `pointer-events: none`. The DOM above stays the interface. A canvas that
 *    swallows a click on the "View our work" button is a broken site, however
 *    good it looks.
 *  - `aria-hidden`. Nothing in here is content. The headline is real DOM text
 *    (ARCHITECTURE §2.5); this is enhancement.
 *  - No WebGL, no crash. The probe below runs after mount so SSR never touches
 *    getContext, and a failed probe simply removes the canvas — the page is a
 *    beautiful light-paper page with no picture behind it, which is exactly
 *    what it was before this feature existed.
 *  - `prefers-reduced-motion` gets a real still frame, not a degraded one.
 *    lib/quality.ts locks the tier to `low`, which is the same configuration a
 *    low-end phone gets.
 */
export function HanamiBackdrop() {
  const { tier } = useAdaptiveQuality();
  const [supported, setSupported] = useState(true);
  // The dive, DOM half: the veil tracks physical submersion (clears while
  // surfacing), the flash fires once the plunge has completed (arrival).
  const diving = useSiteStore((s) => s.submerged);
  const arrivedBelow = useSiteStore((s) => s.cameraAt === "games");
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    if (arrivedBelow) setFlashKey((k) => k + 1);
  }, [arrivedBelow]);

  useEffect(() => {
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
      setSupported(!!gl);
      // Release the probe immediately — browsers cap concurrent contexts, and a
      // leaked one can cost the real canvas its hardware acceleration.
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setSupported(false);
    }
  }, []);

  if (!supported) return null;

  const budget = BUDGETS[tier];

  return (
    <div className="hanami" aria-hidden="true">
      <Canvas
        // Tier-driven, never higher. The clamp is in lib/quality.ts.
        dpr={tier === "low" ? 1 : [1, tier === "ultra" ? 2 : 1.75]}
        camera={{ position: [0, 5, 46], fov: 42, near: 0.5, far: 1600 }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <Scene tier={tier} />
      </Canvas>

      {/*
        The haze under the headline.

        Not a scrim over the whole canvas — that would grey the picture. A single
        soft ellipse, exactly the size of `.hero__center`, lifting the value
        band the DOM headline occupies so `#17130f` ink keeps its contrast
        against a photograph that is already mid-tone at that point. This is the
        DOM half of a decision the mist sheets make in the GL half.
      */}
      <div className="hanami__veil" />
      {/*
        The dive dressing, DOM half: a deep-teal veil that settles in once the
        plunge has completed, slow light shafts, and a one-shot arrival pulse.
      */}
      <div className="hanami__dive" data-diving={diving}>
        <div className="hanami__shaft hanami__shaft--a" />
        <div className="hanami__shaft hanami__shaft--b" />
      </div>
      {flashKey > 0 && arrivedBelow && <div key={flashKey} className="hanami__flash" />}
    </div>
  );
}