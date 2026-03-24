/**
 * Cross-edition article deduplication.
 *
 * Records URLs that were selected in a pipeline run so that the next run
 * (e.g. the evening edition) skips them.  Entries expire after TTL_HOURS
 * so articles recirculate after ~24 h.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_PATH = path.join(process.cwd(), "data", "sent-articles.json");
const TTL_HOURS = 20; // articles are blocked for this many hours between editions

interface SentEntry {
  url: string;
  sentAt: string; // ISO timestamp
}

interface SentArticlesFile {
  version: 1;
  entries: SentEntry[];
}

function getPath(): string {
  return process.env.SENT_ARTICLES_PATH?.trim() || DEFAULT_PATH;
}

function ensureDir(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function load(): SentArticlesFile {
  try {
    const raw = readFileSync(getPath(), "utf-8");
    const parsed = JSON.parse(raw) as SentArticlesFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

function save(data: SentArticlesFile): void {
  const filePath = getPath();
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, filePath);
}

function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/$/, "").split("?")[0];
}

/** Return set of normalized URLs that were sent within TTL_HOURS. */
export function loadRecentlySentUrls(): Set<string> {
  const data = load();
  const cutoff = Date.now() - TTL_HOURS * 3_600_000;
  const recent = new Set<string>();
  for (const entry of data.entries) {
    try {
      if (new Date(entry.sentAt).getTime() >= cutoff) {
        recent.add(normalizeUrl(entry.url));
      }
    } catch {
      // ignore malformed timestamps
    }
  }
  return recent;
}

/** Record article URLs as sent, pruning entries older than TTL_HOURS. */
export function recordSentUrls(urls: string[]): void {
  if (urls.length === 0) return;
  const data = load();
  const now = new Date().toISOString();
  const cutoff = Date.now() - TTL_HOURS * 3_600_000;

  // Prune expired entries first
  data.entries = data.entries.filter((e) => {
    try {
      return new Date(e.sentAt).getTime() >= cutoff;
    } catch {
      return false;
    }
  });

  // Add new entries (avoid duplicates within same run)
  const existing = new Set(data.entries.map((e) => normalizeUrl(e.url)));
  for (const url of urls) {
    const norm = normalizeUrl(url);
    if (!existing.has(norm)) {
      data.entries.push({ url: norm, sentAt: now });
      existing.add(norm);
    }
  }

  save(data);
  console.log(`[sentArticles] Recorded ${urls.length} URLs (total tracked: ${data.entries.length})`);
}

/** Filter articles in master sections that appear in recentlySent. Returns count removed. */
export function filterSentFromSections(
  sections: Record<string, { link: string }[]>,
  recentlySent: Set<string>
): number {
  if (recentlySent.size === 0) return 0;
  let removed = 0;
  for (const topicId of Object.keys(sections)) {
    const before = sections[topicId].length;
    sections[topicId] = sections[topicId].filter(
      (a) => !recentlySent.has(normalizeUrl(a.link))
    );
    removed += before - sections[topicId].length;
  }
  return removed;
}
