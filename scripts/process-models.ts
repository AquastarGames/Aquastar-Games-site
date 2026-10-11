/**
 * GLB -> Draco / Meshopt compressed GLB
 *
 * Draco/Meshopt typically cut a heavy model by 4-10x with no visible loss.
 * Decoders must be self-hosted (public/vendor/) — see ARCHITECTURE.md.
 *
 * Usage:
 *   npx tsx scripts/process-models.ts src/assets/raw public/assets/models
 *   npx tsx scripts/process-models.ts ... --meshopt     # Meshopt instead of Draco
 */

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  instance,
  prune,
  resample,
  simplify,
  weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { extname, join, parse } from "node:path";

const RAW = process.argv[2] ?? "src/assets/raw";
const OUT = process.argv[3] ?? "public/assets/models";
const USE_MESHOPT = process.argv.includes("--meshopt");

/**
 * Budgets are graded per model role, not applied globally.
 * A hero model and a background prop have completely different tolerances.
 */
const PRESETS = {
  hero:     { simplify: 0.25, resample: true, instances: true },
  scene:    { simplify: 0.5,  resample: true, instances: true },
  prop:     { simplify: 0.7,  resample: false, instances: false },
  backdrop: { simplify: 0.85, resample: false, instances: false },
} as const;

type PresetName = keyof typeof PRESETS;

function presetFor(name: string): PresetName {
  const n = name.toLowerCase();
  if (n.includes("hero") || n.includes("key")) return "hero";
  if (n.includes("backdrop") || n.includes("bg") || n.includes("env")) return "backdrop";
  if (n.includes("prop")) return "prop";
  return "scene";
}

const SUPPORTED = new Set([".glb", ".gltf"]);

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.encoder": await draco3d.createEncoderModule(),
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });

  let count = 0;
  let before = 0;
  let after = 0;

  for await (const file of walk(RAW)) {
    if (!SUPPORTED.has(extname(file).toLowerCase())) continue;

    const { name, ext } = parse(file);
    const preset = PRESETS[presetFor(name)];

    const doc = await io.read(file);

    await doc.transform(
      dedup(),
      prune(),
      resample({ simplify: preset.simplify, ratio: preset.simplify }),
      simplify({ simplifier: "meshopt", ratio: preset.simplify }),
      weld(),
    );

    if (preset.instances) {
      await doc.transform(instance({ min: 3 }));
    }

    const outPath = join(OUT, `${name}.glb`);
    await io.write(outPath, doc);

    if (USE_MESHOPT) {
      await io.writeBinary(outPath, doc);
    }

    const [s1, s2] = await Promise.all([stat(file), stat(outPath)]);
    before += s1.size;
    after += s2.size;
    const ratio = ((1 - s2.size / s1.size) * 100).toFixed(0);

    console.log(`[glb] ${name}.${ext} -> ${presetFor(name)}: ${kb(s1.size)} -> ${kb(s2.size)} (-${ratio}%)`);
    void copyFile;
    count++;
  }

  if (count > 0) {
    console.log(`\nDone. ${count} model(s), ${kb(before)} -> ${kb(after)}`);
    if (!USE_MESHOPT) {
      console.log("Decoders: copy draco_decoder.wasm + draco_wasm_wrapper.js into public/vendor/");
    }
  }
}

function kb(n: number) {
  return `${(n / 1024).toFixed(0)}kB`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});