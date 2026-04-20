"use client";

import PositionsPanel from "./PositionsPanel";
import { TickData } from "../hooks/useLiveTick";
import { RtmSession, FlySnapshot } from "../types";
import { PositionLeg } from "../api/real-positions/route";

type Props = {
  smlSession: RtmSession | null;
  flySnapshots: FlySnapshot[];
  realLegs: PositionLeg[];
  realTicks: Record<string, TickData>;
  realIsLoading: boolean;
  realError: string | null;
};

const PANEL_HEIGHT = 220;

export default function PositionsFixedHeight(props: Props) {
  return (
    <div
      className="bg-page border border-border-2 overflow-hidden"
      style={{ height: PANEL_HEIGHT }}
    >
      <div className="h-full overflow-y-auto">
        <PositionsPanel {...props} />
      </div>
    </div>
  );
}
