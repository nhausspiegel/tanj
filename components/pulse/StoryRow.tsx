"use client";

import { useRef, type CSSProperties } from "react";
import { PULSE_ACCENT_HIGHLIGHT } from "@/lib/pulse";
import { StoryCard, type StoryCardProps } from "@/components/pulse/StoryCard";

export type RowItem = StoryCardProps & { key: string };

export type RowViewModel = {
  key: string;
  label: string;
  count: number;
  removable: boolean;
  addable: boolean;
  inFeed: boolean;
  onRemove: () => void;
  onAdd: () => void;
  items: RowItem[];
};

const chevStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#a5a3ae",
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

export function StoryRow({
  row,
  registerSection,
}: {
  row: RowViewModel;
  registerSection: (key: string, el: HTMLElement | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <section ref={(el) => registerSection(row.key, el)} data-row={row.key}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 44px",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: "#F7F3E6",
            }}
          >
            {row.label}
          </h2>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "#66646f",
              letterSpacing: "0.06em",
            }}
          >
            {row.count} stories
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {row.removable ? (
            <button
              className="pulse-soft"
              onClick={row.onRemove}
              title="Remove this domain from For You"
              style={{
                height: 30,
                borderRadius: 15,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "#8a8894",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                padding: "0 12px",
                marginRight: 4,
              }}
            >
              × Remove
            </button>
          ) : null}
          {row.addable ? (
            <button
              className="pulse-accent-btn"
              onClick={row.onAdd}
              title="Add this domain to your For You feed"
              style={{
                height: 30,
                borderRadius: 15,
                border: "none",
                background: PULSE_ACCENT_HIGHLIGHT,
                color: "#131A25",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 800,
                padding: "0 14px",
                marginRight: 4,
              }}
            >
              + Add
            </button>
          ) : null}
          {row.inFeed ? (
            <button
              className="pulse-soft"
              onClick={row.onRemove}
              title="Remove this domain from For You"
              style={{
                height: 30,
                borderRadius: 15,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "#8a8894",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                padding: "0 14px",
                marginRight: 4,
              }}
            >
              × Remove
            </button>
          ) : null}
          <button className="pulse-chev" onClick={() => scrollBy(-640)} style={chevStyle} aria-label="Scroll left">
            ‹
          </button>
          <button className="pulse-chev" onClick={() => scrollBy(640)} style={chevStyle} aria-label="Scroll right">
            ›
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="pulse-row-scroll"
        style={{
          display: "flex",
          gap: 14,
          overflowX: "auto",
          padding: "6px 44px 10px",
        }}
      >
        {row.items.map(({ key, ...props }) => (
          <StoryCard key={key} {...props} />
        ))}
      </div>
    </section>
  );
}
