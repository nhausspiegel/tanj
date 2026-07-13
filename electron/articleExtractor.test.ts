// @ts-nocheck
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  extractArticleText,
  extractArticleTextHeuristic,
  extractOgImage,
  isLikelyArticleText,
  linkDensity,
  shouldSkipExtraction,
} = require("./services/articleExtractor");

const PROSE = Array(20)
  .fill(
    "This is a real sentence about the article, written in plain English prose. ",
  )
  .join("");

describe("shouldSkipExtraction", () => {
  it("skips known paywalled/scraper-blocking domains", () => {
    expect(shouldSkipExtraction("https://arxiv.org/abs/1234.5678")).toBe(true);
    expect(shouldSkipExtraction("https://www.nature.com/articles/xyz")).toBe(true);
  });

  it("does not skip an arbitrary news domain", () => {
    expect(shouldSkipExtraction("https://example.com/some-article")).toBe(false);
  });

  it("treats an invalid URL as skippable", () => {
    expect(shouldSkipExtraction("not-a-url")).toBe(true);
  });
});

describe("isLikelyArticleText", () => {
  it("accepts real prose", () => {
    expect(isLikelyArticleText(PROSE)).toBe(true);
  });

  it("rejects text that's too short", () => {
    expect(isLikelyArticleText("Too short.")).toBe(false);
  });

  it("rejects a leaked HTML/JS fragment (dense structural symbols)", () => {
    // Realistically-proportioned: a short excerpt (matching excerptFrom's
    // ~500-char window) dominated by one leaked embed tag, not a long
    // article diluted by a single small tag.
    const leaked =
      "Updated July 9, 2026. Originally published July 6, 2026. Heard on the program. " +
      "Listen 8:16 Transcript Toggle more options Download Embed Embed \">" +
      `<iframe src="https://example.com/player/embed/nx-s1-123" width="100%" height="290" frameborder="0" scrolling="no" title="embed"></iframe>`;
    expect(leaked.length).toBeGreaterThan(200);
    expect(isLikelyArticleText(leaked)).toBe(false);
  });

  it("rejects raw JS", () => {
    const js = Array(20)
      .fill('function render(){ var x = {a:1,b:2}; if(x.a === 1){ return x.b; } }')
      .join(" ");
    expect(isLikelyArticleText(js)).toBe(false);
  });
});

describe("linkDensity", () => {
  it("is low for prose with an occasional link", () => {
    const html = `<p>${PROSE}</p><p>See also <a href="/other">this related piece</a>.</p>`;
    expect(linkDensity(html)).toBeLessThan(0.2);
  });

  it("is high for a page that's mostly links (an index/aggregator page)", () => {
    const html = Array(20)
      .fill('<a href="/x">Some headline linking out to another site</a>')
      .join(" ");
    expect(linkDensity(html)).toBeGreaterThan(0.8);
  });
});

describe("extractArticleText", () => {
  it("extracts real article prose via Readability, discarding player/embed chrome", () => {
    const html = `
      <html><head><title>Test Article</title></head>
      <body>
        <article>
          <h1>A real headline about something newsworthy</h1>
          <p>${PROSE}</p>
          <div class="audio-player">
            <span>Listen 8:16</span>
            <button>Toggle more options</button>
            <button>Download</button>
            <iframe src="https://example.com/player/embed/nx-s1-123"></iframe>
          </div>
        </article>
      </body></html>
    `;
    const result = extractArticleText(html);
    expect(result).toContain("real sentence about the article");
    expect(result).not.toContain("iframe");
    expect(result).not.toContain("Toggle more options");
  });

  it("discards a button-based share toolbar interleaved inside the article body", () => {
    // General structural case, not tied to any real site's markup: a share
    // toolbar built from <button> elements sitting inside the article
    // content, the way share/social widgets are built on the web generally.
    const html = `
      <html><head><title>Test Article</title></head>
      <body>
        <article>
          <h1>A real headline about something newsworthy</h1>
          <div class="toolbar">
            <button role="button">Share</button>
            <button role="button">Copy link</button>
            <button role="button">X (Twitter)</button>
            <button role="button">LinkedIn</button>
            <button role="button">Facebook</button>
          </div>
          <p>${PROSE}</p>
        </article>
      </body></html>
    `;
    const result = extractArticleText(html);
    expect(result).toContain("real sentence about the article");
    expect(result).not.toContain("Copy link");
    expect(result).not.toContain("LinkedIn");
  });

  it("returns empty for a page that's mostly links (aggregator/index page, no article)", () => {
    const links = Array(30)
      .fill('<a href="/story">A headline linking out to another site</a>')
      .join("<br/>");
    const html = `<html><body><div id="content">${links}</div></body></html>`;
    expect(extractArticleText(html)).toBe("");
  });

  it("falls back to the heuristic when the HTML is malformed enough that Readability throws", () => {
    // extractArticleTextHeuristic is exercised directly here since forcing
    // Readability itself to throw (vs. simply finding nothing) isn't
    // reliably reproducible from a crafted HTML string.
    const html = `<article>${PROSE}</article>`;
    expect(extractArticleTextHeuristic(html)).toContain("real sentence about the article");
  });
});

describe("extractOgImage", () => {
  it("reads og:image when present", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/thumb.jpg"></head></html>`;
    expect(extractOgImage(html, "https://example.com/article")).toBe(
      "https://example.com/thumb.jpg",
    );
  });

  it("falls back to twitter:image when there's no og:image", () => {
    const html = `<html><head><meta name="twitter:image" content="https://example.com/tw.jpg"></head></html>`;
    expect(extractOgImage(html, "https://example.com/article")).toBe(
      "https://example.com/tw.jpg",
    );
  });

  it("resolves a relative image URL against the page URL", () => {
    const html = `<html><head><meta property="og:image" content="/images/thumb.jpg"></head></html>`;
    expect(extractOgImage(html, "https://example.com/section/article")).toBe(
      "https://example.com/images/thumb.jpg",
    );
  });

  it("returns null when neither meta tag is present", () => {
    const html = `<html><head><title>No image here</title></head></html>`;
    expect(extractOgImage(html, "https://example.com/article")).toBe(null);
  });
});
