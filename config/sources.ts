/**
 * Global macro regions (continents) with allowlisted RSS feeds and domains.
 * Only article URLs whose hostname matches an allowlisted domain are kept.
 *
 * Feed URLs are public RSS endpoints; replace or extend as outlets change policies.
 */

export interface RssFeedConfig {
  url: string;
  name: string;
}

export interface RegionConfig {
  id: string;
  name: string;
  /** Hostnames without protocol, e.g. "bbc.co.uk" */
  allowedDomains: string[];
  feeds: RssFeedConfig[];
}

export const REGIONS: RegionConfig[] = [
  {
    id: "africa",
    name: "Africa",
    allowedDomains: ["bbc.co.uk", "bbc.com", "france24.com", "africanews.com"],
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", name: "BBC Africa" },
      { url: "https://www.france24.com/en/africa/rss", name: "France 24 Africa" },
    ],
  },
  {
    id: "asia",
    name: "Asia",
    allowedDomains: [
      "bbc.co.uk",
      "bbc.com",
      "france24.com",
      "cgtn.com",
      "news.cgtn.com",
      "scmp.com",
      "technode.com",
    ],
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml", name: "BBC Asia" },
      { url: "https://www.france24.com/en/asia-pacific/rss", name: "France 24 Asia" },
      { url: "https://www.cgtn.com/subscribe/rss/section/world.xml", name: "CGTN World" },
    ],
  },
  {
    id: "europe",
    name: "Europe",
    allowedDomains: ["bbc.co.uk", "bbc.com", "france24.com", "elperiodico.com", "elperiodista.cl"],
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/europe/rss.xml", name: "BBC Europe" },
      { url: "https://www.france24.com/en/europe/rss", name: "France 24 Europe" },
    ],
  },
  {
    id: "north_america",
    name: "North America",
    allowedDomains: [
      "bbc.co.uk",
      "bbc.com",
      "cnbc.com",
      "bloomberg.com",
      "www.bloomberg.com",
      "theverge.com",
      "techcrunch.com",
    ],
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml", name: "BBC US & Canada" },
      { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", name: "CNBC Top News" },
      { url: "https://feeds.bloomberg.com/markets/news.rss", name: "Bloomberg Markets" },
      { url: "https://techcrunch.com/feed/", name: "TechCrunch" },
      { url: "https://www.theverge.com/rss/index.xml", name: "The Verge" },
    ],
  },
  {
    id: "south_america",
    name: "South America",
    allowedDomains: ["bbc.co.uk", "bbc.com", "france24.com", "cnbc.com"],
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml", name: "BBC Latin America" },
      { url: "https://www.france24.com/en/americas/rss", name: "France 24 Americas" },
    ],
  },
  {
    id: "oceania",
    name: "Oceania",
    allowedDomains: ["bbc.co.uk", "bbc.com", "france24.com", "abc.net.au"],
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/australia/rss.xml", name: "BBC Australia" },
      { url: "https://www.france24.com/en/asia-pacific/rss", name: "France 24 Pacific" },
    ],
  },
];

export const TOP_STORIES_PER_REGION = 10;

/** Max raw articles per region before ranking (keeps OpenAI payload bounded). */
export const MAX_CANDIDATES_PER_REGION = 60;
