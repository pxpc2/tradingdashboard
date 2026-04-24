import ChartTab from "@/app/components/ChartTab";
import { createSupabaseServerClient } from "../../lib/supabase-server";

export default async function ChartPage() {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const [
    { data: initialGex },
    { data: initialCex },
    { data: initialGexSeries },
    { data: initialStraddle },
    { data: timelineDates },
  ] = await Promise.all([
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
      .from("straddle_snapshots")
      .select("straddle_mid, spx_ref, created_at")
      .gte("created_at", `${today}T00:00:00`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dealer_timeline_snapshots")
      .select("date, regime_open, open_gex, close_gex")
      .order("date", { ascending: false }),
  ]);

  return (
    <ChartTab
      initialGex={initialGex}
      initialCex={initialCex}
      initialGexSeries={initialGexSeries ?? []}
      initialStraddle={initialStraddle}
      timelineDates={timelineDates ?? []}
      today={today}
    />
  );
}
