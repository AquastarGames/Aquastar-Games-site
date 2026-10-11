"use client";

import { useCallback, useState } from "react";
import { heroEyebrow, heroHeadline } from "@/content/site";
import { navigateTo } from "@/features/header/SiteHeader";
import { PaperPlane } from "./PaperPlane";
import "./hero.css";

/**
 * The index hero.
 *
 * The headline is rendered TWICE, on purpose:
 *
 *  - as real DOM text (`.hero__title`) — always visible, indexable, readable
 *    with no WebGL, no JS-driven canvas, or a canvas that has not drawn yet;
 *  - as a texture on the WebGL plane, which crossfades the DOM copy out only
 *    once it reports that it has actually produced a frame.
 *
 * This is ARCHITECTURE §2.5 ("content is HTML, canvas is enhancement") applied
 * literally. The earlier version hid the DOM copy entirely, which meant a
 * single missed frame left the page with a CTA floating in an empty box.
 *
 * `hero__stage` reserves the plane's box, and the display font is awaited
 * before measuring, so nothing shifts when the texture resolves.
 *
 * The top bar lives in <SiteHeader /> now — one fixed bar shared by every
 * tab — so this section is only the centred stack, pushed below the bar.
 */
export function Hero() {
  const [canvasReady, setCanvasReady] = useState(false);
  const handleReady = useCallback(() => setCanvasReady(true), []);

  const onWork = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigateTo("#games");
  }, []);

  return (
    <section className="hero" id="top">
      <div className="hero__center">
        <p className="hero__eyebrow">{heroEyebrow}</p>

        <div className="hero__stage" data-canvas={canvasReady ? "ready" : "pending"}>
          <PaperPlane lines={heroHeadline} onReady={handleReady} />
          <h1 className="hero__title">
            {heroHeadline.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
        </div>

        <a className="hero__cta" href="#games" onClick={onWork}>
          View the game
          <span className="hero__cta-arrow" aria-hidden="true">
            ↘
          </span>
        </a>
      </div>

      <div className="hero__foot">
        <span className="hero__year">©2026</span>
      </div>
    </section>
  );
}
