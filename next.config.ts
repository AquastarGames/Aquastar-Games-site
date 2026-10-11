import type { NextConfig } from "next";

/**
 * GitHub Pages runs no Node server, so the Pages build must be a static export.
 * DEPLOY_TARGET=pages switches that on; everything else keeps the normal server
 * build so one repo still deploys to Vercel (or `next start`) unchanged.
 *
 * Pages also serves a project site from https://<user>.github.io/<repo>/, so
 * that build needs a basePath. The workflow feeds NEXT_BASE_PATH in from
 * actions/configure-pages, which resolves it to "" for a user/org site and
 * "/<repo>" for a project site — so nothing here hard-codes a repo name.
 */
const isPages = process.env.DEPLOY_TARGET === "pages";
const basePath = isPages ? (process.env.NEXT_BASE_PATH ?? "") : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // trailingSlash makes Next emit /privacy/index.html instead of
  // /privacy.html. Pages resolves the directory URL natively; the .html form
  // needs a server rewrite that Pages does not have.
  ...(isPages ? { output: "export", trailingSlash: true } : {}),

  ...(basePath ? { basePath } : {}),

  experimental: {
    // three is optimised automatically by Next; drei is not, so list it.
    optimizePackageImports: ["@react-three/drei"],
  },

  images: {
    formats: ["image/avif", "image/webp"],
  },

  // headers() is served by the Next server, so it is unsupported under
  // output: "export" — the build fails on it. Pages applies its own cache
  // headers, and there is no next.config way to change them.
  ...(isPages
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/assets/models/:path*",
              headers: [
                { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
              ],
            },
            {
              source: "/assets/textures/:path*",
              headers: [
                { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
              ],
            },
            {
              source: "/assets/hdris/:path*",
              headers: [
                { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
              ],
            },
            {
              source: "/vendor/:path*",
              headers: [
                // Self-hosted decoders: your pipeline must not depend on a third-party CDN.
                { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;