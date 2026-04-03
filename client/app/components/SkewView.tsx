"use client";

import SkewChart from "./SkewChart";
import { SkewSnapshot } from "../types";

type Props = {
  data: SkewSnapshot[];
  selectedDate: string;
};

export default function SkewView({ data, selectedDate }: Props) {
  const latest = data[data.length - 1];

  const skewValues = data.map((s) => s.skew);
  const minSkew = skewValues.length > 0 ? Math.min(...skewValues) : 0;
  const maxSkew = skewValues.length > 0 ? Math.max(...skewValues) : 1;
  const percentile =
    latest && maxSkew !== minSkew
      ? Math.round(((latest.skew - minSkew) / (maxSkew - minSkew)) * 100)
      : null;

  return (
    <div>
      <div className="flex items-baseline gap-8 mb-6">
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Skew
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latest?.skew?.toFixed(4) ?? "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Call IV
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latest ? `${(latest.call_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            ATM IV
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latest ? `${(latest.atm_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
        <div>
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">
            Put IV
          </span>
          <span className="text-2xl font-medium text-gray-400">
            {latest ? `${(latest.put_iv * 100).toFixed(1)}` : "—"}
          </span>
        </div>
      </div>
      <SkewChart data={data} selectedDate={selectedDate} />
    </div>
  );
}
