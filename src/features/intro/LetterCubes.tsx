"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * Letter-by-letter cube reveal.
 *
 * Each glyph is a real 4-faced CSS cube — the front face carries the letter,
 * the side faces are shaded so the rotation reads as volume rather than a
 * flat flip. The stagger is what makes it feel typed rather than faded in.
 *
 * The hidden start state is applied in useLayoutEffect (before paint) so the
 * cubes are never visible during the curtain phase.
 */

const FACES = ["face--front", "face--back", "face--right", "face--left"] as const;

const FROM = {
  yPercent: 18,
  opacity: 0,
  rotateX: -95,
  rotateY: -120,
  scale: 0.72,
} as const;

const TO = {
  yPercent: 0,
  opacity: 1,
  rotateX: 0,
  rotateY: 0,
  scale: 1,
  duration: 1.05,
  ease: "power3.out",
  stagger: 0.075,
} as const;

export function LetterCubes({
  word,
  active,
  onComplete,
}: {
  word: string;
  active: boolean;
  onComplete?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Hide before first paint.
  useLayoutEffect(() => {
    const cubes = root.current ? gsap.utils.toArray<HTMLElement>(".aq-cube", root.current) : [];
    if (cubes.length) gsap.set(cubes, FROM);
  }, []);

  useLayoutEffect(() => {
    if (!active || !root.current) return;

    const cubes = gsap.utils.toArray<HTMLElement>(".aq-cube", root.current);

    // Deliberately no `started` guard: StrictMode mounts -> cleans up -> mounts
    // again, so a flag that blocks re-creation would kill the only tween and
    // leave the cubes frozen in their hidden start state.
    const tween = cubes.length
      ? gsap.fromTo(cubes, FROM, { ...TO, onComplete: () => onCompleteRef.current?.() })
      : null;

    if (!tween) onCompleteRef.current?.();

    return () => {
      tween?.kill();
    };
  }, [active]);

  return (
    <div className="aq-cubes" ref={root} aria-hidden="true">
      {word.split("").map((ch, i) => (
        <div className="aq-cube" key={`${ch}-${i}`}>
          <div className="aq-cube__inner">
            {FACES.map((f) => (
              <div key={f} className={`aq-cube__face aq-cube__${f}`}>
                {f === "face--front" ? ch : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}