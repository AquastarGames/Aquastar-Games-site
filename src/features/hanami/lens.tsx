"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Uniform, Color } from "three";

/**
 * THE FISHEYE LENS.
 *
 * One pass, four effects, and the reason the scene does not look like a render
 * of a scene:
 *
 *  - Barrel distortion. The whole point of the brief. It is also what makes the
 *    edges of this composition work: the arena's ellipse bows outward exactly
 *    the way a 180-degree action camera sees it, and the waterline curves under
 *    the frame instead of running dead flat.
 *  - Chromatic separation that grows with radius, the way a real lens fails at
 *    the edge of its field. Zero in the centre, a visible colour fringe in the
 *    corners — it is the single strongest "this was photographed" cue there is.
 *  - A warm vignette. The palette is high-key, so a black vignette would look
 *    like a mistake; this one darkens toward the studio's own ink and stays
 *    inside the page's value range.
 *  - Paper grain. The studio is a paper studio; the scene is a print of the
 *    scene. A little grain kills the plastic sheen that every WebGL background
 *    has and nobody can name.
 *
 * WHY THE CAMERA NEEDS NO EXTRA FIELD OF VIEW
 * --------------------------------------------
 * Barrel distortion resamples INWARD at the edges (r_in = r_out * (1 - k r²)),
 * so every sample lands inside the rendered frame. The usual trick — render
 * wider than you display so the corners have something to show — is for pincushion
 * and barrel-of-the-other-sign. Here it would only shrink the composition.
 *
 * Tone mapping is NOT this pass's job: EffectComposer forces
 * `gl.toneMapping = NoToneMapping` while it is mounted, so the scene renders
 * linear and <ToneMapping mode={ACES_FILMIC} /> in Scene.tsx puts ACES back.
 * Without that the backdrop would come out a stop brighter than every other
 * canvas on the site.
 */

const lensFragmentShader = /* glsl */ `
  uniform float uDistortion;
  uniform float uAberration;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  uniform vec3 uInk;
  uniform vec3 uPaper;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Aspect-corrected, so the distortion is radial in PIXELS rather than in uv.
    // A distortion that stretches with the viewport aspect stops being a
    // circle, and a fish-eye that is not circular is just a warp.
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(p, p);

    // Barrel: sample inward with radius. See the note above.
    vec2 warped = p * (1.0 - uDistortion * r2);
    vec2 sampleUv = warped / vec2(aspect, 1.0) + 0.5;

    // Safety net. 'valid' is 1 across the whole frame in normal operation; if a
    // viewport ever makes the corners sample outside, fall back to the
    // undistorted pixel instead of clamping to a smeared edge.
    float valid = step(0.0, sampleUv.x) * step(sampleUv.x, 1.0) *
                  step(0.0, sampleUv.y) * step(sampleUv.y, 1.0);
    sampleUv = mix(uv, sampleUv, valid);

    // Chromatic separation, radial and radius-weighted.
    vec2 dir = normalize(p + vec2(1e-6));
    vec2 ab = dir * uAberration * r2 / vec2(aspect, 1.0);

    vec3 col;
    col.r = texture2D(inputBuffer, sampleUv + ab).r;
    col.g = texture2D(inputBuffer, sampleUv).g;
    col.b = texture2D(inputBuffer, sampleUv - ab).b;
    col = mix(inputColor.rgb, col, valid);

    // Vignette toward ink, not toward black — it stays inside the page's value
    // range instead of punching a dark hole in a paper-coloured design.
    float vig = smoothstep(1.35, 0.28, length(p) * uVignette);
    col = mix(uInk, col, mix(1.0, vig, 0.55));

    // Grain, biased to the shadows where film actually shows it.
    float n = hash(uv * vec2(aspect, 1.0) * 640.0 + uTime * 37.0) - 0.5;
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col += n * uGrain * mix(1.0, 0.45, luma);

    // Highlight rolloff into paper white. The scene's brightest values are the
    // sun bloom on the water and the sunlit mist; letting them clip to pure
    // white is what makes a WebGL background look like a screen and not a print.
    col = mix(col, uPaper, smoothstep(0.9, 1.0, luma) * 0.4);

    outputColor = vec4(col, inputColor.a);
  }
`;

export class HanamiLensEffect extends Effect {
  constructor({
    distortion = 0.19,
    // The first cut was 0.0052 and it put a visible red/cyan fringe on the
    // lantern in the bottom-left corner at arm's length. Real glass separates
    // colour at the very edge of the field and nowhere else; 0.0026 keeps the
    // effect where it belongs — a hint in the corners, invisible in the middle.
    aberration = 0.0026,
    vignette = 1.02,
    grain = 0.03,
    ink = "#17130f",
    paper = "#f4efe7",
  }: {
    distortion?: number;
    aberration?: number;
    vignette?: number;
    grain?: number;
    ink?: string;
    paper?: string;
  } = {}) {
    super("HanamiLens", lensFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      // CONVOLUTION: this effect reads the input buffer at offsets, so the pass
      // must own the buffer rather than share a merged one.
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ["uDistortion", new Uniform(distortion)],
        ["uAberration", new Uniform(aberration)],
        ["uVignette", new Uniform(vignette)],
        ["uGrain", new Uniform(grain)],
        ["uTime", new Uniform(0)],
        ["uInk", new Uniform(new Color(ink))],
        ["uPaper", new Uniform(new Color(paper))],
      ]),
    });
  }
}

/**
 * React wrapper.
 *
 * The instance is built once and handed to the composer as a primitive — the
 * composer walks its own R3F children looking for Effect instances, so that is
 * the only supported way to add a hand-written effect.
 *
 * The uniforms that never change are set once at construction. Only `uTime`
 * moves, and it is driven from R3F's clock rather than the library's internal
 * timer, so the grain and the scene are frame-locked even if a pass is
 * reordered or a frame is dropped.
 */
export function HanamiLens({
  distortion = 0.19,
  aberration = 0.0026,
  vignette = 1.02,
  grain = 0.03,
  ink = "#17130f",
  paper = "#f4efe7",
}: {
  distortion?: number;
  aberration?: number;
  vignette?: number;
  grain?: number;
  ink?: string;
  paper?: string;
}) {
  const effect = useMemo(
    () => new HanamiLensEffect({ distortion, aberration, vignette, grain, ink, paper }),
    [distortion, aberration, vignette, grain, ink, paper],
  );

  const time = useRef(effect.uniforms.get("uTime")!);
  useFrame((state) => {
    time.current.value = state.clock.elapsedTime;
  });

  useEffect(() => () => effect.dispose(), [effect]);

  return <primitive object={effect} />;
}