"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SEED_BRIEF_TEXT,
  SEED_INSIGHTS,
  SEED_STORIES,
  articlesToStories,
  clusterArticlesToStories,
  type PulseStory,
} from "@/lib/pulse";

export type PulseBrief = {
  signalParagraph: string;
  insights: string[];
};

export type PulseCacheStatus = {
  articleCount: number;
  refreshedAgo: string | null;
  live: boolean; // true when reading from the local SQLite cache
};

export type PulseData = {
  stories: PulseStory[];
  rankedStories: PulseStory[]; // clustered/merged — Trends only
  brief: PulseBrief;
  cache: PulseCacheStatus;
  ready: boolean;
  refreshing: boolean;
  refreshWarning: string | null;
  canRefresh: boolean;
  reload: () => void;
  triggerRefresh: () => Promise<void>;
};

const SEED_BRIEF: PulseBrief = {
  signalParagraph: SEED_BRIEF_TEXT,
  insights: SEED_INSIGHTS,
};

function briefFromDesktop(
  brief: { top_shifts?: string[]; emerging_patterns?: string[] } | null | undefined,
): PulseBrief {
  const paragraph = brief?.top_shifts?.filter(Boolean).join(" ").trim();
  const insights = brief?.emerging_patterns?.filter(Boolean) ?? [];
  return {
    signalParagraph: paragraph && paragraph.length > 0 ? paragraph : SEED_BRIEF_TEXT,
    insights: insights.length > 0 ? insights : SEED_INSIGHTS,
  };
}

function relativeMinutes(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Hydrates PULSE from the local SQLite cache via the Electron `window.desktop`
 * bridge, following the "read cache, degrade gracefully" pattern used across
 * tanj. Falls back to the seeded prototype stories in web/dev mode or before
 * the first background refresh, so the surface always renders something.
 */
export function usePulseData(): PulseData {
  const [stories, setStories] = useState<PulseStory[]>(SEED_STORIES);
  const [rankedStories, setRankedStories] = useState<PulseStory[]>(SEED_STORIES);
  const [brief, setBrief] = useState<PulseBrief>(SEED_BRIEF);
  const [cache, setCache] = useState<PulseCacheStatus>({
    articleCount: SEED_STORIES.length,
    refreshedAgo: null,
    live: false,
  });
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadingRef = useRef(false);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const loadData = useCallback(async () => {
    const desktop = typeof window !== "undefined" ? window.desktop : undefined;
    if (!desktop) {
      setReady(true);
      return;
    }

    const [articlesRes, briefRes, lastRefreshRes] = await Promise.allSettled([
      desktop.data.getArticles({ limit: 400 }),
      desktop.data.getBrief(),
      desktop.jobs.getLastRefresh(),
    ]);

    if (articlesRes.status === "fulfilled" && Array.isArray(articlesRes.value)) {
      const mapped = articlesToStories(articlesRes.value);
      if (mapped.length > 0) {
        setStories(mapped);
        setRankedStories(clusterArticlesToStories(articlesRes.value));
        // setLastRefresh stores a plain ISO string; tolerate an object too.
        const raw = lastRefreshRes.status === "fulfilled" ? lastRefreshRes.value : undefined;
        const refreshedAt =
          typeof raw === "string"
            ? raw
            : (raw as { lastRefreshAt?: string } | null | undefined)?.lastRefreshAt;
        setCache({
          articleCount: mapped.length,
          refreshedAgo: relativeMinutes(refreshedAt),
          live: true,
        });
      }
    }

    if (briefRes.status === "fulfilled") {
      setBrief(briefFromDesktop(briefRes.value));
    }

    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadingRef.current = true;

    loadData()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) loadingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [loadData, nonce]);

  // Re-hydrate when a background (scheduled/launch) refresh completes.
  useEffect(() => {
    const desktop = typeof window !== "undefined" ? window.desktop : undefined;
    if (!desktop?.jobs?.onRefreshComplete) return;
    const unsubscribe = desktop.jobs.onRefreshComplete(() => {
      if (!loadingRef.current) reload();
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [reload]);

  const triggerRefresh = useCallback(async () => {
    const desktop = typeof window !== "undefined" ? window.desktop : undefined;
    if (!desktop?.jobs?.runRefreshNow || refreshing) return;

    setRefreshing(true);
    setRefreshWarning(null);
    try {
      const result = (await desktop.jobs.runRefreshNow()) as
        | { success?: boolean; error?: string; skipped?: boolean; skipReason?: string }
        | undefined;
      if (result && result.success === false) {
        setRefreshWarning(result.error ?? "Refresh could not complete.");
      }
      await loadData();
    } catch (error) {
      setRefreshWarning(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }, [loadData, refreshing]);

  const canRefresh = typeof window !== "undefined" && Boolean(window.desktop?.jobs?.runRefreshNow);

  return {
    stories,
    rankedStories,
    brief,
    cache,
    ready,
    refreshing,
    refreshWarning,
    canRefresh,
    reload,
    triggerRefresh,
  };
}
