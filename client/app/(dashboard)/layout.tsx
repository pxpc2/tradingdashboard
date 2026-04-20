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

  return (
    <div className="min-h-screen flex flex-col bg-page">
      <TopHeader />
      <TabNav />
      <SecondaryTicker />
      <main className="flex-1">{children}</main>
      <MarketStatusFooter />
    </div>
  );
}
