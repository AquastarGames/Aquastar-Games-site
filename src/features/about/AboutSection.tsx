"use client";

import { useEffect, useRef, useState } from "react";
import { studio } from "@/content/site";
import { useSiteStore } from "@/store/site";
import { aboutPFromEl, aboutProgress, beatForP } from "./aboutProgress";
import "../apply/apply.css";
import "./about.css";

/**
 * Orbit state for the section.
 *
 * One passive scroll listener writes the continuous progress into the shared
 * mutable (read every frame by the GL orbit — no React involved) and mirrors
 * only the discrete beat index into React state, so the tree re-renders at
 * most a handful of times per traverse instead of 60×/sec.
 */
function useAboutOrbitState() {
  const arrived = useSiteStore((s) => s.section === "about" && s.cameraAt === "about");
  const [beat, setBeat] = useState(() => beatForP(aboutProgress.p));

  useEffect(() => {
    const onScroll = () => {
      const el = document.getElementById("about");
      if (!el) return;
      const p = aboutPFromEl(el);
      aboutProgress.p = p;
      setBeat((prev) => {
        const next = beatForP(p);
        return next === prev ? prev : next;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { arrived, beat };
}

/**
 * One orbit stop: a fat typographic beat with no card behind it. Visible only
 * while the high camera stands inside its orbit window AND the beat is in
 * view. Between windows — only the turning arena.
 */
function Beat({
  index,
  state,
  from,
  children,
  label,
}: {
  index: number;
  state: { arrived: boolean; beat: number };
  from: -1 | 1;
  children: React.ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="about-stop"
      data-visible={state.arrived && state.beat === index && inView}
      style={{ "--from": from } as React.CSSProperties}
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function AboutSection() {
  const state = useAboutOrbitState();
  return (
    <section id="about" className="tab-sec about-sec" aria-label="About the studio">
      <div className="tab-inner">
        <Beat index={0} state={state} from={-1} label="Studio heading">
          <p className="slide-kicker">About · high above the arena</p>
          <h2 className="giant" aria-label="Small team. Clear standards. Games that last.">
            <span>Small team.</span>
            <span className="giant--right">Clear standards.</span>
            <span>Games that last.</span>
          </h2>
        </Beat>

        <Beat index={1} state={state} from={1} label="Studio story">
          <p className="about-lede">{studio.about}</p>
        </Beat>

        <Beat index={2} state={state} from={-1} label="Studio facts">
          <ul className="about-facts">
            {studio.facts.map((fact) => (
              <li className="about-fact" key={fact.label}>
                <span className="about-fact__num">{fact.num}</span>
                <span className="about-fact__label">{fact.label}</span>
              </li>
            ))}
          </ul>
        </Beat>
      </div>
    </section>
  );
}
