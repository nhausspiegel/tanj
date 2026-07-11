import {
  ARTICLE_DOMAINS,
  DOMAIN_LABELS,
  type Article,
  type ArticleDomain,
  type StoryCluster,
} from "@/lib/types";
import { clusterArticles } from "@/lib/clustering";
import { outletTrust, sourceComposite } from "@/lib/outlets";

// ── PULSE accent (Electric — the chosen default theme) ──────────────
export const PULSE_ACCENT = "#3FD5E8";

// One row per contributing article inside a merged story. reputability/reach
// are 1-5 editorial-trust scores from lib/outlets.ts; composite is the
// recency/reputability/reach blend used to order this array.
export type PulseSourceRef = {
  name: string;
  url?: string;
  hoursAgo: number;
  summary: string;
  reputability: number;
  reach: number;
  composite: number;
};

export type PulseStory = {
  id: string;
  domain: ArticleDomain;
  source: string; // lead (most recent) source name — back-compat single display
  timeAgo: string; // time since the most recent contributing source
  title: string;
  tldr: string;
  url?: string; // lead source's article url
  importance: number; // 1–5
  sources: PulseSourceRef[]; // every contributing article, sorted most-recent-first
  baseScore: number; // 1–10 personalized base, before live vote/save adjustments
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

export function domainHue(domain: ArticleDomain): number {
  return DOMAIN_HUE[domain] ?? 210;
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
  return (
    `radial-gradient(120% 130% at ${i % 2 ? 85 : 15}% 0%, hsla(${hue},60%,48%,0.45), transparent 55%), ` +
    `linear-gradient(145deg, hsl(${hue},38%,20%) 0%, hsl(${h2},45%,10%) 80%)`
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

function articleBaseScore(article: Article): number {
  const raw = (article as { personalized_score?: number | null }).personalized_score;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return clamp(raw, 1, 10);
  }
  // Derive from LLM importance when no personalized score was stored.
  return clamp(article.importance * 1.6 + 1, 1, 10);
}

// Multiple outlets corroborating a story is itself a signal — bump the base
// score modestly per additional source, capped so a single strong story
// can't be dwarfed by wire-service pickup volume alone.
function clusterBaseScore(members: Article[]): number {
  const best = Math.max(...members.map(articleBaseScore));
  const corroborationBoost = clamp((members.length - 1) * 0.4, 0, 1.5);
  return clamp(best + corroborationBoost, 1, 10);
}

function clusterToStory(
  cluster: StoryCluster,
  articlesById: Map<string, Article>,
  now: number,
): PulseStory {
  const members = cluster.articleIds
    .map((id) => articlesById.get(id))
    .filter((article): article is Article => Boolean(article));
  const lead = members[0] ?? null;

  const sources: PulseSourceRef[] = members
    .map((article) => {
      const name = article.source ?? "Unknown";
      const hoursAgo = hoursSince(article.processed_at || article.date, now);
      const { reputability, reach } = outletTrust(name);
      return {
        name,
        url: article.url,
        hoursAgo,
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
    title: cluster.headline,
    tldr: lead?.summary ?? cluster.summary,
    url: mostRecent?.url,
    importance: lead?.importance ?? 3,
    sources,
    baseScore: clusterBaseScore(members.length ? members : lead ? [lead] : []),
  };
}

// One story per article — no merging. Used by the Dashboard (Netflix rows,
// hero, My List): keep articles separate for now, per-source.
export function articlesToStories(articles: Article[], now: number = Date.now()): PulseStory[] {
  return articles.map((article) => {
    const name = article.source ?? "Unknown";
    const hoursAgo = hoursSince(article.processed_at || article.date, now);
    const { reputability, reach } = outletTrust(name);
    const sourceRef: PulseSourceRef = {
      name,
      url: article.url,
      hoursAgo,
      summary: article.summary,
      reputability,
      reach,
      composite: sourceComposite(hoursAgo, reputability, reach),
    };
    return {
      id: article.id,
      domain: article.domain,
      source: name,
      timeAgo: relativeTime(article.processed_at || article.date, now),
      title: article.headline,
      tldr: article.summary,
      url: article.url,
      importance: article.importance,
      sources: [sourceRef],
      baseScore: articleBaseScore(article),
    };
  });
}

// One story per CLUSTER — merges same-story articles from different outlets
// and boosts score for corroboration. Used only by Trends (the ranked feed).
export function clusterArticlesToStories(articles: Article[], now: number = Date.now()): PulseStory[] {
  const clusters = clusterArticles(articles);
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  return clusters.map((cluster) => clusterToStory(cluster, articlesById, now));
}

export type PulseVoteMap = Record<string, 1 | -1 | 0>;
export type PulseBoolMap = Record<string, boolean>;

// Live personalized score: real base + prototype-style adjustments so boost /
// suppress / save re-rank instantly. Clamped 1–10, shown as "N.N score".
export function liveScore(
  story: PulseStory,
  stories: PulseStory[],
  saved: PulseBoolMap,
  votes: PulseVoteMap,
): number {
  const savedBoost =
    stories.filter((s) => saved[s.id] && s.domain === story.domain).length * 0.2;

  let topicNet = 0;
  for (const s of stories) {
    if (s.domain === story.domain && votes[s.id]) topicNet += votes[s.id];
  }
  const topicAdj = clamp(topicNet * 0.2, -1, 1);

  const own = votes[story.id] || 0;
  const ownAdj = own === 1 ? 1 : own === -1 ? -2 : 0;

  return clamp(story.baseScore + savedBoost + topicAdj + ownAdj, 1, 10);
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

export const SEED_STORIES: PulseStory[] = SEED_INPUT.map((s) => {
  const h = hashId(s.id);
  return {
    ...s,
    importance: 3 + (h % 3),
    baseScore: clamp(4 + (h % 40) / 10, 1, 10),
    sources: [
      (() => {
        const { reputability, reach } = outletTrust(s.source);
        return {
          name: s.source,
          hoursAgo: 0,
          summary: s.tldr,
          reputability,
          reach,
          composite: sourceComposite(0, reputability, reach),
        };
      })(),
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
