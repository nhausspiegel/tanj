"use client";

import type { CSSProperties } from "react";
import { PULSE_ACCENT, sourceMark, type PulseStory } from "@/lib/pulse";
import { ThumbIcon } from "@/components/pulse/icons";

export type StoryCardProps = {
  story: PulseStory;
  scoreText: string;
  thumb: string;
  saved: boolean;
  vote: 1 | -1 | 0;
  hovered: boolean;
  onOpen: () => void;
  onEnter: () => void;
  onLeave: () => void;
  onLike: (e: React.MouseEvent) => void;
  onDislike: (e: React.MouseEvent) => void;
};

const dot: CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: "50%",
  background: "#66646f",
};

export function StoryCard({
  story,
  scoreText,
  thumb,
  saved,
  vote,
  hovered,
  onOpen,
  onEnter,
  onLeave,
  onLike,
  onDislike,
}: StoryCardProps) {
  const likeStyle: CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: `1px solid ${vote === 1 ? PULSE_ACCENT : "rgba(255,255,255,0.14)"}`,
    background: vote === 1 ? PULSE_ACCENT : "transparent",
    color: vote === 1 ? "#08080c" : "#8a8894",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
  const dislikeStyle: CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: `1px solid ${vote === -1 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.14)"}`,
    background: vote === -1 ? "rgba(255,255,255,0.18)" : "transparent",
    color: vote === -1 ? "#ffffff" : "#8a8894",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };

  return (
    <article
      className="pulse-card"
      onClick={onOpen}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        width: 290,
        flexShrink: 0,
        background: "#111118",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      <div style={{ position: "relative", height: 150, background: thumb }}>
        <span
          style={{
            position: "absolute",
            left: 14,
            bottom: 10,
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            color: "rgba(255,255,255,0.16)",
          }}
        >
          {sourceMark(story.source)}
        </span>
        {saved ? (
          <span
            style={{
              position: "absolute",
              right: 10,
              top: 10,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.75)",
              background: "rgba(8,8,12,0.55)",
              padding: "4px 8px",
              borderRadius: 4,
              backdropFilter: "blur(4px)",
            }}
          >
            SAVED
          </span>
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(8,8,12,0.86)",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.25s ease",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: PULSE_ACCENT,
            }}
          >
            AI TL;DR
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.5,
              color: "#d6d4dd",
              display: "-webkit-box",
              WebkitLineClamp: 5,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {story.tldr}
          </p>
        </div>
      </div>

      <div style={{ padding: "14px 14px 15px", display: "flex", flexDirection: "column", gap: 8 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 14.5,
            fontWeight: 700,
            lineHeight: 1.35,
            letterSpacing: "-0.01em",
            color: "#f2f0f5",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: 39,
          }}
        >
          {story.title}
        </h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 11.5,
            color: "#8a8894",
            fontWeight: 600,
          }}
        >
          <span style={{ color: "#4AD07A", fontWeight: 800 }}>{scoreText}</span>
          <span style={dot} />
          <span style={{ color: "#b5b3be" }}>{story.source}</span>
          <span style={dot} />
          <span>{story.timeAgo}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
            <button
              className="pulse-vote"
              onClick={onLike}
              title="Boost — raises affinity for this story and its domain"
              style={likeStyle}
            >
              <ThumbIcon />
            </button>
            <button
              className="pulse-vote"
              onClick={onDislike}
              title="Suppress — lowers affinity for this story and its domain"
              style={dislikeStyle}
            >
              <ThumbIcon down />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
