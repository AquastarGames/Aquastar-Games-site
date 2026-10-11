import { create } from "zustand";

export type GameStatus = "announced" | "in-development" | "early-access" | "released";

export interface Game {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  status: GameStatus;
  year: number;
  platforms: string[];
  genres: string[];
  cover: string;
  /** GLB for the interactive hero treatment on the game card. */
  model?: string;
  trailer?: string;
  links?: { label: string; href: string }[];
}

/** Camera journey stops: hero → games → torii faces → high orbit. */
export type JourneySection = "index" | "games" | "support" | "testers" | "about";

interface SiteState {
  activeGame: string | null;
  quality: "low" | "medium" | "high" | "ultra";
  reducedMotion: boolean;
  sceneReady: boolean;
  audioMuted: boolean;
  /** Scroll journey: hero → faces of the torii → inside the arena. */
  section: JourneySection;
  /**
   * Where the camera has actually ARRIVED (damped flight settled within
   * epsilon of the waypoint). Forms render only when `section` matches AND
   * `cameraAt` matches — a form never appears mid-flight.
   */
  cameraAt: JourneySection;
  /**
   * Whether the camera is physically below the mirror. Flipped from the
   * frame loop (DiveBlend) only on crossing — never per frame — so DOM
   * dressing (dive veil, header theme) tracks the water, not the tab:
   * it clears while surfacing instead of lingering to arrival.
   */
  submerged: boolean;

  setActiveGame: (slug: string | null) => void;
  setQuality: (q: SiteState["quality"]) => void;
  setReducedMotion: (v: boolean) => void;
  setSceneReady: (v: boolean) => void;
  toggleAudio: () => void;
  setSection: (s: SiteState["section"]) => void;
  setCameraAt: (s: SiteState["cameraAt"]) => void;
  setSubmerged: (v: boolean) => void;
}

/**
 * Deliberately tiny. Scene internals live in refs inside <Canvas>;
 * this store only carries cross-boundary state that both the DOM and the
 * WebGL layer need to agree on.
 *
 * Never put per-frame values (progress, velocity, uniforms) in here —
 * that re-renders the React tree 60x/sec for nothing.
 */
export const useSiteStore = create<SiteState>((set) => ({
  activeGame: null,
  quality: "high",
  reducedMotion: false,
  sceneReady: false,
  audioMuted: true,
  section: "index",
  cameraAt: "index",
  submerged: false,

  setActiveGame: (slug) => set({ activeGame: slug }),
  setQuality: (quality) => set({ quality }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  toggleAudio: () => set((s) => ({ audioMuted: !s.audioMuted })),
  setSection: (section) => set((s) => (s.section === section ? s : { section })),
  setCameraAt: (cameraAt) => set((s) => (s.cameraAt === cameraAt ? s : { cameraAt })),
  setSubmerged: (submerged) => set((s) => (s.submerged === submerged ? s : { submerged })),
}));