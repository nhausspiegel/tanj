"use client";

import { PULSE_ACCENT, exactDateLabel } from "@/lib/pulse";

export type TrendItem = {
  key: string;
  rank: number;
  title: string;
  lead: string;
  source: string;
  timeAgo: string;
  publishedAt?: string;
  isNew: boolean;
  scoreText: string;
  scoreValue: number;
  sourceCount: number;
  domainHue: number;
  topicLabel: string;
  onOpen: () => void;
};

type Tier = {
  rank: number;
  lead: number;
  score: number;
  paddingY: number;
  background: (hue: number) => string;
  border: (hue: number) => string;
  rankColor: string;
};

const TIERS: Tier[] = [
  {
    rank: 54,
    lead: 21,
    score: 33,
    paddingY: 26,
    background: (hue) => `linear-gradient(100deg, hsla(${hue},50%,32%,0.12), #171F2C 46%)`,
    border: (hue) => `1px solid hsla(${hue},55%,52%,0.24)`,
    rankColor: "#F7F3E6",
  },
  {
    rank: 43,
    lead: 18.5,
    score: 29,
    paddingY: 22,
    background: () => "#161D2A",
    border: () => "1px solid rgba(255,255,255,0.08)",
    rankColor: "#d6d4dd",
  },
  {
    rank: 35,
    lead: 16.5,
    score: 26,
    paddingY: 19,
    background: () => "#141B26",
    border: () => "1px solid rgba(255,255,255,0.06)",
    rankColor: "#8a8894",
  },
];

function tierFor(rank: number): Tier {
  if (rank <= 2) return TIERS[0];
  if (rank <= 4) return TIERS[1];
  return TIERS[2];
}

export function TrendsGrid({ items }: { items: TrendItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 44px", maxWidth: 860 }}>
      {items.map((tr) => {
        const tier = tierFor(tr.rank);
        return (
          <article
            key={tr.key}
            className="pulse-trend-row"
            onClick={tr.onOpen}
            style={{
              display: "flex",
              cursor: "pointer",
              borderRadius: 12,
              overflow: "hidden",
              background: tier.background(tr.domainHue),
              border: tier.border(tr.domainHue),
            }}
          >
            <div style={{ width: 4, flexShrink: 0, background: `hsl(${tr.domainHue}, 60%, 55%)` }} />

            <div
              style={{
                width: 82,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: `${tier.paddingY}px 8px`,
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: tier.rank,
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  color: tier.rankColor,
                }}
              >
                {tr.rank}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#55535e",
                }}
              >
                RANK
              </span>
            </div>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 8,
                padding: `${tier.paddingY}px 4px`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: `hsl(${tr.domainHue}, 65%, 68%)`,
                    background: `hsla(${tr.domainHue}, 55%, 45%, 0.16)`,
                    padding: "3px 7px",
                    borderRadius: 5,
                  }}
                >
                  {tr.topicLabel}
                </span>
                {tr.sourceCount > 1 ? (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: PULSE_ACCENT }}>
                    {tr.sourceCount} sources
                  </span>
                ) : null}
                <span style={{ fontSize: 11, fontWeight: 600, color: "#66646f" }}>·</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#8a8894" }}>{tr.source}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#66646f" }}>·</span>
                <span
                  style={{ fontSize: 11, fontWeight: 600, color: "#8a8894" }}
                  title={exactDateLabel(tr.publishedAt) || undefined}
                >
                  {tr.timeAgo}
                </span>
                {tr.isNew ? (
                  <span
                    title="New since your last refresh"
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      color: "#131A25",
                      background: PULSE_ACCENT,
                      padding: "3px 6px",
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    NEW
                  </span>
                ) : null}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: tier.lead,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  color: "#F7F3E6",
                  textWrap: "pretty",
                  display: "-webkit-box",
                  WebkitLineClamp: tr.rank <= 2 ? 3 : 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {tr.lead}
              </p>
            </div>

            <div
              style={{
                width: 76,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: `${tier.paddingY}px 8px`,
              }}
            >
              <span
                style={{
                  fontSize: tier.score,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  color: "#4AD07A",
                }}
              >
                {tr.scoreText.replace(" score", "")}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#55535e",
                }}
              >
                SCORE
              </span>
              <span
                style={{
                  width: "70%",
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.max(0, Math.min(100, tr.scoreValue * 10))}%`,
                    background: "#4AD07A",
                  }}
                />
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
