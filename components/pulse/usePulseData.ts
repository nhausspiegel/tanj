"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SEED_BRIEF_TEXT,
  SEED_INSIGHTS,
  SEED_STORIES,
  articleToSnapshotCluster,
  articlesToStories,
  clusterToStory,
  type PulseHistorySnapshot,
  type PulseStory,
} from "@/lib/pulse";
import { clusterArticles } from "@/lib/clustering";

export type PulseBrief = {
  signalParagraph: string;
  insights: string[];
};

export type PulseCacheStatus = {
  articleCount: number;
  refreshedAgo: string | null;
  live: boolean; // true when reading from the local SQLite cache
};

export type PulseRefreshProgress = {
  processed: number;
  total: number;
};

export type PulseData = {
  stories: PulseStory[];
  rankedStories: PulseStory[]; // clustered/merged — Trends only
  brief: PulseBrief;
  cache: PulseCacheStatus;
  newSinceRefreshAt: string | null;
  ready: boolean;
  refreshing: boolean;
  refreshProgress: PulseRefreshProgress | null;
  refreshElapsedSeconds: number;
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
  const [refreshProgress, setRefreshProgress] = useState<PulseRefreshProgress | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [refreshElapsedSeconds, setRefreshElapsedSeconds] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [newSinceRefreshAt, setNewSinceRefreshAt] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const lastRefreshAtRef = useRef<string | null>(null);
  const progressReloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgressReloadAtRef = useRef(0);
  // Snapshotting cluster_history is only meaningful once a refresh has
  // actually brought in new data — not on every mount/reload, and not on
  // every trickle-in tick mid-refresh (the cluster composition is still
  // settling then). This flag is set right before the one reload() call
  // that represents "a refresh just completed," and consumed (reset) the
  // next time loadData() runs, so only that one hydration writes a snapshot.
  const shouldSnapshotRef = useRef(false);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Live elapsed-time counter for the in-progress refresh, so a long-running
  // first sync doesn't look stalled — ticks every second while refreshing.
  useEffect(() => {
    if (!refreshing) {
      setRefreshElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setRefreshElapsedSeconds(0);
    const interval = setInterval(() => {
      setRefreshElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshing]);

  const loadData = useCallback(async () => {
    const desktop = typeof window !== "undefined" ? window.desktop : undefined;
    if (!desktop) {
      setReady(true);
      return;
    }

    // Trends charts a 7-day window (lib/trends.ts WINDOW_DAYS); fetch 8 days
    // (a day of margin) so its newest-anchored slice is always fully covered
    // even if the freshest data is a day stale. The Dashboard still only
    // shows the newest 400 of this set (sliced below) — same behavior as
    // before, just sourced from one fetch instead of a separate limit=400 one.
    const [articlesRes, briefRes, lastRefreshRes, memoryRes, synthesesRes] =
      await Promise.allSettled([
        desktop.data.getArticles({
          since: new Date(Date.now() - 8 * 86_400_000).toISOString(),
          limit: 2000,
        }),
        desktop.data.getBrief(),
        desktop.jobs.getLastRefresh(),
        desktop.memory?.getState ? desktop.memory.getState() : Promise.resolve(null),
        desktop.data.getClusterSyntheses
          ? desktop.data.getClusterSyntheses()
          : Promise.resolve({}),
      ]);

    const clusterSyntheses =
      synthesesRes.status === "fulfilled" && synthesesRes.value ? synthesesRes.value : {};

    const previousStories: PulseHistorySnapshot[] =
      memoryRes.status === "fulfilled" && memoryRes.value
        ? Object.entries(memoryRes.value.latestSnapshots).map(([id, s]) => ({
            id,
            tags: s.tags ?? [],
            headline: s.headline ?? "",
            sourceCount: s.sourceCount ?? 0,
            snapshotAt: s.snapshotAt,
          }))
        : [];

    if (articlesRes.status === "fulfilled" && Array.isArray(articlesRes.value)) {
      const windowArticles = articlesRes.value;
      // Dashboard: newest 400 only (rows arrive newest-first) — unchanged
      // from before. Trends/clustering below uses the full window.
      const articles = windowArticles.slice(0, 400);
      const mapped = articlesToStories(articles, Date.now(), previousStories);
      if (mapped.length > 0) {
        setStories(mapped);
        const articlesById = new Map(windowArticles.map((article) => [article.id, article]));
        const clusters = clusterArticles(windowArticles);
        const now = Date.now();
        const rankedMapped = clusters.map((cluster) =>
          clusterToStory(cluster, articlesById, now, previousStories, clusterSyntheses),
        );
        setRankedStories(rankedMapped);

        if (shouldSnapshotRef.current && desktop.memory?.snapshotClusters) {
          shouldSnapshotRef.current = false;
          const dashboardSnapshots = mapped.map((s) =>
            articleToSnapshotCluster(articlesById.get(s.id)!, s.baseScore),
          );
          void desktop.memory
            .snapshotClusters({
              clusters: [...dashboardSnapshots, ...clusters],
              snapshotAt: new Date().toISOString(),
            })
            .catch(() => {});
        }
        // setLastRefresh stores a plain ISO string; tolerate an object too.
        const raw = lastRefreshRes.status === "fulfilled" ? lastRefreshRes.value : undefined;
        const refreshedAt =
          typeof raw === "string"
            ? raw
            : (raw as { lastRefreshAt?: string } | null | undefined)?.lastRefreshAt;
        // Track the "new since last refresh" boundary: when the completed
        // refresh's timestamp advances, whatever was the boundary a moment
        // ago becomes the new cutoff (articles ingested after it are "new"),
        // and this refresh's timestamp becomes the next boundary — so the
        // badge set shifts forward and clears on its own next refresh,
        // rather than needing to be dismissed.
        if (refreshedAt && refreshedAt !== lastRefreshAtRef.current) {
          if (lastRefreshAtRef.current) {
            setNewSinceRefreshAt(lastRefreshAtRef.current);
          }
          lastRefreshAtRef.current = refreshedAt;
        }
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
      .catch((error) => {
        console.error("PULSE loadData failed, showing seed data", error);
      })
      .finally(() => {
        if (!cancelled) loadingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [loadData, nonce]);

  // Sync with a refresh that's already in flight (e.g. this surface just
  // mounted/reloaded while a background or previously-triggered refresh is
  // still running) so the spinner doesn't desync from actual backend state.
  useEffect(() => {
    const desktop = typeof window !== "undefined" ? window.desktop : undefined;
    if (!desktop?.jobs?.isRunning) return;
    desktop.jobs
      .isRunning()
      .then((running) => {
        if (running) setRefreshing(true);
      })
      .catch(() => {});
  }, []);

  // Re-hydrate when a background (scheduled/launch) refresh completes.
  // This is the single source of truth for turning the spinner off, since
  // only one refresh can run at a time — whichever call started it.
  useEffect(() => {
    const desktop = typeof window !== "undefined" ? window.desktop : undefined;
    if (!desktop?.jobs?.onRefreshComplete) return;
    const unsubscribe = desktop.jobs.onRefreshComplete((payload) => {
      setRefreshing(false);
      setRefreshProgress(null);
      // A skipped or failed refresh brought in no new data — nothing to
      // snapshot, just re-show whatever's already cached.
      if (!payload?.skipped && payload?.success !== false) {
        shouldSnapshotRef.current = true;
      }
      if (!loadingRef.current) reload();
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [reload]);

  // Re-hydrate as each AI-enrichment batch lands, so cards trickle in
  // instead of waiting for the whole refresh to finish. Progress ticks fire
  // once per AI batch (every ~6 articles), which reload()s the full article
  // set through clustering each time — throttled here so a large refresh
  // doesn't re-cluster a dozen-plus times a few hundred ms apart; a trailing
  // call still lands so the last batch's cards always show up.
  const PROGRESS_RELOAD_THROTTLE_MS = 900;
  useEffect(() => {
    const desktop = typeof window !== "undefined" ? window.desktop : undefined;
    if (!desktop?.jobs?.onRefreshProgress) return;
    const unsubscribe = desktop.jobs.onRefreshProgress((payload) => {
      setRefreshing(true);
      setRefreshProgress(payload ?? null);
      if (loadingRef.current) return;

      const elapsed = Date.now() - lastProgressReloadAtRef.current;
      if (elapsed >= PROGRESS_RELOAD_THROTTLE_MS) {
        lastProgressReloadAtRef.current = Date.now();
        reload();
      } else if (!progressReloadTimeoutRef.current) {
        progressReloadTimeoutRef.current = setTimeout(() => {
          progressReloadTimeoutRef.current = null;
          lastProgressReloadAtRef.current = Date.now();
          reload();
        }, PROGRESS_RELOAD_THROTTLE_MS - elapsed);
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      if (progressReloadTimeoutRef.current) {
        clearTimeout(progressReloadTimeoutRef.current);
        progressReloadTimeoutRef.current = null;
      }
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
      if (result?.skipped && result.skipReason === "running") {
        // A refresh was already in flight (e.g. the spinner had desynced
        // after a reload). Keep spinning — onRefreshComplete resolves it.
        return;
      }
      if (result && result.success === false) {
        setRefreshWarning(result.error ?? "Refresh could not complete.");
      }
      setRefreshing(false);
      setRefreshProgress(null);
      await loadData();
    } catch (error) {
      setRefreshWarning(error instanceof Error ? error.message : "Refresh failed.");
      setRefreshing(false);
      setRefreshProgress(null);
    }
  }, [loadData, refreshing]);

  // Computed post-mount, not inline: `typeof window` differs between SSR
  // (no window) and the client's first paint (window exists), which was
  // causing a hydration mismatch that made React discard and rebuild the
  // whole sidebar tree on load.
  const [canRefresh, setCanRefresh] = useState(false);
  useEffect(() => {
    setCanRefresh(Boolean(window.desktop?.jobs?.runRefreshNow));
  }, []);

  return {
    stories,
    rankedStories,
    brief,
    cache,
    newSinceRefreshAt,
    ready,
    refreshing,
    refreshProgress,
    refreshElapsedSeconds,
    refreshWarning,
    canRefresh,
    reload,
    triggerRefresh,
  };
}
