"use client";

import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import "./menu.css";

/**
 * The round button that IS the close button.
 *
 * Two dots spread, lengthen and cross over into an X while the disc fills from
 * the centre. One element, both states — there is no second button to swap in,
 * which is what keeps the transition continuous.
 *
 * The morph is a path interpolation between two sets of coordinates rather than
 * a MorphSVG plugin: the shapes are straight lines between known endpoints, so
 * lerping four numbers per bar is the whole problem, and it costs no plugin.
 */

/** Rest state: two dots, 6px either side of centre. */
const DOT_OFFSET = 6;
/** Open state: a bar spanning this much of the 44px box, corner to corner. */
const CROSS_SPAN = 14;
/** With `round` caps a zero-length bar still renders as a dot. */
const STROKE = 2.6;

const BOX = 44;
const MID = BOX / 2;

/**
 * The beat before anything moves.
 *
 * Starting on the click frame reads as a glitch rather than a response — the
 * control looks like it broke instead of reacting. The delay is what makes the
 * interaction read as deliberate.
 */
const START_DELAY = 0.12;

export function MenuToggle({
  open,
  onToggle,
  label = "Menu",
}: {
  open: boolean;
  onToggle: () => void;
  label?: string;
}) {
  const disc = useRef<SVGCircleElement>(null);
  const barA = useRef<SVGLineElement>(null);
  const barB = useRef<SVGLineElement>(null);

  /**
   * Park the disc at zero scale from the start, with the origin set once.
   *
   * The origin matters more than it looks: `svgOrigin` resolves in the SVG user
   * space, so (22, 22) is the real centre of the circle. Setting it through
   * CSS `transform-box: fill-box` instead resolves against the element's
   * bounding box, and a `transform-origin: 22px` lands 1px off — which is
   * enough for a radial fill to visibly grow from a corner rather than from
   * the middle.
   */
  useEffect(() => {
    if (disc.current) gsap.set(disc.current, { scale: 0, svgOrigin: `${MID} ${MID}` });
  }, []);

  const animate = useCallback((next: boolean) => {
    const d = disc.current;
    const a = barA.current;
    const b = barB.current;
    if (!d || !a || !b) return;

    const tl = gsap.timeline();

    if (next) {
      tl.to(d, { scale: 1, duration: 0.46, ease: "power3.out", svgOrigin: `${MID} ${MID}` }, START_DELAY)
        // The bars leave first and the disc fills under them: the dots read as
        // spreading before the shape behind them commits.
        .to(a, {
          attr: { x1: MID - CROSS_SPAN, y1: MID - CROSS_SPAN, x2: MID + CROSS_SPAN, y2: MID + CROSS_SPAN },
          duration: 0.42,
          ease: "power3.inOut",
        }, START_DELAY)
        // The second bar runs the other diagonal, written separately so the two
        // bars cross rather than both rotating the same way.
        .to(b, {
          attr: { x1: MID + CROSS_SPAN, y1: MID - CROSS_SPAN, x2: MID - CROSS_SPAN, y2: MID + CROSS_SPAN },
          duration: 0.42,
          ease: "power3.inOut",
        }, START_DELAY);
    } else {
      tl.to(a, {
        attr: { x1: MID - DOT_OFFSET, y1: MID, x2: MID - DOT_OFFSET, y2: MID },
        duration: 0.36,
        ease: "power2.inOut",
      }, START_DELAY)
        .to(b, {
          attr: { x1: MID + DOT_OFFSET, y1: MID, x2: MID + DOT_OFFSET, y2: MID },
          duration: 0.36,
          ease: "power2.inOut",
        }, START_DELAY)
        // The disc empties only once the bars are nearly back to dots —
        // shrinking it first would leave two pale dots on bare paper.
        .to(d, { scale: 0, duration: 0.32, ease: "power2.in", svgOrigin: `${MID} ${MID}` }, START_DELAY + 0.1);
    }

    return () => {
      tl.kill();
    };
  }, []);

  // Drive the morph from `open`, not from the click, so the button cannot
  // desync if the state changes some other way (Escape, a link click).
  useEffect(() => {
    const cleanup = animate(open);
    return () => cleanup?.();
  }, [open, animate]);

  return (
    <button
      type="button"
      className="menu-toggle"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="aq-menu"
      aria-label={open ? "Close menu" : label}
      data-open={open}
    >
      <svg viewBox={`0 0 ${BOX} ${BOX}`} width={BOX} height={BOX} aria-hidden="true" focusable="false">
        {/* The resting plate, present in every state, so the control always
            reads as a circle instead of two dots floating in space. */}
        <circle className="menu-toggle__plate" cx={MID} cy={MID} r={MID - 1} />
        {/* Fills from the centre; GSAP owns the scale and its origin. */}
        <circle ref={disc} className="menu-toggle__disc" cx={MID} cy={MID} r={MID - 1} />
        {/* Two bars with round caps: at zero length they are the two dots. */}
        <line
          ref={barA}
          className="menu-toggle__bar"
          x1={MID - DOT_OFFSET}
          y1={MID}
          x2={MID - DOT_OFFSET}
          y2={MID}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        <line
          ref={barB}
          className="menu-toggle__bar"
          x1={MID + DOT_OFFSET}
          y1={MID}
          x2={MID + DOT_OFFSET}
          y2={MID}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}