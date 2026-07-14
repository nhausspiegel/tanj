import type { Article, ArticleDomain, StoryCluster } from "./types";

const STRATEGIC_TAGS = new Set([
  "ai_infrastructure",
  "chips",
  "energy_constraint",
  "data_centers",
  "frontier_models",
  "security",
  "regulation",
  "inference",
  "gpu",
  "cloud",
]);

type ImpactOptions = {
  preferredTags?: string[];
  preferredDomains?: ArticleDomain[];
  previousClusters?: StoryCluster[];
  now?: Date;
  // Trends plots events on a time axis, so its impact measure must not also
  // fold in recency (that double-counts time). The clustering-internal sort
  // keeps recency; the Trends display passes this true.
  excludeRecency?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function articleById(articles: Article[]) {
  return new Map(articles.map((article) => [article.id, article]));
}

export function recencyScoreFromAgeHours(ageHours: number): number {
  if (ageHours <= 12) return 2;
  if (ageHours <= 48) return 1.5;
  if (ageHours <= 168) return 1;
  return 0.5;
}

function recencyScore(cluster: StoryCluster, now = new Date()) {
  const ageHours = (now.getTime() - new Date(cluster.lastSeenAt).getTime()) / (60 * 60 * 1000);
  return recencyScoreFromAgeHours(ageHours);
}

export function tagAlignmentScoreFromTags(tags: string[], preferredTags?: string[]): number {
  const lowered = tags.map((tag) => tag.toLowerCase());
  const preferences = preferredTags?.length
    ? new Set(preferredTags.map((tag) => tag.toLowerCase()))
    : STRATEGIC_TAGS;
  const matches = lowered.filter((tag) => preferences.has(tag)).length;

  return clamp(matches * 0.6, 0, 2);
}

function tagAlignmentScore(cluster: StoryCluster, preferredTags?: string[]) {
  return tagAlignmentScoreFromTags(cluster.tags, preferredTags);
}

function domainAlignmentScore(cluster: StoryCluster, preferredDomains?: ArticleDomain[]) {
  if (!preferredDomains?.length) {
    return 0;
  }

  return preferredDomains.includes(cluster.domain) ? 1 : 0;
}

export function importanceScoreFromValues(values: number[]): number {
  if (!values.length) {
    return 1.5;
  }

  const max = Math.max(...values);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;

  return max * 0.45 + average * 0.25;
}

function importanceScore(cluster: StoryCluster, articles: Article[]) {
  const lookup = articleById(articles);
  const members = cluster.articleIds
    .map((id) => lookup.get(id))
    .filter((article): article is Article => Boolean(article));

  return importanceScoreFromValues(members.map((article) => article.importance));
}

export function noveltyScoreFromOverlap(
  tags: string[],
  headline: string,
  previous: Array<{ tags: string[]; headline: string }>,
): number {
  if (!previous.length) {
    return 1;
  }

  const tagSet = new Set(tags);
  const similar = previous.some((prev) => {
    const prevTags = prev.tags ?? [];
    const overlap = prevTags.filter((tag) => tagSet.has(tag)).length;
    const overlapRatio = overlap / Math.max(new Set([...prevTags, ...tags]).size, 1);
    return overlapRatio >= 0.6 || (prev.headline ?? "").toLowerCase() === headline.toLowerCase();
  });

  return similar ? 0.25 : 1;
}

function noveltyScore(cluster: StoryCluster, previousClusters: StoryCluster[] = []) {
  return noveltyScoreFromOverlap(cluster.tags, cluster.headline, previousClusters);
}

export function computeClusterConfidence(cluster: Pick<StoryCluster, "sourceCount" | "sources">) {
  const sourceCount = cluster.sourceCount || cluster.sources.length;

  if (sourceCount >= 3) return "high";
  if (sourceCount === 2) return "medium";
  return "low";
}

export function sourceCountScore(sourceCount: number): number {
  return clamp(sourceCount * 1.8, 1, 5);
}

export function computeClusterImpactScore(
  cluster: StoryCluster,
  articles: Article[],
  options: ImpactOptions = {},
) {
  const sourceScore = sourceCountScore(cluster.sourceCount);
  const rawScore =
    sourceScore +
    (options.excludeRecency ? 0 : recencyScore(cluster, options.now)) +
    importanceScore(cluster, articles) +
    tagAlignmentScore(cluster, options.preferredTags) +
    domainAlignmentScore(cluster, options.preferredDomains) +
    noveltyScore(cluster, options.previousClusters);

  return Number(clamp(rawScore, 1, 10).toFixed(1));
}

export function computeImpactScore(
  cluster: StoryCluster,
  articles: Article[] = [],
  options: ImpactOptions = {},
) {
  return computeClusterImpactScore(cluster, articles, options);
}
