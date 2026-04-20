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

// Slightly taller than the old single-panel 220px — the SML Fly form needs
// room to breathe when no session exists yet.
const PANEL_HEIGHT = 260;

export default function PositionsSideBySide(props: Props) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 border border-border-2 bg-page"
      style={{ height: PANEL_HEIGHT }}
    >
      <div className="px-3 py-2 overflow-y-auto">
        <PositionsPanel {...props} lockedView="real" />
      </div>
      <div className="px-3 py-2 overflow-y-auto md:border-l md:border-border-2">
        <PositionsPanel {...props} lockedView="sml" />
      </div>
    </div>
  );
}
