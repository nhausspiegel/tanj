"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import type { ArticleDomain } from "@/lib/types";
import type { TrendEvent, TrendsModel } from "@/lib/trends";

// ── Chart geometry ────────────────────────────────────────────────────
// Symmetric left/right gutters inside the 1000-wide viewBox so the 7 days
// span the full width evenly (not shoved against the right edge).
const CHART_LEFT = 46;
const CHART_RIGHT = 954;
const CHART_STEP = (CHART_RIGHT - CHART_LEFT) / 6;

function chartXY(day: number, value: number) {
  return { x: CHART_LEFT + day * CHART_STEP, y: 296 - value * 3.3 };
}

function pathFor(values: number[], d0: number, d1: number): string {
  let d = "";
  for (let i = d0; i <= d1; i++) {
    const p = chartXY(i, values[i] ?? 0);
    d += (i === d0 ? "M" : " L") + p.x.toFixed(1) + " " + p.y.toFixed(1);
  }
  return d;
}

// "hsl(262, 70%, 62%)" → "hsla(262, 70%, 62%, <alpha>)"
function withAlpha(hsl: string, alpha: number): string {
  return hsl.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const GRID_Y = [296, 224, 152, 80];

const microLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const mono = "'JetBrains Mono', monospace";

export function TrendsView({ model }: { model: TrendsModel }) {
  const { days, weekdays, domains, events } = model;

  const [selected, setSelected] = useState<ArticleDomain | null>(null);
  const [hoverEvent, setHoverEvent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Keep the selected domain valid as data re-ranks; default to most active.
  const selKey: ArticleDomain | null = useMemo(() => {
    if (selected && domains.some((d) => d.key === selected)) return selected;
    return domains[0]?.key ?? null;
  }, [selected, domains]);

  const domByKey = useMemo(() => new Map(domains.map((d) => [d.key, d])), [domains]);
  const selDomain = selKey ? domByKey.get(selKey) ?? null : null;
  const selColor = selDomain?.color ?? "#8a8894";

  const selEvents = useMemo(
    () => events.filter((e) => e.domainKey === selKey).sort((a, b) => a.dayIndex - b.dayIndex),
    [events, selKey],
  );

  const pickDomain = (key: ArticleDomain) => {
    setSelected(key);
    setExpanded(null);
  };

  const jumpToEvent = (event: TrendEvent) => {
    setSelected(event.domainKey);
    setExpanded(event.id);
    window.setTimeout(() => {
      const el = cardRefs.current[event.id];
      el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    }, 120);
  };

  const hovered = hoverEvent ? events.find((e) => e.id === hoverEvent) ?? null : null;
  const hoveredDomain = hovered ? domByKey.get(hovered.domainKey) ?? null : null;
  const hoveredPoint =
    hovered && hoveredDomain ? chartXY(hovered.dayIndex, hoveredDomain.values[hovered.dayIndex] ?? 0) : null;

  if (domains.length === 0) {
    return (
      <div style={{ background: "#0C121C", minHeight: "100%", color: "#F7F3E6" }}>
        <section style={{ padding: "34px 44px" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", color: "#F7F3E6" }}>
            Trends
          </h1>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#8a8894", margin: "4px 0 0" }}>
            From the last 7 days
          </div>
          <div
            style={{
              marginTop: 40,
              padding: "40px 28px",
              textAlign: "center",
              border: "1px dashed rgba(255,255,255,0.1)",
              borderRadius: 14,
              color: "#66646f",
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          >
            Not enough recent activity to chart trends yet.
            <br />
            Refresh to pull in the latest articles, then check back.
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={{ background: "#0C121C", minHeight: "100%", color: "#F7F3E6", fontFamily: "'Archivo', inherit" }}>
      {/* ── Chart section ──────────────────────────────────────────── */}
      <section style={{ padding: "34px 44px 10px" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", color: "#F7F3E6" }}>
          Trends
        </h1>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#8a8894", margin: "4px 0 0" }}>
          Last 7 days
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 8, margin: "16px 0 8px", flexWrap: "wrap" }}>
          {domains.map((d) => {
            const active = d.key === selKey;
            return (
              <button
                key={d.key}
                className="pulse-soft"
                onClick={() => pickDomain(d.key)}
                aria-pressed={active}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: active ? "rgba(255,255,255,0.07)" : "transparent",
                  border: `1px solid ${active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)"}`,
                  color: active ? "#F7F3E6" : "#8a8894",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "7px 14px",
                  borderRadius: 16,
                  cursor: "pointer",
                  transition: "all 0.35s ease",
                }}
              >
                <span style={{ width: 16, height: 0, borderTop: `2px dashed ${d.color}` }} />
                <span>{d.label}</span>
              </button>
            );
          })}
        </div>

        {/* Chart card */}
        <div
          style={{
            position: "relative",
            background: "#171F2C",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14,
            padding: "22px 18px 10px",
          }}
        >
          <div style={{ position: "relative" }}>
            <svg viewBox="0 0 1000 330" style={{ display: "block", width: "100%", height: "auto" }}>
              {GRID_Y.map((y) => (
                <line key={y} x1={CHART_LEFT} x2={CHART_RIGHT} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              ))}
              {days.map((label, i) => (
                <text
                  key={label + i}
                  x={chartXY(i, 0).x.toFixed(0)}
                  y="322"
                  textAnchor="middle"
                  fill="#66646f"
                  style={{ fontFamily: mono, fontSize: 11 }}
                >
                  {label}
                </text>
              ))}

              <g className="trends-reveal">
                {domains.map((d, di) => {
                  const evDays = events.filter((e) => e.domainKey === d.key).map((e) => e.dayIndex);
                  const hotD = evDays
                    .map((day) => pathFor(d.values, Math.max(0, day - 1), Math.min(6, day + 1)))
                    .join(" ")
                    .trim();
                  const active = d.key === selKey;
                  return (
                    <g
                      key={d.key}
                      className="pulse-trend-line"
                      role="button"
                      tabIndex={0}
                      aria-label={`Show ${d.label} trend`}
                      onClick={() => pickDomain(d.key)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          pickDomain(d.key);
                        }
                      }}
                      style={{ opacity: active ? 1 : 0.28, transition: "opacity 0.45s ease", cursor: "pointer", outline: "none" }}
                    >
                      {/* Wide invisible hit target so the thin dashed line is easy to click. */}
                      <path
                        d={pathFor(d.values, 0, 6)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="16"
                        style={{ pointerEvents: "stroke" }}
                      />
                      <path
                        className="trends-line"
                        d={pathFor(d.values, 0, 6)}
                        fill="none"
                        stroke={d.color}
                        strokeWidth="2"
                        strokeDasharray="5 6"
                        strokeLinecap="round"
                        style={{ animationDelay: `${di * 0.7}s` }}
                      />
                      {hotD ? (
                        <path
                          d={hotD}
                          fill="none"
                          stroke={d.color}
                          strokeWidth="3.4"
                          strokeDasharray="5 6"
                          strokeLinecap="round"
                          style={{ filter: `drop-shadow(0 0 6px ${d.color})` }}
                        />
                      ) : null}
                    </g>
                  );
                })}
              </g>

              {events.map((e, i) => {
                const d = domByKey.get(e.domainKey);
                if (!d) return null;
                const p = chartXY(e.dayIndex, d.values[e.dayIndex] ?? 0);
                const r = hoverEvent === e.id ? 8 : 6;
                return (
                  <g
                    key={e.id}
                    className="trends-node"
                    role="button"
                    tabIndex={0}
                    aria-label={`${d.label}: ${e.title}. Impact ${e.impact}. Open story.`}
                    onClick={() => jumpToEvent(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        jumpToEvent(e);
                      }
                    }}
                    onMouseEnter={() => setHoverEvent(e.id)}
                    onMouseLeave={() => setHoverEvent((h) => (h === e.id ? null : h))}
                    onFocus={() => setHoverEvent(e.id)}
                    onBlur={() => setHoverEvent((h) => (h === e.id ? null : h))}
                    style={{ cursor: "pointer", animationDelay: `${1.2 + i * 0.12}s`, outline: "none" }}
                  >
                    <circle className="trends-node-glow" cx={p.x} cy={p.y} r="16" fill={withAlpha(d.color, 0.16)} />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill="#171F2C"
                      stroke={d.color}
                      strokeWidth="2.4"
                      style={{ transition: "r 0.2s ease" }}
                    />
                    <circle cx={p.x} cy={p.y} r="2.6" fill={d.color} />
                  </g>
                );
              })}
            </svg>

            {hovered && hoveredDomain && hoveredPoint ? (
              <div
                style={{
                  position: "absolute",
                  left: `${((hoveredPoint.x / 1000) * 100).toFixed(1)}%`,
                  top: `${((hoveredPoint.y / 330) * 100).toFixed(1)}%`,
                  transform: "translate(-50%, -112%)",
                  background: "#1E273A",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 9,
                  padding: "11px 14px",
                  pointerEvents: "none",
                  boxShadow: "0 14px 40px rgba(0,0,0,0.55)",
                  minWidth: 200,
                  zIndex: 5,
                }}
              >
                <div style={{ ...microLabel, color: hoveredDomain.color, marginBottom: 4 }}>
                  {hoveredDomain.label} · {days[hovered.dayIndex]}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: "#F7F3E6", marginBottom: 7 }}>
                  {hovered.title}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#8a8894", fontFamily: mono }}>
                  <span>
                    IMPACT <span style={{ color: hoveredDomain.color, fontWeight: 700 }}>{hovered.impact}</span>
                  </span>
                  <span>{hovered.articles} articles</span>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid rgba(255,255,255,0.09)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: hoveredDomain.color,
                    letterSpacing: "0.04em",
                  }}
                >
                  Click to read story ↓
                </div>
              </div>
            ) : null}
          </div>

          <div
            style={{
              position: "absolute",
              right: 16,
              top: 14,
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: "rgba(12,18,28,0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: "5px 12px",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                border: `2px solid ${selColor}`,
                boxShadow: `0 0 6px ${selColor}`,
              }}
            />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#a5a3ae", letterSpacing: "0.03em" }}>
              Click an event node to read its story
            </span>
          </div>
        </div>
      </section>

      {/* ── Timeline section ───────────────────────────────────────── */}
      <section style={{ padding: "26px 44px 70px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em", color: selColor }}>
            {selDomain?.label ?? ""}
          </h2>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#8a8894" }}>
            {selEvents.length} major event{selEvents.length === 1 ? "" : "s"} this week
          </span>
        </div>

        {selEvents.length === 0 ? (
          <div style={{ fontSize: 13, color: "#66646f", padding: "8px 0" }}>
            No standout events for this domain in the last 7 days.
          </div>
        ) : (
          <div key={selKey ?? "none"} style={{ display: "flex", flexDirection: "column" }}>
            {selEvents.map((e, i) => {
              const isExpanded = expanded === e.id;
              return (
                <div
                  key={e.id}
                  className="trends-card-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 30px 1fr",
                    gap: "0 18px",
                    animationDelay: `${i * 0.13}s`,
                  }}
                >
                  <div style={{ textAlign: "right", paddingTop: 20 }}>
                    <div style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 600, color: "#a5a3ae" }}>
                      {days[e.dayIndex]}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: "#55535e", marginTop: 2 }}>
                      {weekdays[e.dayIndex]}
                    </div>
                  </div>

                  <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                    <div
                      style={{ position: "absolute", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.09)" }}
                    />
                    <div
                      style={{
                        position: "relative",
                        marginTop: 24,
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        background: "#0C121C",
                        border: `2.4px solid ${selColor}`,
                        boxShadow: `0 0 10px ${withAlpha(selColor, 0.35)}`,
                      }}
                    />
                  </div>

                  <div
                    ref={(el) => {
                      cardRefs.current[e.id] = el;
                    }}
                    className="pulse-trend-card"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((cur) => (cur === e.id ? null : e.id))}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setExpanded((cur) => (cur === e.id ? null : e.id));
                      }
                    }}
                    style={{
                      background: "#171F2C",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: "18px 20px",
                      marginBottom: 16,
                      cursor: "pointer",
                      transition: "transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease",
                      outline: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 15.5,
                          fontWeight: 800,
                          letterSpacing: "-0.01em",
                          lineHeight: 1.3,
                          color: "#f2f0f5",
                          flex: 1,
                        }}
                      >
                        {e.title}
                      </h3>
                      <span style={{ fontSize: 11, color: "#66646f", flexShrink: 0 }}>
                        {isExpanded ? "▴ collapse" : "▾ expand"}
                      </span>
                    </div>
                    <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6, color: "#a5a3ae", textWrap: "pretty" }}>
                      {e.blurb}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        fontFamily: mono,
                        fontSize: 11,
                        color: "#8a8894",
                      }}
                    >
                      <span>
                        IMPACT <span style={{ color: selColor, fontWeight: 700 }}>{e.impact}</span>
                      </span>
                      <span>{e.articles} articles</span>
                      <span>{e.sources} sources</span>
                    </div>

                    {isExpanded ? (
                      <div
                        style={{
                          marginTop: 16,
                          paddingTop: 16,
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                          display: "grid",
                          gridTemplateColumns: "1.4fr 1fr",
                          gap: 20,
                        }}
                      >
                        <div>
                          {e.excerpt ? (
                            <>
                              <div style={{ ...microLabel, color: "#8a8894", marginBottom: 7 }}>From the article</div>
                              <p
                                style={{
                                  margin: "0 0 14px",
                                  fontSize: 13,
                                  lineHeight: 1.65,
                                  color: "#c9c7d0",
                                  fontStyle: "italic",
                                  borderLeft: `2px solid ${withAlpha(selColor, 0.4)}`,
                                  paddingLeft: 12,
                                  textWrap: "pretty",
                                }}
                              >
                                {e.excerpt}
                              </p>
                            </>
                          ) : null}
                          {e.reporting.length ? (
                            <>
                              <div style={{ ...microLabel, color: "#8a8894", marginBottom: 7 }}>Reporting timeline</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {e.reporting.map((rp, ri) => (
                                  <div
                                    key={ri}
                                    style={{ display: "flex", gap: 10, fontSize: 11.5, lineHeight: 1.45, color: "#8a8894" }}
                                  >
                                    <span style={{ fontFamily: mono, color: "#66646f", flexShrink: 0, width: 44 }}>
                                      {rp.t}
                                    </span>
                                    <span>
                                      {rp.url ? (
                                        <a
                                          href={rp.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(ev) => ev.stopPropagation()}
                                          style={{
                                            color: "#b5b3be",
                                            fontWeight: 600,
                                            textDecoration: "underline",
                                            textDecorationColor: "rgba(255,255,255,0.25)",
                                          }}
                                        >
                                          {rp.src}
                                        </a>
                                      ) : (
                                        <span style={{ color: "#b5b3be", fontWeight: 600 }}>{rp.src}</span>
                                      )}
                                      {rp.note ? <> — {rp.note}</> : null}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : null}
                        </div>
                        <div>
                          {e.related.length ? (
                            <>
                              <div style={{ ...microLabel, color: "#8a8894", marginBottom: 7 }}>Related stories</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                                {e.related.map((ra, rai) => (
                                  <div
                                    key={rai}
                                    style={{ fontSize: 12, lineHeight: 1.4, color: "#a5a3ae", display: "flex", gap: 8 }}
                                  >
                                    <span style={{ color: selColor }}>▸</span>
                                    <span>
                                      {ra.url ? (
                                        <a
                                          href={ra.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(ev) => ev.stopPropagation()}
                                          style={{
                                            color: "#a5a3ae",
                                            textDecoration: "underline",
                                            textDecorationColor: "rgba(255,255,255,0.25)",
                                          }}
                                        >
                                          {ra.title}
                                        </a>
                                      ) : (
                                        ra.title
                                      )}{" "}
                                      {ra.src ? <span style={{ color: "#66646f", fontSize: 10.5 }}>{ra.src}</span> : null}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : null}
                          {e.tags.length ? (
                            <>
                              <div style={{ ...microLabel, color: "#8a8894", marginBottom: 7 }}>Organizations &amp; tags</div>
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                {e.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    style={{
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      color: "#a5a3ae",
                                      fontSize: 10.5,
                                      padding: "3px 9px",
                                      borderRadius: 4,
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
