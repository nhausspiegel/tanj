"use client";

import { useState, type CSSProperties } from "react";
import {
  PULSE_ACCENT,
  PULSE_ACCENT_HIGHLIGHT,
  PULSE_ACCENT_SECONDARY,
  RELEVANCE_MAX,
  exactDateLabel,
  type ArticleScoreBreakdown,
  type PulseStory,
} from "@/lib/pulse";
import { HeartIcon, XIcon } from "@/components/pulse/icons";

const SCORE_TERMS: Array<{ key: keyof ArticleScoreBreakdown; label: string }> = [
  { key: "recency", label: "Recency" },
  { key: "importance", label: "Importance" },
  { key: "tag", label: "Topic match" },
  { key: "novelty", label: "Freshness" },
];

// Red (low fill) -> green (high fill), smooth continuum via HSL hue
// (0deg = red, 120deg = green), not a hard threshold swap between colors.
function fillColor(pct: number): string {
  const hue = (Math.max(0, Math.min(100, pct)) / 100) * 120;
  return `hsl(${hue}, 72%, 50%)`;
}

function scoreBar(label: string, value: number, max: number) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 68, fontSize: 10, fontWeight: 700, color: "#9a98a3", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          flex: 1,
          height: 5,
          borderRadius: 3,
          background: "rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${pct}%`,
            borderRadius: 3,
            background: fillColor(pct),
          }}
        />
      </span>
      <span
        style={{
          width: 34,
          fontSize: 10,
          fontWeight: 700,
          color: "#F7F3E6",
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// Custom hover popover, not a native `title` — matches the source trust
// popover pattern in StoryModal.tsx. Renders as a sibling of the (clipped)
// thumbnail rather than a child of it, so the popover isn't cut off by the
// thumbnail's own overflow:hidden; the badge's own z-index keeps it above
// the AI TL;DR hover overlay, which is padded to clear the badge's footprint
// so the two never visually overlap.
function ScoreBadge({ scoreValue, breakdown }: { scoreValue: number; breakdown?: ArticleScoreBreakdown }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left: 10,
        top: 10,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        lineHeight: 1,
        background: "rgba(19,26,37,0.65)",
        border: "1px solid rgba(74,208,122,0.35)",
        backdropFilter: "blur(6px)",
        borderRadius: 8,
        padding: "5px 9px",
        cursor: "default",
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 900, color: "#4AD07A", letterSpacing: "-0.02em" }}>
        {scoreValue.toFixed(1)}
      </span>
      <span
        style={{
          fontSize: 7.5,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(74,208,122,0.65)",
          marginTop: 1,
        }}
      >
        score
      </span>
      {hovered && breakdown ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: 220,
            background: "#1E273A",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            padding: "11px 12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            zIndex: 10,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          {SCORE_TERMS.map(({ key, label }) => scoreBar(label, breakdown[key], RELEVANCE_MAX[key]))}
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 9.5,
              lineHeight: 1.4,
              color: "#6f6d78",
              textTransform: "none",
              letterSpacing: "normal",
              fontWeight: 500,
            }}
          >
            +1 if you follow this domain
          </p>
        </div>
      ) : null}
    </div>
  );
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
  const dismissed = vote === -1;
  const scoreValue = Number.parseFloat(scoreText) || 0;
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
        position: "relative",
        width: 290,
        flexShrink: 0,
        background: "#171F2C",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        // Not "hidden": the score badge's hover popover needs to escape this
        // box without being clipped by it (it renders below the badge, past
        // the thumbnail's bottom edge). The thumbnail below clips its own
        // image/overlay content via its own overflow + matching corner radius.
        overflow: "visible",
        cursor: "pointer",
        filter: dismissed ? "grayscale(1)" : undefined,
        opacity: dismissed ? 0.45 : 1,
        transition: "opacity 0.25s ease, filter 0.25s ease",
      }}
    >
      <div
        style={{
          position: "relative",
          height: 150,
          background: thumb,
          overflow: "hidden",
          borderRadius: "10px 10px 0 0",
        }}
      >
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
              background: PULSE_ACCENT_HIGHLIGHT,
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            NEW
          </span>
        ) : null}
        <div
          style={{
            // Top-anchored with a fixed padding-top: guarantees "AI TL;DR"
            // always sits a fixed distance below the badge (~10px + ~34px
            // tall), regardless of how many lines the summary clamps to —
            // unlike a bottom-anchored panel, whose top edge (and thus the
            // label's position) shifts with content length.
            position: "absolute",
            inset: 0,
            background: "rgba(19,26,37,0.86)",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.25s ease",
            padding: "64px 14px 8px",
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
              color: "#d6d4dd",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {story.tldr}
          </p>
        </div>
      </div>
      <ScoreBadge scoreValue={scoreValue} breakdown={story.scoreBreakdown} />

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
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: "#b5b3be",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {story.source}
          </span>
          <span style={{ ...dot, flexShrink: 0 }} />
          <span
            title={exactDateLabel(story.publishedAt) || undefined}
            style={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {story.timeAgo}
          </span>
          <div style={{ display: "flex", gap: 5, flexShrink: 0, marginLeft: "auto" }}>
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
