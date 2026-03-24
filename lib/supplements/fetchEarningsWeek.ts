/**
 * Earnings for the current week (Mon–Fri) in America/New_York.
 * Uses the Nasdaq earnings calendar API — free, no key required.
 */
import { DateTime } from "luxon";
import type { EarningsDigestSection, EarningsRow } from "../../types/pipeline";

function businessDaysAhead(startEt: DateTime, count: number): DateTime[] {
  const days: DateTime[] = [];
  let d = startEt;
  while (days.length < count) {
    if (d.weekday >= 1 && d.weekday <= 5) days.push(d);
    d = d.plus({ days: 1 });
  }
  return days;
}

function weekRangeEastern(): { days: string[]; weekLabel: string } {
  const et = DateTime.now().setZone("America/New_York");
  const monday = et.set({ weekday: 1 });
  const days = businessDaysAhead(monday, 5).map((d) => d.toISODate()!);
  const weekLabel = `${monday.toFormat("MMM d")} – ${monday.plus({ days: 4 }).toFormat("MMM d, yyyy")} (ET)`;
  return { days, weekLabel };
}

const NASDAQ_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.nasdaq.com/",
  "Accept-Language": "en-US,en;q=0.9",
};

interface NasdaqRow {
  symbol?: string;
  name?: string;
  time?: string;
  marketCap?: string;
  fiscalQuarterEnding?: string;
  epsForecast?: string;
}

function parseMarketCapB(raw?: string): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n / 1e9;
}

function formatTime(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw === "time-pre-market") return "Before open";
  if (raw === "time-after-hours") return "After close";
  if (raw === "time-not-supplied") return undefined;
  return raw;
}

async function fetchNasdaqDay(date: string): Promise<EarningsRow[]> {
  try {
    const res = await fetch(
      `https://api.nasdaq.com/api/calendar/earnings?date=${date}`,
      { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { rows?: NasdaqRow[] } };
    const rows = data?.data?.rows ?? [];
    const out: EarningsRow[] = [];
    for (const row of rows) {
      const sym = row.symbol?.trim();
      if (!sym) continue;
      if (parseMarketCapB(row.marketCap) < 5) continue; // skip sub-$5B
      out.push({
        symbol: sym,
        companyName: row.name?.trim() || sym,
        date,
        timeLabel: formatTime(row.time),
      });
    }
    // Sort biggest market caps first
    out.sort(
      (a, b) =>
        parseMarketCapB((rows.find((r) => r.symbol === b.symbol) || {}).marketCap) -
        parseMarketCapB((rows.find((r) => r.symbol === a.symbol) || {}).marketCap)
    );
    return out.slice(0, 8);
  } catch {
    return [];
  }
}

export async function fetchEarningsDigestSection(): Promise<EarningsDigestSection> {
  const { days, weekLabel } = weekRangeEastern();
  const calendarUrl =
    process.env.EARNINGS_CALENDAR_URL?.trim() ||
    "https://finance.yahoo.com/calendar/earnings";
  const youtubeUrl = process.env.EARNINGS_YOUTUBE_URL?.trim() || undefined;

  const base: EarningsDigestSection = { weekLabel, rows: [], calendarUrl, youtubeUrl };

  try {
    const perDay = await Promise.all(days.map(fetchNasdaqDay));
    // Keep only top 25 by market cap across the whole week
    const rows = perDay.flat().slice(0, 25);
    if (rows.length === 0) {
      return { ...base, fetchError: "No earnings data returned from Nasdaq for this week." };
    }
    return { ...base, rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...base, fetchError: msg };
  }
}
