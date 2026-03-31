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
    const chain = await client.instrumentsService.getOptionChain("%2FSPX");
    const options = Array.from(chain) as any[];

    const expirations = [
      ...new Set(options.map((o) => o["expiration-date"])),
    ].sort();

    const strikesByExpiry: Record<string, number[]> = {};
    expirations.forEach((exp) => {
      const strikes = [
        ...new Set(
          options
            .filter((o) => o["expiration-date"] === exp)
            .map((o) => parseFloat(o["strike-price"])),
        ),
      ].sort((a, b) => a - b);
      strikesByExpiry[exp as string] = strikes;
    });

    return NextResponse.json({ expirations, strikesByExpiry });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
