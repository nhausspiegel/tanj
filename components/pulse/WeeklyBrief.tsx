"use client";

import { PULSE_ACCENT } from "@/lib/pulse";

const card = {
  background: "#171F2C",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 12,
  padding: "24px 26px",
} as const;

const microLabel = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
};

export function WeeklyBrief({
  signalParagraph,
  insights,
}: {
  signalParagraph: string;
  insights: string[];
}) {
  return (
    <div
      style={{
        padding: "0 44px",
        maxWidth: 820,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={card}>
        <div style={{ ...microLabel, color: PULSE_ACCENT, marginBottom: 12 }}>This week in signal</div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: "#d6d4dd", textWrap: "pretty" }}>
          {signalParagraph}
        </p>
      </div>
      <div style={card}>
        <div style={{ ...microLabel, color: "#a5a3ae", marginBottom: 14 }}>Key insights</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {insights.map((text, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 12, fontSize: 14, lineHeight: 1.6, color: "#b5b3be" }}
            >
              <span style={{ color: PULSE_ACCENT, flexShrink: 0 }}>▸</span>
              <span style={{ textWrap: "pretty" }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
