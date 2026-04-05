"use client";

import SmlFlyView from "./SmlFlyView";
import PositionsView from "./PositionsView";
import { FlySnapshot, RtmSession } from "../types";

type Props = {
  smlSession: RtmSession | null;
  onSessionCreated: (session: RtmSession) => void;
  flySnapshots: FlySnapshot[];
  onEntryEdit: (snapshotId: string, newMid: number) => void;
  selectedDate: string;
  spxPrice: number;
};

function RealPositionsPlaceholder() {
  return (
    <div className="w-full py-8 rounded-sm bg-[#111111] flex items-center justify-center">
      <span className="text-xs text-[#2a2a2a] uppercase tracking-widest">
        Posições Tastytrade — em breve
      </span>
    </div>
  );
}

export default function PosView({
  smlSession,
  onSessionCreated,
  flySnapshots,
  onEntryEdit,
  selectedDate,
  spxPrice,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Real positions placeholder */}
      <div>
        <div className="text-xs text-[#333] uppercase tracking-widest mb-3">
          Posições
        </div>
        <RealPositionsPlaceholder />
      </div>

      <div className="border-t border-[#1a1a1a]" />

      {/* SML Fly */}
      <div>
        <div className="text-xs text-[#333] uppercase tracking-widest mb-3">
          SML Fly
        </div>
        <SmlFlyView
          session={smlSession}
          onSessionCreated={onSessionCreated}
          selectedDate={selectedDate}
          flySnapshots={flySnapshots}
          isTall={true}
          onEntryEdit={onEntryEdit}
        />
      </div>

      <div className="border-t border-[#1a1a1a]" />

      {/* Scratchpad positions */}
      <div>
        <div className="text-xs text-[#333] uppercase tracking-widest mb-3">
          Scratchpad
        </div>
        <PositionsView spxPrice={spxPrice} />
      </div>
    </div>
  );
}
