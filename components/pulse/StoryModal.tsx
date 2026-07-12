"use client";

import { useState, type CSSProperties } from "react";
import { PULSE_ACCENT, domainHue, domainLabel, exactDateLabel, sourceMark, type PulseSourceRef, type PulseStory } from "@/lib/pulse";
import { recencyLabel, recencyScore, trustLabel } from "@/lib/outlets";
import { HeartIcon } from "@/components/pulse/icons";

const dot: CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: "50%",
  background: "#66646f",
};

function hoursAgoLabel(hoursAgo: number): string {
  if (hoursAgo < 1) return "just now";
  if (hoursAgo < 24) return `${Math.round(hoursAgo)}h ago`;
  return `${Math.round(hoursAgo / 24)}d ago`;
}

function meterBar(value: number, key: string) {
  const height = Math.max(2, (value / 5) * 16);
  return (
    <span key={key} style={{ width: 3, height: 16, display: "flex", alignItems: "flex-end" }}>
      <span
        style={{
          width: "100%",
          height,
          borderRadius: 1,
          background: PULSE_ACCENT,
          opacity: 0.35 + (value / 5) * 0.65,
        }}
      />
    </span>
  );
}

function SourceRow({ source, hue }: { source: PulseSourceRef; hue: number }) {
  const [meterHovered, setMeterHovered] = useState(false);
  const recency = recencyScore(source.hoursAgo);
  const meterTitle = `Recency: ${recencyLabel(recency)} · Reputability: ${trustLabel(source.reputability)} · Reach: ${trustLabel(source.reach)}`;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        padding: "12px 0",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: `hsla(${hue},55%,42%,0.4)`,
          color: "#F7F3E6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {sourceMark(source.name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 3 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#F7F3E6" }}>{source.name}</span>
          <span style={{ fontSize: 10.5, color: "#66646f", flexShrink: 0 }}>
            {hoursAgoLabel(source.hoursAgo)}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.45,
            color: "#8a8894",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {source.summary}
        </p>
      </div>
      <div
        onMouseEnter={() => setMeterHovered(true)}
        onMouseLeave={() => setMeterHovered(false)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          height: 24,
          padding: "4px 6px",
          margin: "-4px -6px 0 0",
          flexShrink: 0,
        }}
      >
        {[meterBar(recency, "recency"), meterBar(source.reputability, "rep"), meterBar(source.reach, "reach")]}
        {meterHovered ? (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              right: 0,
              maxWidth: 220,
              width: "max-content",
              background: "#1E273A",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 6,
              padding: "6px 9px",
              fontSize: 11,
              lineHeight: 1.4,
              color: "#d6d4dd",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            {meterTitle}
          </div>
        ) : null}
      </div>
    </a>
  );
}

export function StoryModal({
  story,
  scoreText,
  thumb,
  saved,
  onClose,
  onToggleSave,
  onReadOriginal,
}: {
  story: PulseStory;
  scoreText: string;
  thumb: string;
  saved: boolean;
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
          maxWidth: 620,
          maxHeight: "82vh",
          background: "#1E273A",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          overflowY: "auto",
          overflowX: "hidden",
          boxShadow: "0 40px 90px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 1, height: 170, background: thumb }}>
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
              background: "rgba(19,26,37,0.6)",
              color: "#F7F3E6",
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
              color: "#131A25",
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
              color: "#F7F3E6",
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
            <span title={exactDateLabel(story.publishedAt) || undefined}>{story.timeAgo}</span>
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
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#a5a3ae",
                marginBottom: 4,
              }}
            >
              {story.sources.length} source{story.sources.length === 1 ? "" : "s"} covering this story
            </div>
            <div>
              {story.sources.map((source) => (
                <SourceRow key={source.name + source.url} source={source} hue={domainHue(story.domain)} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              className="pulse-accent-btn"
              onClick={onReadOriginal}
              disabled={!story.url}
              style={{
                background: PULSE_ACCENT,
                color: "#131A25",
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
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: saved ? PULSE_ACCENT : "rgba(255,255,255,0.08)",
                color: saved ? "#131A25" : "#F7F3E6",
                border: `1px solid ${saved ? PULSE_ACCENT : "rgba(255,255,255,0.16)"}`,
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 700,
                padding: "10px 18px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <HeartIcon filled={saved} />
              {saved ? "Liked" : "Like"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
