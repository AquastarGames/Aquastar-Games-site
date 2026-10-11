"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { studio } from "@/content/site";
import { LetterCubes } from "./LetterCubes";
import { MorphMark, morphRings } from "./MorphMark";
import "./intro.css";

type Phase = "curtain" | "cubes" | "live";

const WORD = "AQUASTAR";

/** Cursor influence radius in px. Inside this the morph starts; at the button it is full. */
const FIELD = 360;
/** Below this delta the morph is considered settled and we stop writing the DOM. */
const EPSILON = 0.0015;
/** Tween the current value toward the target for frame-rate-independent easing. */
const SMOOTHING = 0.12;

/**
 * Exit dissolve constants.
 *
 * `EXIT_BLUR` is a CSS stdDeviation, so the kernel spreads roughly 3x that
 * past the edge of the element. `.intro` is viewport-locked, which means that
 * spread would fade the frame edges and expose the page behind it — so the
 * window scales up as it blurs and pays for the blur with overscan instead.
 * Keep EXIT_SCALE above 3 * EXIT_BLUR / min(viewport dimension).
 */
const EXIT_BLUR = 16;
const EXIT_SCALE = 1.14;

interface IntroProps {
  /** Fire as the dissolve starts: the index must be mounted *behind* the intro. */
  onExitStart: () => void;
  /** Fire once the intro is fully gone and can be unmounted. */
  onExited: () => void;
}

export function Intro({ onExitStart, onExited }: IntroProps) {
  const root = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const [phase, setPhase] = useState<Phase>("curtain");
  const [hovering, setHovering] = useState(false);
  const [muted, setMuted] = useState(true);
  const [exiting, setExiting] = useState(false);

  // Morph state lives in refs — never in React state. Writing a `d` attribute
  // 60x/sec through setState would re-render the tree for no reason.
  const current = useRef(0);
  const target = useRef(0);
  const hoveringRef = useRef(false);
  const settled = useRef(false);
  const evaluateRef = useRef<() => void>(() => {});
  // The button stays clickable for the whole dissolve; without this a double
  // click would build two timelines against the same DOM.
  const exitingRef = useRef(false);
  const exitContext = useRef<gsap.Context | null>(null);

  /* ------------------------------------------------------------ phase machine */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // CSS hides the curtain in this mode; skip straight to interactive.
      setPhase("live");
      return;
    }

    const tl = gsap.timeline();
    tl.to(".intro-curtain", {
      autoAlpha: 0,
      scale: 1.06,
      duration: 1.2,
      ease: "power3.inOut",
    });
    // Cubes start once the curtain is meaningfully off the wordmark.
    tl.add(() => setPhase("cubes"), 0.45);

    return () => {
      tl.kill();
    };
  }, []);

  /* ------------------------------------------------------------------- morph */
  // Runs on the shared gsap.ticker, so it obeys the one-clock rule and costs
  // nothing when the intro is idle (it returns early once settled).
  useEffect(() => {
    if (phase !== "live") return;

    const tick = () => {
      // Rebuilding the path `d` string 60x/sec is the single most expensive
      // thing in the intro — during the dissolve the ticker must stay parked,
      // or a blur-triggered onBlur would restart the morph behind the blur.
      if (exitingRef.current) return;

      const diff = target.current - current.current;
      if (Math.abs(diff) < EPSILON) {
        if (!settled.current) {
          current.current = target.current;
          write(current.current);
          settled.current = true;
        }
        return;
      }
      settled.current = false;
      current.current += diff * SMOOTHING;
      write(current.current);
    };

    const write = (v: number) => {
      pathRef.current?.setAttribute("d", morphRings(v));
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${v})`;
      if (markRef.current) markRef.current.style.transform = `scale(${1 + v * 0.08})`;
    };

    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
    };
  }, [phase]);

  /* ------------------------------------------------- proximity drives target */
  useEffect(() => {
    if (phase !== "live") return;

    const last = { x: -9999, y: -9999 };

    const evaluate = () => {
      const btn = btnRef.current;
      if (!btn) return;
      // A real hover (or keyboard focus) always wins over proximity.
      if (hoveringRef.current) {
        target.current = 1;
        return;
      }
      const r = btn.getBoundingClientRect();
      const d = Math.hypot(
        last.x - (r.left + r.width / 2),
        last.y - (r.top + r.height / 2),
      );
      target.current = Math.min(1, Math.max(0, 1 - d / FIELD));
    };

    // Exposed so hover/focus changes can re-evaluate without pointer movement.
    evaluateRef.current = evaluate;

    const onMove = (e: PointerEvent) => {
      last.x = e.clientX;
      last.y = e.clientY;
      evaluate();
    };

    const onLeave = () => {
      last.x = -9999;
      last.y = -9999;
      evaluate();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      evaluateRef.current = () => {};
    };
  }, [phase]);

  /* ------------------------------------------------------------ cubes -> live */
  const handleCubesDone = useCallback(() => setPhase("live"), []);

  /* ------------------------------------------------------------------ enter */
  /**
   * Enter → blur out → index.
   *
   * The intro never disappears on the frame the button is pressed. It hands
   * over to the index first (`onExitStart`), then dissolves: content detaches
   * first, the whole window blurs and drifts forward, and only then does it
   * fade — so the index is revealed *through* the blur instead of appearing
   * in a cut.
   *
   * `filter` is normally off-limits here (see ARCHITECTURE §5: transform and
   * opacity only). It is safe for exactly one case — a one-shot, 1.2s
   * transition on a promoted layer that nothing else animates — and it is the
   * only property that produces the dissolve we want.
   */
  const handleEnter = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;

    const el = root.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || !el) {
      onExitStart();
      onExited();
      return;
    }

    setExiting(true);

    // Mount the index before the first blurred frame, otherwise the dissolve
    // has nothing behind it to reveal.
    onExitStart();

    // Park the morph where it is and mark it settled: the ticker would
    // otherwise keep rebuilding the path `d` string 60x/sec behind the blur,
    // which is the most expensive thing on screen at that moment.
    current.current = target.current;
    settled.current = true;

    const tl = gsap.context(() => {
      gsap
        .timeline({ onComplete: onExited })
        // 1. content detaches — mark and copy lift, the button falls away
        .to(
          ".intro-center",
          { yPercent: -12, autoAlpha: 0, filter: "blur(7px)", duration: 0.45, ease: "power2.in" },
          0,
        )
        .to(
          ".intro-enter",
          { yPercent: 40, autoAlpha: 0, filter: "blur(9px)", duration: 0.4, ease: "power2.in" },
          0,
        )
        .to(".intro-audio", { autoAlpha: 0, duration: 0.25, ease: "power1.in" }, 0)
        // The grain is a full-screen multiply blend and the most expensive
        // layer in the tree — drop it before the blur ramps up.
        .to(".intro-grain", { autoAlpha: 0, duration: 0.35, ease: "power1.in" }, 0)
        // 2. the window itself dissolves forward into the index
        .fromTo(
          el,
          { filter: "blur(0px)", scale: 1 },
          {
            filter: `blur(${EXIT_BLUR}px)`,
            scale: EXIT_SCALE,
            duration: 1.05,
            ease: "power2.inOut",
          },
          0.25,
        )
        .to(el, { autoAlpha: 0, duration: 0.5, ease: "power2.in" }, 0.7);
    }, root);

    // A Context, not the Timeline: revert() tears down every tween it owns and
    // restores the inline styles, which is what an unmount needs.
    exitContext.current = tl;
  }, [onExitStart, onExited]);

  // The dissolve must not outlive the component, or a route change mid-exit
  // leaves a timeline writing to detached nodes.
  useEffect(
    () => () => {
      exitContext.current?.revert();
    },
    [],
  );

  const setHover = useCallback((v: boolean) => {
    hoveringRef.current = v;
    setHovering(v);
    // Re-evaluate so a hover that begins without pointer movement still morphs.
    evaluateRef.current();
  }, []);

  useLayoutEffect(() => {
    evaluateRef.current();
  }, [hovering, phase]);

  return (
    <div className="intro" ref={root} data-exiting={exiting}>
      <div className="intro-surface" />
      <div className="intro-curtain" />
      <div className="intro-grain" aria-hidden="true" />

      <div className="intro-shell">
        <div className="intro-center">
          {phase === "live" ? (
            <div className="intro-mark" ref={markRef}>
              <MorphMark ref={pathRef} className="intro-mark__svg" />
            </div>
          ) : (
            <LetterCubes word={WORD} active={phase === "cubes"} onComplete={handleCubesDone} />
          )}

          {/* Real DOM copy, not baked into the SVG: indexable, selectable, and
              it keeps the intro readable with JS or WebGL unavailable. */}
          <div className="intro-meta" data-visible={phase === "live"}>
            <p className="intro-meta__name">
              {studio.name}
              <sup aria-hidden="true">®</sup>
            </p>
            <p className="intro-meta__about">{studio.about}</p>
          </div>

          <h1 className="intro-sr">{WORD} — independent game studio</h1>
        </div>

        {/* During the dissolve the button is inert: it is fading out anyway, and
            a stray click must not restart the exit or move focus to nothing. */}
        <button
          ref={btnRef}
          type="button"
          className="intro-enter"
          data-filled={hovering}
          aria-hidden={exiting}
          disabled={exiting}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onClick={handleEnter}
          style={{ opacity: phase === "live" ? 1 : 0 }}
          tabIndex={phase === "live" ? 0 : -1}
        >
          <span className="intro-enter__fill" ref={fillRef} />
          <span className="intro-enter__label">Enter</span>
          <span className="intro-enter__arrow" aria-hidden="true">
            ↘
          </span>
        </button>

        <p className="intro-audio">
          <button type="button" className="intro-audio__btn" onClick={() => setMuted((m) => !m)}>
            {muted ? "Enter without audio" : "Enter with audio"}
          </button>
        </p>
      </div>
    </div>
  );
}