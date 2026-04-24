import { NextResponse } from "next/server";

interface FmpNewsRow {
  symbol?: string;
  publishedDate: string;
  title: string;
  site: string;
  url: string;
  text?: string;
}

export type NewsCategory = "macro" | "stock";

export interface NewsItem {
  time: string; // HH:MM CT
  source: string;
  title: string;
  url: string;
  category: NewsCategory;
  symbol: string | null;
}

/**
 * FMP's `publishedDate` is a naive "YYYY-MM-DD HH:mm:ss" string in
 * America/New_York time. We parse it by figuring out the ET offset for
 * that specific instant (handling DST correctly) and produce a real UTC
 * timestamp.
 */
function parseFmpEtToUtcMs(s: string): number {
  const [datePart, timePart] = s.split(" ");
  if (!datePart || !timePart) return NaN;
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, se] = timePart.split(":").map(Number);
  if ([y, mo, d, h, mi, se].some((n) => Number.isNaN(n))) return NaN;

  // Pretend the wall time is UTC, then see what Intl reports it as in ET.
  // The difference is the ET-to-UTC offset for that instant.
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, se);
  const etShown = new Date(utcGuess).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const m = etShown.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!m) return NaN;
  const [, emo, ed, ey, eh, emi, ese] = m.map(Number);
  const etAsUtc = Date.UTC(ey, emo - 1, ed, eh, emi, ese);
  const offsetMs = utcGuess - etAsUtc;

  return utcGuess + offsetMs;
}

function formatCt(ts: number): string {
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function shortSource(site: string): string {
  const lower = site.toLowerCase();
  if (lower.includes("bloomberg")) return "BBG";
  if (lower.includes("reuters")) return "RTR";
  if (lower.includes("cnbc")) return "CNBC";
  if (lower.includes("wsj") || lower.includes("wall street journal"))
    return "WSJ";
  if (lower.includes("marketwatch")) return "MW";
  if (lower.includes("financial times")) return "FT";
  if (lower.includes("barron")) return "BRN";
  if (lower.includes("seekingalpha")) return "SA";
  if (lower.includes("zerohedge")) return "ZH";
  if (lower.includes("yahoo")) return "YH";
  return site.split(".")[0].slice(0, 4).toUpperCase();
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return NextResponse.json({ items: [] });

  type InternalItem = NewsItem & { _ts: number };

  try {
    const [generalRes, stockRes] = await Promise.all([
      fetch(
        `https://financialmodelingprep.com/stable/news/general-latest?limit=25&apikey=${apiKey}`,
        { next: { revalidate: 60 } },
      ),
      fetch(
        `https://financialmodelingprep.com/stable/news/stock-latest?limit=25&apikey=${apiKey}`,
        { next: { revalidate: 60 } },
      ),
    ]);

    const general: FmpNewsRow[] = await generalRes.json().catch(() => []);
    const stock: FmpNewsRow[] = await stockRes.json().catch(() => []);

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const macroItems: InternalItem[] = (
      Array.isArray(general) ? general : []
    ).map((r) => {
      const ts = parseFmpEtToUtcMs(r.publishedDate);
      return {
        time: formatCt(ts),
        source: shortSource(r.site),
        title: r.title,
        url: r.url,
        category: "macro" as NewsCategory,
        symbol: null,
        _ts: ts,
      };
    });

    const stockItems: InternalItem[] = (Array.isArray(stock) ? stock : []).map(
      (r) => {
        const ts = parseFmpEtToUtcMs(r.publishedDate);
        return {
          time: formatCt(ts),
          source: shortSource(r.site),
          title: r.title,
          url: r.url,
          category: "stock" as NewsCategory,
          symbol: r.symbol ?? null,
          _ts: ts,
        };
      },
    );

    const merged: NewsItem[] = [...macroItems, ...stockItems]
      .filter((i) => Number.isFinite(i._ts) && i._ts >= cutoff)
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 25)
      .map(({ _ts: _, ...rest }) => rest);

    return NextResponse.json({ items: merged });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
