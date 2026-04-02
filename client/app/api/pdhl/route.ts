/* eslint-disable @typescript-eslint/no-explicit-any */
import TastytradeClient from "@tastytrade/api";
import { NextResponse } from "next/server";

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

    // Use UTC date since candle times are midnight UTC
    const todayUTC = new Date().toISOString().slice(0, 10);

    const { pdh, pdl } = await Promise.race([
      new Promise<{ pdh: number; pdl: number }>((resolve) => {
        const candles: any[] = [];

        const listener = (events: any[]) => {
          events.forEach((e) => {
            if (
              e.eventType === "Candle" &&
              e.eventSymbol?.startsWith("SPX") &&
              e.high > 0 &&
              e.low > 0
            ) {
              candles.push(e);
            }
          });

          // Filter to only completed previous days using UTC date string
          const previousCandles = candles.filter((c) => {
            const candleDate = new Date(c.time).toISOString().slice(0, 10);
            return candleDate < todayUTC;
          });

          if (previousCandles.length > 0) {
            previousCandles.sort((a, b) => b.time - a.time);
            const prev = previousCandles[0];
            client.quoteStreamer.removeEventListener(listener);
            resolve({ pdh: prev.high, pdl: prev.low });
          }
        };

        client.quoteStreamer.addEventListener(listener);

        const from = new Date();
        from.setDate(from.getDate() - 5);
        (client.quoteStreamer as any).subscribeCandles(
          "SPX",
          from.getTime(),
          1,
          "Day",
        );
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 15000),
      ),
    ]);

    await client.quoteStreamer.disconnect();
    return NextResponse.json({ pdh, pdl });
  } catch (err: any) {
    try {
      await client.quoteStreamer.disconnect();
    } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}