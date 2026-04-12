import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase-server";
import TradingPlanDashboard from "./TradingPlanDashboard";

export default async function TradingPlanPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  // Fetch all trading plans
  const { data: plans } = await supabase
    .from("trading_plans")
    .select("*")
    .order("date", { ascending: false });

  // Fetch today's skew (latest)
  const { data: skewRows } = await supabase
    .from("skew_snapshots")
    .select("skew, put_iv, call_iv, atm_iv, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(1);

  // Fetch all skew for percentile
  const { data: allSkew } = await supabase
    .from("skew_snapshots")
    .select("skew")
    .gte("created_at", "2026-04-02T00:00:00");

  // Fetch today's straddle (latest)
  const { data: straddleRows } = await supabase
    .from("straddle_snapshots")
    .select("straddle_mid, spx_ref, atm_strike, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(1);

  // Fetch this week's straddle (nearest weekly_straddle_snapshots)
  const { data: weeklyRows } = await supabase
    .from("weekly_straddle_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  // Fetch today's macro events
  const { data: macroRows } = await supabase
    .from("skew_snapshots") // placeholder — macro comes from FMP API route
    .select("created_at")
    .limit(0);

  const latestSkew = skewRows?.[0] ?? null;
  const latestStraddle = straddleRows?.[0] ?? null;
  const weeklyStraddle = weeklyRows?.[0] ?? null;
  const allSkewValues = (allSkew ?? []).map(s => s.skew);

  const skewPctile = latestSkew && allSkewValues.length > 0
    ? Math.round((allSkewValues.filter(v => v <= latestSkew.skew).length / allSkewValues.length) * 100)
    : null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <TradingPlanDashboard
        today={today}
        plans={plans ?? []}
        latestSkew={latestSkew}
        skewPctile={skewPctile}
        latestStraddle={latestStraddle}
        weeklyStraddle={weeklyStraddle}
      />
    </main>
  );
}
