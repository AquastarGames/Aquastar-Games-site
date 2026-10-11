"use client";

import { useCallback } from "react";
import { menu } from "@/content/site";
import { scrollTo } from "@/lib/scroll";
import { useSiteStore, type JourneySection } from "@/store/site";
import "./site-header.css";

const ANCHORS: Record<string, JourneySection | "index"> = {
  top: "index",
  games: "games",
  about: "about",
  support: "support",
  testers: "testers",
};

/** Tab jump without an event (menu panel closes first, then this runs). */
export function navigateTo(href: string) {
  const id = href.slice(1);
  const section = ANCHORS[id];
  if (section) useSiteStore.getState().setSection(section);
  scrollTo(href === "#top" ? "body" : href);
}

/** Tab jump from a real anchor click. Non-anchors pass through untouched. */
export function useTabNav() {
  return useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#")) return;
    e.preventDefault();
    navigateTo(href);
  }, []);
}

/**
 * The persistent top bar, per the reference: brand left, tabs right, clear of
 * the round toggle. Fixed, so it reads identically on every tab — index,
 * games, about, support, testers.
 */
export function SiteHeader() {
  const onNav = useTabNav();
  const section = useSiteStore((s) => s.section);
  // The dive realm is dark teal — ink type drowns in it, so the bar flips
  // to paper while submerged (tracks the water, like the veil).
  const dark = useSiteStore((s) => s.submerged);

  return (
    <header className="site-header" data-theme={dark ? "dark" : "light"}>
      <a
        className="site-header__brand"
        href="#top"
        onClick={(e) => onNav(e, "#top")}
        aria-label="Aquastar Games — back to index"
      >
        Aquastar Games<sup aria-hidden="true">®</sup>
      </a>

      <nav className="site-header__nav" aria-label="Sections">
        <ul className="site-header__list">
          {menu.items.map((item) => {
            const id = item.href.slice(1);
            const active =
              (id === "top" && section === "index") || (id as string) === section;
            return (
              <li key={item.href}>
                <a
                  className="site-header__link"
                  href={item.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => onNav(e, item.href)}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
