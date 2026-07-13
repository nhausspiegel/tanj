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

export type TrendReportItem = { t: string; src: string; note: string; url?: string };

export type TrendEvent = {
  id: string;
  domainKey: ArticleDomain;
  dayIndex: number; // 0–6 within the 7-day window
  title: string;
  blurb: string; // AI summary (the single summary for this event)
  blurbIsAi: boolean; // false when `blurb` is still just the raw feed blurb, not a real AI summary
  excerpt?: string; // real article quote, only when distinct from the summary
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
const EVENTS_PER_DOMAIN = 3;
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

function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

/**
 * Builds the Trends chart + timeline model.
 *
 * @param articleStories one PulseStory per article (dashboard's `stories`) —
 *   only used to anchor the 7-day window's reference timestamp; the chart
 *   lines, domain selection, and events are all built from clusterStories.
 * @param clusterStories merged, one per story cluster (dashboard's `rankedStories`)
 */
export function buildTrends(
  articleStories: PulseStory[],
  clusterStories: PulseStory[],
  now?: number,
): TrendsModel {
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
  for (const story of clusterStories) {
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

  const rows = [...impactsByDomainDay.entries()].map(([key, grid]) => ({
    key,
    row: grid.map(dayImpact),
  }));

  // Most impactful domains this week lead, capped at MAX_DOMAINS — ranked by
  // total weekly impact, not article volume, so a high-output/low-impact
  // domain (lots of routine posts, nothing major) doesn't crowd out a
  // quieter domain that had the week's biggest story.
  const ranked = rows
    .map((d) => ({ ...d, total: d.row.reduce((a, b) => a + b, 0) }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_DOMAINS);

  const selectedKeys = new Set(ranked.map((d) => d.key));

  // Scale against the fixed 1–10 impact ceiling (same clamp every impact
  // score in the app already uses — lib/scoring.ts, lib/pulse.ts), not the
  // week's own busiest day. A relative per-week max would make a quiet
  // week's best story (impact 4) fill the chart exactly like a huge news
  // week's best story (impact 9) — same top-of-chart height either way,
  // which isn't comparable across domains *or* across weeks. A fixed scale
  // means "this line reaches 70% up" always means the same impact value.
  const domains: TrendDomain[] = ranked.map(({ key, row }) => ({
    key,
    label: domainLabel(key),
    color: `hsl(${domainHue(key)}, 70%, 62%)`,
    values: row.map((v) => Number(((v / MAX_IMPACT) * NORM_MAX).toFixed(2))),
  }));

  // Events: top clusters by base score — the week's major stories — restricted
  // to the shown domains and window, at most EVENTS_PER_DOMAIN each, and at
  // most one per (domain, day). A line chart only has one point per day, so
  // if two events shared a day, node placement would either put both at
  // that day's single line height (misrepresenting whichever one isn't the
  // day's actual peak) or place each at its own height (leaving one
  // visibly disconnected from the line, since the line can only be in one
  // place). Capping to one event per day removes the conflict instead of
  // trying to reconcile it: the shown event for a day is always exactly
  // that day's peak, so its node always lands exactly on the line.
  const candidates = clusterStories
    .map((story) => ({ story, dayIndex: dayIndexOf(storyDayStart(story)) }))
    .filter((c) => c.dayIndex >= 0 && selectedKeys.has(c.story.domain))
    .sort((a, b) => b.story.baseScore - a.story.baseScore);

  const perDomainCount = new Map<ArticleDomain, number>();
  const usedDomainDays = new Set<string>();
  const selected: typeof candidates = [];
  for (const c of candidates) {
    const seen = perDomainCount.get(c.story.domain) ?? 0;
    if (seen >= EVENTS_PER_DOMAIN) continue;
    const domainDayKey = `${c.story.domain}:${c.dayIndex}`;
    if (usedDomainDays.has(domainDayKey)) continue;
    perDomainCount.set(c.story.domain, seen + 1);
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
        note: truncate(s.summary, 72),
        url: s.url,
      }));

    const uniqueSources = new Set(story.sources.map((s) => s.name)).size;
    // The real article quote, shown only when it says something the AI summary
    // doesn't (otherwise the card would repeat the same text twice).
    const tldr = story.tldr?.trim() ?? "";
    const quote = story.excerpt?.trim();
    const excerpt = quote && quote !== tldr ? quote : undefined;
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
      blurb: story.tldr,
      blurbIsAi: story.tldrIsAi,
      excerpt,
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
