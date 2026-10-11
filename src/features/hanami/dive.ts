/**
 * Dive environment state, shared GL → GL without React.
 *
 * `cameraDepth.y` is written every frame by CameraRig; readers (fog blend,
 * ceiling, bubbles, land visibility) derive everything from depth, so the
 * surface world is never touched — underwater owns its own background.
 */

/** Latest camera height, written by CameraRig each frame. */
export const cameraDepth = { y: 5 };

/**
 * Submersion factor: 0 above the mirror (+0.5 m), 1 fully below (−3 m).
 * Everything underwater keys off this — not off tab state — so the world
 * sinks into murk exactly while crossing, and the surface realm keeps its
 * colours untouched.
 */
export function diveK(y: number): number {
  return Math.min(1, Math.max(0, (0.5 - y) / 3.5));
}
