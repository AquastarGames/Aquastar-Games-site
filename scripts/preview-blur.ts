/**
 * Renders static frames of the intro exit dissolve so the blur geometry can be
 * verified without a running rAF loop (background tabs suspend rAF, which
 * freezes GSAP-driven animation but not plain CSS painting).
 *
 * The one thing this answers: `filter: blur()` samples PAST the element edge.
 * `.intro` is viewport-locked, so a blur with no overscan fades the frame and
 * exposes the page behind it. The timeline pays for the blur with a scale, and
 * this is how that trade is checked.
 *
 * Frames are rendered at true 1440x900 and driven by query params — scaling
 * them down in CSS would resample the exact edge falloff under test.
 *
 * Usage:
 *   npx tsx scripts/preview-blur.ts
 *   open http://localhost:3000/blur-check.html?b=16&s=1.14&p=0.7
 */

import { writeFile, mkdir } from "node:fs/promises";

/** Must match EXIT_BLUR / EXIT_SCALE in src/features/intro/Intro.tsx. */
const EXIT_BLUR = 16;
const EXIT_SCALE = 1.14;
const VIEW_W = 1440;
const VIEW_H = 900;

const LIGHT = "#f4e6e4";
const INK = "#14100e";
const GRAPHITE = "#4a4749";
const VOID = "#05070d";
const CHALK = "#e8ecf2";

const GRAIN =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

/**
 * A faithful subset of intro.css plus the index that sits behind it during the
 * dissolve. Only what the blur actually has to chew on is reproduced.
 */
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Aquastar exit dissolve</title>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:${VOID};font:13px/1.4 ui-monospace,monospace}
  /* The index, mounted behind the intro while it dissolves. */
  #index{position:fixed;inset:0;display:grid;place-items:center;
    background:${VOID};color:${CHALK};font-size:34px;letter-spacing:.02em}

  /* The intro window: viewport-locked, exactly like .intro. Fixed matters for
     the check — a fixed box scaled past the viewport must not create
     scrollbars, and this harness would not reproduce that if it were absolute. */
  #intro{position:fixed;inset:0;overflow:hidden;transform-origin:50% 50%;
    backface-visibility:hidden;will-change:filter,transform,opacity}
  #surface{position:fixed;inset:0;background:${LIGHT}}
  #grain{position:fixed;inset:0;opacity:.2;mix-blend-mode:multiply;
    background-image:${GRAIN};background-size:180px 180px}
  #shell{position:fixed;inset:0;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:clamp(28px,5vh,56px);color:${INK}}
  #mark{width:min(86vw,900px);aspect-ratio:1000/300}
  #about{margin-top:clamp(20px,3.4vh,40px);text-align:center;max-width:46ch;
    color:${GRAPHITE};font-size:15px;line-height:1.65}
  #pill{position:relative;display:inline-flex;align-items:center;gap:10px;
    padding:14px 30px;border-radius:999px;background:#fff;color:${INK};
    font-size:15px;font-weight:600}
  #hud{position:fixed;top:8px;left:8px;padding:6px 10px;
    background:rgba(0,0,0,.8);color:#7ee787;font-size:12px;letter-spacing:.06em;z-index:9}
</style></head>
<body>
  <div id="index">Aquastar Games — site begins here</div>
  <div id="intro">
    <div id="surface"></div>
    <div id="grain"></div>
    <div id="shell">
      <div id="mark">
        <svg viewBox="0 0 1000 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
          <path d="M60,60 L200,60 L340,240 L270,240 L130,60 M420,60 L560,60 L640,150 L720,60 L860,60 L720,200 L860,240 L700,240 L640,190 L580,240 L420,240 Z"
            fill="none" stroke="${INK}" stroke-width="26" stroke-linejoin="round"/>
        </svg>
      </div>
      <div id="about">We are an independent studio of nineteen people across four time zones.</div>
      <div id="pill">Enter &#8600;</div>
    </div>
  </div>
  <div id="hud"></div>
<script>
  // Defaults to the shipped end-state; ?b= &s= &o= explore the trade.
  var q = new URLSearchParams(location.search);
  var b = q.has("b") ? +q.get("b") : ${EXIT_BLUR};
  var s = q.has("s") ? +q.get("s") : ${EXIT_SCALE};
  var o = q.has("o") ? +q.get("o") : 1;

  var intro = document.getElementById("intro");
  intro.style.filter = "blur(" + b + "px)";
  intro.style.transform = "scale(" + s + ")";
  intro.style.opacity = o;

  // A blur kernel spreads roughly 3 sigma past the element edge. Anything
  // between the edge and 3*blur px of overscan shows the page behind.
  var overscanPx = Math.min(VIEW_W, VIEW_H) * (s - 1) / 2;
  var need = 3 * b;
  document.getElementById("hud").textContent =
    "blur " + b.toFixed(1) + "px  scale " + s.toFixed(2) +
    "  |  overscan " + overscanPx.toFixed(0) + "px  needs " + need.toFixed(0) + "px  ->  " +
    (overscanPx >= need ? "COVERED" : "*** EDGE WILL SHOW ***");
</script>
</body></html>`;

await mkdir("public", { recursive: true });
await writeFile("public/blur-check.html", html, "utf8");

const overscan = Math.min(VIEW_W, VIEW_H) * (EXIT_SCALE - 1) / 2;
const needed = 3 * EXIT_BLUR;
console.log(`Shipped dissolve: blur(${EXIT_BLUR}px) scale(${EXIT_SCALE})`);
console.log(`overscan on the short axis: ${overscan.toFixed(0)}px`);
console.log(`3-sigma spread needed:     ${needed.toFixed(0)}px`);
console.log(overscan >= needed ? "COVERED" : "*** EDGE WILL SHOW ***");
console.log("\nWrote public/blur-check.html");
console.log(`  http://localhost:3000/blur-check.html?b=${EXIT_BLUR}&s=${EXIT_SCALE}`);
console.log(`  http://localhost:3000/blur-check.html?b=${EXIT_BLUR}&s=1&o=1   (no overscan — the failure case)`);