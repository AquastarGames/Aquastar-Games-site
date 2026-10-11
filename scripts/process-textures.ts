/**
 * Textures -> KTX2 (Basis Universal / ETC1S)
 *
 * WHY: a 2048x2048 PNG costs ~16MB of VRAM *regardless of file size*,
 * because the browser decompresses it fully onto the GPU. KTX2/ETC1S stays
 * compressed in VRAM. This is the single biggest VRAM win available.
 *
 * Requires the `toktx` binary from KTX-Software on PATH:
 *   https://github.com/KhronosGroup/KTX-Software/releases
 *
 * Usage:
 *   npx tsx scripts/process-textures.ts src/assets/raw public/assets/textures
 */

import sharp from "sharp";
import { execFile } from "node:child_process";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { extname, join, parse } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const RAW = process.argv[2] ?? "src/assets/raw";
const OUT = process.argv[3] ?? "public/assets/textures";
const SUPPORTED = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * ETC1S is lossy — one global compression level either wastes memory or
 * visibly degrades hero textures. Grade per asset instead.
 */
const PRESETS = {
  hero:    { max: 2048, quality: 255, uastc: false }, // camera-facing, keep quality
  surface: { max: 1024, quality: 190, uastc: false },
  small:   { max: 512,  quality: 128, uastc: false },
  normal:  { max: 1024, quality: 190, uastc: true },  // UASTC avoids gradient artefacts
} as const;

type PresetName = keyof typeof PRESETS;

function presetFor(name: string): PresetName {
  const n = name.toLowerCase();
  if (n.includes("normal") || n.includes("nrm") || n.includes("_n.")) return "normal";
  if (n.includes("hero") || n.includes("key")) return "hero";
  if (n.match(/(prop|small|noise|detail|particle)/)) return "small";
  return "surface";
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const tmp = join(OUT, ".tmp");
  await mkdir(tmp, { recursive: true });

  let count = 0;

  for await (const file of walk(RAW)) {
    if (!SUPPORTED.has(extname(file).toLowerCase())) continue;

    const { name } = parse(file);
    const preset = PRESETS[presetFor(name)];
    const finalPath = join(OUT, `${name}.ktx2`);
    const stagePath = join(tmp, `${name}.png`);

    // Downscale before encoding — encoding a 4K source at 4K is wasted time.
    await sharp(file)
      .resize({ width: preset.max, height: preset.max, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 6 })
      .toFile(stagePath);

    const args = [
      "--t2",
      ...(preset.uastc ? ["--uastc"] : ["--etc1s", "--qlevel", String(preset.quality)]),
      "--genmipmap",
      "--assign_oetf", "srgb",
      "--output", finalPath,
      stagePath,
    ];

    try {
      await exec("toktx", args);
      console.log(`[ktx2] ${name} -> ${presetFor(name)} (max ${preset.max}px)`);
    } catch (err) {
      console.warn(`[ktx2] SKIP ${name} — "toktx" not found on PATH.`);
      console.warn(`        Install KTX-Software or handle ${name} manually.`);
      void err;
      count++;
      continue;
    }

    await rm(stagePath, { force: true });
    count++;
  }

  await rename(tmp, join(OUT, ".tmp")).catch(() => rm(tmp, { recursive: true, force: true }));
  console.log(`\nDone. ${count} texture(s) -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});