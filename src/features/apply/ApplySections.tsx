"use client";

import { useEffect, useState } from "react";
import { games, studio } from "@/content/site";
import { isProgrammaticNav } from "@/lib/scroll";
import { useSiteStore, type JourneySection } from "@/store/site";
import "./apply.css";

const SECTION_EL: Record<JourneySection, string> = {
  index: "top",
  games: "games",
  support: "support",
  testers: "testers",
  about: "about",
};

/**
 * No tab owns another tab's scroll.
 *
 * User scroll input never leaves the active tab: everywhere except the About
 * orbit it is swallowed outright (programmatic tab jumps still pass), and a
 * passive clamp snaps any stray position — momentum, keyboard jump — back to
 * the active tab's top. Inside About, scroll is free but fenced to About's
 * own bounds, where it rotates the high camera instead of changing tabs.
 *
 * Tall phone forms scroll inside their own [data-scrollable] well, which the
 * input guards below explicitly exempt.
 */
export function useJourneyScrollGuard() {
  useEffect(() => {
    const inWell = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.("[data-scrollable]");

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || inWell(e)) return;
      if (useSiteStore.getState().section !== "about") e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (inWell(e)) return;
      if (useSiteStore.getState().section !== "about") e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (useSiteStore.getState().section === "about") return;
      if (
        e.key === " " ||
        e.key === "PageDown" ||
        e.key === "PageUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        e.preventDefault();
      }
    };
    const onScroll = () => {
      if (isProgrammaticNav()) return;
      const section = useSiteStore.getState().section;
      if (section === "about") {
        const el = document.getElementById("about");
        if (!el) return;
        const min = el.offsetTop;
        const max = el.offsetTop + el.offsetHeight - window.innerHeight;
        if (window.scrollY < min) window.scrollTo({ top: min, behavior: "auto" });
        else if (window.scrollY > max) window.scrollTo({ top: max, behavior: "auto" });
        return;
      }
      const top = document.getElementById(SECTION_EL[section])?.offsetTop ?? 0;
      if (Math.abs(window.scrollY - top) > 2) window.scrollTo({ top, behavior: "auto" });
    };

    // Capture phase: beat any smooth-scroll library listening lower down.
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    document.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("wheel", onWheel, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
      document.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
}

/** Backwards-compatible alias. */
export const useIndexScrollLock = useJourneyScrollGuard;

/**
 * A tab's copy is live only when its camera has ARRIVED (arrival gate in
 * Scene.tsx) and the tab itself is in view — never mid-flight.
 */
export function useTabVisible(id: JourneySection) {
  const active = useSiteStore((s) => s.section === id && s.cameraAt === id);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = document.getElementById(SECTION_EL[id]);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [id]);
  return active && inView;
}

/**
 * The studio's real channels, stated before the form.
 *
 * A form that is the only way to reach a studio is a dead end for anyone who
 * would rather send a message — so the addresses and handles are printed, and
 * the form is the extra step rather than the only one.
 */
function ContactLines({
  rows,
}: {
  rows: { label: string; value: string; href?: string }[];
}) {
  return (
    <ul className="contact-lines">
      {rows.map((row) => (
        <li className="contact-line" key={row.label}>
          <span className="contact-line__label">{row.label}</span>
          {row.href ? (
            <a
              className="contact-line__value"
              href={row.href}
              {...(row.href.startsWith("http")
                ? { target: "_blank", rel: "noreferrer noopener" }
                : {})}
            >
              {row.value}
            </a>
          ) : (
            <span className="contact-line__value">{row.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function SupportForm() {
  const [sent, setSent] = useState(false);
  return (
    <form
      className="type-form"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div className="type-form__row">
        <div className="type-field">
          <label htmlFor="support-name">Name</label>
          <input id="support-name" name="name" autoComplete="name" placeholder="Mira K." required />
        </div>
        <div className="type-field">
          <label htmlFor="support-email">Email</label>
          <input
            id="support-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
      </div>
      <div className="type-form__row">
        <div className="type-field">
          <label htmlFor="support-game">Game</label>
          <select id="support-game" name="game" defaultValue={games[0]?.title}>
            {games.map((g) => (
              <option key={g.slug} value={g.title}>
                {g.title}
              </option>
            ))}
            <option value="other">Something else</option>
          </select>
        </div>
        <div className="type-field">
          <label htmlFor="support-topic">Topic</label>
          <select id="support-topic" name="topic" defaultValue="Bug report">
            <option>Bug report</option>
            <option>Progress / saves</option>
            <option>Advertising</option>
            <option>Press / business</option>
          </select>
        </div>
      </div>
      <div className="type-field">
        <label htmlFor="support-message">What happened?</label>
        <textarea
          id="support-message"
          name="message"
          placeholder="Where were you in the game, and what did you expect?"
          required
        />
      </div>
      {sent ? (
        <p className="type-form__done" role="status">
          Received — the support crew replies within two working days.
        </p>
      ) : (
        <button className="type-form__submit" type="submit">
          Send support request <span aria-hidden="true">↘</span>
        </button>
      )}
    </form>
  );
}

function TestersForm() {
  const [sent, setSent] = useState(false);
  return (
    <form
      className="type-form"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div className="type-form__row">
        <div className="type-field">
          <label htmlFor="testers-name">Name</label>
          <input id="testers-name" name="name" autoComplete="name" placeholder="Mira K." required />
        </div>
        <div className="type-field">
          <label htmlFor="testers-email">Email</label>
          <input
            id="testers-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
      </div>
      <div className="type-form__row">
        <div className="type-field">
          <label htmlFor="testers-platform">Platform</label>
          <select id="testers-platform" name="platform" defaultValue="Android">
            <option>Android</option>
            <option>Android tablet</option>
          </select>
        </div>
        <div className="type-field">
          <label htmlFor="testers-exp">Experience</label>
          <select id="testers-exp" name="experience" defaultValue="Played a lot, never tested">
            <option>Played a lot, never tested</option>
            <option>Tested 1–2 games</option>
            <option>Professional QA</option>
          </select>
        </div>
      </div>
      <div className="type-field">
        <label htmlFor="testers-why">Why you?</label>
        <textarea
          id="testers-why"
          name="why"
          placeholder="Two sentences: what do you break first in a new build?"
          required
        />
      </div>
      {sent ? (
        <p className="type-form__done" role="status">
          You are on the list — invites for the next closed playtest go out by email.
        </p>
      ) : (
        <button className="type-form__submit" type="submit">
          Apply as a tester <span aria-hidden="true">↘</span>
        </button>
      )}
    </form>
  );
}

export function SupportSection() {
  const visible = useTabVisible("support");
  return (
    <section
      id="support"
      className="tab-sec tab-sec--support"
      data-visible={visible}
      aria-label="Support"
    >
      <div className="tab-inner" data-scrollable>
        <p className="slide-kicker slide" style={{ "--from": -1, "--i": 0 } as React.CSSProperties}>
          Support · south face of the gate
        </p>
        <h2 className="giant" aria-label="Stuck in deep water?">
          <span className="slide" style={{ "--from": -1, "--i": 1 } as React.CSSProperties}>
            Stuck in
          </span>
          <span
            className="slide slide--right"
            style={{ "--from": 1, "--i": 2 } as React.CSSProperties}
          >
            deep water?
          </span>
        </h2>
        <div className="slide" style={{ "--from": -1, "--i": 3 } as React.CSSProperties}>
          <ContactLines
            rows={[
              { label: "Email", value: studio.supportEmail, href: `mailto:${studio.supportEmail}` },
              { label: "Telegram", value: studio.telegramHandle, href: studio.telegram },
              { label: "Reply time", value: "Usually within 1–2 business days" },
            ]}
          />
          <SupportForm />
        </div>
      </div>
    </section>
  );
}

export function TestersSection() {
  const visible = useTabVisible("testers");
  return (
    <section
      id="testers"
      className="tab-sec tab-sec--testers"
      data-visible={visible}
      aria-label="Testers"
    >
      <div className="tab-inner" data-scrollable>
        <p className="slide-kicker slide" style={{ "--from": 1, "--i": 0 } as React.CSSProperties}>
          Testers · far side of the gate
        </p>
        <h2 className="giant" aria-label="Help us break it first.">
          <span className="slide" style={{ "--from": 1, "--i": 1 } as React.CSSProperties}>
            Help us
          </span>
          <span
            className="slide slide--right"
            style={{ "--from": -1, "--i": 2 } as React.CSSProperties}
          >
            break it first.
          </span>
        </h2>
        <div className="slide" style={{ "--from": 1, "--i": 3 } as React.CSSProperties}>
          <ContactLines
            rows={[
              {
                label: "Prefer Telegram?",
                value: `Join ${studio.telegramHandle} for the fastest invites`,
                href: studio.telegram,
              },
              { label: "Questions?", value: studio.testersEmail, href: `mailto:${studio.testersEmail}` },
            ]}
          />
          <TestersForm />
        </div>
      </div>
    </section>
  );
}
