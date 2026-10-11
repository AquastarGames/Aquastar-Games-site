import type { Game } from "@/store/site";

/**
 * Editorial content lives here, not in components.
 * Swap `games` for a Sanity/Contentful fetch later — the shape is the contract.
 *
 * Every string here is the studio's real published information. Nothing in this
 * file is placeholder: the catalogue is the actual shipping title, and the
 * contacts are the addresses the studio publishes. The legal documents that
 * describe this data live in `content/legal.ts`.
 */

export const studio = {
  name: "Aquastar Games",
  tagline: "Thoughtful games. Built to last.",
  /**
   * One sentence, deliberately. This string is set as the About orbit's lede —
   * heavy uppercase at up to 44px, 22ch measure — and again small under the
   * intro wordmark. A paragraph here fills the whole viewport and reads as a
   * wall, which is why the longer statement lives on the pages, not in here.
   */
  about:
    "Focused mobile games with clear rules, considered systems and a finish that rewards coming back.",
  /** Shown as the studio's character: number + label, no padding.
   *  Values stay short — the About orbit sets them at up to 110px across a
   *  quarter-width column, and a word like "Android" overflows into its
   *  neighbour there. The detail belongs in the label, at label size. */
  facts: [
    { num: "1", label: "Game in production" },
    { num: "1", label: "Store: Google Play" },
    { num: "0", label: "Player accounts" },
    { num: "100%", label: "Playable offline" },
  ],
  /** The support address the studio answers on. */
  supportEmail: "support@aquastargames.com",
  /** Testers have their own inbox, so programme mail never competes with bugs. */
  testersEmail: "testers@aquastargames.com",
  /** Telegram is where invites land fastest. */
  telegram: "https://t.me/aquastargames",
  telegramHandle: "@aquastargames",
};

export const games: Game[] = [
  {
    slug: "block-build-it-up",
    title: "Block: Build It Up",
    tagline: "A focused block puzzle built around clean decisions.",
    description:
      "Block: Build It Up is a focused block puzzle about reading the board, making space and improving one decision at a time. Short sessions, hand-crafted boards and enough depth to keep your next move interesting.",
    status: "released",
    year: 2026,
    platforms: ["Android"],
    genres: ["Puzzle"],
    // No cover art ships yet; the card falls back to a drawn thumb, which is
    // better than a broken image on a live page.
    cover: "/assets/covers/block-build-it-up.jpg",
    links: [
      { label: "Get it on Google Play", href: "#" },
      { label: "Read the Privacy Notice", href: "/privacy-notice" },
    ],
  },
];

export function getGame(slug: string) {
  return games.find((g) => g.slug === slug);
}

/**
 * The overlay menu behind the round button in the top-right.
 *
 * `items` are in-page camera stops on the index journey — `#` anchors, not
 * routes. The legal documents are real routes, so they live in `legal` and
 * navigate as pages (see ARCHITECTURE §8 — legal copy must stay indexable
 * rather than trapped behind the canvas).
 */
export const menu = {
  items: [
    { label: "Index", href: "#top" },
    { label: "Games", href: "#games" },
    { label: "About", href: "#about" },
    { label: "Support", href: "#support" },
    { label: "Testers", href: "#testers" },
  ],
  /** Shown in the panel's lower band, where the contact block used to sit. */
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Privacy Notice", href: "/privacy-notice" },
    { label: "Terms of Use", href: "/terms" },
  ],
  socials: [
    { label: "X", href: "https://x.com/aquastarstudio" },
    { label: "YouTube", href: "https://youtube.com/@aquastarstudio" },
    { label: "TikTok", href: "https://www.tiktok.com/@aquastarstudio" },
    { label: "Instagram", href: "https://www.instagram.com/aquastarstudio" },
    { label: "Telegram", href: "https://t.me/aquastargames" },
    { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61594178802154" },
  ],
  year: 2026,
};

/**
 * The index headline, as the wind-deformed paper plane.
 * Two lines: one canvas, one texture, one draw call.
 */
export const heroHeadline = ["Thoughtful games.", "Built to last."];

/** The small caps line above the headline, per the reference. */
export const heroEyebrow = "An independent game studio";