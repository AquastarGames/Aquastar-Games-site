"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from "three";
import type { Tier } from "@/lib/quality";

/**
 * ONE fixed, viewport-pinned canvas behind the whole document.
 *
 * Rules this component enforces:
 *  - ONE canvas. Never a <Canvas> per section — each context costs GPU memory.
 *  - Scenes swap by scroll segment, not by route, so the GL context and its
 *    compiled shaders survive navigation.
 *  - The render loop is paused when off-screen (see PauseWhenHidden).
 *  - Renderer settings derive entirely from the adaptive tier.
 */

interface ExperienceProps {
  tier: Tier;
  children: React.ReactNode;
  /** Fired once the GL context exists and the first frame can render. */
  onReady?: () => void;
}

export function Experience({ tier, children, onReady }: ExperienceProps) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.outputColorSpace = SRGBColorSpace;
    gl.shadowMap.type = PCFSoftShadowMap;
    gl.shadowMap.enabled = tier !== "low";

    onReady?.();
    // The preloader listens for this — it is the only real "scene is up" signal.
    window.dispatchEvent(new Event("aq:scene-ready"));
  }, [gl, onReady, tier]);

  useEffect(() => {
    gl.shadowMap.enabled = tier !== "low";
  }, [gl, tier]);

  return <>{children}</>;
}

/**
 * Pause rendering when the canvas is off-screen.
 * Roughly 15 lines, and the largest single performance win on a long page:
 * idle GPU work drops to near zero while someone is reading.
 */
export function PauseWhenHidden({ margin = "10% 0px" }: { margin?: string }) {
  const gl = useThree((s) => s.gl);
  const set = useThree((s) => s.set);

  useEffect(() => {
    const el = gl.domElement;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // R3F v9: drive frameloop through the root state setter.
        set({ frameloop: entry.isIntersecting ? "always" : "never" });
      },
      { rootMargin: margin },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [gl, set, margin]);

  return null;
}