import * as cheerio from "cheerio";

export type SiteExtract = { url: string; title: string; description: string; text: string };

/** Extrait le texte utile d'une page : navigation, pied de page et scripts sont écartés. */
export function extractSite(html: string, url: string, maxChars = 12_000): SiteExtract {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer, form, template").remove();

  const title = ($('meta[property="og:title"]').attr("content") || $("title").first().text() || "").trim().slice(0, 200);
  const description = ($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "").trim().slice(0, 600);

  const blocks: string[] = [];
  $("h1, h2, h3, p, li, td, address").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text.length > 2) blocks.push(text);
  });

  const text = Array.from(new Set(blocks)).join("\n").slice(0, maxChars);
  return { url, title, description, text };
}
