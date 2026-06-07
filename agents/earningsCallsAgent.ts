/**
 * **Supplement agent — Earnings call hubs**
 *
 * For symbols reporting this week, adds stable links to Nasdaq earnings hubs where
 * webcasts and replay links are often listed (live URLs vary by issuer).
 */
import type { EarningsCallsSection, EarningsDigestSection, EarningsRow } from "../types/pipeline";

function nasdaqSymbolPath(symbol: string): string {
  return symbol.trim().toLowerCase().replace(/\./g, "-");
}

function hubForRow(r: EarningsRow): { hubUrl: string; hubLabel: string } {
  const sym = nasdaqSymbolPath(r.symbol);
  return {
    hubUrl: `https://www.nasdaq.com/market-activity/stocks/${sym}/earnings`,
    hubLabel: "Nasdaq earnings & webcast hub",
  };
}

export async function runEarningsCallsAgent(earnings: EarningsDigestSection): Promise<EarningsCallsSection> {
  if (earnings.fetchError && earnings.rows.length === 0) {
    return {
      weekLabel: earnings.weekLabel,
      rows: [],
      fetchError: earnings.fetchError,
    };
  }

  const cap = (() => {
    const n = Number(process.env.DIGEST_HTML_CALLS_MAX ?? "6");
    return Number.isFinite(n) && n >= 1 && n <= 40 ? Math.floor(n) : 6;
  })();
  const rows = earnings.rows.slice(0, cap).map((r) => {
    const { hubUrl, hubLabel } = hubForRow(r);
    return {
      symbol: r.symbol,
      companyName: r.companyName,
      date: r.date,
      hubUrl,
      hubLabel,
    };
  });

  return {
    weekLabel: earnings.weekLabel,
    rows,
  };
}
