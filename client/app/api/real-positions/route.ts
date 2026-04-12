/* eslint-disable @typescript-eslint/no-explicit-any */
import TastytradeClient from "@tastytrade/api";
import { NextResponse } from "next/server";

export type PositionLeg = {
  symbol: string;
  streamerSymbol: string;
  underlyingSymbol: string;
  expiryDate: string;
  strike: number;
  optionType: "C" | "P";
  direction: "Long" | "Short";
  quantity: number;
  multiplier: number;
  averageOpenPrice: number;
};

// Parse OCC-style option symbol
// e.g. "SPXW  260417C06820000" → { expiry: "2026-04-17", strike: 6820, type: "C" }
function parseOptionSymbol(symbol: string): {
  expiry: string;
  strike: number;
  optionType: "C" | "P";
} | null {
  // OCC equity option: "SPXW  260417C06820000"
  const occMatch = symbol
    .trim()
    .match(/^(\S+)\s+(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (occMatch) {
    const [, , yy, mm, dd, type, strikeRaw] = occMatch;
    return {
      expiry: `20${yy}-${mm}-${dd}`,
      strike: parseInt(strikeRaw) / 1000,
      optionType: type as "C" | "P",
    };
  }

  // Future option: "./ESM6 E2AJ6 260413P6750"
  const futMatch = symbol.trim().match(/\s(\d{2})(\d{2})(\d{2})([CP])(\d+)$/);
  if (futMatch) {
    const [, yy, mm, dd, type, strikeRaw] = futMatch;
    return {
      expiry: `20${yy}-${mm}-${dd}`,
      strike: parseFloat(strikeRaw),
      optionType: type as "C" | "P",
    };
  }

  return null;
}

export async function GET() {
  const client = new TastytradeClient({
    baseUrl: "https://api.tastyworks.com",
    accountStreamerUrl: "wss://streamer.tastyworks.com",
    clientSecret: process.env.TASTY_CLIENT_SECRET!,
    refreshToken: process.env.TASTY_REFRESH_TOKEN!,
    oauthScopes: ["read"],
  });

  try {
    await client.quoteStreamer.connect();
    await client.quoteStreamer.disconnect();

    const accountNumber = process.env.TASTY_ACCOUNT_NUMBER!;
    const rawPositions = await (
      client as any
    ).balancesAndPositionsService.getPositionsList(accountNumber);
    const positions: any[] = Array.isArray(rawPositions)
      ? rawPositions
      : ((rawPositions as any)?.items ?? []);

    console.log("[real-positions] raw count:", positions.length);
    console.log(
      "[real-positions] raw positions:",
      JSON.stringify(positions, null, 2),
    );

    const legs: PositionLeg[] = [];

    for (const pos of positions) {
      const instrumentType = pos["instrument-type"];
      if (
        instrumentType !== "Equity Option" &&
        instrumentType !== "Future Option"
      )
        continue;

      const symbol: string = pos["symbol"] ?? "";
      const streamerSymbol: string = pos["streamer-symbol"] ?? symbol;
      const underlying: string = pos["underlying-symbol"] ?? "";
      const direction: "Long" | "Short" =
        pos["quantity-direction"] === "Long" ? "Long" : "Short";
      const quantity: number = Math.abs(parseFloat(pos["quantity"] ?? "0"));
      const multiplier: number = parseFloat(pos["multiplier"] ?? "100");
      const averageOpenPrice: number = parseFloat(
        pos["average-open-price"] ?? "0",
      );

      const parsed = parseOptionSymbol(symbol);
      if (!parsed) continue;

      legs.push({
        symbol,
        streamerSymbol,
        underlyingSymbol: underlying,
        expiryDate: parsed.expiry,
        strike: parsed.strike,
        optionType: parsed.optionType,
        direction,
        quantity,
        multiplier,
        averageOpenPrice,
      });
    }

    return NextResponse.json(
      { legs },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err: any) {
    try {
      await client.quoteStreamer.disconnect();
    } catch {}
    console.error("[real-positions] error:", err.message);
    return NextResponse.json({ error: err.message, legs: [] }, { status: 500 });
  }
}
