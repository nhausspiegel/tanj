"use client";

import { useState, type CSSProperties, type DragEvent } from "react";
import { PULSE_ACCENT, PULSE_ACCENT_HIGHLIGHT } from "@/lib/pulse";
import type { PulseRefreshProgress } from "@/components/pulse/usePulseData";

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
  refreshProgress,
  refreshElapsedSeconds,
  refreshWarning,
  onRefresh,
  onOpenSettings,
  onReorderTopics,
}: {
  navItems: NavItemVM[];
  topics: TopicVM[];
  moreDomains: string;
  cacheLine: string;
  canRefresh: boolean;
  refreshing: boolean;
  refreshProgress: PulseRefreshProgress | null;
  refreshElapsedSeconds: number;
  refreshWarning: string | null;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onReorderTopics: (draggedTopic: string, targetTopic: string, position: "before" | "after") => void;
}) {
  const [topicsOpen, setTopicsOpen] = useState(true);
  const [draggedTopic, setDraggedTopic] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ topic: string; position: "before" | "after" } | null>(null);
  const onTopicDragOver = (event: DragEvent<HTMLDivElement>, topic: string) => {
    event.preventDefault();
    if (!draggedTopic || draggedTopic === topic) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropTarget({
      topic,
      position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    });
  };
  const progressPct =
    refreshProgress && refreshProgress.total > 0
      ? Math.min(100, Math.round((refreshProgress.processed / refreshProgress.total) * 100))
      : null;
  const elapsedLabel =
    refreshElapsedSeconds >= 60
      ? `${Math.floor(refreshElapsedSeconds / 60)}:${String(refreshElapsedSeconds % 60).padStart(2, "0")}`
      : `${refreshElapsedSeconds}s`;
  return (
    <aside
      style={{
        width: 228,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0F1622",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        padding: "26px 18px 18px",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-0.03em", color: "#F7F3E6" }}>
          TANJ
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
              background: refreshing ? "transparent" : PULSE_ACCENT_HIGHLIGHT,
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
          {refreshing ? (
            <div className="pulse-progress-track">
              <div
                className={progressPct !== null ? "pulse-progress-fill" : "pulse-progress-fill pulse-progress-fill--indeterminate"}
                style={progressPct !== null ? { width: `${progressPct}%` } : undefined}
              />
            </div>
          ) : null}
          <div
            style={{
              fontSize: 10.5,
              lineHeight: 1.5,
              color: refreshWarning ? "#e5a13c" : "#66646f",
            }}
            title={refreshWarning ?? undefined}
          >
            {refreshWarning
              ? refreshWarning
              : refreshing
                ? refreshProgress && refreshProgress.total > 0
                  ? `${refreshProgress.processed} of ${refreshProgress.total} articles so far · ${elapsedLabel}`
                  : `Checking for new articles… · ${elapsedLabel}`
                : cacheLine}
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

      <button
        className="pulse-soft"
        onClick={() => setTopicsOpen((v) => !v)}
        aria-expanded={topicsOpen}
        style={{
          ...microHeader,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "4px 12px",
          marginBottom: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span>Topics</span>
        <span style={{ fontSize: 9, color: "#66646f", transform: topicsOpen ? "none" : "rotate(-90deg)", transition: "transform 0.2s ease" }}>
          ▾
        </span>
      </button>
      <div style={{ fontSize: 10.5, color: "#55535e", padding: "0 12px", margin: "-3px 0 8px" }}>
        Click and drag to reorder
      </div>
      {topicsOpen ? (
        <>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {topics.map((t) => (
          <div
            key={t.key}
            className="pulse-topic"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", t.key);
              setDraggedTopic(t.key);
            }}
            onDragOver={(event) => onTopicDragOver(event, t.key)}
            onDrop={(event) => {
              event.preventDefault();
              const source = draggedTopic ?? event.dataTransfer.getData("text/plain");
              const bounds = event.currentTarget.getBoundingClientRect();
              const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
              if (source) onReorderTopics(source, t.key, position);
              setDraggedTopic(null);
              setDropTarget(null);
            }}
            onDragEnd={() => {
              setDraggedTopic(null);
              setDropTarget(null);
            }}
            title="Drag to reorder topics"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "2px 4px 2px 12px",
              borderRadius: 8,
              opacity: draggedTopic === t.key ? 0.35 : t.opacity,
              width: "100%",
              boxSizing: "border-box",
              cursor: "grab",
            }}
          >
            {dropTarget?.topic === t.key ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 12,
                  right: 4,
                  height: 2,
                  borderRadius: 1,
                  background: PULSE_ACCENT,
                  [dropTarget.position === "before" ? "top" : "bottom"]: -2,
                }}
              />
            ) : null}
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
        </>
      ) : null}

      <div style={{ marginTop: "auto", paddingTop: 22 }}>
        <button
          className="pulse-soft"
          onClick={onOpenSettings}
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
