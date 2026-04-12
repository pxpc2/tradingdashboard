"use client";

import { useState } from "react";
import { ConditionEntry } from "../TradingPlanDashboard";

type Props = {
  entries: ConditionEntry[];
  onAdd: (entry: ConditionEntry) => Promise<void>;
};

const TYPE_COLORS: Record<string, string> = {
  CONFIRM: "#4ade80",
  REGIME_BREAK: "#f87171",
  TRADE: "#f59e0b",
  NOTE: "#555",
};

const TYPE_LABELS: Record<string, string> = {
  CONFIRM: "CONFIRM",
  REGIME_BREAK: "REGIME BREAK",
  TRADE: "TRADE",
  NOTE: "NOTE",
};

function formatTS(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function ConditionLog({ entries, onAdd }: Props) {
  const [type, setType] = useState<ConditionEntry["type"]>("NOTE");
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  async function handleAdd() {
    if (!note.trim()) return;
    setIsAdding(true);
    await onAdd({
      ts: new Date().toISOString(),
      type,
      note: note.trim(),
    });
    setNote("");
    setIsAdding(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-4 bg-[#333]" />
        <span className="font-sans text-xs text-[#666] uppercase tracking-wide">
          Log de condições
        </span>
      </div>

      {/* Entry form */}
      <div className="bg-[#111] rounded p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {(["CONFIRM", "REGIME_BREAK", "TRADE", "NOTE"] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`font-mono text-[11px] px-2.5 py-1 rounded transition-colors hover:cursor-pointer ${
                type === t
                  ? "bg-[#222] text-[#9ca3af]"
                  : "bg-transparent text-[#444] border border-[#222]"
              }`}
              style={{ color: type === t ? TYPE_COLORS[t] : undefined }}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="Observação..."
            className="flex-1 bg-[#0a0a0a] border border-[#222] rounded px-2.5 py-1.5 font-mono text-xs text-[#9ca3af] placeholder-[#333] focus:border-[#444] focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={isAdding || !note.trim()}
            className="bg-[#222] text-xs text-[#9ca3af] px-4 py-1.5 rounded hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 hover:cursor-pointer"
          >
            {isAdding ? "..." : "Add"}
          </button>
        </div>
      </div>

      {/* Entries list */}
      {entries.length > 0 && (
        <div className="bg-[#111] rounded overflow-hidden">
          {[...entries].reverse().map((entry, i) => (
            <div
              key={i}
              className="flex gap-3 px-4 py-2.5 border-b border-[#1a1a1a] last:border-0"
            >
              <span className="font-mono text-[11px] text-[#444] shrink-0 pt-px">
                {formatTS(entry.ts)}
              </span>
              <span
                className="font-mono text-[11px] shrink-0 pt-px w-24"
                style={{ color: TYPE_COLORS[entry.type] ?? "#555" }}
              >
                {TYPE_LABELS[entry.type]}
              </span>
              <span className="font-sans text-xs text-[#9ca3af]">
                {entry.note}
              </span>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <div className="text-xs text-[#333] text-center py-4">
          Nenhuma entrada ainda — adicione observações durante o pregão
        </div>
      )}
    </div>
  );
}
