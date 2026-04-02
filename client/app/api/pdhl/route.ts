/* eslint-disable @typescript-eslint/no-explicit-any */
import TastytradeClient from "@tastytrade/api";
import { NextResponse } from "next/server";

const client = new TastytradeClient({
  baseUrl: "https://api.tastyworks.com",
  accountStreamerUrl: "wss://streamer.tastyworks.com",
  clientSecret: process.env.TASTY_CLIENT_SECRET!,
  refreshToken: process.env.TASTY_REFRESH_TOKEN!,
  oauthScopes: ["read"],
});

export async function GET() {
  try {
    await client.quoteStreamer.connect();

    const { pdh, pdl } = await Promise.race([
      new Promise<{ pdh: number; pdl: number }>((resolve) => {
        const listener = (events: any[]) => {
          const candle = events.find(
            (e) => e.eventType === "Candle" && e.eventSymbol?.startsWith("SPX"),
          );
          if (candle && candle.high > 0 && candle.low > 0) {
            client.quoteStreamer.removeEventListener(listener);
            resolve({ pdh: candle.high, pdl: candle.low });
          }
        };

        client.quoteStreamer.addEventListener(listener);

        // Subscribe to daily candles, starting from 3 days ago to ensure we get previous completed day
        const from = new Date();
        from.setDate(from.getDate() - 3);
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
