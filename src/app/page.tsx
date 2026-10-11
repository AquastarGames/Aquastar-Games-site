"use client";

import { useCallback, useState } from "react";
import { Intro } from "@/features/intro/Intro";
import { Hero } from "@/features/hero/Hero";
import { Menu } from "@/features/menu/Menu";
import { SiteHeader } from "@/features/header/SiteHeader";
import { HanamiBackdrop } from "@/features/hanami/HanamiBackdrop";
import { SupportSection, TestersSection, useJourneyScrollGuard } from "@/features/apply/ApplySections";
import { GamesSection } from "@/features/games/GamesSection";
import { AboutSection } from "@/features/about/AboutSection";

/**
 * `leaving` is the whole trick.
 *
 * Jumping straight from `intro` to `index` unmounts the intro on the frame the
 * button is pressed, so there is nothing left to blur. Holding the intro alive
 * for one more state lets it dissolve while the index is already mounted
 * behind it — the blur reveals real content instead of a void.
 */
type Stage = "intro" | "leaving" | "index";

function IndexPage() {
  // Tabs own every camera move; scroll never leaves its tab (About's orbit
  // scroll is fenced to About). No scroll spy — nothing to spy with.
  useJourneyScrollGuard();
  return (
    <>
      <HanamiBackdrop />
      <SiteHeader />
      <Hero />
      {/*
        The journey, one tab per stop: the torii faces carry glass-free type
        and hairline forms, games is the catalogue view, About is the high
        orbit with three typographic stops.
      */}
      <GamesSection />
      <SupportSection />
      <TestersSection />
      <AboutSection />
      <Menu />
    </>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("intro");

  const handleExitStart = useCallback(() => setStage("leaving"), []);
  const handleExited = useCallback(() => setStage("index"), []);

  return (
    <>
      {stage !== "index" && <Intro onExitStart={handleExitStart} onExited={handleExited} />}

      {stage !== "intro" && (
        <>
          {/*
            Mounted with the index, not before it: during `leaving` the intro
            dissolves and the blur has to reveal real content, not a canvas
            still compiling its first frame.
          */}
          {stage === "index" ? (
            <IndexPage />
          ) : (
            <>
              <HanamiBackdrop />
              <SiteHeader />
              <Hero />
              <Menu />
            </>
          )}
        </>
      )}
    </>
  );
}
