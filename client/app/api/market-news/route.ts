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

function formatCt(iso: string): string {
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleTimeString("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
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
    ).map((r) => ({
      time: formatCt(r.publishedDate),
      source: shortSource(r.site),
      title: r.title,
      url: r.url,
      category: "macro" as NewsCategory,
      symbol: null,
      _ts: new Date(r.publishedDate.replace(" ", "T") + "Z").getTime(),
    }));

    const stockItems: InternalItem[] = (Array.isArray(stock) ? stock : []).map(
      (r) => ({
        time: formatCt(r.publishedDate),
        source: shortSource(r.site),
        title: r.title,
        url: r.url,
        category: "stock" as NewsCategory,
        symbol: r.symbol ?? null,
        _ts: new Date(r.publishedDate.replace(" ", "T") + "Z").getTime(),
      }),
    );

    const merged: NewsItem[] = [...macroItems, ...stockItems]
      .filter((i) => i._ts >= cutoff)
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 25)
      .map(({ _ts: _, ...rest }) => rest);

    return NextResponse.json({ items: merged });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
