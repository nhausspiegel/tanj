const migrations = [
  {
    version: 1,
    name: "phase_2_local_data",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS articles (
          id TEXT PRIMARY KEY,
          headline TEXT NOT NULL,
          summary TEXT,
          domain TEXT,
          source TEXT,
          url TEXT UNIQUE,
          importance INTEGER,
          personalized_score REAL,
          published_at TEXT,
          processed_at TEXT,
          raw_payload TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          category TEXT
        );

        CREATE TABLE IF NOT EXISTS article_tags (
          article_id TEXT NOT NULL,
          tag_id INTEGER NOT NULL,
          PRIMARY KEY (article_id, tag_id),
          FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS patterns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week TEXT NOT NULL,
          tag_id INTEGER NOT NULL,
          count INTEGER NOT NULL,
          delta REAL,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS briefs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week TEXT UNIQUE NOT NULL,
          content_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS insights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week TEXT NOT NULL,
          title TEXT NOT NULL,
          explanation TEXT NOT NULL,
          confidence TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS importance_feedback (
          article_id TEXT PRIMARY KEY,
          original_importance INTEGER NOT NULL,
          user_importance INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS learning_profile (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS preferences (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
        CREATE INDEX IF NOT EXISTS idx_articles_domain ON articles(domain);
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
        CREATE INDEX IF NOT EXISTS idx_patterns_week ON patterns(week);
        CREATE INDEX IF NOT EXISTS idx_article_tags_tag_id ON article_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_article_tags_article_id ON article_tags(article_id);
      `);
    },
  },
  {
    version: 2,
    name: "phase_3a_local_search",
    up(db) {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS article_search USING fts5(
          article_id UNINDEXED,
          headline,
          summary,
          source,
          tags_text,
          tokenize = 'porter unicode61'
        );

        CREATE TABLE IF NOT EXISTS saved_searches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          query_text TEXT NOT NULL,
          filters_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recent_searches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query_text TEXT NOT NULL,
          filters_json TEXT,
          searched_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_saved_searches_updated_at
          ON saved_searches(updated_at);
        CREATE INDEX IF NOT EXISTS idx_recent_searches_searched_at
          ON recent_searches(searched_at);
      `);

      const indexed = db.prepare("SELECT count(*) AS count FROM article_search").get();
      if (!indexed || Number(indexed.count) === 0) {
        db.prepare(`
          INSERT INTO article_search (article_id, headline, summary, source, tags_text)
          SELECT
            a.id,
            a.headline,
            COALESCE(a.summary, ''),
            COALESCE(a.source, ''),
            COALESCE(group_concat(t.name, ' '), '')
          FROM articles a
          LEFT JOIN article_tags at ON at.article_id = a.id
          LEFT JOIN tags t ON t.id = at.tag_id
          GROUP BY a.id
        `).run();
      }
    },
  },
  {
    version: 3,
    name: "phase_3_personal_intelligence",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id TEXT NOT NULL,
          action TEXT NOT NULL,
          value REAL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_affinity (
          key TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          score REAL NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          field TEXT NOT NULL,
          value TEXT NOT NULL,
          weight REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_user_feedback_cluster_id
          ON user_feedback(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at
          ON user_feedback(created_at);
        CREATE INDEX IF NOT EXISTS idx_user_affinity_type_score
          ON user_affinity(type, score);
      `);
    },
  },
  {
    version: 4,
    name: "phase_3b_breadth_and_memory",
    up(db) {
      const columns = db.prepare("PRAGMA table_info(articles)").all();
      const hasSecondary = columns.some(
        (column) => column.name === "domain_secondary_json",
      );

      if (!hasSecondary) {
        db.exec(`ALTER TABLE articles ADD COLUMN domain_secondary_json TEXT;`);
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS cluster_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id TEXT NOT NULL,
          snapshot_at TEXT NOT NULL,
          article_count INTEGER NOT NULL,
          summary_json TEXT NOT NULL,
          importance_score REAL,
          primary_domain TEXT,
          secondary_domains_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_cluster_history_cluster_id
          ON cluster_history(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_cluster_history_snapshot_at
          ON cluster_history(snapshot_at);

        CREATE TABLE IF NOT EXISTS narrative_threads (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          started_at TEXT NOT NULL,
          last_updated_at TEXT NOT NULL,
          summary_json TEXT
        );

        CREATE TABLE IF NOT EXISTS narrative_thread_clusters (
          thread_id TEXT NOT NULL,
          cluster_id TEXT NOT NULL,
          added_at TEXT NOT NULL,
          PRIMARY KEY (thread_id, cluster_id),
          FOREIGN KEY (thread_id) REFERENCES narrative_threads(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_narrative_thread_clusters_cluster_id
          ON narrative_thread_clusters(cluster_id);

        CREATE TABLE IF NOT EXISTS cluster_view_state (
          cluster_id TEXT PRIMARY KEY,
          last_viewed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS domain_view_state (
          domain TEXT PRIMARY KEY,
          last_viewed_at TEXT NOT NULL,
          collapsed INTEGER NOT NULL DEFAULT 0
        );
      `);

      const remap = {
        Chips: "Semis",
        Infra: "Cloud",
        Energy: "Climate",
        Macro: "Policy",
        Frontier: "General",
      };

      const update = db.prepare(
        "UPDATE articles SET domain = ? WHERE domain = ?",
      );
      for (const [legacy, replacement] of Object.entries(remap)) {
        update.run(replacement, legacy);
      }
    },
  },
  {
    version: 5,
    name: "split_ai_into_use_llm_infra",
    up(db) {
      const LLM_SOURCES = new Set([
        "OpenAI Blog",
        "Anthropic Blog",
        "DeepMind",
        "Google AI Blog",
        "Meta AI Blog",
        "Hugging Face Blog",
        "Arxiv AI",
        "The Batch (deeplearning.ai)",
      ]);
      const USE_SOURCES = new Set([
        "MIT Technology Review",
        "AI News",
      ]);

      const infraKeywordRegex =
        /\b(nvidia|gpu|h100|h200|b100|b200|blackwell|hopper|tpu|accelerator|data ?center|datacenter|inference|training cluster|hbm|cuda|rocm|compute cluster|supercomputer|ai chip|ai infrastructure|ai infra)\b/i;

      const infraTags = new Set([
        "nvidia", "gpu", "tpu", "ai_infrastructure", "ai_infra",
        "ai_hardware", "inference", "training_infrastructure",
        "accelerator", "ai_compute", "datacenter",
      ]);

      const rows = db
        .prepare(
          `SELECT a.id, a.headline, a.source,
                  COALESCE(group_concat(t.name, ' '), '') AS tags_text
           FROM articles a
           LEFT JOIN article_tags at ON at.article_id = a.id
           LEFT JOIN tags t ON t.id = at.tag_id
           WHERE a.domain = 'AI'
           GROUP BY a.id`,
        )
        .all();

      const updateDomain = db.prepare(
        "UPDATE articles SET domain = ? WHERE id = ?",
      );

      const reclassify = db.transaction(() => {
        for (const row of rows) {
          const headline = String(row.headline ?? "");
          const source = String(row.source ?? "");
          const tagsText = String(row.tags_text ?? "");

          let next = "LLM";

          const hasInfraTag = tagsText
            .split(/\s+/)
            .some((tag) => infraTags.has(tag));

          if (infraKeywordRegex.test(headline) || hasInfraTag) {
            next = "AIInfra";
          } else if (USE_SOURCES.has(source)) {
            next = "AIUse";
          } else if (LLM_SOURCES.has(source)) {
            next = "LLM";
          } else {
            next = "LLM";
          }

          updateDomain.run(next, row.id);
        }
      });

      reclassify();
    },
  },
  {
    version: 6,
    name: "add_article_image_url",
    up(db) {
      const columns = db.prepare("PRAGMA table_info(articles)").all();
      const hasImageUrl = columns.some((column) => column.name === "image_url");

      if (!hasImageUrl) {
        db.exec(`ALTER TABLE articles ADD COLUMN image_url TEXT;`);
      }
    },
  },
];

function ensureSchemaVersionTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function appliedVersions(db) {
  return new Set(
    db.prepare("SELECT version FROM schema_version").all().map((row) => row.version),
  );
}

function runMigrations(db) {
  ensureSchemaVersionTable(db);
  const applied = appliedVersions(db);

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }

    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(
        "INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.version, migration.name, new Date().toISOString());
    });

    apply();
  }
}

module.exports = {
  migrations,
  runMigrations,
};
