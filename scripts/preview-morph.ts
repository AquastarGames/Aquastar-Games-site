/**
 * Renders static frames of the intro morph so the geometry can be verified
 * without a running rAF loop (background tabs suspend rAF, which freezes
 * GSAP-driven animation but not plain SVG painting).
 *
 * Usage:
 *   npx tsx scripts/preview-morph.ts
 *   open http://localhost:3000/morph-check.html
 */

import { writeFile, mkdir } from "node:fs/promises";
import {
  WORD_RINGS,
  RING_IS_HOLE,
  STAR_RING,
  STAR_CENTER,
  VIEW_W,
  VIEW_H,
} from "../src/features/intro/mark.paths.generated";

type Pt = [number, number];

const RING_POINTS = STAR_RING.length;
const LIGHT = "#f4e6e4";
const INK = "#14100e";

function ease(t: number) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function morphRings(t: number): string {
  const k = ease(t);
  const parts: string[] = [];
  for (let c = 0; c < WORD_RINGS.length; c++) {
    const ring = WORD_RINGS[c]!;
    const isHole = RING_IS_HOLE[c] === true;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = isHole ? STAR_CENTER : STAR_RING[i]!;
      const x = (a[0] + (b[0] - a[0]) * k).toFixed(2);
      const y = (a[1] + (b[1] - a[1]) * k).toFixed(2);
      parts.push((i === 0 ? "M" : "L") + x + "," + y);
    }
    parts.push("Z");
  }
  return parts.join("");
}

function bbox(ring: readonly Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function report(label: string, ring: readonly Pt[]) {
  const b = bbox(ring);
  const fits = b.minX >= -1 && b.minY >= -1 && b.maxX <= VIEW_W + 1 && b.maxY <= VIEW_H + 1;
  console.log(
    `${label.padEnd(10)} bbox=${b.w.toFixed(1)}x${b.h.toFixed(1)} ` +
      `x:[${b.minX.toFixed(1)},${b.maxX.toFixed(1)}] y:[${b.minY.toFixed(1)},${b.maxY.toFixed(1)}] ` +
      `${fits ? "IN VIEWBOX" : "*** OUT OF VIEWBOX ***"}`,
  );
  return fits;
}

const stages = [0, 0.25, 0.5, 0.75, 1];
const cards = stages
  .map(
    (t) => `
    <figure>
      <svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${VIEW_W}" height="${VIEW_H}" fill="${LIGHT}"/>
        <path d="${morphRings(t)}" fill="${INK}" fill-rule="nonzero"/>
      </svg>
      <figcaption>t = ${t.toFixed(2)}</figcaption>
    </figure>`,
  )
  .join("\n");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Aquastar mark morph</title>
<style>
  body{margin:0;background:${LIGHT};font:13px/1.4 ui-monospace,monospace;color:${INK}}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;padding:16px}
  figure{margin:0}
  svg{width:100%;height:auto;display:block;border:1px solid rgba(20,16,14,.15)}
  figcaption{padding-top:6px;letter-spacing:.1em;text-transform:uppercase;opacity:.6}
</style></head>
<body><div class="grid">${cards}</div></body></html>`;

await mkdir("public", { recursive: true });
await writeFile("public/morph-check.html", html, "utf8");

console.log(`viewBox ${VIEW_W}x${VIEW_H}, ${RING_POINTS} pts x ${WORD_RINGS.length} contours\n`);
let ok = true;
ok = report("WORD", WORD_RINGS.flat()) && ok;
ok = report("STAR", STAR_RING) && ok;
for (const t of stages) {
  const d = morphRings(t);
  const ring: Pt[] = [];
  for (const seg of d.split("M").filter(Boolean)) {
    for (const cmd of seg.replace("Z", "").split("L")) {
      if (!cmd) continue;
      const [x, y] = cmd.split(",").map(Number) as Pt;
      ring.push([x, y]);
    }
  }
  ok = report(`t=${t}`, ring) && ok;
}
console.log(`\n${ok ? "All frames inside the viewBox." : "GEOMETRY PROBLEM"}`);
console.log("Wrote public/morph-check.html");