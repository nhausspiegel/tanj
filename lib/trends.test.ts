import { describe, expect, it } from "vitest";
import type { PulseStory } from "@/lib/pulse";
import { buildTrends } from "@/lib/trends";
import type { ArticleDomain } from "@/lib/types";

const NOW = Date.parse("2026-07-12T12:00:00Z");
const MS_DAY = 86_400_000;

// A per-article story published `daysAgo` before NOW. Only used to anchor
// buildTrends's window when no explicit `now` is passed — the chart itself
// is built entirely from cluster() stories below.
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
    sources: [{ name: "TechCrunch", hoursAgo: daysAgo * 24, headline: `${domain} headline ${id}`, summary: "Short summary.", reputability: 4, reach: 5, composite: 3 }],
  };
}

// A cluster story (event candidate + line-height contributor) with richer
// fields. baseScore doubles as the cluster's raw impact absent impactScore.
let clusterSeq = 0;
function cluster(domain: ArticleDomain, daysAgo: number, baseScore: number, overrides: Partial<PulseStory> = {}): PulseStory {
  return {
    ...article(domain, daysAgo, `${domain}-cluster-${daysAgo}-${baseScore}-${clusterSeq++}`),
    baseScore,
    tags: ["alpha", "beta", "gamma"],
    sources: [
      { name: "TechCrunch", hoursAgo: daysAgo * 24, headline: "First report headline", summary: "First report.", reputability: 5, reach: 5, composite: 4, url: "https://tc.example/x" },
      { name: "Reuters Tech", hoursAgo: daysAgo * 24 + 6, headline: "Follow-up headline", summary: "Follow-up.", reputability: 5, reach: 5, composite: 4 },
    ],
    ...overrides,
  };
}

describe("buildTrends", () => {
  it("returns 7 day/weekday labels ending today", () => {
    const model = buildTrends([], [], NOW);
    expect(model.days).toHaveLength(7);
    expect(model.weekdays).toHaveLength(7);
    // Last bucket is today.
    expect(model.days[6]).toBe(new Date(NOW).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  });

  it("selects at most the 5 most impactful domains, most impactful first", () => {
    // One cluster per domain, descending impact — Bio is the 6th and gets cut.
    const clusters = [
      cluster("LLM", 1, 10),
      cluster("Robotics", 2, 9),
      cluster("Policy", 3, 8),
      cluster("Cloud", 4, 7),
      cluster("Security", 1, 6),
      cluster("Bio", 2, 5),
    ];
    const model = buildTrends([], clusters, NOW);
    expect(model.domains).toHaveLength(5);
    expect(model.domains.map((d) => d.key)).toEqual(["LLM", "Robotics", "Policy", "Cloud", "Security"]);
    expect(model.domains.some((d) => d.key === "Bio")).toBe(false);
  });

  it("excludes clusters outside the 7-day window", () => {
    const model = buildTrends([], [cluster("LLM", 0, 8), cluster("LLM", 20, 9)], NOW);
    const llm = model.domains.find((d) => d.key === "LLM");
    // The 20-days-ago cluster is out of window; only today's contributes.
    expect(llm?.values.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(llm?.values[6]).toBeGreaterThan(0); // today
    expect(llm?.values.filter((v) => v > 0)).toHaveLength(1);
  });

  it("normalizes against the fixed 1-10 impact ceiling, not the week's own busiest day", () => {
    // Chart values are impact/MAX_IMPACT(10)*NORM_MAX(78), a fixed scale —
    // not relative to whatever the busiest domain/day happened to be, so a
    // quiet week doesn't fill the chart the same as a huge one.
    const model = buildTrends([], [cluster("LLM", 0, 8), cluster("Robotics", 0, 3)], NOW);
    const llm = model.domains.find((d) => d.key === "LLM");
    const robotics = model.domains.find((d) => d.key === "Robotics");
    expect(llm?.values[6]).toBeCloseTo((8 / 10) * 78, 1);
    expect(robotics?.values[6]).toBeCloseTo((3 / 10) * 78, 1);
  });

  it("uses the single biggest story's impact for a day, not a combination of same-day clusters", () => {
    // Two same-day LLM clusters (impact 5 and impact 2) — the day's line
    // value is just the bigger one (5), the smaller doesn't add anything.
    const model = buildTrends([], [cluster("LLM", 0, 10), cluster("LLM", 0, 4)], NOW);
    const llm = model.domains.find((d) => d.key === "LLM");
    // Single domain, so its own peak day normalizes to NORM_MAX (78)
    // regardless — the real assertion is that a second, smaller same-day
    // cluster doesn't push the day's value any higher than the bigger one.
    const soloModel = buildTrends([], [cluster("LLM", 0, 10)], NOW);
    const soloLlm = soloModel.domains.find((d) => d.key === "LLM");
    expect(llm?.values[6]).toBeCloseTo(soloLlm?.values[6] ?? -1, 1);
  });

  it("maps clusters to events with impact = baseScore and correct day", () => {
    const c = cluster("LLM", 3, 9.4);
    const model = buildTrends([], [c], NOW);
    expect(model.events).toHaveLength(1);
    const e = model.events[0];
    expect(e.impact).toBe(9.4);
    expect(e.dayIndex).toBe(3); // 3 days ago in a 7-day window (idx 0..6)
    expect(e.articles).toBe(2);
    expect(e.sources).toBe(2); // two distinct outlets
    // Reporting is oldest-first.
    expect(e.reporting[0].src).toBe("Reuters Tech");
    // Each reporting line shows that source's own article headline, not its
    // raw feed summary/description — some feeds (e.g. hnrss.org) put
    // meaningless boilerplate ("Article URL: ... Comments URL: ...") in the
    // description, but the title is reliable across virtually every feed.
    expect(e.reporting[0].headline).toBe("Follow-up headline");
  });

  it("uses the cluster impact score for impact when present, else base score", () => {
    const withImpact = cluster("LLM", 2, 4, { impactScore: 8 }); // impactScore 8, not baseScore 4
    const withoutImpact = cluster("Robotics", 2, 9.4); // falls back to baseScore 9.4
    const model = buildTrends([], [withImpact, withoutImpact], NOW);
    expect(model.events.find((e) => e.domainKey === "LLM")?.impact).toBe(8);
    expect(model.events.find((e) => e.domainKey === "Robotics")?.impact).toBe(9.4);
  });

  it("keeps at most one event per (domain, day), preferring the higher-scored one", () => {
    // A line chart has one point per day — showing two same-day events for
    // one domain would force either a wrong shared height or a node visibly
    // off the line. Only the bigger story becomes an event for that day;
    // the smaller one is dropped from Trends (not from the app generally —
    // just this "one flagship story per day" surface).
    const big = cluster("Security", 0, 10);
    const smaller = cluster("Security", 0, 8.7);
    const model = buildTrends([], [big, smaller], NOW);
    const securityEvents = model.events.filter((e) => e.domainKey === "Security");
    expect(securityEvents).toHaveLength(1);
    expect(securityEvents[0].impact).toBe(10);
  });

  it("keeps a domain's line peak on the same day as its biggest event", () => {
    // Since the line's day value IS that day's single biggest cluster
    // impact, the day a domain's biggest event lands is also the day its
    // line peaks — no separate reconciliation needed between the two.
    const model = buildTrends(
      [],
      [cluster("LLM", 4, 9), cluster("LLM", 1, 3), cluster("LLM", 6, 2)],
      NOW,
    );
    const llm = model.domains.find((d) => d.key === "LLM")!;
    const peakDayIndex = llm.values.indexOf(Math.max(...llm.values));
    const biggestEvent = model.events.reduce((max, e) => (e.impact > max.impact ? e : max));
    expect(peakDayIndex).toBe(biggestEvent.dayIndex);
  });

  it("exposes the event's what/why summary and whether it's AI-synthesized", () => {
    const ai = cluster("LLM", 2, 8, { tldr: "Synthesized what & why.", tldrIsAi: true });
    const raw = cluster("Robotics", 2, 8, { tldr: "Lead article blurb.", tldrIsAi: false });
    const model = buildTrends([], [ai, raw], NOW);
    expect(model.events.find((e) => e.domainKey === "LLM")?.summary).toBe("Synthesized what & why.");
    expect(model.events.find((e) => e.domainKey === "LLM")?.summaryIsAi).toBe(true);
    expect(model.events.find((e) => e.domainKey === "Robotics")?.summaryIsAi).toBe(false);
  });

  it("ranks a domain with one huge story above a domain of several mid stories (convex weighting)", () => {
    // A linear sum-of-impacts would favor Robotics (6+6+6 = 18 > 10); convex
    // rank weighting favors the domain that had the single biggest story.
    const model = buildTrends(
      [],
      [
        cluster("LLM", 1, 10),
        cluster("Robotics", 1, 6),
        cluster("Robotics", 2, 6),
        cluster("Robotics", 3, 6),
      ],
      NOW,
    );
    expect(model.domains[0].key).toBe("LLM");
  });

  it("picks the same domains/events whether the week scores high or low (invariant to absolute drift)", () => {
    const high = [cluster("LLM", 1, 9), cluster("Robotics", 2, 6), cluster("Policy", 3, 3)];
    // Every impact halved — a miscalibrated/quiet week. A fixed threshold
    // would drop everything; relative selection is unchanged.
    const low = [cluster("LLM", 1, 4.5), cluster("Robotics", 2, 3), cluster("Policy", 3, 1.5)];
    const mHigh = buildTrends([], high, NOW);
    const mLow = buildTrends([], low, NOW);
    expect(mLow.domains.map((d) => d.key)).toEqual(mHigh.domains.map((d) => d.key));
    expect(mLow.events.map((e) => e.domainKey).sort()).toEqual(
      mHigh.events.map((e) => e.domainKey).sort(),
    );
  });

  it("shows a variable number of events per domain, at least one for each shown domain", () => {
    const model = buildTrends(
      [],
      [
        cluster("LLM", 1, 9),
        cluster("LLM", 2, 8),
        cluster("LLM", 3, 7), // 3 LLM events (distinct days)
        cluster("Robotics", 1, 6), // 1 Robotics event
      ],
      NOW,
    );
    const llmCount = model.events.filter((e) => e.domainKey === "LLM").length;
    const robCount = model.events.filter((e) => e.domainKey === "Robotics").length;
    expect(llmCount).toBe(3); // no fixed per-domain cap
    expect(robCount).toBe(1); // still guaranteed its single best event
    expect(llmCount).not.toBe(robCount); // variable, not a fixed count
  });

  it("charts any domain with in-window cluster impact, independent of article volume", () => {
    // No articleStories for Robotics at all — it's still charted because it
    // has a real cluster this week (line height comes from clusters, not
    // article counts).
    const model = buildTrends([article("LLM", 1)], [cluster("Robotics", 2, 9)], NOW);
    expect(model.domains.map((d) => d.key)).toEqual(["Robotics"]);
    expect(model.events.some((e) => e.domainKey === "Robotics")).toBe(true);
  });

  it("links related events within the same domain, excluding self", () => {
    const clusters = [cluster("LLM", 1, 9), cluster("LLM", 2, 8)];
    const model = buildTrends([], clusters, NOW);
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
