import { describe, expect, it } from "vitest";
import type { Article } from "@/lib/types";
import {
  SEED_STORIES,
  articlesToStories,
  clusterArticlesToStories,
  cardThumb,
  domainHue,
  domainLabel,
  liveScore,
  relativeTime,
  scoreLabel,
  sourceMark,
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
    importance: 3,
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

describe("liveScore", () => {
  it("boosts the story's own score and re-ranks its domain", () => {
    const a = story({ id: "a", domain: "LLM", baseScore: 5 });
    const b = story({ id: "b", domain: "LLM", baseScore: 5 });
    const stories = [a, b];

    expect(liveScore(a, stories, {}, {})).toBe(5);

    // Own boost: +1 to a, plus +0.2 domain-net nudge to every LLM story.
    const boosted = liveScore(a, stories, {}, { a: 1 });
    expect(boosted).toBeGreaterThan(liveScore(b, stories, {}, { a: 1 }));
    expect(boosted).toBeCloseTo(6.2, 5);
  });

  it("suppresses the story's own score more than it boosts", () => {
    const a = story({ id: "a", baseScore: 5 });
    expect(liveScore(a, [a], {}, { a: -1 })).toBeCloseTo(2.8, 5);
  });

  it("clamps into the 1–10 range", () => {
    const hi = story({ id: "hi", baseScore: 10 });
    const lo = story({ id: "lo", baseScore: 1 });
    expect(liveScore(hi, [hi], {}, { hi: 1 })).toBe(10);
    expect(liveScore(lo, [lo], {}, { lo: -1 })).toBe(1);
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
    const [s] = articlesToStories([{ ...BASE_ARTICLE, personalized_score: 8.2 } as Article], now);
    expect(s.title).toBe("A humanoid ships");
    expect(s.tldr).toBe("It walks.");
    expect(s.source).toBe("IEEE Spectrum");
    expect(s.baseScore).toBeCloseTo(8.2, 5);
    expect(s.timeAgo).toBe("1d ago");
    expect(s.sources).toHaveLength(1);
    expect(s.sources[0].name).toBe("IEEE Spectrum");
  });

  it("derives a base score from importance when no personalized score", () => {
    const [s] = articlesToStories([BASE_ARTICLE], now);
    expect(s.baseScore).toBeCloseTo(4 * 1.6 + 1, 5);
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
