"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { DOMAIN_HUE, PULSE_ACCENT, PULSE_ACCENT_HIGHLIGHT, PULSE_DOMAIN_ORDER, domainLabel } from "@/lib/pulse";
import type { ArticleDomain } from "@/lib/types";

type Provider = "openai" | "anthropic";

const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

const PROVIDER_KEY_HREF: Record<Provider, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

// Mirrors electron/repositories/preferencesRepo.js's defaultPreferences —
// used to seed state before load and to power "Reset to defaults".
const DEFAULT_REFRESH_TUNING: DesktopRefreshTuning = {
  maxConcurrentFeeds: 3,
  feedBatchPauseMs: 150,
  maxFeedBytes: 1_500_000,
  feedTimeoutMs: 15000,
  maxExtractionArticles: 80,
  maxTotalArticles: 500,
};
const DEFAULT_AI_TUNING: DesktopAiTuning = {
  model: "",
  batchSize: 6,
  pauseBetweenBatchesMs: 300,
  maxOutputTokens: 2000,
  temperature: 0,
  ollamaBaseUrl: "",
  keepAlive: "",
  timeoutMs: 45000,
};
const DEFAULT_RESOURCE_TUNING: DesktopResourceTuning = {
  warningFreeMemoryMb: 768,
  minFreeMemoryMb: 256,
  warningProcessRssMb: 1024,
  maxProcessRssMb: 1536,
};
const DEFAULT_THEME: DesktopThemeOverrides = {
  accentPrimary: "#788CE3",
  accentSecondary: "#83CDFF",
  accentHighlight: "#DEF478",
};

const microLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "#66646f",
  marginBottom: 3,
  display: "block",
};

const fieldInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 6,
  padding: "7px 9px",
  color: "#F7F3E6",
  fontFamily: "inherit",
  fontSize: 12.5,
};

const sectionLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: PULSE_ACCENT,
  marginTop: 22,
  marginBottom: 10,
};

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={microLabel}>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ...fieldInput, fontVariantNumeric: "tabular-nums" }}
      />
    </label>
  );
}

// Wraps NumberField for *Ms tuning fields: value/onChange work in ms (the
// storage unit every timing field in the backend uses), display is seconds
// so the user isn't hand-converting "45000" in their head.
function SecondsField({
  label,
  valueMs,
  onChangeMs,
  minMs,
  maxMs,
  stepSeconds = 0.1,
}: {
  label: string;
  valueMs: number;
  onChangeMs: (valueMs: number) => void;
  minMs?: number;
  maxMs?: number;
  stepSeconds?: number;
}) {
  return (
    <NumberField
      label={label}
      value={Number.isFinite(valueMs) ? valueMs / 1000 : valueMs}
      min={minMs !== undefined ? minMs / 1000 : undefined}
      max={maxMs !== undefined ? maxMs / 1000 : undefined}
      step={stepSeconds}
      onChange={(seconds) => onChangeMs(Math.round(seconds * 1000))}
    />
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={microLabel}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={fieldInput}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={microLabel}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 34,
            height: 30,
            padding: 0,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...fieldInput, fontFamily: "monospace", letterSpacing: "0.02em" }}
        />
      </div>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: 34,
          height: 19,
          borderRadius: 10,
          background: checked ? PULSE_ACCENT : "rgba(255,255,255,0.14)",
          position: "relative",
          transition: "background 0.15s ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 17 : 2,
            width: 15,
            height: 15,
            borderRadius: "50%",
            background: checked ? "#131A25" : "#F7F3E6",
            transition: "left 0.15s ease",
          }}
        />
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#F7F3E6" }}>{label}</span>
    </button>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [savedKeyPresent, setSavedKeyPresent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [devMode, setDevMode] = useState(false);
  const [coloredScoreBadges, setColoredScoreBadges] = useState(false);
  const [refreshTuning, setRefreshTuning] = useState<DesktopRefreshTuning>(DEFAULT_REFRESH_TUNING);
  const [aiTuning, setAiTuning] = useState<DesktopAiTuning>(DEFAULT_AI_TUNING);
  const [resourceTuning, setResourceTuning] = useState<DesktopResourceTuning>(DEFAULT_RESOURCE_TUNING);
  const [themeOverrides, setThemeOverrides] = useState<DesktopThemeOverrides>(DEFAULT_THEME);
  const [domainHueOverrides, setDomainHueOverridesState] = useState<Record<string, number>>({});
  const [disabledSources, setDisabledSources] = useState<string[]>([]);
  const [sources, setSources] = useState<DesktopSourceInfo[]>([]);
  const [devStatus, setDevStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.desktop?.data.getPreferences(),
      window.desktop?.data.getSources(),
    ])
      .then(([prefs, sourceList]) => {
        if (cancelled || !prefs) return;
        setProvider((prefs.aiProvider as Provider) ?? "openai");
        setSavedKeyPresent(Boolean(prefs.aiApiKey));
        setDevMode(Boolean(prefs.devMode));
        setColoredScoreBadges(Boolean(prefs.coloredScoreBadges));
        if (prefs.refreshTuning) setRefreshTuning(prefs.refreshTuning);
        if (prefs.aiTuning) setAiTuning(prefs.aiTuning);
        if (prefs.resourceTuning) setResourceTuning(prefs.resourceTuning);
        if (prefs.themeOverrides) {
          setThemeOverrides({
            accentPrimary: prefs.themeOverrides.accentPrimary || DEFAULT_THEME.accentPrimary,
            accentSecondary: prefs.themeOverrides.accentSecondary || DEFAULT_THEME.accentSecondary,
            accentHighlight: prefs.themeOverrides.accentHighlight || DEFAULT_THEME.accentHighlight,
          });
        }
        setDomainHueOverridesState(prefs.domainHueOverrides ?? {});
        setDisabledSources(prefs.disabledSources ?? []);
        setSources(sourceList ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setStatus(null);
    const result = await window.desktop?.data.savePreferences({
      aiProvider: provider,
      aiApiKey: apiKey,
    });
    if (result?.success === false) {
      setStatus(result.error ?? "Could not save.");
      return;
    }
    setSavedKeyPresent(Boolean(apiKey));
    setApiKey("");
    setStatus(apiKey ? "Key saved." : "Key cleared.");
  }

  async function clearKey() {
    setApiKey("");
    setStatus(null);
    const result = await window.desktop?.data.savePreferences({ aiApiKey: "" });
    if (result?.success === false) {
      setStatus(result.error ?? "Could not clear.");
      return;
    }
    setSavedKeyPresent(false);
    setStatus("Key cleared.");
  }

  async function saveDevSettings() {
    setDevStatus(null);
    const result = await window.desktop?.data.savePreferences({
      devMode,
      coloredScoreBadges,
      refreshTuning,
      aiTuning,
      resourceTuning,
      themeOverrides,
      domainHueOverrides,
      disabledSources,
    });
    if (result?.success === false) {
      setDevStatus(result.error ?? "Could not save.");
      return;
    }
    setDevStatus("Saved — takes effect on the next refresh.");
  }

  async function resetDevSettings() {
    setColoredScoreBadges(false);
    setRefreshTuning(DEFAULT_REFRESH_TUNING);
    setAiTuning(DEFAULT_AI_TUNING);
    setResourceTuning(DEFAULT_RESOURCE_TUNING);
    setThemeOverrides(DEFAULT_THEME);
    setDomainHueOverridesState({});
    setDisabledSources([]);
    setDevStatus(null);
    const result = await window.desktop?.data.savePreferences({
      coloredScoreBadges: false,
      refreshTuning: DEFAULT_REFRESH_TUNING,
      aiTuning: DEFAULT_AI_TUNING,
      resourceTuning: DEFAULT_RESOURCE_TUNING,
      themeOverrides: { accentPrimary: "", accentSecondary: "", accentHighlight: "" },
      domainHueOverrides: {},
      disabledSources: [],
    });
    setDevStatus(result?.success === false ? (result.error ?? "Could not reset.") : "Reset to defaults.");
  }

  const sourcesByCategory = useMemo(() => {
    const grouped = new Map<string, DesktopSourceInfo[]>();
    for (const domain of PULSE_DOMAIN_ORDER) grouped.set(domain, []);
    for (const source of sources) {
      const list = grouped.get(source.category) ?? [];
      list.push(source);
      grouped.set(source.category, list);
    }
    return [...grouped.entries()].filter(([, list]) => list.length > 0);
  }, [sources]);

  function toggleSource(name: string) {
    setDisabledSources((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,13,19,0.78)",
        backdropFilter: "blur(6px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: devMode ? 640 : 480,
          maxHeight: "84vh",
          display: "flex",
          flexDirection: "column",
          background: "#1E273A",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          boxShadow: "0 40px 90px rgba(0,0,0,0.6)",
          transition: "max-width 0.2s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "26px 26px 0",
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#F7F3E6" }}>Settings</h2>
          <button
            className="pulse-close"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "none",
              background: "rgba(19,26,37,0.6)",
              color: "#F7F3E6",
              fontSize: 15,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 26px 24px" }}>
          <div style={sectionLabel}>AI summaries</div>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.55, color: "#a5a3ae" }}>
            Paste your own API key to get real plain-language "why it matters" summaries. Without a
            key, TANJ still works — headlines just use the raw feed text. Your key is stored only on
            this machine and sent directly to the provider, never anywhere else.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["openai", "anthropic"] as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 7,
                  border: provider === p ? `1px solid ${PULSE_ACCENT}` : "1px solid rgba(255,255,255,0.14)",
                  background: provider === p ? "rgba(120,140,227,0.12)" : "transparent",
                  color: provider === p ? "#F7F3E6" : "#a5a3ae",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {PROVIDER_LABEL[p]}
              </button>
            ))}
          </div>

          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8a8894", marginBottom: 6 }}>
            {PROVIDER_LABEL[provider]} API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={savedKeyPresent ? "•••••••••••••••••••• (saved — enter a new key to replace)" : "sk-..."}
            disabled={loading}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 7,
              padding: "10px 12px",
              color: "#F7F3E6",
              fontFamily: "inherit",
              fontSize: 13,
              marginBottom: 8,
            }}
          />

          <a
            href={PROVIDER_KEY_HREF[provider]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11.5, color: PULSE_ACCENT, fontWeight: 600 }}
          >
            Get a {PROVIDER_LABEL[provider]} key ↗
          </a>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
            <button
              className="pulse-accent-btn"
              onClick={save}
              disabled={loading || !apiKey}
              style={{
                background: PULSE_ACCENT_HIGHLIGHT,
                color: "#131A25",
                border: "none",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
                padding: "10px 18px",
                borderRadius: 6,
                cursor: loading || !apiKey ? "not-allowed" : "pointer",
                opacity: loading || !apiKey ? 0.5 : 1,
              }}
            >
              Save key
            </button>
            {savedKeyPresent ? (
              <button
                onClick={clearKey}
                disabled={loading}
                style={{
                  background: "transparent",
                  color: "#a5a3ae",
                  border: "1px solid rgba(255,255,255,0.14)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "10px 16px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Clear saved key
              </button>
            ) : null}
            {status ? <span style={{ fontSize: 11.5, color: "#a5a3ae" }}>{status}</span> : null}
          </div>

          <div
            style={{
              marginTop: 26,
              paddingTop: 18,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Toggle label="Dev mode" checked={devMode} onChange={setDevMode} />
            <p style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "#66646f" }}>
              Exposes low-level tuning — refresh/fetch pacing, AI batching, memory thresholds, theme
              colors, and per-source toggles.
            </p>
          </div>

          {devMode ? (
            <>
              <div style={sectionLabel}>Dashboard</div>
              <Toggle
                label="Colored score badges"
                checked={coloredScoreBadges}
                onChange={setColoredScoreBadges}
              />
              <p style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "#66646f" }}>
                Colors badges from red at 1 to green at 10, matching the score breakdown bars.
              </p>

              <div style={sectionLabel}>Refresh &amp; fetch</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <NumberField
                  label="Concurrent feeds"
                  value={refreshTuning.maxConcurrentFeeds}
                  min={1}
                  max={12}
                  onChange={(v) => setRefreshTuning((t) => ({ ...t, maxConcurrentFeeds: v }))}
                />
                <SecondsField
                  label="Pause between batches (sec)"
                  valueMs={refreshTuning.feedBatchPauseMs}
                  minMs={0}
                  stepSeconds={0.05}
                  onChangeMs={(v) => setRefreshTuning((t) => ({ ...t, feedBatchPauseMs: v }))}
                />
                <SecondsField
                  label="Per-feed timeout (sec)"
                  valueMs={refreshTuning.feedTimeoutMs}
                  minMs={1000}
                  stepSeconds={1}
                  onChangeMs={(v) => setRefreshTuning((t) => ({ ...t, feedTimeoutMs: v }))}
                />
                <NumberField
                  label="Max feed size (bytes)"
                  value={refreshTuning.maxFeedBytes}
                  min={10000}
                  step={100000}
                  onChange={(v) => setRefreshTuning((t) => ({ ...t, maxFeedBytes: v }))}
                />
                <NumberField
                  label="Full-text extraction cap"
                  value={refreshTuning.maxExtractionArticles}
                  min={0}
                  max={500}
                  onChange={(v) => setRefreshTuning((t) => ({ ...t, maxExtractionArticles: v }))}
                />
                <NumberField
                  label="Total articles per refresh"
                  value={refreshTuning.maxTotalArticles}
                  min={10}
                  max={2000}
                  onChange={(v) => setRefreshTuning((t) => ({ ...t, maxTotalArticles: v }))}
                />
              </div>

              <div style={sectionLabel}>AI enrichment</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <TextField
                  label="Local model override"
                  value={aiTuning.model}
                  placeholder="qwen2.5-coder:7b"
                  onChange={(v) => setAiTuning((t) => ({ ...t, model: v }))}
                />
                <TextField
                  label="Ollama base URL"
                  value={aiTuning.ollamaBaseUrl}
                  placeholder="http://localhost:11434"
                  onChange={(v) => setAiTuning((t) => ({ ...t, ollamaBaseUrl: v }))}
                />
                <NumberField
                  label="Batch size (articles/call)"
                  value={aiTuning.batchSize}
                  min={1}
                  max={50}
                  onChange={(v) => setAiTuning((t) => ({ ...t, batchSize: v }))}
                />
                <SecondsField
                  label="Pause between batches (sec)"
                  valueMs={aiTuning.pauseBetweenBatchesMs}
                  minMs={0}
                  stepSeconds={0.05}
                  onChangeMs={(v) => setAiTuning((t) => ({ ...t, pauseBetweenBatchesMs: v }))}
                />
                <SecondsField
                  label="Batch timeout (sec)"
                  valueMs={aiTuning.timeoutMs}
                  minMs={5000}
                  maxMs={300000}
                  stepSeconds={5}
                  onChangeMs={(v) => setAiTuning((t) => ({ ...t, timeoutMs: v }))}
                />
                <NumberField
                  label="Max output tokens"
                  value={aiTuning.maxOutputTokens}
                  min={100}
                  max={16000}
                  step={100}
                  onChange={(v) => setAiTuning((t) => ({ ...t, maxOutputTokens: v }))}
                />
                <NumberField
                  label="Temperature"
                  value={aiTuning.temperature}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(v) => setAiTuning((t) => ({ ...t, temperature: v }))}
                />
                <TextField
                  label="Keep-alive (e.g. 2m)"
                  value={aiTuning.keepAlive}
                  placeholder="default"
                  onChange={(v) => setAiTuning((t) => ({ ...t, keepAlive: v }))}
                />
              </div>

              <div style={sectionLabel}>Resource thresholds</div>
              <p style={{ margin: "-4px 0 10px", fontSize: 11.5, lineHeight: 1.5, color: "#66646f" }}>
                Controls when refresh throttles for memory pressure, based on this app's own
                memory use (not OS-reported free memory, which reads unreliably low on some
                platforms).
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <NumberField
                  label="Warning process RSS (MB)"
                  value={resourceTuning.warningProcessRssMb}
                  min={64}
                  step={64}
                  onChange={(v) => setResourceTuning((t) => ({ ...t, warningProcessRssMb: v }))}
                />
                <NumberField
                  label="Max process RSS (MB)"
                  value={resourceTuning.maxProcessRssMb}
                  min={128}
                  step={128}
                  onChange={(v) => setResourceTuning((t) => ({ ...t, maxProcessRssMb: v }))}
                />
              </div>

              <div style={sectionLabel}>Theme</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <ColorField
                  label="Primary accent"
                  value={themeOverrides.accentPrimary}
                  onChange={(v) => setThemeOverrides((t) => ({ ...t, accentPrimary: v }))}
                />
                <ColorField
                  label="Secondary accent"
                  value={themeOverrides.accentSecondary}
                  onChange={(v) => setThemeOverrides((t) => ({ ...t, accentSecondary: v }))}
                />
                <ColorField
                  label="Highlight accent"
                  value={themeOverrides.accentHighlight}
                  onChange={(v) => setThemeOverrides((t) => ({ ...t, accentHighlight: v }))}
                />
              </div>

              <div style={sectionLabel}>Domain colors</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                }}
              >
                {PULSE_DOMAIN_ORDER.map((domain: ArticleDomain) => {
                  const hue = domainHueOverrides[domain] ?? DOMAIN_HUE[domain] ?? 210;
                  return (
                    <div
                      key={domain}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 6,
                        padding: "5px 7px",
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: `hsl(${hue}, 65%, 60%)`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: "#a5a3ae",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={domainLabel(domain)}
                      >
                        {domainLabel(domain)}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={360}
                        value={hue}
                        onChange={(e) =>
                          setDomainHueOverridesState((prev) => ({
                            ...prev,
                            [domain]: Number(e.target.value),
                          }))
                        }
                        style={{
                          width: 44,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.14)",
                          borderRadius: 4,
                          padding: "3px 4px",
                          color: "#F7F3E6",
                          fontFamily: "inherit",
                          fontSize: 10.5,
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div style={sectionLabel}>Sources ({sources.length - disabledSources.length}/{sources.length} enabled)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sourcesByCategory.map(([category, list]) => (
                  <div key={category}>
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "#55535e",
                        marginBottom: 5,
                      }}
                    >
                      {domainLabel(category as ArticleDomain)}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {list.map((source) => {
                        const enabled = !disabledSources.includes(source.name);
                        return (
                          <button
                            key={source.name}
                            type="button"
                            onClick={() => toggleSource(source.name)}
                            title={enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                            style={{
                              fontFamily: "inherit",
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "4px 9px",
                              borderRadius: 12,
                              cursor: "pointer",
                              border: enabled ? `1px solid ${PULSE_ACCENT}` : "1px solid rgba(255,255,255,0.1)",
                              background: enabled ? "rgba(120,140,227,0.12)" : "rgba(255,255,255,0.02)",
                              color: enabled ? "#F7F3E6" : "#55535e",
                              textDecoration: enabled ? "none" : "line-through",
                            }}
                          >
                            {source.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
                <button
                  onClick={saveDevSettings}
                  style={{
                    background: PULSE_ACCENT_HIGHLIGHT,
                    color: "#131A25",
                    border: "none",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 800,
                    padding: "10px 18px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Save dev settings
                </button>
                <button
                  onClick={resetDevSettings}
                  style={{
                    background: "transparent",
                    color: "#a5a3ae",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "10px 16px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Reset to defaults
                </button>
                {devStatus ? <span style={{ fontSize: 11.5, color: "#a5a3ae" }}>{devStatus}</span> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
