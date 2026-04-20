"use client";

import StraddleSpxChart from "./StraddleSpxChart";
import SkewHistoryChart from "./SkewHistoryChart";
import { StraddleSnapshot, SkewSnapshot } from "../types";

type Props = {
  straddleData: StraddleSnapshot[];
  currentSpx: number | null;
  openingSkew: SkewSnapshot | null;
  skewHistory: SkewSnapshot[];
  avgSkew: number | null;
};

export default function IntradayCharts({
  straddleData,
  currentSpx,
  openingSkew,
  skewHistory,
  avgSkew,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 border border-border-2">
      <div className="bg-page p-2">
        <StraddleSpxChart
          data={straddleData}
          currentSpxPrice={currentSpx}
          openingSkew={openingSkew}
        />
      </div>
      <div className="bg-page p-2 md:border-l md:border-border-2">
        <SkewHistoryChart data={skewHistory} avgSkew={avgSkew} />
      </div>
    </div>
  );
}
