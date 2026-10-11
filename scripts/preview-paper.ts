/**
 * Renders the paper headline to a static frame so the shader can be verified
 * without a running rAF loop (background tabs suspend rAF, which freezes
 * R3F — a WebGL bug and a WebGL no-op look identical from a screenshot).
 *
 * The escape hatch is that this harness calls renderer.render() ONCE, outside
 * any loop, so the frame is painted even in a suspended tab.
 *
 * The GLSL is lifted straight out of src/features/hero/shaders.ts rather than
 * copied, because a preview that duplicates the shader is a preview that lies.
 *
 * Usage:
 *   npx tsx scripts/preview-paper.ts
 *   open http://localhost:3000/paper-check.html?puffs=0
 *   open http://localhost:3000/paper-check.html?puffs=3
 */

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";

const shaderSrc = await readFile("src/features/hero/shaders.ts", "utf8");

function extract(name: string): string {
  const m = new RegExp(`export const ${name} = /\\* glsl \\*/ \`([\\s\\S]*?)\`;`).exec(shaderSrc);
  if (!m) throw new Error(`could not extract ${name} from shaders.ts`);
  // The TS template interpolates MAX_PUFFS; a raw regex copy leaves the literal
  // in the GLSL and fails with "invalid character '$'" — which looks exactly
  // like an app-side shader bug and is not one.
  return m[1].split("${MAX_PUFFS}").join("8");
}

const vertexShader = extract("paperVertexShader");
const fragmentShader = extract("paperFragmentShader");

// Self-hosted three. ARCHITECTURE §4: never lean on a third-party CDN.
// BOTH files are required: three.module.js re-exports from ./three.core.js, so
// copying only the entry point yields a module that cannot resolve its own
// import and never executes — which looks exactly like a silent WebGL failure.
await mkdir("public/vendor", { recursive: true });
for (const file of ["three.module.js", "three.core.js"]) {
  await copyFile("node_modules/three/build/" + file, "public/vendor/" + file);
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Paper headline check</title>
<style>
  html,body{margin:0;height:100%;background:#f4efe7;overflow:hidden}
  canvas{display:block}
  #hud{position:fixed;left:8px;top:8px;z-index:9;padding:8px 12px;
    background:#fff;color:#0a0;font:12px/1.5 ui-monospace,monospace;white-space:pre}
</style></head>
<body>
<div id="hud">booting…</div>
<script type="module">
import * as THREE from "/vendor/three.module.js";

const VERTEX = ${JSON.stringify(vertexShader)};
const FRAGMENT = ${JSON.stringify(fragmentShader)};

const q = new URLSearchParams(location.search);
const PUFFS = q.has("puffs") ? +q.get("puffs") : 0;
const W = +(q.get("w") || 1100);
const H = +(q.get("h") || 367);
const LOG = [];

const hud = document.getElementById("hud");
function flush() { hud.textContent = LOG.join("\\n"); }

try {
  run();
} catch (e) {
  LOG.push("THREW: " + (e && e.message ? e.message : String(e)));
  LOG.push(String((e && e.stack) || "").split("\\n").slice(0, 5).join("\\n"));
  flush();
}

function run() {

// --- the same constants textTexture.ts uses -------------------------------
const DISPLAY_FONT = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const LETTER_SPACING = -0.02;
const LINE_HEIGHT = 1.02;
const PADDING = 0.34;
const LINES = ["Deep worlds,", "slow burn."];

function drawHeadline(lines, targetWidth) {
  const probe = document.createElement("canvas").getContext("2d");
  const REF = 100;
  probe.font = "400 " + REF + "px " + DISPLAY_FONT;
  probe.letterSpacing = (LETTER_SPACING * REF) + "px";
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, probe.measureText(l).width);
  const padRef = PADDING * REF;
  const aspect = (widest + padRef * 2) / (lines.length * REF * LINE_HEIGHT + padRef * 2);

  const width = Math.round(targetWidth / 4) * 4;
  const height = Math.round(width / aspect / 4) * 4;
  const fontSize = (width / (widest + padRef * 2)) * REF;
  const lineHeightPx = fontSize * LINE_HEIGHT;

  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const ctx = c.getContext("2d");
  ctx.font = "400 " + fontSize + "px " + DISPLAY_FONT;
  ctx.letterSpacing = (LETTER_SPACING * fontSize) + "px";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const blockH = lines.length * lineHeightPx;
  const top = (height - blockH) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, (width - ctx.measureText(line).width) / 2, top + i * lineHeightPx + lineHeightPx * 0.76);
  });
  return { canvas: c, aspect };
}

const drawn = drawHeadline(LINES, 1600);
LOG.push("texture " + drawn.canvas.width + "x" + drawn.canvas.height + " aspect=" + drawn.aspect.toFixed(3));

const tex = new THREE.CanvasTexture(drawn.canvas);
tex.minFilter = THREE.LinearMipmapLinearFilter;
tex.magFilter = THREE.LinearFilter;
tex.generateMipmaps = true;
tex.needsUpdate = true;

// Is anything actually painted into the texture? A blank texture is the
// difference between "shader is broken" and "there is nothing to draw".
{
  const d = drawn.canvas.getContext("2d").getImageData(0, 0, drawn.canvas.width, drawn.canvas.height).data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 10) opaque++;
  LOG.push("texture alpha coverage: " + opaque + " sampled px");
}

// --- scene -----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
camera.position.set(0, 0, 5);

const MAX_PUFFS = 8;
const uniforms = {
  uTime:    { value: 0 },
  uAmp:     { value: 0.085 },
  uStretch: { value: 0.055 },
  uFold:    { value: 0.012 },
  uRadius:  { value: 0.55 },
  uGain:    { value: 0.03 },
  uHalfSize:{ value: new THREE.Vector2(1, 1) },
  uSize:    { value: new THREE.Vector2(1, 1) },
  uMap:     { value: tex },
  uColor:   { value: new THREE.Color("#17130f") },
  uOpacity: { value: 1 },
  uPuffs:   { value: Array.from({ length: MAX_PUFFS }, () => new THREE.Vector4()) },
  uPuffShape:{ value: Array.from({ length: MAX_PUFFS }, () => new THREE.Vector4(1, 0, 0.18, 0)) },
};

const material = new THREE.ShaderMaterial({
  vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});

// The same contain-fit the component performs every frame.
const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
const halfW = halfH * camera.aspect;
const MARGIN = 0.94;
let pw = halfW * 2 * MARGIN;
let ph = pw / drawn.aspect;
if (ph > halfH * 2 * MARGIN) { ph = halfH * 2 * MARGIN; pw = ph * drawn.aspect; }
uniforms.uSize.value.set(pw, ph);
uniforms.uHalfSize.value.set(pw / 2, ph / 2);
uniforms.uAmp.value = ph * 0.085;
uniforms.uRadius.value = Math.max(pw, ph) * 0.55;
LOG.push("plane " + pw.toFixed(2) + " x " + ph.toFixed(2) + " world units");

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), material);
mesh.scale.set(pw, ph, 1);
scene.add(mesh);

// Puffs, in WORLD units, spread across the plane — the coordinate space the
// shader now works in.
for (let i = 0; i < Math.min(PUFFS, MAX_PUFFS); i++) {
  const t = (i + 1) / (Math.min(PUFFS, MAX_PUFFS) + 1);
  uniforms.uPuffs.value[i].set(
    -pw / 2 + pw * t,
    (i % 2 ? 1 : -1) * ph * 0.12,
    0.12 + i * 0.06,
    1.0,
  );
  uniforms.uPuffShape.value[i].set(1, 0, 0.26, 0);
}
LOG.push("puffs spawned: " + Math.min(PUFFS, MAX_PUFFS));

// Compile once, synchronously, and report. A silent link failure here is the
// single most common way a shader "works fine" and renders nothing.
try {
  renderer.render(scene, camera);
  LOG.push("render: ok");
} catch (e) {
  LOG.push("render: THREW " + e.message);
}
const gl = renderer.getContext();
LOG.push("gl error: " + gl.getError());

// Count how much of the framebuffer the sheet actually covers.
{
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let lit = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 8) lit++;
  LOG.push("painted coverage: " + (100 * lit / (W * H)).toFixed(2) + "% of frame");
}

flush();
}
</script>
</body></html>`;

await writeFile("public/paper-check.html", html, "utf8");
console.log("Wrote public/paper-check.html and public/vendor/three.module.js");
console.log("  http://localhost:3000/paper-check.html?puffs=0");
console.log("  http://localhost:3000/paper-check.html?puffs=4");