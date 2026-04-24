import { NextResponse } from "next/server";
import { TOP100_SYMBOLS } from "../../lib/sp500";

interface FmpQuote {
  symbol: string;
  price: number;
  changePercentage: number; // NOT changesPercentage
}

export interface MoverItem {
  symbol: string;
  price: number;
  changePct: number;
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return NextResponse.json({ gainers: [], losers: [] });

  try {
    const results = await Promise.all(
      TOP100_SYMBOLS.map((symbol) =>
        fetch(
          `https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${apiKey}`,
          { next: { revalidate: 60 } },
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    );

    const quotes: MoverItem[] = results
      .flat()
      .filter(
        (q): q is FmpQuote =>
          q != null &&
          typeof q.symbol === "string" &&
          typeof q.price === "number" &&
          typeof q.changePercentage === "number",
      )
      .map((q) => ({
        symbol: q.symbol,
        price: q.price,
        changePct: q.changePercentage,
      }));

    const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
    const gainers = sorted.slice(0, 8);
    const losers = sorted.slice(-8).reverse();

    return NextResponse.json({ gainers, losers });
  } catch {
    return NextResponse.json({ gainers: [], losers: [] });
  }
}
