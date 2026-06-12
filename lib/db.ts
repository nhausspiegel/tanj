import "server-only";

import { Pool, type PoolClient } from "pg";
import type { WeeklyBrief } from "@/lib/brief";
import type { InsightEngineResult } from "@/lib/insights";
import type { GeneratedOutput } from "@/lib/output";
import type { PatternAnalysis } from "@/lib/patterns";
import type { OutputTemplate } from "@/lib/templates";
import type {
  Article,
  ArticleDomain,
  ConnectionStrength,
  ExtractedEntity,
  NarrativeThread,
  PersonalizationRule,
  Scenario,
  ScenarioImplication,
  StoryCluster,
  TrendSignal,
  UserAffinity,
  UserAffinityType,
  UserFeedback,
  WatchItem,
} from "@/lib/types";

const databaseUrl =
  process.env.POSTGRES_URL && process.env.POSTGRES_URL !== "your_db_url"
    ? process.env.POSTGRES_URL
    : null;

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
let initialized = false;
let initPromise: Promise<void> | null = null;

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

type StoredPatternRow = {
  week: string;
  tag: string;
  count: number;
  delta: number;
  domain: string;
};

type StoredStoryClusterRow = {
  id: string;
  headline: string;
  summary: string;
  why_it_matters: string[];
  domain: ArticleDomain;
  tags: string[];
  entities: ExtractedEntity[];
  sources: string[];
  source_count: number;
  confidence: StoryCluster["confidence"];
  impact_score: number;
  first_seen_at: string;
  last_seen_at: string;
  article_ids?: string[];
};

type StoredArticleRow = {
  id: string;
  headline: string;
  summary: string;
  domain: ArticleDomain;
  tags: string[];
  importance: Article["importance"];
  source: string | null;
  url: string | null;
  published_at: string;
  processed_at: string;
};

type StoredBriefRow = {
  week: string;
  content: WeeklyBrief;
};

type StoredUserFeedbackRow = {
  id: number;
  cluster_id: string;
  action: string;
  value: number | null;
  created_at: string;
};

type StoredUserAffinityRow = {
  key: string;
  type: UserAffinityType;
  score: number;
  updated_at: string;
};

type StoredRuleRow = {
  id: number;
  type: PersonalizationRule["type"];
  field: PersonalizationRule["field"];
  value: string;
  weight: number;
};

type StoredNarrativeRow = {
  id: string;
  title: string;
  summary: string;
  direction: NarrativeThread["direction"];
  tags: string[];
  entities: ExtractedEntity[];
  cluster_ids: string[];
  timeline: NarrativeThread["timeline"];
  first_seen_at: string;
  last_seen_at: string;
  strength: number;
};

type StoredTrendSignalRow = {
  tag: string;
  direction: TrendSignal["direction"];
  velocity: number;
  current_count: number;
  previous_count: number;
  points: TrendSignal["points"];
  computed_at: string;
};

type StoredConnectionRow = {
  id: string;
  source: string;
  target: string;
  source_type: ConnectionStrength["sourceType"];
  target_type: ConnectionStrength["targetType"];
  weight: number;
  cluster_ids: string[];
  computed_at: string;
};

type StoredScenarioRow = {
  id: string;
  title: string;
  description: string;
  drivers: string[];
  likelihood: Scenario["likelihood"];
  time_horizon: string;
  created_at: string;
};

type StoredImplicationRow = {
  scenario_id: string;
  consequences: string[];
  domain_impacts: ScenarioImplication["domainImpacts"];
  created_at: string;
};

type StoredWatchItemRow = {
  scenario_id: string;
  signals: string[];
  indicators: string[];
  created_at: string;
};

type StoredGeneratedOutputRow = {
  id: string;
  type: GeneratedOutput["type"];
  audience: GeneratedOutput["audience"];
  title: string;
  summary: string;
  sections: GeneratedOutput["sections"];
  metadata: GeneratedOutput["metadata"];
  content: GeneratedOutput;
  created_at: string;
};

type StoredTemplateRow = {
  id: OutputTemplate["id"];
  label: string;
  description: string;
  version: number;
  default_audience: OutputTemplate["defaultAudience"];
  sections: OutputTemplate["sections"];
  created_at: string;
  updated_at: string;
};

export type StoredInsight = {
  week: string;
  title: string;
  explanation: string;
  confidence: string;
};

export type TagTrendPoint = {
  week: string;
  count: number;
};

export type LongTermTrend = {
  tag: string;
  points: TagTrendPoint[];
  first: number;
  last: number;
  delta: number;
  average: number;
};

export type LongTermTrendAnalysis = {
  rising: LongTermTrend[];
  declining: LongTermTrend[];
  stable: LongTermTrend[];
  available: boolean;
};

export function hasDatabase() {
  return Boolean(pool);
}

async function withDbTransaction<T>(work: (client: Queryable) => Promise<T>) {
  if (!pool) {
    return null;
  }

  const maybePool = pool as unknown as {
    connect?: () => Promise<PoolClient>;
  };

  if (typeof maybePool.connect !== "function") {
    return work(pool);
  }

  const client = await maybePool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function formatWeek(value: Date) {
  const utcDate = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-${String(weekNumber).padStart(2, "0")}`;
}

function coerceTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((tag): tag is string => typeof tag === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function articleFromStoredRow(row: StoredArticleRow): Article {
  const publishedAt = new Date(row.published_at);

  return {
    id: row.id,
    date: publishedAt.toISOString().slice(0, 10),
    processed_at: new Date(row.processed_at).toISOString(),
    week: formatWeek(publishedAt),
    domain: row.domain,
    headline: row.headline,
    summary: row.summary,
    source: row.source ?? undefined,
    url: row.url ?? undefined,
    tags: coerceTags(row.tags),
    importance: row.importance,
  };
}

export async function initDb() {
  if (!pool) {
    return;
  }

  if (initialized) {
    return;
  }

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        headline TEXT NOT NULL,
        summary TEXT NOT NULL,
        domain TEXT NOT NULL,
        tags JSONB NOT NULL,
        importance INTEGER NOT NULL,
        source TEXT,
        url TEXT UNIQUE NOT NULL,
        published_at TIMESTAMPTZ NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS patterns (
        id BIGSERIAL PRIMARY KEY,
        week TEXT NOT NULL,
        domain TEXT NOT NULL,
        tag TEXT NOT NULL,
        count INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        UNIQUE (week, domain, tag)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS briefs (
        id BIGSERIAL PRIMARY KEY,
        week TEXT NOT NULL UNIQUE,
        content JSONB NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS insights (
        id BIGSERIAL PRIMARY KEY,
        week TEXT NOT NULL,
        title TEXT NOT NULL,
        explanation TEXT NOT NULL,
        confidence TEXT NOT NULL,
        content JSONB NOT NULL,
        UNIQUE (week, title)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_clusters (
        id TEXT PRIMARY KEY,
        headline TEXT NOT NULL,
        summary TEXT NOT NULL,
        why_it_matters JSONB NOT NULL,
        domain TEXT NOT NULL,
        tags JSONB NOT NULL,
        entities JSONB NOT NULL,
        sources JSONB NOT NULL,
        source_count INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        impact_score REAL NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS story_cluster_articles (
        cluster_id TEXT NOT NULL,
        article_id TEXT NOT NULL,
        PRIMARY KEY (cluster_id, article_id),
        FOREIGN KEY (cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id SERIAL PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        action TEXT NOT NULL,
        value REAL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_affinity (
        key TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        score REAL NOT NULL,
        updated_at TIMESTAMPTZ
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rules (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        field TEXT NOT NULL,
        value TEXT NOT NULL,
        weight REAL NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS narrative_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        direction TEXT NOT NULL,
        tags JSONB NOT NULL,
        entities JSONB NOT NULL,
        cluster_ids JSONB NOT NULL,
        timeline JSONB NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        strength REAL NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS trend_signals (
        tag TEXT PRIMARY KEY,
        direction TEXT NOT NULL,
        velocity REAL NOT NULL,
        current_count INTEGER NOT NULL,
        previous_count INTEGER NOT NULL,
        points JSONB NOT NULL,
        computed_at TIMESTAMPTZ NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        source_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        weight REAL NOT NULL,
        cluster_ids JSONB NOT NULL,
        computed_at TIMESTAMPTZ NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        drivers JSONB NOT NULL,
        likelihood TEXT NOT NULL,
        time_horizon TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS implications (
        scenario_id TEXT PRIMARY KEY,
        consequences JSONB NOT NULL,
        domain_impacts JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS watch_items (
        scenario_id TEXT PRIMARY KEY,
        signals JSONB NOT NULL,
        indicators JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS generated_outputs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        audience TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        sections JSONB NOT NULL,
        metadata JSONB NOT NULL,
        content JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL,
        version INTEGER NOT NULL,
        default_audience TEXT NOT NULL,
        sections JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS articles_published_at_idx
      ON articles (published_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS articles_tags_gin_idx
      ON articles USING GIN (tags);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS patterns_week_domain_idx
      ON patterns (week DESC, domain);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS story_clusters_impact_score_idx
      ON story_clusters (impact_score DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS story_clusters_last_seen_at_idx
      ON story_clusters (last_seen_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS story_clusters_domain_idx
      ON story_clusters (domain);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS user_feedback_cluster_id_idx
      ON user_feedback (cluster_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS user_feedback_created_at_idx
      ON user_feedback (created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS user_affinity_type_score_idx
      ON user_affinity (type, score DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS narrative_threads_strength_idx
      ON narrative_threads (strength DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS narrative_threads_last_seen_at_idx
      ON narrative_threads (last_seen_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS trend_signals_velocity_idx
      ON trend_signals (velocity DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS connections_weight_idx
      ON connections (weight DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS scenarios_likelihood_idx
      ON scenarios (likelihood);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS scenarios_created_at_idx
      ON scenarios (created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS generated_outputs_created_at_idx
      ON generated_outputs (created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS generated_outputs_type_audience_idx
      ON generated_outputs (type, audience);
    `);

    initialized = true;
    initPromise = null;
  })();

  await initPromise;
}

export async function saveArticlesToDb(articles: Article[]) {
  if (!pool || !articles.length) {
    return;
  }

  await initDb();

  const rows = articles.map((article) => ({
    id: article.id,
    headline: article.headline,
    summary: article.summary,
    domain: article.domain,
    tags: article.tags,
    importance: article.importance,
    source: article.source ?? null,
    url: article.url ?? article.id,
    published_at: article.date,
    processed_at: article.processed_at,
  }));

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS article(
            id TEXT,
            headline TEXT,
            summary TEXT,
            domain TEXT,
            tags JSONB,
            importance INTEGER,
            source TEXT,
            url TEXT,
            published_at TIMESTAMPTZ,
            processed_at TIMESTAMPTZ
          )
        )
        INSERT INTO articles (
          id,
          headline,
          summary,
          domain,
          tags,
          importance,
          source,
          url,
          published_at,
          processed_at
        )
        SELECT
          id,
          headline,
          summary,
          domain,
          tags,
          importance,
          source,
          url,
          published_at,
          processed_at
        FROM input
        ON CONFLICT (url) DO UPDATE SET
          summary = EXCLUDED.summary,
          domain = EXCLUDED.domain,
          tags = EXCLUDED.tags,
          importance = EXCLUDED.importance,
          processed_at = EXCLUDED.processed_at
      `,
      [JSON.stringify(rows)],
    ),
  );
}

function storyClusterFromRow(row: StoredStoryClusterRow): StoryCluster {
  return {
    id: row.id,
    headline: row.headline,
    summary: row.summary,
    whyItMatters: row.why_it_matters ?? [],
    domain: row.domain,
    tags: row.tags ?? [],
    entities: row.entities ?? [],
    articleIds: row.article_ids ?? [],
    sources: row.sources ?? [],
    sourceCount: row.source_count,
    confidence: row.confidence,
    impactScore: Number(row.impact_score),
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
  };
}

export async function saveStoryClustersToDb(clusters: StoryCluster[]) {
  if (!pool || !clusters.length) {
    return;
  }

  await initDb();

  const clusterRows = clusters.map((cluster) => ({
    id: cluster.id,
    headline: cluster.headline,
    summary: cluster.summary,
    why_it_matters: cluster.whyItMatters,
    domain: cluster.domain,
    tags: cluster.tags,
    entities: cluster.entities,
    sources: cluster.sources,
    source_count: cluster.sourceCount,
    confidence: cluster.confidence,
    impact_score: cluster.impactScore,
    first_seen_at: cluster.firstSeenAt,
    last_seen_at: cluster.lastSeenAt,
  }));
  const articleRows = clusters.flatMap((cluster) =>
    cluster.articleIds.map((articleId) => ({
      cluster_id: cluster.id,
      article_id: articleId,
    })),
  );

  await withDbTransaction(async (client) => {
    await client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS cluster(
            id TEXT,
            headline TEXT,
            summary TEXT,
            why_it_matters JSONB,
            domain TEXT,
            tags JSONB,
            entities JSONB,
            sources JSONB,
            source_count INTEGER,
            confidence TEXT,
            impact_score REAL,
            first_seen_at TIMESTAMPTZ,
            last_seen_at TIMESTAMPTZ
          )
        )
        INSERT INTO story_clusters (
          id,
          headline,
          summary,
          why_it_matters,
          domain,
          tags,
          entities,
          sources,
          source_count,
          confidence,
          impact_score,
          first_seen_at,
          last_seen_at
        )
        SELECT
          id,
          headline,
          summary,
          why_it_matters,
          domain,
          tags,
          entities,
          sources,
          source_count,
          confidence,
          impact_score,
          first_seen_at,
          last_seen_at
        FROM input
        ON CONFLICT (id) DO UPDATE SET
          headline = EXCLUDED.headline,
          summary = EXCLUDED.summary,
          why_it_matters = EXCLUDED.why_it_matters,
          domain = EXCLUDED.domain,
          tags = EXCLUDED.tags,
          entities = EXCLUDED.entities,
          sources = EXCLUDED.sources,
          source_count = EXCLUDED.source_count,
          confidence = EXCLUDED.confidence,
          impact_score = EXCLUDED.impact_score,
          first_seen_at = LEAST(story_clusters.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(story_clusters.last_seen_at, EXCLUDED.last_seen_at)
      `,
      [JSON.stringify(clusterRows)],
    );
    await client.query("DELETE FROM story_cluster_articles WHERE cluster_id = ANY($1::text[])", [
      clusters.map((cluster) => cluster.id),
    ]);

    if (articleRows.length) {
      await client.query(
        `
          WITH input AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS article(
              cluster_id TEXT,
              article_id TEXT
            )
          )
          INSERT INTO story_cluster_articles (cluster_id, article_id)
          SELECT cluster_id, article_id
          FROM input
          ON CONFLICT (cluster_id, article_id) DO NOTHING
        `,
        [JSON.stringify(articleRows)],
      );
    }
  });
}

export async function getLatestStoryClusters(
  domain: ArticleDomain | "All" = "All",
  limit = 25,
) {
  if (!pool) {
    return [];
  }

  await initDb();
  const params: Array<string | number> = [limit];
  const domainClause =
    domain === "All"
      ? ""
      : `WHERE c.domain = $${params.push(domain)}`;

  const result = await pool.query<StoredStoryClusterRow>(
    `
      SELECT
        c.*,
        COALESCE(json_agg(sca.article_id ORDER BY sca.article_id) FILTER (WHERE sca.article_id IS NOT NULL), '[]') AS article_ids
      FROM story_clusters c
      LEFT JOIN story_cluster_articles sca ON sca.cluster_id = c.id
      ${domainClause}
      GROUP BY c.id
      ORDER BY c.impact_score DESC, c.last_seen_at DESC
      LIMIT $1
    `,
    params,
  );

  return result.rows.map(storyClusterFromRow);
}

export async function getClusterArticles(clusterId: string) {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredArticleRow>(
    `
      SELECT a.*
      FROM story_cluster_articles sca
      JOIN articles a ON a.id = sca.article_id
      WHERE sca.cluster_id = $1
      ORDER BY a.published_at DESC
    `,
    [clusterId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    date: new Date(row.published_at).toISOString().slice(0, 10),
    processed_at: new Date(row.processed_at).toISOString(),
    week: new Date(row.published_at).toISOString().slice(0, 7),
    domain: row.domain,
    headline: row.headline,
    summary: row.summary,
    source: row.source ?? undefined,
    url: row.url ?? undefined,
    tags: row.tags ?? [],
    importance: row.importance,
  }));
}

export async function getLatestArticles(
  domain: ArticleDomain | "All" = "All",
  limit = 100,
) {
  if (!pool) {
    return [];
  }

  await initDb();
  const params: Array<string | number> = [limit];
  const domainClause =
    domain === "All"
      ? ""
      : `WHERE domain = $${params.push(domain)}`;
  const result = await pool.query<StoredArticleRow>(
    `
      SELECT
        id,
        headline,
        summary,
        domain,
        tags,
        importance,
        source,
        url,
        published_at,
        processed_at
      FROM articles
      ${domainClause}
      ORDER BY published_at DESC, processed_at DESC
      LIMIT $1
    `,
    params,
  );

  return result.rows.map(articleFromStoredRow);
}

export async function getLatestBrief() {
  if (!pool) {
    return null;
  }

  await initDb();
  const result = await pool.query<StoredBriefRow>(
    `
      SELECT week, content
      FROM briefs
      ORDER BY week DESC
      LIMIT 1
    `,
  );

  return result.rows[0]?.content ?? null;
}

export async function getLatestInsightReport(): Promise<InsightEngineResult | null> {
  if (!pool) {
    return null;
  }

  await initDb();
  const result = await pool.query<StoredInsight>(
    `
      SELECT week, title, explanation, confidence
      FROM insights
      WHERE week = (SELECT week FROM insights ORDER BY week DESC LIMIT 1)
      ORDER BY id ASC
    `,
  );

  if (!result.rows.length) {
    return null;
  }

  return {
    insights: result.rows.map((row) => ({
      title: row.title,
      explanation: row.explanation,
      confidence: row.confidence as "low" | "medium" | "high",
    })),
    inflections: [],
    crossDomainShifts: [],
    generatedAt: new Date().toISOString(),
    usedFallback: true,
  };
}

function userFeedbackFromRow(row: StoredUserFeedbackRow): UserFeedback {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    action: row.action,
    value: row.value,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function userAffinityFromRow(row: StoredUserAffinityRow): UserAffinity {
  return {
    key: row.key,
    type: row.type,
    score: Number(row.score),
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : new Date().toISOString(),
  };
}

function ruleFromRow(row: StoredRuleRow): PersonalizationRule {
  return {
    id: row.id,
    type: row.type,
    field: row.field,
    value: row.value,
    weight: Number(row.weight),
  };
}

function narrativeFromRow(row: StoredNarrativeRow): NarrativeThread {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    direction: row.direction,
    tags: row.tags ?? [],
    entities: row.entities ?? [],
    clusterIds: row.cluster_ids ?? [],
    timeline: row.timeline ?? [],
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    strength: Number(row.strength),
  };
}

function trendFromRow(row: StoredTrendSignalRow): TrendSignal {
  return {
    tag: row.tag,
    direction: row.direction,
    velocity: Number(row.velocity),
    current: Number(row.current_count),
    previous: Number(row.previous_count),
    points: row.points ?? [],
  };
}

function connectionFromRow(row: StoredConnectionRow): ConnectionStrength {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    sourceType: row.source_type,
    targetType: row.target_type,
    weight: Number(row.weight),
    clusterIds: row.cluster_ids ?? [],
  };
}

function scenarioFromRow(row: StoredScenarioRow): Scenario {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    drivers: row.drivers ?? [],
    likelihood: row.likelihood,
    timeHorizon: row.time_horizon,
  };
}

function implicationFromRow(row: StoredImplicationRow): ScenarioImplication {
  return {
    scenarioId: row.scenario_id,
    consequences: row.consequences ?? [],
    domainImpacts: row.domain_impacts ?? [],
  };
}

function watchItemFromRow(row: StoredWatchItemRow): WatchItem {
  return {
    scenarioId: row.scenario_id,
    signals: row.signals ?? [],
    indicators: row.indicators ?? [],
  };
}

export async function saveUserFeedback(input: {
  clusterId: string;
  action: string;
  value?: number | null;
}) {
  if (!pool) {
    return null;
  }

  await initDb();
  const result = await pool.query<StoredUserFeedbackRow>(
    `
      INSERT INTO user_feedback (cluster_id, action, value)
      VALUES ($1, $2, $3)
      RETURNING id, cluster_id, action, value, created_at
    `,
    [input.clusterId, input.action, input.value ?? null],
  );

  return result.rows[0] ? userFeedbackFromRow(result.rows[0]) : null;
}

export async function getUserFeedback(limit = 250) {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredUserFeedbackRow>(
    `
      SELECT id, cluster_id, action, value, created_at
      FROM user_feedback
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(userFeedbackFromRow);
}

export async function updateAffinity(input: {
  key: string;
  type: UserAffinityType;
  delta?: number;
  score?: number;
}) {
  if (!pool) {
    return null;
  }

  await initDb();
  const score = Number(input.score ?? input.delta ?? 0);
  const useAbsoluteScore = input.score !== undefined;
  const result = await pool.query<StoredUserAffinityRow>(
    `
      INSERT INTO user_affinity (key, type, score, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (key) DO UPDATE SET
        type = EXCLUDED.type,
        score = CASE
          WHEN $4::boolean THEN EXCLUDED.score
          ELSE user_affinity.score + EXCLUDED.score
        END,
        updated_at = NOW()
      RETURNING key, type, score, updated_at
    `,
    [input.key, input.type, score, useAbsoluteScore],
  );

  return result.rows[0] ? userAffinityFromRow(result.rows[0]) : null;
}

export async function getAffinities() {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredUserAffinityRow>(
    `
      SELECT key, type, score, updated_at
      FROM user_affinity
      ORDER BY ABS(score) DESC, updated_at DESC
    `,
  );

  return result.rows.map(userAffinityFromRow);
}

export async function getRules() {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredRuleRow>(
    `
      SELECT id, type, field, value, weight
      FROM rules
      ORDER BY id ASC
    `,
  );

  return result.rows.map(ruleFromRow);
}

export async function saveNarratives(narratives: NarrativeThread[]) {
  if (!pool || !narratives.length) {
    return;
  }

  await initDb();

  const rows = narratives.map((narrative) => ({
    id: narrative.id,
    title: narrative.title,
    summary: narrative.summary,
    direction: narrative.direction,
    tags: narrative.tags,
    entities: narrative.entities,
    cluster_ids: narrative.clusterIds,
    timeline: narrative.timeline,
    first_seen_at: narrative.firstSeenAt,
    last_seen_at: narrative.lastSeenAt,
    strength: narrative.strength,
  }));

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS narrative(
            id TEXT,
            title TEXT,
            summary TEXT,
            direction TEXT,
            tags JSONB,
            entities JSONB,
            cluster_ids JSONB,
            timeline JSONB,
            first_seen_at TIMESTAMPTZ,
            last_seen_at TIMESTAMPTZ,
            strength REAL
          )
        )
        INSERT INTO narrative_threads (
          id,
          title,
          summary,
          direction,
          tags,
          entities,
          cluster_ids,
          timeline,
          first_seen_at,
          last_seen_at,
          strength
        )
        SELECT
          id,
          title,
          summary,
          direction,
          tags,
          entities,
          cluster_ids,
          timeline,
          first_seen_at,
          last_seen_at,
          strength
        FROM input
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          direction = EXCLUDED.direction,
          tags = EXCLUDED.tags,
          entities = EXCLUDED.entities,
          cluster_ids = EXCLUDED.cluster_ids,
          timeline = EXCLUDED.timeline,
          first_seen_at = LEAST(narrative_threads.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(narrative_threads.last_seen_at, EXCLUDED.last_seen_at),
          strength = EXCLUDED.strength
      `,
      [JSON.stringify(rows)],
    ),
  );
}

export async function getNarratives(limit = 12) {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredNarrativeRow>(
    `
      SELECT *
      FROM narrative_threads
      ORDER BY strength DESC, last_seen_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(narrativeFromRow);
}

export async function saveTrends(trends: TrendSignal[]) {
  if (!pool || !trends.length) {
    return;
  }

  await initDb();
  const computedAt = new Date().toISOString();
  const rows = trends.map((trend) => ({
    tag: trend.tag,
    direction: trend.direction,
    velocity: trend.velocity,
    current_count: trend.current,
    previous_count: trend.previous,
    points: trend.points,
    computed_at: computedAt,
  }));

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS trend(
            tag TEXT,
            direction TEXT,
            velocity REAL,
            current_count INTEGER,
            previous_count INTEGER,
            points JSONB,
            computed_at TIMESTAMPTZ
          )
        )
        INSERT INTO trend_signals (
          tag,
          direction,
          velocity,
          current_count,
          previous_count,
          points,
          computed_at
        )
        SELECT tag, direction, velocity, current_count, previous_count, points, computed_at
        FROM input
        ON CONFLICT (tag) DO UPDATE SET
          direction = EXCLUDED.direction,
          velocity = EXCLUDED.velocity,
          current_count = EXCLUDED.current_count,
          previous_count = EXCLUDED.previous_count,
          points = EXCLUDED.points,
          computed_at = EXCLUDED.computed_at
      `,
      [JSON.stringify(rows)],
    ),
  );
}

export async function getTrends(limit = 12) {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredTrendSignalRow>(
    `
      SELECT *
      FROM trend_signals
      ORDER BY ABS(velocity) DESC, current_count DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(trendFromRow);
}

export async function saveConnections(connections: ConnectionStrength[]) {
  if (!pool || !connections.length) {
    return;
  }

  await initDb();
  const computedAt = new Date().toISOString();
  const rows = connections.map((connection) => ({
    id: connection.id,
    source: connection.source,
    target: connection.target,
    source_type: connection.sourceType,
    target_type: connection.targetType,
    weight: connection.weight,
    cluster_ids: connection.clusterIds,
    computed_at: computedAt,
  }));

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS connection(
            id TEXT,
            source TEXT,
            target TEXT,
            source_type TEXT,
            target_type TEXT,
            weight REAL,
            cluster_ids JSONB,
            computed_at TIMESTAMPTZ
          )
        )
        INSERT INTO connections (
          id,
          source,
          target,
          source_type,
          target_type,
          weight,
          cluster_ids,
          computed_at
        )
        SELECT id, source, target, source_type, target_type, weight, cluster_ids, computed_at
        FROM input
        ON CONFLICT (id) DO UPDATE SET
          source = EXCLUDED.source,
          target = EXCLUDED.target,
          source_type = EXCLUDED.source_type,
          target_type = EXCLUDED.target_type,
          weight = EXCLUDED.weight,
          cluster_ids = EXCLUDED.cluster_ids,
          computed_at = EXCLUDED.computed_at
      `,
      [JSON.stringify(rows)],
    ),
  );
}

export async function getConnections(limit = 15) {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredConnectionRow>(
    `
      SELECT *
      FROM connections
      ORDER BY weight DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(connectionFromRow);
}

export async function saveScenarios(scenarios: Scenario[]) {
  if (!pool || !scenarios.length) {
    return;
  }

  await initDb();
  const createdAt = new Date().toISOString();
  const rows = scenarios.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    drivers: scenario.drivers,
    likelihood: scenario.likelihood,
    time_horizon: scenario.timeHorizon,
    created_at: createdAt,
  }));

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS scenario(
            id TEXT,
            title TEXT,
            description TEXT,
            drivers JSONB,
            likelihood TEXT,
            time_horizon TEXT,
            created_at TIMESTAMPTZ
          )
        )
        INSERT INTO scenarios (
          id,
          title,
          description,
          drivers,
          likelihood,
          time_horizon,
          created_at
        )
        SELECT id, title, description, drivers, likelihood, time_horizon, created_at
        FROM input
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          drivers = EXCLUDED.drivers,
          likelihood = EXCLUDED.likelihood,
          time_horizon = EXCLUDED.time_horizon,
          created_at = EXCLUDED.created_at
      `,
      [JSON.stringify(rows)],
    ),
  );
}

export async function getScenarios(limit = 10) {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredScenarioRow>(
    `
      SELECT *
      FROM scenarios
      ORDER BY
        CASE likelihood
          WHEN 'high' THEN 3
          WHEN 'medium' THEN 2
          ELSE 1
        END DESC,
        created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(scenarioFromRow);
}

export async function saveImplications(implications: ScenarioImplication[]) {
  if (!pool || !implications.length) {
    return;
  }

  await initDb();
  const createdAt = new Date().toISOString();
  const rows = implications.map((implication) => ({
    scenario_id: implication.scenarioId,
    consequences: implication.consequences,
    domain_impacts: implication.domainImpacts,
    created_at: createdAt,
  }));

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS implication(
            scenario_id TEXT,
            consequences JSONB,
            domain_impacts JSONB,
            created_at TIMESTAMPTZ
          )
        )
        INSERT INTO implications (
          scenario_id,
          consequences,
          domain_impacts,
          created_at
        )
        SELECT scenario_id, consequences, domain_impacts, created_at
        FROM input
        ON CONFLICT (scenario_id) DO UPDATE SET
          consequences = EXCLUDED.consequences,
          domain_impacts = EXCLUDED.domain_impacts,
          created_at = EXCLUDED.created_at
      `,
      [JSON.stringify(rows)],
    ),
  );
}

export async function getImplications(limit = 10) {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredImplicationRow>(
    `
      SELECT *
      FROM implications
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(implicationFromRow);
}

export async function saveWatchItems(watchItems: WatchItem[]) {
  if (!pool || !watchItems.length) {
    return;
  }

  await initDb();
  const createdAt = new Date().toISOString();
  const rows = watchItems.map((item) => ({
    scenario_id: item.scenarioId,
    signals: item.signals,
    indicators: item.indicators,
    created_at: createdAt,
  }));

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS watch_item(
            scenario_id TEXT,
            signals JSONB,
            indicators JSONB,
            created_at TIMESTAMPTZ
          )
        )
        INSERT INTO watch_items (
          scenario_id,
          signals,
          indicators,
          created_at
        )
        SELECT scenario_id, signals, indicators, created_at
        FROM input
        ON CONFLICT (scenario_id) DO UPDATE SET
          signals = EXCLUDED.signals,
          indicators = EXCLUDED.indicators,
          created_at = EXCLUDED.created_at
      `,
      [JSON.stringify(rows)],
    ),
  );
}

export async function getWatchItems(limit = 10) {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredWatchItemRow>(
    `
      SELECT *
      FROM watch_items
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(watchItemFromRow);
}

function rowsFromAnalysis(analysis: PatternAnalysis): StoredPatternRow[] {
  const topTagCounts = new Map(analysis.topTags.map((entry) => [entry.tag, entry.count]));
  const deltas = new Map(analysis.trendingUp.map((entry) => [entry.tag, entry.delta]));
  const combinedTags = Array.from(new Set([...topTagCounts.keys(), ...deltas.keys()]));
  const week =
    analysis.generatedAt.slice(0, 10).replace(/-\d{2}$/, "") || analysis.generatedAt;

  return combinedTags.map((tag) => ({
    week,
    domain: analysis.domain,
    tag,
    count: topTagCounts.get(tag) ?? 0,
    delta: deltas.get(tag) ?? 0,
  }));
}

export async function savePatternSnapshot(analysis: PatternAnalysis) {
  if (!pool) {
    return;
  }

  await initDb();

  const rows = rowsFromAnalysis(analysis);
  if (!rows.length) {
    return;
  }

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS pattern(
            week TEXT,
            domain TEXT,
            tag TEXT,
            count INTEGER,
            delta INTEGER
          )
        )
        INSERT INTO patterns (week, domain, tag, count, delta)
        SELECT week, domain, tag, count, delta
        FROM input
        ON CONFLICT (week, domain, tag)
        DO UPDATE SET count = EXCLUDED.count, delta = EXCLUDED.delta
      `,
      [JSON.stringify(rows)],
    ),
  );
}

export async function saveBriefToDb(week: string, content: WeeklyBrief) {
  if (!pool) {
    return;
  }

  await initDb();
  await pool.query(
    `
      INSERT INTO briefs (week, content)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (week)
      DO UPDATE SET content = EXCLUDED.content
    `,
    [week, JSON.stringify(content)],
  );
}

export async function saveInsightsToDb(
  week: string,
  insights: Array<{ title: string; explanation: string; confidence: string }>,
) {
  if (!pool || !insights.length) {
    return;
  }

  await initDb();
  const rows = insights.map((insight) => ({
    week,
    title: insight.title,
    explanation: insight.explanation,
    confidence: insight.confidence,
    content: insight,
  }));

  await withDbTransaction((client) =>
    client.query(
      `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS insight(
            week TEXT,
            title TEXT,
            explanation TEXT,
            confidence TEXT,
            content JSONB
          )
        )
        INSERT INTO insights (week, title, explanation, confidence, content)
        SELECT week, title, explanation, confidence, content
        FROM input
        ON CONFLICT (week, title)
        DO UPDATE SET
          explanation = EXCLUDED.explanation,
          confidence = EXCLUDED.confidence,
          content = EXCLUDED.content
      `,
      [JSON.stringify(rows)],
    ),
  );
}

function generatedOutputFromRow(row: StoredGeneratedOutputRow): GeneratedOutput {
  return {
    ...row.content,
    id: row.id,
    type: row.type,
    audience: row.audience,
    title: row.title,
    summary: row.summary,
    sections: row.sections ?? [],
    metadata: {
      ...row.metadata,
      generatedAt: row.metadata?.generatedAt ?? new Date(row.created_at).toISOString(),
    },
  };
}

function templateFromRow(row: StoredTemplateRow): OutputTemplate {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    version: Number(row.version),
    defaultAudience: row.default_audience,
    sections: row.sections ?? [],
  };
}

export async function saveGeneratedOutputToDb(output: GeneratedOutput) {
  if (!pool) {
    return;
  }

  await initDb();
  await pool.query(
    `
      INSERT INTO generated_outputs (
        id,
        type,
        audience,
        title,
        summary,
        sections,
        metadata,
        content,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        audience = EXCLUDED.audience,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        sections = EXCLUDED.sections,
        metadata = EXCLUDED.metadata,
        content = EXCLUDED.content,
        created_at = EXCLUDED.created_at
    `,
    [
      output.id,
      output.type,
      output.audience,
      output.title,
      output.summary,
      JSON.stringify(output.sections),
      JSON.stringify(output.metadata),
      JSON.stringify(output),
      output.metadata.generatedAt,
    ],
  );
}

export async function getGeneratedOutputs(input?: {
  type?: GeneratedOutput["type"];
  audience?: GeneratedOutput["audience"];
  limit?: number;
}) {
  if (!pool) {
    return [];
  }

  await initDb();
  const params: Array<string | number> = [input?.limit ?? 20];
  const filters: string[] = [];

  if (input?.type) {
    filters.push(`type = $${params.push(input.type)}`);
  }

  if (input?.audience) {
    filters.push(`audience = $${params.push(input.audience)}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await pool.query<StoredGeneratedOutputRow>(
    `
      SELECT *
      FROM generated_outputs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $1
    `,
    params,
  );

  return result.rows.map(generatedOutputFromRow);
}

export async function saveTemplateToDb(template: OutputTemplate) {
  if (!pool) {
    return;
  }

  await initDb();
  await pool.query(
    `
      INSERT INTO templates (
        id,
        label,
        description,
        version,
        default_audience,
        sections,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW(),NOW())
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        version = EXCLUDED.version,
        default_audience = EXCLUDED.default_audience,
        sections = EXCLUDED.sections,
        updated_at = NOW()
    `,
    [
      template.id,
      template.label,
      template.description,
      template.version,
      template.defaultAudience,
      JSON.stringify(template.sections),
    ],
  );
}

export async function getTemplates() {
  if (!pool) {
    return [];
  }

  await initDb();
  const result = await pool.query<StoredTemplateRow>(
    `
      SELECT *
      FROM templates
      ORDER BY id ASC
    `,
  );

  return result.rows.map(templateFromRow);
}

export async function getTagTrend(
  tag: string,
  domain: ArticleDomain | "All" = "All",
  weeks = 12,
) {
  if (!pool) {
    return [];
  }

  await initDb();
  const params: Array<string | number> = [tag, weeks];
  const domainClause =
    domain === "All"
      ? ""
      : `AND domain = $${params.push(domain)}`;

  const result = await pool.query<TagTrendPoint>(
    `
      SELECT week, count
      FROM patterns
      WHERE tag = $1
      ${domainClause}
      ORDER BY week DESC
      LIMIT $2
    `,
    params,
  );

  return result.rows.reverse();
}

export async function analyzeLongTermTrends(
  domain: ArticleDomain | "All" = "All",
) : Promise<LongTermTrendAnalysis> {
  if (!pool) {
    return { rising: [], declining: [], stable: [], available: false };
  }

  await initDb();
  const params: Array<string | number> = [12];
  const domainClause =
    domain === "All"
      ? ""
      : `WHERE domain = $${params.push(domain)}`;

  const result = await pool.query<StoredPatternRow>(
    `
      SELECT week, tag, count, delta, domain
      FROM patterns
      ${domainClause}
      ORDER BY week DESC
      LIMIT $1 * 50
    `,
    params,
  );

  const grouped = new Map<string, TagTrendPoint[]>();

  for (const row of result.rows) {
    const current = grouped.get(row.tag) ?? [];
    current.push({ week: row.week, count: row.count });
    grouped.set(row.tag, current);
  }

  const trends = Array.from(grouped.entries()).map(([tag, points]) => {
    const sorted = [...points].sort((left, right) => left.week.localeCompare(right.week));
    const first = sorted[0]?.count ?? 0;
    const last = sorted.at(-1)?.count ?? 0;
    const average =
      sorted.reduce((sum, point) => sum + point.count, 0) / Math.max(sorted.length, 1);

    return {
      tag,
      points: sorted.slice(-12),
      first,
      last,
      delta: last - first,
      average,
    };
  });

  const rising = trends
    .filter((trend) => trend.points.length >= 2 && trend.delta >= 2)
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 6);

  const declining = trends
    .filter((trend) => trend.points.length >= 2 && trend.delta <= -2)
    .sort((left, right) => left.delta - right.delta)
    .slice(0, 6);

  const stable = trends
    .filter((trend) => trend.points.length >= 3 && Math.abs(trend.delta) <= 1 && trend.average >= 2)
    .sort((left, right) => right.average - left.average)
    .slice(0, 6);

  return { rising, declining, stable, available: true };
}
