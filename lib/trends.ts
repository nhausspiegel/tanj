import type { ArticleDomain } from "@/lib/types";
import { domainHue, domainLabel, type PulseStory } from "@/lib/pulse";

// ── Trends data model ─────────────────────────────────────────────────
// Derived entirely from data the dashboard already holds:
//   • per-article stories  → daily activity counts per domain (the chart lines)
//   • clustered stories     → the major events plotted on those lines
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
  excerpt?: string; // real article quote, only when distinct from the summary
  impact: number; // 1–5, one decimal
  articles: number;
  sources: number;
  reporting: TrendReportItem[];
  related: { title: string; src: string; url?: string }[];
  tags: string[];
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
const NORM_MAX = 78;
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
 * @param articleStories one PulseStory per article (dashboard's `stories`)
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

  // Per-domain daily article counts within the 7-day window.
  const counts = new Map<ArticleDomain, number[]>();
  for (const story of articleStories) {
    const idx = dayIndexOf(storyDayStart(story));
    if (idx < 0) continue;
    let row = counts.get(story.domain);
    if (!row) {
      row = new Array(WINDOW_DAYS).fill(0);
      counts.set(story.domain, row);
    }
    row[idx] += 1;
  }

  // Most active domains this week lead, capped at MAX_DOMAINS.
  const ranked = [...counts.entries()]
    .map(([key, row]) => ({ key, row, total: row.reduce((a, b) => a + b, 0) }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_DOMAINS);

  const selectedKeys = new Set(ranked.map((d) => d.key));

  // Normalize every shown line against the single busiest day across them all,
  // so heights stay comparable between domains.
  const globalMax = Math.max(1, ...ranked.flatMap((d) => d.row));

  const domains: TrendDomain[] = ranked.map(({ key, row }) => ({
    key,
    label: domainLabel(key),
    color: `hsl(${domainHue(key)}, 70%, 62%)`,
    values: row.map((v) => Number(((v / globalMax) * NORM_MAX).toFixed(2))),
  }));

  // Events: top clusters by base score — the week's major stories — restricted
  // to the shown domains and window, at most EVENTS_PER_DOMAIN each.
  //
  // The line's shape (daily article count) and event selection (cluster base
  // score) are independent signals, so a domain's busiest day often has no
  // event candidate at all — the line visibly peaks with nothing marking it.
  // When a real cluster story exists on that peak day, prioritize it over a
  // lower-volume day so the chart's most visually prominent point usually
  // has a node explaining it (never fabricated — only when real data backs it).
  const peakDayByDomain = new Map<ArticleDomain, number>();
  for (const d of domains) {
    let peakIdx = 0;
    for (let i = 1; i < d.values.length; i++) {
      if (d.values[i] > d.values[peakIdx]) peakIdx = i;
    }
    peakDayByDomain.set(d.key, peakIdx);
  }

  const perDomainCount = new Map<ArticleDomain, number>();
  const candidates = clusterStories
    .map((story) => ({ story, dayIndex: dayIndexOf(storyDayStart(story)) }))
    .filter((c) => c.dayIndex >= 0 && selectedKeys.has(c.story.domain))
    .sort((a, b) => {
      const aOnPeak = a.dayIndex === peakDayByDomain.get(a.story.domain);
      const bOnPeak = b.dayIndex === peakDayByDomain.get(b.story.domain);
      if (aOnPeak !== bOnPeak) return aOnPeak ? -1 : 1;
      return b.story.baseScore - a.story.baseScore;
    });

  const events: TrendEvent[] = [];
  for (const { story, dayIndex } of candidates) {
    const seen = perDomainCount.get(story.domain) ?? 0;
    if (seen >= EVENTS_PER_DOMAIN) continue;
    perDomainCount.set(story.domain, seen + 1);

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
    // base score. Both are 1–10; shown on a 1–5 scale.
    const impactRaw = story.impactScore ?? story.baseScore;

    events.push({
      id: story.id,
      domainKey: story.domain,
      dayIndex,
      title: story.title,
      blurb: story.tldr,
      excerpt,
      impact: Number(Math.max(1, Math.min(5, impactRaw / 2)).toFixed(1)),
      articles: story.sources.length,
      sources: Math.max(1, uniqueSources),
      reporting,
      related: [], // filled below, once every event is known
      tags: (story.tags ?? []).slice(0, 6),
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
