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
  onToggle: (e: React.MouseEvent) => void;
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
  canRefresh,
  refreshing,
  refreshWarning,
  onRefresh,
}: {
  navItems: NavItemVM[];
  topics: TopicVM[];
  moreDomains: string;
  cacheLine: string;
  canRefresh: boolean;
  refreshing: boolean;
  refreshWarning: string | null;
  onRefresh: () => void;
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
        <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-0.03em", color: "#F7F3E6" }}>
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
          marginBottom: 16,
        }}
      >
        Tech intelligence, daily
      </div>

      {canRefresh ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "10px 12px",
            marginBottom: 22,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <button
            className="pulse-soft"
            onClick={onRefresh}
            disabled={refreshing}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              background: refreshing ? "transparent" : PULSE_ACCENT,
              border: refreshing ? "1px solid rgba(255,255,255,0.14)" : "none",
              color: refreshing ? "#a5a3ae" : "#131A25",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 800,
              padding: "8px 10px",
              borderRadius: 7,
              cursor: refreshing ? "default" : "pointer",
            }}
          >
            {refreshing ? (
              <>
                <span className="pulse-spinner" />
                Refreshing…
              </>
            ) : (
              <>↻ Refresh now</>
            )}
          </button>
          <div
            style={{
              fontSize: 10.5,
              lineHeight: 1.5,
              color: refreshWarning ? "#e5a13c" : "#66646f",
            }}
            title={refreshWarning ?? undefined}
          >
            {refreshWarning ?? cacheLine}
          </div>
        </div>
      ) : null}

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
              color: n.active ? "#F7F3E6" : "#a5a3ae",
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
          <div
            key={t.key}
            className="pulse-topic"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "2px 4px 2px 12px",
              borderRadius: 8,
              opacity: t.opacity,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <button
              onClick={t.onClick}
              title={t.title}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                color: "#a5a3ae",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 500,
                padding: "6px 0",
                cursor: "pointer",
                textAlign: "left",
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
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.label}
              </span>
            </button>
            <button
              className="pulse-topic-toggle"
              onClick={t.onToggle}
              title={t.title}
              style={{
                flexShrink: 0,
                width: 20,
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                borderRadius: 5,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 800,
                color: "#8a8894",
              }}
            >
              {t.mark}
            </button>
          </div>
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
        {!canRefresh ? (
          <div style={{ fontSize: 10, color: "#55535e", padding: "8px 12px 0", lineHeight: 1.6 }}>
            {cacheLine}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
