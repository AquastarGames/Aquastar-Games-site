import Link from "next/link";
import { legalDocs, type LegalBlock, type LegalDoc } from "@/content/legal";
import { LegalRail } from "./LegalRail";
import "./legal.css";

/**
 * The shared legal document page.
 *
 * One component for all three documents — they differ only in content, and the
 * chrome (bar, hero, rail, cross-links) should never drift between them.
 */

/**
 * Inline emphasis parser.
 *
 * The legal copy is authored as plain strings with three markers — `**bold**`,
 * `` `code` `` and `[text](href)`. Parsing them here keeps `content/legal.ts`
 * readable and greppable while rendering to real elements: headings stay in the
 * document outline and links are real links the crawler follows.
 *
 * Deliberately not `dangerouslySetInnerHTML` — that would hand a CMS (or a typo)
 * the ability to inject markup. External hrefs open in a new tab with
 * `rel="noopener"`; internal hrefs use next/link.
 */
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (!part) return null;

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }

    // Named groups plus a presence check: under `noUncheckedIndexedAccess` a
    // destructured group is `string | undefined`, and asserting it away would
    // hide a genuine parse failure.
    const link = /^\[(?<label>[^\]]+)\]\((?<href>[^)]+)\)$/.exec(part);
    const label = link?.groups?.label;
    const href = link?.groups?.href;
    if (label && href) {
      // Absolute URLs leave the site; everything else stays in-app.
      if (/^https?:\/\//i.test(href)) {
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        );
      }
      return (
        <Link key={i} href={href}>
          {label}
        </Link>
      );
    }

    return <span key={i}>{part}</span>;
  });
}

/** Section headings carry their own numbering ("1. Scope…"), so the id is
 *  derived from that number rather than the prose. */
function sectionId(text: string) {
  const number = /^(\d+)\./.exec(text)?.[1];
  return number ? `section-${number}` : `section-${text.slice(0, 24)}`;
}

function MetaValue({ text }: { text: string }) {
  return <>{renderInline(text)}</>;
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  // The rail lists only the numbered clauses — the short notice has four, the
  // full policy eleven. Everything a reader might want to jump to.
  // The predicate is required: `filter` alone does not narrow the union, and
  // `ul`/`p` blocks have no `text`.
  const clauses = doc.sections
    .filter((s): s is Extract<LegalBlock, { kind: "h3" }> => s.kind === "h3")
    .map((s) => ({ id: sectionId(s.text), label: s.text }));

  return (
    <div className="legal">
      <div className="legal-bar">
        <Link className="legal-bar__brand" href="/">
          Aquastar Games<sup aria-hidden="true">®</sup>
        </Link>
        <Link className="legal-bar__back" href="/">
          <span aria-hidden="true">←</span> Back to the studio
        </Link>
      </div>

      <header className="legal-hero">
        <div className="legal-hero__inner">
          <p className="legal-kicker">{doc.kicker}</p>
          <h1 className="legal-title">{doc.title}</h1>
          <p className="legal-standfirst">{doc.standfirst}</p>
          <p className="legal-effective">{doc.effective}</p>
          {doc.meta.length > 0 && (
            <dl className="legal-meta">
              {doc.meta.map((row) => (
                <div className="legal-meta__row" key={row.label}>
                  <dt className="legal-meta__label">{row.label}</dt>
                  <dd className="legal-meta__value">
                    <MetaValue text={row.value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/*
            Summary cards sit inside the same hero block, not a second one —
            a sibling hero would repeat its padding and open an empty band
            across the page.
          */}
          {doc.summary.length > 0 && (
            <div className="legal-summary">
              {doc.summary.map((card) => (
                <div className="legal-summary__card" key={card.title}>
                  <h2 className="legal-summary__title">{card.title}</h2>
                  <p className="legal-summary__text">{card.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="legal-shell">
        {/* Client: owns the scroll-spy and the per-frame progress write. */}
        <LegalRail clauses={clauses} />

        <article className="legal-body legal-shell__article">
          {doc.sections.map((section, i) => {
            switch (section.kind) {
              case "h3":
                return (
                  <h3 id={sectionId(section.text)} key={i}>
                    {section.text}
                  </h3>
                );
              case "p":
                return <p key={i}>{renderInline(section.text)}</p>;
              case "ul":
                return (
                  <ul key={i}>
                    {section.items.map((item) => (
                      <li key={item}>{renderInline(item)}</li>
                    ))}
                  </ul>
                );
              case "callout":
                return (
                  <aside className="legal-callout" key={i}>
                    <p className="legal-callout__title">{section.title}</p>
                    <p className="legal-callout__text">{renderInline(section.text)}</p>
                  </aside>
                );
              default:
                return null;
            }
          })}
        </article>
      </div>

      <footer className="legal-foot">
        <div className="legal-foot__inner">
          <p className="legal-foot__label">Other legal documents</p>
          <nav className="legal-foot__nav" aria-label="Legal documents">
            {legalDocs.map((d) => (
              <Link
                className="legal-chip"
                key={d.slug}
                href={`/${d.slug}`}
                aria-current={d.slug === doc.slug ? "page" : undefined}
              >
                {d.label}
              </Link>
            ))}
          </nav>
          <p className="legal-foot__meta">
            © 2026 Aquastar Games. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}