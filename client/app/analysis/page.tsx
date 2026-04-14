import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase-server";
import AnalysisDashboard from "./AnalysisDashboard";

export default async function AnalysisPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: straddleSnapshots } = await supabase
    .from("straddle_snapshots")
    .select("created_at, spx_ref, atm_strike, straddle_mid, es_basis")
    .order("created_at", { ascending: true });

  const { data: skewSnapshots } = await supabase
    .from("skew_snapshots")
    .select("created_at, skew, put_iv, call_iv, atm_iv")
    .gte("created_at", "2026-04-02T00:00:00")
    .order("created_at", { ascending: true });

  const { data: esSnapshots } = await supabase
    .from("es_snapshots")
    .select("created_at, open, high, low, es_ref")
    .order("created_at", { ascending: true });

  // Weekly straddle snapshots — all Mondays
  const { data: weeklyStraddles } = await supabase
    .from("weekly_straddle_snapshots")
    .select("*")
    .order("created_at", { ascending: false });

  // Latest SPX for current week range display
  const { data: latestStraddle } = await supabase
    .from("straddle_snapshots")
    .select("spx_ref")
    .order("created_at", { ascending: false })
    .limit(1);

  const currentSpx = latestStraddle?.[0]?.spx_ref ?? null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <AnalysisDashboard
        straddleSnapshots={straddleSnapshots ?? []}
        skewSnapshots={skewSnapshots ?? []}
        esSnapshots={esSnapshots ?? []}
        weeklyStraddles={weeklyStraddles ?? []}
        currentSpx={currentSpx}
      />
    </main>
  );
}
