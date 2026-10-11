/**
 * Tiny telemetry surface. No analytics vendor is wired up yet — this exists so
 * performance marks have a single home and a vendor can be dropped in later
 * without touching call sites.
 */

type Marks = Record<string, number>;

const marks: Marks = {};
let scrollReadyAt: number | null = null;

function push(entry: { name: string; value: number }) {
  try {
    performance.mark(entry.name);
  } catch {
    /* marks are best-effort; never throw from telemetry */
  }
  marks[entry.name] = entry.value;
}

export function mark(name: string, value = performance.now()) {
  push({ name, value });
}

export function markScrollReady() {
  scrollReadyAt = performance.now();
}

export function getMarks(): Marks {
  return { ...marks };
}

export function timeToScrollReady(): number | null {
  return scrollReadyAt;
}

/** Resolve once the main thread is idle — use for non-critical work. */
export function onIdle(fn: () => void, timeout = 2000) {
  if (typeof window === "undefined") return;
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(fn, { timeout });
  else setTimeout(fn, 1);
}