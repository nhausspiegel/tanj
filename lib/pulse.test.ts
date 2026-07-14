import { describe, expect, it } from "vitest";
import type { Article } from "@/lib/types";
import {
  SEED_STORIES,
  articlesToStories,
  clusterArticlesToStories,
  cardThumb,
  computeArticleRelevanceScore,
  computeScore,
  computeTrendMomentumScore,
  domainHue,
  domainLabel,
  relativeTime,
  scoreLabel,
  sourceMark,
  type PulseHistorySnapshot,
  type PulseStory,
} from "@/lib/pulse";

function story(overrides: Partial<PulseStory> = {}): PulseStory {
  return {
    id: "a",
    domain: "LLM",
    source: "TechCrunch",
    timeAgo: "1d ago",
    title: "Title",
    tldr: "Summary",
    tldrIsAi: true,
    importance: 3,
    tags: [],
    baseScore: 5,
    sources: [{ name: "TechCrunch", hoursAgo: 24, headline: "Title", summary: "Summary", reputability: 4, reach: 5, composite: 3 }],
    ...overrides,
  };
}

describe("relativeTime", () => {
  const now = Date.parse("2026-07-10T12:00:00Z");
  it("formats hours, days, weeks, months", () => {
    expect(relativeTime("2026-07-10T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-07-08T12:00:00Z", now)).toBe("2d ago");
    expect(relativeTime("2026-06-26T12:00:00Z", now)).toBe("2w ago");
    expect(relativeTime("2026-05-11T12:00:00Z", now)).toBe("2mo ago");
  });
  it("returns empty string for missing/invalid input", () => {
    expect(relativeTime(undefined, now)).toBe("");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("computeScore", () => {
  it("adds a +1 nudge when the story's domain is followed", () => {
    const s = story({ domain: "LLM", baseScore: 5 });
    expect(computeScore(s, {})).toBe(5);
    expect(computeScore(s, { LLM: true })).toBe(6);
  });

  it("clamps into the 1–10 range", () => {
    const hi = story({ domain: "LLM", baseScore: 10 });
    const lo = story({ domain: "LLM", baseScore: 1 });
    expect(computeScore(hi, { LLM: true })).toBe(10);
    expect(computeScore(lo, {})).toBe(1);
  });
});

describe("computeArticleRelevanceScore (importance-dominant)", () => {
  const base = { importance: 4, tags: [] as string[], headline: "H", previousStories: [] as PulseHistorySnapshot[] };
  // importance term = 1 + (imp-1)*2; recency tie-breaker 0/0.2/0.4/0.6.

  it("is driven by importance (~2*importance-1), with recency as a small nudge", () => {
    // hoursAgo 24 -> recency 0.4.
    expect(computeArticleRelevanceScore({ ...base, importance: 1, hoursAgo: 24 })).toBeCloseTo(1 + 0.4, 5);
    expect(computeArticleRelevanceScore({ ...base, importance: 3, hoursAgo: 24 })).toBeCloseTo(5 + 0.4, 5);
    expect(computeArticleRelevanceScore({ ...base, importance: 5, hoursAgo: 24 })).toBeCloseTo(9 + 0.4, 5);
  });

  it("a low-importance story can't out-score a high-importance one via recency", () => {
    const junkFresh = computeArticleRelevanceScore({ ...base, importance: 1, hoursAgo: 1 }); // best-case low
    const importantOld = computeArticleRelevanceScore({ ...base, importance: 4, hoursAgo: 300 }); // worst-case high
    expect(junkFresh).toBeLessThan(importantOld);
  });

  it("buckets recency into small tie-breaker nudges (0 / 0.2 / 0.4 / 0.6)", () => {
    const imp = 3; // importance term = 5
    expect(computeArticleRelevanceScore({ ...base, importance: imp, hoursAgo: 6 })).toBeCloseTo(5 + 0.6, 5);
    expect(computeArticleRelevanceScore({ ...base, importance: imp, hoursAgo: 24 })).toBeCloseTo(5 + 0.4, 5);
    expect(computeArticleRelevanceScore({ ...base, importance: imp, hoursAgo: 100 })).toBeCloseTo(5 + 0.2, 5);
    expect(computeArticleRelevanceScore({ ...base, importance: imp, hoursAgo: 300 })).toBeCloseTo(5 + 0, 5);
  });
});

describe("computeTrendMomentumScore", () => {
  const base = { hoursAgo: 24, importanceValues: [4, 4], previousSnapshot: undefined as PulseHistorySnapshot | undefined };

  it("scales corroboration with source count, clamped at 5 (and overall score at 10)", () => {
    expect(computeTrendMomentumScore({ ...base, sourceCount: 1 })).toBeCloseTo(1.8 + 0.75 + 1.5 + 2.8, 5);
    // Raw 5 + 0.75 + 1.5 + 2.8 = 10.05, clamps to 10.
    expect(computeTrendMomentumScore({ ...base, sourceCount: 3 })).toBeCloseTo(10, 5);
  });

  it("buckets velocity by growth since the last snapshot", () => {
    // Low importance so the sum stays under the 1-10 clamp and the velocity
    // buckets remain distinguishable in the assertions below.
    const lowImportance = { ...base, importanceValues: [1, 1] };
    const flat: PulseHistorySnapshot = { id: "c", tags: [], headline: "H", sourceCount: 3, snapshotAt: "x" };
    const grewOne: PulseHistorySnapshot = { ...flat, sourceCount: 2 };
    const grewTwo: PulseHistorySnapshot = { ...flat, sourceCount: 1 };
    expect(
      computeTrendMomentumScore({ ...lowImportance, sourceCount: 3, previousSnapshot: flat }),
    ).toBeCloseTo(5 + 0 + 1.5 + 0.7, 5);
    expect(
      computeTrendMomentumScore({ ...lowImportance, sourceCount: 3, previousSnapshot: grewOne }),
    ).toBeCloseTo(5 + 1 + 1.5 + 0.7, 5);
    expect(
      computeTrendMomentumScore({ ...lowImportance, sourceCount: 3, previousSnapshot: grewTwo }),
    ).toBeCloseTo(5 + 2 + 1.5 + 0.7, 5);
  });
});

const BASE_ARTICLE: Article = {
  id: "x1",
  date: "2026-07-09",
  publishedAt: "2026-07-09T12:00:00Z",
  processed_at: "2026-07-09T18:00:00Z",
  week: "2026-W28",
  domain: "Robotics",
  headline: "A humanoid ships",
  summary: "It walks.",
  source: "IEEE Spectrum",
  url: "https://example.com/a",
  tags: ["robots"],
  importance: 4,
};

describe("articlesToStories (Dashboard — one story per article)", () => {
  const now = Date.parse("2026-07-10T12:00:00Z");

  it("maps a single article into a one-source story", () => {
    const [s] = articlesToStories([BASE_ARTICLE], now);
    expect(s.title).toBe("A humanoid ships");
    expect(s.tldr).toBe("It walks.");
    expect(s.source).toBe("IEEE Spectrum");
    expect(s.timeAgo).toBe("1d ago");
    expect(s.sources).toHaveLength(1);
    expect(s.sources[0].name).toBe("IEEE Spectrum");
  });

  it("derives an importance-dominant relevance score (importance 4, ~24h old)", () => {
    const [s] = articlesToStories([BASE_ARTICLE], now);
    // importance 4 -> 7; ~24h -> recency 0.4.
    expect(s.baseScore).toBeCloseTo(7 + 0.4, 5);
  });

  it("never merges — same-story articles from different sources stay separate cards", () => {
    const dupe: Article = { ...BASE_ARTICLE, id: "x2", source: "TechCrunch" };
    const result = articlesToStories([BASE_ARTICLE, dupe], now);
    expect(result).toHaveLength(2);
  });
});

describe("clusterArticlesToStories (Trends — merged sources)", () => {
  const now = Date.parse("2026-07-10T12:00:00Z");

  it("merges same-story articles from different sources and boosts the score", () => {
    const dupe: Article = {
      ...BASE_ARTICLE,
      id: "x2",
      source: "TechCrunch",
      processed_at: "2026-07-10T06:00:00Z",
      url: "https://example.com/b",
    };
    const [s] = clusterArticlesToStories([BASE_ARTICLE, dupe], now);
    expect(s.sources).toHaveLength(2);
    // Most recent source (TechCrunch, 6h ago) leads the merged story.
    expect(s.source).toBe("TechCrunch");
    expect(s.baseScore).toBeGreaterThan(clusterArticlesToStories([BASE_ARTICLE], now)[0].baseScore);
  });
});

describe("presentation helpers", () => {
  it("sourceMark takes two letters of the first source token", () => {
    expect(sourceMark("The Robot Report")).toBe("TH");
    expect(sourceMark("VentureBeat")).toBe("VE");
  });
  it("domainLabel and domainHue cover the taxonomy", () => {
    expect(domainLabel("LLM")).toBe("LLM & Frontier AI");
    expect(domainLabel("Semis")).toBe("Semis");
    expect(domainHue("Robotics")).toBe(178);
  });
  it("scoreLabel renders one decimal + suffix", () => {
    expect(scoreLabel(7.42)).toBe("7.4 score");
  });
  it("cardThumb returns a gradient string", () => {
    expect(cardThumb("LLM", 0)).toContain("radial-gradient");
  });
});

describe("seed stories", () => {
  it("are stable and well-formed", () => {
    expect(SEED_STORIES).toHaveLength(35);
    for (const s of SEED_STORIES) {
      expect(s.baseScore).toBeGreaterThanOrEqual(1);
      expect(s.baseScore).toBeLessThanOrEqual(10);
      expect(s.importance).toBeGreaterThanOrEqual(3);
      expect(s.importance).toBeLessThanOrEqual(5);
    }
  });
});
