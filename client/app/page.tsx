import { supabase } from "./lib/supabase";
import Dashboard from "./components/Dashboard";

export default async function Home() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { data: straddleSnapshots } = await supabase
    .from("straddle_snapshots")
    .select("*")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: true });

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Dashboard initialStraddleData={straddleSnapshots ?? []} />
    </main>
  );
}
