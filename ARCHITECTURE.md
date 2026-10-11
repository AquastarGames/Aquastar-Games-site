# Aquastar Games — Architecture

Production-grade 3D studio site. This document is the contract; the code follows it.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router, RSC) | SEO + semantic HTML for studio pages; the marketing content must be indexable, not trapped in a canvas |
| 3D | **three 0.170** + **@react-three/fiber 9** + **drei 10** | R3F because >50% of the page is real React UI; same engine, declarative |
| Post | **@react-three/postprocessing** | Bloom / DOF / chromatic, tier-gated |
| Physics | **@react-three/rapier** | Only if a game showcase needs it — optional dep |
| Motion | **GSAP 3.12** + **ScrollTrigger** + **Observer** | Timelines, pin, scrub; Observer unifies wheel/touch/pointer input |
| Scroll | **Lenis 1.1** | Normalised scroll physics across browsers |
| State | **Zustand** (cross-boundary only) | Never per-frame state in React |
| Build | Vite? no — **Next** for the site; **Blender + gltf-transform** for assets | |

---

## 2. Non-negotiable architecture rules

1. **One clock.** `src/lib/loop.ts` pins Lenis, ScrollTrigger and the R3F render loop to `gsap.ticker`. No bare `requestAnimationFrame` anywhere else.
2. **One canvas.** A single fixed `<Canvas>` behind the document. Scenes swap by scroll segment, never per route, so the GL context survives navigation.
3. **Per-frame state stays out of React.** Scroll progress, velocities and uniforms live in refs / zustand-getters, not component state.
4. **`ssr: false` only in Client Components.** `three`/`gsap` imports never enter a Server Component file.
5. **Content is HTML.** Headings, nav, copy are real DOM. Canvas is enhancement.

---

## 3. Layer diagram

```
app/ (RSC)                 → semantic HTML, SEO, metadata
 ├─ features/preloader     → honest progress, failsafe
 └─ features/canvas
     └─ Experience         → single fixed <Canvas>, tier-driven renderer
         └─ segments/*     → Segment00..N, each with enter/scrub/update/teardown
             ├─ objects/*  → instanced meshes, GLB models
             └─ effects    → postprocessing chain

lib/loop.ts                → the clock + scroll normalisation (native ⇄ virtual)
lib/quality.ts             → adaptive tier manager (rolling frame-time, cooldown)
lib/scroll.ts              → declarative ScrollTrigger factories
store/site.ts              → cross-boundary state only
scripts/process-*.ts       → KTX2 / Draco / HDRI pipeline
```

---

## 4. Asset pipeline (the part that decides FPS)

Source → `scripts/` → `public/assets/`:

- **Textures → KTX2 (ETC1S/UASTC, Basis).** A 2048² PNG is ~16MB VRAM regardless of file size; KTX2 stays compressed. Graded per asset (`hero` / `surface` / `small` / `normal`).
- **Geometry → GLB with Draco or Meshopt.** Self-hosted decoders in `public/vendor/`.
- **HDRIs → prefiltered `.hdr`/`.exr`** for IBL.
- **Compression is graded, not global.** One setting either wastes memory or degrades hero assets.

Rules:
- Self-host every decoder. A third-party CDN slowdown has broken whole pipelines before.
- Decode off the main thread (`createImageBitmap`), upload during idle (`requestIdleCallback`), chunk large atlases (256² per frame).
- Raw `.blend` / source art never ships.

---

## 5. Performance model

Quality **tiers** (`lib/quality.ts`): `low / medium / high / ultra`. A rolling frame-time buffer steps quality up/down with a 2s cooldown so it never oscillates. Tiers change visual polish only — never the narrative.

Hard rules (always on):
- `dpr` clamped via `<Canvas dpr={profile.dpr}>` — max 2, low tier drops to 1.
- Render loop paused via `PauseWhenHidden` (IntersectionObserver).
- Animate only `transform` / `opacity`. Never `width`, `top`, `box-shadow` on scroll.
  - One documented exception: the intro exit dissolve animates `filter: blur()` on `.intro` for
    ~1.2s. Allowed because it is one-shot, runs on a layer promoted only for its own duration,
    and nothing else animates alongside it. `blur()` samples past the element edge, so the
    window scales up as it blurs to pay for the kernel with overscan — `EXIT_SCALE` must stay
    above `3 * EXIT_BLUR / min(viewport)` or the page shows through the frame.
    `npx tsx scripts/preview-blur.ts` renders the frames to check this.
- Reserve layout boxes (`aspect-ratio`) for every canvas → no CLS.
- `prefers-reduced-motion` → locked `low` tier, real static frames.
- Frustum/dynamic culling over static multi-tier LOD when the scene is camera-pathed.

---

## 6. Scroll ownership

Two modes, one normalised contract `sectionProgress(el) → 0..1`:

- **Native** — Lenis + ScrollTrigger. Content pages, SEO, anchors.
- **Virtual** — no DOM scroll; wheel/touch drive a virtual value that everything reads (camera, shaders, text). Cinematic sequences.

`setScrollMode()` swaps between them; ScrollTrigger refreshes. Segments never care which mode is active.

---

## 7. Preloader

Honest: weighted real signals (`document.fonts.ready`, `window.load`, `aq:scene-ready`), min 700ms display, 7s hard failsafe. A loader that can hang is worse than no loader.

---

## 8. Routes

```
/            studio hero — full-bleed scroll-driven 3D
/games       index of Game[] from src/content
/games/[slug] detail
/studio      about, team, press
/press       press kit + logo assets
/careers     open roles
/contact     form → Resend
/privacy     legal, RSC, static
/terms       legal, RSC, static
/privacy-notice  legal, RSC, static
/join        404 — styled, on-brand
```

The three legal routes are deliberately **separate pages, not journey tabs**.
The index locks scroll to one camera stop at a time and owns the WebGL context;
a policy document needs the opposite — a long, freely-scrolling, indexable column
that renders with no canvas at all (§2.5). They share `features/legal/LegalPage`
and their copy lives in `src/content/legal.ts`, so the chrome cannot drift between
documents. Copy is the studio's published legal wording — do not paraphrase it.

---

## 9. Pre-launch checklist

- [ ] `npm run typecheck` and `npm run build` clean
- [ ] One `requestAnimationFrame` in the codebase — the one in `loop.ts`
- [ ] Lighthouse: LCP < 2.5s, CLS ~0, INP good on a mid Android
- [ ] 60fps on a budget phone (measured, not vibes)
- [ ] `prefers-reduced-motion` renders static, readable pages
- [ ] Every canvas has a stable reserved box
- [ ] Tab-away / route-change leaks: no orphan RAF, no orphan listeners
- [ ] Decoders self-hosted
- [ ] Real content in HTML for SEO

---

## 10. Commands

```bash
npm run dev            # local
npm run typecheck
npm run build

npm run assets:textures   # src/assets/raw -> public/assets/textures
npm run assets:models     # .glb -> Draco/Meshopt in public/assets/models
npm run assets:hdris      # .hdr -> prefiltered IBL
```

KTX pipeline needs the `toktx` binary from KTX-Software on PATH.

---

## 11. Deployment

Two targets, one repo, selected by `DEPLOY_TARGET` in `next.config.ts`:

| | `next start` / Vercel | GitHub Pages |
| --- | --- | --- |
| Build | `next build` | `DEPLOY_TARGET=pages next build` → `out/` |
| Output | server | static export |
| `basePath` | none | `/<repo>` on a project site, `""` on a user site |
| Cache headers | `headers()` in `next.config.ts` | none — Pages sets its own |

Pages runs no Node server, so the build must be a static export; `headers()`,
`next/image` with the default loader, rewrites and redirects are all unavailable
there. `.github/workflows/deploy-pages.yml` builds `out/` on every push to `main`
and publishes it through `actions/deploy-pages`.

```bash
npm run preview   # serve out/ locally — next start does not exist in export mode
```

The Pages site must be created first (Settings → Pages → Source: GitHub Actions);
`actions/configure-pages` resolves `base_path` from it and fails without it.
Public assets referenced by hand (`public/fonts`, `public/vendor`) are not
rewritten for a basePath the way `_next/*` is — prefix them with `BASE_PATH`
in `app/layout.tsx`, or the build will emit a URL that 404s.