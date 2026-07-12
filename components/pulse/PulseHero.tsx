"use client";

import { PULSE_ACCENT, domainHue, domainLabel, type PulseStory } from "@/lib/pulse";

const HERO_HUE = 194; // Electric theme hero tint

export function PulseHero({
  heroes,
  index,
  saveLabel,
  onOpen,
  onSave,
  onSelectIndex,
}: {
  heroes: PulseStory[];
  index: number;
  saveLabel: string;
  onOpen: () => void;
  onSave: () => void;
  onSelectIndex: (i: number) => void;
}) {
  if (heroes.length === 0) return null;
  const hero = heroes[index] ?? heroes[0];

  return (
    <section style={{ position: "relative", height: "56vh", minHeight: 400, overflow: "hidden" }}>
      {heroes.map((h, i) => (
        <div
          key={h.id}
          style={{
            position: "absolute",
            inset: 0,
            background:
              `radial-gradient(110% 150% at 78% 8%, hsla(${domainHue(h.domain)},65%,42%,0.5), transparent 58%), ` +
              `radial-gradient(90% 120% at 15% 100%, hsla(${HERO_HUE},70%,30%,0.35), transparent 55%), ` +
              `linear-gradient(160deg, #171720 15%, #131A25 75%)`,
            opacity: i === index ? 1 : 0,
            transition: "opacity 1.1s ease",
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(19,26,37,0) 40%, rgba(19,26,37,0.92) 92%), linear-gradient(90deg, rgba(19,26,37,0.55) 0%, rgba(19,26,37,0) 55%)",
        }}
      />

      <div
        key={`hero-${index}`}
        style={{
          position: "absolute",
          left: 44,
          right: 44,
          bottom: 38,
          maxWidth: 720,
          animation: "pulseHeroIn 0.7s ease both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#131A25",
              background: PULSE_ACCENT,
              padding: "5px 10px",
              borderRadius: 4,
            }}
          >
            {domainLabel(hero.domain)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#c9c7d0", letterSpacing: "0.04em" }}>
            {hero.source} · {hero.timeAgo}
          </span>
        </div>
        <h1
          style={{
            margin: "0 0 14px",
            fontSize: "clamp(30px,3.3vw,48px)",
            lineHeight: 1.04,
            fontWeight: 900,
            letterSpacing: "-0.025em",
            color: "#F7F3E6",
            textWrap: "balance",
          }}
        >
          {hero.title}
        </h1>
        <p
          style={{
            margin: "0 0 22px",
            fontSize: 15.5,
            lineHeight: 1.55,
            color: "#c9c7d0",
            maxWidth: 600,
            textWrap: "pretty",
          }}
        >
          {hero.tldr}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="pulse-accent-btn"
            onClick={onOpen}
            style={{
              background: PULSE_ACCENT,
              color: "#131A25",
              border: "none",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 800,
              padding: "12px 22px",
              borderRadius: 6,
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}
          >
            Read story
          </button>
          <button
            className="pulse-glass-btn"
            onClick={onSave}
            style={{
              background: "rgba(255,255,255,0.09)",
              color: "#F7F3E6",
              border: "1px solid rgba(255,255,255,0.18)",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 700,
              padding: "11px 20px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {saveLabel}
          </button>
        </div>
      </div>

      <div style={{ position: "absolute", right: 44, bottom: 44, display: "flex", gap: 8 }}>
        {heroes.map((h, i) => (
          <button
            key={h.id}
            onClick={() => onSelectIndex(i)}
            aria-label={`Go to hero ${i + 1}`}
            style={{
              width: i === index ? 26 : 10,
              height: 6,
              borderRadius: 3,
              border: "none",
              background: i === index ? PULSE_ACCENT : "rgba(255,255,255,0.25)",
              cursor: "pointer",
              padding: 0,
              transition: "all 0.4s ease",
            }}
          />
        ))}
      </div>
    </section>
  );
}
