"use client";

import { useMemo, useState } from "react";
import { games } from "@/content/site";
import { useTabVisible } from "@/features/apply/ApplySections";
import "../apply/apply.css";
import "./games.css";

/**
 * Selected games, after the reference: centred title, filter pills with
 * counts, a two-column card grid. Thumbs are deep-teal gradients with a fat
 * numeral — the repo ships no cover art, and a fake photo would be worse
 * than honest type. Live only once the dive has settled.
 */
export function GamesSection() {
  const visible = useTabVisible("games");
  const [filter, setFilter] = useState("All");

  const pills = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games) for (const genre of g.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    return [
      { label: "All", count: games.length },
      ...[...counts.entries()].map(([label, count]) => ({ label, count })),
    ];
  }, []);

  // Filters only earn their place once there is something to choose between.
  // A single-genre catalogue would render one useless pill over one card.
  const showFilters = pills.length > 2;

  const shown =
    !showFilters || filter === "All"
      ? games
      : games.filter((g) => g.genres.includes(filter));

  return (
    <section id="games" className="tab-sec games-sec" data-visible={visible} aria-label="Games">
      <div className="tab-inner games-inner" data-scrollable>
        <h2
          className="slide games-title"
          style={{ "--from": -1, "--i": 0 } as React.CSSProperties}
        >
          {/* A plural heading over one card would be a small lie. */}
          {games.length === 1 ? "Our first game" : "Selected Games"}
        </h2>

        {showFilters && (
          <div
            className="slide games-pills"
            role="group"
            aria-label="Filter by genre"
            style={{ "--from": 1, "--i": 1 } as React.CSSProperties}
          >
            {pills.map((p) => (
              <button
                key={p.label}
                type="button"
                className="games-pill"
                data-active={filter === p.label}
                onClick={() => setFilter(p.label)}
              >
                {p.label}
                <sup>{p.count}</sup>
              </button>
            ))}
          </div>
        )}

        <ul className="games-grid" data-count={shown.length}>
          {shown.map((g, i) => (
            <li
              key={g.slug}
              className="games-card slide"
              style={{ "--from": i % 2 === 0 ? -1 : 1, "--i": 2 + i } as React.CSSProperties}
            >
              <article>
                <div className="games-thumb" data-hue={i % 4} aria-hidden="true">
                  <span className="games-thumb__num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="games-thumb__glow" />
                </div>
                <div className="games-card__row">
                  <div>
                    <h3 className="games-card__title">{g.title}</h3>
                    <p className="games-card__tags">
                      {g.genres.join(", ")} · {g.year}
                    </p>
                  </div>
                  <span className="games-card__arrow" aria-hidden="true">
                    ↘
                  </span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
