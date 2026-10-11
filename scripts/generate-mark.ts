/**
 * BUILD-TIME MARK GENERATOR
 *
 * Produces the two rings that the intro morphs between:
 *   WORD_PATH -> the word "AQUASTAR" as ONE closed ring
 *   STAR_PATH -> a minimalist 5-point star as ONE closed ring
 *
 * WHY THE STITCHING:
 * "AQUASTAR" is 7 glyph outlines + 3 counter-holes (A, Q, R). A naive
 * morph needs matching contour counts, which they do not have. Instead we
 * concatenate every contour into a single closed ring. The straight
 * connectors between contours have zero area, so under `fill` they are
 * invisible, and nonzero winding still renders holes correctly:
 *
 *   point inside a glyph  -> wound +1  -> filled
 *   point inside a hole   -> +1 and -1 -> 0 -> empty
 *   point between letters -> 0        -> empty
 *
 * Both shapes are then resampled to the SAME point count and anchored at the
 * same point, so the client lerp is a plain index-wise blend that can never
 * self-invert. flubber is deliberately not used: it discards everything but
 * the first outer contour when a path contains multiple shapes or holes.
 *
 * Usage:
 *   npx tsx scripts/generate-mark.ts path/to/font.ttf
 */

import opentype from "opentype.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type Pt = [number, number];

const WORD = "AQUASTAR";
/**
 * Points per contour.
 *
 * Each word contour is resampled independently to this count, so a letter
 * gets a fixed angular resolution regardless of how much of the total word
 * perimeter it happens to occupy. 120 is crisp for glyph outlines; the star is
 * only 10 vertices, so it is merely over-sampled.
 */
const RING_POINTS = 120;
const VIEW_W = 1000;
const VIEW_H = 300;
const STAR_INNER_RATIO = 0.44;
const STAR_FILL = 0.94; // star height as a fraction of the box height

const FONT_PATH = process.argv[2] ?? "public/fonts/wordmark.ttf";
const OUT_PATH = process.argv[3] ?? "src/features/intro/mark.paths.generated.ts";

/* ---------------------------------------------------------------- geometry */

function signedArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i]!;
    const [x2, y2] = r[(i + 1) % r.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function pointInRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pushQuad(cur: Pt[], from: Pt, c: Pt, to: Pt, steps = 14) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    cur.push([
      mt * mt * from[0] + 2 * mt * t * c[0] + t * t * to[0],
      mt * mt * from[1] + 2 * mt * t * c[1] + t * t * to[1],
    ]);
  }
}

function pushCubic(cur: Pt[], from: Pt, c1: Pt, c2: Pt, to: Pt, steps = 18) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    cur.push([
      a * from[0] + b * c1[0] + c * c2[0] + d * to[0],
      a * from[1] + b * c1[1] + c * c2[1] + d * to[1],
    ]);
  }
}

/** opentype commands -> closed polygonal rings. */
function commandsToRings(commands: opentype.PathCommand[]): Pt[][] {
  const rings: Pt[][] = [];
  let cur: Pt[] = [];
  let pos: Pt = [0, 0];

  for (const c of commands) {
    switch (c.type) {
      case "M":
        if (cur.length > 2) rings.push(cur);
        cur = [[c.x, c.y]];
        pos = [c.x, c.y];
        break;
      case "L":
        cur.push([c.x, c.y]);
        pos = [c.x, c.y];
        break;
      case "Q":
        pushQuad(cur, pos, [c.x1, c.y1], [c.x, c.y]);
        pos = [c.x, c.y];
        break;
      case "C":
        pushCubic(cur, pos, [c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]);
        pos = [c.x, c.y];
        break;
      case "Z":
        if (cur.length > 2) rings.push(cur);
        cur = [];
        break;
    }
  }
  if (cur.length > 2) rings.push(cur);
  return rings;
}

function bbox(ring: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Equal arc-length resampling. Guarantees a smooth, well-conditioned ring. */
function resample(ring: Pt[], n: number): Pt[] {
  const cum: number[] = [0];
  for (let i = 1; i <= ring.length; i++) {
    const [x1, y1] = ring[i - 1]!;
    const [x2, y2] = ring[i % ring.length]!;
    cum.push(cum[i - 1]! + Math.hypot(x2 - x1, y2 - y1));
  }
  const total = cum[cum.length - 1]!;
  if (total === 0) return Array.from({ length: n }, () => ring[0]!);

  const out: Pt[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (j < cum.length - 1 && cum[j]! < target) j++;
    const c0 = cum[j - 1]!;
    const c1 = cum[j]!;
    const t = c1 === c0 ? 0 : (target - c0) / (c1 - c0);
    const [x1, y1] = ring[(j - 1) % ring.length]!;
    const [x2, y2] = ring[j % ring.length]!;
    out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
  }
  return out;
}

/**
 * Rotate the ring so index 0 is the vertex whose bearing from (cx, cy) is
 * closest to `angle`.
 *
 * Anchoring each contour at its own top-left makes every contour arrive at the
 * star with a different rotational offset, which shows up as spikes part-way
 * through the morph. Anchoring radially from a shared centre lines them all up
 * on the same bearing, so they converge onto the star cleanly.
 */
function anchorByAngle(ring: Pt[], cx: number, cy: number, angle: number): Pt[] {
  const norm = (a: number) => {
    let v = a;
    while (v <= -Math.PI) v += Math.PI * 2;
    while (v > Math.PI) v -= Math.PI * 2;
    return v;
  };
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i]!;
    const delta = Math.abs(norm(Math.atan2(y - cy, x - cx) - angle));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return [...ring.slice(best), ...ring.slice(0, best)];
}

function starRing(points = 5, outer = 1, inner = STAR_INNER_RATIO): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/* ------------------------------------------------------------------ build */

async function main() {
  const fontPath = resolve(FONT_PATH);
  const buffer = await readFile(fontPath);
  // opentype.js 2.x: parse from a buffer (load() is deprecated/removed).
  const font = opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  );

  // Generous font size; we normalise into the viewBox anyway.
  const path = font.getPath(WORD, 0, 0, 512);
  const rings = commandsToRings(path.commands as opentype.PathCommand[]);
  if (rings.length === 0) throw new Error("No contours produced from font.");

  // A ring is a hole when its first vertex sits inside another ring.
  const holes = rings.filter((r) => rings.some((o) => o !== r && pointInRing(r[0]!, o)));
  const outers = rings.filter((r) => !holes.includes(r));

  // Nonzero fill: outers one way, holes the other way.
  for (const r of outers) if (signedArea(r) < 0) r.reverse();
  for (const r of holes) if (signedArea(r) > 0) r.reverse();

  const cx = (r: Pt[]) => bbox(r).minX + bbox(r).w / 2;
  outers.sort((a, b) => cx(a) - cx(b));

  /**
   * Each contour becomes its OWN closed subpath — they are deliberately NOT
   * stitched into one ring.
   *
   * Stitching looks correct on paper (the straight connectors have zero area),
   * but a rightward ray cast from inside a glyph crosses one such connector
   * exactly once, which flips the nonzero winding parity and punches white
   * gaps through the letters. Separate subpaths have no connectors at all, so
   * the word renders exactly as the font intended.
   *
   * Every contour then lerps toward the SAME star ring, so at t=1 all of them
   * coincide. Nonzero fill renders that coincidence as exactly one star.
   */
  const allRings = [...outers, ...holes];

  // Fit the word as a whole into the view box, centred.
  const wordBox = allRings.reduce<ReturnType<typeof bbox> | null>(
    (acc, r) => {
      const b = bbox(r);
      if (!acc) return b;
      const minX = Math.min(acc.minX, b.minX);
      const minY = Math.min(acc.minY, b.minY);
      const maxX = Math.max(acc.maxX, b.maxX);
      const maxY = Math.max(acc.maxY, b.maxY);
      return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    },
    null,
  )!;

  const wordScale = VIEW_W / wordBox.w;

  /**
   * ONE shared transform for every contour.
   *
   * Fitting each contour on its own would re-centre it and stack all the
   * letters on top of each other — the layout has to be preserved, so scale
   * and offset are derived from the union box and applied uniformly.
   */
  const offX = (VIEW_W - wordBox.w * wordScale) / 2 - wordBox.minX * wordScale;
  const offY = (VIEW_H - wordBox.h * wordScale) / 2 - wordBox.minY * wordScale;
  const place = ([x, y]: Pt): Pt => [x * wordScale + offX, y * wordScale + offY];

  // Radial anchor: every contour starts at the bearing closest to "up",
  // measured from the word's own centre. The star uses the same rule against
  // its own centre, so all contours converge on the star without rotation skew.
  const TOP = -Math.PI / 2;
  const rawCx = wordBox.minX + wordBox.w / 2;
  const rawCy = wordBox.minY + wordBox.h / 2;

  const wordRings: Pt[][] = allRings.map((r) =>
    resample(anchorByAngle(r, rawCx, rawCy, TOP), RING_POINTS).map(place),
  );
  // Holes are tracked so the client can collapse them instead of morphing
  // them into full-size stars — extra coincident rings read as jagged spikes
  // part-way through.
  const ringIsHole = allRings.map((r) => holes.includes(r));

  // Size the star off the word's cap height and centre it on the word.
  let starRingPts = starRing();
  {
    const b = bbox(starRingPts);
    const s = (VIEW_H * STAR_FILL) / b.h;
    // Centre using the box MINIMA, not the centre — the star's coordinates are
    // symmetric about 0, so using the centre here drops it out of the viewBox.
    const offX = (VIEW_W - b.w * s) / 2 - b.minX * s;
    const offY = (VIEW_H - b.h * s) / 2 - b.minY * s;
    // Anchor radially from the star's own centre.
    const sx = b.minX + b.w / 2;
    const sy = b.minY + b.h / 2;
    starRingPts = resample(
      anchorByAngle(starRingPts, sx, sy, TOP).map(([x, y]) => [x * s + offX, y * s + offY] as Pt),
      RING_POINTS,
    );
  }

  // Match the star's winding to the word's outers, or the blend twists.
  if (signedArea(starRingPts) < 0) starRingPts.reverse();

  const sb = bbox(starRingPts);
  const starCenter: Pt = [sb.minX + sb.w / 2, sb.minY + sb.h / 2];

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const fmt = (ring: Pt[]) =>
    `[${ring.map(([x, y]) => `[${r2(x)},${r2(y)}]`).join(",")}]`;

  const ts = `// AUTO-GENERATED by scripts/generate-mark.ts — do not edit by hand.
// Source font: ${FONT_PATH}
// Word: "${WORD}"  |  ${outers.length} outer contours + ${holes.length} counters
//
// WORD_RINGS holds each contour as its OWN closed subpath. They are not
// stitched: a connector between contours would flip nonzero winding parity
// where it crosses a glyph. Every contour lerps toward the same STAR_RING, so
// at t=1 they all coincide and nonzero fill renders exactly one star.

export const RING_POINTS = ${RING_POINTS};
export const VIEW_W = ${VIEW_W};
export const VIEW_H = ${VIEW_H};

export const WORD_RINGS: readonly (readonly [number, number][])[] = [
${wordRings.map((r) => `  ${fmt(r)},`).join("\n")}
];

/** Which WORD_RINGS entries are glyph counters (A/Q/R). These collapse to
 *  STAR_CENTER instead of morphing into the star. */
export const RING_IS_HOLE: readonly boolean[] = [
${ringIsHole.map((h) => `  ${h},`).join("\n")}
];

export const STAR_RING: readonly [number, number][] = ${fmt(starRingPts)};

export const STAR_CENTER: readonly [number, number] = [${r2(starCenter[0])}, ${r2(starCenter[1])}];
`;

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, ts, "utf8");

  console.log(`[mark] ${WORD} -> ${outers.length} outer + ${holes.length} counters`);
  console.log(`[mark] wrote ${OUT_PATH} (${RING_POINTS} pts x ${wordRings.length} contours)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});