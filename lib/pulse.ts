import {
  ARTICLE_DOMAINS,
  DOMAIN_LABELS,
  type Article,
  type ArticleDomain,
  type StoryCluster,
} from "@/lib/types";
import { clusterArticles } from "@/lib/clustering";
import { outletTrust, sourceComposite } from "@/lib/outlets";
import {
  importanceScoreFromValues,
  noveltyScoreFromOverlap,
  recencyScoreFromAgeHours,
  sourceCountScore,
  tagAlignmentScoreFromTags,
} from "@/lib/scoring";

// ── TANJ palette ──────────────────────────────────────────────────
// Exported as CSS custom properties (defined in app/globals.css :root),
// not raw hex, so dev-mode theme overrides (Settings) can repaint the whole
// app at runtime via document.documentElement.style.setProperty — no need
// to thread a color prop through every consuming component.
//
// Primary accent: periwinkle by default. Used for brand chrome, buttons,
// active states, badges.
export const PULSE_ACCENT = "var(--pulse-accent)";
// Secondary accent: sky blue by default. Reserved for AI-generated content
// labels (AI TL;DR, brief/insight eyebrows) — a deliberate second role, not
// a random alternation with the primary.
export const PULSE_ACCENT_SECONDARY = "var(--pulse-accent-secondary)";
// Yellow-green by default. A rare, deliberate highlight — currently only
// the "NEW" badge. Don't blanket-replace PULSE_ACCENT with this.
export const PULSE_ACCENT_HIGHLIGHT = "var(--pulse-accent-highlight)";

// Default hex values backing the CSS custom properties above — used to
// seed :root in globals.css and as the reset target for theme overrides.
export const PULSE_ACCENT_DEFAULT_HEX = "#DEF478";
export const PULSE_ACCENT_SECONDARY_DEFAULT_HEX = "#83CDFF";
export const PULSE_ACCENT_HIGHLIGHT_DEFAULT_HEX = "#DEF478";

// One row per contributing article inside a merged story. reputability/reach
// are 1-5 editorial-trust scores from lib/outlets.ts; composite is the
// recency/reputability/reach blend used to order this array.
export type PulseSourceRef = {
  name: string;
  url?: string;
  hoursAgo: number;
  headline: string; // this contributing article's own title — reliable across every feed, unlike `summary`
  summary: string;
  reputability: number;
  reach: number;
  composite: number;
};

export type PulseStory = {
  id: string;
  domain: ArticleDomain;
  source: string; // lead (most recent) source name — back-compat single display
  timeAgo: string; // time since the most recent contributing source was published
  publishedAt?: string; // full ISO timestamp backing timeAgo, for exact-date tooltips
  processedAt?: string; // when this story was ingested locally — drives the "new" badge
  title: string;
  tldr: string;
  tldrIsAi: boolean; // false when `tldr` is still just the raw feed blurb, not a real AI summary
  excerpt?: string; // real quoted text from the article, distinct from the AI TL;DR
  url?: string; // lead source's article url
  imageUrl?: string; // real thumbnail scraped from the source feed, if any
  importance: number; // 1–5
  tags: string[];
  sources: PulseSourceRef[]; // every contributing article, sorted most-recent-first
  baseScore: number; // 1–10 personalized base, before live vote/save adjustments
  impactScore?: number; // 1–10 cluster impact (source count + recency + importance + alignment + novelty)
  scoreBreakdown?: ArticleScoreBreakdown; // Dashboard-only; powers the score popover's bars
};

// One row of prior scoring history for a story/cluster, read back from
// cluster_history (electron/repositories/memoryRepo.js) to feed novelty
// (Dashboard) and velocity (Trends) terms. `id` is the cluster/article id.
export type PulseHistorySnapshot = {
  id: string;
  tags: string[];
  headline: string;
  sourceCount: number;
  snapshotAt: string;
};

// Domain hue (HSL hue used for dots / badges / thumb gradients). The six
// designed domains keep their spec hues; the rest are spread around the wheel.
export const DOMAIN_HUE: Record<ArticleDomain, number> = {
  LLM: 262,
  Robotics: 178,
  Policy: 214,
  General: 146,
  Materials: 26,
  Consumer: 328,
  AIUse: 292,
  AIInfra: 232,
  Semis: 14,
  Cloud: 200,
  Security: 0,
  Bio: 158,
  Climate: 96,
  Crypto: 44,
  Space: 244,
  Batteries: 72,
  AR: 312,
};

// PULSE-flavored labels for the six hero domains; the rest fall back to the
// shared taxonomy labels.
export const PULSE_DOMAIN_LABELS: Record<ArticleDomain, string> = {
  ...DOMAIN_LABELS,
  LLM: "LLM & Frontier AI",
  General: "General Tech",
  Materials: "Materials & Science",
};

// Row / topic ordering: the six designed domains first, then the rest.
export const PULSE_DOMAIN_ORDER: ArticleDomain[] = [
  "LLM",
  "Robotics",
  "Policy",
  "General",
  "Materials",
  "Consumer",
  ...ARTICLE_DOMAINS.filter(
    (d) => !["LLM", "Robotics", "Policy", "General", "Materials", "Consumer"].includes(d),
  ),
];

export const DEFAULT_FOLLOWED: ArticleDomain[] = ["LLM", "Robotics", "Policy"];

export function defaultFollowed(): Record<string, boolean> {
  const followed: Record<string, boolean> = {};
  for (const d of DEFAULT_FOLLOWED) followed[d] = true;
  return followed;
}

export function domainLabel(domain: ArticleDomain): string {
  return PULSE_DOMAIN_LABELS[domain] ?? domain;
}

// Dev-mode per-domain hue overrides (Settings), applied on top of
// DOMAIN_HUE. Set once via setDomainHueOverrides() when preferences load;
// domainHue() reads it on every call so changes take effect immediately.
let domainHueOverrides: Partial<Record<string, number>> = {};

export function setDomainHueOverrides(overrides: Partial<Record<string, number>> | undefined): void {
  domainHueOverrides = overrides ?? {};
}

export function domainHue(domain: ArticleDomain): number {
  return domainHueOverrides[domain] ?? DOMAIN_HUE[domain] ?? 210;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Stable per-id hash (0–996), mirrors the prototype's deterministic stand-in.
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h;
}

// Layered radial + linear gradient thumbnail from a domain hue. `i` alternates
// the highlight side so a row of cards doesn't look uniform.
export function thumbGradient(hue: number, i: number): string {
  const h2 = (hue + 34) % 360;
  // Muted: low-saturation, low-alpha so the domain hue reads as a subtle tint
  // over the navy rather than a saturated color block.
  return (
    `radial-gradient(120% 130% at ${i % 2 ? 85 : 15}% 0%, hsla(${hue},40%,46%,0.24), transparent 58%), ` +
    `linear-gradient(145deg, hsl(${hue},24%,15%) 0%, hsl(${h2},26%,9%) 80%)`
  );
}

export function cardThumb(domain: ArticleDomain, i: number): string {
  return thumbGradient((domainHue(domain) + (i * 9) % 36) % 360, i);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

// Exact publish date/time for a hover tooltip — "1d ago" alone can't answer
// "1 day ago as of when?".
export function exactDateLabel(value?: string): string {
  if (!value) return "";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "";
  return then.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function relativeTime(value?: string, now: number = Date.now()): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, now - then);
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MINUTE))}m ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.round(diff / DAY)}d ago`;
  if (diff < MONTH) return `${Math.round(diff / WEEK)}w ago`;
  if (diff < YEAR) return `${Math.round(diff / MONTH)}mo ago`;
  return `${Math.round(diff / YEAR)}y ago`;
}

// Source watermark: first token of the source name, first two letters.
export function sourceMark(source: string): string {
  return (source.split(/\s/)[0] || "").slice(0, 2).toUpperCase();
}

function hoursSince(value: string | undefined, now: number): number {
  if (!value) return 24 * 365; // unknown publish time sorts last
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 24 * 365;
  return Math.max(0, (now - then) / (60 * 60 * 1000));
}

export type ArticleScoreBreakdown = {
  recency: number;
  importance: number;
  tag: number;
  novelty: number;
};

// Ceilings for each term, for rendering the breakdown as bars (StoryCard's
// score popover) — matches the term math in articleScoreTerms below.
export const RELEVANCE_MAX: ArticleScoreBreakdown = {
  recency: 2,
  importance: 3.5,
  tag: 2,
  novelty: 1,
};

type ArticleRelevanceInputs = {
  hoursAgo: number;
  importance: number;
  tags: string[];
  headline: string;
  previousStories: PulseHistorySnapshot[];
};

function articleScoreTerms(inputs: ArticleRelevanceInputs): ArticleScoreBreakdown {
  return {
    recency: recencyScoreFromAgeHours(inputs.hoursAgo),
    importance: importanceScoreFromValues([inputs.importance]),
    tag: tagAlignmentScoreFromTags(inputs.tags),
    novelty: noveltyScoreFromOverlap(inputs.tags, inputs.headline, inputs.previousStories),
  };
}

// Dashboard relevance score: "should this show up for you" — one article,
// no corroboration signal (structurally undefined at n=1). See
// pulse_score_plan_new.md for why this differs from the Trends formula.
export function computeArticleRelevanceScore(inputs: ArticleRelevanceInputs): number {
  const terms = articleScoreTerms(inputs);
  return clamp(terms.recency + terms.importance + terms.tag + terms.novelty, 1, 10);
}

// Same math as computeArticleRelevanceScore, unclamped and split by term —
// feeds the score popover's visual bar breakdown on the Dashboard card.
export function explainArticleRelevanceScore(inputs: ArticleRelevanceInputs): ArticleScoreBreakdown {
  return articleScoreTerms(inputs);
}

// Bucketed delta-since-last-snapshot, not a true rate: refresh cadence is
// roughly constant in this app, so normalizing by elapsed hours wouldn't
// change the ranking in practice.
function velocityScore(sourceCount: number, previousSnapshot: PulseHistorySnapshot | undefined): number {
  if (!previousSnapshot) return 0.75;
  const delta = sourceCount - previousSnapshot.sourceCount;
  if (delta >= 2) return 2;
  if (delta === 1) return 1;
  return 0;
}

// Trends momentum score: "what's blowing up right now" — a merged cluster,
// where corroboration and its growth (velocity) are meaningful signals a
// lone article can never carry.
export function computeTrendMomentumScore(inputs: {
  sourceCount: number;
  hoursAgo: number;
  importanceValues: number[];
  previousSnapshot: PulseHistorySnapshot | undefined;
}): number {
  const raw =
    sourceCountScore(inputs.sourceCount) +
    velocityScore(inputs.sourceCount, inputs.previousSnapshot) +
    recencyScoreFromAgeHours(inputs.hoursAgo) +
    importanceScoreFromValues(inputs.importanceValues);
  return clamp(raw, 1, 10);
}

// Wraps a single Dashboard article as a trivial one-article StoryCluster so
// it can ride the same cluster_history snapshot-write payload as real
// Trends clusters. Only used to build that payload, never for scoring.
export function articleToSnapshotCluster(article: Article, baseScore: number): StoryCluster {
  const seenAt = article.processed_at || article.date;
  return {
    id: article.id,
    headline: article.headline,
    summary: article.summary,
    whyItMatters: [],
    domain: article.domain,
    tags: article.tags,
    entities: [],
    articleIds: [article.id],
    sources: [article.source ?? "Unknown"],
    sourceCount: 1,
    confidence: "low",
    impactScore: baseScore,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
  };
}

export function clusterToStory(
  cluster: StoryCluster,
  articlesById: Map<string, Article>,
  now: number,
  previousStories: PulseHistorySnapshot[] = [],
): PulseStory {
  const members = cluster.articleIds
    .map((id) => articlesById.get(id))
    .filter((article): article is Article => Boolean(article));
  const lead = members[0] ?? null;

  const sources: PulseSourceRef[] = members
    .map((article) => {
      const name = article.source ?? "Unknown";
      const hoursAgo = hoursSince(article.publishedAt || article.date, now);
      const { reputability, reach } = outletTrust(name);
      return {
        name,
        url: article.url,
        hoursAgo,
        headline: article.headline,
        summary: article.summary,
        reputability,
        reach,
        composite: sourceComposite(hoursAgo, reputability, reach),
      };
    })
    .sort((a, b) => b.composite - a.composite);

  // Card-level "most recent" still means most recent by time, not trust —
  // keep that distinct from the composite ordering used for the source list.
  const mostRecent = sources.slice().sort((a, b) => a.hoursAgo - b.hoursAgo)[0];

  return {
    id: cluster.id,
    domain: cluster.domain,
    source: mostRecent?.name ?? "Unknown",
    timeAgo: mostRecent ? relativeTime(new Date(now - mostRecent.hoursAgo * 3600_000).toISOString(), now) : "",
    publishedAt: mostRecent ? new Date(now - mostRecent.hoursAgo * 3600_000).toISOString() : undefined,
    // Most recently *ingested* member — whichever source last refreshed the cluster.
    processedAt: members.reduce<string | undefined>((latest, article) => {
      if (!article.processed_at) return latest;
      return !latest || article.processed_at > latest ? article.processed_at : latest;
    }, undefined),
    title: cluster.headline,
    tldr: lead?.summary ?? cluster.summary,
    tldrIsAi: Boolean(lead?.aiEnriched),
    excerpt: lead?.excerpt ?? members.find((article) => article.excerpt)?.excerpt,
    url: mostRecent?.url,
    imageUrl: members.find((article) => article.imageUrl)?.imageUrl,
    importance: lead?.importance ?? 3,
    tags: cluster.tags,
    sources,
    baseScore: computeTrendMomentumScore({
      sourceCount: sources.length,
      hoursAgo: mostRecent?.hoursAgo ?? 24 * 365,
      importanceValues: members.map((article) => article.importance),
      previousSnapshot: previousStories.find((s) => s.id === cluster.id),
    }),
    impactScore: cluster.impactScore,
  };
}

// One story per article — no merging. Used by the Dashboard (Netflix rows,
// hero, My Likes): keep articles separate for now, per-source.
export function articlesToStories(
  articles: Article[],
  now: number = Date.now(),
  previousStories: PulseHistorySnapshot[] = [],
): PulseStory[] {
  return articles.map((article) => {
    const name = article.source ?? "Unknown";
    const hoursAgo = hoursSince(article.publishedAt || article.date, now);
    const { reputability, reach } = outletTrust(name);
    const sourceRef: PulseSourceRef = {
      name,
      url: article.url,
      hoursAgo,
      headline: article.headline,
      summary: article.summary,
      reputability,
      reach,
      composite: sourceComposite(hoursAgo, reputability, reach),
    };
    return {
      id: article.id,
      domain: article.domain,
      source: name,
      timeAgo: relativeTime(article.publishedAt || article.date, now),
      publishedAt: article.publishedAt || article.date || undefined,
      processedAt: article.processed_at || undefined,
      title: article.headline,
      tldr: article.summary,
      tldrIsAi: Boolean(article.aiEnriched),
      excerpt: article.excerpt,
      url: article.url,
      imageUrl: article.imageUrl,
      importance: article.importance,
      tags: article.tags,
      sources: [sourceRef],
      baseScore: computeArticleRelevanceScore({
        hoursAgo,
        importance: article.importance,
        tags: article.tags,
        headline: article.headline,
        previousStories,
      }),
      scoreBreakdown: explainArticleRelevanceScore({
        hoursAgo,
        importance: article.importance,
        tags: article.tags,
        headline: article.headline,
        previousStories,
      }),
    };
  });
}

// One story per CLUSTER — merges same-story articles from different outlets
// and boosts score for corroboration. Used only by Trends (the ranked feed).
export function clusterArticlesToStories(
  articles: Article[],
  now: number = Date.now(),
  previousStories: PulseHistorySnapshot[] = [],
): PulseStory[] {
  const clusters = clusterArticles(articles);
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  return clusters.map((cluster) => clusterToStory(cluster, articlesById, now, previousStories));
}

export type PulseVoteMap = Record<string, 1 | -1 | 0>;
export type PulseBoolMap = Record<string, boolean>;

// Real base score + a small "you follow this domain" nudge. Clamped 1–10,
// shown as "N.N score".
export function computeScore(story: PulseStory, followed: PulseBoolMap): number {
  return clamp(story.baseScore + (followed[story.domain] ? 1 : 0), 1, 10);
}

export function scoreLabel(score: number): string {
  return `${score.toFixed(1)} score`;
}

// ── Seed stories ────────────────────────────────────────────────────
// Used as the offline/dev fallback when the local SQLite cache has no
// articles yet (e.g. web preview, or before the first background refresh).
// Sourced from the PULSE design prototype (real coverage, week of Jul 2026).
type SeedInput = {
  id: string;
  domain: ArticleDomain;
  source: string;
  timeAgo: string;
  title: string;
  tldr: string;
};

const SEED_INPUT: SeedInput[] = [
  { id: "grok", domain: "LLM", source: "TechCrunch", timeAgo: "1d ago", title: "xAI releases Grok 4.5, pitched as an 'Opus-class model'", tldr: "Musk’s lab ships its newest frontier model, promising a cheaper, more efficient alternative to rival flagship models. Benchmarks and independent evals are still pending." },
  { id: "glm", domain: "LLM", source: "VentureBeat", timeAgo: "2d ago", title: "GLM-5.2 reignites the US–China frontier debate", tldr: "Z.ai’s inexpensive model shows near-frontier capability, fueling debate over whether China is finally catching up in the AI race." },
  { id: "anthropic-oss", domain: "LLM", source: "TechCrunch", timeAgo: "2d ago", title: "Why open source AI isn't hurting Anthropic — yet", tldr: "Open models aren’t eating frontier labs’ lunch: each captures a different phase of the same capability life cycle, with open source absorbing mature workloads." },
  { id: "fable", domain: "LLM", source: "VentureBeat", timeAgo: "1w ago", title: "Claude Fable 5 back online after export-control pause", tldr: "The US Commerce Department lifted export controls on July 1 after the model spent nearly three weeks offline." },
  { id: "kling", domain: "LLM", source: "Reuters Tech", timeAgo: "3d ago", title: "Kling AI closes $2B at an $18B valuation", tldr: "General Atlantic leads a mega-round for the Chinese video-AI company as generative video becomes a capital-intensive arms race." },
  { id: "tutor", domain: "LLM", source: "Techmeme", timeAgo: "18h ago", title: "First hard evidence an AI tutor can beat the classroom", tldr: "A controlled study lands the first strong result that an AI tutor outperforms conventional classroom instruction — a milestone for AI in education." },

  { id: "agility", domain: "Robotics", source: "TechCrunch", timeAgo: "2d ago", title: "Agility Robotics goes public via SPAC at ~$2.5B", tldr: "The Digit maker’s merger would raise $620M+ — the largest capital raise in humanoid robotics — making it the first pure-play humanoid company on public markets." },
  { id: "uma", domain: "Robotics", source: "Reuters Tech", timeAgo: "2d ago", title: "Ex-Tesla scientist unveils European humanoid ‘Northstar’", tldr: "Paris-based UMA targets factories, warehouses and homes, with a Real-Time Learning architecture that teaches robots by demonstration instead of programming." },
  { id: "ubtech", domain: "Robotics", source: "The Register", timeAgo: "1w ago", title: "UBTECH’s $17,600 companion humanoid takes 13,000+ orders", tldr: "The UWORLD U1 claims 88 degrees of freedom and an ‘emotion-aware LLM’ recognizing 20+ emotional states — mass-produced and aimed at long-term companionship." },
  { id: "optimus", domain: "Robotics", source: "Electrek", timeAgo: "3d ago", title: "Tesla Optimus Gen 3 production ramps at Fremont", tldr: "Low-volume, full-body production targeted for late July–August, focused on factory tasks as line conversions advance." },
  { id: "halos", domain: "Robotics", source: "The Robot Report", timeAgo: "2w ago", title: "NVIDIA launches Halos, a full-stack safety layer for robots", tldr: "The open safety architecture extends NVIDIA’s autonomous-vehicle safety work to humanoids; Agility’s Digit is the first commercial adopter." },
  { id: "figure", domain: "Robotics", source: "IEEE Spectrum", timeAgo: "1w ago", title: "Figure 03 expands at BMW Spartanburg as BotQ hits 55/week", tldr: "Over 350 units delivered with Helix autonomy gains; paid deployments expand into sequencing tasks on BMW’s line." },

  { id: "illinois", domain: "Policy", source: "Lawfare", timeAgo: "3d ago", title: "Illinois signs landmark AI safety law with third-party audits", tldr: "SB315 requires catastrophic-risk frameworks, 72-hour incident reporting, and first-of-its-kind independent safety audits. OpenAI and Anthropic backed the bill." },
  { id: "ftc", domain: "Policy", source: "Techdirt", timeAgo: "1w ago", title: "FTC opens comment period on AI ‘accuracy’ policy statement", tldr: "The statement targets state laws requiring alteration of ‘truthful outputs of AI models.’ Public comments are due July 31." },
  { id: "eu", domain: "Policy", source: "Lawfare", timeAgo: "1w ago", title: "EU delays high-risk AI Act rules, bans sexual deepfakes", tldr: "The Digital Omnibus pushes high-risk application dates to Dec 2027 / Aug 2028, while AI-generated non-consensual intimate imagery is banned from December." },
  { id: "un", domain: "Policy", source: "Ars Technica", timeAgo: "4d ago", title: "UN convenes first Global Dialogue on AI governance in Geneva", tldr: "Governments, labs and civil society meet as the UN’s scientific panel publishes its first report, warning of ‘catastrophic harm’ without coordinated safeguards." },
  { id: "states", domain: "Policy", source: "Techdirt", timeAgo: "3d ago", title: "States have enacted 109 AI laws in 2026 so far", tldr: "Half-year tally shows state legislation continuing at pace despite federal preemption efforts — plus 28 new data-center laws." },
  { id: "procure", domain: "Policy", source: "Techmeme", timeAgo: "1d ago", title: "House committees weigh federal bans on Chinese AI models", tldr: "Homeland Security and Select China committees consider procurement bans and contractor warnings to curb US use of Chinese models." },

  { id: "together", domain: "General", source: "TechCrunch", timeAgo: "1w ago", title: "Together AI raises $800M Series C at $8.3B", tldr: "Aramco Ventures leads; annual bookings crossed $1.15B in Q2, and the company plans to grow cloud capacity 50× over five years." },
  { id: "samba", domain: "General", source: "Techmeme", timeAgo: "2h ago", title: "SambaNova lands $1B Series F at an $11B valuation", tldr: "General Atlantic leads; JPMorgan signs to deploy SN40 and SN50 chips for on-prem enterprise AI inference." },
  { id: "quantum", domain: "General", source: "VentureBeat", timeAgo: "1w ago", title: "Quantum Systems raises $1.2B for defense autonomy", tldr: "The Munich startup’s Series D — backed by Blackstone, Airbus and Fidelity — signals European defense AI is firmly back on VC radars." },
  { id: "humans", domain: "General", source: "CNBC Tech", timeAgo: "4d ago", title: "humans& raises a $480M seed at $4.5B", tldr: "The human-collaborative AI research lab’s seed round, led by SV Angel and Georges Harik, typifies 2026’s pre-revenue mega-bets." },
  { id: "twelve", domain: "General", source: "TechCrunch", timeAgo: "1w ago", title: "Twelve Labs closes $100M Series B for video AI", tldr: "NEA and Naver co-lead funding for AI systems trained on video archives, with Amazon and Index participating." },
  { id: "zeroth", domain: "General", source: "VentureBeat", timeAgo: "3d ago", title: "Zeroth raises $73.6M Series A led by Ant Group", tldr: "Another humanoid robotics bet in a market where AI2 Robotics ($735M) and Apptronik ($935M) have raised huge rounds this year." },

  { id: "photon", domain: "Materials", source: "ScienceDaily", timeAgo: "2mo ago", title: "Light-matter particles could power ultra-efficient AI compute", tldr: "Penn researchers created a hybrid light-matter particle that could dramatically speed up AI computing while using far less energy." },
  { id: "attention", domain: "Materials", source: "ScienceDaily", timeAgo: "1mo ago", title: "Top AI models flunk a classic psychology attention test", tldr: "Models named colors correctly in short lists, but performance deteriorated sharply as tasks grew longer and more complex." },
  { id: "supercon", domain: "Materials", source: "Phys.org", timeAgo: "2d ago", title: "ML dramatically accelerates superconductor discovery", tldr: "An international consortium used AI to screen vast numbers of elemental combinations, compressing years of materials search." },
  { id: "darkenergy", domain: "Materials", source: "ScienceDaily", timeAgo: "1w ago", title: "AI framework sharpens the measure of dark energy", tldr: "Modeling Type Ia supernovae and their environments in unprecedented detail yields more precise cosmic distance estimates." },
  { id: "vaccine", domain: "Materials", source: "Ars Technica", timeAgo: "1w ago", title: "AI-designed vaccine component completes first human trials", tldr: "A Cambridge breakthrough marks a serious milestone for AI-driven drug discovery and biomedical design." },
  { id: "creativity", domain: "Materials", source: "ScienceDaily", timeAgo: "5mo ago", title: "AI beats the average human on creativity tests", tldr: "A study comparing 100,000+ people with advanced AI systems finds generative AI now outperforms the average human on certain creativity measures." },

  { id: "evenreal", domain: "Consumer", source: "VentureBeat", timeAgo: "3d ago", title: "Even Realities raises $150M for camera-free smart glasses", tldr: "Meituan and Tencent back proprietary waveguide optics that emphasize privacy and utility over always-on capture." },
  { id: "hark", domain: "Consumer", source: "CNBC Tech", timeAgo: "4d ago", title: "Hark hits $6B building ‘personal intelligence’ hardware", tldr: "A $700M Series A led by Parkway, with Nvidia and Salesforce Ventures, for consumer AI devices — barely a year after founding." },
  { id: "remix", domain: "Consumer", source: "9to5Google", timeAgo: "1d ago", title: "Google Photos adds AI-powered Video Remix", tldr: "Gemini Omni generates stylized, realistic elements inside Google Photos — generative editing moving into default consumer tools." },
  { id: "phones", domain: "Consumer", source: "EE Times", timeAgo: "2h ago", title: "AI memory costs are killing the budget smartphone", tldr: "Sub-$400 shipments forecast to fall 22% in 2026 as AI-driven DRAM/NAND costs consume nearly 60% of the bill of materials." },
  { id: "catwalk", domain: "Consumer", source: "The Robot Report", timeAgo: "1mo ago", title: "Unitree humanoids share the catwalk at a physical-AI fashion show", tldr: "Robots walked alongside models at Galaxy Corporation’s Mach33 show — industrial design meeting fluid machine movement." },
];

// Turn a seed "1d ago" / "18h ago" / "2w ago" label into an approximate hour
// offset, so seed stories carry real-ish timestamps (Trends buckets them by
// day and the source list shows sensible dates instead of everything "now").
function seedHoursAgo(timeAgo: string): number {
  const match = /^(\d+)\s*(h|d|w|mo|y)/.exec(timeAgo.trim());
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = match[2];
  const perUnit: Record<string, number> = { h: 1, d: 24, w: 168, mo: 720, y: 8760 };
  return n * (perUnit[unit] ?? 1);
}

// Fixed reference (not Date.now()) so seed timestamps are byte-identical on the
// server and the client — a wall-clock here would differ between SSR and
// hydration and mismatch the date tooltips. Trends anchors its 7-day window to
// the newest story, so this constant only drives the demo tooltips, not whether
// the chart populates.
const SEED_REFERENCE = Date.parse("2026-07-12T12:00:00Z");

export const SEED_STORIES: PulseStory[] = SEED_INPUT.map((s) => {
  const h = hashId(s.id);
  const hoursAgo = seedHoursAgo(s.timeAgo);
  const publishedAt = new Date(SEED_REFERENCE - hoursAgo * 3600_000).toISOString();
  const { reputability, reach } = outletTrust(s.source);
  return {
    ...s,
    publishedAt,
    tldrIsAi: true,
    importance: 3 + (h % 3),
    tags: [],
    baseScore: clamp(4 + (h % 40) / 10, 1, 10),
    sources: [
      {
        name: s.source,
        url: undefined,
        hoursAgo,
        headline: s.title,
        summary: s.tldr,
        reputability,
        reach,
        composite: sourceComposite(hoursAgo, reputability, reach),
      },
    ],
  };
});

export const SEED_BRIEF_TEXT =
  "Frontier-model competition intensified this week: xAI shipped Grok 4.5 while Chinese labs kept closing the capability-per-dollar gap, and open-source models continued absorbing mature workloads rather than contesting the frontier. Humanoid robotics crossed a capital-markets threshold — Agility’s SPAC would make it the first pure-play public humanoid company — against $2B+ of fresh robotics rounds. Regulation is consolidating at the state level (Illinois is the third state with a frontier-safety law) while the EU pushed high-risk AI Act enforcement to 2027–28. Infrastructure capital keeps concentrating: four companies raised or sought $7.8B in two days.";

export const SEED_INSIGHTS: string[] = [
  "State AI law is outpacing federal action — 109 laws by July 1. A de facto national framework is forming through the CA / NY / IL model.",
  "Humanoid funding language shifted from research bets to production metrics (units/week, paid deployments). Public-market scrutiny arrives with Agility’s listing.",
  "AI memory demand is repricing consumer hardware — sub-$400 phone shipments forecast to fall 22% as DRAM/NAND costs consume the BOM.",
  "Open-source and frontier models are splitting the capability life cycle rather than competing head-on — watch where enterprise workloads mature.",
];
