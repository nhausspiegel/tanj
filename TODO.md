# TODO

Working list of open items from ongoing PULSE work. Delete items once shipped
(or fold anything durable into CLAUDE.md) rather than letting this grow stale.

## Open

- **Real images on cards** — currently generated color gradients, no real
  images. Plan: `rss-parser` (already used) can pull `<enclosure>`/
  `<media:thumbnail>` off RSS items with no extra network call for most
  feeds. Needs: parser config → `image_url` DB column → thread through
  `Article` type/IPC → `StoryCard` renders `<img>` with gradient fallback
  when missing. Optional later tier: grab `og:image` during full-text
  extraction as a second-tier fallback.
- **Trends page doesn't show real trends** — right now "Trends" nav =
  `clusterArticlesToStories` (same story merged across outlets), not a
  big-picture theme/velocity trend. A real trend engine already exists and
  runs every refresh (`electron/repositories/patternsRepo.js` — week-over-week
  tag frequency deltas across the whole corpus) but its only consumer today
  is the sidebar Brief blurb; it's never rendered as its own page. Needs a
  direction call:
  1. Replace Trends page with theme/tag velocity cards
  2. Keep clustered view (rename it something honest, e.g. "Multi-Source"),
     add real trends as a new tab/page
  3. Something else

## Deferred (explicitly on hold, don't start without being asked)

- **One-time AI backfill for old articles** — 806 of ~834 cached articles
  still hold raw RSS-blurb summaries from before the AI model default was
  fixed (only new articles per refresh get real AI summaries; known
  articles are deliberately never re-processed). Backfill would run them
  through the same batching/trickle-in pipeline, ~70 min of local compute,
  free. User said "sounds good but not right now" — hold off entirely.
