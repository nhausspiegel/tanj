/**
 * AI enrichment for the Electron desktop pipeline.
 * Calls, in priority order:
 *   1. A hosted provider (OpenAI or Anthropic) if the user pasted an API
 *      key into Settings (BYOK) — no local model required.
 *   2. A local Ollama instance, if one is running.
 *   3. Heuristic enrichment (no AI) as the final fallback.
 * In every case: generates a 2-sentence summary, classifies domain,
 * assigns tags, scores importance 1-5.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const AI_MODEL = process.env.AI_ARTICLE_MODEL || "qwen2.5-coder:7b";
const OPENAI_MODEL = process.env.AI_OPENAI_MODEL || "gpt-4o-mini";
const ANTHROPIC_MODEL = process.env.AI_ANTHROPIC_MODEL || "claude-haiku-4-5";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 45000;
// Optional keep_alive for enrichment calls (e.g. "2m"); unset uses Ollama's
// default. Set AI_KEEP_MODEL_LOADED=1 to skip the post-enrichment unload
// (e.g. if you use the same model interactively between refreshes).
const AI_KEEP_ALIVE = process.env.AI_KEEP_ALIVE;
const KEEP_MODEL_LOADED = process.env.AI_KEEP_MODEL_LOADED === "1";
const BATCH_SIZE = 6;
const PAUSE_BETWEEN_BATCHES_MS = 300;

// Dev-mode tuning (Settings) overrides these env-var/hardcoded defaults at
// call time — "" / undefined fields fall through to the default above.
function resolveTuning(tuning = {}) {
  return {
    ollamaBaseUrl: tuning.ollamaBaseUrl || OLLAMA_BASE_URL,
    model: tuning.model || AI_MODEL,
    batchSize: Number(tuning.batchSize) > 0 ? Number(tuning.batchSize) : BATCH_SIZE,
    pauseBetweenBatchesMs:
      Number.isFinite(Number(tuning.pauseBetweenBatchesMs))
        ? Number(tuning.pauseBetweenBatchesMs)
        : PAUSE_BETWEEN_BATCHES_MS,
    maxOutputTokens: Number(tuning.maxOutputTokens) > 0 ? Number(tuning.maxOutputTokens) : 2000,
    temperature: Number.isFinite(Number(tuning.temperature)) ? Number(tuning.temperature) : 0,
    keepAlive: tuning.keepAlive || AI_KEEP_ALIVE,
    timeoutMs: Number(tuning.timeoutMs) > 0 ? Number(tuning.timeoutMs) : AI_TIMEOUT_MS,
  };
}

const ARTICLE_DOMAINS = [
  "AIUse", "LLM", "AIInfra", "Semis", "Cloud", "Security", "Consumer", "Bio",
  "Climate", "Crypto", "Policy", "Space", "Robotics",
  "Batteries", "AR", "Materials", "General",
];

const LEGACY_DOMAIN_REMAP = {
  AI: "LLM",
  Chips: "Semis",
  Infra: "Cloud",
  Energy: "Climate",
  Macro: "Policy",
  Frontier: "General",
};

const SYSTEM_PROMPT = `You are a technology analyst. For each article:
1. Write a clear 2-sentence summary capturing the key facts
2. Classify into ONE primary domain: ${ARTICLE_DOMAINS.join(", ")}
   AI is split into three: pick the best fit.
   - "LLM" = foundation model labs and their research (OpenAI, Anthropic, DeepMind, Google AI, Meta AI, Hugging Face, arxiv papers, model releases, benchmarks, agent research)
   - "AIUse" = consumer-facing AI apps, tutorials, prompt tips, what people are doing with AI, AI-assisted products
   - "AIInfra" = AI hardware and infrastructure (NVIDIA/TPU/accelerator chips, GPU clusters, training/inference infra, datacenter buildouts FOR AI, AI compute economics)
   Use "Semis" only for general chip industry news unrelated to AI workloads.
   "Materials" = materials science breakthroughs: novel alloys, polymers, ceramics, graphene/2D materials, superconductors, photovoltaics, nanomaterials. Prefer "Batteries" for energy-storage chemistry; prefer "Semis" for chip-fab process tech.
3. Optionally add up to 2 secondary domains (different from primary, omit if none fit)
4. Assign 2-4 specific lowercase tags reflecting underlying trends (NOT generic words like "ai" or "tech")
5. Rate importance 1-5:
   - 5 = industry-defining (major acquisition, breakthrough, regulation)
   - 4 = significant (large funding, product launch from major player)
   - 3 = noteworthy (interesting development, meaningful update)
   - 2 = routine (minor update, incremental progress)
   - 1 = filler (listicle, opinion without new info)

Return ONLY valid JSON, no prose.`;

function buildUserPrompt(articles) {
  const items = articles.map((a, i) => ({
    id: String(i),
    headline: a.headline,
    summary: (a.fullText || a.summary || "").slice(0, 1200),
    source: a.source || "Unknown",
  }));

  return `Respond with JSON matching this schema:
{
  "articles": [
    {
      "id": "string (matches input id)",
      "summary": "two-sentence summary",
      "domain": "one of ${ARTICLE_DOMAINS.join(", ")}",
      "secondary": ["0-2 additional domains"],
      "tags": ["2-4 specific lowercase tags"],
      "importance": 3
    }
  ]
}

Articles to analyze:
${JSON.stringify(items, null, 2)}`;
}

function extractJson(content) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeDomain(raw) {
  if (typeof raw !== "string") return "General";
  const trimmed = raw.trim();
  const match = ARTICLE_DOMAINS.find(
    (d) => d.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match;
  const remapped = LEGACY_DOMAIN_REMAP[trimmed];
  return remapped || "General";
}

function normalizeSecondary(primary, raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([primary]);
  const out = [];
  for (const entry of raw) {
    const normalized = normalizeDomain(entry);
    if (normalized === "General" || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 2) break;
  }
  return out;
}

function sanitizeTag(tag) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const GENERIC_TAGS = new Set([
  "ai", "technology", "startup", "news", "tech", "update",
  "report", "announcement", "article",
]);

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const normalized = [...new Set(
    tags.map(sanitizeTag).filter((t) => t && t.length > 1 && !GENERIC_TAGS.has(t)),
  )].slice(0, 4);
  return normalized.length ? normalized : ["uncategorized"];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let aiAvailable = null; // null = unknown, true/false = tested

async function checkAiAvailability(ollamaBaseUrl = OLLAMA_BASE_URL) {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    aiAvailable = response.ok;
  } catch {
    aiAvailable = false;
  }
  return aiAvailable;
}

async function callOllama(articles, tuning) {
  const body = {
    model: tuning.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(articles) },
    ],
    stream: false,
    // Thinking models (e.g. gemma4) otherwise emit reasoning into a separate
    // `thinking` field and leave `content` empty, breaking extractJson below.
    // Non-thinking models (e.g. qwen2.5) ignore this flag.
    think: false,
    format: "json",
    options: {
      temperature: tuning.temperature,
      num_predict: tuning.maxOutputTokens,
    },
  };

  if (tuning.keepAlive) {
    body.keep_alive = tuning.keepAlive;
  }

  const response = await fetch(`${tuning.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(tuning.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  if (payload.error) throw new Error(`Ollama: ${payload.error}`);

  return extractJson(payload.message?.content ?? "");
}

async function callOpenAI(articles, apiKey, tuning) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(articles) },
      ],
      response_format: { type: "json_object" },
      temperature: tuning.temperature,
    }),
    signal: AbortSignal.timeout(tuning.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  return extractJson(payload.choices?.[0]?.message?.content ?? "");
}

async function callAnthropic(articles, apiKey, tuning) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: tuning.maxOutputTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(articles) }],
      temperature: tuning.temperature,
    }),
    signal: AbortSignal.timeout(tuning.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  const textBlock = Array.isArray(payload.content)
    ? payload.content.find((block) => block.type === "text")
    : null;
  return extractJson(textBlock?.text ?? "");
}

/**
 * Ask Ollama to unload the enrichment model. gemma4:26b holds ~17 GB resident
 * and otherwise lingers for the keep_alive window after the last batch — on a
 * laptop that's continued memory pressure (and swap) after the refresh is
 * done. Per Ollama's API, empty messages + keep_alive: 0 unloads the model.
 * Best-effort: failures are ignored.
 */
async function unloadModel(tuning) {
  try {
    const response = await fetch(`${tuning.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: tuning.model, messages: [], keep_alive: 0 }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      console.log(`[ai-enrich] Requested unload of ${tuning.model}`);
    }
  } catch {
    // Best-effort only.
  }
}

/**
 * Enrich articles using AI. Falls back to heuristics on failure.
 * Modifies articles in-place and returns them.
 */
async function enrichArticlesWithAI(articles, options = {}) {
  const tuning = resolveTuning(options.tuning);
  const provider = options.provider || (process.env.OPENAI_API_KEY && "openai") ||
    (process.env.ANTHROPIC_API_KEY && "anthropic") || null;
  const apiKey =
    options.apiKey ||
    (provider === "openai" ? process.env.OPENAI_API_KEY : undefined) ||
    (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined);
  const useHosted = Boolean(provider && apiKey);

  if (!useHosted) {
    // Only probe/require local Ollama when there's no hosted key (BYOK).
    if (aiAvailable === null) {
      await checkAiAvailability(tuning.ollamaBaseUrl);
    }

    if (!aiAvailable) {
      console.log("[ai-enrich] AI not available, using heuristic enrichment only");
      return articles;
    }
  }

  const callModel = useHosted
    ? (batch) => (provider === "anthropic" ? callAnthropic(batch, apiKey, tuning) : callOpenAI(batch, apiKey, tuning))
    : (batch) => callOllama(batch, tuning);

  const results = [...articles];
  let aiSuccessCount = 0;
  let aiFailCount = 0;
  let attemptedOllama = false;

  for (let i = 0; i < results.length; i += tuning.batchSize) {
    const batch = results.slice(i, i + tuning.batchSize);

    try {
      attemptedOllama = attemptedOllama || !useHosted;
      const parsed = await callModel(batch);
      const aiArticles = parsed?.articles ?? [];

      // Map results back by index
      const aiByIndex = new Map();
      for (const item of aiArticles) {
        if (item && typeof item.id === "string") {
          aiByIndex.set(item.id, item);
        }
      }

      for (let j = 0; j < batch.length; j++) {
        const aiItem = aiByIndex.get(String(j)) ?? aiArticles[j];
        if (!aiItem) continue;

        const idx = i + j;
        const primary = normalizeDomain(aiItem.domain);

        results[idx] = {
          ...results[idx],
          summary: aiItem.summary && aiItem.summary.length > 20
            ? aiItem.summary
            : results[idx].summary,
          domain: primary,
          domainSecondary: normalizeSecondary(primary, aiItem.secondary),
          tags: normalizeTags(aiItem.tags),
          importance: typeof aiItem.importance === "number" &&
            aiItem.importance >= 1 && aiItem.importance <= 5
            ? Math.round(aiItem.importance)
            : results[idx].importance,
          aiEnriched: true,
        };
        aiSuccessCount++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown";
      console.warn(`[ai-enrich] Batch ${i}-${i + batch.length} failed: ${msg}`);
      aiFailCount += batch.length;

      // If we get rate limited or auth errors, stop trying this refresh.
      // Only latch the global Ollama-availability flag for the local path —
      // a bad hosted key shouldn't suppress a working local Ollama later.
      if (msg.includes("429") || msg.includes("401") || msg.includes("404")) {
        console.warn("[ai-enrich] Disabling AI for this refresh cycle");
        if (!useHosted) aiAvailable = false;
        break;
      }
    }

    if (typeof options.onBatch === "function") {
      options.onBatch(results.slice(i, i + tuning.batchSize), {
        index: i / tuning.batchSize,
        batchCount: Math.ceil(results.length / tuning.batchSize),
      });
    }

    if (i + tuning.batchSize < results.length) {
      await sleep(tuning.pauseBetweenBatchesMs);
    }
  }

  if (attemptedOllama && !KEEP_MODEL_LOADED) {
    await unloadModel(tuning);
  }

  console.log(`[ai-enrich] Enriched ${aiSuccessCount} articles via AI, ${aiFailCount} fell back to heuristics`);
  return results;
}

/**
 * Reset AI availability check (e.g., on next refresh cycle)
 */
function resetAiStatus() {
  aiAvailable = null;
}

module.exports = {
  enrichArticlesWithAI,
  checkAiAvailability,
  resetAiStatus,
  unloadModel,
};
