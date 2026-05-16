"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGameSocket } from "@/app/hooks/useGameSocket";
import { Scorecard } from "@/app/components/Scorecard";
import { DiceArea } from "@/app/components/DiceArea";
import { computeTotal } from "@/lib/game/rules";
import type { Category } from "@/lib/game/types";

export default function GamePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const {
    connected,
    game,
    gameOver,
    error,
    clientId,
    rollDice,
    scoreCategory,
    reconnect,
    clearError,
    leaveSession,
    debugSkipToEnd,
  } = useGameSocket();

  const isDev = process.env.NODE_ENV !== "production";

  const reconnected = useRef(false);

  useEffect(() => {
    if (!connected || reconnected.current) return;
    if (game?.lobbyCode === code) {
      reconnected.current = true;
      return;
    }
    reconnected.current = true;
    reconnect(code);
  }, [connected, code, reconnect, game]);

  function handleRoll(keptIndices: number[]) {
    if (!game) return;
    rollDice(game.lobbyCode, keptIndices);
  }

  function handleScore(category: Category) {
    if (!game) return;
    scoreCategory(game.lobbyCode, category);
  }

  if (gameOver) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="w-full max-w-lg">
          <div className="bg-slate-800/60 backdrop-blur rounded-2xl p-10 border border-slate-700 shadow-2xl text-center">
            <div className="text-6xl mb-4">🏆</div>
            <h1 className="text-3xl font-bold text-white mb-2">Game Over!</h1>
            <p className="text-emerald-400 text-xl font-semibold mb-8">
              {gameOver.winner.id === clientId
                ? "You won! 🎉"
                : `${gameOver.winner.name} wins!`}
            </p>
            <div className="space-y-2 mb-8">
              {Object.entries(gameOver.scores)
                .map(([playerId, card]) => ({
                  playerId,
                  total: computeTotal(card),
                }))
                .sort((a, b) => b.total - a.total)
                .map(({ playerId, total }, rank) => {
                  const player =
                    gameOver.players.find((p) => p.id === playerId) ??
                    gameOver.winner;
                  return (
                    <div
                      key={playerId}
                      className={`flex justify-between items-center px-4 py-3 rounded-lg ${
                        rank === 0
                          ? "bg-amber-900/40 border border-amber-700"
                          : "bg-slate-700/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-sm w-5">
                          {rank + 1}.
                        </span>
                        <span className="text-white font-medium">
                          {player.name}
                          {playerId === clientId ? " (you)" : ""}
                        </span>
                      </div>
                      <span
                        className={`font-bold text-lg ${rank === 0 ? "text-amber-400" : "text-slate-300"}`}
                      >
                        {total}
                      </span>
                    </div>
                  );
                })}
            </div>
            <button
              onClick={() => {
                leaveSession();
                router.push("/");
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-8 py-3 transition-colors"
            >
              Play again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="text-4xl mb-4">🎲</div>
          <p className="text-slate-400">Loading game…</p>
          {error && (
            <p className="text-red-400 text-sm mt-2">{error}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-xl">🎲 Yamsine</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400 font-mono text-sm">{code}</span>
        </div>
        <div className="flex items-center gap-3">
          {isDev && game && (
            <button
              onClick={() => debugSkipToEnd(game.lobbyCode)}
              title="Fill all scoreboards except yours (1 turn left), then it's your turn."
              className="text-xs font-mono uppercase tracking-wider bg-amber-900/40 hover:bg-amber-900/70 text-amber-300 border border-amber-700/60 rounded-md px-3 py-1 transition-colors"
            >
              dev: skip to end
            </button>
          )}
          <div
            className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`}
          />
          <span className="text-slate-400 text-sm">
            {connected ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="ml-3 font-bold text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      <div className="flex-1 grid grid-cols-[380px_1fr] overflow-hidden">
        {/* Left: Scorecard */}
        <aside className="border-r border-slate-700/50 overflow-y-auto p-6">
          <Scorecard
            game={game}
            clientId={clientId}
            onScore={handleScore}
          />
        </aside>

        {/* Right: Dice area */}
        <section className="p-8 overflow-y-auto">
          <DiceArea
            game={game}
            clientId={clientId}
            onRoll={handleRoll}
          />
        </section>
      </div>
    </main>
  );
}
