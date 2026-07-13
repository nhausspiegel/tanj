/**
 * Persistence for AI-synthesized cluster titles/summaries.
 *
 * A cluster's synthesized headline + "why it matters" paragraph are generated
 * at refresh time (electron/services/aiEnrichment.js -> synthesizeClusters) and
 * stored here keyed by cluster id. `member_hash` (from lib/clustering.ts
 * clusterMemberHash) lets the refresh skip re-synthesizing clusters whose
 * membership hasn't changed, and lets the renderer ignore a stored synthesis
 * whose cluster has since drifted.
 */

function getClusterSyntheses(db) {
  const rows = db
    .prepare("SELECT cluster_id, member_hash, title, summary FROM cluster_synthesis")
    .all();
  const out = {};
  for (const row of rows) {
    out[row.cluster_id] = {
      memberHash: row.member_hash,
      title: row.title,
      summary: row.summary,
    };
  }
  return out;
}

function upsertClusterSynthesis(db, { clusterId, memberHash, title, summary }) {
  if (typeof clusterId !== "string" || !clusterId.trim()) return false;
  db.prepare(
    `INSERT INTO cluster_synthesis (cluster_id, member_hash, title, summary, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(cluster_id) DO UPDATE SET
       member_hash = excluded.member_hash,
       title = excluded.title,
       summary = excluded.summary,
       created_at = excluded.created_at`,
  ).run(
    clusterId.trim(),
    typeof memberHash === "string" ? memberHash : "",
    typeof title === "string" ? title : "",
    typeof summary === "string" ? summary : "",
    new Date().toISOString(),
  );
  return true;
}

module.exports = {
  getClusterSyntheses,
  upsertClusterSynthesis,
};
