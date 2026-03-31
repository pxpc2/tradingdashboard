/* eslint-disable @typescript-eslint/no-explicit-any */
import TastytradeClient from "@tastytrade/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const client = new TastytradeClient({
    baseUrl: "https://api.tastyworks.com",
    accountStreamerUrl: "wss://streamer.tastyworks.com",
    clientSecret: process.env.TASTY_CLIENT_SECRET!,
    refreshToken: process.env.TASTY_REFRESH_TOKEN!,
    oauthScopes: ["read"],
  });

  try {
    const { symbols } = await req.json();

    if (!symbols || symbols.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    await client.quoteStreamer.connect();

    const quotes: Record<string, { bid: number; ask: number; mid: number }> =
      {};

    await Promise.race([
      new Promise<void>((resolve) => {
        const listener = (events: any[]) => {
          events.forEach((e) => {
            if (symbols.includes(e.eventSymbol) && e.eventType === "Quote") {
              quotes[e.eventSymbol] = {
                bid: e.bidPrice,
                ask: e.askPrice,
                mid: (e.bidPrice + e.askPrice) / 2,
              };
            }
          });
          if (Object.keys(quotes).length === symbols.length) {
            client.quoteStreamer.removeEventListener(listener);
            client.quoteStreamer.unsubscribe(symbols);
            resolve();
          }
        };
        client.quoteStreamer.addEventListener(listener);
        client.quoteStreamer.subscribe(symbols);
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 15000),
      ),
    ]);

    await client.quoteStreamer.disconnect();

    return NextResponse.json({ quotes });
  } catch (err: any) {
    try {
      await client.quoteStreamer.disconnect();
    } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
