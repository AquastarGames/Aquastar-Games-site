/**
 * Reads design tokens for the WebGL layer.
 *
 * globals.css states the rule this file exists to keep: tokens are CSS custom
 * properties "so WebGL materials can read the exact same values via
 * getComputedStyle — the DOM and the scene never drift apart".
 *
 * A hard-coded hex in a material is the exact drift that comment warns about:
 * the theme changes, the canvas does not, and the headline disappears into the
 * background with no typecheck and no error.
 *
 * Usage: read once per theme, not per frame — getComputedStyle forces a style
 * recalculation and calling it inside useFrame would cost more than the shader.
 */

const FALLBACKS: Record<string, string> = {
  "--aq-paper": "#f4efe7",
  "--aq-surface": "#fbf8f3",
  "--aq-deep": "#e9e1d5",
  "--aq-ink": "#17130f",
  "--aq-muted": "#5f584f",
  "--aq-accent": "#1f5fa8",
  "--aq-tide": "#0a6b57",
  "--aq-ember": "#b4441c",
  /** Display face, shared with .hero__title so the DOM copy and the canvas
      texture are typeset by the same stack. */
  "--aq-display": '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
};

export function readToken(name: string): string {
  if (typeof window === "undefined") return FALLBACKS[name] ?? "#000";
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // An empty result means the stylesheet has not applied yet (SSR, or a route
  // that does not import globals.css). The fallback keeps the scene renderable.
  return value || FALLBACKS[name] || "#000";
}