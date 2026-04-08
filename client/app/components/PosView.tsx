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
      <span className="font-sans text-[11px] text-[#333] uppercase tracking-widest">
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
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Posições
          </span>
        </div>
        <RealPositionsPlaceholder />
      </div>

      <div className="border-t border-[#222]" />

      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            SML Fly
          </span>
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

      <div className="border-t border-[#222]" />

      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-0.5 h-4 bg-[#2a2a2a]" style={{ borderRadius: 0 }} />
          <span className="font-sans text-[11px] text-[#666] uppercase tracking-widest">
            Scratchpad
          </span>
        </div>
        <PositionsView spxPrice={spxPrice} />
      </div>
    </div>
  );
}
