import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase-server";
import TradingPlanDashboard from "./TradingPlanDashboard";

export default async function TradingPlanPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { data: plans } = await supabase
    .from("trading_plans")
    .select("*")
    .order("date", { ascending: false });

  const { data: skewRows } = await supabase
    .from("skew_snapshots")
    .select("skew, put_iv, call_iv, atm_iv, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: allSkew } = await supabase
    .from("skew_snapshots")
    .select("skew")
    .gte("created_at", "2026-04-02T00:00:00");

  // Last 7 calendar days of skew for 3-session trend computation
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const { data: recentSkewRows } = await supabase
    .from("skew_snapshots")
    .select("skew, atm_iv, created_at")
    .gte("created_at", `${sevenDaysAgoStr}T00:00:00`)
    .order("created_at", { ascending: true });

  const { data: straddleRows } = await supabase
    .from("straddle_snapshots")
    .select("straddle_mid, spx_ref, atm_strike, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: weeklyRows } = await supabase
    .from("weekly_straddle_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  const latestSkew = skewRows?.[0] ?? null;
  const latestStraddle = straddleRows?.[0] ?? null;
  const weeklyStraddle = weeklyRows?.[0] ?? null;
  const allSkewValues = (allSkew ?? []).map((s: { skew: number }) => s.skew);

  const skewPctile =
    latestSkew && allSkewValues.length > 0
      ? Math.round(
          (allSkewValues.filter((v: number) => v <= latestSkew.skew).length /
            allSkewValues.length) *
            100,
        )
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
        recentSkewRows={
          (recentSkewRows ?? []) as {
            skew: number;
            atm_iv: number;
            created_at: string;
          }[]
        }
      />
    </main>
  );
}
