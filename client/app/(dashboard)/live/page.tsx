import { Suspense } from "react";
import { createSupabaseServerClient } from "../../lib/supabase-server";
import LiveTab from "../../components/LiveTab";
import { StraddleSnapshot, RtmSession } from "../../types";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LivePage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const dateParam =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : null;

  const today =
    dateParam ??
    new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

  const [straddleResult, smlResult, openingGexResult] = await Promise.all([
    supabase
      .from("straddle_snapshots")
      .select("*")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: true }),
    supabase
      .from("rtm_sessions")
      .select("*")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dealer_strike_snapshots")
      .select("total")
      .eq("date", today)
      .eq("metric", "gex")
      .order("bar_time", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const initialStraddleData: StraddleSnapshot[] = straddleResult.data ?? [];
  const initialSmlSession: RtmSession | null = smlResult.data ?? null;
  const openingGexTotal: number | null = openingGexResult.data?.total ?? null;

  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto py-16 text-center text-text-5 text-xs uppercase tracking-[0.1em]">
          Loading live data…
        </div>
      }
    >
      <LiveTab
        initialStraddleData={initialStraddleData}
        initialSmlSession={initialSmlSession}
        initialOpeningGexTotal={openingGexTotal}
      />
    </Suspense>
  );
}
