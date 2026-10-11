"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { menu } from "@/content/site";
import { navigateTo } from "@/features/header/SiteHeader";
import { MenuToggle } from "./MenuToggle";
import "./menu.css";

/**
 * The overlay menu: a right-hand panel at 40% of the viewport, per the
 * reference.
 *
 * Nothing is trapped and nothing is blocked — the page stays live underneath.
 * The only part of this that genuinely needs care is focus: while the panel is
 * closed its links sit off-screen but would still be tabbable, so the panel is
 * marked `inert`. React 19 accepts `inert` as a real boolean attribute.
 */
export function Menu() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  // Anchor destinations are in-page camera stops. The panel closes first so
  // the scroll target is measured cleanly, then the tab jump runs.
  const onNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (!href.startsWith("#")) return;
      e.preventDefault();
      close();
      requestAnimationFrame(() => navigateTo(href));
    },
    [close],
  );

  // Escape closes from anywhere, because focus may be on the body, a link, or
  // the toggle. Bound on the document rather than the panel for that reason.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <div id="aq-menu" className="menu-panel" data-open={open} inert={!open}>
        <nav className="menu-panel__nav" aria-label="Main">
          <ul className="menu-panel__list">
            {menu.items.map((item, i) => (
              <li
                key={item.href}
                className="menu-panel__item"
                // Stagger index, read by CSS. Not animation state — just an order.
                style={{ "--i": i } as React.CSSProperties}
              >
                <a
                  href={item.href}
                  className="menu-panel__link"
                  onClick={(e) => onNavClick(e, item.href)}
                >
                  <span className="menu-panel__num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="menu-panel__label">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="menu-panel__foot">
          {/*
            The legal documents, where the contact block used to be. These are
            real routes, so they navigate as pages — the panel's anchor handling
            (onNavClick) only applies to the `#` index stops above.
          */}
          <nav className="menu-panel__legal" aria-label="Legal">
            <p className="menu-panel__legal-label">Legal</p>
            <ul className="menu-panel__legal-list">
              {menu.legal.map((doc) => (
                <li key={doc.href}>
                  <Link className="menu-panel__legal-link" href={doc.href} onClick={close}>
                    {doc.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <ul className="menu-panel__socials">
            {menu.socials.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  className="menu-panel__social"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="menu-toggle-slot">
        <MenuToggle open={open} onToggle={toggle} />
      </div>
    </>
  );
}