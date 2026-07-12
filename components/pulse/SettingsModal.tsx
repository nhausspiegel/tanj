"use client";

import { useEffect, useState } from "react";
import { PULSE_ACCENT } from "@/lib/pulse";

type Provider = "openai" | "anthropic";

const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

const PROVIDER_KEY_HREF: Record<Provider, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [savedKeyPresent, setSavedKeyPresent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    window.desktop?.data
      .getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        setProvider((prefs.aiProvider as Provider) ?? "openai");
        setSavedKeyPresent(Boolean(prefs.aiApiKey));
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
          maxWidth: 480,
          background: "#1E273A",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          boxShadow: "0 40px 90px rgba(0,0,0,0.6)",
          padding: "26px 26px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
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

        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: PULSE_ACCENT,
            marginTop: 18,
            marginBottom: 8,
          }}
        >
          AI summaries
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.55, color: "#a5a3ae" }}>
          Paste your own API key to get real plain-language "why it matters" summaries. Without a
          key, PULSE still works — headlines just use the raw feed text. Your key is stored only on
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
                background: provider === p ? "rgba(222,244,120,0.1)" : "transparent",
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
              background: PULSE_ACCENT,
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
      </div>
    </div>
  );
}
