/**
 * Draws the headline into a canvas and hands back a texture.
 *
 * Why a canvas instead of an SDF font atlas: the whole plane is one quad, so
 * whatever we upload is uploaded once. A 2048px canvas of white glyphs with an
 * alpha channel is ~1ms of GPU upload and needs no per-glyph geometry — which
 * matters because the shader is re-evaluating the entire sheet every frame.
 *
 * The canvas is measured BEFORE it is allocated so the plane geometry matches
 * the text's true aspect ratio. Guessing the aspect is how you end up with a
 * headline that is subtly letterboxed on one screen size and cropped on the next.
 */

/** Font stack for the paper plane. Override here and the whole hero follows. */
const FALLBACK_DISPLAY_FONT = "Georgia, 'Times New Roman', serif";

/** Tracking as a fraction of the font size. Positive letter-spacing. */
const LETTER_SPACING = -0.02;

/** Line height as a multiple of the font size. */
const LINE_HEIGHT = 1.02;

/**
 * Transparent margin around the glyphs, as a fraction of font size.
 *
 * The wind displaces vertices outward, and glyphs sitting on the texture edge
 * would get clipped by the plane border. A margin wider than the maximum
 * displacement means the sheet can stretch without ever shearing a letter off.
 */
const PADDING = 0.16;

/** Weight of the display face. */
const WEIGHT = 400;

export interface TextTextureResult {
  texture: HTMLCanvasElement;
  width: number;
  height: number;
  /** width / height — the plane geometry must match this exactly. */
  aspect: number;
  fontSize: number;
  lineHeightPx: number;
}

/** Rounds to a multiple of 4 so the mip chain does not resample awkwardly. */
function align4(n: number) {
  return Math.max(4, Math.round(n / 4) * 4);
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function measure(ctx: CanvasRenderingContext2D, lines: string[], fontSize: number, fontFamily: string) {
  ctx.font = `${WEIGHT} ${fontSize}px ${fontFamily}`;
  // letterSpacing is a canvas property in Chromium; harmless where unsupported.
  const tracking = LETTER_SPACING * fontSize;
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tracking}px`;
  }

  let widest = 0;
  for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width);
  return widest;
}

export function drawHeadline(
  lines: string[],
  targetWidth = 1600,
  /** Family list. Pass readToken("--aq-display") so the texture and the DOM
      headline are typeset by the same face. */
  fontFamily: string = FALLBACK_DISPLAY_FONT,
): TextTextureResult {
  // Pass 1: measure at a reference size to learn the aspect ratio.
  const probe = makeCanvas(8, 8).getContext("2d");
  if (!probe) throw new Error("2d context unavailable");

  const REF = 100;
  const textWidth = measure(probe, lines, REF, fontFamily);
  const padRef = PADDING * REF;
  const blockW = textWidth + padRef * 2;
  const blockH = lines.length * REF * LINE_HEIGHT + padRef * 2;
  const aspect = blockW / blockH;

  // Pass 2: allocate at the real size, scaled to the requested width.
  const width = align4(targetWidth);
  const height = align4(width / aspect);
  const fontSize = (width / blockW) * REF;
  const lineHeightPx = fontSize * LINE_HEIGHT;

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  ctx.clearRect(0, 0, width, height);
  ctx.font = `${WEIGHT} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const tracking = LETTER_SPACING * fontSize;
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tracking}px`;
  }

  lines.forEach((line, i) => {
    const w = ctx.measureText(line).width;
    const x = (width - w) / 2;
    // Centre the whole block vertically, then step down one line height.
    const blockHeight = lines.length * lineHeightPx;
    const top = (height - blockHeight) / 2;
    const baseline = top + i * lineHeightPx + lineHeightPx * 0.76;
    ctx.fillText(line, x, baseline);
  });

  return { texture: canvas, width, height, aspect, fontSize, lineHeightPx };
}