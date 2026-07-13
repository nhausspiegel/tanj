import { describe, expect, it } from "vitest";
import type { PulseStory } from "@/lib/pulse";
import { buildTrends } from "@/lib/trends";
import type { ArticleDomain } from "@/lib/types";

const NOW = Date.parse("2026-07-12T12:00:00Z");
const MS_DAY = 86_400_000;

// A per-article story published `daysAgo` before NOW.
function article(domain: ArticleDomain, daysAgo: number, id = `${domain}-${daysAgo}`): PulseStory {
  const iso = new Date(NOW - daysAgo * MS_DAY).toISOString();
  return {
    id,
    domain,
    source: "TechCrunch",
    timeAgo: `${daysAgo}d ago`,
    publishedAt: iso,
    title: `${domain} headline ${id}`,
    tldr: "Short summary.",
    tldrIsAi: false,
    importance: 3,
    baseScore: 5,
    tags: [],
    sources: [{ name: "TechCrunch", hoursAgo: daysAgo * 24, summary: "Short summary.", reputability: 4, reach: 5, composite: 3 }],
  };
}

// A cluster story (event candidate) with richer fields.
function cluster(domain: ArticleDomain, daysAgo: number, baseScore: number, overrides: Partial<PulseStory> = {}): PulseStory {
  return {
    ...article(domain, daysAgo, `${domain}-cluster-${daysAgo}-${baseScore}`),
    baseScore,
    tags: ["alpha", "beta", "gamma"],
    sources: [
      { name: "TechCrunch", hoursAgo: daysAgo * 24, summary: "First report.", reputability: 5, reach: 5, composite: 4, url: "https://tc.example/x" },
      { name: "Reuters Tech", hoursAgo: daysAgo * 24 + 6, summary: "Follow-up.", reputability: 5, reach: 5, composite: 4 },
    ],
    ...overrides,
  };
}

describe("buildTrends", () => {
  it("returns 7 day/weekday labels ending today", () => {
    const model = buildTrends([article("LLM", 0)], [], NOW);
    expect(model.days).toHaveLength(7);
    expect(model.weekdays).toHaveLength(7);
    // Last bucket is today.
    expect(model.days[6]).toBe(new Date(NOW).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  });

  it("selects at most the 5 most active domains, most active first", () => {
    const stories = [
      ...Array.from({ length: 6 }, (_, i) => article("LLM", i % 5, `llm-${i}`)),
      ...Array.from({ length: 4 }, (_, i) => article("Robotics", i % 5, `rob-${i}`)),
      ...Array.from({ length: 3 }, (_, i) => article("Policy", i % 5, `pol-${i}`)),
      ...Array.from({ length: 2 }, (_, i) => article("Cloud", i % 5, `cloud-${i}`)),
      article("Security", 1),
      article("Bio", 2),
    ];
    const model = buildTrends(stories, [], NOW);
    expect(model.domains).toHaveLength(5);
    expect(model.domains[0].key).toBe("LLM");
    expect(model.domains.map((d) => d.key)).toEqual(["LLM", "Robotics", "Policy", "Cloud", "Security"]);
    // Least active of everything (Bio, one article) is dropped.
    expect(model.domains.some((d) => d.key === "Bio")).toBe(false);
  });

  it("excludes articles outside the 7-day window", () => {
    const model = buildTrends([article("LLM", 0), article("LLM", 20)], [], NOW);
    const llm = model.domains.find((d) => d.key === "LLM");
    // Only the in-window article counts toward the values.
    expect(llm?.values.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(llm?.values[6]).toBeGreaterThan(0); // today
  });

  it("normalizes the busiest day to the chart max (~78)", () => {
    // 3 LLM articles today, 1 Robotics today → LLM peak is the global max.
    const stories = [article("LLM", 0, "a"), article("LLM", 0, "b"), article("LLM", 0, "c"), article("Robotics", 0)];
    const model = buildTrends(stories, [], NOW);
    const peak = Math.max(...model.domains.flatMap((d) => d.values));
    expect(peak).toBeCloseTo(78, 1);
  });

  it("maps clusters to events with impact = baseScore/2 and correct day", () => {
    const c = cluster("LLM", 3, 9.4); // baseScore 9.4 → impact 4.7
    const model = buildTrends([article("LLM", 3)], [c], NOW);
    expect(model.events).toHaveLength(1);
    const e = model.events[0];
    expect(e.impact).toBe(4.7);
    expect(e.dayIndex).toBe(3); // 3 days ago in a 7-day window (idx 0..6)
    expect(e.articles).toBe(2);
    expect(e.sources).toBe(2); // two distinct outlets
    expect(e.tags).toEqual(["alpha", "beta", "gamma"]);
    // Reporting is oldest-first.
    expect(e.reporting[0].src).toBe("Reuters Tech");
  });

  it("uses the cluster impact score for impact when present, else base score", () => {
    const withImpact = cluster("LLM", 2, 4, { impactScore: 8 }); // 8/2 = 4.0, not baseScore 4/2=2.0
    const withoutImpact = cluster("Robotics", 2, 9.4); // falls back to baseScore 9.4/2 = 4.7
    const model = buildTrends(
      [article("LLM", 2), article("Robotics", 2)],
      [withImpact, withoutImpact],
      NOW,
    );
    expect(model.events.find((e) => e.domainKey === "LLM")?.impact).toBe(4.0);
    expect(model.events.find((e) => e.domainKey === "Robotics")?.impact).toBe(4.7);
  });

  it("shows the article quote only when it differs from the summary", () => {
    const distinct = cluster("LLM", 2, 8, { tldr: "AI summary text.", excerpt: "A different quoted line." });
    const dup = cluster("Robotics", 2, 8, { tldr: "Same text.", excerpt: "Same text." });
    const model = buildTrends([article("LLM", 2), article("Robotics", 2)], [distinct, dup], NOW);
    expect(model.events.find((e) => e.domainKey === "LLM")?.excerpt).toBe("A different quoted line.");
    expect(model.events.find((e) => e.domainKey === "Robotics")?.excerpt).toBeUndefined();
  });

  it("keeps only the major stories per domain and excludes unselected domains", () => {
    const clusters = [
      cluster("LLM", 1, 9),
      cluster("LLM", 2, 8),
      cluster("LLM", 3, 7),
      cluster("LLM", 4, 6), // 4th LLM cluster — dropped (cap 3)
      cluster("Robotics", 2, 9), // Robotics has no articles → not charted → excluded
    ];
    const model = buildTrends([article("LLM", 1)], clusters, NOW);
    expect(model.domains.map((d) => d.key)).toEqual(["LLM"]);
    expect(model.events.filter((e) => e.domainKey === "LLM")).toHaveLength(3);
    expect(model.events.some((e) => e.domainKey === "Robotics")).toBe(false);
  });

  it("links related events within the same domain, excluding self", () => {
    const clusters = [cluster("LLM", 1, 9), cluster("LLM", 2, 8)];
    const model = buildTrends([article("LLM", 1)], clusters, NOW);
    const first = model.events[0];
    expect(first.related).toHaveLength(1);
    expect(first.related[0].title).not.toBe(first.title);
  });

  it("returns empty domains/events when there is no recent data", () => {
    const model = buildTrends([], [], NOW);
    expect(model.domains).toEqual([]);
    expect(model.events).toEqual([]);
    expect(model.days).toHaveLength(7);
  });
});
