// Editorial-trust metadata per outlet, 1-5. Used to order sources inside a
// merged story (most trustworthy/high-reach first) and to power the "why
// trust this" meters in the story detail modal. Reasonable editorial
// judgment calls, not a scientific ranking — update as needed.
export type OutletTrust = {
  reputability: number; // editorial rigor / authority, 1-5
  reach: number; // audience size / profile, 1-5
};

const DEFAULT_TRUST: OutletTrust = { reputability: 3, reach: 2 };

const OUTLET_TRUST: Record<string, OutletTrust> = {
  // Wire services / major press
  "Reuters Tech": { reputability: 5, reach: 5 },
  "CNBC Tech": { reputability: 4, reach: 5 },

  // Primary sources (labs publishing their own work)
  "OpenAI Blog": { reputability: 5, reach: 5 },
  "Anthropic Blog": { reputability: 5, reach: 4 },
  "DeepMind": { reputability: 5, reach: 4 },
  "Google AI Blog": { reputability: 5, reach: 4 },
  "Meta AI Blog": { reputability: 5, reach: 4 },
  "AWS Blog": { reputability: 4, reach: 4 },
  "Google Cloud Blog": { reputability: 4, reach: 4 },
  "Azure Blog": { reputability: 4, reach: 4 },
  "Cloudflare Blog": { reputability: 4, reach: 3 },

  // Established tech press
  "Ars Technica": { reputability: 5, reach: 4 },
  "Ars Technica Space": { reputability: 5, reach: 3 },
  "The Verge": { reputability: 4, reach: 5 },
  "Wired": { reputability: 4, reach: 4 },
  "MIT Technology Review": { reputability: 5, reach: 3 },
  "IEEE Spectrum Robotics": { reputability: 5, reach: 3 },
  "TechCrunch": { reputability: 4, reach: 5 },
  "VentureBeat": { reputability: 4, reach: 4 },
  "The Register": { reputability: 4, reach: 3 },
  "Techmeme": { reputability: 3, reach: 4 },
  "9to5Mac": { reputability: 3, reach: 4 },
  "9to5Google": { reputability: 3, reach: 4 },
  "MacRumors": { reputability: 3, reach: 4 },

  // Security
  "Krebs on Security": { reputability: 5, reach: 4 },
  "Schneier on Security": { reputability: 5, reach: 3 },
  "Dark Reading": { reputability: 4, reach: 3 },
  "BleepingComputer": { reputability: 4, reach: 3 },
  "The Hacker News": { reputability: 3, reach: 3 },

  // Biotech / science
  "Nature Biotechnology": { reputability: 5, reach: 3 },
  "STAT News": { reputability: 5, reach: 3 },
  "Fierce Biotech": { reputability: 4, reach: 3 },
  "Endpoints News": { reputability: 4, reach: 2 },
  "ScienceDaily Materials": { reputability: 3, reach: 2 },
  "ScienceDaily Nanotech": { reputability: 3, reach: 2 },
  "Science Daily Tech": { reputability: 3, reach: 2 },
  "Materials Today": { reputability: 4, reach: 2 },
  "Phys.org Condensed Matter": { reputability: 3, reach: 2 },
  "Arxiv AI": { reputability: 4, reach: 2 },
  "Arxiv Materials Science": { reputability: 4, reach: 2 },

  // Climate / energy
  "Canary Media": { reputability: 4, reach: 2 },
  "CleanTechnica": { reputability: 3, reach: 3 },
  "Electrek": { reputability: 4, reach: 3 },
  "Utility Dive": { reputability: 4, reach: 2 },

  // Policy
  "Lawfare": { reputability: 5, reach: 2 },
  "EFF Deeplinks": { reputability: 5, reach: 3 },
  "Techdirt": { reputability: 4, reach: 3 },

  // Infra / hardware trade press
  "Semiconductor Engineering": { reputability: 4, reach: 2 },
  "SemiAnalysis": { reputability: 4, reach: 3 },
  "EE Times": { reputability: 4, reach: 3 },
  "Tom's Hardware": { reputability: 3, reach: 4 },
  "ServeTheHome": { reputability: 4, reach: 2 },
  "Data Center Knowledge": { reputability: 4, reach: 2 },
  "The New Stack": { reputability: 3, reach: 2 },
  "InfoQ": { reputability: 4, reach: 3 },

  // Aggregators / community
  "Hacker News (Best)": { reputability: 3, reach: 4 },
  "Slashdot": { reputability: 3, reach: 3 },
  "AI News": { reputability: 3, reach: 2 },

  // Crypto
  "CoinDesk": { reputability: 4, reach: 4 },
  "The Block": { reputability: 4, reach: 3 },

  // Space
  "SpaceNews": { reputability: 4, reach: 3 },
  "NASA Spaceflight": { reputability: 4, reach: 3 },

  // Robotics
  "The Robot Report": { reputability: 4, reach: 3 },

  // AR/VR
  "Road to VR": { reputability: 4, reach: 2 },
  "UploadVR": { reputability: 3, reach: 3 },

  // Blogs / newsletters
  "The Batch (deeplearning.ai)": { reputability: 4, reach: 3 },
  "Hugging Face Blog": { reputability: 4, reach: 3 },
};

export function outletTrust(name: string): OutletTrust {
  return OUTLET_TRUST[name] ?? DEFAULT_TRUST;
}

// recency: ~5 at 0h, ~0 at 240h (10 days).
export function recencyScore(hoursAgo: number): number {
  return Math.max(0, 5 - hoursAgo / 48);
}

// reputability/reach weighted below recency.
export function sourceComposite(hoursAgo: number, reputability: number, reach: number): number {
  return recencyScore(hoursAgo) * 0.45 + reputability * 0.35 + reach * 0.2;
}

// Short plain-language labels for the story-detail trust meters — no jargon,
// matches PULSE's "why should I trust this" goal.
export function recencyLabel(score: number): string {
  if (score >= 4) return "Very fresh";
  if (score >= 2.5) return "Fresh";
  if (score >= 1) return "Getting stale";
  return "Old";
}

export function trustLabel(score: number): string {
  if (score >= 4.5) return "Very high";
  if (score >= 3.5) return "High";
  if (score >= 2.5) return "Moderate";
  return "Lower";
}
