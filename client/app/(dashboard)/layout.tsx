import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase-server";
import TopHeader from "../components/TopHeader";
import TabNav from "../components/TabNav";
import SecondaryTicker from "../components/SecondaryTicker";
import MarketStatusFooter from "../components/MarketStatusFooter";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const { data: basisRow } = await supabase
    .from("straddle_snapshots")
    .select("es_basis")
    .gte("created_at", `${today}T00:00:00`)
    .lt("created_at", `${today}T23:59:59`)
    .not("es_basis", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const initialBasis = basisRow?.es_basis ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-page">
      <TopHeader initialBasis={initialBasis} />
      <TabNav />
      <SecondaryTicker />
      <main className="flex-1">{children}</main>
      <MarketStatusFooter />
    </div>
  );
}
