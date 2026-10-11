import type { Metadata, Viewport } from "next";
import { CustomCursor } from "@/features/cursor/CustomCursor";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aquastargames.com";
/** "" normally, "/<repo>" on a GitHub Pages project site. See next.config.ts. */
const BASE_PATH = process.env.NEXT_BASE_PATH ?? "";
/*
 * The studio wordmark, self-hosted.
 *
 * It was sitting in public/fonts with no family name, so nothing could
 * reference it and every machine drew the brand with whatever the system
 * substituted for it.
 *
 * Declared here rather than in globals.css: the build's CSS minifier drops a
 * `src` it cannot resolve statically — including url(var(--aq-base)/...),
 * which is not valid CSS anyway — and the font then fails to load with no
 * error. Here the basePath is a plain string, so the URL is final on first pass.
 */
const WORDMARK_FACE = `
@font-face {
  font-family: "Aquastar Wordmark";
  src: url("${BASE_PATH}/fonts/wordmark.ttf") format("truetype");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
`;
const TITLE = "Aquastar Games";
const DESCRIPTION =
  "Aquastar is an independent game studio making focused mobile games with clear rules, considered systems and a finish that rewards coming back. Discover Block: Build It Up.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s — ${TITLE}`,
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Must track --aq-paper in globals.css, or the mobile browser chrome will
  // tint a light page.
  themeColor: "#f4efe7",
  width: "device-width",
  initialScale: 1,
  // Do NOT disable zoom — it is an accessibility regression.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inlined so the URL is resolved against BASE_PATH, not left to CSS. */}
        <style dangerouslySetInnerHTML={{ __html: WORDMARK_FACE }} />
        {/*
          Self-hosted Draco/KTX2 decoders.
          If these live on a third-party CDN, a CDN slowdown breaks your
          entire asset pipeline — the files being local does not save you.
        */}
        <link rel="preconnect" href="/" />
      </head>
      <body>
        {children}
        {/* Mounted at the root so the pointer is consistent across routes. */}
        <CustomCursor />
      </body>
    </html>
  );
}