"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The document rail: section list, current-clause marker, reading progress.
 *
 * Two things here that must not go through React state:
 *  - the progress bar, which changes on every scroll frame. It is written
 *    straight to a custom property (ARCHITECTURE §2.3 — per-frame values stay
 *    out of React), and CSS does the rest.
 *  - the active clause, which IS state, but it only flips when the section
 *    actually changes — not per frame.
 *
 * Positions are measured once and cached rather than read every frame, so a
 * scroll handler costs one subtraction per heading instead of a forced layout.
 */
export function LegalRail({ clauses }: { clauses: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(clauses[0]?.id ?? null);
  const trackRef = useRef<HTMLDivElement>(null);

  // A string, not the array: `clauses` is rebuilt on every parent render, and
  // depending on its identity would tear down and rebuild the listener each
  // time for no reason.
  const key = clauses.map((c) => c.id).join("|");

  useEffect(() => {
    if (clauses.length === 0) return;

    const els = clauses
      .map((c) => document.getElementById(c.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const track = trackRef.current;
    const article = document.querySelector<HTMLElement>(".legal-shell__article");
    let tops: number[] = [];
    let current = clauses[0]?.id ?? null;

    const measure = () => {
      tops = els.map((el) => el.getBoundingClientRect().top + window.scrollY);
    };

    const update = () => {
      // Active clause = the last heading that has passed under the sticky bar.
      //
      // Computed from cached offsets instead of IntersectionObserver, which
      // reports only *changes*: an instant jump (anchor link, restored scroll
      // position, scrollTo) can carry the reader past several headings without
      // any of them ever registering as intersecting, leaving the marker
      // stranded on the first section.
      const line = window.scrollY + 120; // clear of the sticky bar
      let next = current;
      for (let i = 0; i < tops.length; i++) {
        const top = tops[i];
        const id = clauses[i]?.id;
        if (top === undefined || id === undefined) break;
        if (top <= line) next = id;
        else break;
      }
      if (next !== current) {
        current = next;
        setActive(next);
      }

      if (track && article) {
        const span = article.offsetHeight - window.innerHeight;
        // span <= 0 means the article is no taller than the viewport: it is
        // either fully visible (read) or not yet reached (nothing).
        const p =
          span <= 0
            ? window.scrollY >= article.offsetTop
              ? 1
              : 0
            : (window.scrollY - article.offsetTop) / span;
        track.style.setProperty("--read", String(Math.min(1, Math.max(0, p))));
      }
    };

    const onResize = () => {
      measure();
      update();
    };

    measure();
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", onResize);
    };
    // `clauses` is intentionally not a dependency — `key` identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (clauses.length === 0) return null;

  return (
    <nav className="legal-rail" aria-label="Sections in this document">
      <p className="legal-rail__label">In this document</p>
      <div className="legal-rail__track" ref={trackRef}>
        <span className="legal-rail__progress" aria-hidden="true" />
        <ul className="legal-rail__list">
          {clauses.map((clause) => (
            <li key={clause.id}>
              <a
                className="legal-rail__link"
                href={`#${clause.id}`}
                data-active={active === clause.id}
                // Tells a screen reader which clause is in view; the links are
                // real targets, so it must not be `page` (that is on the footer).
                aria-current={active === clause.id ? "true" : undefined}
              >
                {clause.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}