"use client";

export type TrendItem = {
  key: string;
  rank: number;
  title: string;
  source: string;
  timeAgo: string;
  scoreText: string;
  thumb: string;
  topicLabel: string;
  dotColor: string;
  onOpen: () => void;
};

export function TrendsGrid({ items }: { items: TrendItem[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(420px,1fr))",
        gap: "14px 26px",
        padding: "0 44px",
      }}
    >
      {items.map((tr) => (
        <div
          key={tr.key}
          className="pulse-trend"
          onClick={tr.onOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: 12,
            borderRadius: 12,
            cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <span
            style={{
              fontSize: 52,
              fontWeight: 900,
              letterSpacing: "-0.05em",
              color: "rgba(255,255,255,0.22)",
              width: 62,
              textAlign: "center",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {tr.rank}
          </span>
          <div style={{ width: 108, height: 64, borderRadius: 8, background: tr.thumb, flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: tr.dotColor,
              }}
            >
              {tr.topicLabel}
            </span>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1.3,
                color: "#f2f0f5",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {tr.title}
            </h3>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 11,
                color: "#8a8894",
                fontWeight: 600,
              }}
            >
              <span style={{ color: "#4AD07A", fontWeight: 800 }}>{tr.scoreText}</span>
              <span>{tr.source}</span>
              <span>{tr.timeAgo}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
