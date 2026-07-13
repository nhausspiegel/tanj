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
    sources: [{ name: "TechCrunch", hoursAgo: 24, summary: "Summary", reputability: 4, reach: 5, composite: 3 }],
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

describe("computeArticleRelevanceScore", () => {
  const base = { importance: 4, tags: [] as string[], headline: "H", previousStories: [] as PulseHistorySnapshot[] };

  it("buckets recency by hours-since-publish", () => {
    expect(computeArticleRelevanceScore({ ...base, hoursAgo: 6 })).toBeCloseTo(2 + 2.8 + 0 + 1, 5);
    expect(computeArticleRelevanceScore({ ...base, hoursAgo: 24 })).toBeCloseTo(1.5 + 2.8 + 0 + 1, 5);
    expect(computeArticleRelevanceScore({ ...base, hoursAgo: 100 })).toBeCloseTo(1 + 2.8 + 0 + 1, 5);
    expect(computeArticleRelevanceScore({ ...base, hoursAgo: 200 })).toBeCloseTo(0.5 + 2.8 + 0 + 1, 5);
  });

  it("weights importance at 0.7x for a lone article", () => {
    expect(computeArticleRelevanceScore({ ...base, hoursAgo: 24, importance: 2 })).toBeCloseTo(
      1.5 + 2 * 0.7 + 0 + 1,
      5,
    );
  });

  it("boosts strategic tags, clamped at 2", () => {
    expect(
      computeArticleRelevanceScore({ ...base, hoursAgo: 24, tags: ["gpu"] }),
    ).toBeCloseTo(1.5 + 2.8 + 0.6 + 1, 5);
    expect(
      computeArticleRelevanceScore({ ...base, hoursAgo: 24, tags: ["gpu", "cloud", "chips", "security"] }),
    ).toBeCloseTo(1.5 + 2.8 + 2 + 1, 5);
  });

  it("decays novelty when a previous story strongly overlaps", () => {
    const previousStories: PulseHistorySnapshot[] = [
      { id: "prev", tags: ["gpu"], headline: "H", sourceCount: 1, snapshotAt: "2026-07-09T00:00:00Z" },
    ];
    expect(
      computeArticleRelevanceScore({ ...base, hoursAgo: 24, tags: ["gpu"], previousStories }),
    ).toBeCloseTo(1.5 + 2.8 + 0.6 + 0.25, 5);
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

  it("derives the relevance score from recency + importance (no strategic tag, no history)", () => {
    const [s] = articlesToStories([BASE_ARTICLE], now);
    expect(s.baseScore).toBeCloseTo(1.5 + 4 * 0.7 + 0 + 1, 5);
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
