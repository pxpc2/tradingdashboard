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
    const futures = await client.instrumentsService.getFutures({
      symbols: ["/ES"],
    });
    const now = new Date();
    const front = (futures as any[])
      ?.filter(
        (f: any) =>
          f["active"] === true &&
          new Date(f["expiration-date"]) > now &&
          f["future-product"]?.["root-symbol"] === "/ES",
      )
      ?.sort(
        (a: any, b: any) =>
          new Date(a["expiration-date"]).getTime() -
          new Date(b["expiration-date"]).getTime(),
      )?.[0];

    if (!front) {
      return NextResponse.json(
        { error: "No active ES future" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { symbol: front["streamer-symbol"] as string },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate",
        },
      },
    );
  } catch (err: any) {
    console.error("[es-contract] error:", err.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
