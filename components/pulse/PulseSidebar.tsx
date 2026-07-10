"use client";

import type { CSSProperties } from "react";
import { PULSE_ACCENT } from "@/lib/pulse";

export type NavItemVM = {
  key: string;
  label: string;
  badge: string;
  active: boolean;
  onClick: () => void;
};

export type TopicVM = {
  key: string;
  label: string;
  dot: string;
  opacity: number;
  mark: string;
  title: string;
  onClick: () => void;
};

const microHeader: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#66646f",
};

export function PulseSidebar({
  navItems,
  topics,
  moreDomains,
  cacheLine,
}: {
  navItems: NavItemVM[];
  topics: TopicVM[];
  moreDomains: string;
  cacheLine: string;
}) {
  return (
    <aside
      style={{
        width: 228,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        padding: "26px 18px 18px",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-0.03em", color: "#ffffff" }}>
          PULSE
        </span>
        <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-0.03em", color: PULSE_ACCENT }}>
          /AI
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#8a8894",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 26,
        }}
      >
        Tech intelligence, daily
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 26 }}>
        {navItems.map((n) => (
          <button
            key={n.key}
            className="pulse-nav"
            onClick={n.onClick}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: n.active ? "rgba(255,255,255,0.06)" : "transparent",
              border: "none",
              color: n.active ? "#ffffff" : "#a5a3ae",
              fontFamily: "inherit",
              fontSize: 13.5,
              fontWeight: 600,
              padding: "10px 12px",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <span>{n.label}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: PULSE_ACCENT }}>{n.badge}</span>
          </button>
        ))}
      </nav>

      <div style={{ ...microHeader, padding: "0 12px", marginBottom: 8 }}>Topics</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {topics.map((t) => (
          <button
            key={t.key}
            className="pulse-topic"
            onClick={t.onClick}
            title={t.title}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "transparent",
              border: "none",
              color: "#a5a3ae",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              opacity: t.opacity,
              width: "100%",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: t.dot,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1 }}>{t.label}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#8a8894" }}>{t.mark}</span>
          </button>
        ))}
      </div>

      {moreDomains ? (
        <div style={{ marginTop: 16, padding: "0 12px" }}>
          <div style={{ ...microHeader, marginBottom: 6 }}>More domains</div>
          <div style={{ fontSize: 11, lineHeight: 1.7, color: "#55535e" }}>{moreDomains}</div>
        </div>
      ) : null}

      <div style={{ marginTop: "auto", paddingTop: 22 }}>
        <button
          className="pulse-soft"
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: 10,
            background: "transparent",
            border: "none",
            color: "#8a8894",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            padding: "10px 12px",
            borderRadius: 8,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          Settings
        </button>
        <div style={{ fontSize: 10, color: "#55535e", padding: "8px 12px 0", lineHeight: 1.6 }}>
          {cacheLine}
        </div>
      </div>
    </aside>
  );
}
