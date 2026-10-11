import type { Tier } from "@/lib/quality";

/**
 * SCENE BUDGET PER TIER.
 *
 * The tier already exists in `lib/quality.ts` — what it has never had is
 * something concrete to spend. These are the knobs this scene reads.
 *
 * Rules that shaped the numbers:
 *  - Petals are the only per-frame GPU cost that scales with count, and they
 *    are the only thing the visitor will notice missing. They get the budget.
 *  - The planar reflection renders the ENTIRE scene a second time. It is the
 *    single most expensive thing here, so it is the first thing to go.
 *  - `bays` drops the most because the Colosseum reads as a Colosseum at 56
 *    bays from 230 units away; past that you are paying for curvature nobody
 *    can see through the mist.
 *
 * `reduced motion` locks the tier to `low` (see lib/quality.ts), so the first
 * row is also the static-frame configuration — a still photograph of the same
 * scene, not a degraded one.
 */

export interface SceneBudget {
  /** Instanced sakura petals. */
  petals: number;
  /** Arcade bays around the ellipse. Always even. */
  bays: number;
  /** Planar reflection target size in px. 0 disables the mirror entirely. */
  reflection: number;
  /** Fish-eye lens + paper grain + chromatic edge. */
  lens: boolean;
  /** Drifting mist sheets between the camera and the arena. */
  mist: number;
  /** Sakura trees on the far shore. */
  trees: number;
  /** Lanterns along the near shore. */
  lanterns: number;
  /** Enable weathered per-instance colour variation. */
  weathering: boolean;
}

export const BUDGETS: Record<Tier, SceneBudget> = {
  // On the low tier the petals are small and near-white: it is a still frame
  // and the budget is the phone's. The effect is not removed, it is quiet.
  low: { petals: 420, bays: 64, reflection: 0, lens: false, mist: 2, trees: 7, lanterns: 3, weathering: true },
  medium: { petals: 1600, bays: 80, reflection: 512, lens: true, mist: 3, trees: 11, lanterns: 6, weathering: true },
  high: { petals: 3200, bays: 96, reflection: 1024, lens: true, mist: 4, trees: 15, lanterns: 9, weathering: true },
  ultra: { petals: 4600, bays: 96, reflection: 1024, lens: true, mist: 4, trees: 18, lanterns: 12, weathering: true },
};

/**
 * The field of view the composition is actually DESIGNED at.
 *
 * The camera renders wider than this when the lens is on — see `renderFov`.
 * Framing numbers in Scene.tsx are tuned against 42, so changing this constant
 * moves the whole composition with it.
 */
export const DESIGN_FOV = 42;