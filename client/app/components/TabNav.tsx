"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { label: string; href: string };

const TABS: Tab[] = [
  { label: "LIVE", href: "/live" },
  { label: "POSITIONS", href: "/positions" },
  { label: "CHART", href: "/chart" },
  { label: "MACRO", href: "/macro" },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <div className="bg-panel border-b border-border">
      {/*
        pb-1 gives breathing room between the active tab's amber underline
        (at the bottom of each Link) and the outer container's full-width
        rule. Otherwise the amber line visually merges with the watchlist
        strip that follows.
      */}
      <div className="max-w-7xl mx-auto px-4 flex pb-1">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 py-2 text-center font-sans text-[11px] tracking-[0.08em] font-medium transition-colors ${
                active
                  ? "text-text border-b-2 border-amber"
                  : "text-text-4 hover:text-text-2 border-b-2 border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
