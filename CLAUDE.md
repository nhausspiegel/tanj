# Working notes for this repo

Read this before making changes. It captures decisions and mistakes from the
PULSE redesign work so they don't get repeated.

## Project stage

**Pre-alpha.** The owner has said multiple times he doesn't even like the
current UI yet and expects sweeping changes. Do not treat this like shipped
production code.

- Don't over-verify. `tsc --noEmit` + `vitest run` are enough signal for most
  changes — they catch real breakage (types, logic). Don't chase visual
  polish via repeated browser screenshots/stub-injection loops; that burns
  tokens disproportionately to the value at this stage.
- Do one visual pass at the end of a batch of changes, not after every single
  edit. The owner has a running instance and can look at it himself far
  faster than a screenshot-guessing loop.
- The owner is cost-conscious. If you notice yourself re-verifying something
  already covered by typecheck/tests, stop and move on instead.

## Node version — required for desktop mode

Desktop (`npm run dev:desktop`) needs Node **20 or 22 LTS**, not newer
"Current" releases (Node 26 crashes `electron-rebuild` via a yargs
ESM/CommonJS incompatibility). On Apple Silicon, the Node binary must be
**arm64**, not x86_64 — an x86_64 Node will successfully rebuild
`better-sqlite3` but produce a binary Electron (arm64) can't `dlopen`.
Verify with `file $(which node)` before assuming a Homebrew install is
correct — this repo's machine has both an Intel-prefix (`/usr/local`,
x86_64) and Apple-Silicon-prefix (`/opt/homebrew`, arm64) Homebrew; use the
`/opt/homebrew` one.

`npm run dev:web` (browser-only mode) is unaffected by any of this — it
never touches `better-sqlite3`/`electron-rebuild`.

## Architecture decisions made this session

- **GitHub Pages hosting was built, then explicitly reverted.** The owner
  decided against a hosted web version — the desktop Electron app is the
  canonical target (real SQLite, real RSS ingestion, real local AI
  enrichment, zero hosting/ops burden). Don't re-propose static export /
  Pages deployment unless asked again.
- **Dashboard (Netflix rows) vs Trends are intentionally different data
  models.** Dashboard = one card per **article**, no merging
  (`articlesToStories` in `lib/pulse.ts`). Trends = one card per **merged
  story/cluster** across sources (`clusterArticlesToStories`, built on
  `lib/clustering.ts`). This split was an explicit correction — don't
  collapse them back into one shared story list.
- Outlet trust metadata (reputability/reach, used for the story-detail
  modal's source meters and for ordering multi-source stories) lives in
  `lib/outlets.ts`. Add new outlets there as needed; unknown outlets fall
  back to a neutral default.
- `PulseSourceRef.reputability/reach/composite` are **required** fields —
  every path that builds a `PulseStory` (real data and `SEED_STORIES`) fills
  them via `lib/outlets.ts`. Don't make them optional again; that just
  pushes undefined-handling into every consumer.

## Known bug, deprioritized (not being worked on)

`electron/services/resourceMonitor.js` uses Node's `os.freemem()` to decide
whether to throttle/skip the RSS refresh. On macOS this undercounts
available memory (doesn't count reclaimable file-cache pages as free), so
refreshes throttle aggressively even on a healthy machine — symptom: only
the first few (alphabetically-first-fetched) domains ever populate. The
owner has explicitly deprioritized fixing this for now. Don't "fix" it
as a drive-by while doing something else without being asked.

## Subagent usage

Owner wants proactive subagent use for big tasks — not just when he
explicitly asks. Trigger: "anything that would genuinely benefit from
multiple agents working on it at once." In practice:

- Independent, parallelizable subtasks (no dependency between them) → spawn
  agents in parallel rather than doing them sequentially inline.
- Broad codebase research/exploration (multi-file "where is X",
  cross-cutting questions) → use `Explore` or a `cavecrew` agent instead of
  manual grep loops.
- Single-threaded, sequential feature work (e.g. implementing one plan
  across a few files) stays inline — that's not what this is for.

This is a deliberate override of the default "don't spawn unless asked"
posture, scoped to this repo.

## Keeping this file current

Owner wants this file updated proactively — not just on request — whenever
a session surfaces a misalignment (he corrects an approach) or a new
standing preference (he confirms/prefers something non-obvious). Fold it in
here as its own bullet/section, don't let it live only in chat.

## Caveman mode

The `caveman` Claude Code plugin may be active in a session (terse,
jargon-free responses). If active, code/commits/PRs are still written
normally — only prose narration is compressed. This is a per-session
preference, not a codebase convention; don't try to make source code or
commit messages "caveman."
