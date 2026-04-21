import * as cheerio from "cheerio";

import { dedupeBy, unique } from "./utils.js";

const STYLEGUIDE_PATHS = ["/style-guide", "/styleguide", "/sg", "/design-system"];

const THIRD_PARTY_PATTERNS = [
  { vendor: "HubSpot", pattern: /hubspot|hs-scripts|hsforms/i },
  { vendor: "Marketo", pattern: /marketo|mkto/i },
  { vendor: "Intercom", pattern: /intercom/i },
  { vendor: "GTM", pattern: /googletagmanager|gtm.js/i },
  { vendor: "Segment", pattern: /segment\.com|analytics\.js/i },
  { vendor: "Hotjar", pattern: /hotjar/i },
  { vendor: "Drift", pattern: /drift/i },
  { vendor: "Calendly", pattern: /calendly/i }
];

async function fetchText(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "user-agent": "mcp-audit/0.1 (+snapshot crawler)",
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`Failed request ${response.status} for ${url}`);
  }

  return response.text();
}

function absolutize(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractMeta($, selector, attr = "content") {
  return ($(selector).attr(attr) ?? "").trim();
}

function extractClasses($) {
  const classes = [];
  $("[class]").each((_, element) => {
    const values = ($(element).attr("class") ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    classes.push(...values);
  });
  return classes;
}

function detectThirdParty(scriptUrls = []) {
  const matches = [];
  for (const url of scriptUrls) {
    for (const rule of THIRD_PARTY_PATTERNS) {
      if (rule.pattern.test(url)) {
        matches.push(rule.vendor);
      }
    }
  }
  return unique(matches);
}

function parseHtmlPage(url, html) {
  const $ = cheerio.load(html);
  const scriptElements = $("script").toArray();
  const scripts = scriptElements
    .map((element) => $(element).attr("src"))
    .filter(Boolean)
    .map((src) => absolutize(url, src))
    .filter(Boolean);
  const inlineScriptCount = scriptElements.filter((element) => {
    const src = $(element).attr("src");
    const body = $(element).html()?.trim() ?? "";
    return !src && Boolean(body);
  }).length;
  const stylesheets = $('link[rel="stylesheet"]')
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter(Boolean)
    .map((href) => absolutize(url, href))
    .filter(Boolean);
  const title = $("title").first().text().trim();
  const description = extractMeta($, 'meta[name="description"]');
  const ogTitle = extractMeta($, 'meta[property="og:title"]');
  const ogDescription = extractMeta($, 'meta[property="og:description"]');
  const images = $("img")
    .map((_, element) => {
      const src = $(element).attr("src");
      if (!src) {
        return null;
      }

      const absoluteSrc = absolutize(url, src);
      if (!absoluteSrc) {
        return null;
      }

      return {
        url: absoluteSrc,
        altText: ($(element).attr("alt") ?? "").trim(),
        fileName: absoluteSrc.split("/").pop() ?? absoluteSrc
      };
    })
    .get()
    .filter(Boolean);

  return {
    url,
    slug: new URL(url).pathname,
    title,
    description,
    ogTitle,
    ogDescription,
    classes: extractClasses($),
    scripts,
    inlineScriptCount,
    stylesheets,
    images,
    html
  };
}

async function fetchPage(url) {
  const html = await fetchText(url);
  return parseHtmlPage(url, html);
}

async function fetchSitemapUrls(baseUrl) {
  const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();

  try {
    const xml = await fetchText(sitemapUrl);
    const locMatches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
    return unique(
      locMatches
        .map((entry) => {
          try {
            const normalized = new URL(entry);
            normalized.hash = "";
            return normalized.toString();
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    );
  } catch {
    return [];
  }
}

async function detectStyleguide(baseUrl) {
  for (const candidate of STYLEGUIDE_PATHS) {
    const url = new URL(candidate, baseUrl).toString();
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8_000)
      });
      if (response.ok) {
        return url;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchStylesheets(pages) {
  const stylesheetUrls = unique(
    pages.flatMap((page) => page.stylesheets).filter(Boolean)
  ).slice(0, 8);

  const cssTexts = await Promise.all(
    stylesheetUrls.map(async (url) => {
      try {
        return await fetchText(url);
      } catch {
        return "";
      }
    })
  );

  return cssTexts.filter(Boolean).join("\n\n");
}

export async function crawlSite(baseUrl) {
  const normalizedBase = new URL(baseUrl).toString();
  const homepage = await fetchPage(normalizedBase);
  const sitemapUrls = await fetchSitemapUrls(normalizedBase);
  const candidateUrls = dedupeBy(
    [normalizedBase, ...sitemapUrls].map((url) => ({ url })),
    (entry) => entry.url
  )
    .slice(0, 10)
    .map((entry) => entry.url);

  const sampledPages = await Promise.all(
    candidateUrls.map(async (url) => {
      try {
        return await fetchPage(url);
      } catch {
        return null;
      }
    })
  );

  const pages = sampledPages.filter(Boolean);
  const cssText = await fetchStylesheets(pages.length ? pages : [homepage]);
  const styleguideUrl = await detectStyleguide(normalizedBase);
  const scriptUrls = pages.flatMap((page) => page.scripts);
  const thirdPartyEmbeds = detectThirdParty(scriptUrls);
  const assets = dedupeBy(
    pages.flatMap((page) => page.images ?? []),
    (asset) => asset.url
  );
  const inlineScriptCount = pages.reduce((total, page) => total + (page.inlineScriptCount ?? 0), 0);

  return {
    baseUrl: normalizedBase,
    homepage,
    pages: pages.length ? pages : [homepage],
    cssText,
    thirdPartyEmbeds,
    inlineScriptCount,
    assets,
    styleguideUrl,
    classes: pages.flatMap((page) => page.classes)
  };
}

export { THIRD_PARTY_PATTERNS };
