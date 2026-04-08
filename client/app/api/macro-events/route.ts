import { NextRequest, NextResponse } from "next/server";

interface FmpEvent {
  date: string;
  country: string;
  event: string;
  currency: string;
  previous: number | null;
  estimate: number | null;
  actual: number | null;
  change: number | null;
  impact: string;
  changePercentage: number | null;
  unit: string | null;
}

export interface MacroEvent {
  timeCt: string;
  event: string;
  impact: "High" | "Medium" | "Low";
  estimate: string | null;
  actual: string | null;
  previous: string | null;
  unit: string | null;
}

function formatValue(val: number | null, unit: string | null): string | null {
  if (val === null) return null;
  const u = unit ? ` ${unit}` : "";
  return `${val}${u}`;
}

function utcToCt(dateStr: string): string {
  const date = new Date(dateStr.replace(" ", "T") + "Z");
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ events: [] });

  const apiKey = process.env.FMP_API_KEY;

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/economic-calendar?from=${date}&to=${date}&apikey=${apiKey}`,
      { next: { revalidate: 60 } },
    );

    const raw: FmpEvent[] = await res.json();

    const events: MacroEvent[] = raw
      .filter((e) => e.country === "US")
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({
        timeCt: utcToCt(e.date),
        event: e.event,
        impact: e.impact as "High" | "Medium" | "Low",
        estimate: formatValue(e.estimate, e.unit),
        actual: formatValue(e.actual, e.unit),
        previous: formatValue(e.previous, e.unit),
        unit: e.unit,
      }));

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
