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
    const url = (client.quoteStreamer as any).dxLinkUrl as string;
    const token = (client.quoteStreamer as any).dxLinkAuthToken as string;
    await client.quoteStreamer.disconnect();
    return NextResponse.json({ url, token });
  } catch (err: any) {
    try {
      await client.quoteStreamer.disconnect();
    } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
