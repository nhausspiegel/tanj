import type { ArticleDomain } from "@/lib/types";
import { domainHue, domainLabel, type PulseStory } from "@/lib/pulse";

// ── Trends data model ─────────────────────────────────────────────────
// Derived entirely from data the dashboard already holds (clustered stories
// only — the chart lines and the event nodes plotted on them are both built
// from the same per-day cluster-impact aggregate, see buildTrends below).
// No backend calls of its own; falls back gracefully on thin/seed data.

export type TrendDomain = {
  key: ArticleDomain;
  label: string;
  color: string; // hsl(...) from the domain's own hue
  values: number[]; // length 7, scaled for the chart (0–NORM_MAX)
};

export type TrendReportItem = { t: string; src: string; headline: string; url?: string };

export type TrendEvent = {
  id: string;
  domainKey: ArticleDomain;
  dayIndex: number; // 0–6 within the 7-day window
  title: string;
  summary: string; // the event's "what & why" text (AI-synthesized cluster summary, else lead's)
  summaryIsAi: boolean; // false when `summary` is still just the raw feed blurb, not AI-synthesized
  impact: number; // 1–10, one decimal — same scale as story.baseScore/impactScore everywhere else
  articles: number;
  sources: number;
  reporting: TrendReportItem[];
  related: { title: string; src: string; url?: string }[];
};

export type TrendsModel = {
  days: string[]; // 7 date labels, oldest → today (e.g. "Jul 6")
  weekdays: string[]; // 7 matching weekday labels (e.g. "MON")
  domains: TrendDomain[]; // up to MAX_DOMAINS, most active first
  events: TrendEvent[];
};

const WINDOW_DAYS = 7;
const MAX_DOMAINS = 5;
// Total event nodes across the whole chart (not per domain) — a readability
// bound. Distributed by global impact rank, but every shown domain is
// guaranteed its single best event first. Must be ≥ MAX_DOMAINS.
const MAX_EVENTS = 12;
// Peak activity maps to this chart value. The reference design tops out ~78 so
// the busiest line's peak sits just above the top gridline without clipping
// (chartXY: y = 296 − value·3.3, so 78 → y≈39, above the y=80 gridline).
export const NORM_MAX = 78;
// Every impact score in the app (lib/scoring.ts, lib/pulse.ts) is clamped to
// this range — the fixed ceiling TrendDomain.values/NORM_MAX is scaled
// against, so chart height means the same real impact number everywhere.
export const MAX_IMPACT = 10;
const MS_DAY = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function monthDayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function weekdayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

function storyDayStart(story: PulseStory): number | null {
  const iso = story.publishedAt;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? startOfDay(t) : null;
}

// Newest publish time across all stories, used as the window anchor when the
// caller doesn't pass an explicit "now" — keeps buildTrends deterministic
// (no Date.now()) across SSR/hydration.
function latestTimestamp(...lists: PulseStory[][]): number | null {
  let max: number | null = null;
  for (const list of lists) {
    for (const s of list) {
      if (!s.publishedAt) continue;
      const t = Date.parse(s.publishedAt);
      if (Number.isFinite(t) && (max === null || t > max)) max = t;
    }
  }
  return max;
}

/**
 * Builds the Trends chart + timeline model.
 *
 * @param articleStories one PulseStory per article (dashboard's `stories`) —
 *   only used to anchor the 7-day window's reference timestamp; the chart
 *   lines, domain selection, and events are all built from clusterStories.
 * @param clusterStories merged, one per story cluster (dashboard's `rankedStories`)
 */
export type BuildTrendsOptions = {
  // Only chart these domains (Trends should only show domains you follow).
  isFollowed?: (domain: ArticleDomain) => boolean;
  // Dev-tunable overrides for the fixed defaults below.
  maxDomains?: number;
  maxEvents?: number;
};

export function buildTrends(
  articleStories: PulseStory[],
  clusterStories: PulseStory[],
  now?: number,
  options: BuildTrendsOptions = {},
): TrendsModel {
  const maxDomains = Math.max(1, Math.floor(options.maxDomains ?? MAX_DOMAINS));
  // At least one event per shown domain, so never fewer than maxDomains.
  const maxEvents = Math.max(maxDomains, Math.floor(options.maxEvents ?? MAX_EVENTS));
  // Restrict the whole chart (lines, domain ranking, events) to followed
  // domains — an unfollowed domain never appears in Trends.
  const clusters = options.isFollowed
    ? clusterStories.filter((s) => options.isFollowed!(s.domain))
    : clusterStories;

  // Anchor the window to the newest story when no explicit "now" is given: this
  // keeps the output identical on server and client (no Date.now()) and keeps
  // the chart populated even if the freshest data is a day or two old.
  const reference = now ?? latestTimestamp(articleStories, clusterStories) ?? Date.parse("2026-07-12T12:00:00Z");
  const todayStart = startOfDay(reference);
  const dayStarts = Array.from({ length: WINDOW_DAYS }, (_, i) => todayStart - (WINDOW_DAYS - 1 - i) * MS_DAY);
  const days = dayStarts.map(monthDayLabel);
  const weekdays = dayStarts.map(weekdayLabel);
  const firstDay = dayStarts[0];

  const dayIndexOf = (dayStart: number | null): number => {
    if (dayStart === null) return -1;
    const idx = Math.round((dayStart - firstDay) / MS_DAY);
    return idx >= 0 && idx < WINDOW_DAYS ? idx : -1;
  };

  // Per-domain, per-day cluster impacts within the 7-day window. Impact
  // lives on clusters (merged stories), not raw articles — a story
  // corroborated by 5 outlets is one important event, not five, so this
  // must aggregate clusterStories, not articleStories.
  const impactsByDomainDay = new Map<ArticleDomain, number[][]>();
  for (const story of clusters) {
    const idx = dayIndexOf(storyDayStart(story));
    if (idx < 0) continue;
    let grid = impactsByDomainDay.get(story.domain);
    if (!grid) {
      grid = Array.from({ length: WINDOW_DAYS }, () => []);
      impactsByDomainDay.set(story.domain, grid);
    }
    grid[idx].push(story.impactScore ?? story.baseScore);
  }

  // A day's line-height value is simply its single biggest story's impact —
  // not a sum or decayed combination of every cluster that day. That keeps
  // "tall = something important happened" exactly true and, just as
  // importantly, keeps it exactly equal to that story's own displayed
  // impact number: since a node is always one of that domain's biggest
  // stories, the day it lands on is (generally) the day this value peaks,
  // with no separate normalization needed to keep node height and line
  // height from disagreeing.
  function dayImpact(impacts: number[]): number {
    return impacts.length ? Math.max(...impacts) : 0;
  }

  // ── Which domains + events to show (relative, rank-based) ────────────
  // Impact is an LLM-assigned score whose absolute calibration is noisy and
  // drifts week to week, so selection is *relative*: rank every in-window
  // cluster globally by impact, then weight by rank with a steep convex
  // dropoff — peaks dominate, but several strong stories still add up. Both
  // domain and event selection run off this one internal ranking; the numbers
  // *displayed* below stay on the fixed absolute scale.
  const inWindow = clusters
    .map((story) => ({
      story,
      dayIndex: dayIndexOf(storyDayStart(story)),
      impact: story.impactScore ?? story.baseScore,
    }))
    .filter((c) => c.dayIndex >= 0)
    .sort((a, b) => b.impact - a.impact); // global rank = index + 1

  // Convex (inverse-square) weight by global rank. rankWeight(1)=1,
  // (2)=0.25, (3)=0.11… — steep enough that the domain with the week's single
  // biggest story can't be buried by another domain's volume of smaller ones
  // (one rank-1 story outweighs any number of rank-4+ ones), while several
  // strong stories still add up. Rank-based (not impact^k) so it's invariant
  // to the absolute-score drift noted above.
  const rankWeight = (rank: number) => 1 / (rank * rank);

  const domainScore = new Map<ArticleDomain, number>();
  inWindow.forEach((c, i) => {
    domainScore.set(c.story.domain, (domainScore.get(c.story.domain) ?? 0) + rankWeight(i + 1));
  });

  // Top MAX_DOMAINS domains by rank-weight — a stable 5 whenever ≥5 domains
  // have any in-window activity; most impactful first.
  const ranked = [...domainScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxDomains)
    .map(([key]) => key);
  const selectedKeys = new Set(ranked);

  // Line values: each shown domain's daily peak impact, scaled against the
  // fixed MAX_IMPACT ceiling — absolute, not a per-week rescale, so a quiet
  // week shows short lines. (Selection above is relative; height here is not.)
  const rowByDomain = new Map<ArticleDomain, number[]>(
    [...impactsByDomainDay.entries()].map(([key, grid]) => [key, grid.map(dayImpact)]),
  );
  const domains: TrendDomain[] = ranked.map((key) => ({
    key,
    label: domainLabel(key),
    color: `hsl(${domainHue(key)}, 70%, 62%)`,
    values: (rowByDomain.get(key) ?? new Array(WINDOW_DAYS).fill(0)).map((v) =>
      Number(((v / MAX_IMPACT) * NORM_MAX).toFixed(2)),
    ),
  }));

  // Events: within the shown domains, take the highest-impact clusters — but
  // guarantee each shown domain its single best event first (so no shown line
  // is clickable-but-empty), then fill the rest by global rank up to
  // MAX_EVENTS. One event per (domain, day): a line has one point per day, so
  // a day's node must be that day's peak to sit exactly on the line.
  const candidates = inWindow.filter((c) => selectedKeys.has(c.story.domain));
  const usedDomainDays = new Set<string>();
  const domainHasEvent = new Set<ArticleDomain>();
  const selected: typeof candidates = [];

  // Pass 1 — each shown domain's best (highest-impact) event.
  for (const c of candidates) {
    if (domainHasEvent.has(c.story.domain)) continue;
    selected.push(c);
    domainHasEvent.add(c.story.domain);
    usedDomainDays.add(`${c.story.domain}:${c.dayIndex}`);
  }
  // Pass 2 — fill remaining slots by global rank, one per (domain, day).
  for (const c of candidates) {
    if (selected.length >= maxEvents) break;
    const domainDayKey = `${c.story.domain}:${c.dayIndex}`;
    if (usedDomainDays.has(domainDayKey)) continue;
    usedDomainDays.add(domainDayKey);
    selected.push(c);
  }

  const events: TrendEvent[] = [];
  for (const { story, dayIndex } of selected) {
    const reporting: TrendReportItem[] = story.sources
      .slice()
      .sort((a, b) => b.hoursAgo - a.hoursAgo) // oldest coverage first
      .slice(0, 4)
      .map((s) => ({
        t: monthDayLabel(reference - s.hoursAgo * 3600_000),
        src: s.name,
        headline: s.headline,
        url: s.url,
      }));

    const uniqueSources = new Set(story.sources.map((s) => s.name)).size;
    // "Impact" is the cluster's own impact score (source count + recency +
    // importance + alignment + novelty) when available, else the personalized
    // base score — both clamped 1–10 everywhere else in the app
    // (lib/scoring.ts, lib/pulse.ts), so shown on that same 1–10 scale here
    // rather than an arbitrary halved 1–5 that doesn't match anywhere else.
    const impactRaw = story.impactScore ?? story.baseScore;

    events.push({
      id: story.id,
      domainKey: story.domain,
      dayIndex,
      title: story.title,
      summary: story.tldr,
      summaryIsAi: story.tldrIsAi,
      impact: Number(Math.max(1, Math.min(10, impactRaw)).toFixed(1)),
      articles: story.sources.length,
      sources: Math.max(1, uniqueSources),
      reporting,
      related: [], // filled below, once every event is known
    });
  }

  // "Related" = the other charted events in the same domain — contextual
  // neighbours, not a separate data source.
  const leadSrc = new Map<string, string>();
  const leadUrl = new Map<string, string | undefined>();
  for (const { story } of candidates) {
    leadSrc.set(story.id, story.source);
    leadUrl.set(story.id, story.url);
  }
  for (const event of events) {
    event.related = events
      .filter((other) => other.domainKey === event.domainKey && other.id !== event.id)
      .slice(0, 3)
      .map((other) => ({ title: other.title, src: leadSrc.get(other.id) ?? "", url: leadUrl.get(other.id) }));
  }

  return { days, weekdays, domains, events };
}
