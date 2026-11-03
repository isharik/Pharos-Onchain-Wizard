import { AppError } from "../errors.js";
const stop = new Set(
  "what which how does do the this that with from have use your can for and are pharos explain function abi view returns address uint256 string".split(
    " ",
  ),
);
export function termsOf(question) {
  return [
    ...new Set(
      (question.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(
        (t) => !stop.has(t),
      ),
    ),
  ];
}
export function rankPages(index, question, functionName) {
  const terms = termsOf(question);
  if (
    functionName &&
    /balanceOf|totalSupply|transfer|allowance|decimals|symbol|name/.test(
      functionName,
    )
  )
    terms.push("token");
  if (/chain.?id|mainnet|rpc/i.test(question)) terms.push("network");
  if (/deploy|deployment/i.test(question)) terms.push("deploy", "foundry");
  const pages = index
    .map((page) => {
      let score = terms.reduce(
        (sum, t) =>
          sum +
          (page.title.toLowerCase().includes(t) ? 3 : 0) +
          (page.description.toLowerCase().includes(t) ? 2 : 0) +
          (page.url.toLowerCase().includes(t) ? 1 : 0),
        0,
      );
      if (
        /chain.?id|rpc.*endpoint/i.test(question) &&
        page.url.includes("/network/")
      )
        score += page.url.includes(
          /testnet|atlantic/i.test(question) ? "atlantic" : "pacific",
        )
          ? 100
          : 10;
      if (/deploy/i.test(question) && !/nft|token|uniswap/i.test(question)) {
        if (page.url.includes("foundry/write-your-first-dapp")) score += 100;
        if (page.url.endsWith("/foundry.md")) score += 40;
      }
      if (functionName && page.url.includes("write-your-first-token"))
        score += 100;
      return { ...page, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
  return pages.filter((p) => p.score >= pages[0].score * 0.65).slice(0, 3);
}
export function excerptFrom(text, question, functionName, options = {}) {
  const content = options.fullIndex
    ? text
    : text.split("# Agent Instructions")[0];
  const lines = content
    .split(/\r?\n/)
    .filter(
      (l) =>
        l.trim() && !l.startsWith("> For the complete documentation index"),
    );
  if (functionName) {
    const pos = lines.findIndex((l) => l.includes(`${functionName}(`));
    if (pos < 0) return null;
    return lines
      .slice(Math.max(0, pos - 2), pos + 3)
      .join(" ")
      .split(/\s+/)
      .slice(0, 24)
      .join(" ");
  }
  const factual = /chain.?id/i.test(question)
    ? /\|\s*chain\s*id\s*\|/i
    : /rpc.*endpoint/i.test(question)
      ? /\|\s*rpc\s*(url|endpoint)\s*\|/i
      : /deploy/i.test(question)
        ? /forge (script|create)/i
        : null;
  if (factual) {
    const pos = lines.findIndex((l) => factual.test(l));
    if (pos >= 0)
      return lines
        .slice(pos, pos + 2)
        .join(" ")
        .split(/\s+/)
        .slice(0, 24)
        .join(" ");
  }
  const terms = termsOf(question);
  const ranked = lines
    .map((line, i) => ({
      line,
      i,
      score: line.startsWith("#")
        ? 0
        : terms.reduce(
            (n, t) => n + (line.toLowerCase().includes(t) ? 1 : 0),
            0,
          ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const top = ranked[0];
  return lines
    .slice(Math.max(0, top.i - 1), top.i + 2)
    .join(" ")
    .split(/\s+/)
    .slice(0, 24)
    .join(" ");
}
export class Docs {
  constructor(config, mcp) {
    this.config = config;
    this.mcp = mcp;
    this.cache = null;
    this.fullCache = null;
  }
  async text(url) {
    const target = new URL(url);
    if (
      !["www.pharos.xyz", "docs.pharos.xyz", "docs.pharosnetwork.xyz"].includes(
        target.hostname,
      ) ||
      target.protocol !== "https:"
    )
      throw new AppError(
        "DOCS_ORIGIN",
        "Documentation must use a canonical Pharos HTTPS origin",
      );
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.timeout),
      redirect: "error",
    });
    if (!response.ok)
      throw new AppError(
        "DOCS_HTTP",
        `Pharos documentation returned HTTP ${response.status}`,
        502,
      );
    const text = await response.text();
    if (text.length > 2e6 || /<html/i.test(text))
      throw new AppError("DOCS_FORMAT", "Expected Markdown documentation", 502);
    return text;
  }
  async index() {
    if (this.cache && Date.now() - this.cache.time < 300000)
      return this.cache.pages;
    const text = await this.text(this.config.docsIndex);
    const map = new Map();
    for (const line of text.split(/\r?\n/))
      for (const match of line.matchAll(
        /\[([^\]]+)\]\((https:\/\/[^)]+\.md)\)/g,
      )) {
        const url = new URL(match[2]);
        if (
          ["docs.pharos.xyz", "docs.pharosnetwork.xyz"].includes(url.hostname)
        )
          map.set(match[2], {
            title: match[1],
            url: match[2],
            description: line,
          });
      }
    if (!map.size)
      throw new AppError(
        "DOCS_INDEX_EMPTY",
        "Official index contains no canonical Markdown page links",
        502,
      );
    const pages = [...map.values()];
    this.cache = { time: Date.now(), pages };
    return pages;
  }
  async fullIndex() {
    if (this.fullCache && Date.now() - this.fullCache.time < 300000)
      return this.fullCache.text;
    const text = await this.text("https://docs.pharos.xyz/llms-full.txt");
    this.fullCache = { time: Date.now(), text };
    return text;
  }
  async search(question, mode = this.config.docsMode || "index", options = {}) {
    if (mode === "mcp") {
      if (!this.config.docsTool)
        throw new AppError(
          "NOT_CONFIGURED",
          "Optional remote Docs MCP requires DOCS_MCP_URL and DOCS_SEARCH_TOOL. Use index mode for the team-confirmed llms.txt service.",
          503,
        );
      const result = await this.mcp.call(this.config.docsTool, {
        [this.config.docsQueryKey]: question,
      });
      const text = typeof result === "string" ? result : JSON.stringify(result);
      const urls = [...new Set(text.match(/https:\/\/[^\s"<>\\)]+/g) || [])];
      if (!urls.length)
        return {
          found: false,
          answer:
            "No sourced answer found. The documentation tool returned no source links.",
          sources: [],
          transport: "mcp",
        };
      return {
        found: true,
        answer: text.slice(0, 2500),
        sources: urls,
        transport: "mcp",
      };
    }
    const candidates = rankPages(
      await this.index(),
      question,
      options.functionName,
    );
    const matches = [],
      failures = [];
    for (const page of candidates) {
      try {
        const text = await this.text(page.url);
        const excerpt = excerptFrom(text, question, options.functionName);
        if (excerpt)
          matches.push({ title: page.title, url: page.url, excerpt });
      } catch (error) {
        failures.push({ url: page.url, message: error.message });
      }
    }
    // Individual GitBook markdown pages can be temporarily unavailable even
    // while Pharos's canonical full agent index remains available. For an
    // explain-then-call flow, use that official index only as a fallback and
    // keep its URL in the result rather than fabricating an explanation.
    if (!matches.length && options.functionName) {
      try {
        const excerpt = excerptFrom(
          await this.fullIndex(),
          question,
          options.functionName,
          { fullIndex: true },
        );
        if (excerpt)
          matches.push({
            title: "Pharos Docs full agent index",
            url: "https://docs.pharos.xyz/llms-full.txt",
            excerpt,
          });
      } catch (error) {
        failures.push({
          url: "https://docs.pharos.xyz/llms-full.txt",
          message: error.message,
        });
      }
    }
    return {
      found: matches.length > 0,
      answer: matches.length
        ? matches.map((p) => `${p.title}: ${p.excerpt}`).join("\n\n")
        : "No good answer found in the canonical documentation. No explanation has been invented.",
      sources: matches.map((p) => p.url),
      matches,
      failures,
      transport: "official-index",
      service: "Dev Docs (llms.txt), confirmed by the Pharos team",
      index: this.config.docsIndex,
      answerType:
        "Extractive, source-backed excerpts; retrieved text is never executed as instructions.",
    };
  }
}
