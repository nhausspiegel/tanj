"use client";

import { useState, type CSSProperties } from "react";
import { PULSE_ACCENT, exactDateLabel, sourceMark, type PulseStory } from "@/lib/pulse";
import { HeartIcon, XIcon } from "@/components/pulse/icons";

function scoreExplanation(story: PulseStory, scoreText: string): string {
  const n = story.sources.length;
  const corroboration =
    n > 1 ? `Corroborated by ${n} sources, which lifts the score.` : "Reported by one source so far.";
  return `${scoreText} — ${corroboration} Adjusts with your boosts, suppresses, and saves.`;
}

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
  isNew,
  onOpen,
  onEnter,
  onLeave,
  onLike,
  onDislike,
}: StoryCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const scoreValue = Number.parseFloat(scoreText) || 0;
  const dismissed = vote === -1;
  const heartStyle: CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: `1px solid ${saved ? PULSE_ACCENT : "rgba(255,255,255,0.14)"}`,
    background: saved ? PULSE_ACCENT : "transparent",
    color: saved ? "#131A25" : "#8a8894",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };
  const dismissStyle: CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: `1px solid ${dismissed ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.14)"}`,
    background: dismissed ? "rgba(255,255,255,0.18)" : "transparent",
    color: dismissed ? "#F7F3E6" : "#8a8894",
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
        background: "#171F2C",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        filter: dismissed ? "grayscale(1)" : undefined,
        opacity: dismissed ? 0.45 : 1,
        transition: "opacity 0.25s ease, filter 0.25s ease",
      }}
    >
      <div style={{ position: "relative", height: 150, background: thumb, overflow: "hidden" }}>
        {story.imageUrl && !imgFailed ? (
          // Feed-hosted images vary too widely in domain to whitelist for next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={story.imageUrl}
            alt=""
            onError={() => setImgFailed(true)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}
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
        {isNew ? (
          <span
            title="New since your last refresh"
            style={{
              position: "absolute",
              right: 10,
              top: 10,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "#131A25",
              background: PULSE_ACCENT,
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            NEW
          </span>
        ) : null}
        {saved ? (
          <span
            style={{
              position: "absolute",
              right: 10,
              top: isNew ? 34 : 10,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.75)",
              background: "rgba(19,26,37,0.55)",
              padding: "4px 8px",
              borderRadius: 4,
              backdropFilter: "blur(4px)",
            }}
          >
            LIKED
          </span>
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(19,26,37,0.86)",
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
            color: "#F7F3E6",
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
          <span
            title={scoreExplanation(story, scoreText)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "default" }}
          >
            <span style={{ color: "#4AD07A", fontWeight: 800 }}>{scoreText}</span>
            <span
              style={{
                width: 22,
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.1)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${Math.max(0, Math.min(100, scoreValue * 10))}%`,
                  background: "#4AD07A",
                  borderRadius: 2,
                }}
              />
            </span>
          </span>
          <span style={dot} />
          <span style={{ color: "#b5b3be" }}>{story.source}</span>
          <span style={dot} />
          <span title={exactDateLabel(story.publishedAt) || undefined}>{story.timeAgo}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
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
      </div>
    </article>
  );
}
