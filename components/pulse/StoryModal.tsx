"use client";

import type { CSSProperties } from "react";
import { PULSE_ACCENT, domainLabel, type PulseStory } from "@/lib/pulse";

const dot: CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: "50%",
  background: "#66646f",
};

export function StoryModal({
  story,
  scoreText,
  thumb,
  saveLabel,
  onClose,
  onToggleSave,
  onReadOriginal,
}: {
  story: PulseStory;
  scoreText: string;
  thumb: string;
  saveLabel: string;
  onClose: () => void;
  onToggleSave: () => void;
  onReadOriginal: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,4,8,0.78)",
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
          maxWidth: 620,
          background: "#13131b",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 40px 90px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ position: "relative", height: 170, background: thumb }}>
          <button
            className="pulse-close"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              right: 14,
              top: 14,
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: "rgba(8,8,12,0.6)",
              color: "#ffffff",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ×
          </button>
          <span
            style={{
              position: "absolute",
              left: 22,
              bottom: 14,
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#08080c",
              background: PULSE_ACCENT,
              padding: "5px 10px",
              borderRadius: 4,
            }}
          >
            {domainLabel(story.domain)}
          </span>
        </div>
        <div style={{ padding: "24px 26px 26px" }}>
          <h2
            style={{
              margin: "0 0 10px",
              fontSize: 23,
              fontWeight: 850,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              textWrap: "balance",
            }}
          >
            {story.title}
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: "#8a8894",
              fontWeight: 600,
              marginBottom: 18,
            }}
          >
            <span style={{ color: "#4AD07A", fontWeight: 800 }}>{scoreText}</span>
            <span style={dot} />
            <span style={{ color: "#c9c7d0" }}>{story.source}</span>
            <span style={dot} />
            <span>{story.timeAgo}</span>
            <span style={dot} />
            <span>IMP {story.importance}/5</span>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "16px 18px",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: PULSE_ACCENT,
                marginBottom: 7,
              }}
            >
              AI TL;DR
            </div>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "#d6d4dd" }}>{story.tldr}</p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              className="pulse-accent-btn"
              onClick={onReadOriginal}
              disabled={!story.url}
              style={{
                background: PULSE_ACCENT,
                color: "#08080c",
                border: "none",
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 800,
                padding: "11px 20px",
                borderRadius: 6,
                cursor: story.url ? "pointer" : "not-allowed",
                opacity: story.url ? 1 : 0.55,
              }}
            >
              Read original
            </button>
            <button
              className="pulse-glass-btn"
              onClick={onToggleSave}
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.16)",
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 700,
                padding: "10px 18px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
