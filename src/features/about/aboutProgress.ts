/**
 * Scroll progress through `#about`, shared DOM → GL without React.
 *
 * The About camera is scroll-driven (an orbit around the arena), so the frame
 * loop needs the progress every frame — zustand would re-render the tree
 * 60×/sec. This mutable is written by one passive scroll listener
 * (AboutSection) and read in Scene.tsx's useFrame. Plain numbers only.
 */
export const aboutProgress = { p: 0 };

/** Orbit stops where copy appears — matched to the three 115svh chapters. */
export const ABOUT_BEATS = [0.17, 0.5, 0.83] as const;

/** Half-width of each stop window, in progress units — wide enough to hold. */
export const BEAT_WINDOW = 0.22;

/** Nearest beat within its window, or -1 (deliberate silence between stops). */
export function beatForP(p: number): number {
  let best = -1;
  let bestD = BEAT_WINDOW;
  for (let i = 0; i < ABOUT_BEATS.length; i++) {
    const d = Math.abs(p - ABOUT_BEATS[i]!);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** 0 at the section's top edge hitting viewport top, 1 at its bottom. */
export function aboutPFromEl(el: HTMLElement): number {
  const total = Math.max(1, el.offsetHeight - window.innerHeight);
  return Math.min(1, Math.max(0, -el.getBoundingClientRect().top / total));
}
