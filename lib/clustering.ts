import { headlineSimilarity, isDuplicate, isLikelySameStory, tokenizeText } from "./dedup";
import { extractEntities, mergeEntities } from "./entities";
import { computeClusterConfidence, computeClusterImpactScore } from "./scoring";
import type { Article, ArticleDomain, StoryCluster } from "./types";

const CLUSTER_HEADLINE_THRESHOLD = 0.58;
const ENTITY_OVERLAP_THRESHOLD = 2;
const TOPIC_OVERLAP_THRESHOLD = 3;

// Deliberately excludes ubiquitous tech terms (ai, cloud, compute, data,
// memory, model, power) — nearly every article in this feed set contains
// them, so they merged unrelated stories into mega-clusters.
const TOPIC_KEYWORDS = new Set([
  "agent",
  "battery",
  "chip",
  "cyber",
  "datacenter",
  "energy",
  "gpu",
  "inference",
  "nuclear",
  "openai",
  "regulation",
  "robot",
  "semiconductor",
  "security",
]);

function stableSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function extractTopicKeywords(article: Article) {
  const tokens = tokenizeText(`${article.headline} ${article.summary} ${article.tags.join(" ")}`);
  return unique(tokens.filter((token) => TOPIC_KEYWORDS.has(token) || article.tags.includes(token)));
}

// Matches entities.ts normalizeEntity so we can drop the article's own source,
// which extractEntities folds in as an entity — otherwise every two stories
// from the same feed share an "entity" and merge regardless of topic.
function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

type ArticleSignals = { entities: string[]; topics: string[] };

function buildSignals(article: Article): ArticleSignals {
  const sourceKey = article.source ? normalizeForMatch(article.source) : "";
  const entities = extractEntities(article)
    .map((entity) => entity.normalized)
    .filter((normalized) => normalized && normalized !== sourceKey);
  return { entities, topics: extractTopicKeywords(article) };
}

function overlapCount(left: string[], right: string[]) {
  const rightSet = new Set(right.map((value) => value.toLowerCase()));
  return left.filter((value) => rightSet.has(value.toLowerCase())).length;
}

function primaryDomain(articles: Article[]): ArticleDomain {
  const domainCounts = new Map<ArticleDomain, number>();

  for (const article of articles) {
    domainCounts.set(article.domain, (domainCounts.get(article.domain) ?? 0) + 1);
  }

  return [...domainCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    articles[0]?.domain ??
    "General";
}

function clusterSummary(articles: Article[]) {
  const lead = articles
    .slice()
    .sort((left, right) => right.importance - left.importance)[0];
  const sourceCount = unique(articles.map((article) => article.source)).length;

  if (articles.length === 1) {
    return lead.summary;
  }

  return `${lead.summary} Tracked across ${articles.length} articles from ${sourceCount} sources.`;
}

export function fallbackWhyItMatters(
  cluster: Pick<StoryCluster, "tags" | "domain" | "sources" | "entities">,
) {
  const leadTag = cluster.tags[0]?.replace(/_/g, " ") ?? "this signal";
  const leadEntity = cluster.entities.find((entity) => entity.type !== "other")?.name;
  const subject = leadEntity ?? leadTag;
  const sourceText =
    cluster.sources.length > 1
      ? `${cluster.sources.length} sources are reinforcing the story`
      : "one source is reporting the story";

  return [
    `${sourceText}, making ${subject} worth tracking in ${cluster.domain}.`,
    `The technical implication centers on execution constraints around ${leadTag}.`,
    "Watch for follow-on reporting, customer adoption, regulation, or supply-chain effects.",
  ];
}

// Match a candidate against the cluster SEED (its first/strongest article),
// not against every member. Single-link matching over all members let a big
// cluster absorb anything resembling any one of its hundreds of members,
// snowballing unrelated stories into one row. Seed matching keeps a cluster
// anchored to one story. Entity/topic overlap additionally requires the same
// domain so a lone shared name can't bridge two different beats.
function matchesSeed(
  article: Article,
  signals: ArticleSignals,
  seed: Article,
  seedSignals: ArticleSignals,
) {
  if (isLikelySameStory(article, seed)) {
    return true;
  }

  if (headlineSimilarity(article.headline, seed.headline) >= CLUSTER_HEADLINE_THRESHOLD) {
    return true;
  }

  if (article.domain !== seed.domain) {
    return false;
  }

  if (overlapCount(signals.entities, seedSignals.entities) >= ENTITY_OVERLAP_THRESHOLD) {
    return true;
  }

  return overlapCount(signals.topics, seedSignals.topics) >= TOPIC_OVERLAP_THRESHOLD;
}

function buildCluster(articles: Article[]): StoryCluster {
  const sorted = [...articles].sort((left, right) => {
    return (
      right.importance - left.importance ||
      new Date(right.date).getTime() - new Date(left.date).getTime()
    );
  });
  const lead = sorted[0];
  const times = articles.map((article) =>
    new Date(article.processed_at || article.date).getTime(),
  );
  const firstSeenAt = new Date(Math.min(...times)).toISOString();
  const lastSeenAt = new Date(Math.max(...times)).toISOString();
  const tags = unique(articles.flatMap((article) => article.tags)).slice(0, 8);
  const sources = unique(articles.map((article) => article.source));
  const entities = mergeEntities(articles.map((article) => extractEntities(article))).slice(0, 12);
  const cluster: StoryCluster = {
    id: `cluster-${stableSlug(lead.headline || lead.id)}`,
    headline: lead.headline,
    summary: clusterSummary(sorted),
    whyItMatters: [],
    domain: primaryDomain(articles),
    tags,
    entities,
    articleIds: sorted.map((article) => article.id),
    sources,
    sourceCount: sources.length,
    confidence: "low",
    impactScore: 1,
    firstSeenAt,
    lastSeenAt,
  };

  cluster.confidence = computeClusterConfidence(cluster);
  cluster.impactScore = computeClusterImpactScore(cluster, articles);
  cluster.whyItMatters = fallbackWhyItMatters(cluster);
  return cluster;
}

export function deduplicateArticles(articles: Article[]) {
  const deduped: Article[] = [];

  for (const article of articles) {
    const existingIndex = deduped.findIndex((candidate) => isDuplicate(article, candidate));

    if (existingIndex === -1) {
      deduped.push(article);
      continue;
    }

    if (article.importance >= deduped[existingIndex].importance) {
      deduped[existingIndex] = article;
    }
  }

  return deduped;
}

export function clusterArticles(articles: Article[]) {
  const sortedArticles = [...articles].sort((left, right) => {
    return (
      new Date(right.date).getTime() - new Date(left.date).getTime() ||
      right.importance - left.importance
    );
  });

  // Precompute entity/topic signals + cheap blocking keys once per article.
  // The old path recomputed extractEntities for both sides of every O(n²)
  // comparison; worse, once clustering is correct there are hundreds of
  // clusters, so a naive scan runs the expensive Levenshtein headline score
  // against every seed. Blocking fixes both: any merge path requires a shared
  // entity, topic, or headline token, so we only compare an article against
  // seeds that share at least one such key.
  const signalsById = new Map<string, ArticleSignals>();
  const keysById = new Map<string, string[]>();
  for (const article of sortedArticles) {
    const signals = buildSignals(article);
    signalsById.set(article.id, signals);
    keysById.set(
      article.id,
      unique([...tokenizeText(article.headline), ...signals.entities, ...signals.topics]),
    );
  }

  const groups: Array<{ seed: Article; seedSignals: ArticleSignals; members: Article[] }> = [];
  const seedsByKey = new Map<string, number[]>();

  for (const article of sortedArticles) {
    const signals = signalsById.get(article.id) as ArticleSignals;
    const keys = keysById.get(article.id) as string[];

    const candidateIndices = new Set<number>();
    for (const key of keys) {
      const seeds = seedsByKey.get(key);
      if (seeds) for (const index of seeds) candidateIndices.add(index);
    }

    let matchedIndex = -1;
    // Iterate candidates in creation order so first-match-wins stays stable.
    for (const index of [...candidateIndices].sort((left, right) => left - right)) {
      const candidate = groups[index];
      if (matchesSeed(article, signals, candidate.seed, candidate.seedSignals)) {
        matchedIndex = index;
        break;
      }
    }

    if (matchedIndex >= 0) {
      groups[matchedIndex].members.push(article);
    } else {
      const newIndex = groups.length;
      groups.push({ seed: article, seedSignals: signals, members: [article] });
      // Register the new seed's keys so later articles can find it.
      for (const key of keys) {
        const seeds = seedsByKey.get(key);
        if (seeds) seeds.push(newIndex);
        else seedsByKey.set(key, [newIndex]);
      }
    }
  }

  return groups
    .map((group) => buildCluster(group.members))
    .sort((left, right) => right.impactScore - left.impactScore);
}
