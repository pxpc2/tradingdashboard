import { Suspense } from "react";
import { createSupabaseServerClient } from "../../lib/supabase-server";
import LiveTab from "../../components/LiveTab";
import { StraddleSnapshot, DealerStrikeSnapshot } from "../../types";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type GexSeriesBar = { bar_time: string; total: number; spot_ref: number };
type TimelineDate = {
  date: string;
  regime_open: string | null;
  open_gex: number | null;
  close_gex: number | null;
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

  const [
    straddleResult,
    openingGexResult,
    latestGexResult,
    latestCexResult,
    gexSeriesResult,
    timelineDatesResult,
  ] = await Promise.all([
    supabase
      .from("straddle_snapshots")
      .select("*")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${today}T23:59:59`)
      .order("created_at", { ascending: true }),
    supabase
      .from("dealer_strike_snapshots")
      .select("total")
      .eq("date", today)
      .eq("metric", "gex")
      .order("bar_time", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dealer_strike_snapshots")
      .select("*")
      .eq("date", today)
      .eq("metric", "gex")
      .order("bar_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dealer_strike_snapshots")
      .select("*")
      .eq("date", today)
      .eq("metric", "cex")
      .order("bar_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dealer_strike_snapshots")
      .select("bar_time, total, spot_ref")
      .eq("date", today)
      .eq("metric", "gex")
      .order("bar_time", { ascending: true }),
    supabase
      .from("dealer_timeline_snapshots")
      .select("date, regime_open, open_gex, close_gex")
      .order("date", { ascending: false }),
  ]);

  const initialStraddleData: StraddleSnapshot[] = straddleResult.data ?? [];
  const openingGexTotal: number | null = openingGexResult.data?.total ?? null;
  const latestGex: DealerStrikeSnapshot | null = latestGexResult.data ?? null;
  const latestCex: DealerStrikeSnapshot | null = latestCexResult.data ?? null;
  const initialGexSeries: GexSeriesBar[] = gexSeriesResult.data ?? [];
  const timelineDates: TimelineDate[] = timelineDatesResult.data ?? [];

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
        initialOpeningGexTotal={openingGexTotal}
        initialLatestGex={latestGex}
        initialLatestCex={latestCex}
        initialGexSeries={initialGexSeries}
        initialTimelineDates={timelineDates}
      />
    </Suspense>
  );
}
