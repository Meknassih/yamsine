"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { GameState } from "@/lib/game/types";
import { useGameSocket } from "@/app/hooks/useGameSocket";

const Dice3D = dynamic(() => import("./Dice3D"), {
  ssr: false,
  loading: () => (
    <div
      className="bg-slate-800/40 rounded-2xl animate-pulse flex items-center justify-center"
      style={{ minHeight: 200 }}
    >
      <span className="text-slate-500 text-sm">Loading dice…</span>
    </div>
  ),
});

interface Props {
  game: GameState;
  clientId: string | null;
  onRoll: (keptIndices: number[]) => void;
  isMobile?: boolean;
  compact?: boolean;
}

export function DiceArea({ game, clientId, onRoll, isMobile, compact }: Props) {
  const { isRolling } = useGameSocket();
  const isMyTurn = game.currentPlayerId === clientId;
  const canRoll = isMyTurn && game.rollsLeft > 0 && !isRolling;
  const mustScore = isMyTurn && game.rollsLeft === 0;

  const diceKey = game.dice.map((d) => `${d.value}:${d.kept}`).join(",");
  const [toggles, setToggles] = useState<Record<number, boolean>>({});
  const [lastKey, setLastKey] = useState(diceKey);
  if (diceKey !== lastKey) {
    setLastKey(diceKey);
    if (Object.keys(toggles).length > 0) setToggles({});
  }

  const localKept = game.dice.map((d, i) =>
    i in toggles ? toggles[i] : d.kept
  );

  function toggleKeep(index: number) {
    if (!isMyTurn || game.rollsLeft >= 3 || game.rollsLeft === 0) return;
    setToggles((prev) => ({
      ...prev,
      [index]: !localKept[index],
    }));
  }

  function handleRoll() {
    if (!canRoll) return;
    const keptIndices = localKept
      .map((k, i) => (k ? i : -1))
      .filter((i) => i !== -1);
    onRoll(keptIndices);
  }

  const currentPlayer = game.players.find((p) => p.id === game.currentPlayerId);

  const rollsLabel =
    game.rollsLeft === 3
      ? "Roll all dice to start"
      : game.rollsLeft === 2
        ? "2 rolls left"
        : game.rollsLeft === 1
          ? "1 roll left"
          : "No rolls left — pick a category";

  const diceValues = game.dice.map((d) => d.value);
  const showKeepToggles =
    isMyTurn && game.rollsLeft < 3 && game.rollsLeft > 0;

  const keptFlags = game.dice.map((_d, i) => localKept[i] ?? false);

  const keepToggleRow = showKeepToggles ? (
    <div className="flex justify-center gap-4 mt-2">
      {game.dice.map((die, i) => (
        <button
          key={i}
          onClick={() => toggleKeep(i)}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
            localKept[i]
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
              : "bg-slate-700/40 text-slate-500 border border-slate-600/30 hover:border-slate-500/50"
          }`}
        >
          <span>{die.value}</span>
          <span className="text-[10px] opacity-70">
            {localKept[i] ? "Kept" : "Reroll"}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  // ---- Compact layout (mobile with drawer open) ----
  if (isMobile && compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/60 border-b border-slate-700/50">
        <div className="flex-1 min-w-0" style={{ height: 72 }}>
          <Dice3D
            values={diceValues}
            rolling={isRolling}
            kept={keptFlags}
          />
        </div>

        {showKeepToggles && (
          <div className="flex gap-1 flex-shrink-0">
            {game.dice.map((die, i) => (
              <button
                key={i}
                onClick={() => toggleKeep(i)}
                className={`flex flex-col items-center w-8 py-0.5 rounded text-[10px] font-bold transition-colors ${
                  localKept[i]
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "bg-slate-700/40 text-slate-500 border border-slate-600/30"
                }`}
              >
                <span>{die.value}</span>
                <span>{localKept[i] ? "K" : "R"}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          {isMyTurn ? (
            mustScore ? (
              <span className="text-amber-400 text-xs font-medium whitespace-nowrap">
                Score now
              </span>
            ) : (
              <button
                onClick={handleRoll}
                disabled={!canRoll}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg px-4 py-2 transition-all shadow-lg active:scale-95 whitespace-nowrap"
              >
                {game.rollsLeft === 3 ? "Roll Dice" : "Re-roll"}
              </button>
            )
          ) : (
            <span className="text-slate-500 text-xs whitespace-nowrap">
              Wait…
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---- Mobile layout (drawer closed) ----
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-1">
            <div
              className={`w-3 h-3 rounded-full flex-shrink-0 ${currentPlayer?.connected ? "bg-emerald-400" : "bg-slate-500"}`}
            />
            <h2 className="text-white font-semibold text-xl">
              {isMyTurn ? "Your turn" : `${currentPlayer?.name ?? "…"}'s turn`}
            </h2>
          </div>
          <div className="flex items-center gap-1 ml-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-colors ${i < game.rollsLeft ? "bg-emerald-400" : "bg-slate-600"}`}
              />
            ))}
            <span className="text-slate-400 text-sm ml-2">{rollsLabel}</span>
          </div>
        </div>

        <div className="flex-1 min-h-0" style={{ minHeight: 240 }}>
          <Dice3D
            values={diceValues}
            rolling={isRolling}
            kept={keptFlags}
          />
        </div>

        {keepToggleRow}

        <div className="flex flex-col items-center gap-3 py-4">
          {isMyTurn ? (
            mustScore ? (
              <p className="text-amber-400 text-sm font-medium animate-pulse text-center">
                Open the scorecard to score
              </p>
            ) : (
              <button
                onClick={handleRoll}
                disabled={!canRoll}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl px-12 py-4 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95"
              >
                {game.rollsLeft === 3 ? "🎲 Roll Dice" : "🎲 Re-roll"}
              </button>
            )
          ) : (
            <p className="text-slate-500 text-sm">
              Waiting for {currentPlayer?.name} to play…
            </p>
          )}
        </div>

        {!compact && (
          <div className="mt-auto border-t border-slate-700 pt-4 pb-2">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Players
            </h3>
            <div className="space-y-1">
              {game.players.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    p.id === game.currentPlayerId
                      ? "bg-slate-700/80"
                      : "hover:bg-slate-800/40"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      p.id === game.currentPlayerId
                        ? "bg-emerald-400"
                        : p.connected
                          ? "bg-slate-500"
                          : "bg-red-700"
                    }`}
                  />
                  <span
                    className={
                      p.id === game.currentPlayerId
                        ? "text-white font-medium"
                        : "text-slate-400"
                    }
                  >
                    {p.name}
                    {p.id === clientId ? " (you)" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Desktop layout ----
  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <div
            className={`w-3 h-3 rounded-full flex-shrink-0 ${currentPlayer?.connected ? "bg-emerald-400" : "bg-slate-500"}`}
          />
          <h2 className="text-white font-semibold text-xl">
            {isMyTurn ? "Your turn" : `${currentPlayer?.name ?? "…"}'s turn`}
          </h2>
        </div>
        <div className="flex items-center gap-1 ml-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${i < game.rollsLeft ? "bg-emerald-400" : "bg-slate-600"}`}
            />
          ))}
          <span className="text-slate-400 text-sm ml-2">{rollsLabel}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0" style={{ minHeight: 260 }}>
        <Dice3D
          values={diceValues}
          rolling={isRolling}
          kept={keptFlags}
        />
      </div>

      {keepToggleRow}

      <div className="flex flex-col items-center gap-3 py-4">
        {isMyTurn ? (
          mustScore ? (
            <p className="text-amber-400 text-sm font-medium animate-pulse">
              ← Click a category on the scorecard to score
            </p>
          ) : (
            <button
              onClick={handleRoll}
              disabled={!canRoll}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl px-12 py-4 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95"
            >
              {game.rollsLeft === 3 ? "🎲 Roll Dice" : "🎲 Re-roll"}
            </button>
          )
        ) : (
          <p className="text-slate-500 text-sm">
            Waiting for {currentPlayer?.name} to play…
          </p>
        )}
      </div>

      <div className="mt-auto border-t border-slate-700 pt-4">
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
          Players
        </h3>
        <div className="space-y-1">
          {game.players.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                p.id === game.currentPlayerId
                  ? "bg-slate-700/80"
                  : "hover:bg-slate-800/40"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  p.id === game.currentPlayerId
                    ? "bg-emerald-400"
                    : p.connected
                      ? "bg-slate-500"
                      : "bg-red-700"
                }`}
              />
              <span
                className={
                  p.id === game.currentPlayerId
                    ? "text-white font-medium"
                    : "text-slate-400"
                }
              >
                {p.name}
                {p.id === clientId ? " (you)" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
