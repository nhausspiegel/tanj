# TODO

Working list of open items from ongoing PULSE work. Delete items once shipped
(or fold anything durable into CLAUDE.md) rather than letting this grow stale.

## Open

- **Trends page doesn't show real trends** — right now "Trends" nav =
  `clusterArticlesToStories` (same story merged across outlets), not a
  big-picture theme/velocity trend. A real trend engine already exists and
  runs every refresh (`electron/repositories/patternsRepo.js` — week-over-week
  tag frequency deltas across the whole corpus) but its only consumer today
  is the sidebar Brief blurb; it's never rendered as its own page. Owner's
  direction: keep the current Trends UI, wire the pattern-engine backend
  into it instead of clustering. Bigger than a straight data swap — the
  pattern engine outputs tag/theme aggregates (no single backing article),
  but `TrendsGrid`'s click-through currently assumes one story per card
  opening in `StoryModal`; that interaction needs rethinking too.
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
