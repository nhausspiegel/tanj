// db.prepare(sql) re-parses the SQL text every call; updateAffinity runs in
// a tag/entity loop per cluster-feedback event, so cache by db instance +
// SQL text to parse each distinct statement once and reuse the compiled one.
const stmtCache = new WeakMap();
function stmt(db, sql) {
  let cache = stmtCache.get(db);
  if (!cache) {
    cache = new Map();
    stmtCache.set(db, cache);
  }
  let prepared = cache.get(sql);
  if (!prepared) {
    prepared = db.prepare(sql);
    cache.set(sql, prepared);
  }
  return prepared;
}

const defaultPreferences = {
  refreshIntervalMinutes: 30,
  notificationsEnabled: true,
  notificationImportanceThreshold: 5,
  personalizedDefault: false,
  coloredScoreBadges: false,
  // BYOK: an API key the user pastes in Settings, for the provider chosen
  // below. Used by AI enrichment instead of local Ollama when present.
  // Never sent anywhere except directly to that provider's API, from the
  // main process.
  aiProvider: "openai",
  aiApiKey: "",
  // Dev mode: exposes low-level tuning knobs in Settings so these can be
  // adjusted without a code change. "" / 0 / {} fields below mean "use the
  // built-in default" — see the services that read each group.
  devMode: false,
  refreshTuning: {
    maxConcurrentFeeds: 3,
    feedBatchPauseMs: 150,
    maxFeedBytes: 1_500_000,
    feedTimeoutMs: 15000,
    maxExtractionArticles: 80,
    maxTotalArticles: 500,
  },
  aiTuning: {
    model: "",
    batchSize: 6,
    pauseBetweenBatchesMs: 300,
    maxOutputTokens: 2000,
    temperature: 0,
    ollamaBaseUrl: "",
    keepAlive: "",
    timeoutMs: 45000,
  },
  resourceTuning: {
    warningFreeMemoryMb: 768,
    minFreeMemoryMb: 256,
    warningProcessRssMb: 1024,
    maxProcessRssMb: 1536,
  },
  trendsTuning: {
    maxDomains: 10,
    maxEvents: 20,
  },
  themeOverrides: {
    accentPrimary: "",
    accentSecondary: "",
    accentHighlight: "",
  },
  domainHueOverrides: {},
  disabledSources: [],
};

const AI_PROVIDERS = new Set(["openai", "anthropic"]);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const defaultScanState = {
  teachingIds: [],
  teachingItems: [],
  digest: false,
  clusterRatings: {},
  updatedAt: null,
};

function safeParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function clampedInt(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function clampedFloat(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(min, Math.min(max, numeric));
}

function getPreference(db, key, fallback = null) {
  const row = db.prepare("SELECT value_json FROM preferences WHERE key = ?").get(key);
  return row ? safeParse(row.value_json, fallback) : fallback;
}

function savePreference(db, key, value) {
  db.prepare(`
    INSERT INTO preferences (key, value_json)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run(key, JSON.stringify(value));
}

const TUNING_GROUPS = ["refreshTuning", "aiTuning", "resourceTuning", "themeOverrides", "trendsTuning"];

function getPreferences(db) {
  const stored = getPreference(db, "settings", {});
  const merged = {
    ...defaultPreferences,
    ...(stored && typeof stored === "object" ? stored : {}),
  };

  // Nested tuning groups deep-merge against their defaults so a stored blob
  // predating a newly-added field still gets that field's default instead
  // of losing it to a shallow top-level overwrite.
  for (const group of TUNING_GROUPS) {
    merged[group] = {
      ...defaultPreferences[group],
      ...(stored?.[group] && typeof stored[group] === "object" ? stored[group] : {}),
    };
  }

  merged.domainHueOverrides =
    stored?.domainHueOverrides && typeof stored.domainHueOverrides === "object"
      ? stored.domainHueOverrides
      : {};
  merged.disabledSources = Array.isArray(stored?.disabledSources) ? stored.disabledSources : [];

  return merged;
}

function savePreferences(db, next) {
  const current = getPreferences(db);
  const sanitized = { ...current };

  if (Number.isFinite(Number(next.refreshIntervalMinutes))) {
    sanitized.refreshIntervalMinutes = Math.max(
      5,
      Math.min(240, Math.floor(Number(next.refreshIntervalMinutes))),
    );
  }

  if (typeof next.notificationsEnabled === "boolean") {
    sanitized.notificationsEnabled = next.notificationsEnabled;
  }

  if (Number.isFinite(Number(next.notificationImportanceThreshold))) {
    sanitized.notificationImportanceThreshold = Math.max(
      1,
      Math.min(5, Math.floor(Number(next.notificationImportanceThreshold))),
    );
  }

  if (typeof next.personalizedDefault === "boolean") {
    sanitized.personalizedDefault = next.personalizedDefault;
  }

  if (typeof next.coloredScoreBadges === "boolean") {
    sanitized.coloredScoreBadges = next.coloredScoreBadges;
  }

  // "" is a valid value (explicit clear); only skip when the field wasn't
  // sent at all.
  if (typeof next.aiApiKey === "string") {
    sanitized.aiApiKey = next.aiApiKey.trim().slice(0, 256);
  }

  if (AI_PROVIDERS.has(next.aiProvider)) {
    sanitized.aiProvider = next.aiProvider;
  }

  if (typeof next.devMode === "boolean") {
    sanitized.devMode = next.devMode;
  }

  if (next.refreshTuning && typeof next.refreshTuning === "object") {
    const t = next.refreshTuning;
    const rt = { ...sanitized.refreshTuning };
    if (clampedInt(t.maxConcurrentFeeds, 1, 12) !== null) rt.maxConcurrentFeeds = clampedInt(t.maxConcurrentFeeds, 1, 12);
    if (clampedInt(t.feedBatchPauseMs, 0, 10000) !== null) rt.feedBatchPauseMs = clampedInt(t.feedBatchPauseMs, 0, 10000);
    if (clampedInt(t.maxFeedBytes, 10_000, 20_000_000) !== null) rt.maxFeedBytes = clampedInt(t.maxFeedBytes, 10_000, 20_000_000);
    if (clampedInt(t.feedTimeoutMs, 1000, 120000) !== null) rt.feedTimeoutMs = clampedInt(t.feedTimeoutMs, 1000, 120000);
    if (clampedInt(t.maxExtractionArticles, 0, 500) !== null) rt.maxExtractionArticles = clampedInt(t.maxExtractionArticles, 0, 500);
    if (clampedInt(t.maxTotalArticles, 10, 2000) !== null) rt.maxTotalArticles = clampedInt(t.maxTotalArticles, 10, 2000);
    sanitized.refreshTuning = rt;
  }

  if (next.aiTuning && typeof next.aiTuning === "object") {
    const t = next.aiTuning;
    const at = { ...sanitized.aiTuning };
    if (typeof t.model === "string") at.model = t.model.trim().slice(0, 128);
    if (clampedInt(t.batchSize, 1, 50) !== null) at.batchSize = clampedInt(t.batchSize, 1, 50);
    if (clampedInt(t.pauseBetweenBatchesMs, 0, 30000) !== null) at.pauseBetweenBatchesMs = clampedInt(t.pauseBetweenBatchesMs, 0, 30000);
    if (clampedInt(t.maxOutputTokens, 100, 16000) !== null) at.maxOutputTokens = clampedInt(t.maxOutputTokens, 100, 16000);
    if (clampedFloat(t.temperature, 0, 2) !== null) at.temperature = clampedFloat(t.temperature, 0, 2);
    if (typeof t.ollamaBaseUrl === "string") at.ollamaBaseUrl = t.ollamaBaseUrl.trim().slice(0, 256);
    if (typeof t.keepAlive === "string") at.keepAlive = t.keepAlive.trim().slice(0, 32);
    if (clampedInt(t.timeoutMs, 5000, 300000) !== null) at.timeoutMs = clampedInt(t.timeoutMs, 5000, 300000);
    sanitized.aiTuning = at;
  }

  if (next.trendsTuning && typeof next.trendsTuning === "object") {
    const t = next.trendsTuning;
    const tt = { ...sanitized.trendsTuning };
    if (clampedInt(t.maxDomains, 1, 12) !== null) tt.maxDomains = clampedInt(t.maxDomains, 1, 12);
    if (clampedInt(t.maxEvents, 1, 50) !== null) tt.maxEvents = clampedInt(t.maxEvents, 1, 50);
    sanitized.trendsTuning = tt;
  }

  if (next.resourceTuning && typeof next.resourceTuning === "object") {
    const t = next.resourceTuning;
    const rt = { ...sanitized.resourceTuning };
    if (clampedInt(t.warningFreeMemoryMb, 64, 32000) !== null) rt.warningFreeMemoryMb = clampedInt(t.warningFreeMemoryMb, 64, 32000);
    if (clampedInt(t.minFreeMemoryMb, 32, 32000) !== null) rt.minFreeMemoryMb = clampedInt(t.minFreeMemoryMb, 32, 32000);
    if (clampedInt(t.warningProcessRssMb, 64, 32000) !== null) rt.warningProcessRssMb = clampedInt(t.warningProcessRssMb, 64, 32000);
    if (clampedInt(t.maxProcessRssMb, 128, 32000) !== null) rt.maxProcessRssMb = clampedInt(t.maxProcessRssMb, 128, 32000);
    sanitized.resourceTuning = rt;
  }

  if (next.themeOverrides && typeof next.themeOverrides === "object") {
    const t = next.themeOverrides;
    const to = { ...sanitized.themeOverrides };
    if (t.accentPrimary === "" || HEX_COLOR_RE.test(t.accentPrimary)) to.accentPrimary = t.accentPrimary;
    if (t.accentSecondary === "" || HEX_COLOR_RE.test(t.accentSecondary)) to.accentSecondary = t.accentSecondary;
    if (t.accentHighlight === "" || HEX_COLOR_RE.test(t.accentHighlight)) to.accentHighlight = t.accentHighlight;
    sanitized.themeOverrides = to;
  }

  if (next.domainHueOverrides && typeof next.domainHueOverrides === "object") {
    const cleaned = {};
    for (const [domain, hue] of Object.entries(next.domainHueOverrides)) {
      const numeric = clampedInt(hue, 0, 360);
      if (typeof domain === "string" && domain.length <= 32 && numeric !== null) {
        cleaned[domain] = numeric;
      }
    }
    sanitized.domainHueOverrides = cleaned;
  }

  if (Array.isArray(next.disabledSources)) {
    sanitized.disabledSources = [...new Set(
      next.disabledSources.filter((name) => typeof name === "string").map((name) => name.slice(0, 128)),
    )].slice(0, 200);
  }

  savePreference(db, "settings", sanitized);
  return sanitized;
}

function getLastRefresh(db) {
  return getPreference(db, "lastRefresh", null);
}

function setLastRefresh(db, value) {
  savePreference(db, "lastRefresh", value);
}

function getLastRefreshError(db) {
  return getPreference(db, "lastRefreshError", null);
}

function setLastRefreshError(db, value) {
  if (value) {
    savePreference(db, "lastRefreshError", value);
    return;
  }

  db.prepare("DELETE FROM preferences WHERE key = ?").run("lastRefreshError");
}

function getLastRefreshStats(db) {
  return getPreference(db, "lastRefreshStats", null);
}

function setLastRefreshStats(db, value) {
  if (value) {
    savePreference(db, "lastRefreshStats", value);
    return;
  }

  db.prepare("DELETE FROM preferences WHERE key = ?").run("lastRefreshStats");
}

function getScanState(db) {
  const stored = getPreference(db, "scanState", defaultScanState);
  return {
    ...defaultScanState,
    ...(stored && typeof stored === "object" ? stored : {}),
  };
}

function saveScanState(db, next) {
  const state = {
    teachingIds: Array.isArray(next?.teachingIds) ? next.teachingIds : [],
    teachingItems: Array.isArray(next?.teachingItems) ? next.teachingItems : [],
    digest: Boolean(next?.digest),
    clusterRatings:
      next?.clusterRatings && typeof next.clusterRatings === "object"
        ? next.clusterRatings
        : {},
    updatedAt: new Date().toISOString(),
  };
  savePreference(db, "scanState", state);
  return state;
}

function getImportanceFeedback(db) {
  const rows = db.prepare(`
    SELECT article_id, original_importance, user_importance, updated_at
    FROM importance_feedback
    ORDER BY updated_at DESC
  `).all();
  const feedback = {};

  for (const row of rows) {
    feedback[row.article_id] = {
      articleId: row.article_id,
      originalImportance: row.original_importance,
      userImportance: row.user_importance,
      updatedAt: row.updated_at,
    };
  }

  return feedback;
}

function saveImportanceFeedback(db, payload) {
  if (!payload || typeof payload.articleId !== "string") {
    throw new Error("articleId is required");
  }

  if (payload.reset === true) {
    db.prepare("DELETE FROM importance_feedback WHERE article_id = ?").run(payload.articleId);
    rebuildLearningProfile(db);
    return { success: true };
  }

  const originalImportance = Number(payload.originalImportance);
  const userImportance = Number(payload.userImportance);

  if (![1, 2, 3, 4, 5].includes(originalImportance) || ![1, 2, 3, 4, 5].includes(userImportance)) {
    throw new Error("originalImportance and userImportance must be 1-5");
  }

  db.prepare(`
    INSERT INTO importance_feedback (
      article_id, original_importance, user_importance, updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(article_id) DO UPDATE SET
      original_importance = excluded.original_importance,
      user_importance = excluded.user_importance,
      updated_at = excluded.updated_at
  `).run(payload.articleId, originalImportance, userImportance, new Date().toISOString());

  rebuildLearningProfile(db);
  return { success: true };
}

function averageMap(values) {
  const result = {};

  for (const [key, value] of values.entries()) {
    result[key] = Number((value.total / Math.max(value.count, 1)).toFixed(2));
  }

  return result;
}

function rebuildLearningProfile(db) {
  const rows = db.prepare(`
    SELECT
      f.article_id,
      f.original_importance,
      f.user_importance,
      a.domain,
      t.name AS tag
    FROM importance_feedback f
    JOIN articles a ON a.id = f.article_id
    LEFT JOIN article_tags at ON at.article_id = a.id
    LEFT JOIN tags t ON t.id = at.tag_id
  `).all();
  const domainTotals = new Map();
  const tagTotals = new Map();
  const seenFeedback = new Set();

  for (const row of rows) {
    const delta = row.user_importance - row.original_importance;
    seenFeedback.add(row.article_id);

    const domain = domainTotals.get(row.domain) ?? { total: 0, count: 0 };
    domain.total += delta;
    domain.count += 1;
    domainTotals.set(row.domain, domain);

    if (row.tag) {
      const tag = tagTotals.get(row.tag) ?? { total: 0, count: 0 };
      tag.total += delta;
      tag.count += 1;
      tagTotals.set(row.tag, tag);
    }
  }

  const profile = {
    domainAdjustments: averageMap(domainTotals),
    tagAdjustments: averageMap(tagTotals),
    sampleCount: seenFeedback.size,
  };

  db.prepare(`
    INSERT INTO learning_profile (key, value_json)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run("importance", JSON.stringify(profile));

  return profile;
}

function getLearningProfile(db) {
  const row = db.prepare("SELECT value_json FROM learning_profile WHERE key = ?").get("importance");
  return safeParse(row?.value_json, {
    domainAdjustments: {},
    tagAdjustments: {},
    sampleCount: 0,
  });
}

function clearLearningProfile(db) {
  db.prepare("DELETE FROM importance_feedback").run();
  db.prepare("DELETE FROM learning_profile").run();
  return { success: true };
}

function normalizeAffinityKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function feedbackDelta(payload) {
  if (payload.action === "click" || payload.action === "boost") {
    return 0.5;
  }

  if (payload.action === "expand") {
    return 0.3;
  }

  if (payload.action === "suppress") {
    return -0.5;
  }

  if (payload.action === "rescore") {
    const value = Number(payload.value);
    const impactScore = Number(payload.cluster?.impactScore ?? 5);

    if (!Number.isFinite(value)) {
      return 0;
    }

    return value >= impactScore ? 1 : -1;
  }

  return 0;
}

// One INSERT..ON CONFLICT..RETURNING instead of SELECT-then-INSERT-then-
// SELECT (3 round trips down to 1). Delta mode still needs the accumulation
// to happen relative to whatever's already stored, so that branch does the
// add + clamp in the UPDATE SET expression itself rather than reading the
// current score into JS first; the CASE picks overwrite-vs-accumulate per
// call without needing two separately-parsed statements.
function updateAffinity(db, payload) {
  const key = normalizeAffinityKey(payload?.key);
  const type = payload?.type === "entity" ? "entity" : "tag";
  const score = Number(payload?.score ?? payload?.delta ?? 0);
  const useAbsoluteScore = payload?.score !== undefined;

  if (!key || !Number.isFinite(score)) {
    throw new Error("key, type, and score or delta are required");
  }

  const updatedAt = new Date().toISOString();
  const boundScore = Number(Math.max(-10, Math.min(10, score)).toFixed(3));

  return stmt(db, `
    INSERT INTO user_affinity (key, type, score, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      type = excluded.type,
      score = CASE WHEN ? = 1
        THEN excluded.score
        ELSE MAX(-10, MIN(10, user_affinity.score + excluded.score))
      END,
      updated_at = excluded.updated_at
    RETURNING key, type, score, updated_at
  `).get(key, type, boundScore, updatedAt, useAbsoluteScore ? 1 : 0);
}

function updateAffinitiesForClusterFeedback(db, payload) {
  const delta = feedbackDelta(payload);
  const cluster = payload.cluster;

  if (!cluster || delta === 0) {
    return;
  }

  const targets = new Map();

  for (const tag of Array.isArray(cluster.tags) ? cluster.tags : []) {
    const key = normalizeAffinityKey(tag);
    if (key) {
      targets.set(`tag:${key}`, { key, type: "tag" });
    }
  }

  for (const entity of Array.isArray(cluster.entities) ? cluster.entities : []) {
    const key = normalizeAffinityKey(entity?.normalized || entity?.name);
    if (key) {
      targets.set(`entity:${key}`, { key, type: "entity" });
    }
  }

  // One commit for the whole cluster's tags/entities instead of one commit
  // per affinity update (5 tags + 5 entities was previously 10 separate
  // uncommitted-until-each-call round trips).
  const applyAll = db.transaction((items) => {
    for (const target of items) {
      updateAffinity(db, { ...target, delta });
    }
  });
  applyAll([...targets.values()]);
}

function saveUserFeedback(db, payload) {
  if (!payload || typeof payload.clusterId !== "string") {
    throw new Error("clusterId is required");
  }

  const action = String(payload.action ?? "");
  if (!["click", "expand", "boost", "suppress", "rescore"].includes(action)) {
    throw new Error("Unsupported feedback action");
  }

  const value = Number.isFinite(Number(payload.value)) ? Number(payload.value) : null;
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO user_feedback (cluster_id, action, value, created_at)
    VALUES (?, ?, ?, ?)
  `).run(payload.clusterId, action, value, createdAt);

  updateAffinitiesForClusterFeedback(db, { ...payload, action, value });

  return {
    success: true,
    feedback: {
      clusterId: payload.clusterId,
      action,
      value,
      createdAt,
    },
    affinities: getAffinities(db),
  };
}

function getUserFeedback(db, limit = 250) {
  return db.prepare(`
    SELECT id, cluster_id, action, value, created_at
    FROM user_feedback
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(1000, Number(limit) || 250))).map((row) => ({
    id: row.id,
    clusterId: row.cluster_id,
    action: row.action,
    value: row.value,
    createdAt: row.created_at,
  }));
}

function getAffinities(db) {
  return db.prepare(`
    SELECT key, type, score, updated_at
    FROM user_affinity
    ORDER BY ABS(score) DESC, updated_at DESC
  `).all().map((row) => ({
    key: row.key,
    type: row.type,
    score: row.score,
    updatedAt: row.updated_at,
  }));
}

function getRules(db) {
  return db.prepare(`
    SELECT id, type, field, value, weight
    FROM rules
    ORDER BY id ASC
  `).all();
}

function getPreferenceRows(db) {
  return db.prepare("SELECT * FROM preferences ORDER BY key ASC").all();
}

function getLearningRows(db) {
  return db.prepare("SELECT * FROM learning_profile ORDER BY key ASC").all();
}

function getFeedbackRows(db) {
  return db.prepare("SELECT * FROM importance_feedback ORDER BY updated_at DESC").all();
}

function getUserFeedbackRows(db) {
  return db.prepare("SELECT * FROM user_feedback ORDER BY created_at DESC").all();
}

function getAffinityRows(db) {
  return db.prepare("SELECT * FROM user_affinity ORDER BY key ASC").all();
}

function getRuleRows(db) {
  return db.prepare("SELECT * FROM rules ORDER BY id ASC").all();
}

module.exports = {
  clearLearningProfile,
  defaultScanState,
  defaultPreferences,
  getAffinityRows,
  getFeedbackRows,
  getAffinities,
  getImportanceFeedback,
  getLastRefresh,
  getLastRefreshError,
  getLastRefreshStats,
  getLearningProfile,
  getLearningRows,
  getPreference,
  getPreferenceRows,
  getPreferences,
  getRuleRows,
  getRules,
  getScanState,
  getUserFeedback,
  getUserFeedbackRows,
  rebuildLearningProfile,
  saveUserFeedback,
  saveImportanceFeedback,
  savePreference,
  savePreferences,
  saveScanState,
  setLastRefresh,
  setLastRefreshError,
  setLastRefreshStats,
  updateAffinity,
};
