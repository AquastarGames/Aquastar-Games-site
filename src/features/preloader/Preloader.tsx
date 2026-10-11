"use client";

import { useEffect, useRef, useState } from "react";

/**
 * HONEST PRELOADER
 *
 * Fake progress bars that jump to 100% before the scene exists read as broken.
 * This tracks three real signals, weighted, with:
 *   - a minimum display time (~700ms) so it never strobes on fast connections
 *   - a hard failsafe (~7s) so a stalled signal can never hang the site
 *
 * A loader that can hang is worse than no loader.
 */

const MIN_MS = 700;
const FAILSAFE_MS = 7000;

interface PreloaderProps {
  onComplete: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const start = useRef(0);
  const finished = useRef(false);

  useEffect(() => {
    start.current = performance.now();
    let frame = 0;
    let raf = 0;

    const fonts = document.fonts?.ready ?? Promise.resolve();
    let fontsReady = false;
    let windowReady = false;
    let sceneReady = false;

    const recompute = () => {
      // Weighted toward the scene — it is the real blocker.
      const raw = (fontsReady ? 0.15 : 0) + (windowReady ? 0.1 : 0) + (sceneReady ? 0.75 : 0);
      // Ease toward the target so the bar never snaps backwards.
      setProgress((p) => {
        const target = raw * 100;
        return target > p ? Math.min(target, p + 1.4) : p;
      });
    };

    const frameTick = () => {
      const elapsed = performance.now() - start.current;

      if (sceneReady && fontsReady && !finished.current && elapsed >= MIN_MS) {
        finished.current = true;
        setProgress(100);
        // Next frame so the 100% actually paints before reveal.
        frame = requestAnimationFrame(() => setDone(true));
        return;
      }

      if (elapsed > FAILSAFE_MS && !finished.current) {
        finished.current = true;
        setDone(true);
        console.warn("[preloader] failsafe fired — revealing without full scene");
        return;
      }

      recompute();
      raf = requestAnimationFrame(frameTick);
    };

    void fonts.then(() => {
      fontsReady = true;
    });
    if (document.readyState === "complete") windowReady = true;
    else window.addEventListener("load", () => (windowReady = true), { once: true });

    const onScene = () => {
      sceneReady = true;
    };
    window.addEventListener("aq:scene-ready", onScene);

    raf = requestAnimationFrame(frameTick);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(frame);
      window.removeEventListener("load", onScene);
      window.removeEventListener("aq:scene-ready", onScene);
    };
  }, []);

  useEffect(() => {
    if (done) onComplete();
  }, [done, onComplete]);

  return (
    <div
      className="preloader"
      aria-hidden={done}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: done ? "none" : "grid",
        placeItems: "center",
        background: "var(--aq-paper, #f4efe7)",
        color: "var(--aq-ink, #17130f)",
        fontFamily: "var(--aq-mono, monospace)",
        pointerEvents: done ? "none" : "auto",
      }}
    >
      <div style={{ textAlign: "center", width: "min(360px, 70vw)" }}>
        <div style={{ fontSize: "11px", letterSpacing: "0.28em", opacity: 0.6, marginBottom: 18 }}>
          AQUASTAR GAMES
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Loading experience"
          style={{
            height: 1,
            background: "rgba(255,255,255,0.14)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${progress}%`,
              background: "currentColor",
              transition: "width 120ms linear",
            }}
          />
        </div>
        <div style={{ fontSize: "11px", letterSpacing: "0.2em", marginTop: 14, opacity: 0.8 }}>
          {String(Math.round(progress)).padStart(3, "0")}
        </div>
      </div>
    </div>
  );
}