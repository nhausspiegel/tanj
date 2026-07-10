import { describe, expect, it } from "vitest";
import type { Article } from "@/lib/types";
import {
  SEED_STORIES,
  articleToStory,
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

describe("articleToStory", () => {
  const base: Article = {
    id: "x1",
    date: "2026-07-09",
    processed_at: "2026-07-09T12:00:00Z",
    week: "2026-W28",
    domain: "Robotics",
    headline: "A humanoid ships",
    summary: "It walks.",
    source: "IEEE Spectrum",
    url: "https://example.com/a",
    tags: ["robots"],
    importance: 4,
  };

  it("maps article fields and uses personalized_score when present", () => {
    const s = articleToStory({ ...base, personalized_score: 8.2 } as Article, Date.parse("2026-07-10T12:00:00Z"));
    expect(s.title).toBe("A humanoid ships");
    expect(s.tldr).toBe("It walks.");
    expect(s.source).toBe("IEEE Spectrum");
    expect(s.baseScore).toBeCloseTo(8.2, 5);
    expect(s.timeAgo).toBe("1d ago");
  });

  it("derives a base score from importance when no personalized score", () => {
    const s = articleToStory(base, Date.parse("2026-07-10T12:00:00Z"));
    expect(s.baseScore).toBeCloseTo(4 * 1.6 + 1, 5);
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
