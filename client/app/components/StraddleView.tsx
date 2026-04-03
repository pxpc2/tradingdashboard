"use client";

import { useState, useEffect } from "react";
import StraddleChart from "./StraddleChart";
import { StraddleSnapshot } from "../types";

type Props = {
  data: StraddleSnapshot[];
  selectedDate: string;
};

export default function StraddleView({ data, selectedDate }: Props) {
  const latest = data[data.length - 1];
  const opening = data[0];
  const [pdh, setPdh] = useState<number | null>(null);
  const [pdl, setPdl] = useState<number | null>(null);

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    if (selectedDate !== today) {
      setPdh(null);
      setPdl(null);
      return;
    }

    async function fetchPdhl() {
      try {
        const res = await fetch("/api/pdhl");
        const data = await res.json();
        if (data.pdh) setPdh(data.pdh);
        if (data.pdl) setPdl(data.pdl);
      } catch {}
    }
    fetchPdhl();
  }, [selectedDate]);

  const impliedMovePct =
    opening && opening.spx_ref > 0
      ? ((opening.straddle_mid / opening.spx_ref) * 100).toFixed(2)
      : null;

  return (
    <div>
      <div className="flex items-baseline gap-8 mb-6">
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            SPX
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latest?.spx_ref?.toFixed(2) ?? "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Straddle
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latest?.straddle_mid?.toFixed(2) ?? "—"}
          </span>
        </div>
        {impliedMovePct && (
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
              Implied Move
            </span>
            <span className="text-2xl font-medium text-gray-400">
              ±{impliedMovePct}%
            </span>
          </div>
        )}
      </div>
      <StraddleChart
        data={data}
        selectedDate={selectedDate}
        pdh={pdh}
        pdl={pdl}
      />
    </div>
  );
}
