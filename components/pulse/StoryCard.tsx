"use client";

import { type CSSProperties } from "react";
import {
  PULSE_ACCENT,
  PULSE_ACCENT_HIGHLIGHT,
  PULSE_ACCENT_SECONDARY,
  domainHue,
  exactDateLabel,
  scoreColor,
  type PulseStory,
} from "@/lib/pulse";
import { HeartIcon, XIcon } from "@/components/pulse/icons";

export type StoryCardProps = {
  story: PulseStory;
  scoreText: string;
  thumb: string;
  saved: boolean;
  vote: 1 | -1 | 0;
  hovered: boolean;
  isNew: boolean;
  onOpen: () => void;
  onEnter: () => void;
  onLeave: () => void;
  onLike: (e: React.MouseEvent) => void;
  onDislike: (e: React.MouseEvent) => void;
};

export function StoryCard({
  story,
  scoreText,
  saved,
  vote,
  hovered,
  isNew,
  onOpen,
  onEnter,
  onLeave,
  onLike,
  onDislike,
}: StoryCardProps) {
  const dismissed = vote === -1;
  const scoreValue = Number.parseFloat(scoreText) || 0;
  const hue = domainHue(story.domain);

  const voteBtn: CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
  const heartStyle: CSSProperties = {
    ...voteBtn,
    border: `1px solid ${saved ? PULSE_ACCENT : "rgba(255,255,255,0.14)"}`,
    background: saved ? PULSE_ACCENT_HIGHLIGHT : "transparent",
    color: saved ? "#131A25" : "#8a8894",
  };
  const dismissStyle: CSSProperties = {
    ...voteBtn,
    border: `1px solid ${dismissed ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.14)"}`,
    background: dismissed ? "rgba(255,255,255,0.18)" : "transparent",
    color: dismissed ? "#F7F3E6" : "#8a8894",
  };

  return (
    <article
      className="pulse-card"
      onClick={onOpen}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: "relative",
        width: 360,
        height: 182,
        flexShrink: 0,
        background: `radial-gradient(135% 135% at 100% 0%, hsla(${hue}, 45%, 45%, 0.1), transparent 62%), #171F2C`,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        padding: "18px 22px 16px 26px",
        boxSizing: "border-box",
        filter: dismissed ? "grayscale(1)" : undefined,
        opacity: dismissed ? 0.45 : 1,
        transition: "opacity 0.25s ease, filter 0.25s ease, transform 0.25s ease, border-color 0.25s ease",
      }}
    >
      {/* Domain accent bar */}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 15,
          bottom: 15,
          width: 3,
          borderRadius: "0 2px 2px 0",
          background: `hsl(${hue}, 55%, 55%)`,
        }}
      />

      {/* Source + score */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "#8a8894",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {story.source}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          {isNew ? (
            <span
              title="New since your last refresh"
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "#131A25",
                background: PULSE_ACCENT_HIGHLIGHT,
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              NEW
            </span>
          ) : null}
          <span
            title={`Impact score ${scoreValue.toFixed(1)}`}
            style={{
              fontSize: 14.5,
              fontWeight: 800,
              color: scoreColor(scoreValue),
              letterSpacing: "-0.02em",
            }}
          >
            {scoreValue.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Headline */}
      <h3
        style={{
          margin: 0,
          fontSize: 14.5,
          fontWeight: 600,
          lineHeight: 1.4,
          letterSpacing: "-0.01em",
          color: "#F7F3E6",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {story.title}
      </h3>

      {/* Time + actions */}
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          title={exactDateLabel(story.publishedAt) || undefined}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#66646f",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {story.timeAgo}
        </span>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <button
            className="pulse-vote"
            onClick={onLike}
            title={saved ? "Remove from My Likes" : "Add to My Likes"}
            style={heartStyle}
          >
            <HeartIcon filled={saved} />
          </button>
          <button
            className="pulse-vote"
            onClick={onDislike}
            title={dismissed ? "Bring back" : "Not interested — moves to the end and greys out"}
            style={dismissStyle}
          >
            <XIcon />
          </button>
        </div>
      </div>

      {/* AI summary on hover — covers the headline area, leaving source + score visible. */}
      <div
        style={{
          position: "absolute",
          top: 46,
          left: 3,
          right: 0,
          bottom: 42,
          background: "#171F2C",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: "none",
          overflow: "hidden",
          padding: "10px 22px 4px 23px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: PULSE_ACCENT_SECONDARY,
          }}
        >
          AI TL;DR
        </span>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.5,
            color: story.tldrIsAi ? "#d6d4dd" : "#8a8894",
            fontStyle: story.tldrIsAi ? "normal" : "italic",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {story.tldrIsAi ? story.tldr : "Summary not yet generated for this article."}
        </p>
      </div>
    </article>
  );
}
