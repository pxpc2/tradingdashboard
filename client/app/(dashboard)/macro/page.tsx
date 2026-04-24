import MacroTab from "@/app/components/MacroTab";

export default function MacroPage() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  return <MacroTab selectedDate={today} />;
}
