import { HanamiBackdrop } from "@/features/hanami/HanamiBackdrop";
import "./hanami-debug.css";

/**
 * TEMPORARY diagnostic route.
 *
 * The intro gate runs a 1.5 s GSAP dissolve before the index is reachable, and
 * in this environment that timeline advances at roughly a tenth of real time,
 * which makes it impossible to iterate on the backdrop by clicking through the
 * intro. This route mounts the backdrop directly so it can be seen and tuned.
 *
 * Delete this file when the work is done.
 */
export default function HanamiDebug() {
  return (
    <main className="theme-paper">
      <HanamiBackdrop />
    </main>
  );
}