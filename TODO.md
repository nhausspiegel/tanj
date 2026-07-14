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
  - ~~The per-source "reporting timeline" note currently reuses the cluster
    summary — real per-article notes would read better.~~ — fixed
    2026-07-13: `PulseSourceRef` gained a `headline` field (each contributing
    article's own title); the reporting timeline shows that instead of a
    truncated raw feed summary (which was outright garbage for some feeds,
    e.g. hnrss.org's description is always link-metadata boilerplate, never
    real content). The link now wraps the headline, not the source name.
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

- **Tech-debt audit (2026-07-12, `/simplify`)** — repo forked/vibe-coded fast,
  first real pass at what's slowing iteration down. Fixed already:
  - ~~Refresh pipeline double-upserted every enriched article~~ — fixed:
    `refreshService.js`'s `onBatch` upsert and the end-of-refresh upsert now
    dedupe via an `upsertedIds` set instead of writing every article twice.
  - ~~Full re-cluster on every AI-enrichment progress tick~~ — fixed:
    `usePulseData.ts`'s `onRefreshProgress` reload is now throttled
    (~900ms) instead of re-clustering up to 400 articles per batch (~13x/refresh).
  Still open, not started:
  - **Three drifting tag/domain taxonomies** — `refreshService.js` (heuristic
    `inferTags`), `aiEnrichment.js` (`ARTICLE_DOMAINS`), `lib/scoring.ts`
    (`STRATEGIC_TAGS`) each define their own list independently.
  - **Two independent scoring systems, no shared contract** —
    `lib/pulse.ts` (`computeArticleRelevanceScore`/`computeTrendMomentumScore`)
    and `lib/scoring.ts` evolved on separate commits with no test forcing
    them to agree; this is exactly what caused the `PulseStory.tags`
    required-field merge conflict with Ananya's `lib/trends.test.ts` fixtures.
  - **Zero test coverage on the highest-risk files** —
    `electron/services/refreshService.js`, `electron/services/aiEnrichment.js`,
    `electron/repositories/preferencesRepo.js`, `lib/scoring.ts`. (`lib/pulse.ts`
    and `lib/clustering.ts` do have tests.) Changes to these are currently
    unguarded — this is why the double-upsert bug above went unnoticed.
  - **God files** — `preferencesRepo.js` (620 lines: prefs CRUD + scan state +
    affinity/learning-profile ML logic + admin export, unrelated concerns in
    one file), `refreshService.js` (683 lines: fetch/backoff/state-machine +
    a full heuristic tagging/importance engine), `usePulseData.ts` (a "hook"
    that does IPC orchestration + clustering + lifecycle state — business
    logic that belongs in `lib/`), `SettingsModal.tsx` (885 lines / 28 hooks).
  - ~~**N+1 / unbatched DB writes**~~ — fixed 2026-07-13: `articlesRepo.js`
    added a per-db statement cache (`db.prepare()` was re-parsing the same
    SQL every call across the article/tag loop) and `getOrCreateTag` is now
    one `INSERT..ON CONFLICT..RETURNING` instead of INSERT+SELECT.
    `preferencesRepo.js`'s `updateAffinity` collapsed from 3 round trips
    (SELECT, INSERT/UPDATE, SELECT) to 1 RETURNING statement with a CASE
    for delta-accumulate vs absolute-overwrite; `updateAffinitiesForClusterFeedback`
    now wraps its per-tag/entity loop in `db.transaction()` (was up to 10
    separate uncommitted-until-each-call round trips for 5 tags + 5 entities).
    Verified directly against a real in-memory DB (no prior test coverage) —
    fresh insert, accumulation, overwrite, and clamping at both ends all
    match prior behavior exactly.
  - **Small dead weight** — `resourceMonitor.js`'s `severity`/`criticalReasons`
    fields have no consumer; `types/desktop.d.ts`'s `DesktopPreferences.learningProfile`
    is declared but never read (real learning profile goes through a separate
    IPC call); decorative `as X` type casts in `lib/ai.ts`, `lib/clustering.ts`,
    `lib/teachingPack.ts` paper over union types instead of narrowing them.
  - **Inconsistent IPC error handling** — `electron/main.js` handlers split
    between try/catch-wrapped `{success:false,error}` mutations and unguarded
    read handlers that let exceptions propagate as raw rejections.

## Deferred (explicitly on hold, don't start without being asked)

- **One-time AI backfill for old articles** — 806 of ~834 cached articles
  still hold raw RSS-blurb summaries from before the AI model default was
  fixed (only new articles per refresh get real AI summaries; known
  articles are deliberately never re-processed). Backfill would run them
  through the same batching/trickle-in pipeline, ~70 min of local compute,
  free. User said "sounds good but not right now" — hold off entirely.
