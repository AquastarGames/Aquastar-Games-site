"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Experience, PauseWhenHidden } from "@/features/canvas/Experience";
import { useAdaptiveQuality } from "@/lib/quality";
import { PaperHeadline } from "./PaperHeadline";
import "./hero.css";

/**
 * The paper plane behind the index headline.
 *
 * ONE canvas, absolutely filling the hero stage, with `pointer-events: none` so
 * it never intercepts a click — the DOM above stays the real interface
 * (ARCHITECTURE §2.5: content is HTML, canvas is enhancement).
 *
 * The canvas fills its container rather than the viewport, which is what lets
 * the headline keep a constant measure against the text box instead of against
 * the screen. The plane itself is contain-fitted inside it.
 */
export function PaperPlane({
  lines,
  onReady,
}: {
  lines: string[];
  /** Fired after the plane has genuinely drawn a frame. */
  onReady?: () => void;
}) {
  const { tier } = useAdaptiveQuality();
  // Locked to low by prefers-reduced-motion, which also flattens the sheet.
  const reduced = tier === "low";
  const [supported, setSupported] = useState(true);

  // No WebGL: the DOM heading is already on screen, so the canvas is optional
  // and must not throw. Checked after mount so SSR never touches getContext.
  useEffect(() => {
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
      setSupported(!!gl);
      // Release the probe context immediately — browsers cap concurrent ones.
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setSupported(false);
    }
  }, []);

  if (!supported) return null;

  return (
    <div className="paper-plane" aria-hidden="true">
      <Canvas
        dpr={tier === "low" ? 1 : [1, 2]}
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        // One quad, no depth interaction — a depth buffer buys nothing here.
        flat
      >
        <Experience tier={tier}>
          <Suspense fallback={null}>
            <PaperHeadline lines={lines} reduced={reduced} onReady={onReady} />
          </Suspense>
          <PauseWhenHidden />
        </Experience>
      </Canvas>
    </div>
  );
}