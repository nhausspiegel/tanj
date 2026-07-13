// @ts-nocheck
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const { runMigrations } = require("./migrations");
const {
  getClusterSyntheses,
  upsertClusterSynthesis,
} = require("./repositories/clusterSynthesisRepo");
const { synthesizeClusters, resetAiStatus } = require("./services/aiEnrichment");

const dbs: Array<{ close: () => void }> = [];

function createDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  dbs.push(db);
  return db;
}

afterEach(() => {
  while (dbs.length) dbs.pop().close();
});

describe("clusterSynthesisRepo", () => {
  it("round-trips a synthesis and upserts in place", () => {
    const db = createDb();
    expect(getClusterSyntheses(db)).toEqual({});

    upsertClusterSynthesis(db, {
      clusterId: "cluster-x",
      memberHash: "h1",
      title: "A synthesized headline",
      summary: "What happened and why it matters.",
    });

    let all = getClusterSyntheses(db);
    expect(all["cluster-x"]).toEqual({
      memberHash: "h1",
      title: "A synthesized headline",
      summary: "What happened and why it matters.",
    });

    // Same cluster_id updates in place (new membership + text).
    upsertClusterSynthesis(db, {
      clusterId: "cluster-x",
      memberHash: "h2",
      title: "Updated headline",
      summary: "Updated body.",
    });
    all = getClusterSyntheses(db);
    expect(Object.keys(all)).toHaveLength(1);
    expect(all["cluster-x"].memberHash).toBe("h2");
    expect(all["cluster-x"].title).toBe("Updated headline");
  });

  it("ignores a blank cluster id", () => {
    const db = createDb();
    expect(upsertClusterSynthesis(db, { clusterId: "  ", title: "x", summary: "y", memberHash: "h" })).toBe(false);
    expect(getClusterSyntheses(db)).toEqual({});
  });
});

describe("synthesizeClusters", () => {
  const articlesById = new Map([
    ["a1", { id: "a1", headline: "Outlet A headline", summary: "A body.", source: "A" }],
    ["a2", { id: "a2", headline: "Outlet B headline", summary: "B body.", source: "B" }],
  ]);

  it("skips single-source clusters (nothing to synthesize)", async () => {
    const single = [{ id: "c1", headline: "One", summary: "s", articleIds: ["a1"] }];
    expect(await synthesizeClusters(single, articlesById, {})).toEqual({});
  });

  it("returns {} (lead-article fallback) when AI is unavailable, without emitting fallbacks", async () => {
    // Force checkAiAvailability -> false with a mocked fetch, so no network.
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: false });
    resetAiStatus();
    try {
      const multi = [{ id: "c2", headline: "Two", summary: "s", articleIds: ["a1", "a2"] }];
      const result = await synthesizeClusters(multi, articlesById, {});
      expect(result).toEqual({});
    } finally {
      global.fetch = origFetch;
      resetAiStatus();
    }
  });
});
