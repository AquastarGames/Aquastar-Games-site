"use client";

import { forwardRef } from "react";
import {
  WORD_RINGS,
  RING_IS_HOLE,
  STAR_RING,
  STAR_CENTER,
  VIEW_W,
  VIEW_H,
} from "./mark.paths.generated";

/**
 * Path morph: AQUASTAR -> minimalist star.
 *
 * The word is emitted as N independent closed subpaths (one per contour) and
 * EVERY contour lerps toward the same STAR_RING. At t=1 they all coincide, so
 * nonzero fill renders exactly one star.
 *
 * Why subpaths and not one stitched ring: a straight connector between two
 * contours is crossed exactly once by a ray cast from inside a glyph, which
 * flips the nonzero winding parity and tears white gaps through the letters.
 * Separate subpaths have no connectors, so the word renders exactly as the
 * font intended at t=0.
 *
 * The result is written straight to the DOM from the shared ticker, so no
 * React render happens during the interaction.
 */

const DECIMALS = 2;

/** smoothstep — settles rather than snaps at the star end. */
function ease(t: number) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Blend every word contour toward the star at t (0 = word, 1 = star). */
export function morphRings(t: number): string {
  const k = ease(t);
  const parts: string[] = [];

  for (let c = 0; c < WORD_RINGS.length; c++) {
    const ring = WORD_RINGS[c]!;
    // Counters collapse to the star's centre instead of growing into stars —
    // extra coincident rings read as jagged spikes part-way through.
    const isHole = RING_IS_HOLE[c] === true;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = isHole ? STAR_CENTER : STAR_RING[i]!;
      const x = (a[0] + (b[0] - a[0]) * k).toFixed(DECIMALS);
      const y = (a[1] + (b[1] - a[1]) * k).toFixed(DECIMALS);
      parts.push((i === 0 ? "M" : "L") + x + "," + y);
    }
    parts.push("Z");
  }

  return parts.join("");
}

export const MorphMark = forwardRef<SVGPathElement, { className?: string }>(
  function MorphMark({ className }, ref) {
    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={className}
        aria-hidden="true"
        focusable="false"
      >
        {/* nonzero: glyph counters (A/Q/R) read as holes at t=0 */}
        <path ref={ref} d={morphRings(0)} fill="currentColor" fillRule="nonzero" />
      </svg>
    );
  },
);