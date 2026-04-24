import { NextResponse } from "next/server";

interface FmpSectorSnapshot {
  date: string;
  sector: string;
  exchange: string;
  averageChange: number;
}

export interface SectorItem {
  sector: string;
  changePct: number;
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return NextResponse.json({ sectors: [] });

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/sector-performance-snapshot?date=${today}&exchange=NASDAQ&apikey=${apiKey}`,
      { next: { revalidate: 60 } },
    );
    const raw: FmpSectorSnapshot[] = await res.json();

    const sectors: SectorItem[] = raw
      .map((s) => ({
        sector: s.sector,
        changePct: s.averageChange,
      }))
      .sort((a, b) => b.changePct - a.changePct);

    return NextResponse.json({ sectors });
  } catch {
    return NextResponse.json({ sectors: [] });
  }
}
