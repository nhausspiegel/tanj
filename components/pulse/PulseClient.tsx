"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PULSE_ACCENT,
  PULSE_DOMAIN_ORDER,
  cardThumb,
  computeScore,
  domainHue,
  domainLabel,
  scoreLabel,
  thumbGradient,
  type PulseStory,
} from "@/lib/pulse";
import type { ArticleDomain } from "@/lib/types";
import { usePulseData } from "@/components/pulse/usePulseData";
import { usePulseState } from "@/components/pulse/usePulseState";
import { PulseSidebar, type NavItemVM, type TopicVM } from "@/components/pulse/PulseSidebar";
import { PulseHero } from "@/components/pulse/PulseHero";
import { StoryRow, type RowItem, type RowViewModel } from "@/components/pulse/StoryRow";
import { StoryCard } from "@/components/pulse/StoryCard";
import { TrendsView } from "@/components/pulse/TrendsView";
import { buildTrends } from "@/lib/trends";
import { StoryModal } from "@/components/pulse/StoryModal";
import { SettingsModal } from "@/components/pulse/SettingsModal";
import { useThemeOverrides } from "@/components/pulse/useThemeOverrides";

type Page = "foryou" | "all" | "trends" | "mylikes";

const PAGE_TITLE: Record<Page, string> = {
  foryou: "For You",
  all: "All Domains",
  trends: "Trends",
  mylikes: "My Likes",
};

const PAGE_SUB: Record<Page, string> = {
  foryou: "",
  all: "",
  trends: "Top signals across all domains · by personalized score",
  mylikes: "",
};

function openExternal(url?: string) {
  if (!url || typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function PulseClient() {
  const { coloredScoreBadges } = useThemeOverrides();
  const {
    stories,
    rankedStories,
    cache,
    newSinceRefreshAt,
    refreshing,
    refreshProgress,
    refreshElapsedSeconds,
    refreshWarning,
    canRefresh,
    triggerRefresh,
  } = usePulseData();
  const { followed, votes, saved, setFollowed, setVote, toggleSaved } = usePulseState();

  const [page, setPage] = useState<Page>("foryou");
  const [heroIndex, setHeroIndex] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const mainRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  const registerSection = useCallback((key: string, el: HTMLElement | null) => {
    rowRefs.current[key] = el;
  }, []);

  const scrollMainTop = useCallback(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToRow = useCallback((key: string) => {
    const el = rowRefs.current[key];
    if (el && mainRef.current) {
      mainRef.current.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" });
    }
  }, []);

  const goToPage = useCallback(
    (p: Page) => {
      setPage(p);
      requestAnimationFrame(scrollMainTop);
    },
    [scrollMainTop],
  );

  // ── Derived data ──────────────────────────────────────────────────
  const byId = useMemo(() => {
    const map = new Map<string, PulseStory>();
    for (const s of stories) map.set(s.id, s);
    return map;
  }, [stories]);

  // Trends opens clustered stories, which live in a separate id space (cluster
  // ids, not article ids) — needs its own lookup + its own score function.
  const rankedById = useMemo(() => {
    const map = new Map<string, PulseStory>();
    for (const s of rankedStories) map.set(s.id, s);
    return map;
  }, [rankedStories]);

  const score = useCallback(
    (story: PulseStory) => computeScore(story, followed),
    [followed],
  );

  const rankedScore = useCallback(
    (story: PulseStory) => computeScore(story, followed),
    [followed],
  );

  const savedIds = useMemo(
    () => Object.keys(saved).filter((k) => saved[k] && byId.has(k)),
    [saved, byId],
  );

  // Domains that actually have stories, in the designed order.
  const domainsWithStories = useMemo(() => {
    const present = new Set(stories.map((s) => s.domain));
    return PULSE_DOMAIN_ORDER.filter((d) => present.has(d));
  }, [stories]);

  const moreDomains = useMemo(() => {
    const present = new Set(stories.map((s) => s.domain));
    return PULSE_DOMAIN_ORDER.filter((d) => !present.has(d))
      .map((d) => domainLabel(d))
      .join(" · ");
  }, [stories]);

  // Dismissed (X'd) stories always sort to the very end of their row,
  // regardless of score — that's the whole point of dismissing one.
  const sortedByScore = useCallback(
    (list: PulseStory[]) =>
      list.slice().sort((a, b) => {
        const aDismissed = votes[a.id] === -1;
        const bDismissed = votes[b.id] === -1;
        if (aDismissed !== bDismissed) return aDismissed ? 1 : -1;
        return score(b) - score(a);
      }),
    [score, votes],
  );

  // Hero = top 4 stories overall by live score.
  const heroes = useMemo(() => sortedByScore(stories).slice(0, 4), [sortedByScore, stories]);

  // Keep the carousel index in range as scores re-rank the hero set.
  const safeHeroIndex = heroes.length ? heroIndex % heroes.length : 0;

  // Auto-advance every 6s; pause while a modal is open.
  useEffect(() => {
    if (heroes.length <= 1) return;
    const timer = setInterval(() => {
      if (!selected) setHeroIndex((i) => (i + 1) % heroes.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [heroes.length, selected]);

  const buildItems = useCallback(
    (rowKey: string, list: PulseStory[]): RowItem[] =>
      list.map((story, i) => ({
        key: `${rowKey}:${story.id}`,
        story,
        scoreText: scoreLabel(score(story)),
        thumb: cardThumb(story.domain, i),
        saved: !!saved[story.id],
        vote: (votes[story.id] as 1 | -1 | 0) || 0,
        hovered: hovered === story.id,
        isNew: Boolean(
          story.processedAt && newSinceRefreshAt && story.processedAt > newSinceRefreshAt,
        ),
        coloredScoreBadge: coloredScoreBadges,
        onOpen: () => setSelected(story.id),
        onEnter: () => setHovered(story.id),
        onLeave: () => setHovered((h) => (h === story.id ? null : h)),
        onLike: (e) => {
          e.stopPropagation();
          toggleSaved(story.id);
        },
        onDislike: (e) => {
          e.stopPropagation();
          setVote(story.id, -1);
        },
      })),
    [score, saved, votes, hovered, setVote, toggleSaved, newSinceRefreshAt, coloredScoreBadges],
  );

  const rows: RowViewModel[] = useMemo(() => {
    const storiesFor = (domain: ArticleDomain) =>
      sortedByScore(stories.filter((s) => s.domain === domain));

    let defs: { key: string; label: string; list: PulseStory[] }[] = [];

    if (page === "all") {
      defs = domainsWithStories.map((d) => ({
        key: d,
        label: domainLabel(d),
        list: storiesFor(d),
      }));
    } else if (page === "foryou") {
      const followedDomains = domainsWithStories.filter((d) => followed[d]);
      defs = followedDomains.map((d) => ({ key: d, label: domainLabel(d), list: storiesFor(d) }));

      // Suggested = top stories across everything you follow, ranked by
      // score — a cross-domain highlight reel of your own picks, not a
      // preview of domains you haven't added (that's what All Domains is
      // for). Overlapping with the per-domain rows below is expected, same
      // as a Netflix "Top Picks" row duplicating genre rows.
      if (followedDomains.length) {
        const pool = sortedByScore(stories.filter((s) => followedDomains.includes(s.domain))).slice(0, 8);
        if (pool.length) defs.unshift({ key: "suggested", label: "Suggested for You", list: pool });
      }
    }

    return defs.map((def) => ({
      key: def.key,
      label: def.label,
      count: def.list.length,
      removable: page === "foryou" && def.key !== "suggested",
      addable: page === "all" && !followed[def.key],
      inFeed: page === "all" && !!followed[def.key],
      onRemove: () => setFollowed(def.key, false),
      onAdd: () => setFollowed(def.key, true),
      items: buildItems(def.key, def.list),
    }));
  }, [
    page,
    stories,
    domainsWithStories,
    followed,
    savedIds,
    byId,
    sortedByScore,
    buildItems,
    setFollowed,
  ]);

  // Trends: chart activity from per-article stories, events from clusters.
  const trendsModel = useMemo(() => buildTrends(stories, rankedStories), [stories, rankedStories]);

  // My Likes page: the saved stories, as cards.
  const likedStories = useMemo(
    () => savedIds.map((id) => byId.get(id)).filter((s): s is PulseStory => Boolean(s)),
    [savedIds, byId],
  );
  const likedItems = useMemo(() => buildItems("mylikes", likedStories), [buildItems, likedStories]);

  // ── Sidebar view-models ───────────────────────────────────────────
  const navItems: NavItemVM[] = useMemo(() => {
    const base: { key: Page; label: string }[] = [
      { key: "foryou", label: "Dashboard" },
      { key: "all", label: "All Domains" },
      { key: "trends", label: "Trends" },
    ];
    const items: NavItemVM[] = base.map((n) => ({
      key: n.key,
      label: n.label,
      badge: "",
      active: page === n.key,
      onClick: () => goToPage(n.key),
    }));
    items.push({
      key: "mylikes",
      label: "My Likes",
      badge: String(savedIds.length),
      active: page === "mylikes",
      onClick: () => goToPage("mylikes"),
    });
    return items;
  }, [page, savedIds.length, goToPage]);

  const topics: TopicVM[] = useMemo(
    () =>
      domainsWithStories.map((d) => ({
        key: d,
        label: domainLabel(d),
        dot: `hsl(${domainHue(d)}, 60%, 58%)`,
        opacity: followed[d] ? 1 : 0.45,
        mark: followed[d] ? "×" : "+",
        title: followed[d] ? "Remove from For You" : "Add to For You",
        onToggle: (e) => {
          e.stopPropagation();
          setFollowed(d, !followed[d]);
        },
        onClick: () => {
          if (!followed[d]) return;
          if (page !== "foryou" && page !== "all") {
            setPage("foryou");
            setTimeout(() => scrollToRow(d), 80);
          } else {
            scrollToRow(d);
          }
        },
      })),
    [domainsWithStories, followed, page, scrollToRow, setFollowed],
  );

  const followedCount = domainsWithStories.filter((d) => followed[d]).length;
  const totalDomains = domainsWithStories.length;
  const showAddHint = page === "foryou" && followedCount < totalDomains;

  const cacheLine = cache.live
    ? cache.refreshedAgo
      ? `Cached · ${cache.articleCount} articles · refreshed ${cache.refreshedAgo}`
      : `Cached · ${cache.articleCount} articles`
    : `Demo data · ${cache.articleCount} stories`;

  const selectedStory = selected ? byId.get(selected) ?? rankedById.get(selected) ?? null : null;
  const selectedIsRanked = Boolean(selected && !byId.has(selected) && rankedById.has(selected));

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#0C121C",
        color: "#F7F3E6",
        overflow: "hidden",
      }}
    >
      <PulseSidebar
        navItems={navItems}
        topics={topics}
        moreDomains={moreDomains}
        cacheLine={cacheLine}
        canRefresh={canRefresh}
        refreshing={refreshing}
        refreshProgress={refreshProgress}
        refreshElapsedSeconds={refreshElapsedSeconds}
        refreshWarning={refreshWarning}
        onRefresh={triggerRefresh}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main
        ref={mainRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          scrollBehavior: "smooth",
        }}
      >
        {page === "trends" ? (
          <TrendsView model={trendsModel} />
        ) : page === "mylikes" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "28px 44px 60px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 21,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "#F7F3E6",
                }}
              >
                My Likes
              </h2>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#8a8894" }}>
                {likedStories.length} {likedStories.length === 1 ? "story" : "stories"}
              </span>
            </div>
            {likedStories.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {likedItems.map(({ key, ...props }) => (
                  <StoryCard key={key} {...props} />
                ))}
              </div>
            ) : (
              <div
                style={{
                  marginTop: 8,
                  padding: "56px 28px",
                  textAlign: "center",
                  border: "1px dashed rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  color: "#8a8894",
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: "#c9c7d0" }}>Nothing liked yet</div>
                <div style={{ fontSize: 12.5, marginTop: 8, color: "#66646f", lineHeight: 1.6 }}>
                  Tap the heart on any story to save it here.
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {page === "foryou" && heroes.length > 0 ? (
              <PulseHero
                heroes={heroes}
                index={safeHeroIndex}
                saved={Boolean(heroes[safeHeroIndex] && saved[heroes[safeHeroIndex].id])}
                onOpen={() => setSelected(heroes[safeHeroIndex]?.id ?? null)}
                onSave={() => heroes[safeHeroIndex] && toggleSaved(heroes[safeHeroIndex].id)}
                onSelectIndex={setHeroIndex}
              />
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 34, padding: "28px 0 60px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 44px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 21,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      color: "#F7F3E6",
                    }}
                  >
                    {PAGE_TITLE[page]}
                  </h2>
                  {PAGE_SUB[page] ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#8a8894" }}>{PAGE_SUB[page]}</span>
                  ) : null}
                </div>
                {showAddHint ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#8a8894" }}>
                      Following {followedCount} of {totalDomains} domains
                    </span>
                    <button
                      className="pulse-dashed"
                      onClick={() => goToPage("all")}
                      style={{
                        border: "1px dashed rgba(255,255,255,0.2)",
                        background: "transparent",
                        color: "#a5a3ae",
                        fontFamily: "inherit",
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "6px 14px",
                        borderRadius: 14,
                        cursor: "pointer",
                      }}
                    >
                      + Add domains
                    </button>
                  </div>
                ) : null}
              </div>

              {rows.map((row) => (
                <StoryRow key={row.key} row={row} registerSection={registerSection} />
              ))}
            </div>
          </>
        )}
      </main>

      {selectedStory ? (
        <StoryModal
          story={selectedStory}
          scoreText={scoreLabel(selectedIsRanked ? rankedScore(selectedStory) : score(selectedStory))}
          thumb={thumbGradient(domainHue(selectedStory.domain), 1)}
          saved={Boolean(saved[selectedStory.id])}
          isRanked={selectedIsRanked}
          onClose={() => setSelected(null)}
          onToggleSave={() => toggleSaved(selectedStory.id)}
          onReadOriginal={() => openExternal(selectedStory.url)}
        />
      ) : null}

      {settingsOpen ? <SettingsModal onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
