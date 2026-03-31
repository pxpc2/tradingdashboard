"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { FaTrashAlt } from "react-icons/fa";

type Position = {
  id: string;
  created_at: string;
  label: string;
  is_active: boolean;
  notes: string | null;
};

type PositionLeg = {
  id: string;
  position_id: string;
  expiration_date: string;
  strike: number;
  opt_type: string;
  action: string;
  quantity: number;
  entry_price_mid: number;
  streamer_symbol: string;
};

type LegQuote = {
  bid: number;
  ask: number;
  mid: number;
};

const RISK_FREE_RATE = 0.05;

function normalCDF(x: number): number {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741;
  const a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function computeGreeks(
  optType: string,
  spotPrice: number,
  strike: number,
  expirationDate: string,
  currentMid: number,
) {
  const now = new Date();
  const expiry = new Date(expirationDate);
  const T = Math.max(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365),
    0.0001,
  );
  const r = RISK_FREE_RATE;
  const S = spotPrice;
  const K = strike;
  const isCall = optType.toLowerCase() === "call" || optType === "C";

  let low = 0.01,
    high = 5.0,
    iv = 0.5;
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const d1 =
      (Math.log(S / K) + (r + 0.5 * mid * mid) * T) / (mid * Math.sqrt(T));
    const d2 = d1 - mid * Math.sqrt(T);
    const price = isCall
      ? S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
      : K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    if (Math.abs(price - currentMid) < 0.001) {
      iv = mid;
      break;
    }
    if (price < currentMid) low = mid;
    else high = mid;
    iv = mid;
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);
  const nd1 = normalPDF(d1);

  const delta = isCall ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = nd1 / (S * iv * Math.sqrt(T));
  const theta =
    (-(S * nd1 * iv) / (2 * Math.sqrt(T)) -
      r * K * Math.exp(-r * T) * (isCall ? normalCDF(d2) : normalCDF(-d2))) /
    365;
  const vega = (S * nd1 * Math.sqrt(T)) / 100;

  return { delta, gamma, theta, vega };
}

async function fetchQuotesForSymbols(
  symbols: string[],
): Promise<Record<string, LegQuote>> {
  if (symbols.length === 0) return {};
  try {
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    const data = await res.json();
    return data.quotes ?? {};
  } catch (err) {
    console.error("Erro ao buscar cotações:", err);
    return {};
  }
}

export default function PositionsView({ spxPrice }: { spxPrice: number }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [legs, setLegs] = useState<Record<string, PositionLeg[]>>({});
  const [quotes, setQuotes] = useState<Record<string, LegQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const positionsRef = useRef<Position[]>([]);
  const legsRef = useRef<Record<string, PositionLeg[]>>({});

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);
  useEffect(() => {
    legsRef.current = legs;
  }, [legs]);

  useEffect(() => {
    async function load() {
      const { data: posData } = await supabase
        .from("positions")
        .select("*")
        .order("created_at", { ascending: false });

      if (!posData) return;

      const { data: legData } = await supabase
        .from("position_legs")
        .select("*");

      const legsByPosition: Record<string, PositionLeg[]> = {};
      (legData ?? []).forEach((leg) => {
        if (!legsByPosition[leg.position_id])
          legsByPosition[leg.position_id] = [];
        legsByPosition[leg.position_id].push(leg);
      });

      setPositions(posData);
      setLegs(legsByPosition);
      positionsRef.current = posData;
      legsRef.current = legsByPosition;

      const activePositions = posData.filter((p) => p.is_active);
      const symbols = [
        ...new Set(
          activePositions.flatMap((p) =>
            (legsByPosition[p.id] ?? []).map((l) => l.streamer_symbol),
          ),
        ),
      ];

      const fetchedQuotes = await fetchQuotesForSymbols(symbols);
      setQuotes(fetchedQuotes);
      setQuotesLoading(false);
    }

    load();
  }, []);

  useEffect(() => {
    async function refresh() {
      const activePositions = positionsRef.current.filter((p) => p.is_active);
      const symbols = [
        ...new Set(
          activePositions.flatMap((p) =>
            (legsRef.current[p.id] ?? []).map((l) => l.streamer_symbol),
          ),
        ),
      ];
      const fetchedQuotes = await fetchQuotesForSymbols(symbols);
      if (Object.keys(fetchedQuotes).length > 0) {
        setQuotes(fetchedQuotes);
      }
    }

    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, []);

  async function deletePosition(id: string) {
    await supabase.from("position_legs").delete().eq("position_id", id);
    await supabase.from("positions").delete().eq("id", id);
    setPositions((prev) => prev.filter((p) => p.id !== id));
    setLegs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase
      .from("positions")
      .update({ is_active: !current })
      .eq("id", id);
    setPositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: !current } : p)),
    );
  }

  function computePositionSummary(position: Position) {
    const posLegs = legs[position.id] ?? [];
    let totalEntryValue = 0;
    let totalCurrentValue = 0;
    let totalDelta = 0,
      totalGamma = 0,
      totalTheta = 0,
      totalVega = 0;

    posLegs.forEach((leg) => {
      const quote = quotes[leg.streamer_symbol];
      const currentMid = quote?.mid ?? 0;
      const direction = leg.action === "buy" ? 1 : -1;
      const mult = leg.quantity * direction * 100;

      totalEntryValue += leg.entry_price_mid * mult;
      totalCurrentValue += currentMid * mult;

      if (position.is_active && spxPrice > 0 && currentMid > 0) {
        const greeks = computeGreeks(
          leg.opt_type,
          spxPrice,
          leg.strike,
          leg.expiration_date,
          currentMid,
        );
        totalDelta += greeks.delta * leg.quantity * direction;
        totalGamma += greeks.gamma * leg.quantity * direction;
        totalTheta += greeks.theta * leg.quantity * direction * 100;
        totalVega += greeks.vega * leg.quantity * direction * 100;
      }
    });

    const pnl = totalCurrentValue - totalEntryValue;
    return { pnl, totalDelta, totalGamma, totalTheta, totalVega };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          Posições
        </span>
        <button
          onClick={() => setShowModal(true)}
          className="text-xs text-gray-400 border border-[#1f1f1f] rounded-sm px-3 py-1.5 hover:border-gray-400 transition-colors hover:cursor-pointer"
        >
          + Adicionar posição
        </button>
      </div>

      {positions.length === 0 ? (
        <div className="text-sm text-[#333] py-4">
          Nenhuma posição cadastrada.
        </div>
      ) : quotesLoading ? (
        <div className="flex items-center gap-2 py-4">
          <div className="w-3 h-3 rounded-full bg-[#333] animate-pulse" />
          <div className="w-3 h-3 rounded-full bg-[#333] animate-pulse delay-75" />
          <div className="w-3 h-3 rounded-full bg-[#333] animate-pulse delay-150" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {positions.map((position) => {
            const { pnl, totalDelta, totalGamma, totalTheta, totalVega } =
              computePositionSummary(position);
            const posLegs = legs[position.id] ?? [];
            const isExpanded = expandedId === position.id;

            return (
              <div key={position.id} className="bg-[#111111] rounded-sm">
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : position.id)}
                >
                  <div className="flex-1 text-sm font-medium">
                    {position.label}
                  </div>
                  <div
                    className="text-sm font-medium w-24"
                    style={{
                      color:
                        pnl === 0 ? "#888" : pnl > 0 ? "#4ade80" : "#f87171",
                    }}
                  >
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
                  </div>
                  <div className="text-xs text-[#444] w-16">
                    Δ {totalDelta.toFixed(2)}
                  </div>
                  <div className="text-xs text-[#444] w-16">
                    Γ {totalGamma.toFixed(4)}
                  </div>
                  <div className="text-xs text-[#444] w-20">
                    Θ {totalTheta.toFixed(2)}
                  </div>
                  <div className="text-xs text-[#444] w-20">
                    V {totalVega.toFixed(2)}
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActive(position.id, position.is_active);
                      }}
                      className={`text-xs px-2 py-0.5 rounded-sm border transition-colors ${
                        position.is_active
                          ? "border-[#333] text-[#888]"
                          : "border-[#1f1f1f] text-[#444]"
                      }`}
                    >
                      {position.is_active ? "Ativa" : "Expirada"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePosition(position.id);
                      }}
                      className="text-xs text-[#444] hover:text-[#f87171] hover:cursor-pointer transition-colors"
                    >
                      <FaTrashAlt />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#1a1a1a] px-4 py-3">
                    <table className="w-full text-xs text-[#444]">
                      <thead>
                        <tr className="text-left">
                          <th className="pb-2 font-medium">Direção</th>
                          <th className="pb-2 font-medium">Símbolo</th>
                          <th className="pb-2 font-medium">Qtd</th>
                          <th className="pb-2 font-medium">Entrada</th>
                          <th className="pb-2 font-medium">Atual</th>
                          <th className="pb-2 font-medium">PnL</th>
                          <th className="pb-2 font-medium">Δ</th>
                          <th className="pb-2 font-medium">Γ</th>
                          <th className="pb-2 font-medium">Θ</th>
                          <th className="pb-2 font-medium">V</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posLegs.map((leg) => {
                          const quote = quotes[leg.streamer_symbol];
                          const currentMid = quote?.mid ?? 0;
                          const direction = leg.action === "buy" ? 1 : -1;
                          const legPnl =
                            (currentMid - leg.entry_price_mid) *
                            direction *
                            leg.quantity *
                            100;

                          let legGreeks = {
                            delta: 0,
                            gamma: 0,
                            theta: 0,
                            vega: 0,
                          };
                          if (spxPrice > 0 && currentMid > 0) {
                            const g = computeGreeks(
                              leg.opt_type,
                              spxPrice,
                              leg.strike,
                              leg.expiration_date,
                              currentMid,
                            );
                            legGreeks = {
                              delta: g.delta * leg.quantity * direction,
                              gamma: g.gamma * leg.quantity * direction,
                              theta: g.theta * leg.quantity * direction * 100,
                              vega: g.vega * leg.quantity * direction * 100,
                            };
                          }

                          return (
                            <tr key={leg.id}>
                              <td className="py-1">
                                {leg.action === "buy" ? "Compra" : "Venda"}
                              </td>
                              <td className="py-1">{leg.streamer_symbol}</td>
                              <td className="py-1">{leg.quantity}</td>
                              <td className="py-1">
                                {leg.entry_price_mid.toFixed(2)}
                              </td>
                              <td className="py-1">
                                {currentMid > 0 ? currentMid.toFixed(2) : "—"}
                              </td>
                              <td
                                className="py-1"
                                style={{
                                  color: legPnl >= 0 ? "#4ade80" : "#f87171",
                                }}
                              >
                                {legPnl >= 0 ? "+" : ""}${legPnl.toFixed(0)}
                              </td>
                              <td className="py-1">
                                {currentMid > 0
                                  ? legGreeks.delta.toFixed(2)
                                  : "—"}
                              </td>
                              <td className="py-1">
                                {currentMid > 0
                                  ? legGreeks.gamma.toFixed(4)
                                  : "—"}
                              </td>
                              <td className="py-1">
                                {currentMid > 0
                                  ? legGreeks.theta.toFixed(2)
                                  : "—"}
                              </td>
                              <td className="py-1">
                                {currentMid > 0
                                  ? legGreeks.vega.toFixed(2)
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <AddPositionModal
          onClose={() => setShowModal(false)}
          onCreated={(pos, posLegs) => {
            setPositions((prev) => [pos, ...prev]);
            setLegs((prev) => ({ ...prev, [pos.id]: posLegs }));
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddPositionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (position: Position, legs: PositionLeg[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [legForms, setLegForms] = useState([
    {
      expiration_date: "",
      strike: "",
      opt_type: "call",
      action: "buy",
      quantity: 1,
      entry_price_mid: "",
      streamer_symbol: "",
    },
  ]);
  const [expirations, setExpirations] = useState<string[]>([]);
  const [strikesByExpiry, setStrikesByExpiry] = useState<
    Record<string, number[]>
  >({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadChain() {
      const res = await fetch("/api/chain");
      const data = await res.json();
      if (data.expirations) setExpirations(data.expirations);
      if (data.strikesByExpiry) setStrikesByExpiry(data.strikesByExpiry);
    }
    loadChain();
  }, []);

  function updateLeg(index: number, field: string, value: string | number) {
    setLegForms((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      if (["expiration_date", "strike", "opt_type"].includes(field)) {
        const leg = next[index];
        const exp = leg.expiration_date;
        const strike = leg.strike;
        const type = leg.opt_type === "call" ? "C" : "P";
        if (exp && strike) {
          const dateStr = exp.replace(/-/g, "").slice(2);
          next[index].streamer_symbol = `.SPXW${dateStr}${type}${strike}`;
        }
      }
      return next;
    });
  }

  function addLeg() {
    setLegForms((prev) => [
      ...prev,
      {
        expiration_date: "",
        strike: "",
        opt_type: "call",
        action: "buy",
        quantity: 1,
        entry_price_mid: "",
        streamer_symbol: "",
      },
    ]);
  }

  function removeLeg(index: number) {
    setLegForms((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (
      !label ||
      legForms.some(
        (l) => !l.expiration_date || !l.strike || !l.entry_price_mid,
      )
    )
      return;
    setSubmitting(true);

    const { data: posData, error: posError } = await supabase
      .from("positions")
      .insert({ label, is_active: true })
      .select()
      .single();

    if (posError || !posData) {
      setSubmitting(false);
      return;
    }

    const legsToInsert = legForms.map((l) => ({
      position_id: posData.id,
      expiration_date: l.expiration_date,
      strike: parseInt(l.strike),
      opt_type: l.opt_type,
      action: l.action,
      quantity: l.quantity,
      entry_price_mid: parseFloat(l.entry_price_mid),
      streamer_symbol: l.streamer_symbol,
    }));

    const { data: legData } = await supabase
      .from("position_legs")
      .insert(legsToInsert)
      .select();

    onCreated(posData as Position, (legData ?? []) as PositionLeg[]);
    setSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#111111] rounded-sm p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-medium">Adicionar posição</span>
          <button onClick={onClose} className="text-[#444] hover:text-[#888]">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-[#444] uppercase tracking-wide">
              Nome
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex: JPM collar, 0DTE fly"
              className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-sm px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <span className="text-xs text-[#444] uppercase tracking-wide">
            Legs
          </span>
          {legForms.map((leg, i) => (
            <div
              key={i}
              className="bg-[#0a0a0a] rounded-sm p-4 flex flex-col gap-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[#444]">Vencimento</span>
                  <select
                    value={leg.expiration_date}
                    onChange={(e) =>
                      updateLeg(i, "expiration_date", e.target.value)
                    }
                    className="bg-[#111111] border border-[#1f1f1f] rounded-sm px-2 py-1.5 text-sm text-white"
                  >
                    <option value="">Selecionar vencimento</option>
                    {expirations.map((exp) => (
                      <option key={exp} value={exp}>
                        {exp}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[#444]">Strike</span>
                  <select
                    value={leg.strike}
                    onChange={(e) => updateLeg(i, "strike", e.target.value)}
                    className="bg-[#111111] border border-[#1f1f1f] rounded-sm px-2 py-1.5 text-sm text-white"
                    disabled={!leg.expiration_date}
                  >
                    <option value="">Selecionar strike</option>
                    {(strikesByExpiry[leg.expiration_date] ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[#444]">Tipo</span>
                  <select
                    value={leg.opt_type}
                    onChange={(e) => updateLeg(i, "opt_type", e.target.value)}
                    className="bg-[#111111] border border-[#1f1f1f] rounded-sm px-2 py-1.5 text-sm text-white"
                  >
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[#444]">Direção</span>
                  <select
                    value={leg.action}
                    onChange={(e) => updateLeg(i, "action", e.target.value)}
                    className="bg-[#111111] border border-[#1f1f1f] rounded-sm px-2 py-1.5 text-sm text-white"
                  >
                    <option value="buy">Compra</option>
                    <option value="sell">Venda</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[#444]">Qtd</span>
                  <input
                    type="number"
                    min={1}
                    value={leg.quantity}
                    onChange={(e) =>
                      updateLeg(i, "quantity", parseInt(e.target.value))
                    }
                    className="bg-[#111111] border border-[#1f1f1f] rounded-sm px-2 py-1.5 text-sm text-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[#444]">Preço entrada</span>
                  <input
                    type="number"
                    step="0.01"
                    value={leg.entry_price_mid}
                    onChange={(e) =>
                      updateLeg(i, "entry_price_mid", e.target.value)
                    }
                    className="bg-[#111111] border border-[#1f1f1f] rounded-sm px-2 py-1.5 text-sm text-white"
                  />
                </div>
              </div>
              {leg.streamer_symbol && (
                <div className="text-xs text-[#444]">
                  Símbolo: {leg.streamer_symbol}
                </div>
              )}
              {legForms.length > 1 && (
                <button
                  onClick={() => removeLeg(i)}
                  className="text-xs text-[#444] hover:text-[#f87171] text-left"
                >
                  Remover leg
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addLeg}
            className="text-xs text-[#444] border border-[#1f1f1f] rounded-sm px-3 py-2 hover:text-[#888] transition-colors w-fit"
          >
            + Adicionar leg
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || !label}
          className="bg-white text-black text-sm font-medium py-2 px-6 rounded-sm hover:bg-gray-200 transition-colors disabled:opacity-40 w-full hover:cursor-pointer"
        >
          {submitting ? "Salvando..." : "Salvar posição"}
        </button>
      </div>
    </div>
  );
}
