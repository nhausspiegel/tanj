/**
 * Full-text article extractor.
 * Fetches the page HTML, runs it through Readability (the Firefox Reader
 * View algorithm) on a lightweight DOM, and returns the article body.
 * Falls back to a regex-based heuristic if Readability yields nothing.
 */

const { Readability } = require("@mozilla/readability");
const { parseHTML } = require("linkedom");

const MAX_PAGE_BYTES = 2_000_000; // 2 MB
const FETCH_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT_EXTRACTIONS = 2;
const PAUSE_BETWEEN_BATCHES_MS = 200;

// Domains that block scrapers or return paywalled content — skip extraction.
// Link-aggregator/index pages (Techmeme etc.) are deliberately NOT listed
// here — they're detected generically via link density below, so any
// aggregator works, not just ones we happen to have noticed.
const SKIP_DOMAINS = new Set([
  "arxiv.org",
  "nature.com",
  "ieee.org",
  "sciencedirect.com",
  "springer.com",
  "acm.org",
]);

const MAX_LINK_DENSITY = 0.5; // fraction of extracted text that's link-anchor text

// A page that's mostly links (an index/aggregator page, not prose) has a
// high fraction of its text sitting inside <a> tags — the same signal
// Reader-View-style tools use to decide "this isn't really an article,"
// generically, without needing to know the site in advance.
function linkDensity(contentHtml) {
  try {
    // linkedom's Document.textContent is unreliable on a bare fragment (it
    // comes back empty even when the fragment clearly has text) — wrapping
    // in a full html/body document and reading document.body.textContent
    // is the combination that actually works.
    const { document } = parseHTML(`<html><body>${contentHtml}</body></html>`);
    const totalLength = (document.body.textContent || "").trim().length;
    if (totalLength === 0) return 1;
    const anchors = Array.from(document.querySelectorAll("a"));
    const linkLength = anchors.reduce(
      (sum, a) => sum + (a.textContent || "").trim().length,
      0,
    );
    return linkLength / totalLength;
  } catch {
    return 0;
  }
}

function isLikelyArticleText(text) {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length < 200) return false;
  // A leaked, unparsed HTML/JS/code fragment means something failed to
  // parse cleanly — a general "this extraction is broken" signal (dense
  // structural symbols), not a per-site or per-language pattern.
  const symbolCount = (trimmed.match(/[{}<>;=`|]/g) || []).length;
  if (symbolCount / trimmed.length > 0.02) return false;
  return true;
}

function shouldSkipExtraction(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return SKIP_DOMAINS.has(hostname) || Array.from(SKIP_DOMAINS).some((d) => hostname.endsWith(`.${d}`));
  } catch {
    return true;
  }
}

function stripHtmlDeep(html) {
  return html
    // Remove scripts, styles, nav, footer, header, aside
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer\s*>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header\s*>/gi, " ")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside\s*>/gi, " ")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Remove all tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-zA-Z]+;/g, " ")
    // Collapse whitespace
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Regex-based heuristic extraction — the original approach. Kept only as a
 * fallback for the rare case Readability itself throws or yields nothing;
 * it can't distinguish article prose from page chrome as reliably as a real
 * DOM-based content-scoring algorithm, which is why it's no longer primary.
 */
function extractArticleTextHeuristic(html) {
  // Try <article> tag first
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i);
  if (articleMatch) {
    const text = stripHtmlDeep(articleMatch[1]);
    if (text.length > 200) return text;
  }

  // Try common content selectors by class/id patterns
  const contentPatterns = [
    /<div[^>]*class="[^"]*(?:article-body|post-content|entry-content|story-body|article-content|article__body|post-body|content-body)[^"]*"[^>]*>([\s\S]*?)<\/div\s*>/i,
    /<div[^>]*id="[^"]*(?:article-body|post-content|entry-content|story-body|content)[^"]*"[^>]*>([\s\S]*?)<\/div\s*>/i,
    /<main[^>]*>([\s\S]*?)<\/main\s*>/i,
  ];

  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match) {
      const text = stripHtmlDeep(match[1]);
      if (text.length > 200) return text;
    }
  }

  // Fallback: extract all <p> tags and concatenate
  const paragraphs = [];
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = stripHtmlDeep(pMatch[1]);
    if (text.length > 40) {
      paragraphs.push(text);
    }
  }

  if (paragraphs.length >= 2) {
    return paragraphs.join(" ");
  }

  // Last resort: just strip everything
  const fullText = stripHtmlDeep(html);
  return fullText.length > 200 ? fullText : "";
}

/**
 * Extract the main article content from raw HTML using Readability (the
 * Firefox Reader View algorithm) on a lightweight DOM — real content
 * scoring by text/link density and tag semantics, not string matching.
 * Rejects results that are mostly links (aggregator/index pages) or that
 * fail the general sanity checks in isLikelyArticleText. Falls back to the
 * regex heuristic only if Readability itself throws or finds nothing.
 */
// Interactive controls (buttons, anything with role="button") are, as a
// matter of web semantics, never article prose — a share widget, a "read
// more" toggle, a newsletter-signup CTA are always built from one of these,
// regardless of site. Stripping them before Readability scores the page
// means share-toolbar labels ("Share", "Copy link", "X (Twitter)"...) never
// enter the scored content in the first place, instead of relying on
// Readability's own class/id-based unlikely-candidate list, which only
// catches names it already knows to look for.
function stripInteractiveControls(document) {
  const controls = document.querySelectorAll('button, [role="button"]');
  for (const el of Array.from(controls)) {
    el.remove();
  }
}

// Readability's textContent carries through the source DOM's original
// whitespace/line-breaks uncollapsed — a general formatting gap (any site's
// markup can be indented/broken across lines), not specific to one page.
function collapseWhitespace(text) {
  return text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function extractArticleText(html) {
  try {
    const { document } = parseHTML(html);
    stripInteractiveControls(document);
    const parsed = new Readability(document).parse();
    if (parsed && parsed.textContent) {
      const text = collapseWhitespace(parsed.textContent);
      // Readability found *something* — if it's confidently rejected (a
      // link-heavy index/aggregator page, or garbled text), that's a real
      // signal this page has no article, not a reason to retry with the
      // weaker regex heuristic below (which has no link-density check of
      // its own and would happily return the same bad content anyway).
      if (isLikelyArticleText(text) && linkDensity(parsed.content) <= MAX_LINK_DENSITY) {
        return text;
      }
      return "";
    }
  } catch {
    // Readability itself failed to run — fall through and try the heuristic.
  }

  const fallback = extractArticleTextHeuristic(html);
  return isLikelyArticleText(fallback) ? fallback : "";
}

// Many feeds don't include a thumbnail in their RSS <enclosure>/media fields
// even though the article page itself has a normal og:image (or Twitter
// card image) meta tag for social-share previews. This is a fallback for
// when the feed had nothing — never overrides a feed-provided thumbnail.
function extractOgImage(html, pageUrl) {
  try {
    const { document } = parseHTML(html);
    const meta =
      document.querySelector('meta[property="og:image"]') ||
      document.querySelector('meta[name="twitter:image"]');
    const content = meta?.getAttribute("content");
    if (!content) return null;
    return new URL(content, pageUrl).href;
  } catch {
    return null;
  }
}

// Returns { text, imageUrl } on a successful fetch (text may be "" if the
// content was rejected — see extractArticleText), or null if the page
// itself couldn't be fetched at all (blocked, timed out, wrong content
// type, etc.) — callers must not treat a null fetch the same as a
// confirmed-empty extraction; see enrichArticlesWithFullText below.
async function fetchPageText(url) {
  if (!url || shouldSkipExtraction(url)) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TechCommandCenter/1.0; +https://github.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null;

    let html;
    // Read with byte limit
    if (!response.body?.getReader) {
      html = await response.text();
      if (Buffer.byteLength(html, "utf8") > MAX_PAGE_BYTES) return null;
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      html = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_PAGE_BYTES) {
          await reader.cancel();
          return null;
        }
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    }

    return { text: extractArticleText(html), imageUrl: extractOgImage(html, url) };
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Trims to a sentence boundary near maxChars so the excerpt doesn't cut off
// mid-word; falls back to a hard cut if no boundary is found early enough.
// An excerpt is always a partial quote from a longer article, so whenever
// real truncation happens (the source text was longer than maxChars) this
// ends with an ellipsis — consistently, not just when the cut happened to
// land mid-word, so the excerpt never reads as if it were the whole story.
function excerptFrom(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }

  const slice = text.slice(0, maxChars + 200);
  const lastPeriod = slice.lastIndexOf(". ");
  const cut = lastPeriod > maxChars * 0.5 ? slice.slice(0, lastPeriod) : slice.slice(0, maxChars);
  return `${cut.trimEnd().replace(/[.,;:!?]+$/, "")}…`;
}

/**
 * Enrich an array of articles with full-text extraction.
 * Adds `fullText` field to each article where extraction succeeds.
 * Updates `summary` to a longer version if the original was truncated.
 */
async function enrichArticlesWithFullText(articles, {
  maxConcurrent = MAX_CONCURRENT_EXTRACTIONS,
  pauseMs = PAUSE_BETWEEN_BATCHES_MS,
} = {}) {
  const results = [...articles];

  for (let i = 0; i < results.length; i += maxConcurrent) {
    const batch = results.slice(i, i + maxConcurrent);
    const texts = await Promise.all(
      batch.map((article) => fetchPageText(article.url)),
    );

    for (let j = 0; j < batch.length; j++) {
      const result = texts[j];
      if (!result) continue; // fetch failed entirely — leave this article untouched
      const idx = i + j;

      // Independent of text-extraction success: only fills in when the feed
      // itself had no thumbnail, never overrides one it did have.
      if (!results[idx].image_url && result.imageUrl) {
        results[idx] = { ...results[idx], image_url: result.imageUrl };
      }

      const fullText = result.text;
      if (fullText && fullText.length > 100) {
        results[idx] = {
          ...results[idx],
          fullText: fullText.slice(0, 5000), // Cap storage at 5k chars
          // Real quoted text from the article itself, distinct from the AI
          // TL;DR — persisted so the story modal can show an actual excerpt
          // rather than only a generated summary.
          excerpt: excerptFrom(fullText, 500),
        };
        // If the RSS summary was truncated (≤280 chars), upgrade it
        if (!results[idx].summary || results[idx].summary.length < 300) {
          // Take first ~600 chars ending at a sentence boundary
          const upgraded = fullText.slice(0, 800);
          const lastPeriod = upgraded.lastIndexOf(". ");
          results[idx].summary = lastPeriod > 200
            ? upgraded.slice(0, lastPeriod + 1)
            : upgraded.slice(0, 600);
        }
      }
    }

    if (i + maxConcurrent < results.length && pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  return results;
}

module.exports = {
  enrichArticlesWithFullText,
  excerptFrom,
  extractArticleText,
  extractArticleTextHeuristic,
  extractOgImage,
  fetchPageText,
  isLikelyArticleText,
  linkDensity,
  shouldSkipExtraction,
};
