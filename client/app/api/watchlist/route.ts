/* eslint-disable @typescript-eslint/no-explicit-any */
import TastytradeClient from "@tastytrade/api";
import { NextResponse } from "next/server";

export type WatchlistEntry = {
  symbol: string;
  streamerSymbol: string;
  instrumentType: string;
  marketSector: string | null;
};

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

    const watchlists = await client.watchlistsService.getAllWatchlists();

    const raw: any[] =
      (watchlists as any)
        ?.find((w: any) => w?.name === "vovonacci")
        ?.["watchlist-entries"] ?? [];


    const now = new Date();

    const entries: WatchlistEntry[] = await Promise.all(
      raw.map(async (e: any) => {
        if (e["instrument-type"] === "Future") {
          try {
            const futures = await client.instrumentsService.getFutures({
              symbols: [e.symbol],
            });

            const activeFuture = (futures as any)
              ?.filter(
                (f: any) =>
                  f["active"] === true &&
                  new Date(f["expiration-date"]) > now &&
                  f["future-product"]?.["root-symbol"] === e.symbol,
              )
              ?.sort(
                (a: any, b: any) =>
                  new Date(a["expiration-date"]).getTime() -
                  new Date(b["expiration-date"]).getTime(),
              )?.[0];

            const streamerSymbol = activeFuture?.["streamer-symbol"] ?? e.symbol;
            const marketSector = activeFuture?.["future-product"]?.["market-sector"] ?? null;


            return {
              symbol: e.symbol,
              streamerSymbol,
              instrumentType: e["instrument-type"],
              marketSector,
            };
          } catch (err: any) {
            console.error(`[watchlist] future lookup failed for ${e.symbol}:`, err.message);
            return {
              symbol: e.symbol,
              streamerSymbol: e.symbol,
              instrumentType: e["instrument-type"],
              marketSector: null,
            };
          }
        }
        return {
          symbol: e.symbol,
          streamerSymbol: e.symbol,
          instrumentType: e["instrument-type"],
          marketSector: null,
        };
      }),
    );

    return NextResponse.json({ entries }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate" },
    });
  } catch (err: any) {
    try { await client.quoteStreamer.disconnect(); } catch {}
    console.error("[watchlist] error:", err.message);
    return NextResponse.json({ error: err.message, entries: [] }, { status: 500 });
  }
}