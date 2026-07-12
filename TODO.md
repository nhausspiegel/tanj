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
- **"score" is confusing, no redesign decided yet** — diagnosed 2026-07-12:
  `score` = `baseScore` (from `personalized_score`, itself importance + an
  invisible hardcoded tag/domain preference boost nobody can configure) run
  through `liveScore()`'s live per-session like/dismiss adjustments. `IMP
  X/5` is just the raw importance rating alone — the two numbers measure
  different things and that's not obvious from the UI. The original
  `news_agg` repo's `impactScore` (`lib/scoring.ts`) is a cleaner, legible
  formula: source-count + recency + importance(max/avg) + tag/domain
  alignment + novelty, no live-vote layer. Owner hasn't picked a direction
  yet (redesign the formula, rename/relabel, drop entirely, etc.) — surface
  the badge as-is until they do.

## Deferred (explicitly on hold, don't start without being asked)

- **One-time AI backfill for old articles** — 806 of ~834 cached articles
  still hold raw RSS-blurb summaries from before the AI model default was
  fixed (only new articles per refresh get real AI summaries; known
  articles are deliberately never re-processed). Backfill would run them
  through the same batching/trickle-in pipeline, ~70 min of local compute,
  free. User said "sounds good but not right now" — hold off entirely.
