/**
 * One-time backfill: re-run full-text extraction (Readability-based)
 * against cached articles, and persist any improved excerpt/image. Safe to
 * run while the desktop app is open — WAL mode plus a busy_timeout lets
 * this script and the running app share the DB file.
 *
 * Calls fetchPageText directly (not enrichArticlesWithFullText) so it can
 * tell "fetch failed" (null — page blocked/timed out/network error) apart
 * from "fetched fine, confirmed not real article text" (text === "").
 * Only the second case clears an existing excerpt; a failed fetch leaves
 * the row untouched — a transient failure is not evidence the old excerpt
 * was wrong.
 *
 * Usage: node electron/scripts/backfillExcerpts.js
 */

const path = require("node:path");
const os = require("node:os");
const Database = require("better-sqlite3");
const { fetchPageText, excerptFrom } = require("../services/articleExtractor");

const DB_PATH = path.join(
  os.homedir(),
  "Library/Application Support/news_agg/news-agg.sqlite",
);

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  const rows = db
    .prepare("SELECT id, url, source, excerpt, image_url FROM articles WHERE url IS NOT NULL")
    .all();

  console.log(`Backfilling ${rows.length} articles...`);

  const update = db.prepare("UPDATE articles SET excerpt = ?, image_url = ? WHERE id = ?");

  let fetchFailed = 0;
  let changed = 0;
  let clearedBad = 0;
  let newlyFilled = 0;
  let unchanged = 0;
  const samples = [];

  const MAX_CONCURRENT = 2;
  const PAUSE_MS = 300;

  for (let i = 0; i < rows.length; i += MAX_CONCURRENT) {
    const batch = rows.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.all(batch.map((r) => fetchPageText(r.url)));

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const result = results[j];

      if (!result) {
        // Fetch failed outright (blocked, timed out, wrong content type) —
        // we learned nothing, so leave whatever was already stored alone.
        fetchFailed++;
        continue;
      }

      const newExcerpt = result.text && result.text.length > 100 ? excerptFrom(result.text, 500) : null;
      const newImageUrl = row.image_url || result.imageUrl || null;

      const excerptChanged = newExcerpt !== row.excerpt;
      const imageChanged = newImageUrl !== row.image_url;

      if (excerptChanged || imageChanged) {
        changed++;
        if (row.excerpt && !newExcerpt) clearedBad++;
        if (!row.excerpt && newExcerpt) newlyFilled++;
        if (samples.length < 12) {
          samples.push({ id: row.id, source: row.source, before: row.excerpt, after: newExcerpt });
        }
        update.run(newExcerpt, newImageUrl, row.id);
      } else {
        unchanged++;
      }
    }

    console.log(
      `  ${Math.min(i + MAX_CONCURRENT, rows.length)}/${rows.length} processed ` +
        `(changed=${changed}, clearedBad=${clearedBad}, newlyFilled=${newlyFilled}, fetchFailed=${fetchFailed})`,
    );

    if (i + MAX_CONCURRENT < rows.length) {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total: ${rows.length}`);
  console.log(`Fetch failed (left untouched): ${fetchFailed}`);
  console.log(`Changed: ${changed}`);
  console.log(`  Cleared (confirmed not real article text): ${clearedBad}`);
  console.log(`  Newly filled (had none, now has one): ${newlyFilled}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log("\n=== Sample changes ===");
  for (const s of samples) {
    console.log(`\n[${s.id}] ${s.source}`);
    console.log(`  BEFORE: ${s.before ? s.before.slice(0, 150) : "(none)"}`);
    console.log(`  AFTER:  ${s.after ? s.after.slice(0, 150) : "(none)"}`);
  }

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
