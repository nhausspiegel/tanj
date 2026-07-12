# TODO

Working list of open items from ongoing PULSE work. Delete items once shipped
(or fold anything durable into CLAUDE.md) rather than letting this grow stale.

## Open

- **Trends page redesign shipped (2026-07-12)** — replaced the old ranked-list
  `TrendsGrid` with a chart + timeline design (`components/pulse/TrendsView.tsx`,
  data derivation in `lib/trends.ts`). The chart lines = per-domain daily
  article counts over 7 days (top 5 domains by activity, each in its own
  `domainHue` color); event nodes + the timeline = top clusters by base score.
  It's self-contained: clicking a node/card expands in place, it no longer
  opens `StoryModal`. This supersedes the earlier "keep the UI, wire the
  pattern-engine into it" plan. Follow-ups if desired:
  - Real cluster data fills multi-source counts; in web/seed mode every event
    shows "1 articles / 1 sources" because `SEED_STORIES` aren't truly clustered.
  - The per-source "reporting timeline" note currently reuses the cluster
    summary — real per-article notes would read better.
  - The 7-day activity lines could later be fed by the pattern engine's
    week-over-week tag deltas (`electron/repositories/patternsRepo.js`) instead
    of raw article counts, if a theme/velocity view is wanted.
- ~~**"score" is confusing, no redesign decided yet**~~ — shipped
  2026-07-12: split into two distinct formulas per
  `pulse_score_plan_new.md`. Dashboard cards now show a **relevance score**
  (`computeArticleRelevanceScore` — recency + importance + strategic-tag
  boost + novelty decay against `cluster_history`); Trends cards show a
  **momentum score** (`computeTrendMomentumScore` — corroboration + velocity
  since the last snapshot + recency + importance). Both still take a +1
  "you follow this domain" nudge via `computeScore` (replaces the old
  `liveScore`, which dropped the like/dismiss-driven live adjustments —
  votes/saved are still used for dismiss-sort and feedback logging,
  just not for scoring anymore). `lib/scoring.ts`'s cluster-impact
  primitives (recency/importance/tag/novelty/source-count) are now shared
  between the two new formulas and the untouched `computeClusterImpactScore`
  internal clustering sort key. `usePulseData` reads `desktop.memory.getState()`
  for history and writes back via `desktop.memory.snapshotClusters()` after
  every load, including Dashboard articles wrapped as trivial one-article
  clusters (`articleToSnapshotCluster`).

## Deferred (explicitly on hold, don't start without being asked)

- **One-time AI backfill for old articles** — 806 of ~834 cached articles
  still hold raw RSS-blurb summaries from before the AI model default was
  fixed (only new articles per refresh get real AI summaries; known
  articles are deliberately never re-processed). Backfill would run them
  through the same batching/trickle-in pipeline, ~70 min of local compute,
  free. User said "sounds good but not right now" — hold off entirely.
