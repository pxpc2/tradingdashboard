import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase-server";
import AnalysisDashboard from "./AnalysisDashboard";

export default async function AnalysisPage() {
  const supabase = await createSupabaseServerClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all straddle snapshots — grouped analysis happens client-side
  const { data: straddleSnapshots } = await supabase
    .from("straddle_snapshots")
    .select("created_at, spx_ref, atm_strike, straddle_mid, es_basis")
    .order("created_at", { ascending: true });

  // Fetch all skew snapshots
  const { data: skewSnapshots } = await supabase
    .from("skew_snapshots")
    .select("created_at, skew, put_iv, call_iv, atm_iv")
    .gte("created_at", "2026-04-02T00:00:00")
    .order("created_at", { ascending: true });

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <AnalysisDashboard
        straddleSnapshots={straddleSnapshots ?? []}
        skewSnapshots={skewSnapshots ?? []}
      />
    </main>
  );
}
